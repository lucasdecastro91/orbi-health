-- =============================================================
-- Fix: Adiciona colunas alimento_id, quantidade e unidade
--      em diet_meal_foods caso não existam ainda.
--
-- Contexto: a migration 20260417000001_alimentos.sql foi marcada
-- como "applied" via migration repair sem ter sido executada de fato.
-- O CREATE TABLE alimentos foi rodado manualmente, mas o ALTER TABLE
-- diet_meal_foods pode não ter sido.
-- =============================================================

-- Remove coluna de substituição legada (se existir)
ALTER TABLE public.diet_meal_foods
  DROP COLUMN IF EXISTS substitution_group_id;

-- Adiciona colunas de referência nutricional
ALTER TABLE public.diet_meal_foods
  ADD COLUMN IF NOT EXISTS alimento_id UUID REFERENCES public.alimentos(id),
  ADD COLUMN IF NOT EXISTS quantidade  NUMERIC,
  ADD COLUMN IF NOT EXISTS unidade     TEXT DEFAULT 'g';

-- Índice para busca por alimento
CREATE INDEX IF NOT EXISTS diet_meal_foods_alimento_id_idx
  ON public.diet_meal_foods(alimento_id);
