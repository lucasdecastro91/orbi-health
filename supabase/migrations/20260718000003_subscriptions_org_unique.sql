-- ================================================================
-- Bug crítico achado em teste ao vivo (2026-07-18, org "fluxob"):
-- create-asaas-subscription sempre fez
-- upsert(..., { onConflict: "organization_id" }), mas a tabela nunca
-- teve uma constraint UNIQUE em organization_id — só FK + PK em id.
-- Toda vez que uma assinatura foi criada, o Postgres rejeitava o
-- upsert com "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" DEPOIS que o cartão já tinha sido
-- cobrado de verdade no Asaas — cobrança real, sem nunca gravar no
-- nosso banco. Bug existia desde que a tabela subscriptions foi
-- criada (20260423000001_subscriptions.sql), nunca tinha sido
-- exercitado de ponta a ponta até hoje.
-- ================================================================

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_organization_id_key UNIQUE (organization_id);
