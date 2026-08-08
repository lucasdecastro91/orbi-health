-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers de auto-preenchimento de org_id: parar de adivinhar.
--
-- Bug real (2x em produção): as funções auto_set_*_org faziam
--   SELECT id ... WHERE owner_id = treinador AND active LIMIT 1
-- sem ORDER BY. Com um treinador dono de 2+ orgs ativas, o Postgres escolhia
-- qualquer uma — alunos (Eduardo Almeida, Nelbinho Jatobá) e um exercício
-- foram vinculados à org errada de forma aleatória e silenciosa.
--
-- Nova semântica (mesma nas 3 funções):
--   • org_id já veio no INSERT  → não mexe (caminho normal após o fix no app).
--   • dono de exatamente 1 org  → preenche (conveniência preservada; é o caso
--     de todo cliente futuro da plataforma).
--   • dono de 2+ orgs ativas    → RAISE EXCEPTION. Falha alta e imediata em
--     vez de corromper dado — o chamador precisa mandar org_id explícito.
--   • dono de 0 orgs ativas     → deixa NULL (comportamento anterior).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_set_aluno_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NEW.org_id IS NULL AND NEW.treinador_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM   public.organizations
    WHERE  owner_id = NEW.treinador_id
      AND  active   = true;

    IF v_count = 1 THEN
      SELECT id INTO NEW.org_id
      FROM   public.organizations
      WHERE  owner_id = NEW.treinador_id
        AND  active   = true;
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'org_id ambiguo em alunos: treinador % possui % organizacoes ativas — envie org_id explicitamente no INSERT', NEW.treinador_id, v_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_set_exercicio_base_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NEW.org_id IS NULL AND NEW.treinador_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM   public.organizations
    WHERE  owner_id = NEW.treinador_id
      AND  active   = true;

    IF v_count = 1 THEN
      SELECT id INTO NEW.org_id
      FROM   public.organizations
      WHERE  owner_id = NEW.treinador_id
        AND  active   = true;
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'org_id ambiguo em exercicios_base: treinador % possui % organizacoes ativas — envie org_id explicitamente no INSERT', NEW.treinador_id, v_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_set_modelo_treino_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NEW.org_id IS NULL AND NEW.treinador_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM   public.organizations
    WHERE  owner_id = NEW.treinador_id
      AND  active   = true;

    IF v_count = 1 THEN
      SELECT id INTO NEW.org_id
      FROM   public.organizations
      WHERE  owner_id = NEW.treinador_id
        AND  active   = true;
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'org_id ambiguo em modelos_treino: treinador % possui % organizacoes ativas — envie org_id explicitamente no INSERT', NEW.treinador_id, v_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
