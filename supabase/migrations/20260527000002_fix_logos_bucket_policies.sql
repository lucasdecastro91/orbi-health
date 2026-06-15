-- Fix: substitui as políticas do bucket `logos` por versões simples e confiáveis.
--
-- O problema das políticas anteriores: o INSERT verificava o slug via subquery
-- em `organizations`, que pode ser bloqueado pela RLS dessa tabela durante a
-- avaliação da policy de Storage, retornando false silenciosamente.
--
-- Nova abordagem: qualquer usuário autenticado pode fazer upload/update/delete
-- no bucket logos. Acesso de leitura é público (bucket já é público).

-- ── 1. Remove políticas antigas ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Logos are publicly accessible"   ON storage.objects;
DROP POLICY IF EXISTS "Org owner can upload logo"        ON storage.objects;
DROP POLICY IF EXISTS "Org owner can update logo"        ON storage.objects;
DROP POLICY IF EXISTS "Org owner can delete logo"        ON storage.objects;

-- Remove também variações de nome que possam existir
DROP POLICY IF EXISTS "logos_public_select"  ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_insert"    ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_update"    ON storage.objects;
DROP POLICY IF EXISTS "logos_auth_delete"    ON storage.objects;

-- ── 2. Garante que o bucket existe e está público ─────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'];

-- ── 3. Cria novas políticas ───────────────────────────────────────────────────

-- Leitura pública (qualquer visitante pode ver logos)
CREATE POLICY "logos_public_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'logos');

-- Upload: qualquer usuário autenticado (cada treinador sobe para sua própria pasta)
CREATE POLICY "logos_auth_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Update: usuário autenticado pode atualizar arquivos do bucket
CREATE POLICY "logos_auth_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logos');

-- Delete: usuário autenticado pode remover arquivos do bucket
CREATE POLICY "logos_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logos');
