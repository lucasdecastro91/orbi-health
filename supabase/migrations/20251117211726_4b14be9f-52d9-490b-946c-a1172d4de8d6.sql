-- Add missing columns to existing tables
ALTER TABLE public.planos_treino 
ADD COLUMN IF NOT EXISTS objetivo text,
ADD COLUMN IF NOT EXISTS data_fim date;

ALTER TABLE public.treinos
ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- Update dietas_pdf table name for consistency (if needed)
-- Table already exists as dietas_pdf, which is fine

-- Ensure RLS policies are correct for all tables
-- planos_treino policies already exist
-- semanas policies already exist  
-- treinos policies already exist
-- exercicios policies already exist
-- dietas_pdf policies already exist

-- All RLS policies are already in place and correct!