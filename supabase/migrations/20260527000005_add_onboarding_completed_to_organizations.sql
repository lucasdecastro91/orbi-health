-- Adiciona coluna onboarding_completed à tabela organizations
-- Controla se o treinador já completou (ou dispensou) o checklist de onboarding

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.onboarding_completed IS
  'True quando o treinador completou ou dispensou definitivamente o checklist de onboarding.';
