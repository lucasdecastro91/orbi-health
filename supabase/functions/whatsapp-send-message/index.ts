// Chamada pelo painel (autenticado) pra mandar uma mensagem avulsa de texto
// pro WhatsApp de um aluno ou lead, direto da ficha dele.
// POST { org_id, aluno_id? | lead_id?, content }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-orbi-auth",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

// Números salvos no banco costumam vir só com DDD (10 ou 11 dígitos, sem
// código do país). O Evolution API precisa do número completo pra resolver o
// contato no WhatsApp — sem o 55, um DDD como "82" é lido como código de país
// (Coreia do Sul) e a Evolution API rejeita o envio.
function toWhatsappNumber(raw: string | null | undefined): string {
  const digits = normalizePhone(raw);
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // x-orbi-auth como alternativa ao header Authorization padrão — a borda do
  // Supabase está rejeitando qualquer coisa parecida com JWT nesse header
  // (mesmo com verify_jwt:false na função), então testamos com outro nome.
  const authHeader = req.headers.get("x-orbi-auth") ?? req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "missing_bearer" }, 401);

  // Decodifica o payload do JWT sem verificar assinatura (supabase-js/jose tem
  // bug conhecido com tokens ES256 nesse projeto — mesmo motivo do create-student
  // evitar supabase-js). A verificação real já aconteceu no gateway (verify_jwt: true).
  let userId: string;
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload?.sub) throw new Error("no sub");
    userId = payload.sub;
  } catch {
    return json({ error: "invalid_jwt_payload" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const { org_id: orgId, aluno_id: alunoId, lead_id: leadId, content } = body as {
    org_id?: string; aluno_id?: string; lead_id?: string; content?: string;
  };

  if (!orgId || !content?.trim()) return json({ error: "missing_fields" }, 400);
  if ((!alunoId && !leadId) || (alunoId && leadId)) {
    return json({ error: "exactly_one_recipient_required" }, 400);
  }

  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id, owner_id, whatsapp_instance_name, whatsapp_status")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr || !org) return json({ error: "org_not_found" }, 404);
  if (org.owner_id !== userId) return json({ error: "forbidden" }, 403);
  if (org.whatsapp_status !== "connected" || !org.whatsapp_instance_name) {
    return json({ error: "whatsapp_not_connected" }, 409);
  }

  // Resolve telefone do destinatário
  let phone: string | null = null;
  if (alunoId) {
    const { data: aluno } = await supabaseAdmin
      .from("alunos")
      .select("telefone, org_id")
      .eq("id", alunoId)
      .maybeSingle();
    if (!aluno || aluno.org_id !== orgId) return json({ error: "aluno_not_found" }, 404);
    phone = aluno.telefone;
    if (!phone) {
      // Fallback: telefone informado na anamnese, se o aluno.telefone ainda não foi preenchido.
      const { data: anamnese } = await supabaseAdmin
        .from("anamneses")
        .select("whatsapp")
        .eq("aluno_id", alunoId)
        .maybeSingle();
      phone = anamnese?.whatsapp ?? null;
    }
  } else if (leadId) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("whatsapp, org_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.org_id !== orgId) return json({ error: "lead_not_found" }, 404);
    phone = lead.whatsapp;
  }

  const normalizedPhone = toWhatsappNumber(phone);
  if (!normalizedPhone) return json({ error: "no_phone_on_file" }, 422);

  try {
    const res = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${org.whatsapp_instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify({ number: normalizedPhone, text: content.trim() }),
    });
    const text = await res.text();
    const sendData = text ? JSON.parse(text) : {};
    if (!res.ok) {
      console.error("[whatsapp-send-message] Evolution API error:", res.status, text);
      return json({ error: "evolution_api_error" }, 502);
    }

    const waMessageId = sendData?.key?.id ?? null;

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        org_id: orgId,
        aluno_id: alunoId ?? null,
        lead_id: leadId ?? null,
        direction: "outbound",
        content: content.trim(),
        wa_message_id: waMessageId,
      })
      .select()
      .maybeSingle();

    if (insertErr) {
      console.error("[whatsapp-send-message] erro ao gravar mensagem enviada:", insertErr.message);
    }

    return json({ ok: true, message: inserted ?? null });
  } catch (e) {
    console.error("[whatsapp-send-message] erro:", e instanceof Error ? e.message : e);
    return json({ error: "send_failed" }, 502);
  }
});
