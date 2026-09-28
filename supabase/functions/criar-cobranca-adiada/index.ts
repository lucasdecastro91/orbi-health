// criar-cobranca-adiada — cria uma cobrança SEM criar nada no Asaas ainda
// (asaas_id fica null). O aluno escolhe Pix ou parcela (e preenche CPF, se
// for a primeira vez) depois, em /pagar/:id — só nesse momento o pagamento
// nasce de verdade no Asaas (ver escolher-pagamento-cobranca/index.ts).
//
// status continua 'PENDING' (não criamos um status novo): o sinal de
// "aguardando escolha" é asaas_id IS NULL. Isso é proposital — assim
// alertar_cobrancas_vencendo() (D-30/D-15/D-7/vencida, treinador + aluno,
// já manda o link /pagar/:id) continua funcionando sem nenhuma alteração.
//
// Chamada de dois lugares: Financeiro.tsx (treinador gera cobrança a partir
// de um Plano) e StudentDetails.tsx (ao salvar/renovar o "Plano do aluno",
// já deixa a cobrança da próxima renovação pronta com bastante antecedência).
// Só cria cobrança pra Plano de verdade (com installment_options) — cobrança
// de valor avulso (sem Plano) continua indo direto por asaas-create-charge,
// sem passar por aqui.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL          = Deno.env.get("APP_URL") ?? "https://app.orbihealth.com.br";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const fmtBRL = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { aluno_id, org_id, plano_id, descricao, vencimento } = body;
    if (!aluno_id || !org_id || !plano_id || !descricao || !vencimento) {
      throw new Error("Campos obrigatórios ausentes");
    }

    const treinador_id = user.id;

    const { data: aluno, error: alunoErr } = await supabase
      .from("alunos")
      .select("id, user_id, treinador_id")
      .eq("id", aluno_id)
      .eq("treinador_id", treinador_id)
      .single();
    if (alunoErr || !aluno) throw new Error("Aluno não encontrado ou sem permissão");

    const { data: plano, error: planoErr } = await supabase
      .from("plans")
      .select("id, name, pix_value, trainer_id")
      .eq("id", plano_id)
      .eq("trainer_id", treinador_id)
      .maybeSingle();
    if (planoErr || !plano) throw new Error("Plano não encontrado ou sem permissão");

    // Dedup: já existe cobrança aberta (aguardando escolha ou aguardando
    // pagamento) pra esse aluno, mesmo plano, mesmo vencimento? Não duplica.
    const { data: existing } = await supabase
      .from("cobrancas")
      .select("*")
      .eq("aluno_id", aluno_id)
      .eq("plano_id", plano_id)
      .eq("data_vencimento", vencimento)
      .in("status", ["PENDING", "OVERDUE"])
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, cobranca: existing, ja_existia: true }), {
        headers: { ...cors, "Content-Type": "application/json" }, status: 200,
      });
    }

    const { data: cobranca, error: cobErr } = await supabase
      .from("cobrancas")
      .insert({
        org_id,
        aluno_id,
        treinador_id,
        descricao,
        asaas_id:        null,
        forma_pagamento: "PIX",
        valor:           Number(plano.pix_value ?? 0),
        status:          "PENDING",
        data_vencimento: vencimento,
        plano_id,
        installment_count: 1,
      })
      .select()
      .single();
    if (cobErr) throw cobErr;

    // ── Notificação pro aluno — sino + push + e-mail. Sem WhatsApp: integração
    // desligada projeto-wide (número já sofreu restrição leve) — fluxos novos
    // não devem adicionar sendWhatsapp até a API oficial entrar. ──────────────
    if (aluno.user_id) {
      const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", org_id).maybeSingle();
      const { data: { user: alunoUser } } = await supabase.auth.admin.getUserById(aluno.user_id);
      const email = alunoUser?.email ?? "";
      const { data: profile } = await supabase.from("profiles").select("nome").eq("id", aluno.user_id).maybeSingle();
      const name = profile?.nome ?? email ?? "Aluno";

      const dateFmt = fmtDate(vencimento);
      const valorFmt = fmtBRL(Number(plano.pix_value ?? 0));
      const paymentLink = `${APP_URL}/pagar/${cobranca.id}`;
      const titulo = "Hora de renovar seu plano";
      const mensagem = `${plano.name} — a partir de ${valorFmt} — vence em ${dateFmt}. Escolha Pix ou parcelamento no link.`;

      await supabase.from("notificacoes").insert({
        user_id: aluno.user_id, org_id, titulo, mensagem, tipo: "financeiro", link: paymentLink,
      });

      const pushPromise = supabase.functions.invoke("send-push", {
        body: { user_ids: [aluno.user_id], title: titulo, body: mensagem, tag: "cobranca_gerada", url: paymentLink },
      }).catch((e) => console.error("[criar-cobranca-adiada] push falhou:", e instanceof Error ? e.message : e));

      const emailPromise = email
        ? supabase.functions.invoke("enviar-email", {
            body: { type: "cobranca_gerada", to: email, nome: name, orgName: orgRow?.name ?? "sua plataforma", descricao: plano.name, valorFmt, dateFmt, link: paymentLink },
          }).catch((e) => console.error("[criar-cobranca-adiada] email falhou:", e instanceof Error ? e.message : e))
        : Promise.resolve();

      await Promise.all([pushPromise, emailPromise]);
    }

    return new Response(JSON.stringify({ success: true, cobranca }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 200,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[criar-cobranca-adiada]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
