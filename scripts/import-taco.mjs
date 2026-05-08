/**
 * import-taco.mjs — Node.js (ESM, sem dependências externas)
 * Chama a Edge Function importar-taco em modo "knowledge" por categoria.
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL     = process.env.SUPABASE_URL ?? "https://mdbqhmkblzyllkyxjhrd.supabase.co";
const FUNCTION_URL     = `${SUPABASE_URL}/functions/v1/importar-taco`;
const REST             = `${SUPABASE_URL}/rest/v1`;

if (!SERVICE_ROLE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY nao definida");
  process.exit(1);
}

const HEADERS = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
  "Content-Type":  "application/json",
};

const CATEGORIAS = [
  "Cereais e derivados",
  "Verduras, hortalicas e derivados",
  "Frutas e derivados",
  "Gorduras e oleos",
  "Pescados e frutos do mar",
  "Carnes e derivados",
  "Leite e derivados",
  "Ovos e derivados",
  "Leguminosas e derivados",
  "Nozes e sementes",
  "Acucares e doces",
  "Produtos de panificacao",
  "Alimentos preparados",
  "Bebidas nao alcoolicas",
  "Bebidas alcoolicas",
  "Outros alimentos industrializados",
  "Alimentos para fins especiais",
  "Sopas",
];

// Categorias no nome exato da TACO (com acentos) para enviar ao Claude
const CATEGORIAS_TACO = [
  "Cereais e derivados",
  "Verduras, hortaliças e derivados",
  "Frutas e derivados",
  "Gorduras e óleos",
  "Pescados e frutos do mar",
  "Carnes e derivados",
  "Leite e derivados",
  "Ovos e derivados",
  "Leguminosas e derivados",
  "Nozes e sementes",
  "Açúcares e doces",
  "Produtos de panificação",
  "Alimentos preparados",
  "Bebidas (não alcoólicas)",
  "Bebidas alcoólicas",
  "Outros alimentos industrializados",
  "Alimentos para fins especiais",
  "Sopas",
];

async function importarCategoria(categoria) {
  const res = await fetch(FUNCTION_URL, {
    method:  "POST",
    headers: HEADERS,
    body:    JSON.stringify({ mode: "knowledge", categoria }),
  });

  let data = {};
  try { data = await res.json(); } catch {}

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return { total: data.total ?? 0, inserted: data.inserted ?? 0, duplicates: data.duplicates ?? 0 };
}

async function testarBusca() {
  const res = await fetch(
    `${REST}/alimentos?nome=ilike.*arroz*&status=eq.aprovado&select=nome,kcal,proteina_g&limit=8`,
    { headers: { ...HEADERS, Accept: "application/json" } }
  );
  const data = await res.json();
  console.log("\nTeste — busca por 'arroz':");
  if (Array.isArray(data) && data.length > 0) {
    for (const a of data) {
      const nome = (a.nome ?? "").padEnd(42);
      const kcal = String(a.kcal ?? "—").padStart(5);
      console.log(`  OK  ${nome}  ${kcal} kcal  P ${a.proteina_g ?? "—"}g`);
    }
  } else {
    console.log("  Nenhum resultado encontrado");
  }
}

async function contarTotal() {
  const res = await fetch(
    `${REST}/alimentos?status=eq.aprovado&select=id`,
    { headers: { ...HEADERS, Accept: "application/json", Prefer: "count=exact", Range: "0-0" } }
  );
  const cr = res.headers.get("content-range") ?? "";
  return cr.includes("/") ? cr.split("/")[1] : "?";
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("Importacao da Tabela TACO 4a Edicao");
  console.log(`Edge Function: ${FUNCTION_URL}`);
  console.log(`Categorias:    ${CATEGORIAS_TACO.length}\n`);

  let totalAlimentos = 0, totalInseridos = 0, totalDuplicados = 0;

  for (let i = 0; i < CATEGORIAS_TACO.length; i++) {
    const cat = CATEGORIAS_TACO[i];
    const prefix = `[${String(i + 1).padStart(2)}/${CATEGORIAS_TACO.length}]  ${cat.padEnd(42)}`;
    process.stdout.write(`${prefix} -> `);

    try {
      const { total, inserted, duplicates } = await importarCategoria(cat);
      totalAlimentos  += total;
      totalInseridos  += inserted;
      totalDuplicados += duplicates;
      console.log(`${total} extraidos / ${inserted} inseridos`);
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }

    if (i < CATEGORIAS_TACO.length - 1) await sleep(2500);
  }

  const totalBanco = await contarTotal();
  console.log("\n=====================================================");
  console.log(`  Extraidos:       ${totalAlimentos}`);
  console.log(`  Inseridos:       ${totalInseridos}`);
  console.log(`  Duplicados:      ${totalDuplicados}`);
  console.log(`  Total no banco:  ${totalBanco}`);
  console.log("=====================================================");

  await testarBusca();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
