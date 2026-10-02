# Teto, reserva e alertas de cartão para contas novas da Carteira (ORBI Pay)

**Data:** 2026-10-01 · **Status:** aprovado em conversa, aguardando revisão da spec

## Objetivo

Limitar o prejuízo da LCTEAM quando um treinador mal-intencionado vende no cartão,
saca e some antes do chargeback (que pode chegar até ~120 dias depois da compra).
Pelo contrato de BaaS e pela resposta do Asaas (2026-09-30), quando a subconta não
tem saldo para cobrir um chargeback, **o valor é descontado da conta pai**.

A recuperação "descontando das vendas futuras" só protege contra o treinador honesto
— o golpista não vende mais depois do estorno. Por isso a defesa aqui é **limitar o
volume e segurar parte do dinheiro no período de maior risco** (conta nova), mais
**alertas** para o Lucas monitorar.

**Sucesso:** no pior caso (treinador golpista desde o primeiro dia), o prejuízo máximo
é conhecido e limitado (~R$ 8 mil), sem travar a venda típica de um treinador honesto
(plano anual/semestral de R$ 1.500–5.000 numa única venda, conforme as vendas reais
da getshape em jul–set/2026).

## O que já existe (não muda)

- Retenção de **30 dias** de toda venda no cartão antes do saque, contados da data da
  compra (`confirmedDate`) — `solicitar-saque-asaas` e `get-asaas-subaccount`, commit `2f70375`.
- Cobrança só por subconta aprovada (exceto gs_brand, que usa a conta master) — commit `7cf125a`.
- Carteira só é liberada com a assinatura ORBI `active` (fim do teste + 1ª cobrança paga).
- `BAAS_READY = false` continua travando treinador real até o contrato de BaaS sair.
- Pix fica fora de todas as regras novas (não tem chargeback como o cartão).

## Regras

| Regra | Valor | Vale quando |
|---|---|---|
| Período de conta nova | 90 dias a partir de `asaas_subaccounts.aprovado_em` | — |
| Teto de cartão | R$ 5.000 em cobranças de cartão **geradas** nos últimos 30 dias corridos | só no período de conta nova |
| Alerta | volume de cartão **pago** nos últimos 30 dias corridos ≥ R$ 3.000 | sempre (máx. 1 alerta por org a cada 30 dias) |
| Reserva | 20% de cada venda no cartão liberado só em compra + 120 dias (os outros 80% seguem a regra de 30 dias) | só vendas cuja compra caiu no período de conta nova |
| Exceção manual | `asaas_subaccounts.limite_cartao_30d` substitui o teto de R$ 5.000 daquela org | se preenchido (null = regra padrão) |

Definições:
- **"Gerada"** = linha em `cobrancas` com `forma_pagamento = 'CREDIT_CARD'`,
  `asaas_id IS NOT NULL`, `created_at` nos últimos 30 dias, status fora de
  `CANCELLED`/`REFUNDED`/`DELETED`. Conta o gerado (não só o pago) para impedir que o
  golpista gere várias cobranças de uma vez antes de qualquer uma ser paga. Cobranças
  adiadas ainda sem escolha (`asaas_id IS NULL`) não contam — passam a contar quando o
  aluno escolhe cartão.
- **Teto inclui a cobrança nova:** recusa se `volume_30d + valor_nova > teto`.
- **Exceção manual** vale também fora do período de conta nova (se o Lucas quiser
  limitar alguém depois dos 90 dias, basta preencher).
- Datas no fuso `America/Sao_Paulo`, mesmo padrão de `todayBR()`/`addDays()` já em uso.

## Mudanças

### Banco (1 migration)
- `asaas_subaccounts.aprovado_em timestamptz null` — preenchido pelo `asaas-webhook` no
  evento `ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED` (só se ainda for null).
  Backfill: linhas já `aprovado` recebem `created_at` (hoje só a Orbi Demo, conta interna).
- `asaas_subaccounts.limite_cartao_30d numeric null`.
- Sem tabela nova: dedup do alerta usa `notification_logs`
  (`notification_type = 'alerta_volume_cartao'`, `org_id`, `created_at`).

### Lógica pura (testável)
Funções puras de data/valor (sem I/O), com testes automatizados:
- `isNewAccount(aprovadoEm, today)` → dentro dos 90 dias?
- `cardCapFor(sub, today)` → teto aplicável (override, 5.000 ou sem teto).
- `exceedsCap(volume30d, novoValor, teto)`.
- `heldCents(payment, aprovadoEm, today)` → quanto daquela venda ainda está retido
  (100% até +30, 20% até +120 se a compra caiu no período de conta nova, 0 depois).
- `nextReleaseDate(...)`.

