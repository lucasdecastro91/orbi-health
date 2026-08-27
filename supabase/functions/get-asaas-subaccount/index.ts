// get-asaas-subaccount — leitura segura de status/saldo da subconta da org.
// asaas_subaccounts tem RLS sem nenhuma policy (api_key nunca pode vazar pro
// client) — esta função é o único jeito do frontend saber o status, usando
// service_role só pra ler o necessário e nunca devolvendo api_key no JSON.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    .select("intro_step")
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!sub || sub.intro_step !== false) {
    return { eligible: false as const, reason: "Disponível depois do primeiro mês de valor cheio da sua assinatura ORBI." };
  }
  return { eligible: true as const };
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
    .select("status, created_at, api_key")
    .eq("org_id", organization_id)
    .maybeSingle();

  if (!sub) return json({ exists: false, ...(await checkEligibility(org)) });

  let balance: number | null = null;
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
  }

  return json({
    exists: true,
    status: sub.status,
    created_at: sub.created_at,
    balance,
  });
});
