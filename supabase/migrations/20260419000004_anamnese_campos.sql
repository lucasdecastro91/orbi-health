-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260419000004 — Novos campos na tabela anamneses
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.anamneses
  -- Etapa 1 — Dados pessoais
  ADD COLUMN IF NOT EXISTS nome_completo          text,
  ADD COLUMN IF NOT EXISTS idade                  integer,
  ADD COLUMN IF NOT EXISTS altura                 text,
  ADD COLUMN IF NOT EXISTS peso_atual             numeric,
  ADD COLUMN IF NOT EXISTS whatsapp               text,
  ADD COLUMN IF NOT EXISTS sexo                   text,
  -- Etapa 2 — Objetivo e atividade física
  ADD COLUMN IF NOT EXISTS pratica_atividade      text,
  ADD COLUMN IF NOT EXISTS tempo_pratica          text,
  ADD COLUMN IF NOT EXISTS frequencia_treino_opcao text,
  ADD COLUMN IF NOT EXISTS tempo_por_sessao       text,
  -- Etapa 3 — Saúde
  ADD COLUMN IF NOT EXISTS condicoes_saude        jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS lesoes_cirurgias       text,
  ADD COLUMN IF NOT EXISTS desconforto_dor        text,
  -- Etapa 4 — Alimentação
  ADD COLUMN IF NOT EXISTS qualidade_alimentacao  text,
  ADD COLUMN IF NOT EXISTS alcool                 text,
  -- Etapa 5 — Hábitos
  ADD COLUMN IF NOT EXISTS sono                   text,
  ADD COLUMN IF NOT EXISTS estresse               text;

-- Nota: as colunas antigas (nivel_atividade, frequencia_treino int,
-- tempo_treino_minutos, historico_lesoes, doencas, habitos_sono,
-- nivel_estresse, hidratacao_diaria) são mantidas para compatibilidade.
