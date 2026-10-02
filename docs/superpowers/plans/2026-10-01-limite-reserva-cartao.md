# Teto, reserva e alertas de cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar o prejuízo de chargeback de treinador mal-intencionado com teto de R$ 5.000/30d no cartão, reserva de 20% até 120 dias e alertas por e-mail, nos primeiros 90 dias da Carteira.

**Architecture:** Regras de data/valor num módulo puro `supabase/functions/_shared/cardRisk.ts` (testado com `node --test`), importado pelas Edge Functions. Volume de cartão vem do nosso banco via RPC `card_volume_30d` (service_role only). Teto aplicado nas duas portas de cobrança no cartão; reserva no cálculo de retenção já existente; alertas no `asaas-webhook` via novo tipo `alerta_admin` do `enviar-email`.

**Tech Stack:** Supabase Edge Functions (Deno, `std@0.168.0`, `supabase-js@2`), Postgres, React 18 + TS (Vite), Node 24 (`node --test` com TS nativo), Supabase MCP para migration/deploy.

**Spec:** `docs/superpowers/specs/2026-10-01-limite-reserva-cartao-design.md`

## Global Constraints

- Período de conta nova: 90 dias a partir de `asaas_subaccounts.aprovado_em`.
- Teto: R$ 5.000 em cobranças de cartão **geradas** nos últimos 30 dias corridos, só no período de conta nova; `limite_cartao_30d` (reais) substitui o teto quando preenchido, inclusive fora do período.
- Alerta: volume de cartão **pago** em 30 dias ≥ R$ 3.000 → e-mail; máx. 1 entregue por org a cada 30 dias.
- Reserva: 20% da venda liberado só em compra + 120 dias, para compras feitas no período de conta nova; o resto segue a retenção de 30 dias que já existe.
- Pix fica fora de todas as regras.
- Datas em `America/Sao_Paulo`. Comparações de dinheiro em centavos inteiros.
- E-mails de alerta: destinatário fixo `contato@orbihealth.com.br`; nunca aceitar destinatário/HTML livre do payload.
- Falha ao calcular volume/retenção = **bloqueia** (cobrança de cartão recusada / saque recusado), nunca libera.
- E-mail/alerta é best-effort: falha nunca derruba webhook nem cobrança.
- Nenhum teste cria cobrança real no cartão. Deploy de Edge Function e migration só com confirmação explícita do Lucas. Deploy do frontend (Vercel) é sempre do Lucas.
- Type-check: `npx tsc --noEmit -p tsconfig.app.json` deve continuar com 37 erros (baseline), nenhum novo.
- Commit + push a cada task concluída (regra do projeto).

## Review Focus

- **Subconta aprovada sem `aprovado_em`** (aprovada antes da migration ou webhook perdido) → deve ser tratada como conta nova (teto e reserva valem), nunca como conta antiga. Teste em Task 1.
- **Cobrança que leva o volume exatamente a R$ 5.000,00** → permitida; R$ 5.000,01 → recusada. Teste em Task 1.
- **Virada de dia perto da meia-noite** (ex.: 23h30 em São Paulo = dia seguinte em UTC) → datas de liberação calculadas no dia de São Paulo. Teste em Task 1.
- **Venda parcelada (ex.: 12x)** → conta o valor total da cobrança no teto, não só a 1ª parcela. Garantido por usar `cobrancas.valor` no RPC (Task 2, query de verificação).
- **Alerta repetido** → segundo pagamento acima de R$ 3.000 no mesmo período não gera segundo e-mail; e-mail que falhou não conta como enviado. Verificado em Task 6 (query de dedup) e Task 8.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/cardRisk.ts` (novo) | Regras puras: datas BR, conta nova, teto, retenção/reserva por venda |
| `supabase/functions/_shared/cardRisk.test.ts` (novo) | Testes `node --test` das regras |
| `supabase/migrations/20261001000001_card_risk.sql` (novo) | Colunas `aprovado_em`/`limite_cartao_30d`, backfill, RPC `card_volume_30d` |
| `supabase/functions/enviar-email/index.ts` | Tipo `alerta_admin` (destinatário fixo, só service_role) |
| `supabase/functions/get-asaas-subaccount/index.ts` | Retenção com reserva + `cardVolume30d`/`cardCap` para a tela |
| `supabase/functions/solicitar-saque-asaas/index.ts` | Retenção com reserva no saque |
| `supabase/functions/asaas-create-charge/index.ts` | Teto na cobrança de cartão do treinador |
| `supabase/functions/escolher-pagamento-cobranca/index.ts` | Teto quando o aluno escolhe cartão |
| `supabase/functions/asaas-webhook/index.ts` | `aprovado_em`, alerta de volume, alerta de chargeback |
| `supabase/functions/create-asaas-subaccount/index.ts` | Eventos de chargeback no webhook de subconta nova |
| `src/pages/coach/Financeiro.tsx` | Uso do teto no modal "Nova cobrança" |

---

### Task 1: Módulo de regras `cardRisk.ts` (TDD)

**Files:**
- Create: `supabase/functions/_shared/cardRisk.ts`
- Test: `supabase/functions/_shared/cardRisk.test.ts`

**Interfaces:**
- Produces (todas exportadas de `cardRisk.ts`):
  - consts `CARD_HOLD_DAYS=30`, `NEW_ACCOUNT_DAYS=90`, `RESERVE_DAYS=120`, `RESERVE_PERCENT=20`, `DEFAULT_CAP_CENTS=500_000`, `ALERT_THRESHOLD_CENTS=300_000`
  - `toBRDate(d: Date): string` (YYYY-MM-DD em São Paulo)
  - `todayBR(now?: Date): string`
  - `addDays(date: string, days: number): string`
  - `isNewAccount(aprovadoEm: string | null, today: string): boolean`
  - `cardCapCents(aprovadoEm: string | null, overrideReais: number | null, today: string): number | null`
  - `exceedsCap(volumeCents: number, newCents: number, capCents: number | null): boolean`
  - `interface AsaasCardPayment { confirmedDate?: string | null; clientPaymentDate?: string | null; paymentDate?: string | null; estimatedCreditDate?: string | null; netValue?: number | null; value?: number | null }`
  - `purchaseDate(p: AsaasCardPayment): string | null`
  - `netCents(p: AsaasCardPayment): number`
  - `interface Hold { cents: number; releaseDate: string | null }`
  - `cardHold(p: AsaasCardPayment, aprovadoEm: string | null, today: string): Hold`

- [ ] **Step 1: Escrever os testes (falhando)**

`supabase/functions/_shared/cardRisk.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/cardRisk.test.ts`
Expected: FAIL — `Cannot find module ... cardRisk.ts`

- [ ] **Step 3: Implementar**

`supabase/functions/_shared/cardRisk.ts`:

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/_shared/cardRisk.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cardRisk.ts supabase/functions/_shared/cardRisk.test.ts
git commit -m "feat(carteira): regras puras de teto/reserva de cartão com testes"
git push
```

