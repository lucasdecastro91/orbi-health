/**
 * notify-scheduled — Edge Function disparada via cron job do Supabase
 *
 * Aceita um parâmetro `type` no body:
 *   "meals"       → notifica refeições próximas (5 min antes)
 *   "hydration"   → lembrete de hidratação a cada 2h (7h-21h)
 *   "workout"     → lembrete do treino no horário configurado
 *   "motivational"→ frase motivacional diária
 *
 * Cron jobs sugeridos (Supabase Dashboard → Edge Functions → Cron):
 *   meals:        * * * * *   (a cada minuto — filtra dentro da função)
 *   hydration:    0 7-21/2 * * *  (a cada 2h entre 7h e 21h BRT)
 *   workout:      * * * * *   (a cada minuto — filtra pelo horário do aluno)
 *   motivational: 0 8 * * *   (8h todo dia)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@orbipro.com.br";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Hora atual no fuso de Brasília (UTC-3)
function brazilHour(): number {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
}
function brazilMinute(): number {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCMinutes();
}
function brazilTimeStr(): string {
  const h = String(brazilHour()).padStart(2, "0");
  const m = String(brazilMinute()).padStart(2, "0");
  return `${h}:${m}`;
}
function brazilToday(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ── Envia push para um subscription endpoint ──────────────────────────────

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string }
) {
  try {
    // Usa a send-push function para delegar envio e evitar duplicar lógica VAPID
    await supabase.functions.invoke("send-push", {
      body: {
        subscriptions: [{ endpoint, keys: { p256dh, auth } }],
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? "/icon-192.png",
        url: payload.url ?? "/",
        tag: payload.tag ?? "notification",
      },
    });
  } catch (e) {
    console.error("[notify-scheduled] sendWebPush error:", e);
  }
}

// ── Busca subscriptions de um usuário ────────────────────────────────────

async function getSubscriptions(userId: string) {
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  return data ?? [];
}

// ── Checa preferência de notificação ─────────────────────────────────────

async function isEnabled(userId: string, field: string): Promise<boolean> {
  const { data } = await supabase
    .from("notification_preferences")
    .select(field)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return true; // padrão: habilitado
  return (data as Record<string, unknown>)[field] as boolean ?? true;
}

async function isDND(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("notification_preferences")
    .select("dnd_enabled, dnd_start, dnd_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.dnd_enabled) return false;

  const now = brazilTimeStr();
  const start = data.dnd_start as string;
  const end   = data.dnd_end   as string;

  // DND cruza meia-noite?
  if (start > end) return now >= start || now < end;
  return now >= start && now < end;
}

// ── Log de notificação ────────────────────────────────────────────────────

async function logNotification(params: {
  recipient_id: string;
  org_id?: string;
  notification_type: string;
  title: string;
  body: string;
  tag?: string;
}) {
  await supabase.from("notification_logs").insert({
    ...params,
    delivered: true,
  });
}

// ── HANDLERS por tipo ─────────────────────────────────────────────────────

async function handleMeals() {
  const nowStr = brazilTimeStr();
  const today  = brazilToday();

  // Busca todas as refeições com horário = agora + 5 min
  const targetHour   = brazilHour();
  const targetMinute = brazilMinute() + 5;
  const targetStr = `${String(targetHour).padStart(2,"0")}:${String(targetMinute % 60).padStart(2,"0")}`;

  // Busca planos de dieta com horário de refeição coincidindo
  const { data: meals } = await supabase
    .from("dieta_refeicoes")
    .select("id, nome, horario, dieta_id, dietas!inner(aluno_id, org_id, ativa)")
    .eq("horario", targetStr)
    .eq("dietas.ativa", true);

  if (!meals?.length) return;

  for (const meal of meals) {
    const dieta = (meal as Record<string,unknown>).dietas as Record<string,unknown>;
    const alunoId = dieta.aluno_id as string;
    const orgId   = dieta.org_id as string;

    // Verifica se já marcou a refeição como concluída hoje
    const { data: done } = await supabase
      .from("meal_completions")
      .select("id")
      .eq("meal_id", meal.id)
      .eq("completed_date", today)
      .maybeSingle();
    if (done) continue;

    if (await isDND(alunoId)) continue;
    if (!await isEnabled(alunoId, "meals_enabled")) continue;

    const subs = await getSubscriptions(alunoId);
    const title = `🍽️ ${meal.nome}`;
    const body  = "Hora da refeição! Siga sua dieta e registre no app.";

    for (const sub of subs) {
      await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, { title, body, tag: `meal-${meal.id}` });
    }
    await logNotification({ recipient_id: alunoId, org_id: orgId, notification_type: "meal", title, body, tag: `meal-${meal.id}` });
  }
}

async function handleHydration() {
  const today = brazilToday();
  const hour  = brazilHour();

  if (hour < 7 || hour > 21) return;

  // Busca todos os alunos com hidratação habilitada e meta não atingida
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, org_id")
    .eq("hydration_enabled", true);

  if (!prefs?.length) return;

  for (const pref of prefs) {
    const { user_id, org_id } = pref as { user_id: string; org_id: string };

    // Verifica meta de hidratação
    const { data: hLog } = await supabase
      .from("hydration_logs")
      .select("glasses, goal_glasses")
      .eq("user_id", user_id)
      .eq("log_date", today)
      .maybeSingle();

    if (hLog && hLog.glasses >= hLog.goal_glasses) continue; // já atingiu meta

    if (await isDND(user_id)) continue;

    const subs = await getSubscriptions(user_id);
    const title = "💧 Hidratação";
    const body  = "Hora de se hidratar! Beba água agora.";

    for (const sub of subs) {
      await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, { title, body, tag: "hydration" });
    }
    await logNotification({ recipient_id: user_id, org_id, notification_type: "hydration", title, body });
  }
}

async function handleWorkout() {
  const nowStr = brazilTimeStr();
  const today  = brazilToday();

  // Alunos cujo horário de treino = agora
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, org_id, workout_time")
    .eq("workout_enabled", true)
    .eq("workout_time", nowStr);

  if (!prefs?.length) return;

  for (const pref of prefs) {
    const { user_id, org_id } = pref as { user_id: string; org_id: string };
    if (await isDND(user_id)) continue;

    // Verifica se tem treino hoje
    const { data: aluno } = await supabase
      .from("alunos")
      .select("id, org_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!aluno) continue;

    const { data: treino } = await supabase
      .from("treinos_aluno")
      .select("id")
      .eq("aluno_id", aluno.id)
      .eq("dia_semana", new Date(today).getDay())
      .eq("ativo", true)
      .maybeSingle();
    if (!treino) continue;

    const subs = await getSubscriptions(user_id);
    const title = "💪 Hora do treino!";
    const body  = "Seu treino de hoje está te esperando. Vamos lá!";

    for (const sub of subs) {
      await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, { title, body, tag: "workout" });
    }
    await logNotification({ recipient_id: user_id, org_id, notification_type: "workout", title, body });
  }
}

async function handleMotivational() {
  const nowStr = brazilTimeStr();

  // Alunos cujo horário motivacional = agora (padrão 08:00)
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, org_id, motivational_time")
    .eq("motivational_enabled", true)
    .eq("motivational_time", nowStr);

  if (!prefs?.length) return;

  for (const pref of prefs) {
    const { user_id, org_id } = pref as { user_id: string; org_id: string };
    if (await isDND(user_id)) continue;

    // Busca frase aleatória (da org ou global)
    const { data: phrases } = await supabase
      .from("motivational_phrases")
      .select("phrase")
      .or(`org_id.eq.${org_id},org_id.is.null`)
      .eq("active", true);

    if (!phrases?.length) continue;

    const phrase = phrases[Math.floor(Math.random() * phrases.length)].phrase;

    const subs = await getSubscriptions(user_id);
    for (const sub of subs) {
      await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, {
        title: "✨ Motivação do Dia",
        body: phrase,
        tag: "motivational",
      });
    }
    await logNotification({
      recipient_id: user_id,
      org_id,
      notification_type: "motivational",
      title: "✨ Motivação do Dia",
      body: phrase,
    });
  }
}

// ── Update reminder ───────────────────────────────────────────────────────

async function handleUpdateReminder() {
  const today = brazilToday();

  // Busca todos os alunos com data de próxima atualização definida
  const { data: alunos } = await supabase
    .from("alunos")
    .select("id, user_id, org_id, treinador_id, form_atualizacao_ultima_data")
    .not("form_atualizacao_ultima_data", "is", null)
    .not("user_id", "is", null);

  if (!alunos?.length) return;

  for (const aluno of alunos) {
    const dueDate = aluno.form_atualizacao_ultima_data as string;
    const userId  = aluno.user_id as string;
    const orgId   = aluno.org_id  as string;

    // Calcula diferença em dias (negativo = já venceu)
    const due  = new Date(dueDate);
    const now  = new Date(today);
    const diff = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Checa se aluno já enviou atualização a partir da data agendada
    const { data: resposta } = await supabase
      .from("atualizacao_respostas")
      .select("id")
      .eq("student_id", userId)
      .gte("created_at", dueDate)
      .maybeSingle();
    const jaEnviou = Boolean(resposta);

    if (diff === 2 || diff === 1 || diff === 0) {
      // Não notifica se já enviou
      if (jaEnviou) continue;

      // Checa se já foi enviada essa notificação hoje para esse aluno
      const tag = `update_reminder_${diff}d_${dueDate}`;
      const { data: logged } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("recipient_id", userId)
        .eq("tag", tag)
        .maybeSingle();
      if (logged) continue;

      if (await isDND(userId)) continue;

      const dueFmt = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
      let title = "";
      let body  = "";
      if (diff === 2) {
        title = "📋 Lembrete de atualização";
        body  = `Sua atualização vence em 2 dias (${dueFmt}). Não esqueça de enviar!`;
      } else if (diff === 1) {
        title = "📋 Lembrete de atualização";
        body  = "Amanhã é o prazo da sua atualização! Não esqueça de enviar!";
      } else {
        title = "📋 Atualização — hoje é o dia!";
        body  = "Hoje é o dia da sua atualização! Clique para enviar agora.";
      }

      const subs = await getSubscriptions(userId);
      for (const sub of subs) {
        await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, { title, body, tag });
      }
      await logNotification({ recipient_id: userId, org_id: orgId, notification_type: "update_reminder", title, body, tag });
      // Sino do app
      await supabase.from("notificacoes").insert({
        user_id: userId, org_id: orgId,
        titulo: title, mensagem: body, tipo: "update_reminder", lida: false,
      });

    } else if (diff < 0 && !jaEnviou) {
      // Pós-vencimento e aluno não enviou

      // Notificação diária para o aluno
      const tagAluno = `update_reminder_overdue_aluno_${today}_${dueDate}`;
      const { data: loggedAluno } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("recipient_id", userId)
        .eq("tag", tagAluno)
        .maybeSingle();

      if (!loggedAluno) {
        if (!await isDND(userId)) {
          const dueFmt = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
          const titleA = "⚠️ Atualização em atraso";
          const bodyA  = `Sua atualização venceu em ${dueFmt}. Envie o quanto antes para que seu plano seja ajustado.`;
          const subsA  = await getSubscriptions(userId);
          for (const sub of subsA) {
            await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, { title: titleA, body: bodyA, tag: tagAluno });
          }
          await logNotification({ recipient_id: userId, org_id: orgId, notification_type: "update_reminder_overdue", title: titleA, body: bodyA, tag: tagAluno });
          // Sino do app — aluno
          await supabase.from("notificacoes").insert({
            user_id: userId, org_id: orgId,
            titulo: titleA, mensagem: bodyA, tipo: "update_reminder_overdue", lida: false,
          });
        }
      }

      // Notificação única para o treinador (1x apenas)
      const trainerId = aluno.treinador_id as string | null;
      if (trainerId) {
        const tagTrainer = `update_reminder_overdue_trainer_${trainerId}_${userId}_${dueDate}`;
        const { data: loggedTrainer } = await supabase
          .from("notification_logs")
          .select("id")
          .eq("recipient_id", trainerId)
          .eq("tag", tagTrainer)
          .maybeSingle();

        if (!loggedTrainer) {
          // Busca nome do aluno
          const { data: profile } = await supabase
            .from("profiles")
            .select("nome")
            .eq("id", userId)
            .maybeSingle();
          const alunoNome = (profile?.nome as string) ?? "Um aluno";
          const dueFmt = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
          const titleT = "⚠️ Aluno sem atualização";
          const bodyT  = `${alunoNome} não enviou a atualização que venceu em ${dueFmt}.`;
          const subsT  = await getSubscriptions(trainerId);
          for (const sub of subsT) {
            await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, { title: titleT, body: bodyT, tag: tagTrainer });
          }
          await logNotification({ recipient_id: trainerId, org_id: orgId, notification_type: "update_reminder_overdue_trainer", title: titleT, body: bodyT, tag: tagTrainer });
          // Sino do app — treinador
          await supabase.from("notificacoes").insert({
            user_id: trainerId, org_id: orgId, aluno_id: aluno.id,
            titulo: titleT, mensagem: bodyT, tipo: "update_reminder_overdue_trainer", lida: false,
          });
        }
      }
    }
  }
}

// ── Servidor ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const { type } = await req.json().catch(() => ({ type: "motivational" }));

  try {
    switch (type) {
      case "meals":           await handleMeals();          break;
      case "hydration":       await handleHydration();      break;
      case "workout":         await handleWorkout();         break;
      case "motivational":    await handleMotivational();    break;
      case "update_reminder": await handleUpdateReminder();  break;
      default:
        return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true, type }), {
      headers: { "Content-Type": "application/json" }, status: 200,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notify-scheduled]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
