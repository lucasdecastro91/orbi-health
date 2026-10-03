// testar-alerta — dispara os alertas de risco de cartão (volume + chargeback)
// em MODO TESTE pra contato@orbihealth.com.br, com o mesmo código do
// asaas-webhook (_shared/adminAlert.ts). Serve pra provar que o alerta chega
// sem precisar de venda real nem de chargeback de verdade.
//
// Protegida por um token aleatório guardado SÓ no banco (internal_secrets,
// RLS sem policies). Quem dispara é o próprio banco via pg_net, lendo o token
// da tabela — o token nunca sai do Postgres:
//
//   select net.http_post(
//     url := '<SUPABASE_URL>/functions/v1/testar-alerta',
//     body := '{"org_id":"<org com subconta aprovada>"}'::jsonb,
//     headers := jsonb_build_object('Content-Type','application/json',
//       'x-test-token', (select value from internal_secrets where name = 'testar_alerta_token')));
//
// Modo teste: ignora o mínimo de R$ 3.000 e o dedup, não grava
// notification_logs, assunto com "[TESTE]". Nenhum dado é alterado.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { maybeAlertCardVolume, alertChargeback } from "../_shared/adminAlert.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = req.headers.get("x-test-token") ?? "";
  const { data: secret, error: secretErr } = await supabase
    .from("internal_secrets").select("value").eq("name", "testar_alerta_token").maybeSingle();
  if (secretErr) { console.error("[testar-alerta] internal_secrets:", secretErr.message); return json({ error: "internal" }, 500); }
  if (!secret?.value || token.length < 32 || token !== secret.value) return json({ error: "Unauthorized" }, 401);

  let orgId = "";
  try { orgId = String((await req.json())?.org_id ?? ""); } catch { /* corpo vazio */ }
  if (!orgId) return json({ error: "org_id ausente" }, 400);

  const volume = await maybeAlertCardVolume(supabase, orgId, { test: true });
  const chargeback = await alertChargeback(supabase, "PAYMENT_CHARGEBACK_REQUESTED", {
    id: "pay_TESTE_ORBI",
    value: 123.45,
    chargeback: { reason: "Disparo de teste — nenhum chargeback real" },
  }, { test: true });

  return json({ volume, chargeback });
});