---

### Task 2: Migration (colunas + RPC de volume)

**Files:**
- Create: `supabase/migrations/20261001000001_card_risk.sql`
- Modify: `CLAUDE.md` (tabela da seção 6)

**Interfaces:**
- Produces: colunas `asaas_subaccounts.aprovado_em timestamptz`, `asaas_subaccounts.limite_cartao_30d numeric`; RPC `public.card_volume_30d(p_org_id uuid, p_paid boolean default false) returns numeric` (reais), executável só por `service_role`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Teto/reserva de cartão para contas novas da Carteira (spec 2026-10-01).
-- Só adiciona colunas nullable + 1 função; não altera dado existente além do
-- backfill de aprovado_em (só subcontas já aprovadas, hoje só a Orbi Demo).

alter table public.asaas_subaccounts
  add column if not exists aprovado_em timestamptz,
  add column if not exists limite_cartao_30d numeric;

comment on column public.asaas_subaccounts.aprovado_em is
  'Quando o Asaas aprovou a subconta (webhook ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED). Início dos 90 dias de conta nova.';
comment on column public.asaas_subaccounts.limite_cartao_30d is
  'Override manual (reais) do teto de cartão em 30 dias. null = regra padrão (R$ 5.000 nos 90 dias de conta nova).';

update public.asaas_subaccounts
   set aprovado_em = created_at
 where status = 'aprovado' and aprovado_em is null;

-- Volume de cobranças de cartão da org nos últimos 30 dias corridos.
-- p_paid=false: geradas (teto) — conta o que foi criado no Asaas, pago ou não.
-- p_paid=true: pagas (alerta).
-- Usa cobrancas.valor (total da cobrança), então parcelado conta inteiro.
create or replace function public.card_volume_30d(p_org_id uuid, p_paid boolean default false)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.valor), 0)
    from public.cobrancas c
   where c.org_id = p_org_id
     and c.forma_pagamento = 'CREDIT_CARD'
     and c.asaas_id is not null
     and case
           when p_paid then c.status in ('RECEIVED', 'CONFIRMED')
                        and c.data_pagamento >= ((now() at time zone 'America/Sao_Paulo')::date - 30)
           else c.status not in ('CANCELLED', 'REFUNDED')
                and c.created_at >= now() - interval '30 days'
         end;
$$;

revoke all on function public.card_volume_30d(uuid, boolean) from public, anon, authenticated;
grant execute on function public.card_volume_30d(uuid, boolean) to service_role;
```

- [ ] **Step 2: Pedir confirmação ao Lucas e aplicar**

Avisar o risco (tabela com dado real; só colunas nullable + função). Após "sim", aplicar via MCP `apply_migration` (project `mdbqhmkblzyllkyxjhrd`, name `card_risk`, query = conteúdo do arquivo).

- [ ] **Step 3: Verificar**

```sql
select org_id, status, aprovado_em, limite_cartao_30d from asaas_subaccounts;
-- Esperado: Orbi Demo com aprovado_em = 2026-08-27 00:34:38+00, limite null

