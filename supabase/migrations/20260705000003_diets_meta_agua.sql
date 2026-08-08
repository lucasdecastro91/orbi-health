-- Meta diária de água (ml) prescrita pelo treinador junto com a dieta
ALTER TABLE public.diets
  ADD COLUMN IF NOT EXISTS meta_agua_ml INTEGER;
