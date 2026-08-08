-- ================================================================
-- Trial passa de 7 pra 10 dias (alinhado com a Prime Coaching,
-- confirmado pelo Lucas em 2026-07-18). Só afeta orgs novas — orgs
-- existentes mantêm o trial_ends_at que já têm gravado.
-- ================================================================

ALTER TABLE organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '10 days');

COMMENT ON COLUMN organizations.custom_trial_days IS
  'Override dos dias de trial padrão (10). Não afeta trial_ends_at já gravado em orgs existentes.';
