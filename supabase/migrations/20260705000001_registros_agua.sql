-- Registro diário de consumo de água do aluno (mini card do dashboard + tela de Dieta)
CREATE TABLE IF NOT EXISTS public.registros_agua (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           UUID        REFERENCES public.organizations(id),
  data_registro    DATE        NOT NULL,
  ml_total         INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, data_registro)
);

CREATE INDEX IF NOT EXISTS agua_student_idx ON public.registros_agua(student_id);
CREATE INDEX IF NOT EXISTS agua_data_idx    ON public.registros_agua(data_registro DESC);

ALTER TABLE public.registros_agua ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_student_all" ON public.registros_agua
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "agua_trainer_select" ON public.registros_agua
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );
