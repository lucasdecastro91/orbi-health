// escolher-pagamento-cobranca — endpoint público (sem auth, mesmo modelo de
// get-cobranca-publica/pagar-cobranca-cartao) usado por /pagar/:id quando a
// cobrança está "aguardando escolha" (asaas_id IS NULL — ver
// criar-cobranca-adiada/index.ts). O aluno escolhe Pix ou parcela (e CPF, se
// for a 1ª cobrança dele) e SÓ AQUI a gente de fato cria o cliente/pagamento
// no Asaas — antes disso não existe nada lá.
//
// Valida a escolha contra o Plano de verdade (plans.pix_value /
// installment_options) no servidor — nunca confia em valor/parcela mandado
// pelo cliente, senão um payload forjado poderia pagar menos do que devia.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY    = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV        = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

const ORBI_SPLIT_PERCENT = 3;

async function getMasterWalletId(): Promise<string> {
  const fromEnv = Deno.env.get("ASAAS_MASTER_WALLET_ID");
  if (fromEnv) return fromEnv;
  const res = await fetch(`${ASAAS_BASE}/wallets`, { headers: { "access_token": ASAAS_API_KEY } });
  if (!res.ok) throw new Error(`Falha ao buscar walletId master: ${await res.text()}`);
  const data = await res.json();
  const wallets = data?.data ?? [];
  if (wallets.length === 0) throw new Error("Conta master não tem nenhuma carteira (wallet).");
  return wallets[0].id;
}

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const asaasPost = (path: string, body: unknown, apiKey: string) =>
  fetch(`${ASAAS_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "access_token": apiKey },
    body: JSON.stringify(body),
  });
const asaasGet = (path: string, apiKey: string) =>
  fetch(`${ASAAS_BASE}${path}`, { headers: { "access_token": apiKey } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  try {
    const body = await req.json();
    const { cobranca_id, forma_pagamento, installment_count, cpf } = body;

    if (!cobranca_id || !forma_pagamento) return json({ error: "Campos obrigatórios ausentes" }, 400);
    if (!["PIX", "CREDIT_CARD"].includes(forma_pagamento)) return json({ error: "Forma de pagamento inválida" }, 400);

    // ── 1. Cobrança — precisa estar mesmo aguardando escolha ────────────────
    const { data: cobranca, error: cobErr } = await supabase
      .from("cobrancas")
      .select("id, org_id, aluno_id, treinador_id, descricao, status, asaas_id, plano_id, data_vencimento")
      .eq("id", cobranca_id)
      .maybeSingle();
    if (cobErr || !cobranca) return json({ error: "not_found" }, 404);
    if (!["PENDING", "OVERDUE"].includes(cobranca.status)) return json({ error: "Esta cobrança não está mais disponível." }, 409);
    if (cobranca.asaas_id) return json({ error: "Esta cobrança já teve a forma de pagamento definida." }, 409);
    if (!cobranca.plano_id) return json({ error: "Cobrança sem plano vinculado." }, 500);

    // ── 2. Valida a escolha contra o Plano de verdade (fail-closed) ─────────
    const { data: plano, error: planoErr } = await supabase
      .from("plans")
      .select("name, pix_value, installment_options")
      .eq("id", cobranca.plano_id)
      .maybeSingle();
    if (planoErr || !plano) return json({ error: "Plano não encontrado." }, 500);

    let valor: number;
    let installCount = 1;
    if (forma_pagamento === "PIX") {
      if (plano.pix_value == null) return json({ error: "Este plano não tem opção de Pix." }, 400);
      valor = Number(plano.pix_value);
    } else {
      installCount = Number(installment_count ?? 0);
      const opcoes = (plano.installment_options ?? []) as { installments: number; client_value: number }[];
      const opcao = opcoes.find((o) => o.installments === installCount);
      if (!opcao) return json({ error: "Número de parcelas não disponível pra esse plano." }, 400);
      valor = Number(opcao.client_value);
    }

    // ── 3. Subconta da org (mesmo padrão de asaas-create-charge) ────────────
    const { data: subaccount } = await supabase
      .from("asaas_subaccounts")
      .select("id, api_key, status")
      .eq("org_id", cobranca.org_id)
      .maybeSingle();
    const useSubaccount = subaccount?.status === "aprovado";
    const chargeApiKey  = useSubaccount ? subaccount!.api_key : ASAAS_API_KEY;
    const subaccountId  = useSubaccount ? subaccount!.id : null;
    const masterWalletId = useSubaccount ? await getMasterWalletId() : "";

    // ── 4. Aluno + cliente Asaas (cria se não existir) ───────────────────────
    const { data: aluno } = await supabase
      .from("alunos")
      .select("user_id, telefone")
      .eq("id", cobranca.aluno_id)
      .maybeSingle();
    if (!aluno?.user_id) return json({ error: "Aluno não encontrado." }, 500);

    const { data: { user: alunoUser } } = await supabase.auth.admin.getUserById(aluno.user_id);
    const email = alunoUser?.email ?? "";
    const { data: profile } = await supabase.from("profiles").select("nome").eq("id", aluno.user_id).maybeSingle();
    const name = profile?.nome ?? email ?? "Aluno";

    let asaasCustomerId: string;
    let custQuery = supabase.from("asaas_customers_alunos").select("asaas_id").eq("aluno_id", cobranca.aluno_id);
    custQuery = subaccountId ? custQuery.eq("asaas_subaccount_id", subaccountId) : custQuery.is("asaas_subaccount_id", null);
    const { data: existingCust } = await custQuery.maybeSingle();

    if (existingCust?.asaas_id) {
      asaasCustomerId = existingCust.asaas_id;
    } else {
      const cpfCnpj = String(cpf ?? "").replace(/\D/g, "");
      if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) return json({ error: "Informe um CPF ou CNPJ válido." }, 400);

      const { data: anamnese } = await supabase.from("anamneses").select("whatsapp").eq("student_id", aluno.user_id).maybeSingle();
      const mobilePhone = anamnese?.whatsapp ?? aluno.telefone ?? null;

      const custPayload: Record<string, unknown> = { name, email, cpfCnpj, notificationDisabled: true };
      if (mobilePhone) custPayload.mobilePhone = mobilePhone;

      const custRes  = await asaasPost("/customers", custPayload, chargeApiKey);
      const custData = await custRes.json();
      if (!custData.id) return json({ error: `Não foi possível validar seus dados: ${custData?.errors?.[0]?.description ?? "erro desconhecido"}` }, 400);

      await supabase.from("asaas_customers_alunos").insert({
        org_id: cobranca.org_id, aluno_id: cobranca.aluno_id, asaas_id: custData.id, asaas_subaccount_id: subaccountId,
      });
      asaasCustomerId = custData.id;
    }

    // ── 5. Cria o pagamento no Asaas, com a escolha do aluno ─────────────────
    const payRes = await asaasPost("/payments", {
      customer:    asaasCustomerId,
      billingType: forma_pagamento,
      value:       valor,
      dueDate:     cobranca.data_vencimento,
      description: cobranca.descricao,
      ...(forma_pagamento === "CREDIT_CARD" && installCount > 1
        ? { installmentCount: installCount, installmentValue: valor / installCount }
        : {}),
      ...(useSubaccount ? { split: [{ walletId: masterWalletId, percentualValue: ORBI_SPLIT_PERCENT }] } : {}),
    }, chargeApiKey);
    const payment = await payRes.json();
    if (!payment.id) return json({ error: `Erro ao gerar pagamento: ${payment?.errors?.[0]?.description ?? "erro desconhecido"}` }, 400);

    let pixKey: string | null = null;
    if (forma_pagamento === "PIX") {
      try {
        const pixRes  = await asaasGet(`/payments/${payment.id}/pixQrCode`, chargeApiKey);
        const pixData = await pixRes.json();
        pixKey = pixData.payload ?? null;
      } catch { /* usa só o invoiceUrl se falhar */ }
    }

    const { error: updErr } = await supabase
      .from("cobrancas")
      .update({
        asaas_id:           payment.id,
        forma_pagamento,
        valor,
        installment_count:  installCount,
        invoice_url:        payment.invoiceUrl ?? null,
        pix_key:            pixKey,
      })
      .eq("id", cobranca_id);
    if (updErr) throw updErr;

    return json({ ok: true, forma_pagamento, valor, installment_count: installCount, pix_key: pixKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[escolher-pagamento-cobranca]", msg);
    return json({ error: "Erro ao processar sua escolha." }, 500);
  }
});
