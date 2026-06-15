-- ─────────────────────────────────────────────────────────────────────────────
-- Consolida acesso de colaboradores nas funções existentes, eliminando
-- policies duplicadas que causam overhead por linha para todos os usuários.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Função auxiliar: retorna os org_ids do colaborador atual (roda 1x por query) ──
CREATE OR REPLACE FUNCTION public.collab_org_ids()
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY(
    SELECT org_id FROM public.collaborators
    WHERE user_id = auth.uid() AND status = 'active'
  )
$$;

-- ── 1. alunos ─────────────────────────────────────────────────────────────────
-- Substitui a policy separada de colaborador pela extensão da policy existente
DROP POLICY IF EXISTS "alunos_collaborator_select" ON public.alunos;
DROP POLICY IF EXISTS "Treinadores podem ver seus alunos" ON public.alunos;
CREATE POLICY "Treinadores podem ver seus alunos"
  ON public.alunos FOR SELECT
  USING (
    treinador_id = auth.uid()
    OR org_id = ANY(public.collab_org_ids())
  );

DROP POLICY IF EXISTS "alunos_collaborator_update" ON public.alunos;
DROP POLICY IF EXISTS "Treinadores podem atualizar seus alunos" ON public.alunos;
CREATE POLICY "Treinadores podem atualizar seus alunos"
  ON public.alunos FOR UPDATE
  USING (
    treinador_id = auth.uid()
    OR org_id = ANY(public.collab_org_ids())
  );

-- ── 2. diets ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "diets_collaborator_select"  ON public.diets;
DROP POLICY IF EXISTS "diets_collaborator_insert"  ON public.diets;
DROP POLICY IF EXISTS "diets_collaborator_update"  ON public.diets;
DROP POLICY IF EXISTS "diets_collaborator_delete"  ON public.diets;

CREATE OR REPLACE FUNCTION public.is_diet_trainer(p_diet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diets d
    JOIN public.alunos a ON a.user_id = d.student_id
    WHERE d.id = p_diet_id
      AND (a.treinador_id = auth.uid() OR a.org_id = ANY(public.collab_org_ids()))
  )
$$;

-- ── 3. diet_meals ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "diet_meals_collaborator_select" ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_collaborator_insert" ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_collaborator_update" ON public.diet_meals;
DROP POLICY IF EXISTS "diet_meals_collaborator_delete" ON public.diet_meals;
-- Já coberto pelo is_diet_trainer atualizado nas policies existentes

-- ── 4. diet_meal_foods ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "diet_meal_foods_collaborator_select" ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_collaborator_insert" ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_collaborator_update" ON public.diet_meal_foods;
DROP POLICY IF EXISTS "diet_meal_foods_collaborator_delete" ON public.diet_meal_foods;

-- ── 5. meal_alternatives / foods ─────────────────────────────────────────────
DROP POLICY IF EXISTS "meal_alternatives_collaborator_select" ON public.meal_alternatives;
DROP POLICY IF EXISTS "meal_alternatives_collaborator_write"  ON public.meal_alternatives;
DROP POLICY IF EXISTS "meal_alternative_foods_collaborator_select" ON public.meal_alternative_foods;
DROP POLICY IF EXISTS "meal_alternative_foods_collaborator_write"  ON public.meal_alternative_foods;

