// get-cobranca-publica — endpoint público (sem auth) usado pela página de
// checkout /pagar/:id. Devolve só os campos necessários pra renderizar a
// cobrança (nunca a linha inteira — trainer_id/aluno_id/asaas_id ficam de fora,
// fail-closed se o id não existir). Mesmo espírito de get_org_leaderboard_profiles:
// nenhuma policy de RLS nova, tudo passa por aqui via service role.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  try {
    const { cobranca_id } = await req.json();
    if (!cobranca_id) {
      return new Response(JSON.stringify({ error: "cobranca_id ausente" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: cobranca, error: cobErr } = await supabase
      .from("cobrancas")
      .select("id, org_id, descricao, valor, status, forma_pagamento, data_vencimento, pix_key")
      .eq("id", cobranca_id)
      .maybeSingle();

    if (cobErr || !cobranca) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug, logo_url, primary_color, theme")
      .eq("id", cobranca.org_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      descricao:       cobranca.descricao,
      valor:           cobranca.valor,
      status:          cobranca.status,
      forma_pagamento: cobranca.forma_pagamento,
      data_vencimento: cobranca.data_vencimento,
      pix_key:         cobranca.pix_key,
      org_nome:        org?.name ?? "ORBI Health",
      org_slug:        org?.slug ?? null,
      org_logo_url:    org?.logo_url ?? null,
      org_cor:         org?.primary_color ?? "#16a34a",
      org_tema:        org?.theme ?? "dark",
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-cobranca-publica]", msg);
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
