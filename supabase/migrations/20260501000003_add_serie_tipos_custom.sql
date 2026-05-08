-- Tipos de série personalizados por organização (treinador)
-- Cada treinador pode criar nomes livres além dos presets do sistema.

CREATE TABLE IF NOT EXISTS serie_tipos_custom (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome        text NOT NULL CHECK (length(trim(nome)) > 0),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (org_id, nome)
);

ALTER TABLE serie_tipos_custom ENABLE ROW LEVEL SECURITY;

-- Qualquer membro da org pode ler
CREATE POLICY "org_member_select_serie_tipos_custom"
  ON serie_tipos_custom FOR SELECT
  USING (is_org_member(org_id));

-- Apenas o dono da org (treinador) pode inserir
CREATE POLICY "org_owner_insert_serie_tipos_custom"
  ON serie_tipos_custom FOR INSERT
  WITH CHECK (is_org_owner(org_id));

-- Apenas o dono pode deletar
CREATE POLICY "org_owner_delete_serie_tipos_custom"
  ON serie_tipos_custom FOR DELETE
  USING (is_org_owner(org_id));

COMMENT ON TABLE serie_tipos_custom IS
  'Nomes personalizados de tipo de série definidos pelo treinador. Visíveis apenas dentro da organização.';
