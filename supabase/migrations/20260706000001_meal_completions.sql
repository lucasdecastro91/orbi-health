-- Marca quais refeições o aluno já concluiu em um dado dia — usada pelo check-off em
-- Dieta.tsx, pelo banner "dieta do dia concluída" + XP, e pelo histórico de dieta.
-- Tabela nunca foi criada; Dieta.tsx já trata a ausência dela silenciosamente
-- (setMealCompletionsEnabled(false)), por isso o check-off não persistia até agora.
CREATE TABLE IF NOT EXISTS public.meal_completions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_id     UUID        NOT NULL REFERENCES public.diet_meals(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, meal_id, date)
);

CREATE INDEX IF NOT EXISTS meal_completions_student_idx ON public.meal_completions(student_id);
CREATE INDEX IF NOT EXISTS meal_completions_date_idx    ON public.meal_completions(date DESC);

ALTER TABLE public.meal_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_completions_student_all" ON public.meal_completions
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "meal_completions_trainer_select" ON public.meal_completions
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );
