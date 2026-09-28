// deno-lint-ignore-file no-explicit-any
/**
 * solicitar-recuperacao-senha — gera um link de recuperação de senha via
 * Admin API do Supabase e envia por e-mail com a marca da ORBI (via
 * enviar-email/Resend), em vez do e-mail padrão do Supabase (sem branding
 * e com redirect quebrado — ver CLAUDE.md seção 15).
 *
 * Endpoint público (sem JWT) — quem preenche o e-mail no login ainda não
 * está autenticado. Por isso SEMPRE responde { ok: true }, exista ou não
 * o e-mail, pra não permitir enumerar contas cadastradas.
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REST = `${SUPABASE_URL}/rest/v1`;
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

const bodySchema = z.object({
  email: z.string().email().max(255),
});

async function dbSelect(table: string, filter: string, select = "*") {
  const r = await fetch(`${REST}/${table}?select=${select}&${filter}`, {
    headers: { ...H, "Accept": "application/json" },
  });
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0].message }, 400);
    }
    const { email } = parsed.data;

    // Gera o link de recuperação via Admin API — não envia nada ainda,
    // só devolve o link pra a gente mandar com a nossa própria cara.
    const genRes = await fetch(`${AUTH}/admin/generate_link`, {
      method:  "POST",
      headers: H,
      body: JSON.stringify({
        type:  "recovery",
        email,
        // redirect_to vai na RAIZ do corpo, não aninhado em "options" — isso
        // é só uma conversão que o cliente JS faz por baixo dos panos.
        // Testado ao vivo: com "options: { redirect_to }" a API sempre caía
        // de volta pro Site URL, silenciosamente, mesmo respondendo 200 OK.
        redirect_to: "https://app.orbihealth.com.br/auth",
      }),
    });
    const genData = await genRes.json().catch(() => ({}));

    // E-mail não cadastrado, ou qualquer outra falha: responde sucesso genérico
    // do mesmo jeito, pra não vazar quais e-mails existem na plataforma.
    if (genRes.ok) {
      const actionLink: string | undefined =
        genData?.action_link ?? genData?.properties?.action_link;
      const userId: string | undefined =
        genData?.user?.id ?? genData?.id;

      if (actionLink) {
        let nome = "";
        if (userId) {
          const profs = await dbSelect("profiles", `id=eq.${userId}`, "nome");
          nome = profs[0]?.nome ?? "";
        }

        try {
          await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
            method:  "POST",
            headers: H,
            body: JSON.stringify({
              type:     "recuperar_senha",
              to:       email,
              nome:     nome || "aluno(a)",
              resetUrl: actionLink,
            }),
          });
        } catch (emailErr) {
          console.warn("enviar-email failed (non-critical):", emailErr);
        }
      } else {
        console.warn("generate_link ok mas sem action_link:", JSON.stringify(genData));
      }
    } else {
      console.warn("generate_link falhou:", JSON.stringify(genData));
    }

    return json({ ok: true });

  } catch (e: any) {
    console.error("solicitar-recuperacao-senha error:", e);
    // Mesmo em erro interno, não expõe detalhe — só loga pro nosso lado.
    return json({ ok: true });
  }
});
