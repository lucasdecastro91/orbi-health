-- Marca que o aluno decidiu pular um exercício num dado dia (ex: aparelho ocupado) —
-- usada pelo fluxo sequencial de execução de treino em ExerciseDetail.tsx (modo ?seq=1)
-- pra contar esse exercício como "resolvido" e liberar o botão "Concluir treino" mesmo
-- sem nenhuma série registrada nele. Mesmo padrão de serie_completions (20260707000002).
CREATE TABLE IF NOT EXISTS public.exercicio_skips (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercicio_id UUID        NOT NULL REFERENCES public.exercicios(id) ON DELETE CASCADE,
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, exercicio_id, date)
);

CREATE INDEX IF NOT EXISTS exercicio_skips_student_idx ON public.exercicio_skips(student_id);
CREATE INDEX IF NOT EXISTS exercicio_skips_date_idx    ON public.exercicio_skips(date DESC);

ALTER TABLE public.exercicio_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercicio_skips_student_all" ON public.exercicio_skips
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "exercicio_skips_trainer_select" ON public.exercicio_skips
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );
