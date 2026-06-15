-- ─────────────────────────────────────────────────────────────────────────────
-- Fix verificar_vencimento_planos()
--
-- Problema: versão em produção referenciava "aluno_planos" (tabela inexistente).
-- Dados de plano ficam na própria tabela "alunos":
--   data_expiracao_plano, plano_nome, plano_inicio, plano_valor_pago
--
-- Melhorias em relação à versão anterior:
--   • Notifica ALUNO (7 dias antes) além do treinador
--   • Usa tipo = 'financeiro' (coerente com o resto do sistema)
--   • Deduplicação por título exato + janela 23 h (evita duplicatas no mesmo dia)
--   • Inclui plano_nome na mensagem quando disponível
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verificar_vencimento_planos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
BEGIN

  FOR rec IN
    SELECT
      a.id                   AS aluno_id,
      a.user_id              AS aluno_user_id,
      a.treinador_id,
      a.org_id,
      a.data_expiracao_plano,
      COALESCE(a.plano_nome, 'Plano') AS plano_nome,
      p.nome                 AS aluno_nome,
      (a.data_expiracao_plano - CURRENT_DATE)::int AS dias_restantes
    FROM  public.alunos   a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.ativo = true
      AND a.treinador_id         IS NOT NULL
      AND a.data_expiracao_plano IS NOT NULL
      AND a.data_expiracao_plano >= CURRENT_DATE
      AND (a.data_expiracao_plano - CURRENT_DATE) IN (30, 15, 7)
  LOOP

    -- ── Notifica TREINADOR (30 / 15 / 7 dias) ────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM public.notificacoes
      WHERE user_id    = rec.treinador_id
        AND aluno_id   = rec.aluno_id
        AND tipo       = 'financeiro'
        AND titulo     = 'Plano vence em ' || rec.dias_restantes || ' dias'
        AND created_at > NOW() - INTERVAL '23 hours'
    ) THEN
      INSERT INTO public.notificacoes
        (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (
        rec.treinador_id,
        rec.org_id,
        rec.aluno_id,
        rec.aluno_nome,
        'Plano vence em ' || rec.dias_restantes || ' dias',
        'O plano de ' || COALESCE(rec.aluno_nome, 'um aluno')
          || ' (' || rec.plano_nome || ')'
          || ' vence em ' || rec.dias_restantes || ' dias — '
          || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY'),
        'financeiro'
      );
    END IF;

    -- ── Notifica ALUNO (apenas 7 dias antes) ─────────────────────────────────
    IF rec.dias_restantes = 7 AND rec.aluno_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes
        WHERE user_id    = rec.aluno_user_id
          AND tipo       = 'financeiro'
          AND titulo     = 'Seu plano vence em 7 dias'
          AND created_at > NOW() - INTERVAL '23 hours'
      ) THEN
        INSERT INTO public.notificacoes
          (user_id, org_id, titulo, mensagem, tipo)
        VALUES (
          rec.aluno_user_id,
          rec.org_id,
          'Seu plano vence em 7 dias',
          rec.plano_nome
            || ' vence em ' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY')
            || '. Entre em contato com seu treinador para renovar.',
          'financeiro'
        );
      END IF;
    END IF;

  END LOOP;
END;
$$;
