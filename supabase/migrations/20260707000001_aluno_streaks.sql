-- Sequência (streak) de dias consecutivos em que o aluno cumpriu treino + dieta + água.
-- Um dia só conta como válido quando: o treino previsto pra aquele dia foi feito (dias sem
-- treino previsto não quebram a sequência), a dieta do dia foi 100% concluída, e a meta de
-- água foi batida. Recalculado nas próprias ações (sem cron/backend agendado).
CREATE TABLE IF NOT EXISTS public.aluno_streaks (
  student_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id             UUID        REFERENCES public.organizations(id),
  sequencia_atual    INTEGER     NOT NULL DEFAULT 0,
  melhor_sequencia   INTEGER     NOT NULL DEFAULT 0,
  ultima_data_valida DATE,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aluno_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aluno_streaks_student_all" ON public.aluno_streaks
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "aluno_streaks_trainer_select" ON public.aluno_streaks
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );
