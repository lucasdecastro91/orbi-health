/**
 * import-taco.ts
 * Importa a Tabela TACO (4ª edição) chamando a Edge Function importar-taco
 * em modo "knowledge" — 18 chamadas, uma por categoria.
 * Não precisa de ANTHROPIC_API_KEY local (a chave está na Edge Function).
 *
 * Como rodar:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... bun run scripts/import-taco.ts
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_URL     = process.env.SUPABASE_URL ?? "https://mdbqhmkblzyllkyxjhrd.supabase.co";
const FUNCTION_URL     = `${SUPABASE_URL}/functions/v1/importar-taco`;
const REST             = `${SUPABASE_URL}/rest/v1`;

if (!SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY não definida");
  process.exit(1);
}

const HEADERS = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
  "Content-Type":  "application/json",
};

const CATEGORIAS = [
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

async function importarCategoria(categoria: string): Promise<{ total: number; inserted: number; duplicates: number }> {
  const res = await fetch(FUNCTION_URL, {
    method:  "POST",
    headers: HEADERS,
    body:    JSON.stringify({ mode: "knowledge", categoria }),
  });

  const data = await res.json().catch(() => ({})) as any;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }

  return { total: data.total ?? 0, inserted: data.inserted ?? 0, duplicates: data.duplicates ?? 0 };
}

async function testarBusca() {
  const res = await fetch(
    `${REST}/alimentos?nome=ilike.*arroz*&status=eq.aprovado&select=nome,kcal,proteina_g&limit=8`,
    { headers: { ...HEADERS, "Accept": "application/json" } }
  );
  const data = await res.json() as any[];
  console.log("\n🔍  Teste — busca por 'arroz':");
  if (Array.isArray(data) && data.length > 0) {
    for (const a of data) {
      console.log(`    ✓  ${a.nome.padEnd(40)} ${String(a.kcal ?? "—").padStart(5)} kcal   P ${a.proteina_g ?? "—"}g`);
    }
  } else {
    console.log("    ⚠️  Nenhum resultado");
  }
}

async function contarTotal() {
  const res = await fetch(
    `${REST}/alimentos?status=eq.aprovado&fonte=eq.taco&select=id`,
    { headers: { ...HEADERS, "Accept": "application/vnd.pgrst.object+json", "Prefer": "count=exact", "Range": "0-0" } }
  );
  const cr = res.headers.get("content-range") ?? "";
  const total = cr.includes("/") ? cr.split("/")[1] : "?";
  return total;
}

async function main() {
  console.log("🥦  Importação da Tabela TACO 4ª Edição");
  console.log(`    Edge Function: ${FUNCTION_URL}`);
  console.log(`    Categorias:    ${CATEGORIAS.length}\n`);

  let totalAlimentos = 0;
  let totalInseridos = 0;
  let totalDuplicados = 0;

  for (let i = 0; i < CATEGORIAS.length; i++) {
    const cat = CATEGORIAS[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}/${CATEGORIAS.length}]  ${cat.padEnd(40)} → `);

    try {
      const { total, inserted, duplicates } = await importarCategoria(cat);
      totalAlimentos  += total;
      totalInseridos  += inserted;
      totalDuplicados += duplicates;
      console.log(`${total} extraídos  /  ${inserted} inseridos`);
    } catch (err: any) {
      console.log(`❌  ${err.message}`);
    }

    // Pausa entre chamadas para não sobrecarregar
    if (i < CATEGORIAS.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const totalBanco = await contarTotal();

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Extraídos:         ${totalAlimentos}`);
  console.log(`  Inseridos:         ${totalInseridos}`);
  console.log(`  Duplicados/skip:   ${totalDuplicados}`);
  console.log(`  Total no banco:    ${totalBanco}`);
  console.log("═══════════════════════════════════════════════");

  await testarBusca();
}

main().catch(e => { console.error("❌  Fatal:", e); process.exit(1); });
