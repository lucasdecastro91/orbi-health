-- Adiciona login_logo_url ao retorno de get_tenant_by_email — a etapa 2 do
-- login (email já identificado) usa esse RPC pra montar o branding, então
-- também precisa saber se a org tem uma logo específica pro login.
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
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'name',           o.name,
    'slug',           o.slug,
    'logo_url',       o.logo_url,
    'login_logo_url', o.login_logo_url,
    'primary_color',  o.primary_color,
    'theme',          COALESCE(o.theme, 'dark')
  ) INTO v_result
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.org_id
  WHERE om.user_id = v_user_id
    AND o.active   = true
  LIMIT 1;

  RETURN v_result;
END;
$$;
