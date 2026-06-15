-- Sistema de colaboradores com permissões granulares
-- Permite que donos de org adicionem colaboradores com acesso parcial ao painel

CREATE TABLE IF NOT EXISTS public.collaborators (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by       uuid        REFERENCES auth.users(id),
  user_id          uuid        REFERENCES auth.users(id) NULL,  -- preenchido ao aceitar
  name             text        NOT NULL,
  role             text        NOT NULL,          -- campo livre: "Nutricionista", "Estagiário"…
  email            text        NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'active', 'inactive')),
  permissions      jsonb       NOT NULL DEFAULT '{}',
  invite_token     text        UNIQUE,            -- UUID gerado pela edge function
  invite_expires_at timestamptz,                  -- now() + 24h ao convidar
  created_at       timestamptz DEFAULT now(),
  accepted_at      timestamptz NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS collaborators_org_idx   ON public.collaborators (org_id);
CREATE INDEX IF NOT EXISTS collaborators_user_idx  ON public.collaborators (user_id);
CREATE INDEX IF NOT EXISTS collaborators_token_idx ON public.collaborators (invite_token);

-- RLS
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

-- Dono da org gerencia tudo
CREATE POLICY "org_owner_manage_collaborators"
  ON public.collaborators
  FOR ALL
  USING  (org_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

-- Colaborador lê seu próprio registro (após aceitar — user_id preenchido)
CREATE POLICY "collaborator_view_own"
  ON public.collaborators
  FOR SELECT
  USING (user_id = auth.uid());

-- Permite leitura pública de convites válidos e pendentes
-- (usado pela página /convite/:token sem autenticação)
CREATE POLICY "public_pending_token_read"
  ON public.collaborators
  FOR SELECT
  USING (
    invite_token IS NOT NULL
    AND invite_expires_at > now()
    AND status = 'pending'
  );
