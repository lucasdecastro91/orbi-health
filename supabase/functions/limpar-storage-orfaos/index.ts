import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Limpeza pontual (2026-08-27): 283 arquivos em `evolution-photos` e 24 em
// `atualizacoes` existiam no Storage sem nenhuma linha no banco referenciando
// eles (upload sobe o arquivo, insere o registro depois — se o insert falha,
// o arquivo fica órfão pra sempre e nunca aparece em lugar nenhum do app).
// Causa raiz corrigida em Atualizacao.tsx (rollback do upload se o insert
// falhar); esta function só limpa o que já tinha acumulado. Usa a Storage
// API de verdade (não DELETE direto em storage.objects via SQL) pra garantir
// que o espaço realmente seja liberado na cota, não só a metadata.
// Superadmin-only. Pode ser apagada depois de rodada uma vez.

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAIL = "lucas.melo1991@gmail.com";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user || user.email !== SUPERADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const results: Record<string, { encontrados: number; removidos: number; erro?: string }> = {};

    const jobs: { bucket: string; table: string }[] = [
      { bucket: "evolution-photos", table: "evolution_photos" },
      { bucket: "atualizacoes",     table: "atualizacao_resposta_arquivos" },
    ];

    for (const { bucket, table } of jobs) {
      const { data: orphanRows, error: qErr } = await supabase.rpc("listar_storage_orfaos", {
        p_bucket: bucket,
        p_table:  table,
      });
      if (qErr) {
        results[bucket] = { encontrados: 0, removidos: 0, erro: qErr.message };
        continue;
      }
      const paths = (orphanRows ?? []).map((r: { name: string }) => r.name);
      results[bucket] = { encontrados: paths.length, removidos: 0 };

      // Remove em lotes de 100 (limite prático da API de Storage)
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const { error: rmErr } = await supabase.storage.from(bucket).remove(batch);
        if (rmErr) {
          results[bucket].erro = rmErr.message;
          break;
        }
        results[bucket].removidos += batch.length;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
