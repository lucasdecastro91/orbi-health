import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY     = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV         = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";
const APP_URL           = Deno.env.get("APP_URL") ?? "https://app.orbihealth.com.br";
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") ?? "";
const EVOLUTION_API_KEY  = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

// Taxa Orbi Pay — percentual sobre cada cobrança de org com subconta aprovada,
// via split pra carteira master. Decisão de negócio (Lucas, 2026-08-26).
const ORBI_SPLIT_PERCENT = 3;

// Se ASAAS_MASTER_WALLET_ID não estiver configurado como secret, busca via API
// (GET /v3/wallets) e usa a primeira carteira retornada. Evita depender de
// alguém achar o walletId manualmente no painel — mas se a conta tiver mais
// de uma carteira, LOGA um aviso pra confirmar que é a certa antes de confiar
// cegamente (nesse caso, configurar o secret manualmente resolve de vez).
async function getMasterWalletId(): Promise<string> {
  const fromEnv = Deno.env.get("ASAAS_MASTER_WALLET_ID");
  if (fromEnv) return fromEnv;

  const res = await fetch(`${ASAAS_BASE}/wallets`, {
    headers: { "access_token": ASAAS_API_KEY },
  });
  if (!res.ok) throw new Error(`Falha ao buscar walletId master: ${await res.text()}`);
  const data = await res.json();
  const wallets = data?.data ?? [];
  if (wallets.length === 0) throw new Error("Conta master não tem nenhuma carteira (wallet) — impossível montar o split.");
  if (wallets.length > 1) {
    console.warn("[asaas-create-charge] conta master tem múltiplas carteiras, usando a primeira:", JSON.stringify(wallets));
  }
  return wallets[0].id;
}

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// apiKey por chamada: master (padrão, org sem subconta aprovada) ou da
// subconta do treinador — cada cobrança escolhe a chave certa depois de
// checar o status em asaas_subaccounts (ver "Subconta da org" mais abaixo).
const asaasGet  = (path: string, apiKey: string) =>
  fetch(`${ASAAS_BASE}${path}`, { headers: { "access_token": apiKey } });

