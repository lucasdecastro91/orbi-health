// deno-lint-ignore-file no-explicit-any
/**
 * accept-collaborator-invite — valida token, cria (ou vincula) usuário e ativa colaborador.
 * Endpoint público — não exige autenticação.
 */

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH = `${SUPABASE_URL}/auth/v1`;
const H    = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
  "Content-Type":  "application/json",
};

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

async function dbSelect(table: string, filter: string, select = "*") {
  const r = await fetch(`${REST}/${table}?select=${select}&${filter}`, {
    headers: { ...H, "Accept": "application/json" },
  });
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function dbInsert(table: string, row: object) {
  const r = await fetch(`${REST}/${table}`, {
    method: "POST",
    headers: { ...H, "Prefer": "return=minimal" },
    body:   JSON.stringify(row),
  });
  return { ok: r.ok, status: r.status };
}

async function dbPatch(table: string, filter: string, patch: object) {
  const r = await fetch(`${REST}/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...H, "Prefer": "return=minimal" },
    body:   JSON.stringify(patch),
  });
  return { ok: r.ok, status: r.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { token, password } = body;
    if (!token || !password) return json({ error: "Missing: token, password" }, 400);
    if (password.length < 6)  return json({ error: "password_too_short" }, 400);

    // 1. Busca convite pelo token
    const rows = await dbSelect(
      "collaborators",
      `invite_token=eq.${token}&select=id,email,name,org_id,status,invite_expires_at`,
    );
    const collab = rows[0];
    if (!collab)                    return json({ error: "invalid_token" }, 404);
    if (collab.status !== "pending") return json({ error: "invite_already_used" }, 409);
    if (new Date(collab.invite_expires_at) < new Date()) {
      return json({ error: "invite_expired" }, 410);
    }

    // 2. Busca slug da org
    const orgs = await dbSelect("organizations", `id=eq.${collab.org_id}`, "slug,name");
    const org   = orgs[0];
    if (!org) return json({ error: "org_not_found" }, 404);

    // 3. Tenta criar o usuário (admin API, email já confirmado)
    let userId: string;
    const createRes = await fetch(`${AUTH}/admin/users`, {
      method:  "POST",
      headers: H,
      body: JSON.stringify({
        email:         collab.email,
        password,
        email_confirm: true,
        user_metadata: { nome: collab.name, tipo_usuario: "treinador", collab_org_slug: org.slug },
      }),
    });
    const createData = await createRes.json();

    if (createRes.ok && createData?.id) {
      // Novo usuário criado
      userId = createData.id;
      // Cria profile
      await dbInsert("profiles", { id: userId, nome: collab.name, tipo_usuario: "treinador" });
    } else if (createData?.msg?.includes("already been registered") ||
               createData?.message?.includes("already been registered") ||
               createRes.status === 422) {
      // Usuário já existe — busca pelo e-mail via admin list
      const listRes  = await fetch(`${AUTH}/admin/users?email=${encodeURIComponent(collab.email)}`, { headers: H });
      const listData = await listRes.json();
      const existing = listData?.users?.[0];
      if (!existing?.id) return json({ error: "user_lookup_failed" }, 500);
      userId = existing.id;
      // Atualiza senha e metadata
      await fetch(`${AUTH}/admin/users/${userId}`, {
        method: "PUT",
        headers: H,
        body:   JSON.stringify({ password, user_metadata: { nome: collab.name, tipo_usuario: "treinador", collab_org_slug: org.slug } }),
      });
    } else {
      const msg = createData?.msg ?? createData?.message ?? createData?.error ?? "create_user_failed";
      return json({ error: msg }, 400);
    }

    // 4. Ativa o colaborador
    await dbPatch("collaborators", `id=eq.${collab.id}`, {
      user_id:           userId,
      status:            "active",
      accepted_at:       new Date().toISOString(),
      invite_token:      null,
      invite_expires_at: null,
    });

    // 5. Adiciona à organization_members como trainer (permite is_org_member() funcionar)
    await dbInsert("organization_members", {
      org_id:  collab.org_id,
      user_id: userId,
      role:    "trainer",
    });

    return json({ ok: true, email: collab.email, org_slug: org.slug });

  } catch (e: any) {
    console.error("accept-collaborator-invite error:", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
