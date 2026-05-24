-- =============================================================
-- Fix: adiciona política de UPDATE para membros de org na tabela alimentos
--
-- Necessário para soft-delete: em vez de DELETE (que viola FK com
-- diet_meal_foods), marcamos status = 'removido'. A query de listagem
-- já filtra status = 'aprovado', então o alimento desaparece da UI
-- sem quebrar referências existentes em planos alimentares.
-- =============================================================

CREATE POLICY "alimentos_org_update" ON public.alimentos
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