-- ── 6. dietas_pdf ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dietas_pdf_collaborator_select" ON public.dietas_pdf;
DROP POLICY IF EXISTS "dietas_pdf_collaborator_write"  ON public.dietas_pdf;
DO $$ BEGIN
  CREATE POLICY "dietas_pdf_trainer_all" ON public.dietas_pdf FOR ALL
  USING (public.is_collab_of_aluno_id(aluno_id) OR EXISTS (
    SELECT 1 FROM public.alunos a WHERE a.id = aluno_id AND a.treinador_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 7. check_ins ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "checkins_collaborator_select" ON public.check_ins;
DROP POLICY IF EXISTS "checkins_trainer_select" ON public.check_ins;
CREATE POLICY "checkins_trainer_select" ON public.check_ins
  FOR SELECT USING (
    treinador_id = auth.uid()
    OR student_id IN (
      SELECT user_id FROM public.alunos WHERE org_id = ANY(public.collab_org_ids())
    )
  );

-- ── 8. registros_evolucao ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "evolucao_collaborator_select" ON public.registros_evolucao;
DROP POLICY IF EXISTS "evolucao_collaborator_insert" ON public.registros_evolucao;
DROP POLICY IF EXISTS "evolucao_collaborator_update" ON public.registros_evolucao;
DROP POLICY IF EXISTS "evolucao_trainer_select"      ON public.registros_evolucao;
DROP POLICY IF EXISTS "evolucao_trainer_insert"      ON public.registros_evolucao;
CREATE POLICY "evolucao_trainer_all" ON public.registros_evolucao
  FOR ALL USING (
    student_id IN (
      SELECT user_id FROM public.alunos
      WHERE treinador_id = auth.uid() OR org_id = ANY(public.collab_org_ids())
    )
  );

-- ── 9. evolution_photos ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "evolution_photos_collaborator_select" ON public.evolution_photos;
DO $$ BEGIN
  DROP POLICY IF EXISTS "trainer read org photos" ON public.evolution_photos;
  CREATE POLICY "trainer read org photos" ON public.evolution_photos FOR SELECT
  USING (
    org_id = ANY(public.collab_org_ids())
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = evolution_photos.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'trainer')
    )
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 10. anamneses ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anamneses_collaborator_select" ON public.anamneses;
DROP POLICY IF EXISTS "anamneses_collaborator_update" ON public.anamneses;
DROP POLICY IF EXISTS "anamnese_trainer_select"       ON public.anamneses;
DROP POLICY IF EXISTS "anamnese_trainer_update"       ON public.anamneses;
CREATE POLICY "anamnese_trainer_all" ON public.anamneses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id
        AND (a.treinador_id = auth.uid() OR a.org_id = ANY(public.collab_org_ids()))
    )
  );

-- ── 11. feedbacks_alunos ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "feedbacks_collaborator_select" ON public.feedbacks_alunos;
DROP POLICY IF EXISTS "feedbacks_collaborator_insert" ON public.feedbacks_alunos;
DROP POLICY IF EXISTS "Treinadores podem gerenciar feedbacks de seus alunos" ON public.feedbacks_alunos;
CREATE POLICY "Treinadores podem gerenciar feedbacks de seus alunos"
  ON public.feedbacks_alunos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = feedbacks_alunos.aluno_id
        AND (a.treinador_id = auth.uid() OR a.org_id = ANY(public.collab_org_ids()))
    )
  );

-- ── 12. avaliacoes_posturais ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "avaliacoes_posturais_collaborator_select" ON public.avaliacoes_posturais;
DROP POLICY IF EXISTS "avaliacoes_posturais_collaborator_insert" ON public.avaliacoes_posturais;
DROP POLICY IF EXISTS "avaliacoes_posturais_collaborator_update" ON public.avaliacoes_posturais;

-- ── 13. atualizacao_respostas / valores / arquivos ────────────────────────────
DROP POLICY IF EXISTS "atualizacao_respostas_collaborator_select"  ON public.atualizacao_respostas;
DROP POLICY IF EXISTS "atualizacao_valores_collaborator_select"    ON public.atualizacao_resposta_valores;
DROP POLICY IF EXISTS "atualizacao_arquivos_collaborator_select"   ON public.atualizacao_resposta_arquivos;
-- Essas tabelas usam is_org_member — atualizar para incluir colaboradores
DROP POLICY IF EXISTS "trainer read org respostas" ON public.atualizacao_respostas;
CREATE POLICY "trainer read org respostas" ON public.atualizacao_respostas FOR SELECT
  USING (
    is_org_member(org_id)
    OR org_id = ANY(public.collab_org_ids())
  );
DROP POLICY IF EXISTS "read valores" ON public.atualizacao_resposta_valores;
CREATE POLICY "read valores" ON public.atualizacao_resposta_valores FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atualizacao_respostas r
    WHERE r.id = resposta_id
      AND (auth.uid() = r.student_id OR is_org_member(r.org_id) OR r.org_id = ANY(public.collab_org_ids()))
  ));
DROP POLICY IF EXISTS "read arquivos" ON public.atualizacao_resposta_arquivos;
CREATE POLICY "read arquivos" ON public.atualizacao_resposta_arquivos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atualizacao_respostas r
    WHERE r.id = resposta_id
      AND (auth.uid() = r.student_id OR is_org_member(r.org_id) OR r.org_id = ANY(public.collab_org_ids()))
  ));

-- ── 14. planos_treino ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "planos_treino_collaborator_select" ON public.planos_treino;

-- ── 15. exercicios_base ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "exercicios_base_collaborator_select" ON public.exercicios_base;
