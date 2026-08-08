-- ================================================================
-- Bug crítico achado em teste ao vivo (2026-07-18, org "fluxob"):
-- create-asaas-subscription tenta gravar organizations.subscription_status
-- = "pending" logo após criar a assinatura no Asaas (antes do webhook
-- confirmar o pagamento), mas a constraint organizations_subscription_status_check
-- só permitia 'trial'|'active'|'suspended'|'cancelled' — "pending" nunca foi
-- um valor válido aqui (só era válido em subscriptions.status). O UPDATE
-- falhava silenciosamente (erro não checado no código), a org ficava presa
-- em "trial" com trial_ends_at vencido, e o CoachLayout redirecionava o
-- usuário de volta pro /assinar mesmo já tendo pago de verdade.
-- ================================================================

ALTER TABLE organizations
  DROP CONSTRAINT organizations_subscription_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status = ANY (ARRAY['trial'::text, 'pending'::text, 'active'::text, 'suspended'::text, 'cancelled'::text]));

-- Corrige o registro da org "fluxob" (dado de teste) que ficou preso em
-- "trial" por causa desse bug, já que ela pagou de verdade.
UPDATE organizations SET subscription_status = 'pending' WHERE slug = 'fluxob';