const asaasPost = (path: string, body: unknown, apiKey: string) =>
  fetch(`${ASAAS_BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "access_token": apiKey },
    body:    JSON.stringify(body),
  });

// ── Format date "YYYY-MM-DD" → "DD/MM/YYYY" ──────────────────────────────────
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// ── Format currency ───────────────────────────────────────────────────────────
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

// ── WhatsApp avulso, best-effort — nunca bloqueia o fluxo da cobrança ──────────
async function sendWhatsapp(
  supabase: ReturnType<typeof createClient>,
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
      console.error("[asaas-create-charge] whatsapp send failed:", res.status, raw);
      return;
    }
    const data = raw ? JSON.parse(raw) : {};
    await supabase.from("whatsapp_messages").insert({
      org_id: orgId, aluno_id: alunoId, direction: "outbound",
      content: text, wa_message_id: data?.key?.id ?? null,
    });
  } catch (e) {
    console.error("[asaas-create-charge] whatsapp send error:", e instanceof Error ? e.message : e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // Autentica usuário
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      aluno_id,
      org_id,
      descricao,
      valor,              // number
      vencimento,         // "YYYY-MM-DD"
      forma_pagamento,    // "PIX" | "CREDIT_CARD" | "BOLETO"
      installment_count,  // number (opcional, default 1)
    } = body;

    if (!aluno_id || !org_id || !descricao || !valor || !vencimento || !forma_pagamento) {
      throw new Error("Campos obrigatórios ausentes");
    }

    const treinador_id = user.id;

    // ── 1. Dados do aluno ────────────────────────────────────────────────────
    const { data: aluno, error: alunoErr } = await supabase
      .from("alunos")
      .select("id, user_id, treinador_id, telefone")
      .eq("id", aluno_id)
      .eq("treinador_id", treinador_id)
      .single();
    if (alunoErr || !aluno) throw new Error("Aluno não encontrado ou sem permissão");

    // ── Org (nome + status do WhatsApp) ──────────────────────────────────────
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name, whatsapp_status, whatsapp_instance_name")
      .eq("id", org_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", aluno.user_id)
      .maybeSingle();

    // ── Subconta da org — se aprovada, cobra por ela e faz split da Taxa Orbi
    // Pay; senão (pending/em análise/sem subconta), mantém o comportamento de
    // hoje via conta master. Customers de contas diferentes não são
    // compatíveis entre si — por isso o lookup abaixo também é escopado.
    const { data: subaccount } = await supabase
      .from("asaas_subaccounts")
      .select("id, api_key, status")
      .eq("org_id", org_id)
      .maybeSingle();

    const useSubaccount = subaccount?.status === "aprovado";
    const chargeApiKey  = useSubaccount ? subaccount!.api_key : ASAAS_API_KEY;
    const subaccountId  = useSubaccount ? subaccount!.id : null;
    const masterWalletId = useSubaccount ? await getMasterWalletId() : "";

    const { data: { user: alunoUser } } = await supabase.auth.admin.getUserById(aluno.user_id);
    const email = alunoUser?.email ?? "";
    const name  = profile?.nome ?? email ?? "Aluno";

    // ── 2. WhatsApp do aluno (da anamnese) ───────────────────────────────────
    const { data: anamnese } = await supabase
      .from("anamneses")
      .select("whatsapp")
      .eq("student_id", aluno.user_id)
      .maybeSingle();
    // whatsapp já deve estar no formato +55XXXXXXXXXXX
    const mobilePhone = anamnese?.whatsapp ?? null;
    // Fonte oficial de telefone é alunos.telefone (anamnese é só fallback) —
    // usado pro nosso próprio envio via WhatsApp, não confundir com mobilePhone
    // acima (que vai pro cadastro de cliente do Asaas).
    const notifyPhone = aluno.telefone ?? anamnese?.whatsapp ?? null;

    // ── 3. Customer Asaas (cria se não existir) ──────────────────────────────
    let asaasCustomerId: string;

    let custQuery = supabase
      .from("asaas_customers_alunos")
      .select("asaas_id")
      .eq("aluno_id", aluno_id);
    custQuery = subaccountId
      ? custQuery.eq("asaas_subaccount_id", subaccountId)
      : custQuery.is("asaas_subaccount_id", null);
    const { data: existingCust } = await custQuery.maybeSingle();

    if (existingCust?.asaas_id) {
      asaasCustomerId = existingCust.asaas_id;
      // Garante notificationDisabled mesmo em clientes criados antes dessa regra
      // existir (idempotente, custo baixo — evita reintroduzir o e-mail com
      // branding Asaas pra quem já tinha cliente cadastrado).
      try {
        await asaasPost(`/customers/${asaasCustomerId}`, { notificationDisabled: true }, chargeApiKey);
      } catch { /* não bloqueia a cobrança se isso falhar */ }
    } else {
      const cpfCnpj = (body.cpf ?? "").replace(/\D/g, "");
      if (!cpfCnpj) throw new Error("CPF ou CNPJ do aluno é obrigatório para a primeira cobrança.");

      // notificationDisabled: o Asaas manda e-mail/SMS pro cliente por conta própria
      // (marca deles, fora do nosso controle) sempre que cria uma cobrança — desligado
      // porque já temos nosso próprio sistema de lembretes (30/15/7 dias, vencido) e o
      // checkout próprio (/pagar/:id) cobre a mesma necessidade sem vazar branding Asaas.
      const custPayload: Record<string, unknown> = { name, email, cpfCnpj, notificationDisabled: true };
      if (mobilePhone) custPayload.mobilePhone = mobilePhone;

      const custRes  = await asaasPost("/customers", custPayload, chargeApiKey);
      const custData = await custRes.json();
      if (!custData.id) throw new Error(`Asaas customer error: ${JSON.stringify(custData)}`);

      await supabase.from("asaas_customers_alunos").insert({
        org_id, aluno_id, asaas_id: custData.id, asaas_subaccount_id: subaccountId,
      });
      asaasCustomerId = custData.id;
    }

    // ── 4. Cria cobrança no Asaas ────────────────────────────────────────────
    const installCount = Number(installment_count ?? 1);
    const payRes  = await asaasPost("/payments", {
      customer:         asaasCustomerId,
      billingType:      forma_pagamento,
      value:            Number(valor),
      dueDate:          vencimento,
      description:      descricao,
      ...(forma_pagamento === "CREDIT_CARD" && installCount > 1
        ? { installmentCount: installCount, installmentValue: Number(valor) / installCount }
        : {}),
      // Taxa Orbi Pay — só quando a cobrança nasce numa subconta aprovada.
      ...(useSubaccount
        ? { split: [{ walletId: masterWalletId, percentualValue: ORBI_SPLIT_PERCENT }] }
        : {}),
    }, chargeApiKey);
    const payment = await payRes.json();
    if (!payment.id) throw new Error(`Asaas payment error: ${JSON.stringify(payment)}`);

    // ── 5. PIX: busca payload (copia e cola) ─────────────────────────────────
    let pixKey: string | null = null;
    if (forma_pagamento === "PIX") {
      try {
        const pixRes  = await asaasGet(`/payments/${payment.id}/pixQrCode`, chargeApiKey);
        const pixData = await pixRes.json();
        pixKey = pixData.payload ?? null;
      } catch { /* usa só o invoiceUrl se falhar */ }
    }

    // ── 6. Salva no banco ────────────────────────────────────────────────────
    const { data: cobranca, error: cobErr } = await supabase
      .from("cobrancas")
      .insert({
        org_id,
        aluno_id,
        treinador_id,
        descricao,
        asaas_id:        payment.id,
        forma_pagamento,
        valor:           Number(valor),
        status:          "PENDING",
        data_vencimento: vencimento,
        invoice_url:     payment.invoiceUrl ?? null,
        pix_key:         pixKey,
        installment_count: installCount,
      })
      .select()
      .single();
    if (cobErr) throw cobErr;

    // ── 7. Notificação interna para o aluno ──────────────────────────────────
    if (aluno.user_id) {
      const valorFmt = fmtBRL(Number(valor));
      const dateFmt  = fmtDate(vencimento);

      // Checkout próprio (/pagar/:id) cobre Pix e Cartão (tokenizado via
      // pagar-cobranca-cartao) — só boleto ainda cai no link do Asaas, já
      // que não construímos boleto na nossa página.
      const paymentLink = (forma_pagamento === "PIX" || forma_pagamento === "CREDIT_CARD")
        ? `${APP_URL}/pagar/${cobranca.id}`
        : (payment.invoiceUrl ?? "");

      const { error: notifErr } = await supabase.from("notificacoes").insert({
        user_id:  aluno.user_id,
        org_id,
        titulo:   "Nova cobrança gerada",
        mensagem: `${descricao} — ${valorFmt} — Vence em ${dateFmt}`,
        tipo:     "financeiro",
        link:     paymentLink || null,
      });
      if (notifErr) {
        console.error("[asaas-create-charge] notif aluno falhou:", notifErr.message);
      } else {
        console.log("[asaas-create-charge] notif aluno ok, user_id:", aluno.user_id);
      }

      // Push, WhatsApp e e-mail em paralelo — todos best-effort (nenhum bloqueia
      // os outros nem a cobrança). Antes eram sequenciais e a resposta da cobrança
      // esperava a soma dos três tempos, deixando o "Gerando..." do frontend
      // travado e o e-mail (por ser o último) chegando bem depois do esperado.
      const pushPromise = supabase.functions.invoke("send-push", {
        body: {
          user_ids: [aluno.user_id],
          title: "Nova cobrança gerada",
          body: `${descricao} — ${valorFmt} — Vence em ${dateFmt}`,
          tag: "cobranca_gerada",
          url: paymentLink || "/aluno/financeiro",
        },
      }).catch((e) => {
        console.error("[asaas-create-charge] push falhou:", e instanceof Error ? e.message : e);
      });

      const whatsappPromise = paymentLink
        ? sendWhatsapp(
            supabase, org_id, aluno_id,
            orgRow?.whatsapp_status ?? null, orgRow?.whatsapp_instance_name ?? null,
            notifyPhone,
            `Olá ${name}! Uma nova cobrança foi gerada por ${orgRow?.name ?? "seu treinador"}: ${descricao} — ${valorFmt}, vencimento em ${dateFmt}. Pague aqui: ${paymentLink}`,
          )
        : Promise.resolve();

      const emailPromise = (email && paymentLink)
        ? supabase.functions.invoke("enviar-email", {
            body: {
              type: "cobranca_gerada",
              to: email,
              nome: name,
              orgName: orgRow?.name ?? "sua plataforma",
              descricao,
              valorFmt,
              dateFmt,
              link: paymentLink,
            },
          }).catch((e) => {
            console.error("[asaas-create-charge] email falhou:", e instanceof Error ? e.message : e);
          })
        : Promise.resolve();

      await Promise.all([pushPromise, whatsappPromise, emailPromise]);
    } else {
      console.warn("[asaas-create-charge] aluno sem user_id, notif ignorada. aluno_id:", aluno_id);
    }

    return new Response(
      JSON.stringify({ success: true, cobranca }),
      { headers: { ...cors, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[asaas-create-charge]", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
