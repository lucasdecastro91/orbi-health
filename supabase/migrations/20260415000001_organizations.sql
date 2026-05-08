-- ============================================================
-- Migration 16: Multi-tenancy — organizations + members
-- ============================================================

-- 1. Tabela de organizações (um tenant = um profissional/marca)
CREATE TABLE public.organizations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        UNIQUE NOT NULL,
  owner_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  logo_url      TEXT,
  primary_color TEXT        NOT NULL DEFAULT '#e8941a',
  theme         TEXT        NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  plan          TEXT        NOT NULL DEFAULT 'free'  CHECK (plan IN ('free', 'pro', 'enterprise')),
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- slug: 3-50 chars, lowercase, letras/números/hífens, começa e termina com alnum
  CONSTRAINT organizations_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]$')
);

CREATE INDEX idx_organizations_slug     ON public.organizations(slug);
CREATE INDEX idx_organizations_owner_id ON public.organizations(owner_id);

-- 2. Membros da organização (liga usuários a orgs com papel)
CREATE TABLE public.organization_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('owner', 'trainer', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org_id  ON public.organization_members(org_id);
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);

-- 3. RLS
ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 4. Funções helper (SECURITY DEFINER — evitam recursão em RLS)

-- Verifica se o usuário atual é dono da org
CREATE OR REPLACE FUNCTION public.is_org_owner(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id
      AND owner_id = auth.uid()
      AND active = true
  );
$$;

-- Verifica se o usuário atual é membro da org
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
  );
$$;

-- Retorna o org_id do usuário atual (primeiro encontrado)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Converte texto livre em slug URL-safe
-- Ex: "João Silva Fit" → "joao-silva-fit"
CREATE OR REPLACE FUNCTION public.slugify(_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  result TEXT;
BEGIN
  result := lower(trim(_text));

  -- Substitui caracteres acentuados por equivalentes ASCII
  result := translate(result,
    'àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ',
    'aaaaaaeceeeeiiiidnoooooouuuuyty'
  );

  -- Tudo que não for letra/número → hífen
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');

  -- Remove hífens no início e no fim
  result := trim(both '-' from result);

  -- Trunca em 45 caracteres
  result := substring(result from 1 for 45);

  -- Garante comprimento mínimo de 3
  IF length(result) < 3 THEN
    result := result || '-app';
  END IF;

  RETURN result;
END;
$$;

-- 5. RLS policies — organizations

-- Qualquer um pode buscar por slug (necessário para página de login da org)
CREATE POLICY "orgs_public_read"
ON public.organizations FOR SELECT
USING (true);

-- Trainer autenticado cria sua própria org
CREATE POLICY "orgs_owner_insert"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

-- Apenas o dono atualiza a org
CREATE POLICY "orgs_owner_update"
ON public.organizations FOR UPDATE
TO authenticated
USING  (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- 6. RLS policies — organization_members

-- Membros veem o roster da própria org
CREATE POLICY "members_view_roster"
ON public.organization_members FOR SELECT
TO authenticated
USING (public.is_org_member(org_id));

-- Dono adiciona membros à org
CREATE POLICY "owners_add_members"
ON public.organization_members FOR INSERT
TO authenticated
WITH CHECK (public.is_org_owner(org_id));

-- Dono remove membros da org
CREATE POLICY "owners_remove_members"
ON public.organization_members FOR DELETE
TO authenticated
USING (public.is_org_owner(org_id));

-- Nota: service role (Edge Functions) ignora RLS por definição do Supabase
