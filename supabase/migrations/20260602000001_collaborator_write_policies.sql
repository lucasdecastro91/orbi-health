-- ─────────────────────────────────────────────────────────────────────────────
-- Políticas de escrita e leitura adicionais para colaboradores
-- ─────────────────────────────────────────────────────────────────────────────

-- ── alunos: UPDATE para colaboradores (flags de anamnese, avaliação, atualização) ──
DO $$ BEGIN
  CREATE POLICY "alunos_collaborator_update"
    ON public.alunos FOR UPDATE TO authenticated
    USING (
      org_id IN (
        SELECT org_id FROM public.collaborators
        WHERE user_id = auth.uid() AND status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── registros_evolucao: INSERT/UPDATE para colaboradores ─────────────────────
DO $$ BEGIN
  CREATE POLICY "evolucao_collaborator_insert"
    ON public.registros_evolucao FOR INSERT TO authenticated
    WITH CHECK (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "evolucao_collaborator_update"
    ON public.registros_evolucao FOR UPDATE TO authenticated
    USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── feedbacks_alunos: INSERT para colaboradores ───────────────────────────────
DO $$ BEGIN
  CREATE POLICY "feedbacks_collaborator_insert"
    ON public.feedbacks_alunos FOR INSERT TO authenticated
    WITH CHECK (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── anamneses: UPDATE para colaboradores ──────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "anamneses_collaborator_update"
    ON public.anamneses FOR UPDATE TO authenticated
    USING (public.is_collab_of_student_uid(student_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── avaliacoes_posturais: INSERT/UPDATE para colaboradores ────────────────────
DO $$ BEGIN
  CREATE POLICY "avaliacoes_posturais_collaborator_insert"
    ON public.avaliacoes_posturais FOR INSERT TO authenticated
    WITH CHECK (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avaliacoes_posturais_collaborator_update"
    ON public.avaliacoes_posturais FOR UPDATE TO authenticated
    USING (public.is_collab_of_aluno_id(aluno_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── semanas: SELECT para colaboradores ───────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "semanas_collaborator_select"
    ON public.semanas FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.planos_treino pt
        WHERE pt.id = plano_id AND public.is_collab_of_aluno_id(pt.aluno_id)
      )
    );
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── treinos: SELECT para colaboradores ───────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "treinos_collaborator_select"
    ON public.treinos FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.semanas s
        JOIN public.planos_treino pt ON pt.id = s.plano_id
        WHERE s.id = semana_id AND public.is_collab_of_aluno_id(pt.aluno_id)
      )
    );
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── exercicios: SELECT para colaboradores ─────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "exercicios_collaborator_select"
    ON public.exercicios FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.treinos t
        JOIN public.semanas s ON s.id = t.semana_id
        JOIN public.planos_treino pt ON pt.id = s.plano_id
        WHERE t.id = treino_id AND public.is_collab_of_aluno_id(pt.aluno_id)
      )
    );
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ── exercicios_base: SELECT para colaboradores ────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "exercicios_base_collaborator_select"
    ON public.exercicios_base FOR SELECT TO authenticated
    USING (public.is_collab_of_org(org_id));
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;
