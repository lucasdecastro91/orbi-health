-- Coluna is_gs_brand na tabela organizations
-- Permite identificar a org Get Shape sem depender do e-mail do owner
-- Usado para aplicar branding personalizado a TODOS os membros da org
-- (incluindo alunos em dispositivos novos que nunca fizeram login como owner)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_gs_brand boolean NOT NULL DEFAULT false;

-- Marca a org cujo owner tem o e-mail da Get Shape
UPDATE organizations
SET    is_gs_brand = true
WHERE  owner_id = (
  SELECT id FROM auth.users
  WHERE  email = 'lucas.melo1991@gmail.com'
  LIMIT  1
);

COMMENT ON COLUMN organizations.is_gs_brand IS
  'Se true, toda a UX da org usa o branding Get Shape (logo, favicon, título).';
