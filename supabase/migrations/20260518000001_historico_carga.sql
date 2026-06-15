-- Load history table: one row per save, allowing progression tracking over time
-- Unlike exercicios_carga (current load), this table keeps all historical records
CREATE TABLE public.historico_carga (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exercicio_id  UUID        NOT NULL REFERENCES public.exercicios(id) ON DELETE CASCADE,
  aluno_id      UUID        NOT NULL REFERENCES public.alunos(id)    ON DELETE CASCADE,
  carga         TEXT        NOT NULL,
  data_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_carga_aluno_exercicio
  ON public.historico_carga (aluno_id, exercicio_id, data_registro);

ALTER TABLE public.historico_carga ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alunos podem gerenciar seu historico de carga"
ON public.historico_carga FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.alunos a
    WHERE a.id = historico_carga.aluno_id
      AND a.user_id = auth.uid()
  )
);

CREATE POLICY "Treinadores podem ver historico de carga de seus alunos"
ON public.historico_carga FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.alunos a
    WHERE a.id = historico_carga.aluno_id
      AND a.treinador_id = auth.uid()
  )
);
