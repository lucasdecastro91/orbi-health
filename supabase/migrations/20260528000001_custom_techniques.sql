-- ─────────────────────────────────────────────────────────────────────────────
-- custom_techniques: biblioteca de técnicas personalizadas por org
-- Substitui/complementa serie_tipos_custom (que só guardava o nome)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_techniques (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

-- RLS
ALTER TABLE public.custom_techniques ENABLE ROW LEVEL SECURITY;

-- Treinador/owner da org acessa as técnicas da própria org
CREATE POLICY "org_member_manage_custom_techniques"
  ON public.custom_techniques
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = custom_techniques.org_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = custom_techniques.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Migra dados existentes da tabela antiga (se existir) — só nome, sem descrição
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'serie_tipos_custom'
  ) THEN
    INSERT INTO public.custom_techniques (org_id, name)
    SELECT org_id, nome
    FROM public.serie_tipos_custom
    ON CONFLICT (org_id, name) DO NOTHING;
  END IF;
END;
$$;
