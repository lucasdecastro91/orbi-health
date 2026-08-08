/**
 * notify-scheduled — Edge Function disparada via cron job do Supabase
 *
 * Aceita um parâmetro `type` no body:
 *   "meals"             → notifica refeições próximas (5 min antes), por horário de cada diet_meal
 *   "meals_incomplete"  → aluno com refeições pendentes ~30min após a última refeição do dia
 *   "hydration"         → lembrete de hidratação a cada ~2h (7h-21h BRT), se meta ainda não batida
 *   "morning"           → mensagem única às 8h BRT — menciona o treino do dia quando há um
 *                          previsto (mesma lógica de src/lib/trainingSchedule.ts), senão genérica
 *   "workout_incomplete"→ 20h BRT — aluno tinha treino previsto hoje e ainda não concluiu
 *   "update_reminder"   → lembrete de atualização vencida/a vencer (sem mudanças)
 *   "active_timers"     → timers em andamento (descanso/cardio) que passaram da duração alvo
 *
 * Cron jobs (ver supabase/migrations/20260707000005_notify_cron_jobs.sql):
 *   notify-meals:              * * * * *      (a cada minuto — filtra dentro da função)
 *   notify-meals-incomplete:   * * * * *      (a cada minuto — auto-limitado por horário + dedup)
 *   notify-hydration:          a cada 2 horas (filtra 7h-21h BRT dentro da função)
 *   notify-morning:            0 11 * * *     (11h UTC = 8h BRT)
 *   notify-workout-incomplete: 0 23 * * *     (23h UTC = 20h BRT)
 *   update-reminder-daily:     0 11 * * *     (já existia)
 *   check-active-timers:       * * * * *      (já existia)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@orbipro.com.br";
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") ?? "";
const EVOLUTION_API_KEY  = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.orbihealth.com.br";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Telefone: DDD+numero (10-11 digitos) vira "55DDD..." pra Evolution API ────
function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}
function toWhatsappNumber(raw: string | null | undefined): string {
  const digits = normalizePhone(raw);
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// Cache simples por execução — evita reconsultar a mesma org várias vezes no loop de alunos.
const orgWhatsappCache = new Map<string, { status: string | null; instance: string | null; slug: string | null }>();
async function getOrgWhatsapp(orgId: string) {
  if (orgWhatsappCache.has(orgId)) return orgWhatsappCache.get(orgId)!;
  const { data } = await supabase
    .from("organizations")
    .select("whatsapp_status, whatsapp_instance_name, slug")
    .eq("id", orgId)
    .maybeSingle();
  const result = {
    status: data?.whatsapp_status ?? null,
    instance: data?.whatsapp_instance_name ?? null,
    slug: data?.slug ?? null,
  };
  orgWhatsappCache.set(orgId, result);
  return result;
}

// Link direto pra tela de atualização do aluno — usado no push e no WhatsApp,
// pra dar uma ação real em vez de só pedir pra "clicar" sem nada clicável.
async function getAtualizacaoLink(orgId: string): Promise<string | null> {
  const org = await getOrgWhatsapp(orgId);
  return org.slug ? `${APP_URL}/${org.slug}/aluno/atualizacao` : null;
}

// Fonte oficial é alunos.telefone; anamneses.whatsapp é só fallback de leitura.
async function resolveAlunoPhone(telefone: string | null | undefined, userId: string): Promise<string | null> {
  if (telefone) return telefone;
  const { data } = await supabase.from("anamneses").select("whatsapp").eq("student_id", userId).maybeSingle();
  return data?.whatsapp ?? null;
}

// ── Envia WhatsApp pro aluno, best-effort — nunca bloqueia o fluxo de push ────
async function sendWhatsapp(orgId: string, alunoId: string, phone: string | null, text: string) {
  if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) return;
  const number = toWhatsappNumber(phone);
  if (!number) return;
  const org = await getOrgWhatsapp(orgId);
  if (org.status !== "connected" || !org.instance) return;
  try {
    const res = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${org.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text }),
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error("[notify-scheduled] whatsapp send failed:", res.status, raw);
      return;
    }
    const data = raw ? JSON.parse(raw) : {};
    await supabase.from("whatsapp_messages").insert({
      org_id: orgId, aluno_id: alunoId, direction: "outbound",
      content: text, wa_message_id: data?.key?.id ?? null,
    });
  } catch (e) {
    console.error("[notify-scheduled] whatsapp send error:", e instanceof Error ? e.message : e);
  }
}

// Meta padrão de água quando a dieta não define uma (mesmo valor de src/lib/agua.ts —
// Edge Functions não importam de src/, então duplicado aqui).
const AGUA_META_ML_DEFAULT = 2500;

// ── Hora/data no fuso de Brasília (UTC-3) ──────────────────────────────────

function brazilDate(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}
function brazilHour(): number {
  return brazilDate().getUTCHours();
}
function brazilMinute(): number {
  return brazilDate().getUTCMinutes();
}
function brazilTimeStr(): string {
  const h = String(brazilHour()).padStart(2, "0");
  const m = String(brazilMinute()).padStart(2, "0");
  return `${h}:${m}`;
}
function brazilToday(): string {
  return brazilDate().toISOString().slice(0, 10);
}
/** 0=domingo .. 6=sábado, no fuso de Brasília */
function brazilWeekdayIndex(): number {
  return brazilDate().getUTCDay();
}

