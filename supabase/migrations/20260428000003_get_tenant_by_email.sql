-- =============================================================
-- Migration: get_tenant_by_email
--
-- RPC usada pela página de login (/entrar) para identificar
-- a qual tenant um e-mail pertence ANTES da autenticação.
-- Retorna nome, slug, logo e cor da organização para aplicar
-- o branding do tenant na etapa 2 do login.
--
-- SECURITY DEFINER é obrigatório para acessar auth.users
-- a partir de uma chamada anônima (antes do login).
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_tenant_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result  jsonb;
BEGIN
  -- Localiza o usuário em auth.users (SECURITY DEFINER bypassa RLS)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  -- Email não encontrado → retorna NULL (login page exibe erro)
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Busca a organização do usuário
  SELECT jsonb_build_object(
    'name',          o.name,
    'slug',          o.slug,
    'logo_url',      o.logo_url,
    'primary_color', o.primary_color,
    'theme',         COALESCE(o.theme, 'dark')
  ) INTO v_result
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.org_id
  WHERE om.user_id = v_user_id
    AND o.active   = true
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- Permite chamada anônima (antes do usuário estar logado)
REVOKE ALL ON FUNCTION public.get_tenant_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_email(text) TO anon, authenticated;
