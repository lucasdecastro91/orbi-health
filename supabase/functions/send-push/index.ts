/**
 * send-push Edge Function
 * Sends a Web Push notification to one or more users.
 *
 * Required Supabase secrets (set via Supabase Dashboard → Project Settings → Edge Functions):
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key
 *   VAPID_SUBJECT      — mailto: or https: contact (e.g. "mailto:admin@orbipro.com.br")
 *
 * Request body (JSON):
 * {
 *   user_ids: string[],      // target users (required)
 *   title:    string,
 *   body:     string,
 *   icon?:    string,        // default "/logo-icon.png"
 *   url?:     string,        // click-through URL
 *   tag?:     string,        // notification tag (deduplication)
 * }
 *
 * Called from:
 *  - coach/Mensagens.tsx when trainer sends a message
 *  - create-student when a new student is created
 *  - (future) scheduled reminders
 */

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="https://esm.sh/@types/web-push@3.6.3"
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      .select("endpoint, p256dh, auth_key")
      .in("user_id", user_ids);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({ title, body: msgBody, icon, tag, data: { url } });

    let sent = 0, failed = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
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

    // Remove expired subscriptions
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
