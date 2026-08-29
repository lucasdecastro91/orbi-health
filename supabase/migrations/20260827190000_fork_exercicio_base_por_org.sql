-- ═══════════════════════════════════════════════════════════════════════════
-- Edição por org de exercícios da biblioteca compartilhada ("liberado_outras_
-- orgs") sem afetar outras orgs nem duplicar visualmente pra quem edita.
--
-- Decidido com o Lucas (2026-08-27): um treinador de outra org (ex: Orbi
-- Demo) hoje não consegue editar grupo muscular/vídeo/etc de um exercício
-- liberado pela Get Shape — RLS bloqueia (dono é sempre a org que criou). A
-- experiência esperada: o treinador edita e o exercício "vira dele", sem
-- gerar uma segunda entrada visível (nem afetar a Get Shape ou outras orgs).
--
-- Mecanismo: por baixo do capô ainda precisa de uma linha nova (é a única
-- forma de isolar a edição por org sem mutar o original compartilhado), mas
-- fica marcada com `forked_from_id` apontando pro original, e toda consulta
-- que lista a biblioteca (frontend) ou casa por nome (RPC match_exercicio)
-- passa a esconder o original quando a própria org já tem uma cópia editada
-- dele — na prática, só uma versão aparece.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.exercicios_base
  ADD COLUMN forked_from_id uuid REFERENCES public.exercicios_base(id) ON DELETE SET NULL;

CREATE INDEX idx_exercicios_base_forked_from ON public.exercicios_base(forked_from_id)
  WHERE forked_from_id IS NOT NULL;

COMMENT ON COLUMN public.exercicios_base.forked_from_id IS
  'Se setado, esta linha é a cópia editável de outra org pro exercício original (compartilhado via liberado_outras_orgs). O original continua intocado; consultas escondem o original da org que já forkou.';

-- ═══════════════════════════════════════════════════════════════════════════
-- fork_exercicio_base(original, org, updates) — cria (ou reaproveita) a cópia
-- editável de um exercício liberado, e relinka os treinos já montados dessa
-- org pra apontarem pra cópia nova.
--
-- SEGURANÇA: SECURITY DEFINER (o `UPDATE ... exercicios_base_update` normal
-- exige treinador_id = auth.uid(), então não serviria pra criar a cópia em
-- nome da org). Validação explícita: `is_org_staff(p_org_id)` — o chamador
-- precisa ser staff da org pra qual está forkando. Confere também que o
-- original é mesmo liberado e não pertence já à própria org (edição normal
-- nesse caso, não precisa de fork).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fork_exercicio_base(
  p_original_id uuid,
  p_org_id uuid,
  p_updates jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original public.exercicios_base%ROWTYPE;
  v_fork_id  uuid;
BEGIN
  IF NOT public.is_org_staff(p_org_id) THEN
    RAISE EXCEPTION 'Sem permissão nesta organização';
  END IF;

  SELECT * INTO v_original FROM public.exercicios_base WHERE id = p_original_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercício original não encontrado';
  END IF;
  IF v_original.org_id = p_org_id THEN
    RAISE EXCEPTION 'Exercício já pertence a esta organização — edite direto, não precisa de fork';
  END IF;
  IF NOT v_original.liberado_outras_orgs THEN
    RAISE EXCEPTION 'Exercício não está liberado pra outras orgs';
  END IF;

  -- Já existe uma cópia dessa org pra esse original? Reaproveita em vez de
  -- duplicar (2ª edição do mesmo exercício não deve criar uma 3ª linha).
  SELECT id INTO v_fork_id
    FROM public.exercicios_base
   WHERE forked_from_id = p_original_id AND org_id = p_org_id
   LIMIT 1;

  IF v_fork_id IS NOT NULL THEN
    UPDATE public.exercicios_base SET
      nome                       = coalesce(p_updates->>'nome', nome),
      video_url                  = p_updates->>'video_url',
      descricao                  = p_updates->>'descricao',
      categoria                  = p_updates->>'categoria',
      grupo_muscular_principal   = p_updates->>'grupo_muscular_principal',
      grupo_muscular_secundario  = p_updates->>'grupo_muscular_secundario'
    WHERE id = v_fork_id;
    RETURN v_fork_id;
  END IF;

  INSERT INTO public.exercicios_base (
    treinador_id, nome, video_url, descricao, categoria, musculos_principais,
    ativo, org_id, grupo_muscular_principal, grupo_muscular_secundario,
    liberado_outras_orgs, forked_from_id
  ) VALUES (
    auth.uid(),
    coalesce(p_updates->>'nome', v_original.nome),
    p_updates->>'video_url',
    p_updates->>'descricao',
    p_updates->>'categoria',
    v_original.musculos_principais,
    coalesce(v_original.ativo, true),
    p_org_id,
    p_updates->>'grupo_muscular_principal',
    p_updates->>'grupo_muscular_secundario',
    false,
    p_original_id
  ) RETURNING id INTO v_fork_id;

  -- Relinka só os exercícios de treino da PRÓPRIA org que apontavam pro
  -- original — treinos já montados passam a refletir a versão editada.
  UPDATE public.exercicios ex
     SET exercicio_base_id = v_fork_id
    FROM public.treinos t
    JOIN public.semanas sem ON sem.id = t.semana_id
    JOIN public.planos_treino pt ON pt.id = sem.plano_id
    JOIN public.alunos a ON a.id = pt.aluno_id
   WHERE ex.treino_id = t.id
     AND ex.exercicio_base_id = p_original_id
     AND a.org_id = p_org_id;

  RETURN v_fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fork_exercicio_base(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fork_exercicio_base(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fork_exercicio_base(uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fork_exercicio_base(uuid, uuid, jsonb) IS
  'Cria (ou reaproveita) a cópia editável de um exercício liberado pra uma org, e relinka os treinos já montados dessa org pra apontarem pra cópia. Payload de updates: {"nome","video_url","descricao","categoria","grupo_muscular_principal","grupo_muscular_secundario"}.';

-- ═══════════════════════════════════════════════════════════════════════════
-- match_exercicio: esconde o original quando a org de destino já tem uma
-- cópia editada dele (senão o import por PDF sugeriria o original de novo,
-- ignorando a edição que o treinador já fez).
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
    and not exists (
      select 1 from public.exercicios_base f
       where f.forked_from_id = e.id and f.org_id = p_org_id
    )
  order by score desc
  limit 1;
$function$;
