-- ============================================================
-- Migration 17: Adiciona org_id nas tabelas-raiz + triggers
-- de auto-preenchimento (backward-compatible)
-- ============================================================

-- 1. Adiciona org_id em alunos
ALTER TABLE public.alunos
ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_alunos_org_id         ON public.alunos(org_id);
CREATE INDEX idx_alunos_org_id_ativo   ON public.alunos(org_id, ativo);

-- 2. Adiciona org_id em exercicios_base
ALTER TABLE public.exercicios_base
ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_exercicios_base_org_id ON public.exercicios_base(org_id);

-- 3. Adiciona org_id em modelos_treino
ALTER TABLE public.modelos_treino
ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_modelos_treino_org_id ON public.modelos_treino(org_id);

-- ----------------------------------------------------------------
-- 4. Backfill: popula org_id para dados já existentes
--    (resolve dev data; em produção não haverá registros órfãos
--     pois o trigger da migration 18 passa a preencher na inserção)
-- ----------------------------------------------------------------

UPDATE public.alunos a
SET    org_id = o.id
FROM   public.organizations o
WHERE  o.owner_id = a.treinador_id
  AND  a.org_id IS NULL;

UPDATE public.exercicios_base eb
SET    org_id = o.id
FROM   public.organizations o
WHERE  o.owner_id = eb.treinador_id
  AND  eb.org_id IS NULL;

UPDATE public.modelos_treino mt
SET    org_id = o.id
FROM   public.organizations o
WHERE  o.owner_id = mt.treinador_id
  AND  mt.org_id IS NULL;

-- ----------------------------------------------------------------
-- 5. Trigger: auto-preenche org_id em alunos na inserção
--    Permite que o Edge Function create-student continue funcionando
--    sem alterar seu código (org_id é inferido do treinador)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_set_aluno_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.treinador_id IS NOT NULL THEN
    SELECT id INTO NEW.org_id
    FROM   public.organizations
    WHERE  owner_id = NEW.treinador_id
      AND  active   = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_aluno_auto_org
BEFORE INSERT ON public.alunos
FOR EACH ROW EXECUTE FUNCTION public.auto_set_aluno_org();

-- ----------------------------------------------------------------
-- 6. Trigger: auto-preenche org_id em exercicios_base na inserção
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_set_exercicio_base_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.treinador_id IS NOT NULL THEN
    SELECT id INTO NEW.org_id
    FROM   public.organizations
    WHERE  owner_id = NEW.treinador_id
      AND  active   = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_exercicio_base_auto_org
BEFORE INSERT ON public.exercicios_base
FOR EACH ROW EXECUTE FUNCTION public.auto_set_exercicio_base_org();

-- ----------------------------------------------------------------
-- 7. Trigger: auto-preenche org_id em modelos_treino na inserção
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_set_modelo_treino_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.treinador_id IS NOT NULL THEN
    SELECT id INTO NEW.org_id
    FROM   public.organizations
    WHERE  owner_id = NEW.treinador_id
      AND  active   = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modelo_treino_auto_org
BEFORE INSERT ON public.modelos_treino
FOR EACH ROW EXECUTE FUNCTION public.auto_set_modelo_treino_org();

-- ----------------------------------------------------------------
-- 8. Trigger: sincroniza aluno → organization_members
--    Quando um aluno recebe org_id, é automaticamente registrado
--    como 'student' em organization_members
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_aluno_to_org_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (NEW.org_id, NEW.user_id, 'student')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_aluno_org_members
AFTER INSERT OR UPDATE OF org_id ON public.alunos
FOR EACH ROW EXECUTE FUNCTION public.sync_aluno_to_org_members();
