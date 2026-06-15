-- ============================================================
-- Forms de Atualização — substituição flexível do check-in
-- Estrutura tipo Google Forms: seções + campos + respostas
-- ============================================================

-- ─── Tabelas ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atualizacao_forms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo      TEXT        NOT NULL DEFAULT 'Atualização',
  descricao   TEXT,
  aviso_final TEXT,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atualizacao_form_secoes (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id   UUID    NOT NULL REFERENCES atualizacao_forms(id) ON DELETE CASCADE,
  titulo    TEXT    NOT NULL,
  instrucao TEXT,
  ordem     INT     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS atualizacao_form_campos (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID    NOT NULL REFERENCES atualizacao_forms(id) ON DELETE CASCADE,
  secao_id    UUID    REFERENCES atualizacao_form_secoes(id) ON DELETE SET NULL,
  tipo        TEXT    NOT NULL CHECK (tipo IN ('text','textarea','number','radio','checkbox','file')),
  label       TEXT    NOT NULL,
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  opcoes      JSONB,  -- [{label, value}] para radio/checkbox
  config      JSONB,  -- {min, max} para number; {multiple, accept} para file
  ordem       INT     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS atualizacao_respostas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      UUID        NOT NULL REFERENCES atualizacao_forms(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atualizacao_resposta_valores (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id  UUID    NOT NULL REFERENCES atualizacao_respostas(id) ON DELETE CASCADE,
  campo_id     UUID    REFERENCES atualizacao_form_campos(id) ON DELETE SET NULL,
  valor_texto  TEXT,
  valor_numero NUMERIC,
  valor_opcoes JSONB
);

CREATE TABLE IF NOT EXISTS atualizacao_resposta_arquivos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id   UUID        NOT NULL REFERENCES atualizacao_respostas(id) ON DELETE CASCADE,
  campo_id      UUID        REFERENCES atualizacao_form_campos(id) ON DELETE SET NULL,
  storage_path  TEXT        NOT NULL,
  nome_original TEXT,
  mime_type     TEXT,
  tamanho       INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_atform_org         ON atualizacao_forms(org_id);
CREATE INDEX IF NOT EXISTS idx_atresp_form        ON atualizacao_respostas(form_id);
CREATE INDEX IF NOT EXISTS idx_atresp_student     ON atualizacao_respostas(student_id);
CREATE INDEX IF NOT EXISTS idx_atresp_org_date    ON atualizacao_respostas(org_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_atval_resposta     ON atualizacao_resposta_valores(resposta_id);
CREATE INDEX IF NOT EXISTS idx_atarq_resposta     ON atualizacao_resposta_arquivos(resposta_id);

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE atualizacao_forms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE atualizacao_form_secoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE atualizacao_form_campos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE atualizacao_respostas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE atualizacao_resposta_valores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE atualizacao_resposta_arquivos ENABLE ROW LEVEL SECURITY;

-- forms
CREATE POLICY "org members read forms"
  ON atualizacao_forms FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "org owners manage forms"
  ON atualizacao_forms FOR ALL USING (is_org_owner(org_id));

-- sections
CREATE POLICY "org members read secoes" ON atualizacao_form_secoes FOR SELECT
  USING (EXISTS (SELECT 1 FROM atualizacao_forms f WHERE f.id = form_id AND is_org_member(f.org_id)));
CREATE POLICY "org owners manage secoes" ON atualizacao_form_secoes FOR ALL
  USING (EXISTS (SELECT 1 FROM atualizacao_forms f WHERE f.id = form_id AND is_org_owner(f.org_id)));

-- fields
CREATE POLICY "org members read campos" ON atualizacao_form_campos FOR SELECT
  USING (EXISTS (SELECT 1 FROM atualizacao_forms f WHERE f.id = form_id AND is_org_member(f.org_id)));
CREATE POLICY "org owners manage campos" ON atualizacao_form_campos FOR ALL
  USING (EXISTS (SELECT 1 FROM atualizacao_forms f WHERE f.id = form_id AND is_org_owner(f.org_id)));

-- responses
CREATE POLICY "student insert respostas" ON atualizacao_respostas FOR INSERT
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY "student read own respostas" ON atualizacao_respostas FOR SELECT
  USING (auth.uid() = student_id);
CREATE POLICY "trainer read org respostas" ON atualizacao_respostas FOR SELECT
  USING (is_org_member(org_id));

-- valores
CREATE POLICY "student insert valores" ON atualizacao_resposta_valores FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM atualizacao_respostas r
    WHERE r.id = resposta_id AND auth.uid() = r.student_id
  ));
CREATE POLICY "read valores" ON atualizacao_resposta_valores FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atualizacao_respostas r
    WHERE r.id = resposta_id
      AND (auth.uid() = r.student_id OR is_org_member(r.org_id))
  ));

-- arquivos
CREATE POLICY "student insert arquivos" ON atualizacao_resposta_arquivos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM atualizacao_respostas r
    WHERE r.id = resposta_id AND auth.uid() = r.student_id
  ));
CREATE POLICY "read arquivos" ON atualizacao_resposta_arquivos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atualizacao_respostas r
    WHERE r.id = resposta_id
      AND (auth.uid() = r.student_id OR is_org_member(r.org_id))
  ));

