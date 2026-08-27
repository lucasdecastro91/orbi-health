import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox"; // "sandbox" | "production"

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

// ── Preços — ORBI Motion / ORBI Pro, por quantidade de alunos e ciclo ───────
// Mesmos valores publicados na landing page (landing-page/index.html, seção #precos).
const PRICES: Record<string, Record<string, { mensal: number; anual: number }>> = {
  motion: {
    "50":       { mensal: 39.90,  anual: 359.10 },
    ilimitado:  { mensal: 79.90,  anual: 719.10 },
  },
  pro: {
    "50":       { mensal: 89.90,  anual: 809.10 },
    ilimitado:  { mensal: 149.90, anual: 1349.10 },
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function asaasPost(path: string, body: unknown) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas ${path} error ${res.status}: ${err}`);
  }
  return res.json();
}

async function asaasPut(path: string, body: unknown) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas PUT ${path} error ${res.status}: ${err}`);
  }
  return res.json();
}

async function asaasGet(path: string) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "GET",
    headers: { "access_token": ASAAS_API_KEY },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas GET ${path} error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Helpers de data ──────────────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};
const maxDate = (a: Date, b: Date) => (a.getTime() > b.getTime() ? a : b);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    organization_id,
    plan_type,          // "motion" | "pro"
    alunos_tier,        // "50" | "ilimitado"
    cycle,               // "mensal" | "anual"
    payment_method,      // "CREDIT_CARD" | "BOLETO" | "PIX"
    customer_name,
    customer_email,
    customer_cpf_cnpj,
    customer_phone,
    card_holder_name,
    card_holder_cpf,
    card_number,
    card_exp_month,
    card_exp_year,
    card_ccv,
    card_postal_code,
    card_address_number,
    card_address_complement,
  } = await req.json();

  if (!organization_id || !plan_type || !alunos_tier || !cycle || !payment_method) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!PRICES[plan_type]?.[alunos_tier]?.[cycle as "mensal" | "anual"]) {
    return new Response(JSON.stringify({ error: "plan_type/alunos_tier/cycle inválidos" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (payment_method === "CREDIT_CARD" && (!card_postal_code || !card_address_number || !card_holder_cpf)) {
    return new Response(JSON.stringify({ error: "CEP, número do endereço e CPF do titular são obrigatórios pra Cartão" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Busca dados da org (trial, overrides de parceria)
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("created_at, trial_ends_at, custom_trial_days, custom_price")
      .eq("id", organization_id)
      .single();
    if (orgErr || !org) throw new Error("Organização não encontrada");

    const trialEnd = org.custom_trial_days != null
      ? addDays(new Date(org.created_at), org.custom_trial_days)
      : new Date(org.trial_ends_at);

    // Parceria: trial customizado + preço customizado juntos → pula o R$1
    const isPartnerDeal = org.custom_trial_days != null && org.custom_price != null;

    // 2. Cria ou recupera customer no Asaas
    let asaasCustomerId: string;
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("asaas_customer_id")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (existingSub?.asaas_customer_id) {
      asaasCustomerId = existingSub.asaas_customer_id;
      // Garante notificationDisabled mesmo pra clientes criados antes dessa
      // correção existir — não deixa a Asaas mandar e-mail/SMS com o nome
      // pessoal do dono da conta em vez da marca ORBI.
      try {
        await asaasPut(`/customers/${asaasCustomerId}`, { notificationDisabled: true });
      } catch (e) {
        console.error("[create-asaas-subscription] falha ao atualizar notificationDisabled:", e instanceof Error ? e.message : e);
      }
    } else {
      // notificationDisabled: true — mesma correção já aplicada no Fluxo A
      // (asaas-create-charge). Sem isso, a Asaas manda e-mail/SMS próprios
      // pro treinador (nome pessoal do dono da conta, sem marca ORBI —
      // achado real: "Jose Lucas Bonfim de Castro Melo" aparecendo na
      // cobrança em vez de "ORBI Health"). Confirmação de pagamento fica só
      // na tela do app.
      const customer = await asaasPost("/customers", {
        name: customer_name,
        email: customer_email,
        cpfCnpj: customer_cpf_cnpj,
        mobilePhone: customer_phone,
        notificationDisabled: true,
      });
      asaasCustomerId = customer.id;
    }

    // 3. Monta a subscription — em R$5 mensal (degustação, só Cartão; valor
    //    mínimo confirmado direto pela Asaas: "O valor mínimo para cobranças
    //    via cartão de crédito é R$ 5,00" — R$1 é tecnicamente impossível
    //    nessa plataforma) ou já no valor cheio/customizado (parceria, ou
    //    PIX — sem repique automático, então não pode dar o desconto de
    //    degustação; ver ROADMAP.md item 1 da sessão 2026-07-17)
    const fullPrice = org.custom_price ?? PRICES[plan_type][alunos_tier][cycle as "mensal" | "anual"];
    const introEligible = !isPartnerDeal && payment_method === "CREDIT_CARD";

    const subPayload: Record<string, unknown> = isPartnerDeal
      ? {
          customer: asaasCustomerId,
          billingType: payment_method,
          value: fullPrice,
          nextDueDate: toDateStr(trialEnd),
          cycle: cycle === "anual" ? "YEARLY" : "MONTHLY",
          description: `ORBI ${plan_type === "motion" ? "Motion" : "Pro"} — parceria`,
        }
      : introEligible
      ? {
          customer: asaasCustomerId,
          billingType: payment_method,
          value: 5.00,
          nextDueDate: toDateStr(maxDate(new Date(), trialEnd)),
          cycle: "MONTHLY", // sempre mensal na fase de degustação, mesmo pra quem escolheu anual
          description: `ORBI ${plan_type === "motion" ? "Motion" : "Pro"} — primeiro mês (R$5)`,
        }
      : {
          customer: asaasCustomerId,
          billingType: payment_method,
          value: fullPrice,
          nextDueDate: toDateStr(maxDate(new Date(), trialEnd)),
          cycle: cycle === "anual" ? "YEARLY" : "MONTHLY",
          description: `ORBI ${plan_type === "motion" ? "Motion" : "Pro"} — sem promoção de R$5 (válida apenas para Cartão de Crédito)`,
        };

    if (payment_method === "CREDIT_CARD" && card_number) {
      subPayload.creditCard = {
        holderName: card_holder_name,
        number: card_number,
        expiryMonth: card_exp_month,
        expiryYear: card_exp_year,
        ccv: card_ccv,
      };
      // Dados do titular do cartão — podem ser diferentes de quem está
      // cadastrando a org (ex: paga com cartão de outra pessoa). A Asaas
      // valida antifraude contra o CPF de quem é o cartão, não contra o
      // CPF da conta, então não reaproveita customer_*.
      subPayload.creditCardHolderInfo = {
        name: card_holder_name,
        email: customer_email,
        cpfCnpj: card_holder_cpf,
        mobilePhone: customer_phone,
        postalCode: card_postal_code,
        addressNumber: card_address_number,
        ...(card_address_complement ? { addressComplement: card_address_complement } : {}),
      };
    }

    const asaasSub = await asaasPost("/subscriptions", subPayload);

    // A resposta de criar a subscription não traz invoiceUrl/QR code — isso
    // vive na cobrança (payment) gerada automaticamente pela assinatura,
    // buscada à parte. Não deixa a criação falhar se essa busca der erro
    // (a assinatura já foi criada de verdade nesse ponto).
    let firstPaymentUrl: string | null = null;
    let firstPaymentBankSlip: string | null = null;
    let pixKey: string | null = null;
    try {
      const subPayments = await asaasGet(`/subscriptions/${asaasSub.id}/payments`);
      const firstPayment = subPayments?.data?.[0] ?? null;
      firstPaymentUrl = firstPayment?.invoiceUrl ?? null;
      firstPaymentBankSlip = firstPayment?.bankSlipUrl ?? null;

      // PIX: busca o QR Code (payload copia-e-cola) direto da cobrança, pra
      // renderizar no nosso próprio checkout em vez de abrir a fatura da
      // Asaas (mesmo padrão já usado em asaas-create-charge).
      if (payment_method === "PIX" && firstPayment?.id) {
        try {
          const pixData = await asaasGet(`/payments/${firstPayment.id}/pixQrCode`);
          pixKey = pixData?.payload ?? null;
        } catch (e) {
          console.error("[create-asaas-subscription] busca de pixQrCode falhou:", e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error("[create-asaas-subscription] busca de payment falhou:", e instanceof Error ? e.message : e);
    }

    // 4. Salva / atualiza no banco
    const { error: dbError } = await supabase
      .from("subscriptions")
      .upsert({
        organization_id,
        asaas_customer_id: asaasCustomerId,
        asaas_subscription_id: asaasSub.id,
        plan: cycle,
        plan_type,
        status: "pending",
        next_billing_date: subPayload.nextDueDate as string,
        intro_step: introEligible,
        full_price: fullPrice,
      }, { onConflict: "organization_id" });
    if (dbError) throw dbError;

    // Reflete a escolha do checkout na org (plano/tier podem ter mudado)
    const { error: orgUpdateError } = await supabase
      .from("organizations")
      .update({ subscription_status: "pending", plan_type, alunos_tier })
      .eq("id", organization_id);
    if (orgUpdateError) throw orgUpdateError;

    return new Response(
      JSON.stringify({
        success: true,
        asaas_subscription_id: asaasSub.id,
        payment_method,
        invoice_url: firstPaymentUrl,
        bank_slip_url: firstPaymentBankSlip,
        pix_key: pixKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: unknown) {
    // Erros do Postgrest (ex: dbError de .upsert()) são objetos simples,
    // não instâncias de Error — String(err) neles vira "[object Object]"
    // e esconde o motivo real. Sempre tenta ler .message primeiro.
    const message = err instanceof Error
      ? err.message
      : (typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err));
    console.error("[create-asaas-subscription]", message, err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
