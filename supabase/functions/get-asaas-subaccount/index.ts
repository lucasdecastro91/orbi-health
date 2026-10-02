// get-asaas-subaccount — leitura segura de status/saldo da subconta da org.
// asaas_subaccounts tem RLS sem nenhuma policy (api_key nunca pode vazar pro
// client) — esta função é o único jeito do frontend saber o status, usando
// service_role só pra ler o necessário e nunca devolvendo api_key no JSON.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  todayBR, addDays, cardHold, purchaseDate, netCents, cardCapCents,
  CARD_HOLD_DAYS, RESERVE_DAYS, type AsaasCardPayment,
} from "../_shared/cardRisk.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";
const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Mesmo ID/regra de isenção do gate em create-asaas-subaccount — duplicado de
// propósito (é um check simples, não vale a pena compartilhar módulo entre
// duas Edge Functions só por isso).
const DEMO_ORG_ID = "10000000-0000-0000-0000-000000000000";

// Mesmo motivo/flag de create-asaas-subaccount — Padrão expõe a marca da
// Asaas no KYC, inaceitável pra treinador real (decisão do Lucas, 2026-08-26,
// reforçada pela resposta da Prime confirmando que eles escondem 100% o
// processador). Só libera geral quando o BaaS estiver pronto.
const BAAS_READY = false;

