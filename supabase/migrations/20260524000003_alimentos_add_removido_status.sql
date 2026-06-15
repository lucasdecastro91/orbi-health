-- =============================================================
-- Fix: adiciona valor 'removido' ao CHECK constraint da coluna
-- status na tabela alimentos.
--
-- Necessário para o soft-delete: em vez de apagar a linha (o que
-- viola a FK diet_meal_foods_alimento_id_fkey quando o alimento
-- está em algum plano alimentar), marcamos status = 'removido'.
-- A query de listagem filtra status = 'aprovado', portanto o
-- alimento desaparece da UI sem quebrar planos existentes.
-- =============================================================

ALTER TABLE public.alimentos
  DROP CONSTRAINT IF EXISTS alimentos_status_check;

ALTER TABLE public.alimentos
  ADD CONSTRAINT alimentos_status_check
    CHECK (status IN ('aprovado', 'pendente', 'reprovado', 'removido'));
