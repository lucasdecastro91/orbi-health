-- =============================================================
-- Fix: adiciona política de DELETE para a tabela alimentos
--
-- Problema: RLS estava ativo na tabela alimentos sem nenhuma
-- policy de DELETE, bloqueando silenciosamente todas as exclusões
-- feitas por usuários autenticados (retorna sucesso mas 0 linhas).
--
-- Solução: criar policies de DELETE para membros de org e superadmin.
-- =============================================================

-- Membros de org podem excluir alimentos da própria org
CREATE POLICY "alimentos_org_delete" ON public.alimentos
  FOR DELETE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Superadmin pode excluir qualquer alimento (inclusive globais)
CREATE POLICY "alimentos_superadmin_delete" ON public.alimentos
  FOR DELETE
  USING (
    (auth.jwt() ->> 'email') = 'lucas.melo1991@gmail.com'
  );
