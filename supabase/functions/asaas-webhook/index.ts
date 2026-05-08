import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ────────────────────────────────────────────────────────────────

async function setOrgStatus(orgId: string, status: string) {
  await supabase
    .from("organizations")
    .update({ subscription_status: status })
    .eq("id", orgId);
}

async function setSubscriptionStatus(
  asaasSubId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await supabase
    .from("subscriptions")
    .update({ status, ...extra })
    .eq("asaas_subscription_id", asaasSubId);
}

async function getOrgIdBySubscription(asaasSubId: string): Promise<string | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("organization_id")
    .eq("asaas_subscription_id", asaasSubId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

async function logEvent(payload: Record<string, unknown>, orgId: string | null, subId: string | null) {
  await supabase.from("payment_events").insert({
    subscription_id: subId ?? null,
    organization_id: orgId,
    asaas_payment_id: (payload.payment as Record<string,unknown>)?.id as string ?? null,
    event_type: payload.event as string,
    amount: (payload.payment as Record<string,unknown>)?.value as number ?? null,
    due_date: (payload.payment as Record<string,unknown>)?.dueDate as string ?? null,
    paid_at: payload.event === "PAYMENT_CONFIRMED"
      ? ((payload.payment as Record<string,unknown>)?.paymentDate as string ?? null)
      : null,
    raw_payload: payload,
  });
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  // Verifica token de autenticação do webhook (header personalizado)
  const token = req.headers.get("asaas-access-token") ?? "";
  if (ASAAS_WEBHOOK_TOKEN && token !== ASAAS_WEBHOOK_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const event = payload.event as string;
  const payment = payload.payment as Record<string, unknown> | undefined;
  const asaasSubId = payment?.subscription as string | undefined;

  // Busca subscription e org
  let orgId: string | null = null;
  let subRow: { id: string; organization_id: string } | null = null;

  if (asaasSubId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("id, organization_id")
      .eq("asaas_subscription_id", asaasSubId)
      .maybeSingle();
    subRow = data;
    orgId = data?.organization_id ?? null;
  }

  // Loga o evento
  await logEvent(payload, orgId, subRow?.id ?? null);

  // ── Roteamento por evento ────────────────────────────────────────────────

  switch (event) {
    case "PAYMENT_CONFIRMED": {
      // Ativa assinatura e org
      if (asaasSubId) {
        const nextBilling = payment?.dueDate as string | undefined;
        await setSubscriptionStatus(asaasSubId, "active", {
          next_billing_date: nextBilling ?? null,
          grace_until: null,
        });
      }
      if (orgId) await setOrgStatus(orgId, "active");
      break;
    }

    case "PAYMENT_OVERDUE": {
      // Inicia carência de 7 dias
      const graceUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      if (asaasSubId) {
        await setSubscriptionStatus(asaasSubId, "suspended", { grace_until: graceUntil });
      }
      if (orgId) {
        // Mantém org active durante carência (painel do aluno continua)
        // Envia email de aviso (via enviar-email function se disponível)
        try {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name, owner_id")
            .eq("id", orgId)
            .single();

          if (orgData) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("email:id, nome")
              .eq("id", orgData.owner_id)
              .maybeSingle();

            const ownerEmail = await supabase.auth.admin.getUserById(orgData.owner_id)
              .then(r => r.data.user?.email ?? null);

            if (ownerEmail) {
              await supabase.functions.invoke("enviar-email", {
                body: {
                  to: ownerEmail,
                  subject: `[ORBI Pro] Pagamento em atraso — sua conta será suspensa em 7 dias`,
                  html: `<p>Olá! Identificamos que seu pagamento está em atraso. Você tem <strong>7 dias de carência</strong> para regularizar sua situação e manter sua conta ativa. Acesse o painel e atualize seu método de pagamento.</p>`,
                },
              });
            }
          }
        } catch (_) { /* ignora erro de email */ }
      }
      break;
    }

    case "PAYMENT_DELETED": {
      // Suspende após carência esgotada
      if (asaasSubId) await setSubscriptionStatus(asaasSubId, "suspended");
      if (orgId) await setOrgStatus(orgId, "suspended");
      break;
    }

    case "SUBSCRIPTION_CANCELLED": {
      if (asaasSubId) await setSubscriptionStatus(asaasSubId, "cancelled");
      if (orgId) await setOrgStatus(orgId, "cancelled");
      break;
    }

    default:
      // Outros eventos apenas logados
      break;
  }

  return new Response(JSON.stringify({ received: true, event }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
