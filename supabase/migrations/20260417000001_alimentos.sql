-- =============================================================
-- Migration: Tabela alimentos + refatoração diet_meal_foods
-- =============================================================

-- 1. Tabela alimentos (banco de dados nutricionais)
CREATE TABLE IF NOT EXISTS public.alimentos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT        NOT NULL,
  porcao_descricao TEXT,                     -- ex: "100g", "1 unidade média"
  porcao_gramas  NUMERIC,                    -- peso base para cálculo proporcional
  kcal           NUMERIC,
  proteina_g     NUMERIC,
  carb_g         NUMERIC,
  gordura_g      NUMERIC,
  fibra_g        NUMERIC,
  sodio_mg       NUMERIC,
  fonte          TEXT        DEFAULT 'taco', -- 'taco' | 'global' | 'org'
  org_id         UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  status         TEXT        DEFAULT 'aprovado'
                             CHECK (status IN ('aprovado', 'pendente', 'reprovado')),
  criado_por     UUID        REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Índice full-text para busca em português
CREATE INDEX IF NOT EXISTS alimentos_nome_fts_idx
  ON public.alimentos USING gin(to_tsvector('portuguese', nome));

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS alimentos_status_idx ON public.alimentos(status);
CREATE INDEX IF NOT EXISTS alimentos_org_id_idx ON public.alimentos(org_id);

-- Índice LIKE para busca por nome (ilike)
CREATE INDEX IF NOT EXISTS alimentos_nome_lower_idx ON public.alimentos (lower(nome));

-- Unique: alimentos globais (org_id NULL) não podem ter nome duplicado
CREATE UNIQUE INDEX IF NOT EXISTS alimentos_nome_global_unique
  ON public.alimentos (nome) WHERE org_id IS NULL;

-- Unique: alimentos de org não podem ter nome duplicado dentro da mesma org
CREATE UNIQUE INDEX IF NOT EXISTS alimentos_nome_org_unique
  ON public.alimentos (nome, org_id) WHERE org_id IS NOT NULL;

-- 2. RLS
ALTER TABLE public.alimentos ENABLE ROW LEVEL SECURITY;

-- Alimentos globais aprovados: qualquer autenticado pode ver
CREATE POLICY "alimentos_globais_select" ON public.alimentos
  FOR SELECT USING (org_id IS NULL AND status = 'aprovado');

-- Membros de org veem alimentos da própria org (incluindo pendentes)
CREATE POLICY "alimentos_org_select" ON public.alimentos
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Membros de org podem inserir alimentos para sua org
CREATE POLICY "alimentos_org_insert" ON public.alimentos
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Superadmin pode ver tudo (para revisão)
CREATE POLICY "alimentos_superadmin_select" ON public.alimentos
  FOR SELECT USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'lucas.melo1991@gmail.com'
  );

-- Superadmin pode atualizar qualquer alimento (aprovar/reprovar/tornar global)
CREATE POLICY "alimentos_superadmin_update" ON public.alimentos
  FOR UPDATE USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'lucas.melo1991@gmail.com'
  );

-- 3. Remove tabelas antigas de substituição (cascade remove FKs)
DROP TABLE IF EXISTS public.substitution_foods CASCADE;
DROP TABLE IF EXISTS public.substitution_groups CASCADE;

-- 4. Atualiza diet_meal_foods — remove coluna substituição, adiciona referência ao banco
ALTER TABLE public.diet_meal_foods
  DROP COLUMN IF EXISTS substitution_group_id,
  ADD COLUMN IF NOT EXISTS alimento_id UUID REFERENCES public.alimentos(id),
  ADD COLUMN IF NOT EXISTS quantidade  NUMERIC,
  ADD COLUMN IF NOT EXISTS unidade     TEXT DEFAULT 'g';