Como as Edge Functions são arquivos isolados e o projeto duplica regras simples entre
elas de propósito, a lógica vai num módulo `supabase/functions/_shared/cardRisk.ts`
importado pelas funções que precisam (primeiro módulo `_shared` do projeto — deploy via
MCP precisa enviar o arquivo junto). O módulo não importa nada de Deno, então roda também
no Node. Testes em `supabase/functions/_shared/cardRisk.test.ts` com `node --test` (Node 24
executa TypeScript nativamente; o repo não tem test runner e não vamos adicionar dependência).

### Edge Functions
- **`asaas-create-charge`**: se `forma_pagamento = CREDIT_CARD` e a org usa subconta,
  calcula o volume 30d e recusa acima do teto com
  "Limite de vendas no cartão atingido (R$ X de R$ 5.000 nos últimos 30 dias). Use Pix ou aguarde."
  — recusa **antes** de qualquer chamada ao Asaas.
- **`escolher-pagamento-cobranca`**: mesma checagem quando o aluno escolhe cartão;
  mensagem ao aluno: "Cartão indisponível no momento. Pague por Pix."
- **`get-asaas-subaccount` / `solicitar-saque-asaas`**: cálculo de retenção passa a usar
  `heldCents` (busca pagamentos de cartão `RECEIVED` com `paymentDate >= hoje − 120`).
  `get-asaas-subaccount` também devolve `cardVolume30d` e `cardCap` (null = sem teto)
  para a tela.
- **`asaas-webhook`**:
  - preenche `aprovado_em` na aprovação da subconta;
  - em `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` de cartão de cobrança de subconta: calcula
    o volume pago 30d; se ≥ R$ 3.000 e sem alerta da org nos últimos 30 dias → e-mail;
  - novos eventos de chargeback (`PAYMENT_CHARGEBACK_REQUESTED`,
    `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`): e-mail
    imediato. Best-effort — falha no e-mail nunca derruba o webhook.
- **`create-asaas-subaccount`**: incluir os eventos de chargeback na lista registrada
  no webhook de subcontas novas.
- **Orbi Demo**: atualizar o webhook já registrado (`PUT /v3/webhooks/{id}` com a chave
  da subconta) para incluir os eventos de chargeback. Operação única.

- **`enviar-email`**: tipo novo `alerta_admin` (`{ titulo, linhas: string[] }`). O
  destinatário é **fixo** em `contato@orbihealth.com.br` e o `to` do payload é ignorado —
  a função é pública (sem JWT), então aceitar destinatário/HTML livre viraria relay de spam.
  Conteúdo do alerta de volume: nome da org, volume pago 30d, nº de vendas, dias desde
  `aprovado_em`, quantos alunos pagantes nunca concluíram treino (`treino_sessoes_log`).
  Chargeback: org, aluno, valor, motivo/evento, id do pagamento.

### Frontend (`Financeiro.tsx`)
- Modal "Nova cobrança": quando a org tem teto, mostra "R$ X de R$ 5.000 usados nos
  últimos 30 dias" e desabilita a opção cartão se a cobrança passaria do teto.
- Carteira: "Em liberação" já inclui a reserva (vem do backend); sem mudança de layout.

## Fora de escopo (próximas etapas)
- Recuperação de estorno pós-30 dias (transferir da subconta para a conta pai).
- Dossiê de defesa de chargeback (envio de provas pelo Asaas).
- Tela de superadmin com volume/retido/chargebacks por treinador.
- Conta Escrow do Asaas.
- Termo de uso do treinador (jurídico) e regularização de CNAE (contador).
- **Bug achado, não corrigido aqui:** `asaas-webhook` (`promoteFromIntro`, plano anual)
  chama `enviar-email` com `{ to, subject, html }` sem `type` — o `enviar-email` responde
  "Unknown email type" e esse aviso ("sua assinatura anual está pronta para pagamento")
  nunca foi entregue. Registrar no ROADMAP.

## Testes
- Automatizados: funções puras de `cardRisk.ts` (limites exatos, 30/90/120 dias, virada
  de fuso, override, conta antiga sem teto).
- `npx tsc --noEmit -p tsconfig.app.json` sem erro novo (baseline 37).
- Pós-deploy, na Orbi Demo: gerar cobrança de cartão acima do teto → recusada sem
  criar nada no Asaas; aviso de uso no modal; e-mail de alerta disparado manualmente
  e confirmado pelo Lucas; webhook da Orbi Demo listando os eventos de chargeback.
- Nada de cobrança real no cartão para testar.

## Riscos
- Mexe em `asaas-webhook`, que processa pagamentos reais da getshape e do Fluxo B — as
  mudanças ficam em ramos novos (eventos de subconta/chargeback), sem tocar no fluxo
  atual de assinatura; deploy só com confirmação explícita.
- Migration em tabela com dado real (`asaas_subaccounts`): só adiciona colunas nullable.
- Primeiro módulo `_shared` — se o deploy via MCP não aceitar import relativo, a lógica
  é duplicada nas funções (padrão atual do projeto).
