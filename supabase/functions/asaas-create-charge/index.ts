import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY     = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV         = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const asaasGet  = (path: string) =>
  fetch(`${ASAAS_BASE}${path}`, { headers: { "access_token": ASAAS_API_KEY } });

const asaasPost = (path: string, body: unknown) =>
  fetch(`${ASAAS_BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
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
      .select("id, user_id, treinador_id")
      .eq("id", aluno_id)
      .eq("treinador_id", treinador_id)
      .single();
    if (alunoErr || !aluno) throw new Error("Aluno não encontrado ou sem permissão");

    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", aluno.user_id)
      .maybeSingle();

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

    // ── 3. Customer Asaas (cria se não existir) ──────────────────────────────
    let asaasCustomerId: string;

    const { data: existingCust } = await supabase
      .from("asaas_customers_alunos")
      .select("asaas_id")
      .eq("aluno_id", aluno_id)
      .maybeSingle();

    if (existingCust?.asaas_id) {
      asaasCustomerId = existingCust.asaas_id;
    } else {
      const cpfCnpj = (body.cpf ?? "").replace(/\D/g, "");
      if (!cpfCnpj) throw new Error("CPF ou CNPJ do aluno é obrigatório para a primeira cobrança.");

      const custPayload: Record<string, unknown> = { name, email, cpfCnpj };
      if (mobilePhone) custPayload.mobilePhone = mobilePhone;

      const custRes  = await asaasPost("/customers", custPayload);
      const custData = await custRes.json();
      if (!custData.id) throw new Error(`Asaas customer error: ${JSON.stringify(custData)}`);

      await supabase.from("asaas_customers_alunos").insert({
        org_id, aluno_id, asaas_id: custData.id,
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
    });
    const payment = await payRes.json();
    if (!payment.id) throw new Error(`Asaas payment error: ${JSON.stringify(payment)}`);

    // ── 5. PIX: busca payload (copia e cola) ─────────────────────────────────
    let pixKey: string | null = null;
    if (forma_pagamento === "PIX") {
      try {
        const pixRes  = await asaasGet(`/payments/${payment.id}/pixQrCode`);
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
      })
      .select()
      .single();
    if (cobErr) throw cobErr;

    // ── 7. Notificação interna para o aluno ──────────────────────────────────
    if (aluno.user_id) {
      const valorFmt = fmtBRL(Number(valor));
      const dateFmt  = fmtDate(vencimento);
      const { error: notifErr } = await supabase.from("notificacoes").insert({
        user_id:  aluno.user_id,
        org_id,
        titulo:   "Nova cobrança gerada",
        mensagem: `${descricao} — ${valorFmt} — Vence em ${dateFmt}`,
        tipo:     "financeiro",
        link:     payment.invoiceUrl ?? null,
      });
      if (notifErr) {
        console.error("[asaas-create-charge] notif aluno falhou:", notifErr.message);
      } else {
        console.log("[asaas-create-charge] notif aluno ok, user_id:", aluno.user_id);
      }
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
