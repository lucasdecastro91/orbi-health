const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = "ORBI Health <noreply@orbihealth.com.br>";

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

// Bloco de logo com bgcolor forçado em cada camada — evita que apps de e-mail
// (Gmail principalmente) reescrevam as cores no modo escuro do celular.
const LOGO_BLOCK = `
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td valign="middle" style="padding-right:10px;">
      <img src="https://mdbqhmkblzyllkyxjhrd.supabase.co/storage/v1/object/public/logos/orbi-logo-icon.svg" width="36" height="36" border="0" alt="ORBI icon" style="display:block;border:0;" />
    </td>
    <td valign="middle">
      <p style="margin:0;padding:0;font-family:'Poppins','Montserrat',Arial,sans-serif;line-height:1;">
        <span style="font-size:18px;font-weight:700;color:#111111;letter-spacing:0.05em;">ORBI</span><span style="font-size:11px;font-weight:500;color:#888888;letter-spacing:0.2em;text-transform:uppercase;margin-left:5px;">HEALTH</span>
      </p>
    </td>
  </tr>
</table>`;

function boasVindasTemplate(nome: string, email: string, senha: string, orgName: string, appUrl: string) {
  return {
    subject: `Bem-vindo(a) a ${orgName}!`,
    html: `<!DOCTYPE html>
<html lang="pt-BR" bgcolor="#ffffff">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bem-vindo(a)</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 16px;">
<table width="420" cellpadding="0" cellspacing="0" border="0" style="width:420px;max-width:420px;">
<tr>
<td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 0 20px 0;">
${LOGO_BLOCK}
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;border-radius:8px;overflow:hidden;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:28px 24px;">
<p style="margin:0 0 6px 0;font-size:20px;font-weight:600;color:#111111;font-family:Arial,sans-serif;line-height:1.3;">Ola, ${nome}!</p>
<p style="margin:0 0 24px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">
Seu treinador te adicionou a plataforma <span style="color:#111111;font-weight:600;">${orgName}</span>. Seus dados de acesso estao abaixo.
</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#e8e8e8" style="background-color:#e8e8e8;border-radius:6px;padding:16px 20px;">
<p style="margin:0 0 10px 0;font-size:11px;font-weight:600;color:#888888;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;">Dados de acesso</p>
<p style="margin:0 0 6px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">
<span style="color:#888888;">E-mail:</span>
<span style="color:#111111;font-weight:600;margin-left:6px;">${email}</span>
</p>
<p style="margin:0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">
<span style="color:#888888;">Senha:</span>
<span style="color:#111111;font-weight:600;font-family:monospace;font-size:15px;margin-left:6px;">${senha}</span>
</p>
</td>
</tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;margin-bottom:24px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:6px;padding:13px 28px;">
<a href="${appUrl}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;display:block;white-space:nowrap;">Acessar minha conta</a>
</td>
</tr>
</table>
</td></tr>
</table>
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:16px 24px;border-top:1px solid #e0e0e0;">
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
Este e-mail foi enviado automaticamente. Nao responda a esta mensagem.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function conviteColaboradorTemplate(name: string, orgName: string, coachName: string, role: string, inviteUrl: string) {
  return {
    subject: `Voce foi convidado para colaborar no ${orgName}`,
    html: `<!DOCTYPE html>
<html lang="pt-BR" bgcolor="#ffffff">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Convite de colaboracao</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 16px;">
<table width="420" cellpadding="0" cellspacing="0" border="0" style="width:420px;max-width:420px;">
<tr>
<td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 0 20px 0;">
${LOGO_BLOCK}
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;border-radius:8px;overflow:hidden;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:28px 24px;">
<p style="margin:0 0 6px 0;font-size:20px;font-weight:600;color:#111111;font-family:Arial,sans-serif;line-height:1.3;">Ola, ${name}!</p>
<p style="margin:0 0 20px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">
<span style="color:#111111;font-weight:600;">${coachName}</span> te convidou para colaborar na plataforma
<span style="color:#111111;font-weight:600;">${orgName}</span> como
<span style="color:#111111;font-weight:600;">${role}</span>.
</p>
<p style="margin:0 0 24px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">
Clique no botao abaixo para criar sua senha e comecar a usar o painel.
</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:6px;padding:13px 28px;">
<a href="${inviteUrl}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;display:block;white-space:nowrap;">Aceitar convite &rarr;</a>
</td>
</tr>
</table>
</td></tr>
</table>
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
Este link expira em 24 horas. Se voce nao esperava este convite, ignore este e-mail.
</p>
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:16px 24px;border-top:1px solid #e0e0e0;">
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
Este e-mail foi enviado automaticamente. Nao responda a esta mensagem.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function boasVindasTreinadorTemplate(nome: string, orgName: string, appUrl: string) {
  return {
    subject: `Bem-vindo(a) a ORBI Health, ${nome}!`,
    html: `<!DOCTYPE html>
<html lang="pt-BR" bgcolor="#ffffff">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bem-vindo(a)</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 16px;">
<table width="420" cellpadding="0" cellspacing="0" border="0" style="width:420px;max-width:420px;">
<tr>
<td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 0 20px 0;">
${LOGO_BLOCK}
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;border-radius:8px;overflow:hidden;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:28px 24px;">
<p style="margin:0 0 6px 0;font-size:20px;font-weight:600;color:#111111;font-family:Arial,sans-serif;line-height:1.3;">Ola, ${nome}! &#127881;</p>
<p style="margin:0 0 24px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">
Sua conta na <span style="color:#111111;font-weight:600;">${orgName}</span> ja esta ativa. Estamos felizes em ter voce com a gente nessa jornada.
</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:6px;padding:13px 28px;">
<a href="${appUrl}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;display:block;white-space:nowrap;">Acessar meu painel</a>
</td>
</tr>
</table>
</td></tr>
</table>
<p style="margin:0;font-size:13px;color:#999999;font-family:Arial,sans-serif;line-height:1.6;">
Precisa de ajuda para comecar? Responda este e-mail que a gente te ajuda.
</p>
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:16px 24px;border-top:1px solid #e0e0e0;">
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
Este e-mail foi enviado automaticamente. Nao responda a esta mensagem.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function cobrancaGeradaTemplate(nome: string, orgName: string, descricao: string, valorFmt: string, dateFmt: string, link: string) {
  return {
    subject: `Nova cobranca — ${descricao}`,
    html: `<!DOCTYPE html>
<html lang="pt-BR" bgcolor="#ffffff">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Nova cobranca</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 16px;">
<table width="420" cellpadding="0" cellspacing="0" border="0" style="width:420px;max-width:420px;">
<tr>
<td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 0 20px 0;">
${LOGO_BLOCK}
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;border-radius:8px;overflow:hidden;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:28px 24px;">
<p style="margin:0 0 6px 0;font-size:20px;font-weight:600;color:#111111;font-family:Arial,sans-serif;line-height:1.3;">Ola, ${nome}!</p>
<p style="margin:0 0 24px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">
${orgName} gerou uma nova cobranca pra voce.
</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#e8e8e8" style="background-color:#e8e8e8;border-radius:6px;padding:16px 20px;">
<p style="margin:0 0 6px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">
<span style="color:#888888;">Descricao:</span>
<span style="color:#111111;font-weight:600;margin-left:6px;">${descricao}</span>
</p>
<p style="margin:0 0 6px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">
<span style="color:#888888;">Valor:</span>
<span style="color:#111111;font-weight:600;margin-left:6px;">${valorFmt}</span>
</p>
<p style="margin:0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">
<span style="color:#888888;">Vencimento:</span>
<span style="color:#111111;font-weight:600;margin-left:6px;">${dateFmt}</span>
</p>
</td>
</tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;margin-bottom:24px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:6px;padding:13px 28px;">
<a href="${link}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;display:block;white-space:nowrap;">Pagar agora</a>
</td>
</tr>
</table>
</td></tr>
</table>
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:16px 24px;border-top:1px solid #e0e0e0;">
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
Este e-mail foi enviado automaticamente. Nao responda a esta mensagem.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function cobrancaAtrasadaTemplate(nome: string, orgName: string, descricao: string, valorFmt: string, dateFmt: string, link: string | null) {
  return {
    subject: `Pagamento em atraso — ${descricao}`,
    html: `<!DOCTYPE html>
<html lang="pt-BR" bgcolor="#ffffff">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Pagamento em atraso</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 16px;">
<table width="420" cellpadding="0" cellspacing="0" border="0" style="width:420px;max-width:420px;">
<tr>
<td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 0 20px 0;">
${LOGO_BLOCK}
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;border-radius:8px;overflow:hidden;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:28px 24px;">
<p style="margin:0 0 6px 0;font-size:20px;font-weight:600;color:#111111;font-family:Arial,sans-serif;line-height:1.3;">Ola, ${nome}!</p>
<p style="margin:0 0 24px 0;font-size:14px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">
Identificamos que o pagamento de <span style="color:#111111;font-weight:600;">${descricao}</span> (${valorFmt}), que venceu em ${dateFmt}, ainda nao foi regularizado com ${orgName}.
</p>
${link ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#dc2626" style="background-color:#dc2626;border-radius:6px;padding:13px 28px;">
<a href="${link}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;display:block;white-space:nowrap;">Regularizar agora</a>
</td>
</tr>
</table>
</td></tr>
</table>` : ""}
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;line-height:1.6;">
Regularize o quanto antes para manter seu acesso ativo.
</p>
</td>
</tr>
<tr>
<td bgcolor="#f4f4f4" style="background-color:#f4f4f4;padding:16px 24px;border-top:1px solid #e0e0e0;">
<p style="margin:0;font-size:12px;color:#999999;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
Este e-mail foi enviado automaticamente. Nao responda a esta mensagem.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

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
    } else if (type === "boas_vindas_treinador") {
      const { nome, orgName, appUrl } = data;
      if (!nome || !orgName || !appUrl) {
        return json({ error: "Missing fields: nome, orgName, appUrl" }, 400);
      }
      const tpl = boasVindasTreinadorTemplate(nome, orgName, appUrl);
      subject = tpl.subject;
      html    = tpl.html;
    } else if (type === "cobranca_gerada") {
      const { nome, orgName, descricao, valorFmt, dateFmt, link } = data;
      if (!nome || !orgName || !descricao || !valorFmt || !dateFmt || !link) {
        return json({ error: "Missing fields: nome, orgName, descricao, valorFmt, dateFmt, link" }, 400);
      }
      const tpl = cobrancaGeradaTemplate(nome, orgName, descricao, valorFmt, dateFmt, link);
      subject = tpl.subject;
      html    = tpl.html;
    } else if (type === "cobranca_atrasada") {
      const { nome, orgName, descricao, valorFmt, dateFmt, link } = data;
      if (!nome || !orgName || !descricao || !valorFmt || !dateFmt) {
        return json({ error: "Missing fields: nome, orgName, descricao, valorFmt, dateFmt" }, 400);
      }
      const tpl = cobrancaAtrasadaTemplate(nome, orgName, descricao, valorFmt, dateFmt, link ?? null);
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
