/**
 * enviar-email — envia e-mails transacionais via Resend.
 * Chamado internamente por outras Edge Functions (ex: create-student).
 * Também pode ser chamado diretamente pelo frontend em casos futuros.
 *
 * Env vars necessárias:
 *   RESEND_API_KEY   — chave da API do Resend
 *   SUPABASE_URL     — para verificar o JWT (opcional se chamada interna)
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = "ORBI Pro <noreply@orbihealth.com.br>";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ── E-mail templates ───────────────────────────────────────────────

function boasVindasTemplate(nome: string, email: string, senha: string, orgName: string, appUrl: string) {
  return {
    subject: `Bem-vindo(a) à ${orgName}! 🎉`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo(a) à ${orgName}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#111113;border-radius:16px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

          <!-- Header amber band -->
          <tr>
            <td style="background:linear-gradient(135deg,hsl(42,95%,58%),hsl(35,92%,44%));padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#000;">ORBI Pro</p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(0,0,0,0.65);">${orgName}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">
                Olá, ${nome}! 👋
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;">
                Seu treinador te adicionou à plataforma <strong style="color:#fff;">${orgName}</strong>.
                Seus dados de acesso estão abaixo — guarde-os em um lugar seguro.
              </p>

              <!-- Credentials box -->
              <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);">Dados de acesso</p>
                <p style="margin:0 0 6px;font-size:14px;color:rgba(255,255,255,0.6);">
                  <span style="color:rgba(255,255,255,0.35);">E-mail:</span>
                  <strong style="color:#fff;margin-left:8px;">${email}</strong>
                </p>
                <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.6);">
                  <span style="color:rgba(255,255,255,0.35);">Senha:</span>
                  <strong style="color:hsl(42,95%,65%);margin-left:8px;font-family:monospace;font-size:16px;">${senha}</strong>
                </p>
              </div>

              <!-- CTA button -->
              <a href="${appUrl}"
                style="display:block;text-align:center;background:linear-gradient(135deg,hsl(42,95%,58%),hsl(35,92%,44%));color:#000;font-weight:700;font-size:14px;text-decoration:none;padding:14px 24px;border-radius:12px;margin-bottom:24px;">
                Acessar minha plataforma →
              </a>

              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.3);line-height:1.6;">
                Recomendamos alterar sua senha após o primeiro acesso em
                <strong style="color:rgba(255,255,255,0.45);">Perfil → Alterar senha</strong>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);text-align:center;">
                Este e-mail foi enviado automaticamente. Não responda a esta mensagem.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

function conviteColaboradorTemplate(
  name: string, orgName: string, coachName: string,
  role: string, inviteUrl: string,
) {
  return {
    subject: `Você foi convidado para colaborar no ${orgName}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Convite de colaboração — ${orgName}</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .email-wrapper { background-color: #000000 !important; }
      .email-card    { background-color: #1a1a1a !important; }
      .header-cell   { background-color: #111111 !important; }
      * { color: inherit !important; }
    }
  </style>
</head>
<body bgcolor="#000000" style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:32px 16px;">
    <tr>
      <td align="center">
        <table class="email-card" width="100%" style="max-width:480px;background:#111113;border-radius:16px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;">
          <tr>
            <td class="header-cell" style="background:#111111;padding:20px 24px;border-bottom:2px solid #f59e0b;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">ORBI Pro</p>
              <p style="margin:4px 0 0;font-size:13px;color:#a0a0a0;">${orgName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">
                Olá, ${name}! 👋
              </h1>
              <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;">
                <strong style="color:#fff;">${coachName}</strong> te convidou para colaborar na plataforma
                <strong style="color:#fff;">${orgName}</strong> como <strong style="color:hsl(42,95%,65%);">${role}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;">
                Clique no botão abaixo para criar sua senha e começar a usar o painel.
              </p>
              <a href="${inviteUrl}"
                style="display:block;text-align:center;background:linear-gradient(135deg,hsl(42,95%,58%),hsl(35,92%,44%));color:#000;font-weight:700;font-size:14px;text-decoration:none;padding:14px 24px;border-radius:12px;margin-bottom:24px;">
                Aceitar convite →
              </a>
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;text-align:center;">
                Este link expira em 24 horas. Se você não esperava este convite, ignore este e-mail.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);text-align:center;">
                Este e-mail foi enviado automaticamente. Não responda a esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

// ── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  try {
    const body = await req.json();
    const { type, to, ...data } = body;

    let subject = "";
    let html    = "";

    if (type === "boas_vindas") {
      const { nome, email, senha, orgName, appUrl } = data;
      if (!nome || !email || !senha || !orgName || !appUrl) {
        return json({ error: "Missing fields: nome, email, senha, orgName, appUrl" }, 400);
      }
      const tpl = boasVindasTemplate(nome, email, senha, orgName, appUrl);
      subject = tpl.subject;
      html    = tpl.html;
    } else if (type === "convite_colaborador") {
      const { name, orgName, coachName, role, inviteUrl } = data;
      if (!name || !orgName || !coachName || !role || !inviteUrl) {
        return json({ error: "Missing fields: name, orgName, coachName, role, inviteUrl" }, 400);
      }
      const tpl = conviteColaboradorTemplate(name, orgName, coachName, role, inviteUrl);
      subject = tpl.subject;
      html    = tpl.html;
    } else {
      return json({ error: `Unknown email type: ${type}` }, 400);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error("Resend error:", resData);
      return json({ error: resData?.message ?? "Resend API error", details: resData }, res.status);
    }

    return json({ ok: true, id: resData.id });

  } catch (e: any) {
    console.error("enviar-email error:", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});
