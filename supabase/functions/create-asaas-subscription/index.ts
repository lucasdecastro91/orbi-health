import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox"; // "sandbox" | "production"

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

const PLAN_VALUES: Record<string, number> = {
  mensal: 197,
  anual: 1970,
};
const PLAN_CYCLE: Record<string, string> = {
  mensal: "MONTHLY",
  anual: "YEARLY",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function asaasPost(path: string, body: unknown) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas ${path} error ${res.status}: ${err}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Autentica usuário
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
    plan,               // "mensal" | "anual"
    payment_method,     // "CREDIT_CARD" | "BOLETO" | "PIX"
    customer_name,
    customer_email,
    customer_cpf_cnpj,
    customer_phone,
    // Para cartão:
    card_holder_name,
    card_number,
    card_exp_month,
    card_exp_year,
    card_ccv,
  } = await req.json();

  if (!organization_id || !plan || !payment_method) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Cria ou recupera customer no Asaas
    let asaasCustomerId: string;
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("asaas_customer_id")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (existingSub?.asaas_customer_id) {
      asaasCustomerId = existingSub.asaas_customer_id;
    } else {
      const customer = await asaasPost("/customers", {
        name: customer_name,
        email: customer_email,
        cpfCnpj: customer_cpf_cnpj,
        mobilePhone: customer_phone,
        notificationDisabled: false,
      });
      asaasCustomerId = customer.id;
    }

    // 2. Cria subscription no Asaas
    const today = new Date().toISOString().slice(0, 10);
    const subPayload: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType: payment_method,
      value: PLAN_VALUES[plan],
      nextDueDate: today,
      cycle: PLAN_CYCLE[plan],
      description: `ORBI Pro — Plano ${plan === "mensal" ? "Mensal" : "Anual"}`,
    };

    // Dados de cartão se informado
    if (payment_method === "CREDIT_CARD" && card_number) {
      subPayload.creditCard = {
        holderName: card_holder_name,
        number: card_number,
        expiryMonth: card_exp_month,
        expiryYear: card_exp_year,
        ccv: card_ccv,
      };
      subPayload.creditCardHolderInfo = {
        name: customer_name,
        email: customer_email,
        cpfCnpj: customer_cpf_cnpj,
        mobilePhone: customer_phone,
      };
    }

    const asaasSub = await asaasPost("/subscriptions", subPayload);

    // 3. Salva / atualiza no banco
    const { error: dbError } = await supabase
      .from("subscriptions")
      .upsert({
        organization_id,
        asaas_customer_id: asaasCustomerId,
        asaas_subscription_id: asaasSub.id,
        plan,
        status: "pending",
        next_billing_date: today,
      }, { onConflict: "organization_id" });

    if (dbError) throw dbError;

    // Atualiza status da org para pending (o webhook PAYMENT_CONFIRMED vai ativar)
    await supabase
      .from("organizations")
      .update({ subscription_status: "pending" })
      .eq("id", organization_id);

    return new Response(
      JSON.stringify({
        success: true,
        asaas_subscription_id: asaasSub.id,
        payment_method,
        // Para boleto/pix: retorna URL
        invoice_url: asaasSub.invoiceUrl ?? null,
        bank_slip_url: asaasSub.bankSlipUrl ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-asaas-subscription]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
