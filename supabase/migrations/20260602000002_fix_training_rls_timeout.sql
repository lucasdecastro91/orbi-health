-- URGENTE: Remove policies de treino que causam timeout para todos os usuários
-- As policies com joins encadeados são avaliadas para TODOS (alunos, treinadores, colaboradores)
-- causando "statement timeout" nas queries de treino.

DROP POLICY IF EXISTS "semanas_collaborator_select"    ON public.semanas;
DROP POLICY IF EXISTS "treinos_collaborator_select"    ON public.treinos;
DROP POLICY IF EXISTS "exercicios_collaborator_select" ON public.exercicios;
DROP POLICY IF EXISTS "exercicios_base_collaborator_select" ON public.exercicios_base;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recriar de forma eficiente: verificar org_id direto em planos_treino
-- em vez de encadear joins de semanas → treinos → exercicios
-- ─────────────────────────────────────────────────────────────────────────────

-- Função auxiliar eficiente: colaborador tem acesso ao plano de treino?
CREATE OR REPLACE FUNCTION public.is_collab_of_plano(p_plano_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.planos_treino pt
    JOIN public.alunos a ON a.id = pt.aluno_id
    JOIN public.collaborators c ON c.org_id = a.org_id
    WHERE pt.id = p_plano_id
      AND c.user_id = auth.uid()
      AND c.status = 'active'
  )
$$;

-- semanas: colaborador vê se tiver acesso ao plano
CREATE POLICY "semanas_collaborator_select"
  ON public.semanas FOR SELECT TO authenticated
  USING (public.is_collab_of_plano(plano_id));

-- treinos: colaborador vê se tiver acesso à semana → plano
CREATE POLICY "treinos_collaborator_select"
  ON public.treinos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.semanas s
      WHERE s.id = semana_id AND public.is_collab_of_plano(s.plano_id)
    )
  );

-- exercicios: colaborador vê se tiver acesso ao treino → semana → plano
CREATE POLICY "exercicios_collaborator_select"
  ON public.exercicios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.treinos t
      JOIN public.semanas s ON s.id = t.semana_id
      WHERE t.id = treino_id AND public.is_collab_of_plano(s.plano_id)
    )
  );

-- exercicios_base: leitura liberada para todos autenticados (é biblioteca pública da org)
CREATE POLICY "exercicios_base_collaborator_select"
  ON public.exercicios_base FOR SELECT TO authenticated
  USING (public.is_collab_of_org(org_id));
