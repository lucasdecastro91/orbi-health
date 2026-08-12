-- RPC de fuzzy match pra exercícios, usado no import de treino via PDF pra
-- sugerir (não vincular automaticamente) um exercício já existente na
-- biblioteca da org, quando o nome extraído do PDF não bate 100% com nada.
--
-- Mesmo padrão de public.match_alimento (pg_trgm, já habilitado), mas com
-- threshold mais alto: nomes de exercício têm um risco de colisão que
-- alimentos não têm — "Supino reto" e "Supino inclinado" compartilham um
-- prefixo grande e são exercícios diferentes (afeta grupo muscular/volume
-- calculado), enquanto duas comidas com nome parecido raramente são uma
-- confusão perigosa. Por isso o resultado aqui é sempre tratado como
-- sugestão pré-preenchida numa tela de revisão, nunca vínculo automático
-- direto — ver TrainingPlanManager.tsx (import de treino).
--
-- org_id é filtrado explicitamente (diferente de match_alimento, que não
-- precisa porque RLS já limita `alimentos`) só pra deixar a intenção clara
-- na assinatura da função, já que SECURITY INVOKER + RLS de exercicios_base
-- já limitaria de qualquer forma.

CREATE OR REPLACE FUNCTION public.match_exercicio(termo text, p_org_id uuid, min_score real DEFAULT 0.45)
RETURNS TABLE(id uuid, nome text, grupo_muscular_principal text, video_url text, score real)
LANGUAGE sql STABLE
AS $function$
  select e.id, e.nome, e.grupo_muscular_principal, e.video_url,
         similarity(termo, e.nome) as score
  from public.exercicios_base e
  where e.org_id = p_org_id
    and coalesce(e.ativo, true) = true
    and similarity(termo, e.nome) >= min_score
  order by score desc
  limit 1;
$function$;
