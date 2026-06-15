-- ── exercicios: INSERT/UPDATE/DELETE para colaboradores ──────────────────────
DO $$ BEGIN
  CREATE POLICY "exercicios_org_staff_write" ON public.exercicios FOR ALL TO authenticated
  USING (public.is_org_staff(org_id))
  WITH CHECK (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── alunos_org_staff_update: adiciona WITH CHECK (fix silencioso do RLS) ──────
DROP POLICY IF EXISTS "alunos_org_staff_update" ON public.alunos;
CREATE POLICY "alunos_org_staff_update" ON public.alunos FOR UPDATE TO authenticated
  USING (public.is_org_staff(org_id))
  WITH CHECK (public.is_org_staff(org_id));

-- ── anamneses: garante WITH CHECK no update ───────────────────────────────────
DROP POLICY IF EXISTS "anamneses_org_staff_all" ON public.anamneses;
CREATE POLICY "anamneses_org_staff_all" ON public.anamneses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id AND public.is_org_staff(a.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id AND public.is_org_staff(a.org_id)
    )
  );
