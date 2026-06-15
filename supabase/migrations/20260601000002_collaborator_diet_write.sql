-- Permite colaboradores ativos escreverem dados de dieta dos alunos da org

DO $$ BEGIN
  CREATE POLICY "diets_collaborator_insert" ON public.diets FOR INSERT TO authenticated
  WITH CHECK (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diets_collaborator_update" ON public.diets FOR UPDATE TO authenticated
  USING (public.is_collab_of_student_uid(student_id))
  WITH CHECK (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diets_collaborator_delete" ON public.diets FOR DELETE TO authenticated
  USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meals_collaborator_insert" ON public.diet_meals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.diets d WHERE d.id = diet_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meals_collaborator_update" ON public.diet_meals FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diets d WHERE d.id = diet_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meals_collaborator_delete" ON public.diet_meals FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diets d WHERE d.id = diet_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meal_foods_collaborator_insert" ON public.diet_meal_foods FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.diet_meals dm JOIN public.diets d ON d.id = dm.diet_id
    WHERE dm.id = meal_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meal_foods_collaborator_update" ON public.diet_meal_foods FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diet_meals dm JOIN public.diets d ON d.id = dm.diet_id
    WHERE dm.id = meal_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meal_foods_collaborator_delete" ON public.diet_meal_foods FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diet_meals dm JOIN public.diets d ON d.id = dm.diet_id
    WHERE dm.id = meal_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "meal_alternatives_collaborator_write" ON public.meal_alternatives FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diet_meals dm JOIN public.diets d ON d.id = dm.diet_id
    WHERE dm.id = meal_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "meal_alternative_foods_collaborator_write" ON public.meal_alternative_foods FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meal_alternatives ma
    JOIN public.diet_meals dm ON dm.id = ma.meal_id
    JOIN public.diets d ON d.id = dm.diet_id
    WHERE ma.id = alternative_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dietas_pdf_collaborator_write" ON public.dietas_pdf FOR ALL TO authenticated
  USING (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;
