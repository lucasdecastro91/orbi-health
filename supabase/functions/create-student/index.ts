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
  telefone:    z.string().trim().max(20).optional(),
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
    const { email, nome, observacoes, telefone, org_id } = parsed.data;

    // 4b. Resolve org_id ANTES de criar o usuário no Auth — se a org for
    // inválida ou ambígua, falha aqui sem deixar usuário órfão. NUNCA adivinhar:
    // o fallback antigo fazia SELECT sem ORDER BY e pegava orgs[0]; com um
    // treinador dono de 2+ orgs, o aluno era vinculado à org errada de forma
    // aleatória (casos reais: Eduardo Almeida e Nelbinho Jatobá).
    let resolvedOrgId = org_id ?? null;

    if (resolvedOrgId) {
      // org_id informado: valida que o treinador realmente pertence a essa org
      // (dono, membro ou colaborador ativo) — impede vínculo cross-org.
      const [owned, member, collab] = await Promise.all([
        dbSelect("organizations", `id=eq.${resolvedOrgId}&owner_id=eq.${trainerId}`, "id"),
        dbSelect("organization_members", `org_id=eq.${resolvedOrgId}&user_id=eq.${trainerId}`, "org_id"),
        dbSelect("collaborators", `org_id=eq.${resolvedOrgId}&user_id=eq.${trainerId}&status=eq.active`, "org_id"),
      ]);
      if (!owned.length && !member.length && !collab.length) {
        return json({ error: "org_id_forbidden" }, 403);
      }
    } else {
      // Sem org_id: só resolve sozinho se for inequívoco (exatamente 1 org ativa).
      const orgs = await dbSelect("organizations", `owner_id=eq.${trainerId}&active=eq.true`, "id");
      if (orgs.length === 1) {
        resolvedOrgId = orgs[0].id;
      } else if (orgs.length > 1) {
        return json({ error: "org_id_required_multiple_orgs" }, 400);
      }
      // 0 orgs: segue com null (caso legado; trigger do banco também não adivinha mais)
    }

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

    let newUserId: string;
    let isExistingUser = false;

    if (createRes.ok && createData?.id) {
      newUserId = createData.id;
    } else {
      // E-mail já cadastrado em algum lugar da plataforma — reaproveita a conta
      // existente em vez de falhar (aluno pode ter outro treinador, ou já ter
      // sido treinador/aluno antes).
      const isDuplicate = createData?.error_code === "email_exists"
        || /already.*registered|already exists/i.test(createData?.msg ?? createData?.message ?? "");
      if (!isDuplicate) {
        const msg = createData?.msg || createData?.message || createData?.error_description
                    || createData?.error || "create_user_failed";
        return json({ error: msg }, 400);
      }

      const lookupRes  = await fetch(`${AUTH}/admin/users?email=${encodeURIComponent(email)}`, { headers: H });
      const lookupData = await lookupRes.json();
      const existingUser = Array.isArray(lookupData?.users) ? lookupData.users[0] : null;
      if (!existingUser?.id) {
        return json({ error: "email_already_registered" }, 409);
      }
      newUserId      = existingUser.id;
      isExistingUser = true;
    }

    // 7. Insere profile (idempotente — ignora conflito se já existir)
    const pInsert = await dbInsert("profiles", { id: newUserId, nome, tipo_usuario: "aluno" });
    if (!pInsert.ok && pInsert.data?.code !== "23505") {
      return json({ error: pInsert.data?.message || "profile_insert_failed" }, 400);
    }

    // 8. user_roles (best-effort — tabela pode não existir)
    await dbInsert("user_roles", { user_id: newUserId, role: "aluno" }).catch(() => null);

    // 10. Impede vínculo duplicado com o mesmo treinador/org
    if (isExistingUser) {
      const dup = await dbSelect(
        "alunos",
        `user_id=eq.${newUserId}&treinador_id=eq.${trainerId}`,
        "id",
      );
      if (dup.length) {
        return json({ error: "already_client_of_this_trainer" }, 409);
      }
    }

    // 11. Insere em alunos
    const aInsert = await dbInsert("alunos", {
      user_id:     newUserId,
      treinador_id: trainerId,
      org_id:      resolvedOrgId,
      observacoes: observacoes || null,
      telefone:    telefone || null,
    });
    if (!aInsert.ok) {
      return json({ error: aInsert.data?.message || "alunos_insert_failed" }, 400);
    }

    // 12. Envia e-mail (best-effort — não bloqueia em caso de falha)
    // Para conta reaproveitada, não sabemos a senha atual — não faz sentido
    // enviar o template de boas-vindas com credenciais.
    if (!isExistingUser) {
      try {
        let orgName = "sua plataforma";
        if (resolvedOrgId) {
          const orgsData = await dbSelect("organizations", `id=eq.${resolvedOrgId}`, "name,slug");
          orgName = orgsData[0]?.name ?? orgName;
          const orgSlug = orgsData[0]?.slug;

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
              appUrl:  `https://app.orbihealth.com.br/${orgSlug}/aluno`,
            }),
          });
        }
      } catch (emailErr) {
        console.warn("enviar-email failed (non-critical):", emailErr);
      }
    }

    return json({
      ok: true,
      user_id: newUserId,
      password: isExistingUser ? null : password,
      reused_existing_account: isExistingUser,
    });

  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
