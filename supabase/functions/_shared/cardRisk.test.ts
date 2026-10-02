import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, todayBR, isNewAccount, cardCapCents, exceedsCap, cardHold,
  DEFAULT_CAP_CENTS,
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
