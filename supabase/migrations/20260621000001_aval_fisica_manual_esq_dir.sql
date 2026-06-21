-- Migration 20260621000001
-- Adiciona dinamometria manual esquerdo e direito em avaliacoes_fisicas

ALTER TABLE public.avaliacoes_fisicas
  ADD COLUMN IF NOT EXISTS dinamometria_manual_esq integer,
  ADD COLUMN IF NOT EXISTS dinamometria_manual_dir integer;
