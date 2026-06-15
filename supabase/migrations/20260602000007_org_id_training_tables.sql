-- ─────────────────────────────────────────────────────────────────────────────
-- Solução definitiva para acesso de colaboradores
-- Adiciona org_id em semanas, treinos, exercicios → policies simples sem joins
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Função is_org_staff: owner ou trainer da org (exclui alunos) ───────────
CREATE OR REPLACE FUNCTION public.is_org_staff(_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'trainer')
  )
$$;

-- ── 2. Corrige alunos: is_org_member → is_org_staff ──────────────────────────
DROP POLICY IF EXISTS "alunos_org_member_select" ON public.alunos;
DROP POLICY IF EXISTS "alunos_org_member_update" ON public.alunos;

DO $$ BEGIN
  CREATE POLICY "alunos_org_staff_select" ON public.alunos FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "alunos_org_staff_update" ON public.alunos FOR UPDATE TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Adiciona org_id em semanas ─────────────────────────────────────────────
ALTER TABLE public.semanas
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Popula com dados existentes
UPDATE public.semanas s
SET org_id = a.org_id
FROM public.planos_treino pt
JOIN public.alunos a ON a.id = pt.aluno_id
WHERE pt.id = s.plano_id AND s.org_id IS NULL;

CREATE INDEX IF NOT EXISTS semanas_org_id_idx ON public.semanas (org_id);

-- Trigger: preenche org_id automaticamente em novos registros
CREATE OR REPLACE FUNCTION public.set_semana_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT a.org_id INTO NEW.org_id
    FROM public.planos_treino pt
    JOIN public.alunos a ON a.id = pt.aluno_id
    WHERE pt.id = NEW.plano_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_semana_org_id ON public.semanas;
CREATE TRIGGER trg_semana_org_id
  BEFORE INSERT ON public.semanas
  FOR EACH ROW EXECUTE FUNCTION public.set_semana_org_id();

-- Policy simples para semanas
DO $$ BEGIN
  CREATE POLICY "semanas_org_staff_select" ON public.semanas FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. Adiciona org_id em treinos ─────────────────────────────────────────────
ALTER TABLE public.treinos
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.treinos t
SET org_id = s.org_id
FROM public.semanas s
WHERE s.id = t.semana_id AND t.org_id IS NULL;

CREATE INDEX IF NOT EXISTS treinos_org_id_idx ON public.treinos (org_id);

CREATE OR REPLACE FUNCTION public.set_treino_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.semanas WHERE id = NEW.semana_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_treino_org_id ON public.treinos;
CREATE TRIGGER trg_treino_org_id
  BEFORE INSERT ON public.treinos
  FOR EACH ROW EXECUTE FUNCTION public.set_treino_org_id();

DO $$ BEGIN
  CREATE POLICY "treinos_org_staff_select" ON public.treinos FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 5. Adiciona org_id em exercicios ──────────────────────────────────────────
ALTER TABLE public.exercicios
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.exercicios e
SET org_id = t.org_id
FROM public.treinos t
WHERE t.id = e.treino_id AND e.org_id IS NULL;

CREATE INDEX IF NOT EXISTS exercicios_org_id_idx ON public.exercicios (org_id);

CREATE OR REPLACE FUNCTION public.set_exercicio_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.treinos WHERE id = NEW.treino_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exercicio_org_id ON public.exercicios;
CREATE TRIGGER trg_exercicio_org_id
  BEFORE INSERT ON public.exercicios
  FOR EACH ROW EXECUTE FUNCTION public.set_exercicio_org_id();

DO $$ BEGIN
  CREATE POLICY "exercicios_org_staff_select" ON public.exercicios FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- exercicios_base: biblioteca da org
DO $$ BEGIN
  CREATE POLICY "exercicios_base_org_staff_select" ON public.exercicios_base FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 6. Dieta: atualiza is_diet_trainer para usar is_org_staff ─────────────────
CREATE OR REPLACE FUNCTION public.is_diet_trainer(p_diet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diets d
    JOIN public.alunos a ON a.user_id = d.student_id
    WHERE d.id = p_diet_id
      AND (a.treinador_id = auth.uid() OR public.is_org_staff(a.org_id))
  )
$$;

-- diet_meals e diet_meal_foods já usam is_diet_trainer via policies existentes

-- ── 7. Demais tabelas: policies simples com 1 join via alunos ─────────────────

-- check_ins
DO $$ BEGIN
  CREATE POLICY "checkins_org_staff_select" ON public.check_ins FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = check_ins.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- registros_evolucao
DO $$ BEGIN
  CREATE POLICY "evolucao_org_staff_all" ON public.registros_evolucao FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = registros_evolucao.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- anamneses
DO $$ BEGIN
  CREATE POLICY "anamneses_org_staff_all" ON public.anamneses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- feedbacks_alunos
DO $$ BEGIN
  CREATE POLICY "feedbacks_org_staff_all" ON public.feedbacks_alunos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = feedbacks_alunos.aluno_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- avaliacoes_posturais
DO $$ BEGIN
  CREATE POLICY "avaliacoes_org_staff_all" ON public.avaliacoes_posturais FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = avaliacoes_posturais.aluno_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- planos_treino
DROP POLICY IF EXISTS "planos_treino_org_member_select" ON public.planos_treino;
DO $$ BEGIN
  CREATE POLICY "planos_treino_org_staff_select" ON public.planos_treino FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = planos_treino.aluno_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- dietas_pdf
DO $$ BEGIN
  CREATE POLICY "dietas_pdf_org_staff_all" ON public.dietas_pdf FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = dietas_pdf.aluno_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- atualizacao_respostas
DROP POLICY IF EXISTS "trainer read org respostas" ON public.atualizacao_respostas;
DO $$ BEGIN
  CREATE POLICY "trainer read org respostas" ON public.atualizacao_respostas FOR SELECT
  USING (public.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
