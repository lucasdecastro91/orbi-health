import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Calcula data de expiração do plano pelo nome ────────────────────────────
// Detecta palavras-chave: anual, semestral, quadrimestral, trimestral, etc.
function calcPlanExpiry(descricao: string, startDate: string): string | null {
  const n = descricao.toLowerCase();
  const d = new Date(startDate + "T00:00:00");
  let months = 0;
  if      (n.includes("anual")         || n.includes("12 m") || n.includes("1 ano"))  months = 12;
  else if (n.includes("semestral")     || n.includes("6 m")  || n.includes("6mes"))   months = 6;
  else if (n.includes("quadrimestral") || n.includes("4 m")  || n.includes("4mes"))   months = 4;
  else if (n.includes("trimestral")    || n.includes("3 m")  || n.includes("3mes"))   months = 3;
  else if (n.includes("bimestral")     || n.includes("2 m")  || n.includes("2mes"))   months = 2;
  else if (n.includes("mensal")        || n.includes("1 m")  || n.includes("1mes"))   months = 1;
  if (months === 0) return null;
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1); // último dia do período
  return d.toISOString().slice(0, 10);
}

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
  const asaasPaymentId = payment?.id as string | undefined;

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

      // Notifica aluno sobre cobrança avulsa vencida (evento 4)
      if (asaasPaymentId && !asaasSubId) {
        try {
          const { data: cobOverdue } = await supabase
            .from("cobrancas")
            .select("id, aluno_id, org_id, descricao, data_vencimento")
            .eq("asaas_id", asaasPaymentId)
            .maybeSingle();
          if (cobOverdue) {
            const { data: alunoOverdue } = await supabase
              .from("alunos").select("user_id").eq("id", cobOverdue.aluno_id).maybeSingle();
            if (alunoOverdue?.user_id) {
              const dueFmt = (cobOverdue.data_vencimento as string)?.split("-").reverse().join("/") ?? "";
              const { data: existing } = await supabase
                .from("notificacoes")
                .select("id")
                .eq("user_id", alunoOverdue.user_id)
                .eq("titulo", "Pagamento em atraso")
                .eq("tipo", "financeiro")
                .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
                .maybeSingle();
              if (!existing) {
                await supabase.from("notificacoes").insert({
                  user_id:  alunoOverdue.user_id,
                  org_id:   cobOverdue.org_id,
                  titulo:   "Pagamento em atraso",
                  mensagem: `${cobOverdue.descricao} venceu em ${dueFmt}. Regularize para manter seu acesso.`,
                  tipo:     "financeiro",
                });
              }
            }
          }
        } catch (_) { /* não bloqueia o fluxo principal */ }
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

  // ── Cobranças de alunos (pagamentos avulsos criados pelo treinador) ─────────
  // Identificados pelo asaas_id na tabela cobrancas (sem subscription)
  if (asaasPaymentId && !asaasSubId) {
    const COBRANCA_STATUS: Record<string, string> = {
      PAYMENT_RECEIVED:  "RECEIVED",
      PAYMENT_CONFIRMED: "CONFIRMED",
      PAYMENT_OVERDUE:   "OVERDUE",
      PAYMENT_DELETED:   "CANCELLED",
      PAYMENT_REFUNDED:  "REFUNDED",
      PAYMENT_RESTORED:  "PENDING",
    };
    const newStatus = COBRANCA_STATUS[event];
    if (newStatus) {
      // Usa paymentDate do Asaas (já em BRT) ou fallback com data atual em BRT (UTC-3)
      const dataPagamento = (newStatus === "RECEIVED" || newStatus === "CONFIRMED")
        ? (payment?.paymentDate as string
            ?? new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10))
        : null;

      await supabase
        .from("cobrancas")
        .update({ status: newStatus, data_pagamento: dataPagamento })
        .eq("asaas_id", asaasPaymentId);

      // Ações pós-pagamento confirmado
      if (newStatus === "RECEIVED" || newStatus === "CONFIRMED") {
        const { data: cob } = await supabase
          .from("cobrancas")
          .select("id, treinador_id, org_id, aluno_id, valor, descricao, data_vencimento")
          .eq("asaas_id", asaasPaymentId)
          .maybeSingle();

        if (cob) {
          const { data: alunoRow, error: alunoErr } = await supabase
            .from("alunos").select("id, user_id").eq("id", cob.aluno_id).maybeSingle();
          const { data: prof } = alunoRow
            ? await supabase.from("profiles").select("nome").eq("id", alunoRow.user_id).maybeSingle()
            : { data: null };

          const valorFmt = `R$ ${Number(cob.valor).toFixed(2).replace(".", ",")}`;
          // dataPagamento já está em BRT (paymentDate do Asaas é BRT, ou fallback Date.now()-3h)
          const datePaid = dataPagamento ?? new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const dateFmt  = datePaid.split("-").reverse().join("/");

          // ── Calcula data de expiração inteligente ────────────────────────
          // Usa palavras-chave no nome do plano; cai de volta para data_vencimento
          const expiryDate = calcPlanExpiry(cob.descricao, datePaid) ?? cob.data_vencimento;

          // ── Notifica o treinador (evento 5) ──────────────────────────────
          await supabase.from("notificacoes").insert({
            user_id:    cob.treinador_id,
            org_id:     cob.org_id,
            aluno_id:   cob.aluno_id,
            aluno_nome: prof?.nome ?? null,
            titulo:     `Pagamento recebido — ${valorFmt}`,
            mensagem:   `${prof?.nome ?? "Aluno"} pagou: ${cob.descricao}`,
            tipo:       "financeiro",
          });

          // ── Notifica o aluno (evento 2) ───────────────────────────────────
          if (alunoRow?.user_id) {
            const { error: notifErr } = await supabase.from("notificacoes").insert({
              user_id:  alunoRow.user_id,
              org_id:   cob.org_id,
              titulo:   "Pagamento confirmado! ✓",
              mensagem: `${cob.descricao} — ${valorFmt} pago em ${dateFmt}`,
              tipo:     "financeiro",
            });
            if (notifErr) console.error("[webhook] notif aluno:", notifErr.message);
          } else {
            console.warn("[webhook] alunoRow não encontrado para aluno_id:", cob.aluno_id, alunoErr?.message);
          }

          // ── Atualiza dados do plano no registro do aluno ──────────────────
          await supabase
            .from("alunos")
            .update({
              plano_nome:           cob.descricao,
              plano_inicio:         datePaid,
              data_expiracao_plano: expiryDate,
              plano_valor_pago:     Number(cob.valor),
              plano_cobranca_id:    cob.id,
            })
            .eq("id", cob.aluno_id);
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true, event }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
