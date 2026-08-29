-- ═══════════════════════════════════════════════════════════════════════════
-- match_exercicio: passa a considerar exercícios liberados de outras orgs
--
-- Causa raiz do "volume por grupamento errado na Orbi Demo" (achado
-- 2026-08-27): a função filtrava só `e.org_id = p_org_id`, nunca
-- `liberado_outras_orgs = true`. Toda outra query da biblioteca no projeto
-- já usa `.or(org_id.eq.X, liberado_outras_orgs.eq.true)` (ExerciseLibrary,
-- exercisesBase do TrainingPlanManager, baseData do import) — essa RPC ficou
-- de fora quando esse padrão foi adotado. Resultado: pra uma org como a Orbi
-- Demo, que depende quase inteiramente da biblioteca liberada pela Get Shape,
-- o import de treino via PDF quase nunca casava o exercício extraído com a
-- biblioteca — `exercicios.exercicio_base_id` ficava null pra sempre, e sem
-- esse link o exercício não tem grupo muscular conhecido, então some de todo
-- cálculo de "Volume Prescrito"/"Volume Realizado" (StudentDetails.tsx).
-- Confirmado no banco: 44/46 exercícios da Orbi Demo sem link, 18 recuperáveis
-- só de retroagir esse match.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.match_exercicio(termo text, p_org_id uuid, min_score real DEFAULT 0.45)
 RETURNS TABLE(id uuid, nome text, grupo_muscular_principal text, video_url text, score real)
 LANGUAGE sql
 STABLE
AS $function$
  select e.id, e.nome, e.grupo_muscular_principal, e.video_url,
         similarity(termo, e.nome) as score
  from public.exercicios_base e
  where (e.org_id = p_org_id or e.liberado_outras_orgs = true)
    and coalesce(e.ativo, true) = true
    and similarity(termo, e.nome) >= min_score
  order by score desc
  limit 1;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill retroativo — mesma lógica do backfill original da Get Shape
-- (migration de 2026-08-04), nunca tinha sido rodado pra outras orgs. Casa
-- por nome EXATO (case-insensitive) — mais conservador que o fuzzy match da
-- RPC acima, pra não linkar errado em dado retroativo sem revisão humana.
-- ═══════════════════════════════════════════════════════════════════════════

WITH ex_org AS (
  SELECT ex.id AS exercicio_id, ex.nome_exercicio, a.org_id
  FROM public.exercicios ex
  JOIN public.treinos t ON t.id = ex.treino_id
  JOIN public.semanas sem ON sem.id = t.semana_id
  JOIN public.planos_treino pt ON pt.id = sem.plano_id
  JOIN public.alunos a ON a.id = pt.aluno_id
  WHERE ex.exercicio_base_id IS NULL
),
matched AS (
  SELECT DISTINCT ON (eo.exercicio_id)
    eo.exercicio_id, eb.id AS base_id
  FROM ex_org eo
  JOIN public.exercicios_base eb
    ON lower(trim(eb.nome)) = lower(trim(eo.nome_exercicio))
   AND (eb.org_id = eo.org_id OR eb.liberado_outras_orgs = true)
  ORDER BY eo.exercicio_id, (eb.org_id = eo.org_id) DESC -- prioriza match da própria org sobre o liberado
)
UPDATE public.exercicios ex
   SET exercicio_base_id = m.base_id
  FROM matched m
 WHERE ex.id = m.exercicio_id;
