/**
 * Aderência do aluno no ciclo atual — desde a última atualização enviada
 * (ou desde o dia seguinte à data marcada, se ela já venceu) até hoje. O
 * período medido cresce dia a dia até o treinador definir a próxima data,
 * igual um app de rota mostrando "12km percorridos" antes do destino final
 * estar definido.
 *
 * Cada pilar (treino, dieta, cardio, água) vira um percentual PRÓPRIO do
 * período antes de qualquer peso ser aplicado — nunca soma unidades cruas
 * de escalas diferentes (1 sessão de cardio não é comparável a 1 dia de
 * água). O geral usa a mesma proporção dos valores de XP de cada ação
 * (ver xp.ts: treino 30, dieta 30, cardio 20, água 20 — por isso os pesos
 * aqui são 0.30/0.30/0.20/0.20), decisão confirmada com o Lucas em
 * 2026-09-07 depois de descartar tanto peso igual quanto peso por volume.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AdherenceItem {
  /** 0-100, arredondado */
  pct: number;
  completed: number;
  /** Pode ter casa decimal (prorata de semana incompleta) */
  expected: number;
}

export interface CycleAdherence {
  cycleStart: string;
  cycleEnd: string;
  cycleEndIsProvisional: boolean;
  /** Média ponderada — treino 30% + dieta 30% + cardio 20% + água 20% */
  overall: number;
  treino: AdherenceItem;
  dieta: AdherenceItem;
  cardio: AdherenceItem;
  agua: AdherenceItem;
}

const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

const daysBetweenInclusive = (startISO: string, endISO: string): number => {
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = endISO.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
};

