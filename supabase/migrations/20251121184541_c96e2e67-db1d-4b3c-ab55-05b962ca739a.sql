-- Fix search_path for the update function
DROP FUNCTION IF EXISTS public.update_exercicios_carga_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_exercicios_carga_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER update_exercicios_carga_updated_at
BEFORE UPDATE ON public.exercicios_carga
FOR EACH ROW
EXECUTE FUNCTION public.update_exercicios_carga_updated_at();