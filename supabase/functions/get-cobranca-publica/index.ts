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
      .select("id, org_id, aluno_id, descricao, valor, status, forma_pagamento, data_vencimento, pix_key, installment_count, asaas_id, plano_id")
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

    // Cobrança "adiada" — nasceu vinculada a um Plano, mas ainda sem asaas_id
    // (ninguém pagou/escolheu nada ainda). Devolve as opções do Plano (Pix +
    // parcelas) pro checkout renderizar o seletor, e se o aluno já tem
    // cliente Asaas cadastrado (pra decidir se pede CPF ou não) — sem nunca
    // expor aluno_id/asaas_id pro cliente.
    let opcoes: { pix_value: number | null; installment_options: unknown[] } | null = null;
    let cpf_on_file = false;
    if (!cobranca.asaas_id && cobranca.plano_id) {
      const { data: plano } = await supabase
        .from("plans")
        .select("pix_value, installment_options")
        .eq("id", cobranca.plano_id)
        .maybeSingle();
      if (plano) {
        opcoes = { pix_value: plano.pix_value, installment_options: plano.installment_options ?? [] };
      }

      const { data: existingCust } = await supabase
        .from("asaas_customers_alunos")
        .select("asaas_id")
        .eq("aluno_id", cobranca.aluno_id)
        .maybeSingle();
      cpf_on_file = !!existingCust?.asaas_id;
    }

    return new Response(JSON.stringify({
      descricao:       cobranca.descricao,
      valor:           cobranca.valor,
      status:          cobranca.status,
      forma_pagamento: cobranca.forma_pagamento,
      data_vencimento: cobranca.data_vencimento,
      pix_key:         cobranca.pix_key,
      installment_count: cobranca.installment_count ?? 1,
      aguardando_escolha: !cobranca.asaas_id,
      opcoes,
      cpf_on_file,
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
