-- Migration 20260618000003
-- Trigger: notificar treinador quando aluno envia uma atualização

CREATE OR REPLACE FUNCTION public.notificar_treinador_atualizacao_enviada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aluno_nome    text;
  v_treinador_id  uuid;
  v_org_id        uuid;
  v_aluno_id      uuid;
BEGIN
  -- Busca dados do aluno pelo student_id (auth.users UUID) e org_id da resposta
  SELECT
    p.nome,
    a.treinador_id,
    a.org_id,
    a.id
  INTO
    v_aluno_nome,
    v_treinador_id,
    v_org_id,
    v_aluno_id
  FROM public.alunos a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.user_id = NEW.student_id
    AND a.org_id  = NEW.org_id
  LIMIT 1;

  -- Só notifica se encontrou o aluno e ele tem treinador
  IF v_treinador_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notificacoes (
    user_id,
    org_id,
    aluno_id,
    aluno_nome,
    titulo,
    mensagem,
    tipo
  ) VALUES (
    v_treinador_id,
    v_org_id,
    v_aluno_id,
    v_aluno_nome,
    'Nova atualização recebida',
    v_aluno_nome || ' enviou uma atualização.',
    'atualizacao'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_atualizacao_enviada ON public.atualizacao_respostas;

CREATE TRIGGER trg_notif_atualizacao_enviada
  AFTER INSERT ON public.atualizacao_respostas
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_treinador_atualizacao_enviada();
