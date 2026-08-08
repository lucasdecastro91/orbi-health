-- ================================================================
-- Trial passa de 10 pra 14 dias. Decisão do Lucas em 2026-07-18:
-- como a Asaas exige mínimo de R$5 pra cobrança via Cartão (R$1 é
-- tecnicamente impossível — ver create-asaas-subscription/index.ts),
-- a ORBI "perde" pra Prime no valor da primeira cobrança (R$5 vs
-- R$1) e compensa dando 4 dias a mais de trial gratuito. Só afeta
-- orgs novas — orgs existentes mantêm o trial_ends_at já gravado.
-- ================================================================

ALTER TABLE organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

COMMENT ON COLUMN organizations.custom_trial_days IS
  'Override dos dias de trial padrão (14). Não afeta trial_ends_at já gravado em orgs existentes.';
