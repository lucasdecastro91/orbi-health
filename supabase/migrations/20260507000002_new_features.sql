-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: planos_produto, suplementos, cardio_planos, alongamentos,
--            avaliacoes_posturais, avaliacao_fotos,
--            diets extra columns, alunos extra columns
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. planos_produto ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planos_produto (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  descricao     TEXT,
  duracao_dias  INTEGER,
  preco         NUMERIC(10,2),
  modalidade    TEXT        NOT NULL DEFAULT 'Treino + Dieta',
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.planos_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage planos_produto"
  ON public.planos_produto
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = planos_produto.org_id
        AND om.user_id = auth.uid()
    )
  );

-- ── 2. suplementos ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suplementos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id   UUID        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  org_id     UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  nome       TEXT        NOT NULL,
  dosagem    TEXT,
  instrucao  TEXT,
  ordem      INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suplementos ENABLE ROW LEVEL SECURITY;

-- Treinador pode gerenciar suplementos dos seus alunos
CREATE POLICY "trainer manages suplementos"
  ON public.suplementos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = suplementos.aluno_id
        AND a.treinador_id = auth.uid()
    )
  );

-- Aluno pode ler os seus próprios suplementos
CREATE POLICY "student reads own suplementos"
  ON public.suplementos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = suplementos.aluno_id
        AND a.user_id = auth.uid()
    )
  );

-- ── 3. cardio_planos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cardio_planos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id          UUID        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  org_id            UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  tipo              TEXT        NOT NULL DEFAULT 'Corrida',
  frequencia_semana INTEGER,
  duracao_minutos   INTEGER,
  bpm_alvo          TEXT,
  observacoes       TEXT,
  ativo             BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cardio_planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages cardio_planos"
  ON public.cardio_planos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = cardio_planos.aluno_id
        AND a.treinador_id = auth.uid()
    )
  );

CREATE POLICY "student reads own cardio_planos"
  ON public.cardio_planos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = cardio_planos.aluno_id
        AND a.user_id = auth.uid()
    )
  );

-- ── 4. alongamentos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alongamentos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id            UUID        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  org_id              UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  exercicio_base_id   UUID        REFERENCES public.exercicios_base(id) ON DELETE SET NULL,
  nome                TEXT        NOT NULL,
  video_url           TEXT,
  duracao_segundos    INTEGER     NOT NULL DEFAULT 30,
  series              INTEGER     NOT NULL DEFAULT 3,
  instrucoes          TEXT,
  ordem               INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alongamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages alongamentos"
  ON public.alongamentos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = alongamentos.aluno_id
        AND a.treinador_id = auth.uid()
    )
  );

CREATE POLICY "student reads own alongamentos"
  ON public.alongamentos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = alongamentos.aluno_id
        AND a.user_id = auth.uid()
    )
  );

-- ── 5. avaliacoes_posturais ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.avaliacoes_posturais (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aluno_id        UUID        REFERENCES public.alunos(id) ON DELETE SET NULL,
  org_id          UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'pendente',  -- pendente | concluida
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.avaliacoes_posturais ENABLE ROW LEVEL SECURITY;

-- Aluno pode criar e ler as próprias avaliações
CREATE POLICY "student manages own avaliacoes_posturais"
  ON public.avaliacoes_posturais
  FOR ALL
  USING (student_user_id = auth.uid());

-- Treinador pode ler/editar avaliações dos seus alunos (via org_id membership)
CREATE POLICY "trainer reads student avaliacoes_posturais"
  ON public.avaliacoes_posturais
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = avaliacoes_posturais.aluno_id
        AND a.treinador_id = auth.uid()
    )
  );

-- ── 6. avaliacao_fotos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.avaliacao_fotos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id  UUID        NOT NULL REFERENCES public.avaliacoes_posturais(id) ON DELETE CASCADE,
  test_key      TEXT        NOT NULL,
  photo_index   INTEGER     NOT NULL DEFAULT 0,
  storage_path  TEXT        NOT NULL,
  observacoes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.avaliacao_fotos ENABLE ROW LEVEL SECURITY;

-- Herda acesso via avaliacao_id → avaliacoes_posturais
CREATE POLICY "student manages own avaliacao_fotos"
  ON public.avaliacao_fotos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.avaliacoes_posturais ap
      WHERE ap.id = avaliacao_fotos.avaliacao_id
        AND ap.student_user_id = auth.uid()
    )
  );

CREATE POLICY "trainer reads student avaliacao_fotos"
  ON public.avaliacao_fotos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.avaliacoes_posturais ap
      JOIN public.alunos a ON a.id = ap.aluno_id
      WHERE ap.id = avaliacao_fotos.avaliacao_id
        AND a.treinador_id = auth.uid()
    )
  );

-- ── 7. diets — novos campos ───────────────────────────────────────────────────
ALTER TABLE public.diets
  ADD COLUMN IF NOT EXISTS dias_semana   TEXT[],
  ADD COLUMN IF NOT EXISTS observacoes   TEXT,
  ADD COLUMN IF NOT EXISTS refeicao_livre TEXT,
  ADD COLUMN IF NOT EXISTS info_adicional TEXT;

-- ── 8. alunos — novos campos ──────────────────────────────────────────────────
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS data_inicio          DATE,
  ADD COLUMN IF NOT EXISTS data_fim             DATE,
  ADD COLUMN IF NOT EXISTS anamnese_dispensada  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plano_produto_id     UUID REFERENCES public.planos_produto(id) ON DELETE SET NULL;

-- ── 9. Índices úteis ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_planos_produto_org        ON public.planos_produto(org_id);
CREATE INDEX IF NOT EXISTS idx_suplementos_aluno         ON public.suplementos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_cardio_planos_aluno       ON public.cardio_planos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_alongamentos_aluno        ON public.alongamentos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_posturais_user ON public.avaliacoes_posturais(student_user_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_posturais_aluno ON public.avaliacoes_posturais(aluno_id);
CREATE INDEX IF NOT EXISTS idx_avaliacao_fotos_aval      ON public.avaliacao_fotos(avaliacao_id);