async function checkEligibility(org: { id: string; created_at: string; custom_trial_days: number | null; is_gs_brand: boolean }) {
  if (org.is_gs_brand || org.id === DEMO_ORG_ID) return { eligible: true as const };
  if (!BAAS_READY) {
    return { eligible: false as const, reason: "Essa funcionalidade ainda não está disponível pra sua conta. Em breve!" };
  }

  if (org.custom_trial_days != null) {
    const daysSince = (Date.now() - new Date(org.created_at).getTime()) / 86400000;
    if (daysSince < 60) {
      return { eligible: false as const, reason: `Disponível a partir de 60 dias do cadastro (faltam ${Math.ceil(60 - daysSince)} dias).` };
    }
    const { count: alunosAtivos } = await supabase
      .from("alunos")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("ativo", true);
    if (!alunosAtivos) {
      return { eligible: false as const, reason: "Disponível quando você tiver pelo menos 1 aluno ativo na ferramenta." };
    }
    return { eligible: true as const };
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", org.id)
    .maybeSingle();
  // Mesma regra de create-asaas-subaccount: fim do teste + 1ª cobrança paga.
  if (!sub || sub.status !== "active") {
    return { eligible: false as const, reason: "Disponível depois do fim do seu período de teste, com a assinatura ORBI paga." };
  }
  return { eligible: true as const };
}

// Retenção de venda no cartão (30 dias + reserva de conta nova) — regras em
// _shared/cardRisk.ts, as mesmas usadas pelo solicitar-saque-asaas. Aqui
// também soma o cartão que ainda nem caiu no saldo (CONFIRMED), só pra
// exibição do "Em liberação".
async function listCardPayments(apiKey: string, filters: Record<string, string>) {
  const out: any[] = [];
  for (let offset = 0, page = 0; page < 20; page++, offset += 100) {
    const qs = new URLSearchParams({ billingType: "CREDIT_CARD", ...filters, limit: "100", offset: String(offset) });
    const res = await fetch(`${ASAAS_BASE}/payments?${qs}`, { headers: { "access_token": apiKey } });
    if (!res.ok) throw new Error(`payments ${res.status}: ${await res.text()}`);
    const body = await res.json();
    out.push(...(body?.data ?? []));
    if (!body?.hasMore) return out;
  }
  throw new Error("payments: paginação excedeu o limite");
}

async function fetchCardHold(apiKey: string, aprovadoEm: string | null) {
  const today = todayBR();
  const [received, confirmed] = await Promise.all([
    // reserva pode durar até RESERVE_DAYS, então busca liquidações desse período
    listCardPayments(apiKey, { status: "RECEIVED", "paymentDate[ge]": addDays(today, -RESERVE_DAYS) }),
    listCardPayments(apiKey, { status: "CONFIRMED" }),
  ]);

  let retainedCents = 0;
  let pendingCents = 0;
  let nextRelease: string | null = null;
  const bump = (d: string | null) => { if (d && (!nextRelease || d < nextRelease)) nextRelease = d; };

  for (const p of received as AsaasCardPayment[]) {
    const h = cardHold(p, aprovadoEm, today);
    retainedCents += h.cents;
    if (h.cents > 0) bump(h.releaseDate);
  }
  for (const p of confirmed as AsaasCardPayment[]) {
    pendingCents += netCents(p);
    const purchase = purchaseDate(p);
    const credit = String(p.estimatedCreditDate ?? "").slice(0, 10);
    const holdEnd = purchase ? addDays(purchase, CARD_HOLD_DAYS) : "";
    bump([credit, holdEnd].filter(Boolean).sort().pop() ?? null);
  }
  return { retainedCents, pendingCents, nextRelease };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const { organization_id } = await req.json();
  if (!organization_id) return json({ error: "organization_id ausente" }, 400);

  // Fail-closed: só dono ou staff da org (mesmo padrão de is_org_staff usado
  // no resto do app) pode ver o status financeiro dela.
  const { data: org } = await supabase
    .from("organizations")
    .select("id, owner_id, created_at, custom_trial_days, is_gs_brand")
    .eq("id", organization_id)
    .maybeSingle();
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!org || (org.owner_id !== user.id && !member)) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: sub } = await supabase
    .from("asaas_subaccounts")
    .select("status, created_at, api_key, pix_key, pix_key_type, aprovado_em, limite_cartao_30d")
    .eq("org_id", organization_id)
    .maybeSingle();

  if (!sub) return json({ exists: false, ...(await checkEligibility(org)) });

  let balance: number | null = null;
  // available = o que o saque aceita de fato (saldo − cartão retido). Fica
  // null se a retenção não puder ser calculada — a tela desabilita o saque.
  let available: number | null = null;
  let inRelease: number | null = null;
  let nextRelease: string | null = null;
  if (sub.status === "aprovado") {
    try {
      const res = await fetch(`${ASAAS_BASE}/finance/balance`, {
        headers: { "access_token": sub.api_key },
      });
      if (res.ok) {
        const data = await res.json();
        balance = data?.balance ?? null;
      }
    } catch (e) {
      console.error("[get-asaas-subaccount] falha ao buscar saldo:", e instanceof Error ? e.message : e);
    }
    if (balance != null) {
      try {
        const hold = await fetchCardHold(sub.api_key, sub.aprovado_em);
        const balanceCents = Math.round(Number(balance) * 100);
        available = Math.max(0, balanceCents - hold.retainedCents) / 100;
        inRelease = (Math.min(hold.retainedCents, balanceCents) + hold.pendingCents) / 100;
        nextRelease = hold.nextRelease;
      } catch (e) {
        console.error("[get-asaas-subaccount] falha ao calcular retenção:", e instanceof Error ? e.message : e);
      }
    }
  }

  // Saques recentes — atualiza no nosso banco os que ainda não chegaram num
  // status final (a transferência processa de forma assíncrona na Asaas).
  const { data: withdrawals } = await supabase
    .from("asaas_subaccount_withdrawals")
    .select("id, asaas_transfer_id, value, status, fail_reason, created_at")
    .eq("org_id", organization_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const TERMINAL = new Set(["done", "failed", "cancelled"]);
  if (withdrawals?.length) {
    for (const w of withdrawals) {
      if (TERMINAL.has(w.status) || !w.asaas_transfer_id) continue;
      try {
        const res = await fetch(`${ASAAS_BASE}/transfers/${w.asaas_transfer_id}`, {
          headers: { "access_token": sub.api_key },
        });
        if (!res.ok) continue;
        const fresh = await res.json();
        const freshStatus = String(fresh?.status ?? "").toLowerCase();
        if (freshStatus && freshStatus !== w.status) {
          w.status = freshStatus;
          w.fail_reason = fresh?.failReason ?? w.fail_reason;
          await supabase
            .from("asaas_subaccount_withdrawals")
            .update({ status: freshStatus, fail_reason: fresh?.failReason ?? null, updated_at: new Date().toISOString() })
            .eq("id", w.id);
        }
      } catch (e) {
        console.error("[get-asaas-subaccount] falha ao atualizar saque:", e instanceof Error ? e.message : e);
      }
    }
  }

  // Uso do teto de cartão (geradas nos últimos 30 dias) — só pra exibir no
  // modal "Nova cobrança"; quem bloqueia de verdade é asaas-create-charge.
  let cardVolume30d: number | null = null;
  let cardCap: number | null = null;
  if (sub.status === "aprovado") {
    const capCents = cardCapCents(sub.aprovado_em, sub.limite_cartao_30d, todayBR());
    cardCap = capCents == null ? null : capCents / 100;
    const { data: vol, error: volErr } = await supabase.rpc("card_volume_30d", { p_org_id: organization_id, p_paid: false });
    if (volErr) console.error("[get-asaas-subaccount] card_volume_30d:", volErr.message);
    else cardVolume30d = Number(vol);
  }

  return json({
    exists: true,
    status: sub.status,
    created_at: sub.created_at,
    balance,
    available,
    inRelease,
    nextRelease,
    cardVolume30d,
    cardCap,
    pixKeySet: !!sub.pix_key,
    pixKey: sub.pix_key,
    pixKeyType: sub.pix_key_type,
    withdrawals: withdrawals ?? [],
  });
});
