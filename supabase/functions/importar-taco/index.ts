// deno-lint-ignore-file no-explicit-any
/**
 * Edge Function: importar-taco
 *
 * Modos:
 *   1. POST multipart/form-data  → campo "file" com o PDF da TACO
 *   2. POST application/json     → { base64: string, mediaType: string }
 *   3. POST application/json     → { mode: "knowledge", categoria: string }
 *      Extrai UMA categoria da TACO usando o conhecimento do Claude (sem PDF).
 *      Chamado repetidamente pelo script local import-taco.ts
 */

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const REST = `${SUPABASE_URL}/rest/v1`;
const H = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
  "Content-Type":  "application/json",
};

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ── Insere lote no Supabase ────────────────────────────────────────────────────
async function inserirLote(rows: any[]): Promise<{ inserted: number; duplicates: number }> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 };

  const r = await fetch(`${REST}/alimentos`, {
    method:  "POST",
    headers: { ...H, "Prefer": "return=minimal,resolution=ignore-duplicates" },
    body:    JSON.stringify(rows),
  });

  if (r.ok || r.status === 201) return { inserted: rows.length, duplicates: 0 };

  // Fallback: insere um a um
  let inserted = 0, duplicates = 0;
  for (const row of rows) {
    const s = await fetch(`${REST}/alimentos`, {
      method:  "POST",
      headers: { ...H, "Prefer": "return=minimal,resolution=ignore-duplicates" },
      body:    JSON.stringify(row),
    });
    if (s.ok || s.status === 201) inserted++;
    else duplicates++;
  }
  return { inserted, duplicates };
}

// ── Chama Claude para extrair alimentos de uma categoria ───────────────────────
async function extrairPorConhecimento(categoria: string): Promise<any[]> {
  const prompt = `Você é um especialista em nutrição e conhece a Tabela TACO (Tabela Brasileira de Composição de Alimentos, 4ª edição revisada e ampliada, NEPA/UNICAMP, 2011).

Liste TODOS os alimentos da categoria "${categoria}" presentes na TACO 4ª edição com seus valores nutricionais por 100g.

Retorne APENAS um array JSON válido, sem texto adicional, sem markdown, sem comentários.

Formato:
[
  {
    "nome": "Arroz, tipo 1, cozido",
    "kcal": 128,
    "proteina_g": 2.5,
    "carb_g": 28.1,
    "gordura_g": 0.2,
    "fibra_g": 1.6,
    "sodio_mg": 1
  }
]

Regras:
- Todos os valores são por 100g
- Use null para valores ausentes (NA na tabela original)
- Inclua TODOS os alimentos dessa categoria que constam na TACO 4ª edição
- Nome exatamente como aparece na TACO
- Retorne APENAS o array JSON, sem nenhum texto antes ou depois`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-opus-4-5",
      max_tokens: 16000,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText: string = data?.content?.[0]?.text ?? "";
  const cleaned = rawText
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw new Error("Resposta não é array");
  return arr;
}

// ── Normaliza e prepara row para inserção ──────────────────────────────────────
function normalizar(a: any): any | null {
  if (!a?.nome || typeof a.nome !== "string") return null;
  return {
    nome:             a.nome.trim(),
    porcao_descricao: "100g",
    porcao_gramas:    100,
    kcal:             a.kcal       ?? null,
    proteina_g:       a.proteina_g ?? null,
    carb_g:           a.carb_g     ?? null,
    gordura_g:        a.gordura_g  ?? null,
    fibra_g:          a.fibra_g    ?? null,
    sodio_mg:         a.sodio_mg   ?? null,
    fonte:            "taco",
    org_id:           null,
    status:           "aprovado",
  };
}

// ── Handler principal ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let pdfBase64: string | null = null;
    let mediaType = "application/pdf";
    let knowledgeMode = false;
    let categoria = "";

    // ── Resolve modo de operação ────────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return json({ error: "campo 'file' ausente" }, 400);
      const buf = await file.arrayBuffer();
      pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      mediaType = file.type || "application/pdf";
    } else {
      const body = await req.json();

      if (body.mode === "knowledge") {
        // Modo por conhecimento (sem PDF)
        if (!body.categoria) return json({ error: "'categoria' obrigatória no modo knowledge" }, 400);
        knowledgeMode = true;
        categoria = body.categoria;
      } else {
        pdfBase64 = body.base64;
        if (body.mediaType) mediaType = body.mediaType;
        if (!pdfBase64) return json({ error: "PDF não fornecido" }, 400);
      }
    }

    // ── Extração ────────────────────────────────────────────────────────────
    let rawAlimentos: any[] = [];

    if (knowledgeMode) {
      // Extrai uma categoria usando conhecimento do Claude
      rawAlimentos = await extrairPorConhecimento(categoria);
    } else {
      // Extrai via PDF com beta de documentos
      const systemPrompt = `Você é um extrator de dados nutricionais especializado.
Analise a tabela TACO fornecida e extraia TODOS os alimentos.
Retorne APENAS um JSON válido: { "alimentos": [ { "nome": "...", "kcal": 0, "proteina_g": 0, "carb_g": 0, "gordura_g": 0, "fibra_g": 0, "sodio_mg": 0 } ] }
Use null para valores NA. Valores por 100g. Sem texto fora do JSON.`;

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key":         ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta":    "pdfs-2024-09-25",
          "content-type":      "application/json",
        },
        body: JSON.stringify({
          model:      "claude-opus-4-5",
          max_tokens: 32000,
          system:     systemPrompt,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: mediaType, data: pdfBase64 } },
              { type: "text", text: "Extraia todos os alimentos da TACO. Retorne APENAS o JSON." },
            ],
          }],
        }),
      });

      if (!anthropicRes.ok) {
        const errBody = await anthropicRes.text();
        return json({ error: `Anthropic API error: ${anthropicRes.status}`, detail: errBody }, 502);
      }

      const anthropicData = await anthropicRes.json();
      const rawText = anthropicData?.content?.[0]?.text ?? "";
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      const extracted = JSON.parse(cleaned);
      rawAlimentos = extracted?.alimentos ?? [];
    }

    // ── Normaliza ───────────────────────────────────────────────────────────
    const rows = rawAlimentos.map(normalizar).filter(Boolean);
    if (rows.length === 0) return json({ error: "Nenhum alimento extraído" }, 422);

    // ── Insere em lotes de 100 ──────────────────────────────────────────────
    const BATCH = 100;
    let inserted = 0, duplicates = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { inserted: ins, duplicates: dup } = await inserirLote(rows.slice(i, i + BATCH));
      inserted += ins;
      duplicates += dup;
    }

    return json({
      ok:        true,
      categoria: categoria || "pdf",
      total:     rows.length,
      inserted,
      duplicates,
      message:   `${inserted} alimentos importados${categoria ? ` (${categoria})` : ""} com sucesso`,
    });

  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
