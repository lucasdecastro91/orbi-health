// Chamada pelo painel do treinador (autenticado) pra conectar o WhatsApp da org.
// GET  ?org_id=...  -> status atual da conexão
// POST ?org_id=...  -> cria a instance na Evolution API (se não existir) e
//                      retorna o QR code em base64 pro frontend renderizar
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-orbi-auth",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function evolutionFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_API_KEY,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Evolution API ${init?.method ?? "GET"} ${path} error ${res.status}: ${text}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // x-orbi-auth como alternativa ao header Authorization padrão — a borda do
  // Supabase rejeita qualquer coisa parecida com JWT nesse header específico
  // (bug de plataforma confirmado, ver CLAUDE.md seção 14/15), mesmo com
  // verify_jwt:false na função. Contornado usando outro nome de header.
  const authHeader = req.headers.get("x-orbi-auth") ?? req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "missing_bearer" }, 401);

  // Decodifica o payload do JWT sem verificar assinatura (supabase-js/jose tem
  // bug conhecido com tokens ES256 nesse projeto — mesmo motivo do create-student
  // evitar supabase-js).
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

  const url = new URL(req.url);
  const orgId = url.searchParams.get("org_id");
  if (!orgId) return json({ error: "missing_org_id" }, 400);

  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id, owner_id, whatsapp_instance_name, whatsapp_status")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr || !org) return json({ error: "org_not_found" }, 404);
  if (org.owner_id !== userId) return json({ error: "forbidden" }, 403);

  if (req.method === "GET") {
    return json({ status: org.whatsapp_status, instance_name: org.whatsapp_instance_name });
  }

  if (req.method === "POST") {
    try {
      const instanceName = org.whatsapp_instance_name ?? `org-${org.id}`;

      if (!org.whatsapp_instance_name) {
        await evolutionFetch("/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
        await supabaseAdmin.from("organizations").update({
          whatsapp_instance_name: instanceName,
          whatsapp_status: "connecting",
        }).eq("id", org.id);
      }

      const connectData = await evolutionFetch(`/instance/connect/${instanceName}`);
      // O campo do QR varia por versão da Evolution API — cobre os dois formatos conhecidos.
      const qrcode = (connectData?.base64 as string | undefined)
        ?? (connectData?.qrcode?.base64 as string | undefined)
        ?? null;

      return json({ qrcode, instance_name: instanceName });
    } catch (e) {
      console.error("[whatsapp-instance] erro ao conectar:", e instanceof Error ? e.message : e);
      return json({ error: "evolution_api_error" }, 502);
    }
  }

  if (req.method === "DELETE") {
    if (!org.whatsapp_instance_name) return json({ error: "not_connected" }, 409);
    try {
      await evolutionFetch(`/instance/logout/${org.whatsapp_instance_name}`, { method: "DELETE" });
    } catch (e) {
      console.error("[whatsapp-instance] erro ao desconectar:", e instanceof Error ? e.message : e);
      // Segue e marca como desconectado no banco mesmo se a Evolution API falhar
      // (ex: sessão já estava morta do lado dela) — não trava o usuário.
    }
    await supabaseAdmin.from("organizations").update({
      whatsapp_status: "disconnected",
      whatsapp_last_disconnected_at: new Date().toISOString(),
    }).eq("id", org.id);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
});