// ── Envia push pra um usuário ──────────────────────────────────────────────
// send-push já busca as subscriptions do usuário internamente (por user_id) e
// manda pra todos os dispositivos dele — não precisa (nem devia) buscar aqui.
// Bug encontrado nesta sessão: o código antigo mandava `{ subscriptions: [...] }`,
// um formato que send-push não lê mais (foi trocado pra `{ user_ids: [...] }` —
// ver src/lib/push.ts, o helper client-side "oficial" que já usa esse formato).
// Isso fazia send-push sempre responder 400 e nenhum push ser entregue de verdade,
// mesmo com uma subscription real cadastrada.

async function sendPush(
  userId: string,
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string }
) {
  try {
    await supabase.functions.invoke("send-push", {
      body: {
        user_ids: [userId],
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? "/icon-192.png",
        url: payload.url ?? "/",
        tag: payload.tag ?? "notification",
      },
    });
  } catch (e) {
    console.error("[notify-scheduled] sendPush error:", e);
  }
}

// ── Checa "não perturbe" configurado pelo aluno ──────────────────────────
// (notification_preferences ainda não existe — sem linha, isDND sempre retorna false.
// Mantido só porque handleUpdateReminder já depende disso; handlers novos não usam.)

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

// ── Log de notificação (também usado pra dedup — "já mandei essa hoje?") ──

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

async function alreadyLoggedToday(recipientId: string, tag: string): Promise<boolean> {
  const { data } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("recipient_id", recipientId)
    .eq("tag", tag)
    .maybeSingle();
  return !!data;
}

// ── Treino previsto hoje (mesma lógica de src/lib/trainingSchedule.ts, portada — ────
// ── Edge Functions não importam de src/, funções puras, sem dependência de React) ──

const WEEKDAY_FULL = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const WEEKDAY_ABBR  = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const ACCENT_MARKS_RE = /[̀-ͯ]/g;
const stripAccents = (s: string) => s.normalize("NFD").replace(ACCENT_MARKS_RE, "");

function normalizeWeekday(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = stripAccents(raw).toLowerCase().trim();
  if (s.startsWith("dom")) return "domingo";
  if (s.startsWith("seg")) return "segunda";
  if (s.startsWith("ter")) return "terca";
  if (s.startsWith("quart")) return "quarta";
  if (s.startsWith("quint")) return "quinta";
  if (s.startsWith("sex")) return "sexta";
  if (s.startsWith("sab")) return "sabado";
  return null;
}

interface TreinoLite { id: string; titulo_treino: string; dia_semana: string; }
interface WeekLite { id: string; semana_inicio: number; semana_fim: number; treinos: TreinoLite[]; }

/** YYYY-MM-DD -> Date em UTC (evita ambiguidade de fuso na subtração de dias) */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function getWeekForDate(weeks: WeekLite[], dataInicioISO: string | null | undefined, targetISO: string): WeekLite | null {
  if (!weeks || weeks.length === 0) return null;
  let weekNumber = 1;
  if (dataInicioISO) {
    const start = parseLocalDate(dataInicioISO);
    const target = parseLocalDate(targetISO);
    const diffDays = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    weekNumber = Math.floor(Math.max(0, diffDays) / 7) + 1;
  }
  return weeks.find((w) => weekNumber >= w.semana_inicio && weekNumber <= w.semana_fim) ?? weeks[weeks.length - 1];
}

