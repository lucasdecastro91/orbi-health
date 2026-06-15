-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260609000001 — Cron: notificar treinador sobre datas de atualização dos alunos
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Função que verifica datas de atualização e notifica o treinador ─
CREATE OR REPLACE FUNCTION public.verificar_atualizacoes_treinador()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec  RECORD;
  dias integer;
BEGIN
  FOR rec IN
    SELECT
      a.id          AS aluno_id,
      a.nome        AS aluno_nome,
      a.treinador_id,
      a.org_id,
      a.data_proxima_atualizacao
    FROM public.alunos a
    WHERE a.ativo = true
      AND a.data_proxima_atualizacao IS NOT NULL
      AND a.treinador_id IS NOT NULL
  LOOP
    dias := (rec.data_proxima_atualizacao - CURRENT_DATE)::integer;

    IF dias IN (0, 1) THEN
      -- Evita duplicata: não insere se já existe notificação do mesmo tipo
      -- para o mesmo aluno_id no mesmo dia
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.user_id   = rec.treinador_id
          AND n.aluno_id  = rec.aluno_id
          AND n.tipo      = 'atualizacao'
          AND n.created_at >= CURRENT_DATE::timestamptz
          AND n.created_at <  (CURRENT_DATE + 1)::timestamptz
      ) THEN
        INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
        VALUES (
          rec.treinador_id,
          rec.org_id,
          rec.aluno_id,
          rec.aluno_nome,
          CASE dias
            WHEN 0 THEN 'Atualização hoje'
            WHEN 1 THEN 'Atualização amanhã'
          END,
          CASE dias
            WHEN 0 THEN rec.aluno_nome || ' tem atualização hoje.'
            WHEN 1 THEN rec.aluno_nome || ' tem atualização amanhã.'
          END,
          'atualizacao'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. Agendar via pg_cron às 8h todo dia ─────────────────────────────
-- Requer extensão pg_cron habilitada no projeto Supabase (Dashboard > Extensions).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('verificar-atualizacoes-treinador');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'verificar-atualizacoes-treinador',
      '0 8 * * *',
      'SELECT public.verificar_atualizacoes_treinador()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