-- ─── Storage bucket ─────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('atualizacoes', 'atualizacoes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "student upload atualizacoes" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'atualizacoes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "org member read atualizacoes" ON storage.objects FOR SELECT
  USING (bucket_id = 'atualizacoes');

-- ─── Seed GS form ────────────────────────────────────────────

DO $$
DECLARE
  v_org_id    UUID;
  v_form_id   UUID;
  v_s1        UUID;
  v_s2        UUID;
  v_s3        UUID;
BEGIN
  SELECT o.id INTO v_org_id
  FROM organizations o
  JOIN auth.users u ON u.id = o.owner_id
  WHERE u.email = 'lucas.melo1991@gmail.com'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE WARNING 'GS org not found — skipping form seed';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM atualizacao_forms WHERE org_id = v_org_id) THEN
    RAISE NOTICE 'GS form already exists — skipping';
    RETURN;
  END IF;

  INSERT INTO atualizacao_forms (org_id, titulo, aviso_final)
  VALUES (v_org_id, 'Atualização',
    '⚠️ IMPORTANTE: O prazo para envio das atualizações é de 48 a 72 horas úteis quando enviadas na data. Atualizações enviadas com atraso poderão acarretar em atraso no envio dos ajustes.')
  RETURNING id INTO v_form_id;

  INSERT INTO atualizacao_form_secoes (form_id, titulo, ordem)
    VALUES (v_form_id, 'Evolução Física e Rotina de Treino', 1) RETURNING id INTO v_s1;
  INSERT INTO atualizacao_form_secoes (form_id, titulo, ordem)
    VALUES (v_form_id, 'Alimentação', 2) RETURNING id INTO v_s2;
  INSERT INTO atualizacao_form_secoes (form_id, titulo, instrucao, ordem)
    VALUES (v_form_id, 'Aderência ao Protocolo (0 a 10)', '0 = Não seguiu nada / 10 = Seguiu 100%', 3) RETURNING id INTO v_s3;

  -- Campos iniciais (sem seção)
  INSERT INTO atualizacao_form_campos (form_id, secao_id, tipo, label, obrigatorio, config, ordem) VALUES
    (v_form_id, NULL, 'text',   'E-mail',             true, NULL, 1),
    (v_form_id, NULL, 'text',   'Nome completo',       true, NULL, 2),
    (v_form_id, NULL, 'number', 'Peso em jejum (kg)',  true, NULL, 3),
    (v_form_id, NULL, 'file',
      'Enviar fotos para avaliação — frente, costas, perfil esquerdo e direito com braços relaxados e com as mãos apontadas para frente, ou seja, ombros flexionados em 90°',
      true, '{"multiple":true,"accept":"image/*"}'::jsonb, 4);

  -- Seção 1: Evolução Física e Rotina de Treino
  INSERT INTO atualizacao_form_campos (form_id, secao_id, tipo, label, obrigatorio, opcoes, ordem) VALUES
    (v_form_id, v_s1, 'textarea', 'Como se sentiu com a evolução do físico?', true, NULL, 1),
    (v_form_id, v_s1, 'radio', 'Conseguiu progredir carga semanalmente nos exercícios?', true,
      '[{"label":"Sim","value":"sim"},{"label":"Não","value":"nao"},{"label":"Apenas em alguns exercícios","value":"alguns"}]'::jsonb, 2),
    (v_form_id, v_s1, 'textarea', 'Quais exercícios está tendo dificuldade em progredir carga?', true, NULL, 3),
    (v_form_id, v_s1, 'textarea', 'Alguma dificuldade com o treino?', true, NULL, 4),
    (v_form_id, v_s1, 'textarea', 'Alguma dor na execução de algum exercício? Se sim, onde sente esse desconforto?', true, NULL, 5),
    (v_form_id, v_s1, 'textarea', 'Se tivesse algo na rotina de treinamento que pudesse alterar, o que seria e por quê?', true, NULL, 6),
    (v_form_id, v_s1, 'textarea', 'Alguma observação que gostaria de acrescentar?', true, NULL, 7);

  -- Seção 2: Alimentação
  INSERT INTO atualizacao_form_campos (form_id, secao_id, tipo, label, obrigatorio, ordem) VALUES
    (v_form_id, v_s2, 'textarea', 'Alguma dificuldade com a dieta?', true, 1),
    (v_form_id, v_s2, 'textarea', 'Gostaria de tirar algo da dieta que esteja difícil ingerir?', true, 2),
    (v_form_id, v_s2, 'textarea', 'Gostaria de incluir algum alimento na dieta que sinta vontade?', true, 3),
    (v_form_id, v_s2, 'textarea', 'Gostaria de trocar algum alimento na dieta?', true, 4),
    (v_form_id, v_s2, 'textarea', 'Qual ou quais refeições podemos reduzir ou acrescentar calorias caso seja necessário em sua atualização?', true, 5),
    (v_form_id, v_s2, 'textarea', 'Como está sua digestibilidade?', true, 6),
    (v_form_id, v_s2, 'textarea', 'Alguma observação que gostaria de acrescentar?', true, 7);

  -- Seção 3: Aderência ao Protocolo
  INSERT INTO atualizacao_form_campos (form_id, secao_id, tipo, label, obrigatorio, config, ordem) VALUES
    (v_form_id, v_s3, 'number', 'Quanto seguiu o protocolo de treino?',   true, '{"min":0,"max":10}'::jsonb, 1),
    (v_form_id, v_s3, 'number', 'Quanto seguiu o protocolo de dieta?',    true, '{"min":0,"max":10}'::jsonb, 2),
    (v_form_id, v_s3, 'number', 'Quanto seguiu o protocolo hormonal?',    true, '{"min":0,"max":10}'::jsonb, 3),
    (v_form_id, v_s3, 'textarea', 'Caso não tenha seguido 100%, favor justificar a falta de aderência ao protocolo', true, NULL, 4);

END $$;
