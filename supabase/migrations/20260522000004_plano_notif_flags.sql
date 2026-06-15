-- ─────────────────────────────────────────────────────────────────────────────
-- Notificações de vencimento de plano: marcos D-7, D-5, D-1, D-0, vencido
--
-- Estratégia: flags booleanas em alunos (uma por marco × aluno/trainer)
--   • Mais confiável que dedup por janela de 23 h
--   • Trigger reseta todas as flags quando data_expiracao_plano muda (renovação)
--
-- Remove marcos D-30 e D-15 (substituídos pelos novos).
-- Não altera tabela cobrancas nem a função alertar_cobrancas_vencendo().
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Flags de notificação por marco em alunos ───────────────────────────────
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS plano_aluno_notif_7d        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_aluno_notif_5d        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_aluno_notif_1d        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_aluno_notif_0d        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_aluno_notif_vencido   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_trainer_notif_7d      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_trainer_notif_5d      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_trainer_notif_1d      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_trainer_notif_0d      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_trainer_notif_vencido boolean NOT NULL DEFAULT false;

-- ── 2. Trigger: reseta flags quando o plano é renovado ───────────────────────
--    Dispara em BEFORE UPDATE de data_expiracao_plano → novo ciclo, novas notifs
CREATE OR REPLACE FUNCTION public.reset_plano_notif_flags()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_expiracao_plano IS DISTINCT FROM OLD.data_expiracao_plano THEN
    NEW.plano_aluno_notif_7d        := false;
    NEW.plano_aluno_notif_5d        := false;
    NEW.plano_aluno_notif_1d        := false;
    NEW.plano_aluno_notif_0d        := false;
    NEW.plano_aluno_notif_vencido   := false;
    NEW.plano_trainer_notif_7d      := false;
    NEW.plano_trainer_notif_5d      := false;
    NEW.plano_trainer_notif_1d      := false;
    NEW.plano_trainer_notif_0d      := false;
    NEW.plano_trainer_notif_vencido := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_plano_notif_flags ON public.alunos;
CREATE TRIGGER trg_reset_plano_notif_flags
  BEFORE UPDATE OF data_expiracao_plano ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION public.reset_plano_notif_flags();

