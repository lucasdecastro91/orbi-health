// deno-lint-ignore-file no-explicit-any
/**
 * invite-collaborator — cria registro de colaborador e envia e-mail de convite.
 * Requer JWT de um usuário que seja owner da org.
 */

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL          = Deno.env.get("APP_URL") ?? "https://app.orbihealth.com.br";

const REST = `${SUPABASE_URL}/rest/v1`;
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
    headers: { ...H, "Prefer": "return=representation" },
    body:   JSON.stringify(row),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: r.ok, status: r.status, data };
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
    // 1. Extrai JWT e trainerId
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401);
    const jwt = authHeader.replace("Bearer ", "").trim();

    let callerId: string;
    try {
      const part    = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded  = part + "=".repeat((4 - (part.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      if (!payload?.sub) throw new Error("no sub");
      callerId = payload.sub;
    } catch {
      return json({ error: "invalid_jwt" }, 401);
    }

    // 2. Valida body
    const body = await req.json();
    const { org_id, name, email, role, permissions } = body;
    if (!org_id || !name || !email || !role || !permissions) {
      return json({ error: "Missing: org_id, name, email, role, permissions" }, 400);
    }

    // 3. Verifica que o caller é owner desta org
    const orgs = await dbSelect("organizations", `id=eq.${org_id}&owner_id=eq.${callerId}`, "id,name,slug,alunos_tier");
    if (!orgs.length) return json({ error: "forbidden_not_owner" }, 403);
    const org = orgs[0];

    // 4. Colaboradores só disponível no tier "ilimitado" de alunos
    if (org.alunos_tier !== "ilimitado") {
      return json({ error: "plan_feature_unavailable" }, 422);
    }

    // 5. Verifica se já existe colaborador com este e-mail nesta org
    const dup = await dbSelect("collaborators", `org_id=eq.${org_id}&email=eq.${encodeURIComponent(email)}`, "id,status");
    if (dup.length) {
      const ex = dup[0];
      if (ex.status === "active")   return json({ error: "email_already_active" }, 409);
      if (ex.status === "pending") {
        // Reenvia convite: atualiza token + expiração
        const newToken  = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await dbPatch("collaborators", `id=eq.${ex.id}`, {
          invite_token:      newToken,
          invite_expires_at: expiresAt,
          permissions,
        });
        const callerProfiles = await dbSelect("profiles", `id=eq.${callerId}`, "nome");
        const callerName = callerProfiles[0]?.nome ?? "Seu treinador";
        await sendInviteEmail({ email, name, orgName: org.name, coachName: callerName, role, token: newToken, orgSlug: org.slug });
        return json({ ok: true, resent: true });
      }
    }

    // 6. Gera token + expiração
    const inviteToken = crypto.randomUUID();
    const expiresAt   = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 7. Insere colaborador
    const insert = await dbInsert("collaborators", {
      org_id,
      invited_by:        callerId,
      name,
      email,
      role,
      permissions,
      invite_token:      inviteToken,
      invite_expires_at: expiresAt,
      status:            "pending",
    });
    if (!insert.ok) {
      return json({ error: insert.data?.message ?? "insert_failed" }, 400);
    }

    // 8. Busca nome do caller
    const profiles = await dbSelect("profiles", `id=eq.${callerId}`, "nome");
    const coachName = profiles[0]?.nome ?? "Seu treinador";

    // 9. Envia e-mail
    await sendInviteEmail({ email, name, orgName: org.name, coachName, role, token: inviteToken, orgSlug: org.slug });

    const collaboratorId = Array.isArray(insert.data) ? insert.data[0]?.id : insert.data?.id;
    return json({ ok: true, collaborator_id: collaboratorId });

  } catch (e: any) {
    console.error("invite-collaborator error:", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

async function sendInviteEmail(params: {
  email: string; name: string; orgName: string;
  coachName: string; role: string; token: string; orgSlug: string;
}) {
  const inviteUrl = `${APP_URL}/convite/${params.token}`;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "apikey": SERVICE_ROLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        type:       "convite_colaborador",
        to:         params.email,
        name:       params.name,
        orgName:    params.orgName,
        coachName:  params.coachName,
        role:       params.role,
        inviteUrl,
      }),
    });
  } catch (e) {
    console.warn("sendInviteEmail failed (non-critical):", e);
  }
}
