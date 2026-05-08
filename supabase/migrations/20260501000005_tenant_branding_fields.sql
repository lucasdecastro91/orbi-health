-- ============================================================
-- Campos adicionais de branding por tenant
-- ============================================================

-- nome_marca : nome exibido no app (pode diferir do name interno)
-- logo_dark_url: logo variante para fundos escuros
-- subdominio   : reservado para uso futuro (ex: getshape.app.orbihealth.com.br)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS nome_marca    TEXT,
  ADD COLUMN IF NOT EXISTS logo_dark_url TEXT,
  ADD COLUMN IF NOT EXISTS subdominio    TEXT;

COMMENT ON COLUMN organizations.nome_marca     IS 'Nome de exibição da marca no app (white-label)';
COMMENT ON COLUMN organizations.logo_dark_url  IS 'Logo para uso em fundos escuros (dark mode)';
COMMENT ON COLUMN organizations.subdominio     IS 'Subdomínio reservado para uso futuro em produção';

-- ============================================================
-- Atualiza tenant Get Shape Training
-- ============================================================
-- Slug: lucas-castro → getshape
-- O slug é a chave de roteamento; todos os URLs mudam junto.
-- Identificação via owner_id para não depender do slug antigo.

UPDATE organizations
SET
  slug          = 'getshape',
  name          = 'Get Shape Training',
  nome_marca    = 'Get Shape Training',
  primary_color = '#D4A017',
  is_gs_brand   = true,
  updated_at    = now()
WHERE owner_id = (
  SELECT id FROM auth.users
  WHERE  email = 'lucas.melo1991@gmail.com'
  LIMIT  1
);

-- ============================================================
-- Documentação: subdomínio para produção (NÃO implementar agora)
-- ============================================================
-- Quando migrar para getshape.app.orbihealth.com.br:
--
-- 1. DNS (Hostinger): wildcard *.app apontando para o mesmo IP/servidor
--    da aplicação principal.
--
-- 2. Frontend: ler window.location.hostname na inicialização.
--    Se hostname === 'getshape.app.orbihealth.com.br':
--      - extrair 'getshape' do subdomínio
--      - carregar org por slug direto, sem usar /:slug da URL
--      - TenantContext recebe o slug via prop ao invés de useParams()
--
-- 3. SQL helper sugerido:
--    SELECT * FROM organizations WHERE subdominio = 'getshape';
--
-- 4. Atualizar campo quando pronto:
--    UPDATE organizations SET subdominio = 'getshape'
--    WHERE slug = 'getshape';
-- ============================================================
