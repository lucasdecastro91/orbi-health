-- Editar exercícios já configurados em lote (nova função no painel do
-- treinador) reusa `configurar_series_exercicios`, mas essa função só
-- atualizava os campos legados (series/repeticoes/descanso) — se o exercício
-- já tivesse `series_detalhadas` (blocos por tipo de série), esse campo
-- continuava valendo em todo o resto do app (ExerciseDetail.tsx prioriza
-- series_detalhadas quando presente), tornando a edição em lote um no-op
-- silencioso pra qualquer exercício com configuração detalhada.
--
-- Sempre zera series_detalhadas nessa função — inofensivo pro fluxo que já
-- usava ela (exercícios recém-adicionados nunca têm series_detalhadas ainda),
-- e necessário pro novo fluxo de editar em lote poder de fato sobrescrever.
CREATE OR REPLACE FUNCTION public.configurar_series_exercicios(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows precisa ser um array jsonb de {id, series, repeticoes, descanso}';
  END IF;

  UPDATE public.exercicios e
     SET series             = r.elem->>'series',
         repeticoes         = r.elem->>'repeticoes',
         descanso           = r.elem->>'descanso',
         series_detalhadas  = NULL
    FROM jsonb_array_elements(p_rows) AS r(elem)
   WHERE e.id = (r.elem->>'id')::uuid
     AND public.is_org_staff(e.org_id);

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

COMMENT ON FUNCTION public.configurar_series_exercicios(jsonb) IS
  'Aplica séries/reps/descanso em vários exercícios num único UPDATE atômico (evita statement timeout do padrão N updates via Promise.all). Payload: [{"id":uuid,"series":text,"repeticoes":text,"descanso":text|null}]. Sempre zera series_detalhadas (config detalhada por tipo de série), convertendo o exercício de volta pro formato simples. Retorna o nº de linhas afetadas. Valida is_org_staff no exercício.';
