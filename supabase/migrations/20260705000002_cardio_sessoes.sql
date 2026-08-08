-- Registro de sessões de cardio feitas pelo aluno (duração + bpm + kcal estimado)
CREATE TABLE IF NOT EXISTS public.cardio_sessoes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           UUID        REFERENCES public.organizations(id),
  cardio_plano_id  UUID        REFERENCES public.cardio_planos(id) ON DELETE SET NULL,
  tipo             TEXT        NOT NULL,
  data_sessao      DATE        NOT NULL,
  duracao_minutos  INTEGER     NOT NULL,
  bpm_medio        INTEGER,
  kcal_estimado    INTEGER,
  metodo_calculo   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cardio_sessoes_student_idx ON public.cardio_sessoes(student_id);
CREATE INDEX IF NOT EXISTS cardio_sessoes_data_idx    ON public.cardio_sessoes(data_sessao DESC);

ALTER TABLE public.cardio_sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cardio_sessoes_student_all" ON public.cardio_sessoes
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "cardio_sessoes_trainer_select" ON public.cardio_sessoes
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );
