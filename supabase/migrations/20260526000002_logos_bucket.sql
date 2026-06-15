-- Cria bucket público para logos das organizações.
-- Path: logos/{org_slug}/logo-{timestamp}.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública
CREATE POLICY "Logos are publicly accessible"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'logos');

-- Upload: apenas o owner da org pode enviar para a pasta {slug}/
CREATE POLICY "Org owner can upload logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM organizations
    WHERE slug = (storage.foldername(name))[1]
      AND owner_id = auth.uid()
      AND active = true
  )
);

-- Update
CREATE POLICY "Org owner can update logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM organizations
    WHERE slug = (storage.foldername(name))[1]
      AND owner_id = auth.uid()
      AND active = true
  )
);

-- Delete
CREATE POLICY "Org owner can delete logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM organizations
    WHERE slug = (storage.foldername(name))[1]
      AND owner_id = auth.uid()
      AND active = true
  )
);
