-- ═══════════════════════════════════════════════════════════════════════════
-- configurar_series_exercicios(jsonb) — aplica séries/reps/descanso em vários
-- exercícios de uma vez, em UMA chamada
--
-- Mesma causa raiz e mesma solução do `reordenar_exercicios` (migration
-- 20260730000001, ver comentário lá pro detalhe completo da medição): qualquer
-- UPDATE em `public.exercicios` custa ~160ms nesta base, mesmo por chave
-- primária. O modal "Configurar exercícios adicionados" disparava um UPDATE
-- por exercício selecionado via `Promise.all` (`handleSaveConfigureRows`,
-- TrainingPlanManager.tsx) — com 6+ exercícios marcados, a disputa de lock
-- entre os updates concorrentes estourava o statement_timeout de 8s do role
-- `authenticated` ("canceling statement due to statement timeout", achado
-- 2026-08-24). Um único UPDATE em massa é atômico e evita a disputa.
--
-- SEGURANÇA: SECURITY DEFINER, RLS de `exercicios` não se aplica dentro dela.
-- Permissão verificada explicitamente via `is_org_staff(e.org_id)` — como essa
-- função só atualiza campos do próprio exercício (não move pra outro treino),
-- não precisa da checagem dupla que `reordenar_exercicios` tem pro treino de
-- destino. Linhas que não passem no teste são ignoradas pelo WHERE.
-- ═══════════════════════════════════════════════════════════════════════════

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
     SET series     = r.elem->>'series',
         repeticoes = r.elem->>'repeticoes',
         descanso   = r.elem->>'descanso'
    FROM jsonb_array_elements(p_rows) AS r(elem)
   WHERE e.id = (r.elem->>'id')::uuid
     AND public.is_org_staff(e.org_id);

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_series_exercicios(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.configurar_series_exercicios(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.configurar_series_exercicios(jsonb) TO authenticated;

COMMENT ON FUNCTION public.configurar_series_exercicios(jsonb) IS
  'Aplica séries/reps/descanso em vários exercícios num único UPDATE atômico (evita statement timeout do padrão N updates via Promise.all). Payload: [{"id":uuid,"series":text,"repeticoes":text,"descanso":text|null}]. Retorna o nº de linhas afetadas. Valida is_org_staff no exercício.';
