// deno-lint-ignore-file no-explicit-any
/**
 * parse-training-pdf — Edge Function
 *
 * Recebe um ou mais PDFs/imagens (JSON: { files: [{ base64, mediaType }, ...] }
 * ou multipart/form-data com múltiplos campos "file"), envia todos juntos pra
 * API da Anthropic e retorna o JSON estruturado do plano de treino extraído
 * (semanas → treinos → exercícios). Mesmo padrão de supabase/functions/parse-diet-pdf.
 *
 * O vínculo com a biblioteca de exercícios (exercicios_base) NÃO acontece
 * aqui — essa função só extrai o texto/estrutura. O matching (match_exercicio,
 * fuzzy) acontece no client, exercício por exercício, depois da extração.
 */

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body: any, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: new Headers({ ...corsHeaders }),
  });
}

const SYSTEM_PROMPT = `Você é um assistente especializado em educação física. Analise o(s) documento(s)/imagem(ns) do plano de treino fornecido — pode ser um único documento ou várias páginas/prints do MESMO plano (nesse caso, combine tudo num só resultado coeso, sem duplicar treinos que aparecerem repetidos por sobreposição entre as imagens). Extraia as informações estruturadas.
Retorne APENAS um JSON válido, sem texto adicional, no seguinte formato:

{
  "nome_plano": "nome do plano (ex: 'Hipertrofia 4x' ou algo genérico se não houver título)",
  "objetivo": "objetivo do plano ou null",
  "semanas": [
    {
      "numero_semana": 1,
      "zona_reps": "faixa de repetições geral do bloco (ex: '8-12') ou null",
      "observacoes": "observações do bloco/semana ou null",
      "treinos": [
        {
          "dia_semana": "dia da semana OU identificador do treino, exatamente como está no documento (ex: 'Segunda-feira', 'Treino A', 'Treino de Peito')",
          "titulo_treino": "título curto do treino (ex: 'Peito e Tríceps') ou repita o identificador se não houver título separado",
          "descricao_geral": "observações gerais do treino do dia ou null",
          "exercicios": [
            {
              "nome_exercicio": "nome do exercício exatamente como escrito no documento",
              "carga": "carga/peso mencionado, como texto, ou null se não houver",
              "descanso": "tempo de descanso entre séries, como texto (ex: '60s', '1min30') ou null",
              "observacoes": "observação específica do exercício (técnica, cadência etc.) ou null",
              "conjugado_com_proximo": false,
              "blocos": [
                {
                  "tipo": "warm-up | feeder | trabalho | cluster | drop-set | rest-pause | muscle-round",
                  "quantidade": 3,
                  "repeticoes": "faixa ou número de repetições desse bloco, como texto (ex: '10-12', '8', 'até a falha')",
                  "observacoes": "nota específica desse bloco (ex: '10% de aumento') ou null"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Regras:
- Preserve os nomes dos exercícios exatamente como estão escritos no documento (não traduza, não abrevie, não corrija).
- Se o documento não organiza o plano em "semanas"/blocos explícitos, use uma única entrada em "semanas" com numero_semana: 1 cobrindo todos os treinos.
- "blocos" — MUITO IMPORTANTE: quando o documento lista séries em segmentos separados por "/" com contagens/reps diferentes (ex: "1x 15 / 1x 2-4 / 2x 6-9 / 1x 6"), cada segmento "NxR" vira um bloco SEPARADO em "blocos", na mesma ordem em que aparecem — nunca some tudo num bloco só.
  - "quantidade" de cada bloco é o número antes do "x" nesse segmento (ex: "2x 6-9" → quantidade 2).
  - "tipo" de cada bloco: identifique por palavras-chave próximas ao segmento (mesmo que a palavra apareça só uma vez pra um grupo de segmentos, ou entre parênteses depois do número) — "warm-up"/"aquecimento" → "warm-up"; "feeder"/"aproximação" → "feeder"; "work set"/"trabalho" (ou nenhuma palavra-chave) → "trabalho"; "cluster" → "cluster"; "drop-set" → "drop-set"; "rest-pause" → "rest-pause"; "muscle round" → "muscle-round". Se nada for indicado pra um segmento, use "trabalho".
  - Se o documento não separa em segmentos (só um número de séries e uma faixa de reps pro exercício inteiro, ex: "4x 6-9"), use um único bloco com tipo "trabalho".
  - Uma observação entre parênteses junto de um segmento específico (ex: "1x 6 (cluster set 10% de aumento)") vira a "observacoes" DAQUELE bloco, não do exercício inteiro.
- "conjugado_com_proximo": true APENAS quando o documento indica explicitamente que esse exercício é feito em bi-set/superset/conjugado junto com o PRÓXIMO exercício da lista (sem pausa entre eles) — na dúvida, use false.
- Não invente exercícios, cargas ou observações que não estejam no documento — quando a informação não existir, use null.
- Retorne SOMENTE o JSON, sem markdown, sem \`\`\`json, sem explicações`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    let filesToSend: { base64: string; mediaType: string }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const entries = formData.getAll("file") as File[];
      if (!entries.length) {
        return jsonResponse({ error: "Campo 'file' não encontrado" }, { status: 400 });
      }
      for (const file of entries) {
        const mediaType = file.type && file.type !== "" ? file.type : "application/pdf";
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
        }
        filesToSend.push({ base64: btoa(binary), mediaType });
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      if (Array.isArray(body.files) && body.files.length > 0) {
        filesToSend = body.files;
      } else if (body.base64 && body.mediaType) {
        filesToSend = [{ base64: body.base64, mediaType: body.mediaType }];
      } else {
        return jsonResponse({ error: "Campo 'files' (array) ou 'base64'+'mediaType' obrigatórios" }, { status: 400 });
      }
    } else {
      return jsonResponse({ error: "Content-Type deve ser multipart/form-data ou application/json" }, { status: 400 });
    }

    const contentBlocks = filesToSend.map((f) => {
      const isImage = f.mediaType.startsWith("image/");
      return {
        type: isImage ? "image" : "document",
        source: {
          type: "base64",
          media_type: f.mediaType,
          data: f.base64,
        },
      };
    });

    const isMultiple = filesToSend.length > 1;
    const instructionText = isMultiple
      ? "Estas imagens/documentos são partes do MESMO plano de treino (ex: prints sequenciais de uma tela que não coube inteira). Combine tudo num só resultado, extraia o plano estruturado e retorne o JSON conforme instruído."
      : (filesToSend[0].mediaType.startsWith("image/")
          ? "Extraia o plano de treino estruturado deste print/imagem e retorne o JSON conforme instruído."
          : "Extraia o plano de treino estruturado deste documento e retorne o JSON conforme instruído.");

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              ...contentBlocks,
              { type: "text", text: instructionText },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return jsonResponse(
        { error: `Anthropic API error: ${anthropicResponse.status}`, details: errText },
        { status: 502 }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData?.content?.find((c: any) => c.type === "text")?.text ?? "";

    let parsed: any;
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      return jsonResponse(
        { error: "IA retornou resposta inválida (não é JSON)", raw: rawText },
        { status: 422 }
      );
    }

    return jsonResponse({ ok: true, plano: parsed });
  } catch (e: any) {
    return jsonResponse(
      { error: e?.message ?? "internal_error" },
      { status: 500 }
    );
  }
});
