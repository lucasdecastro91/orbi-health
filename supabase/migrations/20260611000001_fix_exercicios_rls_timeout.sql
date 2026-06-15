-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 20260611000001 — Corrige timeout em UPDATE/DELETE de exercicios
--
-- Problema: a policy antiga "Treinadores podem gerenciar exercícios" (FOR ALL)
-- usa uma cadeia de 4 JOINs (treinos → semanas → planos_treino → alunos).
-- Ela coexiste com a policy nova "exercicios_org_staff_write" (FOR ALL) que
-- usa is_org_staff(org_id) — muito mais rápida.
-- O PostgreSQL avalia AMBAS em OR para UPDATE/DELETE, tornando cada operação
-- lenta o suficiente para atingir o statement_timeout do Supabase.
--
-- Solução: dropar a policy antiga. A cobertura é mantida por:
--   SELECT  → "Ver exercícios" (alunos) + "exercicios_org_staff_select" (staff)
--   ALL     → "exercicios_org_staff_write" (treinadores / owners)
-- ══════════════════════════════════════════════════════════════════════════════

-- Remove a policy ALL lenta (4-join) — substituída por exercicios_org_staff_write
DROP POLICY IF EXISTS "Treinadores podem gerenciar exercícios" ON public.exercicios;

-- Garante índice composto em organization_members para is_org_staff ser O(1)
CREATE INDEX IF NOT EXISTS org_members_user_org_role_idx
  ON public.organization_members (user_id, org_id, role);

-- Garante que exercicios sem org_id preencham via treino (dados legados)
UPDATE public.exercicios e
SET    org_id = t.org_id
FROM   public.treinos t
WHERE  t.id = e.treino_id
  AND  e.org_id IS NULL;
