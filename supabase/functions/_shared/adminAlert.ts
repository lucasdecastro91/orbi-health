// adminAlert.ts — alertas de risco de cartão pro Lucas (spec
// docs/superpowers/specs/2026-10-01-limite-reserva-cartao-design.md).
// Usado pelo asaas-webhook (alertas reais) e pelo testar-alerta (mesmo código
// em modo teste: sem mínimo de volume, sem dedup, sem gravar log, assunto com
// "[TESTE]"). Manda direto pelo Resend com destinatário FIXO — não passa pelo
// enviar-email, que é público e serve todos os outros e-mails do app.

import { todayBR, addDays, ALERT_THRESHOLD_CENTS } from "./cardRisk.ts";

const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_ALERT_EMAIL = "contato@orbihealth.com.br";

export interface AlertOptions { test?: boolean }

const fmtBRL = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escHtml = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Retorna true se o Resend aceitou o e-mail.
export async function sendAdminAlert(titulo: string, linhas: string[], opts: AlertOptions = {}): Promise<boolean> {
  if (!RESEND_API_KEY) { console.error("[adminAlert] RESEND_API_KEY ausente — alerta não enviado"); return false; }
  const tag = opts.test ? "[ORBI alerta][TESTE]" : "[ORBI alerta]";
  try {
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">`
      + (opts.test ? `<p style="margin:0 0 12px;color:#b45309"><b>Disparo de TESTE — pode ignorar.</b></p>` : "")
      + `<h2 style="font-size:16px;margin:0 0 12px">${escHtml(titulo)}</h2>`
      + linhas.map((l) => `<p style="margin:4px 0">${escHtml(l)}</p>`).join("")
      + `</div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "ORBI Health <noreply@orbihealth.com.br>",
        to: [ADMIN_ALERT_EMAIL],
        subject: `${tag} ${titulo.slice(0, 120)}`,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error("[adminAlert] Resend:", res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("[adminAlert] Resend:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Alerta quando uma subconta passa de R$ 3.000 pagos no cartão em 30 dias.
// Máx. 1 entregue por org a cada 30 dias. Best-effort: nunca lança.
// Retorna true se mandou e-mail.
// deno-lint-ignore no-explicit-any
export async function maybeAlertCardVolume(supabase: any, orgId: string, opts: AlertOptions = {}): Promise<boolean> {
  try {
    const { data: sub } = await supabase
      .from("asaas_subaccounts").select("aprovado_em")
      .eq("org_id", orgId).eq("status", "aprovado").maybeSingle();
    if (!sub) return false;

    const { data: vol, error: volErr } = await supabase.rpc("card_paid_volume_30d", { p_org_id: orgId });
    if (volErr) { console.error("[adminAlert] card_paid_volume_30d:", volErr.message); return false; }
    if (!opts.test && Math.round(Number(vol) * 100) < ALERT_THRESHOLD_CENTS) return false;

    if (!opts.test) {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: recent, error: recentErr } = await supabase
        .from("notification_logs").select("id")
        .eq("org_id", orgId).eq("notification_type", "alerta_volume_cartao")
        .eq("delivered", true).gte("created_at", since).limit(1);
      // Sem conseguir checar o dedup, não manda (evita e-mail em loop).
      if (recentErr) { console.error("[adminAlert] dedup:", recentErr.message); return false; }
      if (recent?.length) return false;
    }

    const { data: org } = await supabase
      .from("organizations").select("name, slug, owner_id").eq("id", orgId).maybeSingle();
    if (!org) return false;

    const { data: pagas } = await supabase
      .from("cobrancas").select("aluno_id")
      .eq("org_id", orgId).eq("forma_pagamento", "CREDIT_CARD").not("asaas_id", "is", null)
      .in("status", ["RECEIVED", "CONFIRMED"]).gte("data_pagamento", addDays(todayBR(), -30));
    const alunoIds = [...new Set(((pagas ?? []) as { aluno_id: string }[]).map((p) => p.aluno_id))];
    let semTreino = 0;
    if (alunoIds.length) {
      const { data: logs } = await supabase.from("treino_sessoes_log").select("aluno_id").in("aluno_id", alunoIds);
      const comTreino = new Set(((logs ?? []) as { aluno_id: string }[]).map((l) => l.aluno_id));
      semTreino = alunoIds.filter((id) => !comTreino.has(id)).length;
    }
    const dias = sub.aprovado_em
      ? Math.floor((Date.now() - new Date(sub.aprovado_em).getTime()) / 86400000)
      : null;

    const titulo = `Volume de cartão alto: ${org.name}`;
    const linhas = [
      `Treinador: ${org.name} (/${org.slug})`,
      `Vendas pagas no cartão nos últimos 30 dias: ${fmtBRL(Number(vol))} (${(pagas ?? []).length} cobranças)`,
      `Carteira aprovada há: ${dias == null ? "data desconhecida" : `${dias} dias`}`,
      `Alunos pagantes no cartão sem nenhum treino concluído: ${semTreino} de ${alunoIds.length}`,
    ];
    const sent = await sendAdminAlert(titulo, linhas, opts);
    if (!opts.test) {
      const { error: logErr } = await supabase.from("notification_logs").insert({
        recipient_id: org.owner_id, org_id: orgId, notification_type: "alerta_volume_cartao",
        title: titulo, body: linhas.join("\n"), delivered: sent,
      });
      if (logErr) console.error("[adminAlert] notification_logs:", logErr.message);
    }
    return sent;
  } catch (e) {
    console.error("[adminAlert] maybeAlertCardVolume:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Chargeback em qualquer cobrança (subconta ou master): e-mail imediato.
// Best-effort: nunca lança. Retorna true se mandou e-mail.
export async function alertChargeback(
  // deno-lint-ignore no-explicit-any
  supabase: any, event: string, payment: Record<string, unknown> | undefined, opts: AlertOptions = {},
): Promise<boolean> {
  try {
    const paymentId = payment?.id as string | undefined;
    let orgNome = "org desconhecida";
    let descricao = "";
    if (paymentId) {
      const { data: cob } = await supabase
        .from("cobrancas").select("org_id, descricao").eq("asaas_id", paymentId).maybeSingle();
      if (cob) {
        descricao = cob.descricao ?? "";
        const { data: org } = await supabase.from("organizations").select("name, slug").eq("id", cob.org_id).maybeSingle();
        if (org) orgNome = `${org.name} (/${org.slug})`;
      }
    }
    const chargeback = payment?.chargeback as Record<string, unknown> | undefined;
    const titulo = `Chargeback: ${orgNome}`;
    const linhas = [
      `Evento: ${event}`,
      `Treinador: ${orgNome}`,
      `Cobrança: ${descricao || "(não encontrada no ORBI — pode ser parcela 2+ de um parcelamento)"}`,
      `Valor: ${fmtBRL(Number(payment?.value ?? 0))}`,
      `Motivo: ${String(chargeback?.reason ?? "não informado")}`,
      `ID do pagamento no Asaas: ${paymentId ?? "?"}`,
    ];
    return await sendAdminAlert(titulo, linhas, opts);
  } catch (e) {
    console.error("[adminAlert] alertChargeback:", e instanceof Error ? e.message : e);
    return false;
  }
}
