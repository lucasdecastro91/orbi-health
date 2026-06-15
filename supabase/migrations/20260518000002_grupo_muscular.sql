-- Add structured muscle group columns to exercicios_base
-- These replace the free-form musculos_principais for volume tracking
ALTER TABLE public.exercicios_base
  ADD COLUMN IF NOT EXISTS grupo_muscular_principal  TEXT,
  ADD COLUMN IF NOT EXISTS grupo_muscular_secundario TEXT;

-- Valid values: Peito | Costas | Ombros | Bíceps | Tríceps |
--               Abdômen | Glúteos | Quadríceps | Posteriores | Panturrilha
-- (enforced on the frontend, not as a DB enum to stay flexible)
