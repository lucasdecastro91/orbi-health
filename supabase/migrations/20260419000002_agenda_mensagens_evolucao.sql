-- =============================================================
-- Migration: Agenda, Mensagens, Evolução + colunas IA no check-in
-- =============================================================

-- ── 1. Agendamentos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        REFERENCES public.organizations(id),
  treinador_id     UUID        REFERENCES auth.users(id),
  aluno_id         UUID        REFERENCES auth.users(id),
  titulo           TEXT        NOT NULL,
  descricao        TEXT,
  data_hora        TIMESTAMPTZ NOT NULL,
  duracao_minutos  INTEGER     DEFAULT 60,
  tipo             TEXT        DEFAULT 'consulta'
                               CHECK (tipo IN ('consulta','avaliacao','retorno')),
  status           TEXT        DEFAULT 'agendado'
                               CHECK (status IN ('agendado','concluido','cancelado')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agendamentos_treinador_idx ON public.agendamentos(treinador_id);
CREATE INDEX IF NOT EXISTS agendamentos_aluno_idx     ON public.agendamentos(aluno_id);
CREATE INDEX IF NOT EXISTS agendamentos_data_idx      ON public.agendamentos(data_hora);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agendamentos_trainer_all" ON public.agendamentos
  FOR ALL USING (treinador_id = auth.uid());

CREATE POLICY "agendamentos_student_select" ON public.agendamentos
  FOR SELECT USING (aluno_id = auth.uid());

-- ── 2. Mensagens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mensagens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        REFERENCES public.organizations(id),
  remetente_id     UUID        NOT NULL REFERENCES auth.users(id),
  destinatario_id  UUID        NOT NULL REFERENCES auth.users(id),
  conteudo         TEXT        NOT NULL,
  lida             BOOLEAN     DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_remetente_idx      ON public.mensagens(remetente_id);
CREATE INDEX IF NOT EXISTS mensagens_destinatario_idx   ON public.mensagens(destinatario_id);
CREATE INDEX IF NOT EXISTS mensagens_created_at_idx     ON public.mensagens(created_at DESC);
CREATE INDEX IF NOT EXISTS mensagens_lida_dest_idx      ON public.mensagens(destinatario_id, lida);

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Remetente ou destinatário podem ler
CREATE POLICY "mensagens_select" ON public.mensagens
  FOR SELECT USING (
    remetente_id = auth.uid() OR destinatario_id = auth.uid()
  );

-- Apenas remetente insere (com seu próprio id)
CREATE POLICY "mensagens_insert" ON public.mensagens
  FOR INSERT WITH CHECK (remetente_id = auth.uid());

-- Destinatário pode marcar como lida
CREATE POLICY "mensagens_update_lida" ON public.mensagens
  FOR UPDATE USING (destinatario_id = auth.uid());

-- ── 3. Registros de evolução (peso) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.registros_evolucao (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           UUID        REFERENCES public.organizations(id),
  data_registro    DATE        NOT NULL,
  peso_kg          NUMERIC,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, data_registro)
);

CREATE INDEX IF NOT EXISTS evolucao_student_idx   ON public.registros_evolucao(student_id);
CREATE INDEX IF NOT EXISTS evolucao_data_idx      ON public.registros_evolucao(data_registro DESC);

ALTER TABLE public.registros_evolucao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evolucao_student_all" ON public.registros_evolucao
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "evolucao_trainer_select" ON public.registros_evolucao
  FOR SELECT USING (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );

-- Treinador pode inserir registros para seus alunos
CREATE POLICY "evolucao_trainer_insert" ON public.registros_evolucao
  FOR INSERT WITH CHECK (
    student_id IN (
      SELECT user_id FROM public.alunos WHERE treinador_id = auth.uid()
    )
  );

-- ── 4. Colunas de IA no check_ins ─────────────────────────────────
ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS relatorio_ia          TEXT,
  ADD COLUMN IF NOT EXISTS relatorio_gerado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS relatorio_visualizado BOOLEAN DEFAULT false;
