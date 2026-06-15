-- =============================================================
-- Fix: adiciona política de UPDATE para superadmin na tabela alimentos.
--
-- Necessário para a função de aprovação em RevisaoAlimentos.tsx:
-- ao aprovar um alimento pendente, o superadmin precisa setar
-- org_id = NULL (tornando-o global). A policy de UPDATE existente
-- (alimentos_org_update) restringe via WITH CHECK que o org_id
-- permaneça dentro das orgs do usuário — o que bloqueia a mudança
-- para NULL. Esta policy permite que o superadmin atualize qualquer
-- alimento sem restrição de org_id.
-- =============================================================

CREATE POLICY "alimentos_superadmin_update" ON public.alimentos
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'email') = 'lucas.melo1991@gmail.com'
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'lucas.melo1991@gmail.com'
  );
