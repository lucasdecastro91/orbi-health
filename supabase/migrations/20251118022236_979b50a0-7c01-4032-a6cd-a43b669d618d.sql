-- Adicionar campo ativo na tabela alunos
ALTER TABLE public.alunos 
ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;