/** Título do treino previsto hoje pra esse aluno, ou null se não há treino previsto */
async function getScheduledWorkoutTitle(alunoId: string): Promise<string | null> {
  const { data: plano } = await supabase
    .from("planos_treino")
    .select("id, data_inicio")
    .eq("aluno_id", alunoId)
    .eq("ativo", true)
    .maybeSingle();
  if (!plano) return null;

  const { data: semanas } = await supabase
    .from("semanas")
    .select("id, semana_inicio, semana_fim, treinos(id, titulo_treino, dia_semana)")
    .eq("plano_id", plano.id)
    .order("semana_inicio", { ascending: true });

  const weeks = (semanas ?? []) as unknown as WeekLite[];
  const currentWeek = getWeekForDate(weeks, plano.data_inicio as string, brazilToday());
  if (!currentWeek) return null;

  const todayKey = WEEKDAY_FULL[brazilWeekdayIndex()];
  const match = (currentWeek.treinos ?? []).find((t) => normalizeWeekday(t.dia_semana) === todayKey);
  return match ? match.titulo_treino : null;
}

// ── Frases da mensagem da manhã ──────────────────────────────────────────

const MORNING_PHRASES_WORKOUT = [
  "Hoje é dia de treino — bora fazer valer cada série!",
  "Seu treino te espera hoje. Foco na execução, o resultado vem depois.",
  "Um treino de cada vez constrói o resultado que você quer. Hoje é a vez de hoje.",
  "Bora! Hoje tem treino marcado — sua constância é o que faz a diferença.",
  "Cada treino conta. O de hoje também.",
  "Levanta, se arruma e vai — o treino de hoje te aproxima do seu objetivo.",
  "Disciplina não é motivação o tempo todo — é treinar mesmo nos dias difíceis.",
  "Seu eu do futuro agradece o treino de hoje.",
  "Ninguém treina por você — mas o resultado é todo seu. Bora hoje?",
  "O corpo que você quer se constrói um treino por vez. Hoje é um desses dias.",
  "Treino marcado pra hoje — não deixa pra depois o que você pode fazer agora.",
  "Sua evolução não tira folga nos dias de treino. Bora?",
  "Hoje é dia de somar mais um treino na sua sequência.",
  "O único treino que não conta é o que você não faz. Hoje tem um te esperando.",
];

const MORNING_PHRASES_REST = [
  "Bom dia! Hoje é um bom dia pra cuidar da sua rotina, mesmo sem treino marcado.",
  "Descanso também faz parte do progresso — aproveite o dia.",
  "Sem treino hoje, mas sua dieta e hidratação continuam valendo.",
  "Recuperação também é treino. Aproveite o dia.",
  "Hoje o foco pode ser outro: dieta em dia, água em dia, mente tranquila.",
  "Consistência não é só treinar — é também respeitar o descanso.",
  "Bom dia! Aproveite pra cuidar dos outros detalhes da sua rotina hoje.",
  "Cada escolha do dia conta, mesmo sem treino marcado.",
  "Hoje é dia de recarregar. Amanhã tem mais.",
  "O progresso também acontece nos dias de descanso — só não esquece da dieta e da água.",
  "Um dia sem treino é uma chance de reforçar outros hábitos.",
  "Bom dia! Vamos com tudo nos outros pilares hoje?",
  "Descansar bem também é treinar bem.",
  "Hoje sem treino, mas com o mesmo compromisso de sempre.",
];

// ── HANDLERS por tipo ─────────────────────────────────────────────────────

