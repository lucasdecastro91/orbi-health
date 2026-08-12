import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";
const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.orbihealth.com.br";
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") ?? "";
const EVOLUTION_API_KEY  = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const fmtBRL = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Telefone: DDD+numero (10-11 digitos) vira "55DDD..." pra Evolution API ────
function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}
function toWhatsappNumber(raw: string | null | undefined): string {
  const digits = normalizePhone(raw);
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// ── WhatsApp avulso, best-effort — nunca bloqueia o fluxo do webhook ──────────
async function sendWhatsapp(
  orgId: string,
  alunoId: string,
  whatsappStatus: string | null,
  whatsappInstance: string | null,
  phone: string | null,
  text: string,
) {
  if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) return;
  if (whatsappStatus !== "connected" || !whatsappInstance) return;
  const number = toWhatsappNumber(phone);
  if (!number) return;
  try {
    const res = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${whatsappInstance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error("[asaas-webhook] whatsapp send failed:", res.status, raw);
      return;
    }
    const data = raw ? JSON.parse(raw) : {};
    await supabase.from("whatsapp_messages").insert({
      org_id: orgId, aluno_id: alunoId, direction: "outbound",
      content: text, wa_message_id: data?.key?.id ?? null,
    });
  } catch (e) {
    console.error("[asaas-webhook] whatsapp send error:", e instanceof Error ? e.message : e);
  }
}

