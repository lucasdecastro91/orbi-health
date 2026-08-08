// deno-lint-ignore-file no-explicit-any
/**
 * parse-diet-pdf — Edge Function
 *
 * Recebe um PDF ou uma imagem/print (multipart/form-data, campo "file"),
 * envia para a API da Anthropic
 * e retorna o JSON estruturado da dieta extraída.
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

const SYSTEM_PROMPT = `Você é um assistente especializado em nutrição. Analise o plano alimentar fornecido e extraia as informações estruturadas.
Retorne APENAS um JSON válido, sem texto adicional, no seguinte formato:

{
  "title": "nome do plano ou dieta",
  "calories": 0,
  "meals": [
    {
      "name": "nome da refeição",
      "time_suggestion": "horário sugerido ou null",
      "notes": "observações da refeição ou null",
      "order_index": 0,
      "foods": [
        {
          "name": "nome do alimento",
          "portion": "porção com unidade ou null",
          "substitution_group_id": null,
          "order_index": 0
        }
      ]
    }
  ]
}

Regras:
- Preserve os nomes dos alimentos exatamente como estão no documento
- Se houver calorias totais mencionadas, extraia o número inteiro; caso contrário use 0
- Se não houver horário para a refeição, use null
- Se não houver observações para a refeição, use null
- order_index começa em 0 e incrementa para cada refeição e para cada alimento dentro de cada refeição
- substitution_group_id deve ser sempre null (será vinculado manualmente depois)
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

    let pdfBase64: string;
    let mediaType = "application/pdf";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return jsonResponse({ error: "Campo 'file' não encontrado" }, { status: 400 });
      }
      if (file.type && file.type !== "application/pdf") {
        mediaType = file.type;
      }
      const buffer = await file.arrayBuffer();
      // Safe chunked base64 encoding — avoids stack-overflow on large PDFs
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
      }
      pdfBase64 = btoa(binary);
    } else if (contentType.includes("application/json")) {
      // Alternativa: receber base64 diretamente
      const body = await req.json();
      if (!body.base64 || !body.mediaType) {
        return jsonResponse({ error: "Campos 'base64' e 'mediaType' obrigatórios" }, { status: 400 });
      }
      pdfBase64 = body.base64;
      mediaType = body.mediaType;
    } else {
      return jsonResponse({ error: "Content-Type deve ser multipart/form-data ou application/json" }, { status: 400 });
    }

    const isImage = mediaType.startsWith("image/");

    // Chama a API da Anthropic com o PDF (document) ou print (image) do plano alimentar
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: isImage ? "image" : "document",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: isImage
                  ? "Extraia a dieta estruturada deste print/imagem do plano alimentar e retorne o JSON conforme instruído."
                  : "Extraia a dieta estruturada deste documento e retorne o JSON conforme instruído.",
              },
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

    // Tenta fazer parse do JSON retornado
    let parsed: any;
    try {
      // Remove possíveis blocos markdown caso o modelo os inclua mesmo com instrução
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

    return jsonResponse({ ok: true, diet: parsed });
  } catch (e: any) {
    return jsonResponse(
      { error: e?.message ?? "internal_error" },
      { status: 500 }
    );
  }
});
