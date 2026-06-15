-- ─────────────────────────────────────────────────────────────────────────────
-- Acesso de colaboradores via organization_members (performático)
-- Colaboradores são inseridos como role='trainer' ao aceitar convite.
-- is_org_member() já é indexado e usado em outras tabelas sem causar overhead.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── alunos: colaborador lê e atualiza alunos da org ──────────────────────────
DO $$ BEGIN
  CREATE POLICY "alunos_org_member_select" ON public.alunos FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "alunos_org_member_update" ON public.alunos FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── diets: estende is_diet_trainer para incluir org members ──────────────────
CREATE OR REPLACE FUNCTION public.is_diet_trainer(p_diet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diets d
    JOIN public.alunos a ON a.user_id = d.student_id
    WHERE d.id = p_diet_id
      AND (a.treinador_id = auth.uid() OR public.is_org_member(a.org_id))
  )
$$;

-- ── check_ins ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "checkins_org_member_select" ON public.check_ins FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE public.is_org_member(org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── registros_evolucao ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "evolucao_org_member_all" ON public.registros_evolucao FOR ALL TO authenticated
  USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE public.is_org_member(org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── anamneses ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "anamneses_org_member_all" ON public.anamneses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id AND public.is_org_member(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── feedbacks_alunos ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "feedbacks_org_member_all" ON public.feedbacks_alunos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = feedbacks_alunos.aluno_id AND public.is_org_member(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── avaliacoes_posturais ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "avaliacoes_org_member_all" ON public.avaliacoes_posturais FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = avaliacoes_posturais.aluno_id AND public.is_org_member(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── planos_treino ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "planos_treino_org_member_select" ON public.planos_treino FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = planos_treino.aluno_id AND public.is_org_member(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── dietas_pdf ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "dietas_pdf_org_member_all" ON public.dietas_pdf FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = dietas_pdf.aluno_id AND public.is_org_member(a.org_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── atualizacao_respostas já usa is_org_member — nenhuma alteração necessária ─

-- ── Backfill: insere colaboradores já ativos em organization_members ──────────
INSERT INTO public.organization_members (org_id, user_id, role)
SELECT c.org_id, c.user_id, 'trainer'
FROM public.collaborators c
WHERE c.status = 'active'
  AND c.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.org_id = c.org_id AND om.user_id = c.user_id
  )
ON CONFLICT (org_id, user_id) DO NOTHING;
