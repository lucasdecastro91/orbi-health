// solicitar-saque-asaas — dispara uma transferência real (Pix) do saldo da
// subconta do treinador pra chave Pix cadastrada por ele. ATENÇÃO: chama a
// Asaas em produção (ASAAS_ENVIRONMENT), move dinheiro de verdade — não é
// reversível como um update de banco comum.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";
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

  const { organization_id, value } = await req.json();
  const numericValue = Number(value);
  if (!organization_id || !numericValue || numericValue <= 0) {
    return json({ error: "Valor inválido" }, 400);
  }

  // Fail-closed: só o dono da org pode sacar o saldo dela
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, owner_id")
    .eq("id", organization_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (orgErr || !org) return json({ error: "forbidden_not_owner" }, 403);

  const { data: sub, error: subErr } = await supabase
    .from("asaas_subaccounts")
    .select("status, api_key, pix_key, pix_key_type")
    .eq("org_id", organization_id)
    .maybeSingle();
  if (subErr || !sub) return json({ error: "Você ainda não tem uma conta criada." }, 400);
  if (sub.status !== "aprovado") {
    return json({ error: "Sua conta ainda está em verificação." }, 403);
  }
  if (!sub.pix_key || !sub.pix_key_type) {
    return json({ error: "Cadastre uma chave Pix antes de solicitar saque." }, 400);
  }

  try {
    // Confere o saldo real antes de sacar — nunca confiar só no valor que o
    // client mandou. Comparação em centavos pra evitar erro de ponto
    // flutuante (ex: 0.1 + 0.2 !== 0.3 em JS).
    const balanceRes = await fetch(`${ASAAS_BASE}/finance/balance`, {
      headers: { "access_token": sub.api_key },
    });
    if (!balanceRes.ok) {
      const errBody = await balanceRes.text();
      console.error("[solicitar-saque-asaas] falha ao ler saldo:", balanceRes.status, errBody);
      return json({ error: "Não foi possível confirmar seu saldo. Tente novamente." }, 502);
    }
    const balanceData = await balanceRes.json();
    const balanceCents = Math.round(Number(balanceData?.balance ?? 0) * 100);
    const requestedCents = Math.round(numericValue * 100);
    if (requestedCents > balanceCents) {
      return json({ error: "Saldo insuficiente pra esse valor." }, 400);
    }

    const transferRes = await fetch(`${ASAAS_BASE}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": sub.api_key },
      body: JSON.stringify({
        value: numericValue,
        operationType: "PIX",
        pixAddressKey: sub.pix_key,
        pixAddressKeyType: sub.pix_key_type,
        description: "Saque ORBI Pay",
      }),
    });

    const transferBody = await transferRes.json();

    if (!transferRes.ok) {
      console.error("[solicitar-saque-asaas] Asaas error:", transferRes.status, transferBody);
      await supabase.from("asaas_subaccount_withdrawals").insert({
        org_id: organization_id,
        value: numericValue,
        pix_key: sub.pix_key,
        pix_key_type: sub.pix_key_type,
        status: "failed",
        fail_reason: transferBody?.errors?.[0]?.description ?? "Falha na Asaas",
      });
      return json({ error: transferBody?.errors?.[0]?.description ?? "Falha ao solicitar saque." }, 502);
    }

    const { error: insertErr } = await supabase.from("asaas_subaccount_withdrawals").insert({
      org_id: organization_id,
      asaas_transfer_id: transferBody.id,
      value: numericValue,
      pix_key: sub.pix_key,
      pix_key_type: sub.pix_key_type,
      status: String(transferBody.status ?? "pending").toLowerCase(),
      fail_reason: transferBody.failReason ?? null,
    });
    if (insertErr) console.error("[solicitar-saque-asaas] insert falhou (transferência já foi feita):", insertErr);

    return json({ success: true, status: transferBody.status, id: transferBody.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[solicitar-saque-asaas]", message, err);
    return json({ error: "Erro inesperado ao solicitar saque." }, 500);
  }
});
