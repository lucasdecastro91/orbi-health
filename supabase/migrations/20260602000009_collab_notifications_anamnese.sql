-- ── Backfill robusto: garante org_id em todos os alunos ──────────────────────
UPDATE public.alunos a
SET org_id = COALESCE(
  -- Via organization_members (treinador é owner)
  (SELECT om.org_id FROM public.organization_members om
   WHERE om.user_id = a.treinador_id AND om.role = 'owner' LIMIT 1),
  -- Via organizations (fallback direto)
  (SELECT o.id FROM public.organizations o
   WHERE o.owner_id = a.treinador_id LIMIT 1)
)
WHERE a.org_id IS NULL AND a.treinador_id IS NOT NULL;

-- ── anamnese_templates: colaborador pode ler template da org ──────────────────
DO $$ BEGIN
  CREATE POLICY "template_org_staff_read" ON public.anamnese_templates FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
