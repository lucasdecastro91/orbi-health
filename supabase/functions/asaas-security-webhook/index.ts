// asaas-security-webhook — recebe o "mecanismo de validação de saque via
// webhooks" da Asaas (Menu do usuário > Integrações > Mecanismos de
// segurança). Configurado UMA VEZ na conta master, herda automaticamente
// pra todas as subcontas — substitui o código SMS/app por uma aprovação
// automática daqui, sem o treinador nunca precisar entrar no painel da Asaas.
//
// Fluxo (ver docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks):
// 1. solicitar-saque-asaas pede a transferência e grava em
//    asaas_subaccount_withdrawals com o asaas_transfer_id retornado.
// 2. ~5s depois a Asaas chama este endpoint com { type, transfer }.
// 3. Só aprovamos se existir uma linha PENDING nossa com esse exato
//    asaas_transfer_id e valor — qualquer coisa que não reconhecemos (ou
//    tipo de operação que ainda não usamos) é recusada por padrão.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_SECURITY_WEBHOOK_TOKEN = Deno.env.get("ASAAS_SECURITY_WEBHOOK_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function refuse(reason: string) {
  console.error("[asaas-security-webhook] refused:", reason);
  return json({ status: "REFUSED", refuseReason: reason });
}

serve(async (req) => {
  // Token separado do ASAAS_WEBHOOK_TOKEN (webhook de eventos comuns) —
  // esse aqui aprova movimentação real de dinheiro, então fica isolado.
  const token = req.headers.get("asaas-access-token") ?? "";
  if (ASAAS_SECURITY_WEBHOOK_TOKEN && token !== ASAAS_SECURITY_WEBHOOK_TOKEN) {
    return json({ error: "invalid token" }, 401);
  }

  let payload: { type?: string; transfer?: { id?: string; value?: number } };
  try {
    payload = await req.json();
  } catch {
    return refuse("payload inválido");
  }

  // Só validamos saques (TRANSFER) — qualquer outro tipo de ação crítica
  // (BILL, PIX_QR_CODE, etc.) ainda não tem lógica de aprovação nossa, então
  // recusa por padrão em vez de aprovar algo que não conferimos.
  if (payload.type !== "TRANSFER" || !payload.transfer?.id) {
    return refuse("tipo de operação não reconhecido");
  }

  const { data: withdrawal } = await supabase
    .from("asaas_subaccount_withdrawals")
    .select("id, value, status")
    .eq("asaas_transfer_id", payload.transfer.id)
    .maybeSingle();

  if (!withdrawal) {
    return refuse("transferência não encontrada nos nossos registros");
  }
  if (withdrawal.status !== "pending") {
    return refuse(`saque já está com status '${withdrawal.status}'`);
  }
  const expectedCents = Math.round(Number(withdrawal.value) * 100);
  const receivedCents = Math.round(Number(payload.transfer.value ?? 0) * 100);
  if (expectedCents !== receivedCents) {
    return refuse("valor da transferência não bate com o registro");
  }

  return json({ status: "APPROVED" });
});