-- ── 3. Substitui verificar_vencimento_planos() ────────────────────────────────
CREATE OR REPLACE FUNCTION public.verificar_vencimento_planos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN

  -- ── D-7 ─────────────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT a.id, a.user_id, a.treinador_id, a.org_id, a.data_expiracao_plano,
           COALESCE(a.plano_nome, 'Plano') AS plano_nome,
           p.nome AS aluno_nome,
           a.plano_aluno_notif_7d, a.plano_trainer_notif_7d
    FROM   public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE  a.ativo = true AND a.treinador_id IS NOT NULL
      AND  a.data_expiracao_plano IS NOT NULL
      AND  a.data_expiracao_plano = CURRENT_DATE + 7
      AND  (a.plano_aluno_notif_7d = false OR a.plano_trainer_notif_7d = false)
  LOOP
    IF NOT rec.plano_trainer_notif_7d THEN
      INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (rec.treinador_id, rec.org_id, rec.id, rec.aluno_nome,
        'Plano de ' || COALESCE(rec.aluno_nome, 'aluno') || ' vence em 7 dias',
        'O plano ' || rec.plano_nome || ' de ' || COALESCE(rec.aluno_nome, 'um aluno')
          || ' vence em ' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY') || '.',
        'financeiro');
      UPDATE public.alunos SET plano_trainer_notif_7d = true WHERE id = rec.id;
    END IF;
    IF NOT rec.plano_aluno_notif_7d AND rec.user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
      VALUES (rec.user_id, rec.org_id,
        'Seu plano vence em 7 dias',
        'Seu plano vence em 7 dias. Renove para continuar seu acompanhamento sem interrupção.',
        'financeiro');
      UPDATE public.alunos SET plano_aluno_notif_7d = true WHERE id = rec.id;
    END IF;
  END LOOP;

  -- ── D-5 ─────────────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT a.id, a.user_id, a.treinador_id, a.org_id, a.data_expiracao_plano,
           COALESCE(a.plano_nome, 'Plano') AS plano_nome,
           p.nome AS aluno_nome,
           a.plano_aluno_notif_5d, a.plano_trainer_notif_5d
    FROM   public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE  a.ativo = true AND a.treinador_id IS NOT NULL
      AND  a.data_expiracao_plano IS NOT NULL
      AND  a.data_expiracao_plano = CURRENT_DATE + 5
      AND  (a.plano_aluno_notif_5d = false OR a.plano_trainer_notif_5d = false)
  LOOP
    IF NOT rec.plano_trainer_notif_5d THEN
      INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (rec.treinador_id, rec.org_id, rec.id, rec.aluno_nome,
        'Plano de ' || COALESCE(rec.aluno_nome, 'aluno') || ' vence em 5 dias',
        'O plano ' || rec.plano_nome || ' de ' || COALESCE(rec.aluno_nome, 'um aluno')
          || ' vence em ' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY') || '.',
        'financeiro');
      UPDATE public.alunos SET plano_trainer_notif_5d = true WHERE id = rec.id;
    END IF;
    IF NOT rec.plano_aluno_notif_5d AND rec.user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
      VALUES (rec.user_id, rec.org_id,
        'Seu plano vence em 5 dias',
        'Seu plano vence em 5 dias. Não deixe para a última hora!',
        'financeiro');
      UPDATE public.alunos SET plano_aluno_notif_5d = true WHERE id = rec.id;
    END IF;
  END LOOP;

  -- ── D-1 ─────────────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT a.id, a.user_id, a.treinador_id, a.org_id, a.data_expiracao_plano,
           COALESCE(a.plano_nome, 'Plano') AS plano_nome,
           p.nome AS aluno_nome,
           a.plano_aluno_notif_1d, a.plano_trainer_notif_1d
    FROM   public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE  a.ativo = true AND a.treinador_id IS NOT NULL
      AND  a.data_expiracao_plano IS NOT NULL
      AND  a.data_expiracao_plano = CURRENT_DATE + 1
      AND  (a.plano_aluno_notif_1d = false OR a.plano_trainer_notif_1d = false)
  LOOP
    IF NOT rec.plano_trainer_notif_1d THEN
      INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (rec.treinador_id, rec.org_id, rec.id, rec.aluno_nome,
        'Plano de ' || COALESCE(rec.aluno_nome, 'aluno') || ' vence amanhã',
        'O plano ' || rec.plano_nome || ' de ' || COALESCE(rec.aluno_nome, 'um aluno')
          || ' vence amanhã — ' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY') || '.',
        'financeiro');
      UPDATE public.alunos SET plano_trainer_notif_1d = true WHERE id = rec.id;
    END IF;
    IF NOT rec.plano_aluno_notif_1d AND rec.user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
      VALUES (rec.user_id, rec.org_id,
        'Seu plano vence amanhã!',
        'Seu plano vence amanhã! Renove agora para continuar tendo acesso ao seu acompanhamento.',
        'financeiro');
      UPDATE public.alunos SET plano_aluno_notif_1d = true WHERE id = rec.id;
    END IF;
  END LOOP;

  -- ── D-0 (vence hoje) ────────────────────────────────────────────────────────
  FOR rec IN
    SELECT a.id, a.user_id, a.treinador_id, a.org_id, a.data_expiracao_plano,
           COALESCE(a.plano_nome, 'Plano') AS plano_nome,
           p.nome AS aluno_nome,
           a.plano_aluno_notif_0d, a.plano_trainer_notif_0d
    FROM   public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE  a.ativo = true AND a.treinador_id IS NOT NULL
      AND  a.data_expiracao_plano IS NOT NULL
      AND  a.data_expiracao_plano = CURRENT_DATE
      AND  (a.plano_aluno_notif_0d = false OR a.plano_trainer_notif_0d = false)
  LOOP
    IF NOT rec.plano_trainer_notif_0d THEN
      INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (rec.treinador_id, rec.org_id, rec.id, rec.aluno_nome,
        'Plano de ' || COALESCE(rec.aluno_nome, 'aluno') || ' vence hoje',
        'O plano ' || rec.plano_nome || ' de ' || COALESCE(rec.aluno_nome, 'um aluno')
          || ' vence hoje (' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY') || ').',
        'financeiro');
      UPDATE public.alunos SET plano_trainer_notif_0d = true WHERE id = rec.id;
    END IF;
    IF NOT rec.plano_aluno_notif_0d AND rec.user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
      VALUES (rec.user_id, rec.org_id,
        'Seu plano vence hoje!',
        'Seu plano vence hoje! Entre em contato com seu treinador para renovar.',
        'financeiro');
      UPDATE public.alunos SET plano_aluno_notif_0d = true WHERE id = rec.id;
    END IF;
  END LOOP;

  -- ── Vencido (data_expiracao_plano < hoje) ────────────────────────────────────
  FOR rec IN
    SELECT a.id, a.user_id, a.treinador_id, a.org_id, a.data_expiracao_plano,
           COALESCE(a.plano_nome, 'Plano') AS plano_nome,
           p.nome AS aluno_nome,
           a.plano_aluno_notif_vencido, a.plano_trainer_notif_vencido
    FROM   public.alunos a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE  a.ativo = true AND a.treinador_id IS NOT NULL
      AND  a.data_expiracao_plano IS NOT NULL
      AND  a.data_expiracao_plano < CURRENT_DATE
      AND  (a.plano_aluno_notif_vencido = false OR a.plano_trainer_notif_vencido = false)
  LOOP
    IF NOT rec.plano_trainer_notif_vencido THEN
      INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (rec.treinador_id, rec.org_id, rec.id, rec.aluno_nome,
        'Plano de ' || COALESCE(rec.aluno_nome, 'aluno') || ' venceu em '
          || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY'),
        'O plano ' || rec.plano_nome || ' de ' || COALESCE(rec.aluno_nome, 'um aluno')
          || ' venceu em ' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY') || '. Renove o plano para manter o acompanhamento.',
        'financeiro');
      UPDATE public.alunos SET plano_trainer_notif_vencido = true WHERE id = rec.id;
    END IF;
    IF NOT rec.plano_aluno_notif_vencido AND rec.user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
      VALUES (rec.user_id, rec.org_id,
        'Seu plano venceu',
        'Seu plano venceu em ' || TO_CHAR(rec.data_expiracao_plano, 'DD/MM/YYYY')
          || '. Entre em contato com seu treinador.',
        'financeiro');
      UPDATE public.alunos SET plano_aluno_notif_vencido = true WHERE id = rec.id;
    END IF;
  END LOOP;

END;
$$;
