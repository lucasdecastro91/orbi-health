-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Treinadores podem ver perfis de alunos" ON public.profiles;

-- The following policies remain and are safe:
-- "Usuários podem ver seu próprio perfil" (auth.uid() = id)
-- "Usuários podem atualizar seu próprio perfil" (auth.uid() = id)