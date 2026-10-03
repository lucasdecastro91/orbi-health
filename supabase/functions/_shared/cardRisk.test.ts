import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, todayBR, isNewAccount, cardCapCents, exceedsCap, cardHold,
  releaseSchedule, mergeSchedules, DEFAULT_CAP_CENTS,
} from "./cardRisk.ts";

// Orbi Demo real: created_at 2026-08-27T00:34Z = 26/08 em São Paulo.
const APROVADO = "2026-08-27T00:34:38Z";

test("addDays cruza mês e ano", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-15", 30), "2027-01-14");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("todayBR usa o dia de São Paulo, não UTC", () => {
  // 02:00 UTC de 01/10 = 23:00 de 30/09 em São Paulo
  assert.equal(todayBR(new Date("2026-10-01T02:00:00Z")), "2026-09-30");
  assert.equal(todayBR(new Date("2026-10-01T04:00:00Z")), "2026-10-01");
});

test("isNewAccount: 90 dias a partir da data BR de aprovação", () => {
  // aprovação em 26/08 (BR) + 90 = 24/11
  assert.equal(isNewAccount(APROVADO, "2026-11-23"), true);
  assert.equal(isNewAccount(APROVADO, "2026-11-24"), false);
});

test("isNewAccount: sem aprovado_em é tratada como nova (fail-safe)", () => {
  assert.equal(isNewAccount(null, "2030-01-01"), true);
});

test("cardCapCents: nova = 5.000, antiga = sem teto, override sempre vence", () => {
  assert.equal(cardCapCents(APROVADO, null, "2026-10-01"), DEFAULT_CAP_CENTS);
  assert.equal(cardCapCents(APROVADO, null, "2026-12-01"), null);
  assert.equal(cardCapCents(APROVADO, 10000, "2026-10-01"), 1_000_000);
  assert.equal(cardCapCents(APROVADO, 2000, "2026-12-01"), 200_000);
  assert.equal(cardCapCents(null, null, "2030-01-01"), DEFAULT_CAP_CENTS);
});

test("exceedsCap: exatamente no teto passa, 1 centavo acima não", () => {
  assert.equal(exceedsCap(400_000, 100_000, 500_000), false);
  assert.equal(exceedsCap(400_000, 100_001, 500_000), true);
  assert.equal(exceedsCap(9_999_999, 1, null), false);
});

test("cardHold: 100% retido até compra+30", () => {
  const h = cardHold({ confirmedDate: "2026-09-20", netValue: 100 }, APROVADO, "2026-10-01");
  assert.deepEqual(h, { cents: 10000, releaseDate: "2026-10-20" });
});

test("cardHold: venda no período novo fica com 20% até compra+120", () => {
  // compra 01/09 (dentro dos 90 dias), hoje 01/10 = compra+30 → só reserva
  const h = cardHold({ confirmedDate: "2026-09-01", netValue: 100 }, APROVADO, "2026-10-01");
  assert.deepEqual(h, { cents: 2000, releaseDate: "2026-12-30" });
  const fim = cardHold({ confirmedDate: "2026-09-01", netValue: 100 }, APROVADO, "2026-12-30");
  assert.deepEqual(fim, { cents: 0, releaseDate: null });
});

test("cardHold: venda depois do período novo não tem reserva", () => {
  const h = cardHold({ confirmedDate: "2026-12-01", netValue: 100 }, APROVADO, "2026-12-31");
  assert.deepEqual(h, { cents: 0, releaseDate: null });
});

test("cardHold: arredonda reserva em centavos", () => {
  const h = cardHold({ confirmedDate: "2026-09-01", netValue: 33.33 }, APROVADO, "2026-10-01");
  assert.equal(h.cents, 667);
});

test("cardHold: sem data de compra fica 100% retido", () => {
  assert.deepEqual(cardHold({ netValue: 10 }, APROVADO, "2026-10-01"), { cents: 1000, releaseDate: null });
});

test("cardHold: cai pro clientPaymentDate/paymentDate quando falta confirmedDate", () => {
  const h = cardHold({ paymentDate: "2026-09-25", netValue: 50 }, APROVADO, "2026-10-01");
  assert.deepEqual(h, { cents: 5000, releaseDate: "2026-10-25" });
});

// ── Calendário de liberação ("Em liberação" da Carteira) ──────────────────────

test("releaseSchedule: venda de conta nova já no saldo libera 80% em +30 e 20% em +120", () => {
  const s = releaseSchedule({ confirmedDate: "2026-09-20", netValue: 100 }, APROVADO, "2026-10-01", true);
  assert.deepEqual(s, [
    { date: "2026-10-20", cents: 8000 },
    { date: "2027-01-18", cents: 2000 },
  ]);
});

test("releaseSchedule: depois dos 30 dias só sobra a reserva", () => {
  const s = releaseSchedule({ confirmedDate: "2026-09-01", netValue: 100 }, APROVADO, "2026-10-01", true);
  assert.deepEqual(s, [{ date: "2026-12-30", cents: 2000 }]);
});

test("releaseSchedule: conta antiga libera tudo em +30, sem reserva", () => {
  const s = releaseSchedule({ confirmedDate: "2026-12-01", netValue: 100 }, APROVADO, "2026-12-10", true);
  assert.deepEqual(s, [{ date: "2026-12-31", cents: 10000 }]);
});

test("releaseSchedule: venda ainda não creditada respeita a data de crédito do Asaas", () => {
  // compra 20/09, Asaas credita só em 25/10 (> 20/10): os 80% saem em 25/10
  const s = releaseSchedule(
    { confirmedDate: "2026-09-20", estimatedCreditDate: "2026-10-25", netValue: 100 },
    APROVADO, "2026-10-01", false,
  );
  assert.deepEqual(s, [
    { date: "2026-10-25", cents: 8000 },
    { date: "2027-01-18", cents: 2000 },
  ]);
});

test("releaseSchedule: soma das partes é sempre o valor líquido (arredondamento)", () => {
  const s = releaseSchedule({ confirmedDate: "2026-09-20", netValue: 33.33 }, APROVADO, "2026-10-01", true);
  assert.equal(s.reduce((a, r) => a + r.cents, 0), 3333);
});

test("releaseSchedule: tudo liberado retorna vazio", () => {
  assert.deepEqual(releaseSchedule({ confirmedDate: "2026-01-01", netValue: 100 }, APROVADO, "2026-10-01", true), []);
});

test("mergeSchedules: soma por data e ordena", () => {
  const m = mergeSchedules([
    [{ date: "2026-12-30", cents: 2000 }],
    [{ date: "2026-10-20", cents: 8000 }, { date: "2026-12-30", cents: 500 }],
  ]);
  assert.deepEqual(m, [
    { date: "2026-10-20", cents: 8000 },
    { date: "2026-12-30", cents: 2500 },
  ]);
});
