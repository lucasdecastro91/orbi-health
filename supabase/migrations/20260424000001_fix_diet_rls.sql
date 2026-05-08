-- =============================================================
-- Fix: RLS policies for diet tables
--
-- Problem: "FOR ALL USING (fn)" fails on INSERT because the row
-- doesn't exist yet when the USING clause is evaluated — so any
-- function that queries the same table returns FALSE and the
-- policy blocks the INSERT.
--
-- Fix: split each "FOR ALL" into per-operation policies:
--   • SELECT / UPDATE / DELETE  → use USING (row already exists)
--   • INSERT                    → use WITH CHECK only, querying
--                                  parent tables that already exist
-- =============================================================

-- ─── 1. Drop broken FOR-ALL policies ─────────────────────────

DROP POLICY IF EXISTS "diets_trainer_all"          ON public.diets;
DROP POLICY IF EXISTS "diet_meals_trainer_all"     ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_all" ON public.diet_meal_foods;

-- ─── 2. diets ─────────────────────────────────────────────────

-- SELECT: trainer can read diets for their own students
CREATE POLICY "diets_trainer_select" ON public.diets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = diets.student_id
        AND a.treinador_id = auth.uid()
    )
  );

-- INSERT: trainer inserts a diet for their student
--   (row doesn't exist yet → look up alunos instead)
CREATE POLICY "diets_trainer_insert" ON public.diets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = student_id     -- student_id = NEW row value
        AND a.treinador_id = auth.uid()
    )
  );

-- UPDATE: trainer updates an existing diet (row exists)
CREATE POLICY "diets_trainer_update" ON public.diets
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(id))
  WITH CHECK (public.is_diet_trainer(id));

-- DELETE: trainer deletes an existing diet
CREATE POLICY "diets_trainer_delete" ON public.diets
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(id));

-- ─── 3. diet_meals ─────────────────────────────────────────────

-- SELECT
CREATE POLICY "diet_meals_trainer_select" ON public.diet_meals
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(diet_id));

-- INSERT — diet already exists at this point, so is_diet_trainer works
CREATE POLICY "diet_meals_trainer_insert" ON public.diet_meals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_diet_trainer(diet_id));

-- UPDATE
CREATE POLICY "diet_meals_trainer_update" ON public.diet_meals
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(diet_id))
  WITH CHECK (public.is_diet_trainer(diet_id));

-- DELETE
CREATE POLICY "diet_meals_trainer_delete" ON public.diet_meals
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(diet_id));

-- ─── 4. diet_meal_foods ────────────────────────────────────────

-- SELECT
CREATE POLICY "diet_meal_foods_trainer_select" ON public.diet_meal_foods
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));

-- INSERT — meal already exists, so meal_diet_id + is_diet_trainer work
CREATE POLICY "diet_meal_foods_trainer_insert" ON public.diet_meal_foods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_diet_trainer(public.meal_diet_id(meal_id)));

-- UPDATE
CREATE POLICY "diet_meal_foods_trainer_update" ON public.diet_meal_foods
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(public.meal_diet_id(meal_id)))
  WITH CHECK (public.is_diet_trainer(public.meal_diet_id(meal_id)));

-- DELETE
CREATE POLICY "diet_meal_foods_trainer_delete" ON public.diet_meal_foods
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));
