-- Adicionar campos para transformar semanas em blocos de semanas
ALTER TABLE public.semanas 
ADD COLUMN semana_inicio integer,
ADD COLUMN semana_fim integer,
ADD COLUMN zona_reps text;

-- Renomear foco_semana para observacoes para ficar mais claro
ALTER TABLE public.semanas 
RENAME COLUMN foco_semana TO observacoes;

-- Atualizar dados existentes para manter compatibilidade
UPDATE public.semanas 
SET semana_inicio = numero_semana,
    semana_fim = numero_semana
WHERE semana_inicio IS NULL;