const addDaysISO = (iso: string, n: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

export interface ComputeAdherenceParams {
  /** auth.users.id do aluno */
  studentId: string;
  /** alunos.id */
  alunoId: string;
  /** Frequência semanal de treino já calculada pelo caller (treinos da
   *  semana atual do plano — mesma fonte que já monta a faixa de dias). */
  treinoWeeklyFreq: number;
  /** Total de refeições da dieta ativa (0 se não tiver dieta estruturada) */
  dietaTotalMeals: number;
  aguaMetaMl: number;
}

export const computeCycleAdherence = async (
  params: ComputeAdherenceParams,
): Promise<CycleAdherence | null> => {
  const { studentId, alunoId, treinoWeeklyFreq, dietaTotalMeals, aguaMetaMl } = params;

  // 1. Início do ciclo — último envio de atualização confirmado. Sem nenhum
  //    envio ainda, não existe ciclo pra medir (aluno recém-cadastrado).
  const { data: lastUpdate } = await supabase
    .from("atualizacao_respostas")
    .select("submitted_at")
    .eq("student_id", studentId)
    .eq("concluida", true)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastUpdate?.submitted_at) return null;
  const lastSubmission = String(lastUpdate.submitted_at).slice(0, 10);

  // 2. Data marcada pelo treinador. Se ela JÁ PASSOU (e é posterior ao
  //    último envio), aquele ciclo acabou: o novo começa no dia seguinte e
  //    fica em andamento até o treinador marcar a próxima data. Antes, data
  //    vencida travava o fim do ciclo nela — o período congelava (aluno que
  //    enviou no próprio dia marcado ficava com ciclo de 1 dia; aluno que
  //    não enviou ficava preso no ciclo antigo). Ver CLAUDE.md seção 15.
  const { data: aluno } = await supabase
    .from("alunos")
    .select("form_atualizacao_ultima_data")
    .eq("id", alunoId)
    .maybeSingle();

  const today = brazilToday();
  const definedEnd = (aluno as any)?.form_atualizacao_ultima_data as string | null;
  const dueHasPassed = !!definedEnd && definedEnd < today && definedEnd >= lastSubmission;
  const cycleStart = dueHasPassed ? addDaysISO(definedEnd!, 1) : lastSubmission;

  // 3. Fim do ciclo — sempre hoje: o ciclo corrente é medido até agora e
  //    cresce dia a dia (data futura ainda não chegou; data passada já
  //    virou o início do próximo ciclo acima).
  const cycleEndIsProvisional = true;
  const cycleEnd = today;

  const days = daysBetweenInclusive(cycleStart, cycleEnd);
  const weeksInPeriod = days / 7;

  // 3. Treino — sessões concluídas no período vs esperado
  const { data: treinoLogs } = await supabase
    .from("treino_sessoes_log")
    .select("data_conclusao")
    .eq("aluno_id", alunoId)
    .gte("data_conclusao", cycleStart)
    .lte("data_conclusao", cycleEnd);
  const treinoCompleted = new Set((treinoLogs ?? []).map((r: any) => r.data_conclusao)).size;
  const treinoExpected = treinoWeeklyFreq * weeksInPeriod;
  const treino: AdherenceItem = {
    completed: treinoCompleted,
    expected: Math.round(treinoExpected * 10) / 10,
    pct: treinoExpected > 0 ? Math.min(100, Math.round((treinoCompleted / treinoExpected) * 100)) : 0,
  };

  // 4. Cardio — soma da frequência semanal prescrita entre os planos de cardio do aluno
  const { data: cardioPlanos } = await supabase
    .from("cardio_planos")
    .select("frequencia_semana")
    .eq("aluno_id", alunoId);
  const cardioWeeklyFreq = (cardioPlanos ?? []).reduce(
    (sum: number, p: any) => sum + (p.frequencia_semana ?? 0), 0,
  );
  const { data: cardioLogs } = await supabase
    .from("cardio_sessoes")
    .select("data_sessao")
    .eq("student_id", studentId)
    .gte("data_sessao", cycleStart)
    .lte("data_sessao", cycleEnd);
  const cardioCompleted = (cardioLogs ?? []).length;
  const cardioExpected = cardioWeeklyFreq * weeksInPeriod;
  const cardio: AdherenceItem = {
    completed: cardioCompleted,
    expected: Math.round(cardioExpected * 10) / 10,
    pct: cardioExpected > 0 ? Math.min(100, Math.round((cardioCompleted / cardioExpected) * 100)) : 0,
  };

  // 5. Água — dias com meta batida / dias do período
  const { data: aguaLogs } = await supabase
    .from("registros_agua")
    .select("data_registro, ml_total")
    .eq("student_id", studentId)
    .gte("data_registro", cycleStart)
    .lte("data_registro", cycleEnd);
  const aguaByDay = new Map<string, number>();
  for (const r of (aguaLogs ?? []) as any[]) {
    aguaByDay.set(r.data_registro, (aguaByDay.get(r.data_registro) ?? 0) + (r.ml_total ?? 0));
  }
  const aguaDiasCumpridos = Array.from(aguaByDay.values()).filter((ml) => ml >= aguaMetaMl).length;
  const agua: AdherenceItem = {
    completed: aguaDiasCumpridos,
    expected: days,
    pct: Math.round((aguaDiasCumpridos / days) * 100),
  };

  // 6. Dieta — dias com 100% das refeições concluídas / dias do período.
  //    Binário por dia de propósito (sem meio-termo aqui): o detalhamento
  //    fracionado ("3/4 refeições hoje") fica só na visão do chip individual,
  //    calculado à parte pelo caller — este módulo só cuida do agregado.
  let dieta: AdherenceItem = { completed: 0, expected: days, pct: 0 };
  if (dietaTotalMeals > 0) {
    const { data: mealLogs } = await supabase
      .from("meal_completions")
      .select("date")
      .eq("student_id", studentId)
      .gte("date", cycleStart)
      .lte("date", cycleEnd);
    const countByDay = new Map<string, number>();
    for (const r of (mealLogs ?? []) as any[]) {
      countByDay.set(r.date, (countByDay.get(r.date) ?? 0) + 1);
    }
    const dietaDiasCumpridos = Array.from(countByDay.values()).filter((n) => n >= dietaTotalMeals).length;
    dieta = {
      completed: dietaDiasCumpridos,
      expected: days,
      pct: Math.round((dietaDiasCumpridos / days) * 100),
    };
  }

  // 7. Geral — média ponderada, cada pilar já em % próprio (ver header do arquivo)
  const overall = Math.round(treino.pct * 0.3 + dieta.pct * 0.3 + cardio.pct * 0.2 + agua.pct * 0.2);

  return { cycleStart, cycleEnd, cycleEndIsProvisional, overall, treino, dieta, cardio, agua };
};