async function asaasCall(method: "PUT" | "DELETE" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas ${method} ${path} error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Promove a subscription de R$1 (degustação) pro valor cheio, na
//    primeira confirmação de pagamento — mensal só atualiza o valor
//    (afeta só cobranças futuras, confirmado na doc do Asaas); anual
//    cancela a de R$1 e cria uma nova subscription anual.
async function promoteFromIntro(sub: {
  id: string;
  organization_id: string;
  asaas_customer_id: string;
  asaas_subscription_id: string;
  plan: string; // cycle escolhido: "mensal" | "anual"
  full_price: number | null;
}) {
  if (sub.full_price == null) return; // sem preço travado, não promove (não deveria acontecer)

  if (sub.plan === "anual") {
    await asaasCall("DELETE", `/subscriptions/${sub.asaas_subscription_id}`);

    const nextDue = new Date();
    nextDue.setMonth(nextDue.getMonth() + 1);

    // billingType "UNDEFINED": sem token de cartão salvo (tokenização ainda não
    // liberada em produção pelo Asaas), o cliente escolhe a forma de pagamento
    // na hora de pagar essa fatura — por isso o e-mail de aviso logo abaixo.
    const newSub = await asaasCall("POST", "/subscriptions", {
      customer: sub.asaas_customer_id,
      billingType: "UNDEFINED",
      value: sub.full_price,
      nextDueDate: nextDue.toISOString().slice(0, 10),
      cycle: "YEARLY",
      description: "ORBI — assinatura anual",
    });

    await supabase.from("subscriptions").update({
      asaas_subscription_id: newSub.id,
      next_billing_date: nextDue.toISOString().slice(0, 10),
      intro_step: false,
    }).eq("id", sub.id);

    // Avisa o dono da org que precisa completar o pagamento da assinatura
    // anual (não é cobrado automaticamente — sem cartão tokenizado ainda).
    try {
      const { data: orgData } = await supabase
        .from("organizations").select("owner_id").eq("id", sub.organization_id).single();
      if (orgData) {
        const ownerEmail = await supabase.auth.admin.getUserById(orgData.owner_id)
          .then(r => r.data.user?.email ?? null);
        if (ownerEmail && newSub.invoiceUrl) {
          await supabase.functions.invoke("enviar-email", {
            body: {
              to: ownerEmail,
              subject: "[ORBI] Sua assinatura anual está pronta para pagamento",
              html: `<p>Seu primeiro mês em R$1 foi confirmado! Pra continuar com o plano anual, finalize o pagamento aqui: <a href="${newSub.invoiceUrl}">${newSub.invoiceUrl}</a></p>`,
            },
          });
        }
      }
    } catch (_) { /* não bloqueia o fluxo principal */ }
  } else {
    await asaasCall("PUT", `/subscriptions/${sub.asaas_subscription_id}`, {
      value: sub.full_price,
    });
    await supabase.from("subscriptions").update({ intro_step: false }).eq("id", sub.id);
  }
}

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

// ── Soma um ciclo de cobrança (mensal/anual) a uma data ─────────────────────
// payment.dueDate no payload do webhook é o vencimento da cobrança que
// ACABOU de ser paga (o ciclo atual), não o próximo — a Asaas não manda o
// next billing pronto, então calculamos aqui.
function addCycle(dateStr: string, cycle: string | undefined): string {
  const d = new Date(dateStr + "T00:00:00");
  const originalDay = d.getDate();
  if (cycle === "anual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  // setMonth/setFullYear "estoura" pro mês seguinte quando o dia original não
  // existe no mês de destino (ex: 31/01 + 1 mês vira 03/03, não 28/02) — em vez
  // disso, gruda no último dia do mês de destino. Só afeta a data exibida no
  // Settings (next_billing_date é informativo; quem cobra de verdade é a Asaas).
  if (d.getDate() !== originalDay) d.setDate(0);
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
    paid_at: (payload.event === "PAYMENT_CONFIRMED" || payload.event === "PAYMENT_RECEIVED")
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
  // Eventos de pagamento (PAYMENT_*) trazem o id da assinatura em
  // payment.subscription; eventos de assinatura (SUBSCRIPTION_*) têm um
  // payload totalmente diferente, sem "payment" nenhum — o id vem em
  // subscription.id.
  const subscriptionObj = payload.subscription as Record<string, unknown> | undefined;
  const asaasSubId = (payment?.subscription as string | undefined) ?? (subscriptionObj?.id as string | undefined);
  const asaasPaymentId = payment?.id as string | undefined;

  // Busca subscription e org
  let orgId: string | null = null;
  let subRow: {
    id: string; organization_id: string; plan: string; full_price: number | null;
    asaas_customer_id: string; asaas_subscription_id: string; intro_step: boolean;
  } | null = null;

  if (asaasSubId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("id, organization_id, plan, full_price, asaas_customer_id, asaas_subscription_id, intro_step")
      .eq("asaas_subscription_id", asaasSubId)
      .maybeSingle();
    subRow = data;
    orgId = data?.organization_id ?? null;
  }

  // Loga o evento
  await logEvent(payload, orgId, subRow?.id ?? null);

  // ── Roteamento por evento ────────────────────────────────────────────────

  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      // Ativa assinatura e org.
      // Cartão: PAYMENT_CONFIRMED chega primeiro (saldo ainda não disponível),
      // PAYMENT_RECEIVED pode vir depois quando o saldo é liberado.
      // Pix: pula PAYMENT_CONFIRMED e manda só PAYMENT_RECEIVED direto (liquidação instantânea).
      if (asaasSubId) {
        const paidDueDate = payment?.dueDate as string | undefined;
        const nextBilling = paidDueDate ? addCycle(paidDueDate, subRow?.plan) : null;
        await setSubscriptionStatus(asaasSubId, "active", {
          next_billing_date: nextBilling,
          grace_until: null,
        });
      }
      if (orgId) await setOrgStatus(orgId, "active");

      // Primeira confirmação de uma subscription em degustação (R$1) — promove
      // pro valor cheio (mensal: atualiza a mesma subscription; anual: recria).
      if (subRow?.intro_step) {
        try { await promoteFromIntro(subRow); }
        catch (e) { console.error("[webhook] promoteFromIntro:", e instanceof Error ? e.message : e); }
      }
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
            .select("id, aluno_id, org_id, descricao, data_vencimento, valor, forma_pagamento, invoice_url")
            .eq("asaas_id", asaasPaymentId)
            .maybeSingle();
          if (cobOverdue) {
            const { data: alunoOverdue } = await supabase
              .from("alunos").select("user_id, telefone").eq("id", cobOverdue.aluno_id).maybeSingle();
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
                const mensagem = `${cobOverdue.descricao} venceu em ${dueFmt}. Regularize para manter seu acesso.`;
                await supabase.from("notificacoes").insert({
                  user_id:  alunoOverdue.user_id,
                  org_id:   cobOverdue.org_id,
                  titulo:   "Pagamento em atraso",
                  mensagem,
                  tipo:     "financeiro",
                });

                const [{ data: orgRow }, { data: profileRow }] = await Promise.all([
                  supabase.from("organizations").select("name, whatsapp_status, whatsapp_instance_name").eq("id", cobOverdue.org_id).maybeSingle(),
                  supabase.from("profiles").select("nome").eq("id", alunoOverdue.user_id).maybeSingle(),
                ]);
                const nomeAluno = profileRow?.nome ?? "Aluno";
                const valorFmt = fmtBRL(Number(cobOverdue.valor));
                // Checkout próprio (/pagar/:id) cobre Pix e Cartão (tokenizado via
                // pagar-cobranca-cartao) — só boleto ainda cai no link do Asaas.
                const link = (cobOverdue.forma_pagamento === "PIX" || cobOverdue.forma_pagamento === "CREDIT_CARD")
                  ? `${APP_URL}/pagar/${cobOverdue.id}`
                  : (cobOverdue.invoice_url ?? null);

                // Push
                try {
                  await supabase.functions.invoke("send-push", {
                    body: {
                      user_ids: [alunoOverdue.user_id],
                      title: "Pagamento em atraso",
                      body: mensagem,
                      tag: "cobranca_atrasada",
                      url: link || "/aluno/financeiro",
                    },
                  });
                } catch (e) {
                  console.error("[asaas-webhook] push overdue falhou:", e instanceof Error ? e.message : e);
                }

                // WhatsApp
                await sendWhatsapp(
                  cobOverdue.org_id, cobOverdue.aluno_id,
                  orgRow?.whatsapp_status ?? null, orgRow?.whatsapp_instance_name ?? null,
                  alunoOverdue.telefone ?? null,
                  `Olá ${nomeAluno}! O pagamento de ${cobOverdue.descricao} (${valorFmt}), vencido em ${dueFmt}, ainda não foi regularizado com ${orgRow?.name ?? "seu treinador"}.${link ? ` Regularize aqui: ${link}` : ""}`,
                );

                // Email
                const { data: { user: alunoUser } } = await supabase.auth.admin.getUserById(alunoOverdue.user_id);
                if (alunoUser?.email) {
                  try {
                    await supabase.functions.invoke("enviar-email", {
                      body: {
                        type: "cobranca_atrasada",
                        to: alunoUser.email,
                        nome: nomeAluno,
                        orgName: orgRow?.name ?? "sua plataforma",
                        descricao: cobOverdue.descricao,
                        valorFmt,
                        dateFmt: dueFmt,
                        link,
                      },
                    });
                  } catch (e) {
                    console.error("[asaas-webhook] email overdue falhou:", e instanceof Error ? e.message : e);
                  }
                }
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

    // Nome real do evento na Asaas é SUBSCRIPTION_DELETED, não
    // SUBSCRIPTION_CANCELLED (esse não existe na lista de eventos deles —
    // achado testando ao vivo, o case antigo nunca teria disparado).
    case "SUBSCRIPTION_DELETED": {
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
