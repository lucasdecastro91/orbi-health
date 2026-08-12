-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260810000001 — Corrige falso-positivo de "aluno inativo":
--   o check usava só historico_carga (edição manual de carga/peso) como
--   proxy de "última atividade de treino". Essa tabela só recebe uma
--   linha quando o aluno MUDA o peso registrado — não quando ele treina
--   normalmente marcando séries. Resultado comprovado: aluna Isabel Costa
--   recebeu notificação de "inativo há 7+ dias" no MESMO DIA em que
--   treinou (18/07), porque a última edição de carga dela era de 12 dias
--   antes, mesmo com séries marcadas a cada poucos dias.
--
--   Correção: "última atividade" passa a ser o maior valor entre todos os
--   sinais reais de treino que o app já registra — serie_completions
--   (marcar série, o mais direto e frequente), treino_sessoes_log
--   (sessão concluída), cardio_sessoes (cardio) e historico_carga
--   (mantido). Aluno só é inativo se NENHUM desses tiver registro em 7 dias.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verificar_inatividade_alunos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  ultima_atividade TIMESTAMPTZ;
BEGIN
  FOR rec IN
    SELECT
      a.id          AS aluno_id,
      a.user_id,
      a.treinador_id,
      a.org_id,
      p.nome        AS aluno_nome
    FROM public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.ativo = true
      AND a.treinador_id IS NOT NULL
      AND a.created_at < NOW() - INTERVAL '7 days'
  LOOP
    SELECT GREATEST(
      (SELECT MAX(h.data_registro) FROM public.historico_carga h WHERE h.aluno_id = rec.aluno_id),
      (SELECT MAX(s.date)::timestamptz FROM public.serie_completions s WHERE s.student_id = rec.user_id),
      (SELECT MAX(t.data_conclusao) FROM public.treino_sessoes_log t WHERE t.aluno_id = rec.aluno_id),
      (SELECT MAX(c.data_sessao)::timestamptz FROM public.cardio_sessoes c WHERE c.student_id = rec.user_id)
    ) INTO ultima_atividade;

    IF ultima_atividade IS NULL OR ultima_atividade < NOW() - INTERVAL '7 days' THEN
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
    END IF;
  END LOOP;
END;
$$;
