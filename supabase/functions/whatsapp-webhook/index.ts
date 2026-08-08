// Recebe os webhooks globais da Evolution API (connection.update, qrcode.updated,
// messages.upsert) e atualiza o status de conexão / grava mensagens da org
// correspondente. Autenticação: token no query string (?token=...), não JWT —
// quem chama é a Evolution API, não um usuário logado. Mesmo padrão do asaas-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Só compara os últimos 8 dígitos — evita ficar refém de variação de DDI/9º
// dígito entre o que foi cadastrado e o JID que o WhatsApp manda.
function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.slice(-8);
}

async function findRecipient(orgId: string, remoteJid: string) {
  const phone = normalizePhone(remoteJid.split("@")[0]);
  if (!phone) return null;

  const [alunos, leads] = await Promise.all([
    supabase.from("alunos").select("id, telefone").eq("org_id", orgId),
    supabase.from("leads").select("id, whatsapp").eq("org_id", orgId),
  ]);

  const aluno = alunos.data?.find((a) => normalizePhone(a.telefone) === phone);
  if (aluno) return { aluno_id: aluno.id as string, lead_id: null as string | null };

  const lead = leads.data?.find((l) => normalizePhone(l.whatsapp) === phone);
  if (lead) return { aluno_id: null as string | null, lead_id: lead.id as string };

  return null;
}

function extractText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  if (typeof message.conversation === "string") return message.conversation;
  const extended = message.extendedTextMessage as Record<string, unknown> | undefined;
  if (typeof extended?.text === "string") return extended.text;
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const event = String(payload.event ?? "").toLowerCase();
  const instanceName = payload.instance as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;

  if (!instanceName) {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("whatsapp_instance_name", instanceName)
    .maybeSingle();

  if (!org) {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  if (event === "connection.update") {
    const state = (data?.state as string | undefined) ?? null;

    await supabase.from("whatsapp_connection_events").insert({
      org_id: org.id,
      event_type: event,
      status: state,
      raw_payload: payload,
    });

    if (state === "open") {
      await supabase.from("organizations").update({
        whatsapp_status: "connected",
        whatsapp_connected_at: new Date().toISOString(),
      }).eq("id", org.id);
    } else if (state === "close") {
      await supabase.from("organizations").update({
        whatsapp_status: "disconnected",
        whatsapp_last_disconnected_at: new Date().toISOString(),
      }).eq("id", org.id);
    } else if (state === "connecting") {
      await supabase.from("organizations").update({
        whatsapp_status: "connecting",
      }).eq("id", org.id);
    }
  }

  if (event === "messages.upsert") {
    const key = data?.key as Record<string, unknown> | undefined;
    const remoteJid = key?.remoteJid as string | undefined;
    const waMessageId = key?.id as string | undefined;
    const fromMe = Boolean(key?.fromMe);
    const text = extractText(data?.message as Record<string, unknown> | undefined);

    // Mensagens de mídia (áudio, imagem, etc.) ainda não são suportadas nesse
    // MVP — só texto. Sem texto extraído, não tem o que guardar.
    if (remoteJid && text) {
      const recipient = await findRecipient(org.id, remoteJid);
      // Número desconhecido (não é aluno nem lead da org) — não grava, porque
      // a tabela exige vínculo com um dos dois.
      if (recipient) {
        const { error } = await supabase.from("whatsapp_messages").insert({
          org_id: org.id,
          aluno_id: recipient.aluno_id,
          lead_id: recipient.lead_id,
          direction: fromMe ? "outbound" : "inbound",
          content: text,
          wa_message_id: waMessageId ?? null,
        });
        // Ignora conflito de wa_message_id (mensagem já gravada quando foi
        // enviada pelo whatsapp-send-message, e chega de novo aqui como eco).
        if (error && error.code !== "23505") {
          console.error("[whatsapp-webhook] erro ao gravar mensagem:", error.message);
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
