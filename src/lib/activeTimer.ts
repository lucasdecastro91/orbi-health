/**
 * activeTimer.ts — Um único timer ativo por aluno (descanso entre séries ou sessão
 * de cardio). Guarda o horário de início + duração alvo, não um contador rodando —
 * assim o tempo decorrido pode ser recalculado a qualquer momento (mesmo depois do
 * app minimizado), e o cron de notify-scheduled sabe quando avisar por push.
 */
import { supabase } from "@/integrations/supabase/client";

export type TimerTipo = "descanso" | "cardio";

export interface ActiveTimer {
  student_id: string;
  org_id: string | null;
  tipo: TimerTipo;
  titulo: string;
  ref_id: string | null;
  started_at: string;
  duracao_segundos: number;
  notified_at: string | null;
  paused_at: string | null;
}

// Um timer esquecido é zerado sozinho ao ser restaurado (abrir o app/tela) — nunca
// enquanto está sendo acompanhado ao vivo, então uma corrida/maratona de 3h+ com o
// app aberto o tempo todo não é interrompida no meio.
const RUNNING_STALE_MS = 3 * 60 * 60 * 1000; // 3h rodando sem pausar
const PAUSED_STALE_MS = 60 * 60 * 1000; // 1h pausado

export const isTimerStale = (timer: ActiveTimer): boolean => {
  const now = Date.now();
  if (timer.paused_at) {
    return now - new Date(timer.paused_at).getTime() >= PAUSED_STALE_MS;
  }
  return now - new Date(timer.started_at).getTime() >= RUNNING_STALE_MS;
};

export const startTimer = async (
  studentId: string,
  orgId: string | null,
  tipo: TimerTipo,
  titulo: string,
  duracaoSegundos: number,
  refId?: string,
  startedAt?: Date,
): Promise<void> => {
  try {
    const { error } = await supabase.from("active_timers").upsert(
      {
        student_id: studentId,
        org_id: orgId,
        tipo,
        titulo,
        ref_id: refId ?? null,
        started_at: (startedAt ?? new Date()).toISOString(),
        duracao_segundos: duracaoSegundos,
        notified_at: null,
        paused_at: null,
      },
      { onConflict: "student_id" },
    );
    if (error) console.warn("[activeTimer] start failed:", error.message);
  } catch (err) {
    console.warn("[activeTimer] start exception:", err);
  }
};

export const pauseTimer = async (studentId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from("active_timers")
      .update({ paused_at: new Date().toISOString() })
      .eq("student_id", studentId);
    if (error) console.warn("[activeTimer] pause failed:", error.message);
  } catch (err) {
    console.warn("[activeTimer] pause exception:", err);
  }
};

export const clearTimer = async (studentId: string): Promise<void> => {
  try {
    await supabase.from("active_timers").delete().eq("student_id", studentId);
  } catch (err) {
    console.warn("[activeTimer] clear exception:", err);
  }
};

/** Retorna o timer ativo do aluno — e já descarta sozinho um timer esquecido
 *  (pausado há 1h+ ou rodando há 3h+), pra nunca restaurar um estado obsoleto. */
export const getActiveTimer = async (studentId: string): Promise<ActiveTimer | null> => {
  try {
    const { data } = await supabase
      .from("active_timers")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle();
    const timer = (data as ActiveTimer) ?? null;
    if (timer && isTimerStale(timer)) {
      void clearTimer(studentId);
      return null;
    }
    return timer;
  } catch {
    return null;
  }
};
