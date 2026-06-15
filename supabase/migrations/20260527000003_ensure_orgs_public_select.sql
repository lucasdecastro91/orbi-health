-- Garante que organizations tem leitura pública (necessário para a tela de login
-- buscar theme/logo_url sem o usuário estar autenticado).
--
-- Esta migration é IDEMPOTENTE: só cria a policy se ela ainda não existir,
-- de forma que não quebra ambientes onde a migration original já foi rodada.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'organizations'
      AND  policyname = 'orgs_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "orgs_public_read"
      ON public.organizations
      FOR SELECT
      USING (true)
    $policy$;

    RAISE NOTICE 'Policy orgs_public_read criada.';
  ELSE
    RAISE NOTICE 'Policy orgs_public_read já existe — nada a fazer.';
  END IF;
END $$;
