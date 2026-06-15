-- ─────────────────────────────────────────────────────────────────────────────
-- notificacoes_extend: add aluno context columns + automated reminder jobs
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend notificacoes with aluno identity (nullable — backwards-compatible)
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS aluno_id   uuid REFERENCES public.alunos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aluno_nome text;

-- 2. Add plan expiry date to alunos
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS data_expiracao_plano date;

-- Index for expiry queries
CREATE INDEX IF NOT EXISTS alunos_expiracao_idx
  ON public.alunos (data_expiracao_plano)
  WHERE data_expiracao_plano IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Function: inactivity alert (student with no training records for 7+ days)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verificar_inatividade_alunos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      a.id          AS aluno_id,
      a.treinador_id,
      a.org_id,
      p.nome        AS aluno_nome,
      MAX(h.data_registro) AS ultima_atividade
    FROM public.alunos a
    LEFT JOIN public.historico_carga h ON h.aluno_id = a.id
    LEFT JOIN public.profiles        p ON p.id = a.user_id
    WHERE a.ativo = true
      AND a.treinador_id IS NOT NULL
    GROUP BY a.id, a.treinador_id, a.org_id, p.nome
    HAVING MAX(h.data_registro) < NOW() - INTERVAL '7 days'
        OR MAX(h.data_registro) IS NULL
  LOOP
    -- Avoid duplicate alerts: skip if one was already sent in the last 23 h
    IF NOT EXISTS (
      SELECT 1 FROM public.notificacoes
      WHERE user_id  = rec.treinador_id
        AND aluno_id = rec.aluno_id
        AND tipo     = 'alerta'
        AND titulo ILIKE '%inativo%'
        AND created_at > NOW() - INTERVAL '23 hours'
    ) THEN
      INSERT INTO public.notificacoes
        (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (
        rec.treinador_id,
        rec.org_id,
        rec.aluno_id,
        rec.aluno_nome,
        'Aluno inativo há 7+ dias',
        COALESCE(rec.aluno_nome, 'Um aluno') || ' não registra treinos há mais de 7 dias.',
        'alerta'
      );
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Function: plan expiry alerts (30 / 15 / 7 days before data_expiracao_plano)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verificar_vencimento_planos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rec             RECORD;
  dias_restantes  int;
BEGIN
  FOR rec IN
    SELECT
      a.id                   AS aluno_id,
      a.treinador_id,
      a.org_id,
      a.data_expiracao_plano,
      p.nome                 AS aluno_nome
    FROM public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.ativo = true
      AND a.treinador_id IS NOT NULL
      AND a.data_expiracao_plano IS NOT NULL
      AND a.data_expiracao_plano > CURRENT_DATE
  LOOP
    dias_restantes := (rec.data_expiracao_plano - CURRENT_DATE);

    IF dias_restantes IN (30, 15, 7) THEN
      -- Avoid duplicate: one alert per milestone per student per day
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes
        WHERE user_id  = rec.treinador_id
          AND aluno_id = rec.aluno_id
          AND tipo     = 'alerta'
          AND titulo ILIKE '%vence%'
          AND created_at > NOW() - INTERVAL '23 hours'
      ) THEN
        INSERT INTO public.notificacoes
          (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
        VALUES (
          rec.treinador_id,
          rec.org_id,
          rec.aluno_id,
          rec.aluno_nome,
          'Plano vence em ' || dias_restantes || ' dias',
          'O plano de ' || COALESCE(rec.aluno_nome, 'um aluno') ||
            ' vence em ' || dias_restantes || ' dias (' ||
            TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY') || ').',
          'alerta'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Schedule pg_cron jobs (runs daily at 09:00 UTC-3 = 12:00 UTC)
--    Requires pg_cron extension enabled in Supabase Dashboard → Extensions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Remove old jobs if they exist (idempotent)
  PERFORM cron.unschedule('verificar-inatividade-alunos') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'verificar-inatividade-alunos'
  );
  PERFORM cron.unschedule('verificar-vencimento-planos') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'verificar-vencimento-planos'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'verificar-inatividade-alunos',
  '0 12 * * *',
  'SELECT public.verificar_inatividade_alunos()'
);

SELECT cron.schedule(
  'verificar-vencimento-planos',
  '0 12 * * *',
  'SELECT public.verificar_vencimento_planos()'
);
