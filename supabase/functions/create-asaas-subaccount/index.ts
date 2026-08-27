import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";
const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";

// Conta "Orbi Demo" (usada pra apresentar o painel a parceiros) — isenta do
// gate de custo pelo mesmo motivo do is_gs_brand: não é risco de custo
// perdido, é ferramenta interna. Feito por ID explícito em vez de mexer na
// flag is_gs_brand dela, que também controla outras coisas no app (logo,
// wordmark) e não quero alterar sem auditar tudo que depende disso.
const DEMO_ORG_ID = "10000000-0000-0000-0000-000000000000";

// A marca da Asaas aparece pro treinador durante o KYC no modelo Padrão (ele
// acessa o painel deles pra enviar documento) — inaceitável pra treinador
// real (decisão do Lucas, 2026-08-26: nunca expor o processador por trás do
// Orbi Pay). Até o modelo BaaS estar pronto (depende de homologação ainda
// nem solicitada à Asaas), só contas internas/demo passam por aqui —
// qualquer org real fica bloqueada, mesmo já elegível pela regra de custo.
const BAAS_READY = false;

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

  const {
    organization_id,
    name, email, cpfCnpj, birthDate, companyType, // companyType só se cpfCnpj for CNPJ
    mobilePhone, phone,
    postalCode, address, addressNumber, complement, province,
    incomeValue,
  } = await req.json();

  if (!organization_id || !name || !email || !cpfCnpj || !mobilePhone
      || !postalCode || !address || !addressNumber || !province || !incomeValue) {
    return json({ error: "Campos obrigatórios ausentes" }, 400);
  }

  // Fail-closed: só o dono da org pode criar a subconta dela
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, owner_id, created_at, custom_trial_days, is_gs_brand")
    .eq("id", organization_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (orgErr || !org) return json({ error: "forbidden_not_owner" }, 403);

  // Gate de custo — cada subconta custa R$12,90 (cobrado pela Asaas na
  // criação), então só libera quando faz sentido economicamente. Aplicado no
  // servidor (não só escondendo botão no frontend) pra não dar pra contornar.
  // Conta ORBI Demo/interna (is_gs_brand) fica isenta — não é risco de custo
  // perdido, é ferramenta de teste/apresentação.
  if (!org.is_gs_brand && organization_id !== DEMO_ORG_ID) {
    if (!BAAS_READY) {
      return json({ error: "Essa funcionalidade ainda não está disponível pra sua conta. Em breve!" }, 403);
    }
    const isPartnerDeal = org.custom_trial_days != null;
    if (isPartnerDeal) {
      const daysSince = (Date.now() - new Date(org.created_at).getTime()) / 86400000;
      if (daysSince < 60) {
        return json({ error: `Disponível a partir de 60 dias do cadastro (faltam ${Math.ceil(60 - daysSince)} dias).` }, 403);
      }
      const { count: alunosAtivos } = await supabase
        .from("alunos")
        .select("id", { count: "exact", head: true })
        .eq("org_id", organization_id)
        .eq("ativo", true);
      if (!alunosAtivos) {
        return json({ error: "Disponível quando você tiver pelo menos 1 aluno ativo na ferramenta." }, 403);
      }
    } else {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("intro_step")
        .eq("organization_id", organization_id)
        .maybeSingle();
      if (!sub || sub.intro_step !== false) {
        return json({ error: "Disponível depois do primeiro mês de valor cheio da sua assinatura ORBI." }, 403);
      }
    }
  }

  // Já existe subconta pra essa org — não cria de novo, devolve o status atual
  const { data: existing } = await supabase
    .from("asaas_subaccounts")
    .select("status, asaas_account_id")
    .eq("org_id", organization_id)
    .maybeSingle();
  if (existing) return json({ already_exists: true, status: existing.status });

  try {
    const payload: Record<string, unknown> = {
      name, email, cpfCnpj, birthDate, mobilePhone,
      phone: phone || mobilePhone,
      address, addressNumber,
      province, postalCode,
      incomeValue,
      ...(complement ? { complement } : {}),
      ...(companyType ? { companyType } : {}),
    };

    const res = await fetch(`${ASAAS_BASE}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[create-asaas-subaccount] Asaas error:", res.status, errBody);
      return json({ error: "Falha ao criar sua conta. Confira os dados e tente novamente.", details: errBody }, 502);
    }

    const account = await res.json();
    // account.apiKey só vem nessa resposta, uma única vez — tratar como segredo.

    // Cada subconta precisa do próprio webhook registrado (a apiKey master
    // não vê os eventos dela) — sem isso, pagamentos na subconta nunca
    // notificam nosso asaas-webhook e o status fica preso em "PENDING" pra
    // sempre. Best-effort: não derruba a criação da subconta se falhar, mas
    // fica registrado no log pra investigar.
    if (ASAAS_WEBHOOK_TOKEN) {
      try {
        const webhookRes = await fetch(`${ASAAS_BASE}/webhooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": account.apiKey },
          body: JSON.stringify({
            name: "ORBI Health — Fluxo A",
            url: `${SUPABASE_URL}/functions/v1/asaas-webhook`,
            email: email,
            enabled: true,
            interrupted: false,
            apiVersion: 3,
            authToken: ASAAS_WEBHOOK_TOKEN,
            sendType: "SEQUENTIALLY",
            events: [
              "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED",
              // Sem isso, a Asaas aprova a conta e a gente nunca fica sabendo —
              // o status em asaas_subaccounts ficaria travado em "pending" pra
              // sempre (achado ao vivo: a Orbi Demo foi aprovada em minutos e
              // nosso banco não teve como registrar).
              "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
            ],
          }),
        });
        if (!webhookRes.ok) {
          console.error("[create-asaas-subaccount] webhook registration falhou:", await webhookRes.text());
        }
      } catch (e) {
        console.error("[create-asaas-subaccount] webhook registration erro:", e instanceof Error ? e.message : e);
      }
    } else {
      console.error("[create-asaas-subaccount] ASAAS_WEBHOOK_TOKEN não configurado — webhook da subconta NÃO foi registrado.");
    }

    const { error: insertError } = await supabase
      .from("asaas_subaccounts")
      .insert({
        org_id: organization_id,
        asaas_account_id: account.id,
        wallet_id: account.walletId,
        api_key: account.apiKey,
        status: "pending",
      });
    if (insertError) throw insertError;

    return json({
      success: true,
      status: "pending",
      message: "Conta criada! Verifique o e-mail cadastrado pra completar a verificação de identidade.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-asaas-subaccount]", message, err);
    return json({ error: message }, 500);
  }
});
