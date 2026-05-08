-- Create table for student load/weight tracking
CREATE TABLE public.exercicios_carga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercicio_id UUID NOT NULL REFERENCES public.exercicios(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  carga TEXT NOT NULL,
  data_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(exercicio_id, aluno_id)
);

-- Enable RLS
ALTER TABLE public.exercicios_carga ENABLE ROW LEVEL SECURITY;

-- Policy: Students can view/insert/update their own load records
CREATE POLICY "Alunos podem gerenciar suas cargas"
ON public.exercicios_carga
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.alunos a
    WHERE a.id = exercicios_carga.aluno_id
    AND a.user_id = auth.uid()
  )
);

-- Policy: Trainers can view load records for their students
CREATE POLICY "Treinadores podem ver cargas de seus alunos"
ON public.exercicios_carga
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.alunos a
    WHERE a.id = exercicios_carga.aluno_id
    AND a.treinador_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_exercicios_carga_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_exercicios_carga_updated_at
BEFORE UPDATE ON public.exercicios_carga
FOR EACH ROW
EXECUTE FUNCTION public.update_exercicios_carga_updated_at();