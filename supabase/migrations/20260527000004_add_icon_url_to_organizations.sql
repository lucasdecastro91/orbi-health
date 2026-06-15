-- Adiciona coluna icon_url à tabela organizations
-- Usada como favicon e ícone do app para cada tenant
-- O bucket logos já existe com as políticas corretas (qualquer auth pode fazer upload)

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS icon_url TEXT;

COMMENT ON COLUMN public.organizations.icon_url IS
  'URL pública do ícone quadrado da org (favicon, ícone PWA). Null = sem ícone customizado.';
