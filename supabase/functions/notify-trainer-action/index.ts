/**
 * notify-trainer-action — dispara push para alunos quando treinador age
 *
 * Payload:
 *   type: "workout_updated" | "diet_updated" | "appointment_created" | "appointment_reminder" | "manual"
 *   student_id: uuid do aluno (user_id)
 *   org_id: uuid da organização
 *   trainer_name: string
 *   student_name: string
 *   extra: Record<string, string>   — dados adicionais (data, hora, texto livre)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActionPayload {
  type: string;
  student_id: string;  // auth user_id do aluno
  org_id: string;
  trainer_name?: string;
  student_name?: string;
  extra?: Record<string, string>;
}

function buildNotification(payload: ActionPayload): { title: string; body: string; tag: string } {
  const tn = payload.trainer_name ?? "Seu treinador";
  const sn = payload.student_name ?? "Olá";

  switch (payload.type) {
    case "workout_updated":
      return {
        title: "📋 Treino Atualizado",
        body: `${sn}! Seu treino foi atualizado por ${tn}. Confira as novidades!`,
        tag: "workout_updated",
      };
    case "diet_updated":
      return {
        title: "🥗 Dieta Atualizada",
        body: `${sn}! Sua dieta foi atualizada por ${tn}. Confira as novidades!`,
        tag: "diet_updated",
      };
    case "appointment_created": {
      const date = payload.extra?.date ?? "";
      const time = payload.extra?.time ?? "";
      return {
        title: "📅 Nova consulta agendada",
        body: `Você tem uma consulta em ${date} às ${time}.`,
        tag: "appointment_created",
      };
    }
    case "appointment_reminder": {
      const time = payload.extra?.time ?? "";
      return {
        title: "⏰ Lembrete de consulta",
        body: `Sua consulta é amanhã às ${time}. Não esqueça!`,
        tag: "appointment_reminder",
      };
    }
    case "manual": {
      return {
        title: payload.extra?.title ?? "📣 Mensagem do treinador",
        body: payload.extra?.body ?? "",
        tag: "manual",
      };
    }
    default:
      return { title: "📣 Notificação", body: "Você tem uma nova notificação.", tag: "notification" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Autentica (treinador deve estar logado ou usar service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  const body: ActionPayload = await req.json();
  if (!body.student_id || !body.org_id || !body.type) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verifica preferências do aluno
  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("trainer_actions_enabled, dnd_enabled, dnd_start, dnd_end")
    .eq("user_id", body.student_id)
    .maybeSingle();

  if (pref?.trainer_actions_enabled === false) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notif = buildNotification(body);

  // Envia via send-push
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", body.student_id);

  if (subs?.length) {
    await supabase.functions.invoke("send-push", {
      body: {
        subscriptions: subs.map((s: { endpoint: string; p256dh: string; auth: string }) => ({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        })),
        title: notif.title,
        body: notif.body,
        icon: "/icon-192.png",
        tag: notif.tag,
      },
    });
  }

  // Loga
  await supabase.from("notification_logs").insert({
    org_id: body.org_id,
    recipient_id: body.student_id,
    sender_id: user?.id ?? null,
    notification_type: body.type === "manual" ? "manual" : "trainer_action",
    title: notif.title,
    body: notif.body,
    tag: notif.tag,
    delivered: (subs?.length ?? 0) > 0,
  });

  return new Response(JSON.stringify({ ok: true, sent: subs?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
