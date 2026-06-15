-- =============================================================
-- Adiciona colunas nutricionais estendidas à tabela alimentos.
--
-- A tabela foi criada apenas com macros básicos. O modal de detalhes
-- e o formulário de cadastro já referenciam estas colunas, causando
-- falha silenciosa na query (retorna null) quando não existem.
-- =============================================================

ALTER TABLE public.alimentos
  ADD COLUMN IF NOT EXISTS gordura_saturada_g NUMERIC,
  ADD COLUMN IF NOT EXISTS gordura_poli_g     NUMERIC,
  ADD COLUMN IF NOT EXISTS gordura_mono_g     NUMERIC,
  ADD COLUMN IF NOT EXISTS gordura_trans_g    NUMERIC,
  ADD COLUMN IF NOT EXISTS colesterol_mg      NUMERIC,
  ADD COLUMN IF NOT EXISTS potassio_mg        NUMERIC,
  ADD COLUMN IF NOT EXISTS acucar_g           NUMERIC,
  ADD COLUMN IF NOT EXISTS vitamina_a_ug      NUMERIC,
  ADD COLUMN IF NOT EXISTS vitamina_c_mg      NUMERIC,
  ADD COLUMN IF NOT EXISTS calcio_mg          NUMERIC,
  ADD COLUMN IF NOT EXISTS ferro_mg           NUMERIC;