select o.slug,
       public.card_volume_30d(o.id, false) as geradas_30d,
       public.card_volume_30d(o.id, true)  as pagas_30d
  from organizations o where o.slug in ('getshape', 'orbi-demo');
-- Esperado: getshape = soma manual abaixo; orbi-demo = 0 (vendas de cartão dela são seed sem asaas_id)

select sum(valor) from cobrancas c join organizations o on o.id = c.org_id
 where o.slug = 'getshape' and c.forma_pagamento = 'CREDIT_CARD' and c.asaas_id is not null
   and c.status not in ('CANCELLED','REFUNDED') and c.created_at >= now() - interval '30 days';
-- Esperado: igual a geradas_30d da getshape

select has_function_privilege('authenticated', 'public.card_volume_30d(uuid, boolean)', 'execute');
-- Esperado: false
```

- [ ] **Step 4: Documentar em CLAUDE.md (seção 6) e commitar**

Adicionar linha na tabela de migrations:
`| 20261001000001 | asaas_subaccounts.aprovado_em / limite_cartao_30d + RPC card_volume_30d (service_role only) — teto/reserva de cartão de conta nova (spec 2026-10-01). Aplicada em <data>. |`

```bash
git add supabase/migrations/20261001000001_card_risk.sql CLAUDE.md
git commit -m "feat(db): aprovado_em, limite_cartao_30d e RPC card_volume_30d"
git push
```

---

### Task 3: `enviar-email` — tipo `alerta_admin`

**Files:**
- Modify: `supabase/functions/enviar-email/index.ts` (handler em ~538-630)

**Interfaces:**
- Produces: `POST enviar-email` com `{ type: "alerta_admin", titulo: string, linhas: string[] }`, só aceito com `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; sempre envia para `contato@orbihealth.com.br`; `to` do payload ignorado.

- [ ] **Step 1: Ler o handler inteiro** (`sed -n '536,640p'`) para localizar onde `to` é usado no envio ao Resend (`to: [to]`).

- [ ] **Step 2: Implementar**

No topo, junto das outras consts:

```ts
// alerta_admin: destinatário FIXO. A função é pública (sem JWT) — aceitar
// destinatário/HTML do payload viraria relay de spam.
const ADMIN_ALERT_EMAIL = "contato@orbihealth.com.br";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const escHtml = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
```

No handler, logo após `const { type, to, ...data } = body;`: trocar o uso de `to` no envio por uma variável `recipient`:

```ts
    let recipient = to;
```

e antes do `else { return json({ error: \`Unknown email type...` adicionar:

```ts
    } else if (type === "alerta_admin") {
      if (!SERVICE_ROLE_KEY || req.headers.get("Authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      const { titulo, linhas } = data;
      if (!titulo || !Array.isArray(linhas)) return json({ error: "Missing fields for alerta_admin" }, 400);
      recipient = ADMIN_ALERT_EMAIL;
      subject = `[ORBI alerta] ${String(titulo).slice(0, 120)}`;
      html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">`
        + `<h2 style="font-size:16px;margin:0 0 12px">${escHtml(titulo)}</h2>`
        + linhas.slice(0, 30).map((l: unknown) => `<p style="margin:4px 0">${escHtml(l)}</p>`).join("")
        + `</div>`;
