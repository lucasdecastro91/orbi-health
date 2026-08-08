// deno-lint-ignore-file no-explicit-any
/**
 * create-trainer — cadastro público de treinador (self-signup).
 * Cria o usuário já confirmado via Admin API (email_confirm: true),
 * contornando a exigência de confirmação de e-mail do Supabase Auth.
 *
 * A criação de profile + organization é feita pela trigger handle_new_user
 * (dispara em qualquer insert em auth.users, inclusive via Admin API).
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const AUTH = `${SUPABASE_URL}/auth/v1`;

const H = {
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

const trainerSchema = z.object({
  email:         z.string().email().max(255),
  password:      z.string().min(6).max(72),
  nome:          z.string().trim().min(1).max(100),
  whatsapp:      z.string().max(30).optional(),
  org_name:      z.string().trim().min(1).max(100),
  slug:          z.string().trim().min(3).max(50),
  theme:         z.enum(["dark", "light"]).default("dark"),
  primary_color: z.string().max(20).default("#16a34a"),
  plan_type:     z.enum(["motion", "pro"]).default("motion"),
  alunos_tier:   z.enum(["50", "ilimitado"]).default("50"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const body   = await req.json();
    const parsed = trainerSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0].message }, 400);
    }
    const { email, password, nome, whatsapp, org_name, slug, theme, primary_color, plan_type, alunos_tier } = parsed.data;

    const createRes = await fetch(`${AUTH}/admin/users`, {
      method:  "POST",
      headers: H,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome,
          whatsapp,
          tipo_usuario:  "treinador",
          org_name,
          slug,
          theme,
          primary_color,
          plan_type,
          alunos_tier,
        },
      }),
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData?.id) {
      const msg = createData?.msg || createData?.message || createData?.error_description
                  || createData?.error || "create_user_failed";
      return json({ error: msg }, 400);
    }

    // E-mail de boas-vindas — best-effort, não bloqueia o cadastro em caso de falha
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
        method:  "POST",
        headers: H,
        body: JSON.stringify({
          type:    "boas_vindas_treinador",
          to:      email,
          nome,
          orgName: org_name,
          appUrl:  `https://app.orbihealth.com.br/${slug}/treinador`,
        }),
      });
    } catch (emailErr) {
      console.warn("enviar-email failed (non-critical):", emailErr);
    }

    return json({ ok: true, user_id: createData.id });

  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
