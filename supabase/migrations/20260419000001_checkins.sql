-- =============================================================
-- Migration: Tabela check_ins (check-in nativo do aluno)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.check_ins (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem fez o check-in (auth user do aluno)
  student_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Treinador e org para contexto e RLS
  treinador_id     UUID        REFERENCES auth.users(id),
  org_id           UUID        REFERENCES public.organizations(id),

  -- Etapa 1: Peso e fotos
  weight           NUMERIC,
  fotos            TEXT[],           -- URLs do Supabase Storage

  -- Etapa 2: Treino
  treino_avaliacao INT CHECK (treino_avaliacao BETWEEN 1 AND 5),
  treino_obs       TEXT,

  -- Etapa 3: Alimentação
  dieta_avaliacao  INT CHECK (dieta_avaliacao BETWEEN 1 AND 5),
  dieta_obs        TEXT,

  -- Etapa 4: Aderência / observações gerais
  aderencia        INT CHECK (aderencia BETWEEN 1 AND 5),
  obs_geral        TEXT,

  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS check_ins_student_id_idx    ON public.check_ins(student_id);
CREATE INDEX IF NOT EXISTS check_ins_treinador_id_idx  ON public.check_ins(treinador_id);
CREATE INDEX IF NOT EXISTS check_ins_created_at_idx    ON public.check_ins(created_at DESC);

-- RLS
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

-- Aluno vê apenas seus próprios check-ins
CREATE POLICY "checkins_student_select" ON public.check_ins
  FOR SELECT USING (student_id = auth.uid());

-- Aluno pode inserir seus próprios check-ins
CREATE POLICY "checkins_student_insert" ON public.check_ins
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Treinador vê check-ins dos seus alunos
CREATE POLICY "checkins_trainer_select" ON public.check_ins
  FOR SELECT USING (
    treinador_id = auth.uid()
  );

-- Storage bucket para fotos de check-in
-- (executar manualmente no dashboard se não existir)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('checkins', 'checkins', false)
-- ON CONFLICT (id) DO NOTHING;
