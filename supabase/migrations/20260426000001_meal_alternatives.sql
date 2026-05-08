-- =============================================================
-- Migration: Refeições Alternativas
--
-- Permite que o treinador cadastre versões alternativas de cada
-- refeição da dieta do aluno. O aluno escolhe qual versão usar
-- no dia, e o registro é salvo em meal_alternative_selections.
-- =============================================================

-- ─── Tabelas ──────────────────────────────────────────────────

CREATE TABLE public.meal_alternatives (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id     uuid NOT NULL REFERENCES public.diet_meals(id) ON DELETE CASCADE,
  nome        text NOT NULL DEFAULT 'Alternativa',
  ordem       integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.meal_alternative_foods (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alternative_id  uuid NOT NULL REFERENCES public.meal_alternatives(id) ON DELETE CASCADE,
  alimento_id     uuid REFERENCES public.alimentos(id) ON DELETE SET NULL,
  nome_display    text NOT NULL DEFAULT '',
  quantidade      numeric NOT NULL DEFAULT 100,
  unidade         text NOT NULL DEFAULT 'g',
  ordem           integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Salva qual opção o aluno escolheu por dia
-- alternative_id NULL = aluno usa refeição principal
CREATE TABLE public.meal_alternative_selections (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_id         uuid NOT NULL REFERENCES public.diet_meals(id) ON DELETE CASCADE,
  alternative_id  uuid REFERENCES public.meal_alternatives(id) ON DELETE SET NULL,
  date            date NOT NULL DEFAULT current_date,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(student_id, meal_id, date)
);

-- ─── Índices ──────────────────────────────────────────────────

CREATE INDEX ON public.meal_alternatives(meal_id);
CREATE INDEX ON public.meal_alternative_foods(alternative_id);
CREATE INDEX ON public.meal_alternative_selections(student_id, date);

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.meal_alternatives         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_alternative_foods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_alternative_selections ENABLE ROW LEVEL SECURITY;

-- Helper: retorna student_id de um meal (via diet)
CREATE OR REPLACE FUNCTION public.meal_student_id(p_meal_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT d.student_id
  FROM   public.diet_meals dm
  JOIN   public.diets d ON d.id = dm.diet_id
  WHERE  dm.id = p_meal_id
  LIMIT  1;
$$;

-- Helper: retorna meal_id de uma alternativa
CREATE OR REPLACE FUNCTION public.alternative_meal_id(p_alt_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT meal_id FROM public.meal_alternatives WHERE id = p_alt_id;
$$;

-- ── meal_alternatives ──────────────────────────────────────────

-- Trainer: acesso total (via is_diet_trainer sobre o meal)
CREATE POLICY "meal_alt_trainer_select" ON public.meal_alternatives
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "meal_alt_trainer_insert" ON public.meal_alternatives
  FOR INSERT TO authenticated
  WITH CHECK (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "meal_alt_trainer_update" ON public.meal_alternatives
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(public.meal_diet_id(meal_id)))
  WITH CHECK (public.is_diet_trainer(public.meal_diet_id(meal_id)));

CREATE POLICY "meal_alt_trainer_delete" ON public.meal_alternatives
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(public.meal_diet_id(meal_id)));

-- Aluno: apenas leitura das suas próprias refeições
CREATE POLICY "meal_alt_student_select" ON public.meal_alternatives
  FOR SELECT TO authenticated
  USING (public.meal_student_id(meal_id) = auth.uid());

-- ── meal_alternative_foods ─────────────────────────────────────

CREATE POLICY "meal_alt_foods_trainer_select" ON public.meal_alternative_foods
  FOR SELECT TO authenticated
  USING (public.is_diet_trainer(
    public.meal_diet_id(public.alternative_meal_id(alternative_id))
  ));

CREATE POLICY "meal_alt_foods_trainer_insert" ON public.meal_alternative_foods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_diet_trainer(
    public.meal_diet_id(public.alternative_meal_id(alternative_id))
  ));

CREATE POLICY "meal_alt_foods_trainer_update" ON public.meal_alternative_foods
  FOR UPDATE TO authenticated
  USING  (public.is_diet_trainer(
    public.meal_diet_id(public.alternative_meal_id(alternative_id))
  ))
  WITH CHECK (public.is_diet_trainer(
    public.meal_diet_id(public.alternative_meal_id(alternative_id))
  ));

CREATE POLICY "meal_alt_foods_trainer_delete" ON public.meal_alternative_foods
  FOR DELETE TO authenticated
  USING (public.is_diet_trainer(
    public.meal_diet_id(public.alternative_meal_id(alternative_id))
  ));

-- Aluno: leitura das suas próprias refeições alternativas
CREATE POLICY "meal_alt_foods_student_select" ON public.meal_alternative_foods
  FOR SELECT TO authenticated
  USING (
    public.meal_student_id(
      public.alternative_meal_id(alternative_id)
    ) = auth.uid()
  );

-- ── meal_alternative_selections ────────────────────────────────

-- Aluno: gerencia suas próprias seleções
CREATE POLICY "meal_alt_sel_student_all" ON public.meal_alternative_selections
  FOR ALL TO authenticated
  USING      (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Trainer: leitura das seleções dos seus alunos
CREATE POLICY "meal_alt_sel_trainer_select" ON public.meal_alternative_selections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.alunos a
      WHERE  a.user_id      = student_id
        AND  a.treinador_id = auth.uid()
    )
  );
