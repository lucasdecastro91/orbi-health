-- Marca quais séries de cada exercício o aluno já concluiu em um dado dia — usada pelo
-- check-off de série em ExerciseDetail.tsx e pelo gate do botão "Marcar treino como
-- concluído" em Treinos.tsx (só libera quando todas as séries de todos os exercícios
-- da sessão estiverem marcadas). Hoje esse estado só existe em memória local do
-- componente (Set), some ao navegar pra outra tela — por isso precisa persistir.
CREATE TABLE IF NOT EXISTS public.serie_completions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercicio_id UUID        NOT NULL REFERENCES public.exercicios(id) ON DELETE CASCADE,
  serie_key    TEXT        NOT NULL,
  date         DATE        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, exercicio_id, serie_key, date)
);

CREATE INDEX IF NOT EXISTS serie_completions_student_idx ON public.serie_completions(student_id);
CREATE INDEX IF NOT EXISTS serie_completions_date_idx    ON public.serie_completions(date DESC);
CREATE INDEX IF NOT EXISTS serie_completions_exercicio_idx ON public.serie_completions(exercicio_id);

ALTER TABLE public.serie_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "serie_completions_student_all" ON public.serie_completions
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "serie_completions_trainer_select" ON public.serie_completions
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );
