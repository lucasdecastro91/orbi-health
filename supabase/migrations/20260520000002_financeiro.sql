-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro — cobranças de alunos via Asaas
-- (distinto das subscriptions da plataforma ORBI Pro)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. asaas_customers_alunos ─────────────────────────────────────────────────
-- Mapeia cada aluno → customer_id no Asaas (para cobranças recorrentes)
CREATE TABLE IF NOT EXISTS public.asaas_customers_alunos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aluno_id   uuid        NOT NULL REFERENCES public.alunos(id)        ON DELETE CASCADE,
  asaas_id   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id)
);

ALTER TABLE public.asaas_customers_alunos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages asaas customers alunos"
  ON public.asaas_customers_alunos FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.treinador_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.treinador_id = auth.uid()));

-- ── 2. cobrancas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cobrancas (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aluno_id        uuid          NOT NULL REFERENCES public.alunos(id)        ON DELETE CASCADE,
  treinador_id    uuid          NOT NULL REFERENCES auth.users(id),
  descricao       text          NOT NULL,
  asaas_id        text,
  forma_pagamento text          NOT NULL DEFAULT 'PIX',  -- PIX | CREDIT_CARD | BOLETO
  valor           numeric(10,2) NOT NULL,
  status          text          NOT NULL DEFAULT 'PENDING',
  -- PENDING | RECEIVED | CONFIRMED | OVERDUE | CANCELLED | REFUNDED
  data_vencimento date          NOT NULL,
  data_pagamento  date,
  invoice_url     text,
  pix_key         text,          -- PIX copia e cola (payload)
  notificado_30d  boolean       NOT NULL DEFAULT false,
  notificado_15d  boolean       NOT NULL DEFAULT false,
  notificado_7d   boolean       NOT NULL DEFAULT false,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cobrancas_org_idx        ON public.cobrancas (org_id);
CREATE INDEX IF NOT EXISTS cobrancas_aluno_idx      ON public.cobrancas (aluno_id);
CREATE INDEX IF NOT EXISTS cobrancas_treinador_idx  ON public.cobrancas (treinador_id);
CREATE INDEX IF NOT EXISTS cobrancas_status_idx     ON public.cobrancas (status);
CREATE INDEX IF NOT EXISTS cobrancas_vencimento_idx ON public.cobrancas (data_vencimento);

ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;

-- Treinador gerencia suas cobranças
CREATE POLICY "trainer manages own cobrancas"
  ON public.cobrancas FOR ALL
  USING  (treinador_id = auth.uid())
  WITH CHECK (treinador_id = auth.uid());

-- Service role (webhook) pode atualizar
CREATE POLICY "service role full access cobrancas"
  ON public.cobrancas FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. Trigger updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cobrancas_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS cobrancas_updated_at ON public.cobrancas;
CREATE TRIGGER cobrancas_updated_at
  BEFORE UPDATE ON public.cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.cobrancas_set_updated_at();

-- ── 4. Alertas automáticos de vencimento (30 / 15 / 7 dias) ──────────────────
CREATE OR REPLACE FUNCTION public.alertar_cobrancas_vencendo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN
  -- Marca como OVERDUE cobranças que venceram e ainda estão PENDING
  UPDATE public.cobrancas
  SET status = 'OVERDUE'
  WHERE status = 'PENDING'
    AND data_vencimento < CURRENT_DATE;

  -- Notifica 30 dias antes
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento, p.nome AS aluno_nome
    FROM   public.cobrancas c
    JOIN   public.alunos   a ON a.id  = c.aluno_id
    JOIN   public.profiles p ON p.id  = a.user_id
    WHERE  c.status = 'PENDING'
      AND  c.notificado_30d = false
      AND  c.data_vencimento = CURRENT_DATE + 30
  LOOP
    INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
    VALUES (rec.treinador_id, rec.org_id,
      'Cobrança vence em 30 dias',
      rec.aluno_nome || ' — R$ ' || TO_CHAR(rec.valor, 'FM999G990D00') ||
        ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
      'financeiro');
    UPDATE public.cobrancas SET notificado_30d = true WHERE id = rec.id;
  END LOOP;

  -- Notifica 15 dias antes
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento, p.nome AS aluno_nome
    FROM   public.cobrancas c
    JOIN   public.alunos   a ON a.id  = c.aluno_id
    JOIN   public.profiles p ON p.id  = a.user_id
    WHERE  c.status = 'PENDING'
      AND  c.notificado_15d = false
      AND  c.data_vencimento = CURRENT_DATE + 15
  LOOP
    INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
    VALUES (rec.treinador_id, rec.org_id,
      'Cobrança vence em 15 dias',
      rec.aluno_nome || ' — R$ ' || TO_CHAR(rec.valor, 'FM999G990D00') ||
        ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
      'financeiro');
    UPDATE public.cobrancas SET notificado_15d = true WHERE id = rec.id;
  END LOOP;

  -- Notifica 7 dias antes
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento, p.nome AS aluno_nome
    FROM   public.cobrancas c
    JOIN   public.alunos   a ON a.id  = c.aluno_id
    JOIN   public.profiles p ON p.id  = a.user_id
    WHERE  c.status = 'PENDING'
      AND  c.notificado_7d = false
      AND  c.data_vencimento = CURRENT_DATE + 7
  LOOP
    INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
    VALUES (rec.treinador_id, rec.org_id,
      'Cobrança vence em 7 dias',
      rec.aluno_nome || ' — R$ ' || TO_CHAR(rec.valor, 'FM999G990D00') ||
        ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
      'financeiro');
    UPDATE public.cobrancas SET notificado_7d = true WHERE id = rec.id;
  END LOOP;
END;
$$;

-- pg_cron: diário às 08h UTC
DO $$
BEGIN
  PERFORM cron.unschedule('alertar-cobrancas-vencendo')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-cobrancas-vencendo');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'alertar-cobrancas-vencendo',
  '0 8 * * *',
  'SELECT public.alertar_cobrancas_vencendo()'
);
