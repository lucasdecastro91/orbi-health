-- =============================================================
-- Migration: Fix diet RLS INSERT bug + add TACO source column
--
-- PARTE 1: Corrige o erro "new row violates row-level security
--   policy for table diets" ao salvar dieta.
--
--   Causa: a policy "FOR ALL USING (is_diet_trainer(id))" falha
--   em INSERT porque a linha ainda não existe — a função não
--   encontra a dieta e retorna FALSE, bloqueando o INSERT.
--
--   Fix: define os helpers (CREATE OR REPLACE), depois separa
--   em policies por operação:
--     SELECT/UPDATE/DELETE → USING (row já existe)
--     INSERT               → WITH CHECK (consulta tabela pai)
--
-- PARTE 2: Adiciona coluna `source` em alimentos e marca todos
--   os alimentos globais (org_id IS NULL) como 'TACO'.
-- =============================================================

-- ─── HELPERS (criados/atualizados antes das policies) ─────────

-- Retorna TRUE se auth.uid() é o treinador do aluno da dieta
CREATE OR REPLACE FUNCTION public.is_diet_trainer(p_diet_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.diets  d
    JOIN   public.alunos a ON a.user_id = d.student_id
    WHERE  d.id            = p_diet_id
      AND  a.treinador_id  = auth.uid()
  );
$$;

-- Retorna o diet_id de uma refeição
CREATE OR REPLACE FUNCTION public.meal_diet_id(p_meal_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT diet_id FROM public.diet_meals WHERE id = p_meal_id;
$$;

-- ─── PARTE 1: Fix RLS de dietas ───────────────────────────────

-- Remove as policies antigas (ambos os nomes possíveis)
DROP POLICY IF EXISTS "diets_trainer_all"           ON public.diets;
DROP POLICY IF EXISTS "diet_meals_trainer_all"      ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_all" ON public.diet_meal_foods;

-- Remove policies novas (idempotência — seguro rodar duas vezes)
DROP POLICY IF EXISTS "diets_trainer_select"           ON public.diets;
DROP POLICY IF EXISTS "diets_trainer_insert"           ON public.diets;
DROP POLICY IF EXISTS "diets_trainer_update"           ON public.diets;
DROP POLICY IF EXISTS "diets_trainer_delete"           ON public.diets;

DROP POLICY IF EXISTS "diet_meals_trainer_select"      ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_trainer_insert"      ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_trainer_update"      ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_trainer_delete"      ON public.diet_meals;

DROP POLICY IF EXISTS "diet_meal_foods_trainer_select" ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_insert" ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_update" ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_trainer_delete" ON public.diet_meal_foods;

-- ── diets ──────────────────────────────────────────────────────

CREATE POLICY "diets_trainer_select" ON public.diets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id     = diets.student_id
        AND a.treinador_id = auth.uid()
    )
  );

-- INSERT: row não existe ainda → consulta alunos (tabela pai já existe)
CREATE POLICY "diets_trainer_insert" ON public.diets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id     = student_id   -- valor da nova linha
        AND a.treinador_id = auth.uid()
    )
  );

CREATE POLICY "diets_trainer_update" ON public.diets
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(id))
  WITH CHECK (public.is_diet_trainer(id));

CREATE POLICY "diets_trainer_delete" ON public.diets
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(id));

-- ── diet_meals ─────────────────────────────────────────────────

CREATE POLICY "diet_meals_trainer_select" ON public.diet_meals
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(diet_id));

-- INSERT: a dieta já existe ao inserir refeição → is_diet_trainer funciona
CREATE POLICY "diet_meals_trainer_insert" ON public.diet_meals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_diet_trainer(diet_id));

CREATE POLICY "diet_meals_trainer_update" ON public.diet_meals
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(diet_id))
  WITH CHECK (public.is_diet_trainer(diet_id));

CREATE POLICY "diet_meals_trainer_delete" ON public.diet_meals
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(diet_id));

-- ── diet_meal_foods ────────────────────────────────────────────

CREATE POLICY "diet_meal_foods_trainer_select" ON public.diet_meal_foods
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));

-- INSERT: meal já existe → meal_diet_id + is_diet_trainer funcionam
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

-- ─── PARTE 2: Coluna source em alimentos (TACO) ───────────────

ALTER TABLE public.alimentos
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT NULL;

-- Todos os alimentos globais (sem org) são da tabela TACO
UPDATE public.alimentos
  SET source = 'TACO'
  WHERE org_id IS NULL AND source IS NULL;
