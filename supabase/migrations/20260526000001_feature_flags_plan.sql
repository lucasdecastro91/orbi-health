-- Adiciona campo plan_type à tabela organizations para controle de feature flags.
-- Default 'pro' garante backward-compat: todas as orgs existentes mantêm acesso total.

ALTER TABLE organizations
  ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'pro'
  CHECK (plan_type IN ('motion', 'pro', 'balance', 'clinic'));

COMMENT ON COLUMN organizations.plan_type IS
  'Plano de produto da org: motion=só treino, pro=treino+dieta, balance=só dieta, clinic=tudo';
