-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige acesso de colaboradores à dieta e anamnese
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Dieta: policy explícita para staff da org (não depende de is_diet_trainer) ─

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

-- ── Garante que alunos.org_id não é NULL (fix para policies is_org_staff) ──────
-- Se algum aluno não tiver org_id, o is_org_staff retorna FALSE
UPDATE public.alunos a
SET org_id = (
  SELECT om.org_id
  FROM public.organization_members om
  WHERE om.user_id = a.treinador_id
    AND om.role = 'owner'
  LIMIT 1
)
WHERE a.org_id IS NULL
  AND a.treinador_id IS NOT NULL;
