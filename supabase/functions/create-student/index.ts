// deno-lint-ignore-file no-explicit-any
/**
 * create-student — sem supabase-js para evitar o bug ES256 do jose.
 * Usa fetch direto para PostgREST + Supabase Auth Admin API.
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REST  = `${SUPABASE_URL}/rest/v1`;
const AUTH  = `${SUPABASE_URL}/auth/v1`;

// Headers padrão para todas as chamadas (service role bypassa RLS)
const H = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
  "Content-Type":  "application/json",
};

const studentSchema = z.object({
  email:       z.string().email().max(255),
  nome:        z.string().trim().min(1).max(100),
  observacoes: z.string().max(1000).optional(),
  org_id:      z.string().uuid().optional(),
});

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ── Helpers PostgREST ──────────────────────────────────────────

async function dbSelect(table: string, filter: string, select = "*") {
  const r = await fetch(`${REST}/${table}?select=${select}&${filter}`, {
    headers: { ...H, "Accept": "application/json" },
  });
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function dbInsert(table: string, row: object, prefer = "return=minimal") {
  const r = await fetch(`${REST}/${table}`, {
    method:  "POST",
    headers: { ...H, "Prefer": prefer },
    body:    JSON.stringify(row),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  return { ok: r.ok, status: r.status, data };
}

// ── Função principal ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // 1. Bearer token
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "missing_bearer" }, 401);
    }
    const jwt = authHeader.replace("Bearer ", "").trim();

    // 2. Decodifica payload do JWT (sem verificar assinatura)
    let trainerId: string;
    try {
      const part   = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      if (!payload?.sub) throw new Error("no sub");
      trainerId = payload.sub;
    } catch {
      return json({ error: "invalid_jwt_payload" }, 401);
    }

    // 3. Verifica que é treinador via PostgREST (sem jose)
    const profiles = await dbSelect("profiles", `id=eq.${trainerId}`, "tipo_usuario");
    if (profiles[0]?.tipo_usuario !== "treinador") {
      return json({ error: "forbidden_not_trainer" }, 403);
    }

    // 4. Valida body
    const body   = await req.json();
    const parsed = studentSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0].message }, 400);
    }
    const { email, nome, observacoes, org_id } = parsed.data;

    // 5. Gera senha aleatória
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const arr   = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const password = Array.from(arr).map((b) => chars[b % chars.length]).join("");

    // 6. Cria auth user via Admin API (fetch direto — sem supabase-js)
    const createRes  = await fetch(`${AUTH}/admin/users`, {
      method:  "POST",
      headers: H,
      body:    JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, tipo_usuario: "aluno" },
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData?.id) {
      const msg = createData?.msg || createData?.message || createData?.error_description
                  || createData?.error || "create_user_failed";
      return json({ error: msg }, 400);
    }
    const newUserId: string = createData.id;

    // 7. Insere profile
    const pInsert = await dbInsert("profiles", { id: newUserId, nome, tipo_usuario: "aluno" });
    if (!pInsert.ok && pInsert.data?.code !== "23505") {
      return json({ error: pInsert.data?.message || "profile_insert_failed" }, 400);
    }

    // 8. user_roles (best-effort — tabela pode não existir)
    await dbInsert("user_roles", { user_id: newUserId, role: "aluno" }).catch(() => null);

    // 9. Resolve org_id
    let resolvedOrgId = org_id ?? null;
    if (!resolvedOrgId) {
      const orgs = await dbSelect("organizations", `owner_id=eq.${trainerId}`, "id");
      resolvedOrgId = orgs[0]?.id ?? null;
    }

    // 10. Insere em alunos
    const aInsert = await dbInsert("alunos", {
      user_id:     newUserId,
      treinador_id: trainerId,
      org_id:      resolvedOrgId,
      observacoes: observacoes || null,
    });
    if (!aInsert.ok) {
      return json({ error: aInsert.data?.message || "alunos_insert_failed" }, 400);
    }

    // 11. Envia e-mail de boas-vindas (best-effort — não bloqueia em caso de falha)
    try {
      // Busca nome da org
      let orgName = "sua plataforma";
      if (resolvedOrgId) {
        const orgsData = await dbSelect("organizations", `id=eq.${resolvedOrgId}`, "name,slug");
        orgName = orgsData[0]?.name ?? orgName;
        const orgSlug = orgsData[0]?.slug;
        const appUrl  = orgSlug
          ? `${SUPABASE_URL.replace(".supabase.co", "").replace("https://", "https://app.orbipro.com.br/")}/${orgSlug}/aluno`
          : "https://app.orbipro.com.br";

        await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
          method:  "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "apikey":        SERVICE_ROLE_KEY,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            type:    "boas_vindas",
            to:      email,
            nome,
            email,
            senha:   password,
            orgName,
            appUrl:  `https://app.orbipro.com.br/${orgSlug}/aluno`,
          }),
        });
      }
    } catch (emailErr) {
      // Falha silenciosa — aluno foi criado com sucesso
      console.warn("enviar-email failed (non-critical):", emailErr);
    }

    return json({ ok: true, user_id: newUserId, password });

  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
