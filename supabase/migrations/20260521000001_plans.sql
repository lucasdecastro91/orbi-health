-- ─────────────────────────────────────────────────────────────────────────────
-- Planos de serviço do treinador (usado nas cobranças)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plans (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trainer_id          uuid          NOT NULL REFERENCES auth.users(id),
  name                text          NOT NULL,
  pix_value           numeric(10,2),
  -- installment_options: array de opções de parcelamento no cartão
  -- [{ "installments": 6, "value": 3943.74 }, { "installments": 12, "value": 4208.40 }]
  -- "value" = valor total cobrado do cliente (Asaas divide pelo número de parcelas)
  installment_options jsonb         NOT NULL DEFAULT '[]',
  active              boolean       NOT NULL DEFAULT true,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plans_org_idx     ON public.plans (org_id);
CREATE INDEX IF NOT EXISTS plans_trainer_idx ON public.plans (trainer_id);
CREATE INDEX IF NOT EXISTS plans_active_idx  ON public.plans (trainer_id, active);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages own plans"
  ON public.plans FOR ALL
  USING  (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());
