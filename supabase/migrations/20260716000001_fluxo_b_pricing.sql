-- ================================================================
-- Fluxo B: ORBI cobra o treinador — trial 7 dias, R$1 no 1º mês,
-- preço cheio a partir do ciclo seguinte. Campos flexíveis por org
-- pra cobrir parcerias com early adopters e rastreio de afiliado.
-- ================================================================

-- 1. Trial passa de 14 pra 7 dias (só afeta orgs novas — orgs
--    existentes mantêm o trial_ends_at que já têm gravado).
ALTER TABLE organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days');

-- 2. Campos de override por org (setados manualmente via SQL pelo
--    Lucas, sem UI de admin por enquanto — mesmo padrão já usado
--    pros ajustes de XP sintético).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_price       numeric,
  ADD COLUMN IF NOT EXISTS custom_trial_days  integer,
  ADD COLUMN IF NOT EXISTS referred_by        text;

COMMENT ON COLUMN organizations.custom_price IS
  'Override do preço cheio recorrente (parceria com early adopter). Quando setado junto com custom_trial_days, pula a cobrança de R$1 — vai direto pro valor customizado após o trial customizado.';
COMMENT ON COLUMN organizations.custom_trial_days IS
  'Override dos dias de trial padrão (7). Não afeta trial_ends_at já gravado em orgs existentes.';
COMMENT ON COLUMN organizations.referred_by IS
  'Código de indicação de afiliado (schema pronto — captura em ?ref=CODIGO e relatório de comissão ainda não implementados).';

-- 3. subscriptions: plan_type (cópia do organizations.plan_type no
--    momento da compra, pra manter histórico) + intro_payment_id
--    (cobrança avulsa de R$1, separada da subscription recorrente).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_type        text CHECK (plan_type IN ('motion','pro','balance','clinic')),
  ADD COLUMN IF NOT EXISTS intro_payment_id text;

CREATE INDEX IF NOT EXISTS subscriptions_intro_payment_id_idx ON subscriptions(intro_payment_id);

COMMENT ON COLUMN subscriptions.plan IS
  'Ciclo de cobrança (mensal/anual) — o "plano" de fato (Motion/Pro) fica em subscriptions.plan_type / organizations.plan_type.';
