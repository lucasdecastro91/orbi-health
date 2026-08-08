/**
 * Helpers to figure out "today's training session" from a plan's weeks/trainings.
 * `dia_semana` is free text typed by the trainer (not an enum), so matching against
 * today's weekday requires normalizing accents/case instead of exact string compare.
 */

const WEEKDAY_BY_INDEX = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

const ACCENT_MARKS_RE = /[̀-ͯ]/g;
const stripAccents = (s: string) => s.normalize("NFD").replace(ACCENT_MARKS_RE, "");

export function normalizeWeekday(raw: string | null | undefined): string | null {
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

export function getTodayWeekdayKey(date: Date = new Date()): string {
  return WEEKDAY_BY_INDEX[date.getDay()];
}

export interface TreinoLite {
  id: string;
  titulo_treino: string;
  dia_semana: string;
}

export interface WeekLite {
  id: string;
  semana_inicio: number;
  semana_fim: number;
  treinos: TreinoLite[];
}

export interface TodaysSession {
  weekId: string;
  treinoId: string;
  titulo: string;
}

/** YYYY-MM-DD -> local Date (avoids UTC off-by-one from `new Date(str)`) */
const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/**
 * Picks the training week that covers a given date, based on how many weeks
 * have elapsed since the plan started. Returns null if there are no weeks.
 * Used both for "today" (see `getCurrentWeek`) and for resolving what the
 * schedule actually was on a past date, so historical views reflect the
 * plan's schedule at that time instead of whatever is active today.
 */
export function getWeekForDate(
  weeks: WeekLite[],
  dataInicioISO: string | null | undefined,
  targetDate: Date = new Date(),
): WeekLite | null {
  if (!weeks || weeks.length === 0) return null;

  let weekNumber = 1;
  if (dataInicioISO) {
    const start = parseLocalDate(dataInicioISO);
    const diffDays = Math.floor((targetDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    weekNumber = Math.floor(Math.max(0, diffDays) / 7) + 1;
  }

  return (
    weeks.find((w) => weekNumber >= w.semana_inicio && weekNumber <= w.semana_fim) ??
    weeks[weeks.length - 1]
  );
}

/**
 * Picks the training week that covers "today". Thin wrapper over
 * `getWeekForDate` kept for callers that only care about the current week.
 */
export function getCurrentWeek(
  weeks: WeekLite[],
  dataInicioISO: string | null | undefined,
): WeekLite | null {
  return getWeekForDate(weeks, dataInicioISO, new Date());
}

/**
 * Within the current week, finds the training whose `dia_semana` matches
 * today. Returns null if there's no training scheduled for today — callers
 * should fall back to a generic link (no deep-link into a specific session).
 */
export function pickTodaysSession(
  weeks: WeekLite[],
  dataInicioISO: string | null | undefined,
): TodaysSession | null {
  const currentWeek = getCurrentWeek(weeks, dataInicioISO);
  if (!currentWeek) return null;

  const todayKey = getTodayWeekdayKey();
  const match = currentWeek.treinos.find((t) => normalizeWeekday(t.dia_semana) === todayKey);
  if (!match) return null;

  return { weekId: currentWeek.id, treinoId: match.id, titulo: match.titulo_treino };
}
