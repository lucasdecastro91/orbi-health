-- ================================================================
-- Subscriptions & Billing (Asaas integration)
-- ================================================================

-- 1. Adiciona coluna trial_ends_at em organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','suspended','cancelled'));

-- 2. Tabela principal de assinaturas
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asaas_customer_id     text,
  asaas_subscription_id text,
  plan                  text NOT NULL CHECK (plan IN ('mensal','anual')),
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','cancelled')),
  next_billing_date     date,
  grace_until           timestamptz,           -- carência de 7 dias após vencimento
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS subscriptions_organization_id_idx ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS subscriptions_asaas_subscription_id_idx ON subscriptions(asaas_subscription_id);

-- Trigger: atualiza updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

-- 3. Histórico de pagamentos
CREATE TABLE IF NOT EXISTS payment_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  asaas_payment_id text,
  event_type      text NOT NULL,   -- PAYMENT_CONFIRMED, PAYMENT_OVERDUE, etc.
  amount          numeric(10,2),
  due_date        date,
  paid_at         timestamptz,
  raw_payload     jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_organization_id_idx ON payment_events(organization_id);
CREATE INDEX IF NOT EXISTS payment_events_subscription_id_idx ON payment_events(subscription_id);

-- 4. RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Donos da org veem próprias assinaturas
CREATE POLICY "org_owner_subscriptions" ON subscriptions
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "org_owner_payment_events" ON payment_events
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Service role bypass para Edge Functions (webhooks)
CREATE POLICY "service_role_subscriptions" ON subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_payment_events" ON payment_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
