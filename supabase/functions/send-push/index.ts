/**
 * send-push Edge Function
 * Sends a push notification (Web Push and/or native iOS/APNs) to one or more users.
 *
 * Required Supabase secrets (set via Supabase Dashboard → Project Settings → Edge Functions):
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key (Web Push)
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key (Web Push)
 *   VAPID_SUBJECT      — mailto: or https: contact (e.g. "mailto:admin@orbipro.com.br")
 *   APNS_KEY_ID        — APNs Auth Key ID (native iOS push)
 *   APNS_TEAM_ID       — Apple Developer Team ID (native iOS push)
 *   APNS_PRIVATE_KEY   — full .p8 PEM content (native iOS push)
 *   APNS_ENABLED       — "true" to send native iOS push; anything else (incl. unset) skips it
 *
 * Request body (JSON):
 * {
 *   user_ids: string[],      // target users (required)
 *   title:    string,
 *   body:     string,
 *   icon?:    string,        // default "/logo-icon.png" (Web Push only)
 *   url?:     string,        // click-through URL
 *   tag?:     string,        // notification tag (deduplication, Web Push only)
 * }
 *
 * Called from many places across the app (chat message, manual notification,
 * training-plan-updated, cobrança gerada/atrasada, and every cron-driven type
 * in notify-scheduled) — always via this exact { user_ids, title, body, ... }
 * contract, either directly or through notify-trainer-action.
 *
 * Native iOS push is additive, best-effort, and never blocks or affects the
 * Web Push path — same principle used for WhatsApp elsewhere in this project
 * ("canal adicional, nunca substitui push/email").
 */

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="https://esm.sh/@types/web-push@3.6.3"
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APNS_TOPIC = "com.orbihealth.app";

// ─── APNs JWT (ES256 via Web Crypto — não usar a lib `jose`, esse projeto já
// documentou um bug real dela com tokens ES256 nesse runtime Deno, ver
// create-student/index.ts e whatsapp-send-message/index.ts) ────────────────

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(str: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedApnsKey: CryptoKey | null = null;
let cachedApnsJwt: { token: string; iat: number } | null = null;

async function getApnsKey(pem: string): Promise<CryptoKey> {
  if (cachedApnsKey) return cachedApnsKey;
  const der = pemToDer(pem);
  cachedApnsKey = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedApnsKey;
}

// Web Crypto's ECDSA signature já sai no formato raw (r‖s, 64 bytes) que o
// JWS/JWT espera — sem precisar converter de DER.
async function buildApnsJwt(keyId: string, teamId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Token do APNs vale até 1h — reaproveita por 55min pra não reassinar toda chamada.
  if (cachedApnsJwt && now - cachedApnsJwt.iat < 60 * 55) return cachedApnsJwt.token;

  const header  = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(payload))}`;

  const key = await getApnsKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  const token = `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
  cachedApnsJwt = { token, iat: now };
  return token;
}

type ApnsResult = { ok: true } | { ok: false; expired: boolean; reason?: string };

async function sendApnsNotification(
  deviceToken: string,
  jwt: string,
  payload: { title: string; body: string; url: string },
): Promise<ApnsResult> {
  try {
    const res = await fetch(`https://api.push.apple.com/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        "authorization":   `bearer ${jwt}`,
        "apns-topic":      APNS_TOPIC,
        "apns-push-type":  "alert",
        "apns-priority":   "10",
        "content-type":    "application/json",
      },
      body: JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
        url: payload.url,
      }),
    });

    if (res.ok) return { ok: true };

    const data = await res.json().catch(() => ({} as any));
    const reason = data?.reason as string | undefined;
    const expired = reason === "BadDeviceToken" || reason === "Unregistered";
    console.warn("[push][apns] send error:", res.status, reason);
    return { ok: false, expired, reason };
  } catch (err) {
    console.warn("[push][apns] fetch exception:", err);
    return { ok: false, expired: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Env vars
    const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT")     ?? "mailto:admin@orbipro.com.br";
    const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")      ?? "";
    const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const APNS_ENABLED     = Deno.env.get("APNS_ENABLED") === "true";
    const APNS_KEY_ID      = Deno.env.get("APNS_KEY_ID")      ?? "";
    const APNS_TEAM_ID     = Deno.env.get("APNS_TEAM_ID")     ?? "";
    const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const body = await req.json();
    const { user_ids, title, body: msgBody, icon = "/logo-icon.png", url = "/", tag = "gst" } = body;

    if (!user_ids?.length || !title || !msgBody) {
      return new Response(
        JSON.stringify({ error: "user_ids, title, body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch subscriptions for target users (service role bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key, platform")
      .in("user_id", user_ids);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webSubs = subs.filter((s) => s.platform !== "ios");
    const iosSubs = subs.filter((s) => s.platform === "ios");

    let sent = 0, failed = 0;
    const expiredEndpoints: string[] = [];

    // ─── Web Push (VAPID) — sem mudança nenhuma nessa parte ───────────────
    const payload = JSON.stringify({ title, body: msgBody, icon, tag, data: { url } });

    await Promise.all(webSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh!, auth: sub.auth_key! },
          },
          payload,
          { TTL: 60 * 60 * 24 }  // 24h TTL
        );
        sent++;
      } catch (err: any) {
        failed++;
        // 410 Gone = subscription expired, clean up
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
        console.warn("[push] send error:", err.statusCode, err.body);
      }
    }));

    // ─── APNs (iOS nativo) — best-effort, nunca afeta o resultado do Web Push.
    // Kill-switch APNS_ENABLED: desligado por padrão até o backend ser
    // validado e a build nativa existir.
    if (APNS_ENABLED && iosSubs.length > 0) {
      if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
        console.warn("[push][apns] APNS_ENABLED=true mas faltam APNS_KEY_ID/APNS_TEAM_ID/APNS_PRIVATE_KEY — pulando.");
      } else {
        try {
          const jwt = await buildApnsJwt(APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY);
          await Promise.all(iosSubs.map(async (sub) => {
            const result = await sendApnsNotification(sub.endpoint, jwt, { title, body: msgBody, url });
            if (result.ok) {
              sent++;
            } else {
              failed++;
              if (result.expired) expiredEndpoints.push(sub.endpoint);
            }
          }));
        } catch (err) {
          // Falha ao montar o JWT (ex: chave mal configurada) não pode derrubar
          // a resposta inteira nem afetar o que já foi enviado por Web Push.
          console.error("[push][apns] JWT/build error:", err);
        }
      }
    }

    // Remove expired subscriptions (Web Push e APNs compartilham a mesma limpeza —
    // colisão de endpoint entre plataformas é praticamente impossível: URLs vs. hex)
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(
      JSON.stringify({ sent, failed, expired: expiredEndpoints.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
