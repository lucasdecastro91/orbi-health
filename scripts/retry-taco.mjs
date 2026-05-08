/**
 * retry-taco.mjs — Reimporta apenas as 4 categorias que falharam por truncamento.
 * Agora a edge function usa max_tokens: 16000 (dobro do anterior).
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL     = process.env.SUPABASE_URL ?? "https://mdbqhmkblzyllkyxjhrd.supabase.co";
const FUNCTION_URL     = `${SUPABASE_URL}/functions/v1/importar-taco`;
const REST             = `${SUPABASE_URL}/rest/v1`;

if (!SERVICE_ROLE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY nao definida"); process.exit(1); }

const HEADERS = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
  "Content-Type":  "application/json",
};

// Apenas as 4 categorias que falharam
const RETRY = [
  "Frutas e derivados",
  "Pescados e frutos do mar",
  "Carnes e derivados",
  "Alimentos preparados",
];

async function importarCategoria(categoria) {
  const res = await fetch(FUNCTION_URL, {
    method:  "POST",
    headers: HEADERS,
    body:    JSON.stringify({ mode: "knowledge", categoria }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return { total: data.total ?? 0, inserted: data.inserted ?? 0, duplicates: data.duplicates ?? 0 };
}

async function contarTotal() {
  const res = await fetch(
    `${REST}/alimentos?status=eq.aprovado&select=id`,
    { headers: { ...HEADERS, Accept: "application/json", Prefer: "count=exact", Range: "0-0" } }
  );
  const cr = res.headers.get("content-range") ?? "";
  return cr.includes("/") ? cr.split("/")[1] : "?";
}

async function testarBusca() {
  const res = await fetch(
    `${REST}/alimentos?nome=ilike.*arroz*&status=eq.aprovado&select=nome,kcal,proteina_g&limit=5`,
    { headers: { ...HEADERS, Accept: "application/json" } }
  );
  const data = await res.json();
  console.log("\nTeste — busca por 'arroz':");
  for (const a of (Array.isArray(data) ? data : [])) {
    console.log(`  OK  ${(a.nome ?? "").padEnd(40)}  ${String(a.kcal ?? "—").padStart(5)} kcal  P ${a.proteina_g ?? "—"}g`);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("Retry — 4 categorias grandes (max_tokens: 16000)\n");

  let totalInseridos = 0;

  for (let i = 0; i < RETRY.length; i++) {
    const cat = RETRY[i];
    process.stdout.write(`[${i + 1}/${RETRY.length}]  ${cat.padEnd(42)} -> `);
    try {
      const { total, inserted, duplicates } = await importarCategoria(cat);
      totalInseridos += inserted;
      console.log(`${total} extraidos / ${inserted} inseridos / ${duplicates} duplicados`);
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }
    if (i < RETRY.length - 1) await sleep(3000);
  }

  const totalBanco = await contarTotal();
  console.log(`\nTotal no banco agora: ${totalBanco} alimentos`);
  await testarBusca();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
