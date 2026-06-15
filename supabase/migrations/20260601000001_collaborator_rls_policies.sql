-- ─────────────────────────────────────────────────────────────────────────────
-- Políticas de RLS para colaboradores lerem dados dos alunos da org
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Funções helper ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_collab_of_student_uid(p_student_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alunos a
    JOIN public.collaborators c ON c.org_id = a.org_id
    WHERE a.user_id = p_student_user_id
      AND c.user_id = auth.uid()
      AND c.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_collab_of_aluno_id(p_aluno_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alunos a
    JOIN public.collaborators c ON c.org_id = a.org_id
    WHERE a.id = p_aluno_id
      AND c.user_id = auth.uid()
      AND c.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_collab_of_org(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  )
$$;

-- ── Policies (cada uma em bloco separado para não abortar tudo se uma falhar) ──

DO $$ BEGIN
  CREATE POLICY "alunos_collaborator_select" ON public.alunos FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM public.collaborators WHERE user_id = auth.uid() AND status = 'active'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diets_collaborator_select" ON public.diets FOR SELECT TO authenticated
  USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meals_collaborator_select" ON public.diet_meals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diets d WHERE d.id = diet_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "diet_meal_foods_collaborator_select" ON public.diet_meal_foods FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diet_meals dm JOIN public.diets d ON d.id = dm.diet_id
    WHERE dm.id = meal_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "meal_alternatives_collaborator_select" ON public.meal_alternatives FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diet_meals dm JOIN public.diets d ON d.id = dm.diet_id
    WHERE dm.id = meal_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "meal_alternative_foods_collaborator_select" ON public.meal_alternative_foods FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meal_alternatives ma
    JOIN public.diet_meals dm ON dm.id = ma.meal_id
    JOIN public.diets d ON d.id = dm.diet_id
    WHERE ma.id = alternative_id AND public.is_collab_of_student_uid(d.student_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dietas_pdf_collaborator_select" ON public.dietas_pdf FOR SELECT TO authenticated
  USING (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "checkins_collaborator_select" ON public.check_ins FOR SELECT TO authenticated
  USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "evolucao_collaborator_select" ON public.registros_evolucao FOR SELECT TO authenticated
  USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "evolution_photos_collaborator_select" ON public.evolution_photos FOR SELECT TO authenticated
  USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anamneses_collaborator_select" ON public.anamneses FOR SELECT TO authenticated
  USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "feedbacks_collaborator_select" ON public.feedbacks_alunos FOR SELECT TO authenticated
  USING (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avaliacoes_posturais_collaborator_select" ON public.avaliacoes_posturais FOR SELECT TO authenticated
  USING (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avaliacao_fotos_collaborator_select" ON public.avaliacao_fotos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.avaliacoes_posturais ap
    WHERE ap.id = avaliacao_id AND public.is_collab_of_aluno_id(ap.aluno_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "atualizacao_respostas_collaborator_select" ON public.atualizacao_respostas FOR SELECT TO authenticated
  USING (public.is_collab_of_org(org_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "atualizacao_valores_collaborator_select" ON public.atualizacao_resposta_valores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.atualizacao_respostas r WHERE r.id = resposta_id AND public.is_collab_of_org(r.org_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "atualizacao_arquivos_collaborator_select" ON public.atualizacao_resposta_arquivos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.atualizacao_respostas r WHERE r.id = resposta_id AND public.is_collab_of_org(r.org_id)
  ));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "planos_treino_collaborator_select" ON public.planos_treino FOR SELECT TO authenticated
  USING (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;
