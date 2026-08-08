-- ═══════════════════════════════════════════════════════════════════════════
-- reordenar_exercicios(jsonb) — reordena/move exercícios em UMA chamada
--
-- Motivo (medido em 2026-07-29/30): qualquer UPDATE em `public.exercicios`
-- custa ~160ms nesta base, mesmo por chave primária. O drag reindexava a coluna
-- com N updates individuais:
--     8 updates em série = 1021ms no banco + 8 round-trips HTTP
--     1 update em massa  =  193ms no banco + 1 round-trip
-- Além da lentidão, N statements independentes gravavam PARCIALMENTE quando um
-- deles estourava o statement_timeout (8s do role `authenticated`), deixando a
-- coluna meio reordenada até o próximo reload. Um único UPDATE é atômico.
--
-- O PostgREST não faz bulk update com valores distintos por linha (o upsert
-- exigiria mandar todas as colunas NOT NULL), daí a função.
--
-- SEGURANÇA: é SECURITY DEFINER, então o RLS de `exercicios` não se aplica
-- dentro dela. A permissão é verificada explicitamente e em DOBRO:
--   1. `is_org_staff(e.org_id)`  → o exercício pertence a uma org do usuário
--   2. `is_org_staff(t.org_id)`  → o treino de DESTINO também pertence a ela
-- Sem o item 2, alguém poderia passar um treino_id de outra org no payload e
-- mover exercícios para fora da própria org. `is_org_staff` usa `auth.uid()`
-- internamente, que numa chamada via PostgREST é o usuário autenticado.
-- Linhas que não passem nos dois testes são simplesmente ignoradas pelo WHERE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reordenar_exercicios(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows precisa ser um array jsonb de {id, treino_id, ordem}';
  END IF;

  UPDATE public.exercicios e
     SET ordem     = (r.elem->>'ordem')::int,
         treino_id = (r.elem->>'treino_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r(elem)
   WHERE e.id = (r.elem->>'id')::uuid
     AND public.is_org_staff(e.org_id)
     AND EXISTS (
           SELECT 1 FROM public.treinos t
            WHERE t.id = (r.elem->>'treino_id')::uuid
              AND public.is_org_staff(t.org_id)
         );

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

-- Só usuário autenticado chama. Como `anon` tem auth.uid() nulo, is_org_staff
-- devolveria false e a função não faria nada — mas revogar é explícito e barato.
REVOKE ALL ON FUNCTION public.reordenar_exercicios(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reordenar_exercicios(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.reordenar_exercicios(jsonb) TO authenticated;

COMMENT ON FUNCTION public.reordenar_exercicios(jsonb) IS
  'Reordena/move exercícios em um único UPDATE atômico. Payload: [{"id":uuid,"treino_id":uuid,"ordem":int}]. Retorna o nº de linhas afetadas. Valida is_org_staff no exercício e no treino de destino.';
