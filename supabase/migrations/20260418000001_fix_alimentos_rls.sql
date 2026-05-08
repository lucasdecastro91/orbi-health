-- =============================================================
-- Fix: RLS policies na tabela alimentos
--
-- Problema: as policies de superadmin usavam
--   (SELECT email FROM auth.users WHERE id = auth.uid())
-- que falha com "permission denied for table users" para o role
-- authenticated/anon — bloqueando TODAS as queries em alimentos.
--
-- Solução: usar auth.jwt() ->> 'email' que lê direto do token JWT
-- sem precisar de acesso à auth.users.
-- =============================================================

-- Remove policies quebradas
DROP POLICY IF EXISTS "alimentos_superadmin_select" ON public.alimentos;
DROP POLICY IF EXISTS "alimentos_superadmin_update" ON public.alimentos;

-- Recria usando JWT claim (sem subquery em auth.users)
CREATE POLICY "alimentos_superadmin_select" ON public.alimentos
  FOR SELECT USING (
    (auth.jwt() ->> 'email') = 'lucas.melo1991@gmail.com'
  );

CREATE POLICY "alimentos_superadmin_update" ON public.alimentos
  FOR UPDATE USING (
    (auth.jwt() ->> 'email') = 'lucas.melo1991@gmail.com'
  );

-- Garante que alimentos globais aprovados são visíveis para qualquer autenticado
-- (a policy anterior já existia mas recriamos para garantir)
DROP POLICY IF EXISTS "alimentos_globais_select" ON public.alimentos;
CREATE POLICY "alimentos_globais_select" ON public.alimentos
  FOR SELECT TO authenticated
  USING (org_id IS NULL AND status = 'aprovado');

-- Alimentos de org: membros veem os da própria org
DROP POLICY IF EXISTS "alimentos_org_select" ON public.alimentos;
CREATE POLICY "alimentos_org_select" ON public.alimentos
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Membros de org podem inserir alimentos para sua org (status pendente)
DROP POLICY IF EXISTS "alimentos_org_insert" ON public.alimentos;
CREATE POLICY "alimentos_org_insert" ON public.alimentos
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