```

e no `fetch` do Resend: `to: [recipient]`. Se houver validação `if (!to)` antes dos tipos, mover para depois (ou trocar por `if (!recipient)` após o if/else).

- [ ] **Step 3: Conferir que nenhum outro tipo mudou** — `git diff supabase/functions/enviar-email/index.ts` só deve mostrar: as 3 consts, `let recipient = to;`, o bloco `alerta_admin` e `to: [recipient]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/enviar-email/index.ts
git commit -m "feat(email): tipo alerta_admin com destinatário fixo e só service_role"
git push
```

(Deploy fica para a Task 8.)

---

### Task 4: Reserva na Carteira e no saque

**Files:**
- Modify: `supabase/functions/get-asaas-subaccount/index.ts` (helpers ~63-119, select ~161-166, bloco de saldo ~169-198, resposta ~234-246)
- Modify: `supabase/functions/solicitar-saque-asaas/index.ts` (helpers ~29-73, select ~99-103, chamada ~127-133)

**Interfaces:**
- Consumes: de Task 1 — `todayBR`, `addDays`, `cardHold`, `purchaseDate`, `netCents`, `cardCapCents`, `RESERVE_DAYS`, `CARD_HOLD_DAYS`, `AsaasCardPayment`; de Task 2 — RPC `card_volume_30d`, colunas `aprovado_em`, `limite_cartao_30d`.
- Produces: resposta de `get-asaas-subaccount` ganha `cardVolume30d: number | null` (reais, geradas) e `cardCap: number | null` (reais; null = sem teto); `available`/`inRelease`/`nextRelease` passam a incluir a reserva.

- [ ] **Step 1: `get-asaas-subaccount` — trocar helpers locais pelo módulo**

Remover `CARD_HOLD_DAYS`, `todayBR`, `addDays` locais e `fetchCardHold`; adicionar no topo:

```ts
import {
  todayBR, addDays, cardHold, purchaseDate, netCents, cardCapCents,
  CARD_HOLD_DAYS, RESERVE_DAYS, type AsaasCardPayment,
} from "../_shared/cardRisk.ts";
```

Manter `listCardPayments` e substituir `fetchCardHold` por:

```ts
async function fetchCardHold(apiKey: string, aprovadoEm: string | null) {
  const today = todayBR();
  const [received, confirmed] = await Promise.all([
    // reserva pode durar até RESERVE_DAYS, então busca liquidações desse período
    listCardPayments(apiKey, { status: "RECEIVED", "paymentDate[ge]": addDays(today, -RESERVE_DAYS) }),
    listCardPayments(apiKey, { status: "CONFIRMED" }),
  ]);

  let retainedCents = 0;
  let pendingCents = 0;
  let nextRelease: string | null = null;
  const bump = (d: string | null) => { if (d && (!nextRelease || d < nextRelease)) nextRelease = d; };

  for (const p of received as AsaasCardPayment[]) {
    const h = cardHold(p, aprovadoEm, today);
    retainedCents += h.cents;
    if (h.cents > 0) bump(h.releaseDate);
  }
  for (const p of confirmed as AsaasCardPayment[]) {
    pendingCents += netCents(p);
    const purchase = purchaseDate(p);
    const credit = String(p.estimatedCreditDate ?? "").slice(0, 10);
    const holdEnd = purchase ? addDays(purchase, CARD_HOLD_DAYS) : "";
    bump([credit, holdEnd].filter(Boolean).sort().pop() ?? null);
  }
  return { retainedCents, pendingCents, nextRelease };
}
```

Select da subconta: `.select("status, created_at, api_key, pix_key, pix_key_type, aprovado_em, limite_cartao_30d")`.

Chamada: `const hold = await fetchCardHold(sub.api_key, sub.aprovado_em);`

Antes do `return json({ exists: true, ...`:

```ts
  // Uso do teto de cartão (geradas nos últimos 30 dias) — só pra exibir no
  // modal "Nova cobrança"; quem bloqueia de verdade é asaas-create-charge.
  let cardVolume30d: number | null = null;
  let cardCap: number | null = null;
  if (sub.status === "aprovado") {
    const capCents = cardCapCents(sub.aprovado_em, sub.limite_cartao_30d, todayBR());
    cardCap = capCents == null ? null : capCents / 100;
    const { data: vol, error: volErr } = await supabase.rpc("card_volume_30d", { p_org_id: organization_id, p_paid: false });
    if (volErr) console.error("[get-asaas-subaccount] card_volume_30d:", volErr.message);
    else cardVolume30d = Number(vol);
  }
```

e incluir `cardVolume30d, cardCap,` no objeto de resposta.

- [ ] **Step 2: `solicitar-saque-asaas` — mesma troca**

Remover `CARD_HOLD_DAYS`, `todayBR`, `addDays` locais; importar:

```ts
import { todayBR, addDays, cardHold, RESERVE_DAYS, type AsaasCardPayment } from "../_shared/cardRisk.ts";
```

Substituir `fetchRetainedCents`:

```ts
// Soma (em centavos) o que ainda está retido das vendas no cartão que já estão
// no saldo (30 dias + reserva de conta nova). Lança erro se a Asaas falhar —
// quem chama deve bloquear o saque, nunca liberar o saldo inteiro.
async function fetchRetainedCents(apiKey: string, aprovadoEm: string | null): Promise<number> {
  const today = todayBR();
  const since = addDays(today, -RESERVE_DAYS);
  let retained = 0;
  for (let offset = 0, page = 0; page < 20; page++, offset += 100) {
    const qs = new URLSearchParams({
      billingType: "CREDIT_CARD", status: "RECEIVED",
      "paymentDate[ge]": since, limit: "100", offset: String(offset),
    });
    const res = await fetch(`${ASAAS_BASE}/payments?${qs}`, { headers: { "access_token": apiKey } });
    if (!res.ok) throw new Error(`payments ${res.status}: ${await res.text()}`);
    const body = await res.json();
    for (const p of (body?.data ?? []) as AsaasCardPayment[]) retained += cardHold(p, aprovadoEm, today).cents;
    if (!body?.hasMore) return retained;
  }
  throw new Error("payments: paginação excedeu o limite");
}
```

Select: `.select("status, api_key, pix_key, pix_key_type, aprovado_em")`; chamada: `fetchRetainedCents(sub.api_key, sub.aprovado_em)`. Mensagem de saldo insuficiente com retenção: `"Saldo insuficiente pra esse valor. Parte das vendas no cartão ainda está em liberação."`

- [ ] **Step 3: Rodar os testes do módulo de novo** — `node --test supabase/functions/_shared/cardRisk.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/get-asaas-subaccount/index.ts supabase/functions/solicitar-saque-asaas/index.ts
git commit -m "feat(carteira): reserva de 20% até 120 dias em vendas de conta nova"
git push
```

---

### Task 5: Teto nas duas portas de cobrança no cartão

**Files:**
- Modify: `supabase/functions/asaas-create-charge/index.ts` (após a trava de subconta, ~184-193)
- Modify: `supabase/functions/escolher-pagamento-cobranca/index.ts` (após a trava gs_brand, ~106-119)

**Interfaces:**
- Consumes: Task 1 `todayBR`, `cardCapCents`, `exceedsCap`; Task 2 RPC e colunas.

- [ ] **Step 1: `asaas-create-charge`**

Import no topo:

```ts
import { todayBR, cardCapCents, exceedsCap } from "../_shared/cardRisk.ts";
```

Select da subconta: `.select("id, api_key, status, aprovado_em, limite_cartao_30d")`.

Logo depois do `if (!useSubaccount && !orgRow?.is_gs_brand) { throw ... }`:

```ts
    // Teto de cartão de conta nova (spec 2026-10-01). Antes de qualquer chamada
    // ao Asaas. Falha ao medir o volume bloqueia (fail-closed).
    if (useSubaccount && forma_pagamento === "CREDIT_CARD") {
      const capCents = cardCapCents(subaccount!.aprovado_em, subaccount!.limite_cartao_30d, todayBR());
      if (capCents != null) {
        const { data: vol, error: volErr } = await supabase.rpc("card_volume_30d", { p_org_id: org_id, p_paid: false });
        if (volErr) throw new Error("Não foi possível validar o limite do cartão. Tente novamente.");
        const volCents = Math.round(Number(vol) * 100);
        if (exceedsCap(volCents, Math.round(Number(valor) * 100), capCents)) {
          throw new Error(
            `Limite de vendas no cartão atingido (${fmtBRL(volCents / 100)} de ${fmtBRL(capCents / 100)} nos últimos 30 dias). Use Pix ou aguarde.`,
          );
        }
      }
    }
```

- [ ] **Step 2: `escolher-pagamento-cobranca`**

Import no topo:

```ts
import { todayBR, cardCapCents, exceedsCap } from "../_shared/cardRisk.ts";
```

Select da subconta: `.select("id, api_key, status, aprovado_em, limite_cartao_30d")`.

Depois do bloco `if (!useSubaccount) { ... }`:

```ts
    // Teto de cartão de conta nova — mesma regra de asaas-create-charge.
    if (useSubaccount && forma_pagamento === "CREDIT_CARD") {
      const capCents = cardCapCents(subaccount!.aprovado_em, subaccount!.limite_cartao_30d, todayBR());
      if (capCents != null) {
        const { data: vol, error: volErr } = await supabase.rpc("card_volume_30d", { p_org_id: cobranca.org_id, p_paid: false });
        if (volErr || exceedsCap(Math.round(Number(vol) * 100), Math.round(valor * 100), capCents)) {
          return json({ error: "Cartão indisponível no momento. Pague por Pix." }, 400);
        }
      }
    }
```

- [ ] **Step 3: Revisar os dois diffs** — a cobrança da getshape (`useSubaccount = false`) não passa por nenhum bloco novo; Pix não passa por nenhum bloco novo.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/asaas-create-charge/index.ts supabase/functions/escolher-pagamento-cobranca/index.ts
git commit -m "feat(cobranca): teto de R$ 5.000/30d no cartão pra conta nova"
git push
```

---

### Task 6: Webhook — `aprovado_em`, alerta de volume e chargeback

**Files:**
- Modify: `supabase/functions/asaas-webhook/index.ts` (helpers antes de `serve`, case `ACCOUNT_STATUS_*` ~460-474, novo case de chargeback, bloco de cobranças avulsas ~505-513)
- Modify: `supabase/functions/create-asaas-subaccount/index.ts` (lista `events` ~166-173)

**Interfaces:**
- Consumes: Task 1 `todayBR`, `addDays`, `ALERT_THRESHOLD_CENTS`; Task 2 RPC/colunas; Task 3 `alerta_admin`.

- [ ] **Step 1: Import e helpers (antes de `serve`)**

```ts
import { todayBR, addDays, ALERT_THRESHOLD_CENTS } from "../_shared/cardRisk.ts";

// Alerta pro Lucas quando uma subconta passa de R$ 3.000 pagos no cartão em
// 30 dias. Máx. 1 entregue por org a cada 30 dias. Best-effort.
async function maybeAlertCardVolume(orgId: string) {
  try {
    const { data: sub } = await supabase
      .from("asaas_subaccounts").select("aprovado_em")
      .eq("org_id", orgId).eq("status", "aprovado").maybeSingle();
    if (!sub) return;

    const { data: vol, error: volErr } = await supabase.rpc("card_volume_30d", { p_org_id: orgId, p_paid: true });
    if (volErr) { console.error("[webhook] card_volume_30d:", volErr.message); return; }
    if (Math.round(Number(vol) * 100) < ALERT_THRESHOLD_CENTS) return;

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recent } = await supabase
      .from("notification_logs").select("id")
      .eq("org_id", orgId).eq("notification_type", "alerta_volume_cartao")
      .eq("delivered", true).gte("created_at", since).limit(1);
    if (recent?.length) return;

    const { data: org } = await supabase
      .from("organizations").select("name, slug, owner_id").eq("id", orgId).maybeSingle();
    if (!org) return;

    const { data: pagas } = await supabase
      .from("cobrancas").select("aluno_id")
      .eq("org_id", orgId).eq("forma_pagamento", "CREDIT_CARD").not("asaas_id", "is", null)
      .in("status", ["RECEIVED", "CONFIRMED"]).gte("data_pagamento", addDays(todayBR(), -30));
    const alunoIds = [...new Set((pagas ?? []).map((p) => p.aluno_id as string))];
    let semTreino = 0;
    if (alunoIds.length) {
      const { data: logs } = await supabase.from("treino_sessoes_log").select("aluno_id").in("aluno_id", alunoIds);
      const comTreino = new Set((logs ?? []).map((l) => l.aluno_id as string));
      semTreino = alunoIds.filter((id) => !comTreino.has(id)).length;
    }
    const dias = sub.aprovado_em
      ? Math.floor((Date.now() - new Date(sub.aprovado_em).getTime()) / 86400000)
      : null;

    const titulo = `Volume de cartão alto: ${org.name}`;
    const linhas = [
      `Treinador: ${org.name} (/${org.slug})`,
      `Vendas pagas no cartão nos últimos 30 dias: ${fmtBRL(Number(vol))} (${(pagas ?? []).length} cobranças)`,
      `Carteira aprovada há: ${dias == null ? "data desconhecida" : `${dias} dias`}`,
      `Alunos pagantes no cartão sem nenhum treino concluído: ${semTreino} de ${alunoIds.length}`,
    ];
    const { error: mailErr } = await supabase.functions.invoke("enviar-email", {
      body: { type: "alerta_admin", titulo, linhas },
    });
    if (mailErr) console.error("[webhook] alerta volume e-mail:", mailErr.message);
    await supabase.from("notification_logs").insert({
      recipient_id: org.owner_id, org_id: orgId, notification_type: "alerta_volume_cartao",
      title: titulo, body: linhas.join("\n"), delivered: !mailErr,
    });
  } catch (e) {
    console.error("[webhook] maybeAlertCardVolume:", e instanceof Error ? e.message : e);
  }
}

// Chargeback em qualquer cobrança (subconta ou master): e-mail imediato.
async function alertChargeback(event: string, payment: Record<string, unknown> | undefined) {
  try {
    const paymentId = payment?.id as string | undefined;
    let orgNome = "org desconhecida";
    let descricao = "";
    if (paymentId) {
      const { data: cob } = await supabase
        .from("cobrancas").select("org_id, descricao").eq("asaas_id", paymentId).maybeSingle();
      if (cob) {
        descricao = cob.descricao ?? "";
        const { data: org } = await supabase.from("organizations").select("name, slug").eq("id", cob.org_id).maybeSingle();
        if (org) orgNome = `${org.name} (/${org.slug})`;
      }
    }
    const chargeback = payment?.chargeback as Record<string, unknown> | undefined;
    const titulo = `Chargeback: ${orgNome}`;
    const linhas = [
      `Evento: ${event}`,
      `Treinador: ${orgNome}`,
      `Cobrança: ${descricao || "(não encontrada no ORBI — pode ser parcela 2+ de um parcelamento)"}`,
      `Valor: ${fmtBRL(Number(payment?.value ?? 0))}`,
      `Motivo: ${String(chargeback?.reason ?? "não informado")}`,
      `ID do pagamento no Asaas: ${paymentId ?? "?"}`,
    ];
    const { error } = await supabase.functions.invoke("enviar-email", { body: { type: "alerta_admin", titulo, linhas } });
    if (error) console.error("[webhook] alerta chargeback e-mail:", error.message);
  } catch (e) {
    console.error("[webhook] alertChargeback:", e instanceof Error ? e.message : e);
  }
}
```

- [ ] **Step 2: `aprovado_em` na aprovação**

No case `ACCOUNT_STATUS_GENERAL_APPROVAL_*`, depois do update existente, dentro do `if (asaasAccountId)`:

```ts
        if (event === "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED") {
          await supabase
            .from("asaas_subaccounts")
            .update({ aprovado_em: new Date().toISOString() })
            .eq("asaas_account_id", asaasAccountId)
            .is("aprovado_em", null);
        }
```

- [ ] **Step 3: Case de chargeback** (antes do `default:`)

```ts
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
    case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL": {
      await alertChargeback(event, payment);
      break;
    }
```

- [ ] **Step 4: Alerta de volume após pagamento de cartão**

No bloco de cobranças avulsas, no select do `cob`, incluir `forma_pagamento`:
`.select("id, treinador_id, org_id, aluno_id, valor, descricao, data_vencimento, forma_pagamento")`
e no fim do `if (cob) { ... }` (depois do update de `alunos`):

```ts
          if (cob.forma_pagamento === "CREDIT_CARD") await maybeAlertCardVolume(cob.org_id);
```

- [ ] **Step 5: `create-asaas-subaccount` — eventos de chargeback**

Na lista `events`, depois de `"PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED",` adicionar:

```ts
              // Sem isso a gente nunca fica sabendo de contestação numa subconta
              // (spec 2026-10-01).
              "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
```

- [ ] **Step 6: Revisar diff do webhook** — o fluxo de assinatura (Fluxo B) e o de cobrança avulsa não mudam, só ganham chamadas novas no fim; nenhum `await` novo pode lançar (tudo em try/catch).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/asaas-webhook/index.ts supabase/functions/create-asaas-subaccount/index.ts
git commit -m "feat(webhook): aprovado_em, alerta de volume de cartão e de chargeback"
git push
```

---

### Task 7: Modal "Nova cobrança" mostra o uso do teto

**Files:**
- Modify: `src/pages/coach/Financeiro.tsx` — tipo `subStatus` (~896), `NovaCobrancaProps` (~243), botões de forma (~518-541), botão "Gerar cobrança" (~658), render do modal (~1168)

**Interfaces:**
- Consumes: Task 4 — `cardVolume30d`, `cardCap` em `get-asaas-subaccount`.

- [ ] **Step 1: Tipo do subStatus** — acrescentar `cardVolume30d?: number | null; cardCap?: number | null;`.

- [ ] **Step 2: Prop nova no modal**

```ts
interface NovaCobrancaProps {
  orgId: string;
  isGsBrand: boolean;
  alunos: AlunoOption[];
  // Teto de cartão de conta nova (reais). null/undefined = sem teto.
  cardUsage?: { volume: number; cap: number } | null;
  onClose: () => void;
  onCreated: (c: Cobranca) => void;
}
```

Assinatura: `({ orgId, isGsBrand, alunos, cardUsage, onClose, onCreated }: NovaCobrancaProps)`.

Depois de `const valorFinal = computedValor();`:

```ts
  // Só cobrança personalizada no cartão passa pelo teto aqui; plano real vira
  // cobrança adiada e o teto é checado quando o aluno escolhe cartão.
  const cardValorNum = parseBRL(manualValor || "0") || 0;
  const cardOverCap = !!cardUsage && planId === CUSTOM_PLAN_ID && forma === "CREDIT_CARD"
    && cardUsage.volume + cardValorNum > cardUsage.cap;
```

- [ ] **Step 3: Aviso abaixo dos botões PIX/Cartão** (dentro do bloco `{isCustom && planId && (...)}`, após o `</div>` do grid):

```tsx
            {forma === "CREDIT_CARD" && cardUsage && (
              <p className="text-[11px] mt-1" style={{ color: cardOverCap ? "#f87171" : "rgba(255,255,255,0.4)" }}>
                {fmtBRL(cardUsage.volume)} de {fmtBRL(cardUsage.cap)} usados no cartão nos últimos 30 dias
                {cardOverCap && " — esse valor passa do limite. Use Pix ou aguarde."}
              </p>
            )}
```

- [ ] **Step 4: Botão** — `disabled={saving || alunos.length === 0 || cardOverCap}`.

- [ ] **Step 5: Passar a prop no render**

```tsx
          cardUsage={subStatus?.cardCap != null && subStatus?.cardVolume30d != null
            ? { volume: subStatus.cardVolume30d, cap: subStatus.cardCap }
            : null}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `37`

- [ ] **Step 7: Commit**

```bash
git add src/pages/coach/Financeiro.tsx
git commit -m "feat(financeiro): modal mostra uso do teto de cartão de conta nova"
git push
```

---

### Task 8: Deploy, webhook da Orbi Demo e verificação ao vivo

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Pedir confirmação explícita ao Lucas** para deploy de: `enviar-email`, `get-asaas-subaccount`, `solicitar-saque-asaas`, `asaas-create-charge`, `escolher-pagamento-cobranca`, `asaas-webhook`, `create-asaas-subaccount`.

- [ ] **Step 2: Conferir drift antes de sobrescrever** — para `enviar-email` e `asaas-webhook` (não publicadas nesta sessão), comparar data do último deploy (`list_edge_functions.updated_at`) com `git log -1` do arquivo antes das mudanças; se o deploy for mais novo que o último commit, baixar com `get_edge_function` e comparar antes de prosseguir.

- [ ] **Step 3: Deploy com o módulo `_shared`** — via MCP `deploy_edge_function`, manter o `verify_jwt` atual de cada função (`list_edge_functions`), enviando dois arquivos com a estrutura de pastas preservada:
  - `entrypoint_path`: `<funcao>/index.ts`
  - `files`: `[{ name: "<funcao>/index.ts", content }, { name: "_shared/cardRisk.ts", content }]`
  Começar por `enviar-email` (não usa o módulo) e depois `get-asaas-subaccount` como canário. Smoke test do canário (POST com anon key → `{"error":"Unauthorized"}` 401). **Se o deploy recusar o import relativo**: parar, avisar o Lucas e trocar o import por uma cópia do módulo dentro de cada função (`./cardRisk.ts`), commitando a mudança antes de continuar.

- [ ] **Step 4: Smoke test de todas** (mesmo comando da sessão de 2026-09-30): JWT → 401 `Unauthorized`; `escolher-pagamento-cobranca` → 400 `Campos obrigatórios ausentes`; `asaas-webhook` sem token → 401.

- [ ] **Step 5: Atualizar o webhook da Orbi Demo sem tirar a chave do banco** (pg_net, a `api_key` nunca sai do Postgres):

```sql
-- 1) listar webhooks da subconta
select net.http_get(
  url := 'https://www.asaas.com/api/v3/webhooks',
  headers := jsonb_build_object('access_token', api_key)
) from asaas_subaccounts where org_id = '10000000-0000-0000-0000-000000000000';
-- ler a resposta (id do webhook "ORBI Health — Fluxo A" e events atuais):
select id, status_code, content::jsonb from net._http_response order by id desc limit 1;
```

Com o `<WEBHOOK_ID>` e a lista atual de `events`:

```sql
select net.http_put(
  url := 'https://www.asaas.com/api/v3/webhooks/<WEBHOOK_ID>',
  body := jsonb_build_object('events', '<events atuais + os 3 de chargeback, como json array>'::jsonb),
  headers := jsonb_build_object('access_token', api_key, 'Content-Type', 'application/json')
) from asaas_subaccounts where org_id = '10000000-0000-0000-0000-000000000000';
select status_code, content::jsonb -> 'events' from net._http_response order by id desc limit 1;
```

Expected: 200 e `events` contendo `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`.

- [ ] **Step 6a: Teste do teto na tela (sem dinheiro)** — depois do deploy da Vercel, o Lucas entra na Orbi Demo (`teste@orbihealth.com.br`) → Financeiro → Nova cobrança → Personalizada → Cartão, valor R$ 5.001. Esperado: "R$ 0,00 de R$ 5.000,00 usados…" em vermelho com o aviso, e botão "Gerar cobrança" desabilitado.

- [ ] **Step 6b: Teste do teto no servidor (sem dinheiro)** — prova que o servidor bloqueia mesmo se a tela deixasse passar:
  1. Lucas abre o modal (a tela carrega o teto de R$ 5.000) e **não fecha**.
  2. Via SQL: `update asaas_subaccounts set limite_cartao_30d = 1 where org_id = '10000000-0000-0000-0000-000000000000';`
  3. Lucas gera cobrança personalizada no cartão de R$ 5,00 (a tela ainda acha que o teto é R$ 5.000 e deixa enviar).
  4. Esperado: toast "Limite de vendas no cartão atingido (R$ 0,00 de R$ 1,00 …)".
  5. Conferir que nada foi criado: `select count(*) from cobrancas where org_id = '10000000-0000-0000-0000-000000000000' and created_at > now() - interval '1 hour';` → 0.
  6. Reverter: `update asaas_subaccounts set limite_cartao_30d = null where org_id = '10000000-0000-0000-0000-000000000000';`
  Risco se o servidor NÃO bloquear: nasce uma cobrança de R$ 5 **pendente** no Asaas (nenhum dinheiro se move). Nesse caso, apagar via `DELETE /v3/payments/{id}` (pg_net com a chave da subconta, como no Step 5) e a linha em `cobrancas`, e investigar antes de seguir.

- [ ] **Step 7: Teste do e-mail de alerta**
  1. Sem service key → 401: `curl -s -X POST "$URL/functions/v1/enviar-email" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"type":"alerta_admin","titulo":"x","linhas":["x"]}'` → `{"error":"Unauthorized"}`.
  2. Com service key: verificar se ela está no Vault (`select name from vault.decrypted_secrets where name ilike '%service%';`). Se estiver, disparar por pg_net sem expor a chave:
     `select net.http_post(url := '<SUPABASE_URL>/functions/v1/enviar-email', body := '{"type":"alerta_admin","titulo":"Teste de alerta ORBI","linhas":["Disparo de teste do plano 2026-10-01. Pode ignorar."]}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '<nome>')));`
     e pedir ao Lucas para confirmar que chegou em `contato@orbihealth.com.br`.
  3. Se a service key não estiver no Vault: **não** colocá-la lá só pra isso; registrar "envio de alerta não testado ao vivo — validar no primeiro alerta real" no relatório final.

- [ ] **Step 8: Limpar dados de teste** — nenhum esperado; conferir `notification_logs` e `cobrancas` da Orbi Demo criados na última hora e apagar se houver.

- [ ] **Step 9: ROADMAP** — perguntar ao Lucas se registra como concluído (regra 8 do CLAUDE.md). Registrar também como pendências: calculadora de subconta com antecipação sempre ligada (`PUT /v3/anticipations/configurations` na aprovação); recuperação de estorno pós-30 dias; dossiê de chargeback; bug do e-mail anual do `promoteFromIntro`.

- [ ] **Step 10: Commit final**

```bash
git add ROADMAP.md
git commit -m "docs: registra teto/reserva/alertas de cartão e próximos passos"
git push
```
