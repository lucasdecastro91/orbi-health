-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260609000002 — Melhora deduplicação de inatividade:
--   tipo = 'inatividade', janela de 7 dias (era 23h com tipo='alerta')
-- ══════════════════════════════════════════════════════════════════════

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
    -- Deduplicação: não insere se já existe notificação do tipo 'inatividade'
    -- para o mesmo aluno nos últimos 7 dias
    IF NOT EXISTS (
      SELECT 1 FROM public.notificacoes
      WHERE user_id  = rec.treinador_id
        AND aluno_id = rec.aluno_id
        AND tipo     = 'inatividade'
        AND created_at > NOW() - INTERVAL '7 days'
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
        'inatividade'
      );
    END IF;
  END LOOP;
END;
$$;
