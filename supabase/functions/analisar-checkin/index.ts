/**
 * analisar-checkin — gera relatório de evolução via Claude após cada check-in.
 *
 * Env vars necessárias:
 *   ANTHROPIC_API_KEY          — chave da API da Anthropic
 *   SUPABASE_URL               — URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (bypassa RLS)
 */

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REST              = `${SUPABASE_URL}/rest/v1`;

const H = {
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey":        SERVICE_KEY,
  "Content-Type":  "application/json",
};

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

const SYSTEM_PROMPT = `Você é um assistente especializado em análise de evolução de atletas e praticantes de musculação. Analise os dados do check-in abaixo e gere um relatório estruturado em português brasileiro para o personal trainer/nutricionista responsável.

O relatório deve conter:
1. RESUMO GERAL — síntese da evolução do aluno nesse período
2. PONTOS POSITIVOS — o que está funcionando bem
3. PONTOS DE ATENÇÃO — o que precisa de ajuste
4. SUGESTÕES DE AJUSTE — recomendações específicas para treino, dieta e aderência
5. MENSAGEM MOTIVACIONAL — mensagem curta para enviar ao aluno (tom encorajador)

Seja objetivo, profissional e baseie-se apenas nos dados fornecidos. Use emojis discretamente para tornar o relatório mais visual. Cada seção deve ter no máximo 3-4 frases.`;

const ratingLabel = (v: number | null) =>
  v ? ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"][v] ?? `${v}/5` : "Não informado";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  try {
    const { checkin_id } = await req.json();
    if (!checkin_id) return json({ error: "checkin_id is required" }, 400);

    // 1. Busca o check-in no banco
    const ciRes = await fetch(
      `${REST}/check_ins?id=eq.${checkin_id}&select=*`,
      { headers: { ...H, Accept: "application/json" } }
    );
    const ciData = await ciRes.json();
    if (!Array.isArray(ciData) || ciData.length === 0) {
      return json({ error: "Check-in não encontrado" }, 404);
    }
    const ci = ciData[0];

    // 2. Busca nome do aluno
    let nomeAluno = "Aluno";
    try {
      const profRes = await fetch(
        `${REST}/profiles?id=eq.${ci.student_id}&select=nome`,
        { headers: { ...H, Accept: "application/json" } }
      );
      const profData = await profRes.json();
      if (profData?.[0]?.nome) nomeAluno = profData[0].nome;
    } catch {}

    // 3. Busca histórico recente de pesos (últimos 5 check-ins)
    let historicoMsg = "";
    try {
      const histRes = await fetch(
        `${REST}/check_ins?student_id=eq.${ci.student_id}&weight=not.is.null&order=created_at.desc&limit=5&select=weight,created_at`,
        { headers: { ...H, Accept: "application/json" } }
      );
      const histData = await histRes.json();
      if (Array.isArray(histData) && histData.length > 1) {
        const entries = histData.map((h: any) =>
          `${new Date(h.created_at).toLocaleDateString("pt-BR")}: ${h.weight} kg`
        );
        historicoMsg = `\nHistórico recente de peso: ${entries.join(" | ")}`;
      }
    } catch {}

    // 4. Monta o prompt com os dados do check-in
    const dataFormatada = new Date(ci.created_at).toLocaleDateString("pt-BR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const userMessage = `Check-in de ${nomeAluno} em ${dataFormatada}:

**Peso atual:** ${ci.weight ? `${ci.weight} kg` : "Não informado"}${historicoMsg}

**Avaliação do treino:** ${ratingLabel(ci.treino_avaliacao)}
${ci.treino_obs ? `Observação sobre treino: "${ci.treino_obs}"` : ""}

**Avaliação da alimentação:** ${ratingLabel(ci.dieta_avaliacao)}
${ci.dieta_obs ? `Observação sobre alimentação: "${ci.dieta_obs}"` : ""}

**Aderência geral à consultoria:** ${ratingLabel(ci.aderencia)}
${ci.obs_geral ? `Mensagem do aluno: "${ci.obs_geral}"` : ""}

Gere o relatório estruturado conforme solicitado.`;

    // 5. Chama a API da Anthropic
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-5",
        max_tokens: 1500,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", errBody);
      return json({ error: "Falha na API da Anthropic", details: errBody }, 502);
    }

    const anthropicData = await anthropicRes.json();
    const relatorio = anthropicData?.content?.find((c: any) => c.type === "text")?.text;

    if (!relatorio) {
      return json({ error: "Resposta vazia da IA" }, 502);
    }

    // 6. Salva o relatório no check-in
    await fetch(
      `${REST}/check_ins?id=eq.${checkin_id}`,
      {
        method:  "PATCH",
        headers: { ...H, Prefer: "return=minimal" },
        body:    JSON.stringify({
          relatorio_ia:         relatorio,
          relatorio_gerado_em:  new Date().toISOString(),
          relatorio_visualizado: false,
        }),
      }
    );

    return json({ ok: true, relatorio });

  } catch (e: any) {
    console.error("analisar-checkin error:", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
