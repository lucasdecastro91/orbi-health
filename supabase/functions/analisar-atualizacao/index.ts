/**
 * analisar-atualizacao — gera relatório de evolução via Claude a partir de uma
 * resposta de Atualização. Sucessora do analisar-checkin (ver seção 15 do
 * CLAUDE.md): a diferença é que o formulário de Atualização é configurável por
 * org, então aqui os campos são lidos dinamicamente em vez de colunas fixas.
 *
 * A IA responde em JSON estruturado (não markdown livre) porque o relatório
 * interno (pra leitura do treinador, terceira pessoa, termos técnicos) e a
 * mensagem de feedback (pra mandar pro aluno, segunda pessoa, sem jargão) têm
 * registros diferentes e precisam ficar em colunas separadas — não dá pra
 * extrair uma da outra de forma confiável a partir de texto livre.
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

const SYSTEM_PROMPT = `Você é um assistente especializado em análise de evolução de atletas e praticantes de musculação. Analise as respostas do formulário de atualização abaixo (os campos variam por treinador, baseie-se só no que foi respondido) e responda APENAS com um objeto JSON válido, sem markdown, sem texto antes ou depois, exatamente neste formato:

{
  "resumo_geral": "string",
  "pontos_positivos": ["string", "..."],
  "pontos_atencao": ["string", "..."],
  "sugestoes_ajuste": ["string", "..."],
  "mensagem_feedback": "string"
}

Regras:
- "resumo_geral", "pontos_positivos", "pontos_atencao", "sugestoes_ajuste": leitura TÉCNICA para o treinador — pode citar números, comparações, terminologia de treino/dieta. Cada array com 1 a 4 itens curtos (1 frase cada).
- "mensagem_feedback": mensagem calorosa e direta, em SEGUNDA PESSOA ("você"), PRONTA para ser enviada como está diretamente ao próprio aluno como feedback do treinador — sem jargão técnico, sem citar "pontos de atenção" ou qualquer nota interna, focada em reconhecimento e no próximo passo. Não mencione que é uma análise automática ou gerada por IA. 2 a 4 frases, emojis discretos.
- Se as respostas forem poucas ou genéricas, seja honesto sobre essa limitação em "resumo_geral" e ainda assim escreva uma "mensagem_feedback" breve e genuína.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  try {
    const { resposta_id } = await req.json();
    if (!resposta_id) return json({ error: "resposta_id is required" }, 400);

    // 1. Busca a resposta
    const respRes = await fetch(
      `${REST}/atualizacao_respostas?id=eq.${resposta_id}&select=*`,
      { headers: { ...H, Accept: "application/json" } }
    );
    const respData = await respRes.json();
    if (!Array.isArray(respData) || respData.length === 0) {
      return json({ error: "Resposta não encontrada" }, 404);
    }
    const resp = respData[0];

    // 2. Busca nome do aluno
    let nomeAluno = "Aluno";
    try {
      const profRes = await fetch(
        `${REST}/profiles?id=eq.${resp.student_id}&select=nome`,
        { headers: { ...H, Accept: "application/json" } }
      );
      const profData = await profRes.json();
      if (profData?.[0]?.nome) nomeAluno = profData[0].nome;
    } catch {}

    // 3. Busca os valores respondidos + label/tipo/ordem do campo
    const valRes = await fetch(
      `${REST}/atualizacao_resposta_valores?resposta_id=eq.${resposta_id}&select=valor_texto,valor_numero,valor_opcoes,atualizacao_form_campos(label,tipo,ordem)`,
      { headers: { ...H, Accept: "application/json" } }
    );
    const valData = await valRes.json();

    const linhas = (Array.isArray(valData) ? valData : [])
      .filter((v: any) => v.atualizacao_form_campos)
      .sort((a: any, b: any) => (a.atualizacao_form_campos.ordem ?? 0) - (b.atualizacao_form_campos.ordem ?? 0))
      .map((v: any) => {
        const campo = v.atualizacao_form_campos;
        let valor = "";
        if (campo.tipo === "number") valor = v.valor_numero != null ? String(v.valor_numero) : "";
        else if (campo.tipo === "checkbox") valor = Array.isArray(v.valor_opcoes) ? v.valor_opcoes.join(", ") : "";
        else valor = v.valor_texto ?? "";
        return valor.trim() ? `${campo.label}: ${valor}` : null;
      })
      .filter(Boolean);

    if (linhas.length === 0) {
      return json({ error: "Essa atualização não tem respostas suficientes para gerar uma análise" }, 400);
    }

    // 4. Monta o prompt com as respostas
    const dataFormatada = new Date(resp.submitted_at).toLocaleDateString("pt-BR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const userMessage = `Atualização de ${nomeAluno} em ${dataFormatada}:

${linhas.join("\n")}

Responda só com o JSON conforme solicitado.`;

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
    const rawText = anthropicData?.content?.find((c: any) => c.type === "text")?.text;

    if (!rawText) {
      return json({ error: "Resposta vazia da IA" }, 502);
    }

    // 6. Faz o parse do JSON — a IA às vezes envolve em ```json apesar da instrução,
    //    então tira o code fence antes de tentar.
    const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    let parsed: {
      resumo_geral: string;
      pontos_positivos: string[];
      pontos_atencao: string[];
      sugestoes_ajuste: string[];
      mensagem_feedback: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Falha ao parsear JSON da IA:", rawText);
      return json({ error: "Não foi possível interpretar a resposta da IA. Tente regenerar." }, 502);
    }

    const bullet = (arr: unknown) => Array.isArray(arr) && arr.length
      ? arr.map((s) => `• ${s}`).join("\n")
      : "—";

    const relatorio = `RESUMO GERAL
${parsed.resumo_geral ?? "—"}

PONTOS POSITIVOS
${bullet(parsed.pontos_positivos)}

PONTOS DE ATENÇÃO
${bullet(parsed.pontos_atencao)}

SUGESTÕES DE AJUSTE
${bullet(parsed.sugestoes_ajuste)}`;

    // 7. Salva o relatório + a mensagem de feedback separadamente
    await fetch(
      `${REST}/atualizacao_respostas?id=eq.${resposta_id}`,
      {
        method:  "PATCH",
        headers: { ...H, Prefer: "return=minimal" },
        body:    JSON.stringify({
          relatorio_ia:        relatorio,
          mensagem_feedback:   parsed.mensagem_feedback ?? null,
          relatorio_gerado_em: new Date().toISOString(),
        }),
      }
    );

    return json({ ok: true, relatorio, mensagem_feedback: parsed.mensagem_feedback ?? null });

  } catch (e: any) {
    console.error("analisar-atualizacao error:", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
