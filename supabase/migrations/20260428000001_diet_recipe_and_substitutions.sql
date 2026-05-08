-- =============================================================
-- Migration: Campos de receita em diet_meals + substituições
--            em diet_meal_foods + coluna source em alimentos
--
-- Execute este arquivo no Supabase Dashboard → SQL Editor.
-- É seguro rodar mais de uma vez (IF NOT EXISTS / IF EXISTS).
-- =============================================================

-- ─── 1. Colunas de receita em diet_meals ─────────────────────
--   observacoes_receita : ingredientes extras, dicas gerais
--   modo_preparo        : passo a passo do preparo

ALTER TABLE public.diet_meals
  ADD COLUMN IF NOT EXISTS observacoes_receita TEXT,
  ADD COLUMN IF NOT EXISTS modo_preparo        TEXT;

-- ─── 2. Coluna parent_food_id em diet_meal_foods ─────────────
--   Substitutos de um alimento apontam para o alimento principal
--   da mesma refeição. NULL = alimento principal.

ALTER TABLE public.diet_meal_foods
  ADD COLUMN IF NOT EXISTS parent_food_id UUID
    REFERENCES public.diet_meal_foods(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS diet_meal_foods_parent_food_id_idx
  ON public.diet_meal_foods(parent_food_id);

-- ─── 3. Coluna source em alimentos ───────────────────────────
--   Indica a origem do registro: 'TACO', 'IBGE', etc.
--   Alimentos globais (org_id IS NULL) recebem 'TACO' por padrão.

ALTER TABLE public.alimentos
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT NULL;

-- Marca todos os alimentos globais já existentes como TACO
UPDATE public.alimentos
  SET source = 'TACO'
  WHERE org_id IS NULL AND source IS NULL;

-- ─── 4. Fix RLS das dietas (INSERT bloqueava nova dieta) ──────
--   Recria as policies separando SELECT/UPDATE/DELETE (USING)
--   de INSERT (WITH CHECK) para evitar o erro:
--   "new row violates row-level security policy for table diets"

-- Helpers
CREATE OR REPLACE FUNCTION public.is_diet_trainer(p_diet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diets d
    JOIN   public.alunos a ON a.user_id = d.student_id
    WHERE  d.id           = p_diet_id
      AND  a.treinador_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.meal_diet_id(p_meal_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT diet_id FROM public.diet_meals WHERE id = p_meal_id;
$$;

-- Remove policies antigas (idempotente)
DROP POLICY IF EXISTS "diets_trainer_all"           ON public.diets;
DROP POLICY IF EXISTS "diet_meals_trainer_all"      ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_all" ON public.diet_meal_foods;

DROP POLICY IF EXISTS "diets_trainer_select"  ON public.diets;
DROP POLICY IF EXISTS "diets_trainer_insert"  ON public.diets;
DROP POLICY IF EXISTS "diets_trainer_update"  ON public.diets;
DROP POLICY IF EXISTS "diets_trainer_delete"  ON public.diets;

DROP POLICY IF EXISTS "diet_meals_trainer_select"  ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_trainer_insert"  ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_trainer_update"  ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_trainer_delete"  ON public.diet_meals;

DROP POLICY IF EXISTS "diet_meal_foods_trainer_select"  ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_insert"  ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_update"  ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_delete"  ON public.diet_meal_foods;

-- diets
CREATE POLICY "diets_trainer_select" ON public.diets
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.alunos a
      WHERE a.user_id = diets.student_id AND a.treinador_id = auth.uid())
  );

CREATE POLICY "diets_trainer_insert" ON public.diets
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.alunos a
      WHERE a.user_id = student_id AND a.treinador_id = auth.uid())
  );

CREATE POLICY "diets_trainer_update" ON public.diets
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(id))
  WITH CHECK (public.is_diet_trainer(id));

CREATE POLICY "diets_trainer_delete" ON public.diets
  FOR DELETE TO authenticated USING (public.is_diet_trainer(id));

-- diet_meals
CREATE POLICY "diet_meals_trainer_select" ON public.diet_meals
  FOR SELECT TO authenticated USING (public.is_diet_trainer(diet_id));

CREATE POLICY "diet_meals_trainer_insert" ON public.diet_meals
  FOR INSERT TO authenticated WITH CHECK (public.is_diet_trainer(diet_id));

CREATE POLICY "diet_meals_trainer_update" ON public.diet_meals
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(diet_id))
  WITH CHECK (public.is_diet_trainer(diet_id));

CREATE POLICY "diet_meals_trainer_delete" ON public.diet_meals
  FOR DELETE TO authenticated USING (public.is_diet_trainer(diet_id));

-- diet_meal_foods
CREATE POLICY "diet_meal_foods_trainer_select" ON public.diet_meal_foods
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "diet_meal_foods_trainer_insert" ON public.diet_meal_foods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "diet_meal_foods_trainer_update" ON public.diet_meal_foods
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(public.meal_diet_id(meal_id)))
  WITH CHECK (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "diet_meal_foods_trainer_delete" ON public.diet_meal_foods
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));
