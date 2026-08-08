/**
 * Sequência (streak) de dias em que o aluno cumpriu treino + dieta + água no mesmo dia.
 * Chamado depois de qualquer uma das 3 ações (treino concluído, dieta 100%, meta de água
 * batida) — reavalia se "hoje" já está completo e, se sim, atualiza a sequência e concede
 * o bônus de XP correspondente (só quando a sequência bate exatamente 3, 7, 14 ou 30 dias).
 * Sem cron/backend agendado: tudo é recalculado de forma reativa, na hora da ação.
 */
import { supabase } from "@/integrations/supabase/client";
import { grantXP, type XpSource } from "@/lib/xp";
import { getCurrentWeek, getTodayWeekdayKey, normalizeWeekday, type WeekLite } from "@/lib/trainingSchedule";
import { AGUA_META_ML } from "@/lib/agua";

const brazilDateOffset = (daysAgo: number): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

const STREAK_TRIGGERS: Record<number, XpSource> = {
  3: "streak_3",
  7: "streak_7",
  14: "streak_14",
  30: "streak_30",
};

export const evaluateAndUpdateStreak = async (studentId: string, orgId: string): Promise<void> => {
  try {
    const today = brazilDateOffset(0);

    const { data: aluno } = await supabase
      .from("alunos")
      .select("id")
      .eq("user_id", studentId)
      .maybeSingle();
    if (!aluno) return;

    // 1. Treino: ok se não há treino previsto hoje (dia de descanso), ou se foi concluído hoje
    let treinoOk = true;
    const { data: planoData } = await supabase
      .from("planos_treino")
      .select("id, data_inicio")
      .eq("aluno_id", aluno.id)
      .eq("ativo", true)
      .maybeSingle();

    if (planoData) {
      const { data: semanasLite } = await supabase
        .from("semanas")
        .select("id, semana_inicio, semana_fim, treinos ( id, titulo_treino, dia_semana )")
        .eq("plano_id", planoData.id)
        .order("semana_inicio", { ascending: true });

      const weeks = (semanasLite ?? []) as unknown as WeekLite[];
      const currentWeek = getCurrentWeek(weeks, planoData.data_inicio);
      const todayKey = getTodayWeekdayKey();
      const isScheduledToday = (currentWeek?.treinos ?? []).some(
        (t) => normalizeWeekday(t.dia_semana) === todayKey,
      );

      if (isScheduledToday) {
        const { count } = await supabase
          .from("treino_sessoes_log")
          .select("id", { count: "exact", head: true })
          .eq("aluno_id", aluno.id)
          .eq("data_conclusao", today);
        treinoOk = (count ?? 0) > 0;
      }
    }

    if (!treinoOk) return;

    // 2. Dieta: ok se não há dieta ativa, ou se 100% das refeições foram feitas hoje
    let dietaOk = true;
    const { data: dietData } = await supabase
      .from("diets")
      .select("id, meta_agua_ml, diet_meals(id)")
      .eq("student_id", studentId)
      .eq("is_active", true)
      .maybeSingle();

    const totalMeals = (dietData as any)?.diet_meals?.length ?? 0;
    if (totalMeals > 0) {
      const { count } = await supabase
        .from("meal_completions")
        .select("id", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("date", today);
      dietaOk = (count ?? 0) >= totalMeals;
    }

    if (!dietaOk) return;

    // 3. Água: ok se a meta do dia foi batida
    const aguaMeta = (dietData as any)?.meta_agua_ml ?? AGUA_META_ML;
    const { data: aguaRow } = await supabase
      .from("registros_agua")
      .select("ml_total")
      .eq("student_id", studentId)
      .eq("data_registro", today)
      .maybeSingle();
    const aguaOk = ((aguaRow as any)?.ml_total ?? 0) >= aguaMeta;

    if (!aguaOk) return;

    // Dia completo — atualiza a sequência
    const { data: streakRow } = await supabase
      .from("aluno_streaks")
      .select("sequencia_atual, melhor_sequencia, ultima_data_valida")
      .eq("student_id", studentId)
      .maybeSingle();

    const row = streakRow as any;
    if (row?.ultima_data_valida === today) return; // já contabilizado hoje

    const ontem = brazilDateOffset(1);
    const foiConsecutivo = row?.ultima_data_valida === ontem;
    const novaSequencia = foiConsecutivo ? (row?.sequencia_atual ?? 0) + 1 : 1;
    const novoRecorde = Math.max(novaSequencia, row?.melhor_sequencia ?? 0);

    await supabase.from("aluno_streaks").upsert({
      student_id: studentId,
      org_id: orgId,
      sequencia_atual: novaSequencia,
      melhor_sequencia: novoRecorde,
      ultima_data_valida: today,
    });

    const trigger = STREAK_TRIGGERS[novaSequencia];
    if (trigger) await grantXP(studentId, orgId, trigger);
  } catch (err) {
    console.warn("[streaks] evaluate failed:", err);
  }
};
