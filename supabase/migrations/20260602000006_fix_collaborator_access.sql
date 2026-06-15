-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige acesso de colaboradores usando role check (owner|trainer)
-- is_org_member() inclui alunos (role='student') — precisamos is_org_staff()
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Função: verifica se usuário é owner ou trainer da org ─────────────────────
CREATE OR REPLACE FUNCTION public.is_org_staff(_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'trainer')
  )
$$;

-- ── Corrige alunos: troca is_org_member por is_org_staff ─────────────────────
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

-- ── Dieta: acesso explícito para staff da org ─────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "diets_org_staff_select" ON public.diets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = diets.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diets_org_staff_insert" ON public.diets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = diets.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diets_org_staff_update" ON public.diets FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = diets.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diets_org_staff_delete" ON public.diets FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = diets.student_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- diet_meals
DO $$ BEGIN
  CREATE POLICY "diet_meals_org_staff_all" ON public.diet_meals FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.diets d
      JOIN public.alunos a ON a.user_id = d.student_id
      WHERE d.id = diet_meals.diet_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- diet_meal_foods
DO $$ BEGIN
  CREATE POLICY "diet_meal_foods_org_staff_all" ON public.diet_meal_foods FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.diet_meals dm
      JOIN public.diets d ON d.id = dm.diet_id
      JOIN public.alunos a ON a.user_id = d.student_id
      WHERE dm.id = diet_meal_foods.meal_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- meal_alternatives
DO $$ BEGIN
  CREATE POLICY "meal_alternatives_org_staff_all" ON public.meal_alternatives FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.diet_meals dm
      JOIN public.diets d ON d.id = dm.diet_id
      JOIN public.alunos a ON a.user_id = d.student_id
      WHERE dm.id = meal_alternatives.meal_id AND public.is_org_staff(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- meal_alternative_foods
DO $$ BEGIN
  CREATE POLICY "meal_alt_foods_org_staff_all" ON public.meal_alternative_foods FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_alternatives ma
      JOIN public.diet_meals dm ON dm.id = ma.meal_id
      JOIN public.diets d ON d.id = dm.diet_id
      JOIN public.alunos a ON a.user_id = d.student_id
      WHERE ma.id = meal_alternative_foods.alternative_id AND public.is_org_staff(a.org_id)
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

-- ── Treinos: semanas, treinos, exercicios via is_org_staff ────────────────────
-- Função auxiliar: plano pertence à org do staff logado?
CREATE OR REPLACE FUNCTION public.is_plano_in_my_org(p_plano_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planos_treino pt
    JOIN public.alunos a ON a.id = pt.aluno_id
    WHERE pt.id = p_plano_id AND public.is_org_staff(a.org_id)
  )
$$;

DO $$ BEGIN
  CREATE POLICY "semanas_org_staff_select" ON public.semanas FOR SELECT TO authenticated
  USING (public.is_plano_in_my_org(plano_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "treinos_org_staff_select" ON public.treinos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.semanas s
      WHERE s.id = treinos.semana_id AND public.is_plano_in_my_org(s.plano_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "exercicios_org_staff_select" ON public.exercicios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.treinos t
      JOIN public.semanas s ON s.id = t.semana_id
      WHERE t.id = exercicios.treino_id AND public.is_plano_in_my_org(s.plano_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- exercicios_base: biblioteca de exercícios — leitura para staff da org
DO $$ BEGIN
  CREATE POLICY "exercicios_base_org_staff_select" ON public.exercicios_base FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── check_ins ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "checkins_org_member_select" ON public.check_ins;
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

-- ── registros_evolucao ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "evolucao_org_member_all" ON public.registros_evolucao;
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

-- ── anamneses ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anamneses_org_member_all" ON public.anamneses;
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

-- ── feedbacks_alunos ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "feedbacks_org_member_all" ON public.feedbacks_alunos;
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

-- ── avaliacoes_posturais ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "avaliacoes_org_member_all" ON public.avaliacoes_posturais;
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

-- ── planos_treino ─────────────────────────────────────────────────────────────
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

-- ── atualizacao_respostas ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "atualizacao_respostas_collaborator_select" ON public.atualizacao_respostas;
DROP POLICY IF EXISTS "trainer read org respostas" ON public.atualizacao_respostas;
DO $$ BEGIN
  CREATE POLICY "trainer read org respostas" ON public.atualizacao_respostas FOR SELECT
  USING (public.is_org_member(org_id) OR public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
