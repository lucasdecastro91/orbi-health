-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260809000002 — Bloqueio de acesso do aluno + carência de 7 dias
--
--   • alunos.desativado_por_inadimplencia: diferencia bloqueio automático
--     (por falta de pagamento) de desativação manual pelo treinador, pra
--     a tela de bloqueio do aluno mostrar a mensagem certa.
--   • alunos.grace_last_notif_date: dedup do aviso diário durante os 7
--     dias de carência (dia sequencial, não marco esparso — por isso um
--     único date em vez de flags por dia).
--   • Trigger reseta as duas colunas quando o aluno é reativado (ativo
--     false → true), pra não carregar estado "por inadimplência" obsoleto.
--   • verificar_vencimento_planos() perde o bucket "vencido": esse aviso
--     de dia 0 passa a ser responsabilidade do novo handlePlanGrace()
--     (notify-scheduled), que também dispara push/email — o bucket antigo
--     era bell-only e duplicaria a notificação do aluno.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS desativado_por_inadimplencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_last_notif_date date;

CREATE OR REPLACE FUNCTION public.reset_desativado_por_inadimplencia()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ativo = true AND OLD.ativo = false THEN
    NEW.desativado_por_inadimplencia := false;
    NEW.grace_last_notif_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_desativado_por_inadimplencia ON public.alunos;
CREATE TRIGGER trg_reset_desativado_por_inadimplencia
  BEFORE UPDATE OF ativo ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION public.reset_desativado_por_inadimplencia();

-- ── verificar_vencimento_planos(): remove o bucket "vencido" ──────────────
-- Mantém D-30/D-15/D-7 antes do vencimento intactos (trainer bell-only,
-- aluno bell só em D-7). O bucket "vencido" (data_expiracao_plano < hoje)
-- agora vive em handlePlanGrace() (supabase/functions/notify-scheduled).
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
