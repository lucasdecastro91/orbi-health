// pagar-cobranca-cartao — endpoint público (sem auth) usado pela aba "Cartão"
// de /pagar/:id (Pagamento.tsx). Paga uma cobrança JÁ EXISTENTE (criada antes
// pelo treinador via asaas-create-charge) com cartão tokenizado, usando o
// endpoint da Asaas dedicado a isso: POST /payments/{id}/payWithCreditCard.
//
// Mesmo modelo de auth que get-cobranca-publica (service role, sem
// auth.getUser() — o visitante não tem sessão), mesma tabela de cliente Asaas
// que asaas-create-charge já usa (asaas_customers_alunos).
//
// Não atualiza `cobrancas` diretamente — asaas-webhook já escuta
// PAYMENT_CONFIRMED/PAYMENT_RECEIVED e atualiza status/notifica, mesmo
// caminho que o Pix já usa. Essa função só dispara a cobrança e devolve o
// status imediato pro frontend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY    = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV        = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://www.asaas.com/api/v3"
  : "https://sandbox.asaas.com/api/v3";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  try {
    const body = await req.json();
    const {
      cobranca_id,
      card_holder_name, card_holder_cpf, card_number,
      card_exp_month, card_exp_year, card_ccv,
      cardCep, cardAddressNumber, cardAddressComplement,
    } = body;

    if (!cobranca_id || !card_holder_name || !card_holder_cpf || !card_number ||
        !card_exp_month || !card_exp_year || !card_ccv || !cardCep || !cardAddressNumber) {
      return json({ error: "Campos obrigatórios ausentes" }, 400);
    }

    // ── 1. Cobrança — fail-closed se não existir ou não estiver pagável ──────
    const { data: cobranca, error: cobErr } = await supabase
      .from("cobrancas")
      .select("id, org_id, aluno_id, asaas_id, status, valor, descricao")
      .eq("id", cobranca_id)
      .maybeSingle();
    if (cobErr || !cobranca) return json({ error: "not_found" }, 404);
    if (!["PENDING", "OVERDUE"].includes(cobranca.status)) {
      return json({ error: "Esta cobrança não está mais disponível para pagamento." }, 409);
    }
    if (!cobranca.asaas_id) return json({ error: "Cobrança sem referência de pagamento válida." }, 500);

    // ── 2. Cliente Asaas — deve já existir (criado quando o treinador gerou
    // a cobrança em asaas-create-charge). Sem criação às cegas aqui: quem
    // preenche o cartão pode ser pessoa diferente do aluno cadastrado. ──────
    const { data: aluno } = await supabase
      .from("alunos")
      .select("user_id, telefone")
      .eq("id", cobranca.aluno_id)
      .maybeSingle();
    if (!aluno?.user_id) return json({ error: "Aluno não encontrado." }, 500);

    const { data: { user: alunoUser } } = await supabase.auth.admin.getUserById(aluno.user_id);
    const alunoEmail = alunoUser?.email ?? "";
    if (!alunoEmail) return json({ error: "E-mail do aluno não encontrado." }, 500);

    // ── 3. Paga a cobrança existente com cartão tokenizado ───────────────────
    const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip") ?? "";

    const payRes = await fetch(`${ASAAS_BASE}/payments/${cobranca.asaas_id}/payWithCreditCard`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
      body: JSON.stringify({
        creditCard: {
          holderName: card_holder_name,
          number: String(card_number).replace(/\D/g, ""),
          expiryMonth: String(card_exp_month).padStart(2, "0"),
          expiryYear: String(card_exp_year),
          ccv: String(card_ccv),
        },
        creditCardHolderInfo: {
          name: card_holder_name,
          email: alunoEmail,
          cpfCnpj: String(card_holder_cpf).replace(/\D/g, ""),
          postalCode: String(cardCep).replace(/\D/g, ""),
          addressNumber: cardAddressNumber,
          ...(cardAddressComplement ? { addressComplement: cardAddressComplement } : {}),
          phone: (aluno.telefone ?? "").replace(/\D/g, ""),
        },
        ...(remoteIp ? { remoteIp } : {}),
      }),
    });

    const payment = await payRes.json();
    if (!payRes.ok || payment.errors) {
      const msg = payment.errors?.[0]?.description ?? "Pagamento recusado. Confira os dados do cartão.";
      return json({ error: msg }, 402);
    }

    return json({ ok: true, status: payment.status ?? "PENDING" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pagar-cobranca-cartao]", msg);
    return json({ error: "Erro ao processar o pagamento." }, 500);
  }
});
