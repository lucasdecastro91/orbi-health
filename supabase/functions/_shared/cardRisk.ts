// cardRisk.ts — regras puras de risco de cartão da Carteira ORBI Pay
// (spec: docs/superpowers/specs/2026-10-01-limite-reserva-cartao-design.md).
// Sem I/O e sem nada específico de Deno: roda nas Edge Functions e no
// `node --test` (cardRisk.test.ts).

export const CARD_HOLD_DAYS = 30;
export const NEW_ACCOUNT_DAYS = 90;
export const RESERVE_DAYS = 120;
export const RESERVE_PERCENT = 20;
export const DEFAULT_CAP_CENTS = 500_000;
export const ALERT_THRESHOLD_CENTS = 300_000;

export function toBRDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export function todayBR(now: Date = new Date()): string {
  return toBRDate(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Primeiro dia em que a conta deixa de ser "nova". aprovadoEm null =
// subconta aprovada sem data registrada → tratada como nova (fail-safe).
function newAccountEnd(aprovadoEm: string | null): string | null {
  return aprovadoEm ? addDays(toBRDate(new Date(aprovadoEm)), NEW_ACCOUNT_DAYS) : null;
}

export function isNewAccount(aprovadoEm: string | null, today: string): boolean {
  const end = newAccountEnd(aprovadoEm);
  return end === null || today < end;
}

export function cardCapCents(aprovadoEm: string | null, overrideReais: number | null, today: string): number | null {
  if (overrideReais != null) return Math.round(Number(overrideReais) * 100);
  return isNewAccount(aprovadoEm, today) ? DEFAULT_CAP_CENTS : null;
}

export function exceedsCap(volumeCents: number, newCents: number, capCents: number | null): boolean {
  return capCents != null && volumeCents + newCents > capCents;
}

export interface AsaasCardPayment {
  confirmedDate?: string | null;
  clientPaymentDate?: string | null;
  paymentDate?: string | null;
  estimatedCreditDate?: string | null;
  netValue?: number | null;
  value?: number | null;
}

// Data da compra no cartão. paymentDate (liquidação) é o último recurso:
// é sempre >= a data da compra, então no pior caso retém por mais tempo.
export function purchaseDate(p: AsaasCardPayment): string | null {
  const d = String(p.confirmedDate ?? p.clientPaymentDate ?? p.paymentDate ?? "").slice(0, 10);
  return d || null;
}

export function netCents(p: AsaasCardPayment): number {
  return Math.round(Number(p.netValue ?? p.value ?? 0) * 100);
}

export interface Hold { cents: number; releaseDate: string | null }

// Quanto de uma venda de cartão que JÁ está no saldo continua retido hoje,
// e quando a próxima parte libera.
export function cardHold(p: AsaasCardPayment, aprovadoEm: string | null, today: string): Hold {
  const net = netCents(p);
  const purchase = purchaseDate(p);
  if (!purchase) return { cents: net, releaseDate: null };

  const fullEnd = addDays(purchase, CARD_HOLD_DAYS);
  if (today < fullEnd) return { cents: net, releaseDate: fullEnd };

  const accountEnd = newAccountEnd(aprovadoEm);
  const boughtWhileNew = accountEnd === null || purchase < accountEnd;
  const reserveEnd = addDays(purchase, RESERVE_DAYS);
  if (boughtWhileNew && today < reserveEnd) {
    return { cents: Math.round((net * RESERVE_PERCENT) / 100), releaseDate: reserveEnd };
  }
  return { cents: 0, releaseDate: null };
}

export interface ReleasePart { date: string; cents: number }

// Calendário do que ainda vai liberar de uma venda no cartão: a parte
// principal em compra+30 e a reserva (conta nova) em compra+120. Se a venda
// ainda não caiu no saldo (credited=false), nenhuma parte libera antes da
// data de crédito prevista pelo Asaas. Sem data de compra → [] (não dá pra
// datar; o valor continua retido por cardHold).
export function releaseSchedule(
  p: AsaasCardPayment, aprovadoEm: string | null, today: string, credited: boolean,
): ReleasePart[] {
  const net = netCents(p);
  const purchase = purchaseDate(p);
  if (!purchase || net <= 0) return [];
  const credit = credited ? null : (String(p.estimatedCreditDate ?? "").slice(0, 10) || null);
  const notBefore = (d: string) => (credit && credit > d ? credit : d);

  const accountEnd = newAccountEnd(aprovadoEm);
  const boughtWhileNew = accountEnd === null || purchase < accountEnd;
  const reserve = boughtWhileNew ? Math.round((net * RESERVE_PERCENT) / 100) : 0;
  const mainEnd = notBefore(addDays(purchase, CARD_HOLD_DAYS));
  const reserveEnd = notBefore(addDays(purchase, RESERVE_DAYS));

  const parts: ReleasePart[] = [];
  if (today < mainEnd) parts.push({ date: mainEnd, cents: net - reserve });
  if (reserve > 0 && today < reserveEnd) parts.push({ date: reserveEnd, cents: reserve });
  return mergeSchedules([parts]);
}

// Junta calendários somando valores da mesma data, em ordem cronológica.
export function mergeSchedules(schedules: ReleasePart[][]): ReleasePart[] {
  const byDate = new Map<string, number>();
  for (const s of schedules) for (const r of s) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.cents);
  return [...byDate.entries()]
    .filter(([, cents]) => cents > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, cents]) => ({ date, cents }));
}
