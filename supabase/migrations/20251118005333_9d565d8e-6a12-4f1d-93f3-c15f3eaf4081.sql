-- Create exercicios_base table for exercise library
CREATE TABLE public.exercicios_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  treinador_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  video_url TEXT,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add exercicio_base_id to exercicios table
ALTER TABLE public.exercicios
ADD COLUMN exercicio_base_id UUID REFERENCES public.exercicios_base(id) ON DELETE SET NULL;

-- Enable RLS on exercicios_base
ALTER TABLE public.exercicios_base ENABLE ROW LEVEL SECURITY;

-- Trainers can manage their own exercise library
CREATE POLICY "Treinadores podem gerenciar sua biblioteca"
ON public.exercicios_base
FOR ALL
USING (treinador_id = auth.uid() AND is_treinador(auth.uid()));

-- Trainers can view their exercise library
CREATE POLICY "Treinadores podem ver sua biblioteca"
ON public.exercicios_base
FOR SELECT
USING (treinador_id = auth.uid());

-- Add cascading deletes for better data integrity
ALTER TABLE public.semanas
DROP CONSTRAINT IF EXISTS semanas_plano_id_fkey,
ADD CONSTRAINT semanas_plano_id_fkey 
  FOREIGN KEY (plano_id) 
  REFERENCES public.planos_treino(id) 
  ON DELETE CASCADE;

ALTER TABLE public.treinos
DROP CONSTRAINT IF EXISTS treinos_semana_id_fkey,
ADD CONSTRAINT treinos_semana_id_fkey 
  FOREIGN KEY (semana_id) 
  REFERENCES public.semanas(id) 
  ON DELETE CASCADE;

ALTER TABLE public.exercicios
DROP CONSTRAINT IF EXISTS exercicios_treino_id_fkey,
ADD CONSTRAINT exercicios_treino_id_fkey 
  FOREIGN KEY (treino_id) 
  REFERENCES public.treinos(id) 
  ON DELETE CASCADE;