async function handleMeals() {
  const today = brazilToday();
  const todayAbbr = WEEKDAY_ABBR[brazilWeekdayIndex()];

  // Horário-alvo = agora + 5 min, com o "carry" de minuto pra hora (bug do código antigo:
  // não somava a hora quando o minuto passava de 59)
  const rawMinute = brazilMinute() + 5;
  const targetHour = (brazilHour() + Math.floor(rawMinute / 60)) % 24;
  const targetStr = `${String(targetHour).padStart(2, "0")}:${String(rawMinute % 60).padStart(2, "0")}`;

  const { data: meals } = await supabase
    .from("diet_meals")
    .select("id, name, time_suggestion, diets!inner(id, student_id, org_id, is_active, dias_semana)")
    .eq("time_suggestion", targetStr)
    .eq("diets.is_active", true);

  if (!meals?.length) return;

  for (const meal of meals as any[]) {
    const diet = meal.diets;
    const diasSemana = diet.dias_semana as string[] | null;
    if (diasSemana && diasSemana.length > 0 && !diasSemana.includes(todayAbbr)) continue;

    const studentId = diet.student_id as string;
    const orgId = diet.org_id as string | null;

    const { count } = await supabase
      .from("meal_completions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("meal_id", meal.id)
      .eq("date", today);
    if ((count ?? 0) > 0) continue;

    const title = `🍽️ ${meal.name}`;
    const body  = "Hora da refeição! Siga sua dieta e registre no app.";
    const tag   = `meal-${meal.id}-${today}`;

    await sendPush(studentId, { title, body, tag });
    if (orgId) await logNotification({ recipient_id: studentId, org_id: orgId, notification_type: "meal", title, body, tag });
  }
}

async function handleMealsIncomplete() {
  const today = brazilToday();
  const todayAbbr = WEEKDAY_ABBR[brazilWeekdayIndex()];
  const nowMinutes = brazilHour() * 60 + brazilMinute();

  const { data: diets } = await supabase
    .from("diets")
    .select("id, student_id, org_id, dias_semana, diet_meals(id, time_suggestion)")
    .eq("is_active", true);

  if (!diets?.length) return;

  for (const diet of diets as any[]) {
    const diasSemana = diet.dias_semana as string[] | null;
    if (diasSemana && diasSemana.length > 0 && !diasSemana.includes(todayAbbr)) continue;

    const meals = (diet.diet_meals ?? []) as { id: string; time_suggestion: string | null }[];
    const timedMeals = meals.filter((m) => m.time_suggestion);
    if (!timedMeals.length) continue;

    const lastMealMinutes = Math.max(
      ...timedMeals.map((m) => {
        const [h, mm] = (m.time_suggestion as string).split(":").map(Number);
        return h * 60 + mm;
      }),
    );
    if (nowMinutes < lastMealMinutes + 30) continue; // ainda não passou 30min da última refeição

    const studentId = diet.student_id as string;
    const orgId = diet.org_id as string | null;
    const tag = `meals_incomplete_${studentId}_${today}`;
    if (await alreadyLoggedToday(studentId, tag)) continue;

    const { count } = await supabase
      .from("meal_completions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("date", today);
    if ((count ?? 0) >= meals.length) continue; // já completou todas

    const title = "🍽️ Falta pouco pra fechar o dia!";
    const body  = "Ainda tem refeição pendente hoje. Registre o que falta e feche o dia com 100% de aderência!";

    await sendPush(studentId, { title, body, tag });
    if (orgId) await logNotification({ recipient_id: studentId, org_id: orgId, notification_type: "meals_incomplete", title, body, tag });
  }
}

async function handleHydration() {
  const hour = brazilHour();
  if (hour < 7 || hour > 21) return;
  const today = brazilToday();

  const { data: diets } = await supabase
    .from("diets")
    .select("student_id, org_id, meta_agua_ml")
    .eq("is_active", true);

  if (!diets?.length) return;

  for (const diet of diets as any[]) {
    const studentId = diet.student_id as string;
    const orgId = diet.org_id as string | null;
    const meta = (diet.meta_agua_ml as number | null) ?? AGUA_META_ML_DEFAULT;

    const { data: registro } = await supabase
      .from("registros_agua")
      .select("ml_total, updated_at")
      .eq("student_id", studentId)
      .eq("data_registro", today)
      .maybeSingle();
    const mlTotal = (registro?.ml_total as number | undefined) ?? 0;
    if (mlTotal >= meta) continue; // já bateu a meta

    // registros_agua guarda um total por dia (não por copo) — updated_at é o melhor proxy
    // de "quando foi o último registro". Se atualizou há menos de 1h, já está bebendo água
    // ativamente; não faz sentido cutucar de novo só porque o total do dia ainda não fechou.
    if (registro?.updated_at) {
      const minutesSinceUpdate = (Date.now() - new Date(registro.updated_at as string).getTime()) / 60000;
      if (minutesSinceUpdate < 60) continue;
    }

    const title = "💧 Hidratação";
    const body  = "Hora de se hidratar! Beba água agora.";
    const tag   = `hydration_${studentId}_${today}_${hour}`;

    await sendPush(studentId, { title, body, tag });
    if (orgId) await logNotification({ recipient_id: studentId, org_id: orgId, notification_type: "hydration", title, body, tag });
  }
}

async function handleMorningMessage() {
  const today = brazilToday();

  const { data: alunos } = await supabase
    .from("alunos")
    .select("id, user_id, org_id")
    .eq("ativo", true)
    .not("user_id", "is", null);

  if (!alunos?.length) return;

  for (const aluno of alunos as any[]) {
    const studentId = aluno.user_id as string;
    const orgId = aluno.org_id as string | null;
    const tag = `morning_${studentId}_${today}`;
    if (await alreadyLoggedToday(studentId, tag)) continue;

    const workoutTitle = await getScheduledWorkoutTitle(aluno.id);
    const pool  = workoutTitle ? MORNING_PHRASES_WORKOUT : MORNING_PHRASES_REST;
    const body  = pool[Math.floor(Math.random() * pool.length)];
    const title = workoutTitle ? "💪 Hoje tem treino!" : "✨ Bom dia!";

    await sendPush(studentId, { title, body, tag });
    if (orgId) await logNotification({ recipient_id: studentId, org_id: orgId, notification_type: "morning", title, body, tag });
  }
}

async function handleWorkoutIncomplete() {
  const today = brazilToday();

  const { data: alunos } = await supabase
    .from("alunos")
    .select("id, user_id, org_id")
    .eq("ativo", true)
    .not("user_id", "is", null);

  if (!alunos?.length) return;

  for (const aluno of alunos as any[]) {
    const workoutTitle = await getScheduledWorkoutTitle(aluno.id);
    if (!workoutTitle) continue; // sem treino previsto hoje

    const { count } = await supabase
      .from("treino_sessoes_log")
      .select("id", { count: "exact", head: true })
      .eq("aluno_id", aluno.id)
      .eq("data_conclusao", today);
    if ((count ?? 0) > 0) continue; // já concluiu

    const studentId = aluno.user_id as string;
    const orgId = aluno.org_id as string | null;
    const tag = `workout_incomplete_${studentId}_${today}`;
    if (await alreadyLoggedToday(studentId, tag)) continue;

    const title = "💪 Seu treino de hoje ainda te espera";
    const body  = "Não deixe pra depois — treinos em dia são o que garante os melhores resultados. Ainda dá tempo!";

    await sendPush(studentId, { title, body, tag });
    if (orgId) await logNotification({ recipient_id: studentId, org_id: orgId, notification_type: "workout_incomplete", title, body, tag });
  }
}

// ── Update reminder ───────────────────────────────────────────────────────

async function handleUpdateReminder() {
  const today = brazilToday();

  // Busca todos os alunos com data de próxima atualização definida
  const { data: alunos } = await supabase
    .from("alunos")
    .select("id, user_id, org_id, treinador_id, telefone, form_atualizacao_ultima_data")
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
      .gte("submitted_at", dueDate)
      .maybeSingle();
    const jaEnviou = Boolean(resposta);

    if (diff === 2 || diff === 1 || diff === 0) {
      // Não notifica se já enviou
      if (jaEnviou) continue;

      // Checa se já foi enviada essa notificação hoje para esse aluno
      const tag = `update_reminder_${diff}d_${dueDate}`;
      if (await alreadyLoggedToday(userId, tag)) continue;

      if (await isDND(userId)) continue;

      const dueFmt = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
      let title = "";
      let body  = "";
      if (diff === 2) {
        title = "Lembrete de atualização";
        body  = `Sua atualização vence em 2 dias (${dueFmt}). Não esqueça de enviar!`;
      } else if (diff === 1) {
        title = "Lembrete de atualização";
        body  = "Amanhã é o prazo da sua atualização! Não esqueça de enviar!";
      } else {
        title = "Atualização — hoje é o dia!";
        body  = "Hoje é o dia da sua atualização! Clique para enviar agora.";
      }

      const linkUpdate = await getAtualizacaoLink(orgId);
      await sendPush(userId, { title, body, tag, url: linkUpdate ?? undefined });
      await logNotification({ recipient_id: userId, org_id: orgId, notification_type: "update_reminder", title, body, tag });
      // Sino do app
      await supabase.from("notificacoes").insert({
        user_id: userId, org_id: orgId,
        titulo: title, mensagem: body, tipo: "update_reminder", lida: false,
      });
      // WhatsApp
      const phoneUpdate = await resolveAlunoPhone(aluno.telefone as string | null, userId);
      await sendWhatsapp(orgId, aluno.id as string, phoneUpdate, linkUpdate ? `${body} ${linkUpdate}` : body);

    } else if (diff < 0 && !jaEnviou) {
      // Pós-vencimento e aluno não enviou

      // Notificação diária para o aluno
      const tagAluno = `update_reminder_overdue_aluno_${today}_${dueDate}`;
      if (!(await alreadyLoggedToday(userId, tagAluno))) {
        if (!await isDND(userId)) {
          const dueFmt = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
          const titleA = "Atualização em atraso";
          const bodyA  = `Sua atualização venceu em ${dueFmt}. Envie o quanto antes para que seu plano seja ajustado.`;
          const linkOverdue = await getAtualizacaoLink(orgId);
          await sendPush(userId, { title: titleA, body: bodyA, tag: tagAluno, url: linkOverdue ?? undefined });
          await logNotification({ recipient_id: userId, org_id: orgId, notification_type: "update_reminder_overdue", title: titleA, body: bodyA, tag: tagAluno });
          // Sino do app — aluno
          await supabase.from("notificacoes").insert({
            user_id: userId, org_id: orgId,
            titulo: titleA, mensagem: bodyA, tipo: "update_reminder_overdue", lida: false,
          });
          // WhatsApp
          const phoneOverdue = await resolveAlunoPhone(aluno.telefone as string | null, userId);
          await sendWhatsapp(orgId, aluno.id as string, phoneOverdue, linkOverdue ? `${bodyA} ${linkOverdue}` : bodyA);
        }
      }

      // Notificação única para o treinador (1x apenas)
      const trainerId = aluno.treinador_id as string | null;
      if (trainerId) {
        const tagTrainer = `update_reminder_overdue_trainer_${trainerId}_${userId}_${dueDate}`;
        if (!(await alreadyLoggedToday(trainerId, tagTrainer))) {
          // Busca nome do aluno
          const { data: profile } = await supabase
            .from("profiles")
            .select("nome")
            .eq("id", userId)
            .maybeSingle();
          const alunoNome = (profile?.nome as string) ?? "Um aluno";
          const dueFmt = `${String(due.getDate()).padStart(2,"0")}/${String(due.getMonth()+1).padStart(2,"0")}`;
          const titleT = "Aluno sem atualização";
          const bodyT  = `${alunoNome} não enviou a atualização que venceu em ${dueFmt}.`;
          await sendPush(trainerId, { title: titleT, body: bodyT, tag: tagTrainer });
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

// ── Timers ativos (descanso entre séries / sessão de cardio) ────────────────

async function handleActiveTimers() {
  const { data: timers } = await supabase
    .from("active_timers")
    .select("student_id, org_id, tipo, titulo, started_at, duracao_segundos")
    .is("notified_at", null);

  if (!timers?.length) return;

  const now = Date.now();
  for (const t of timers) {
    const studentId = t.student_id as string;
    const orgId     = t.org_id as string | null;
    const tipo      = t.tipo as string;
    const titulo    = t.titulo as string;
    const endMs = new Date(t.started_at as string).getTime() + (t.duracao_segundos as number) * 1000;
    if (now < endMs) continue; // ainda não terminou

    const title = tipo === "cardio" ? "Cardio concluído!" : "Descanso acabou!";
    const body  = tipo === "cardio"
      ? `Sua sessão "${titulo}" atingiu o tempo alvo.`
      : `Hora da próxima série: ${titulo}`;

    await sendPush(studentId, { title, body, tag: `timer-${studentId}` });
    if (orgId) {
      await logNotification({ recipient_id: studentId, org_id: orgId, notification_type: "timer_done", title, body });
    }

    await supabase.from("active_timers").update({ notified_at: new Date().toISOString() }).eq("student_id", studentId);
  }
}

// ── Servidor ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const { type } = await req.json().catch(() => ({ type: "morning" }));

  try {
    switch (type) {
      case "meals":              await handleMeals();              break;
      case "meals_incomplete":   await handleMealsIncomplete();    break;
      case "hydration":          await handleHydration();          break;
      case "morning":            await handleMorningMessage();     break;
      case "workout_incomplete": await handleWorkoutIncomplete();  break;
      case "update_reminder":    await handleUpdateReminder();     break;
      case "active_timers":      await handleActiveTimers();       break;
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
