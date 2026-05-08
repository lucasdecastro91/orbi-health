-- 1. Adicionar campo de formulário de atualização na tabela alunos
ALTER TABLE public.alunos 
ADD COLUMN IF NOT EXISTS form_atualizacao_url TEXT;

-- 2. Criar tabela de modelos de treino (templates)
CREATE TABLE IF NOT EXISTS public.modelos_treino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treinador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome_modelo TEXT NOT NULL,
  objetivo TEXT,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Criar tabela de blocos de semanas para modelos
CREATE TABLE IF NOT EXISTS public.modelos_semanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id UUID NOT NULL REFERENCES public.modelos_treino(id) ON DELETE CASCADE,
  semana_inicio INTEGER NOT NULL,
  semana_fim INTEGER NOT NULL,
  zona_reps TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Criar tabela de treinos para modelos
CREATE TABLE IF NOT EXISTS public.modelos_treinos_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_semana_id UUID NOT NULL REFERENCES public.modelos_semanas(id) ON DELETE CASCADE,
  titulo_treino TEXT NOT NULL,
  dia_semana TEXT NOT NULL,
  descricao_geral TEXT,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Criar tabela de exercícios para modelos
CREATE TABLE IF NOT EXISTS public.modelos_exercicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_treino_dia_id UUID NOT NULL REFERENCES public.modelos_treinos_dia(id) ON DELETE CASCADE,
  exercicio_base_id UUID REFERENCES public.exercicios_base(id) ON DELETE SET NULL,
  nome_exercicio TEXT NOT NULL,
  series TEXT NOT NULL,
  repeticoes TEXT NOT NULL,
  descanso TEXT,
  observacoes TEXT,
  video_url TEXT,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Adicionar campos de categoria e músculos na tabela exercicios_base
ALTER TABLE public.exercicios_base 
ADD COLUMN IF NOT EXISTS categoria TEXT,
ADD COLUMN IF NOT EXISTS musculos_principais TEXT,
ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- 7. Habilitar RLS nas novas tabelas
ALTER TABLE public.modelos_treino ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos_semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos_treinos_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos_exercicios ENABLE ROW LEVEL SECURITY;

-- 8. Criar políticas RLS para modelos_treino
CREATE POLICY "Treinadores podem gerenciar seus modelos"
ON public.modelos_treino
FOR ALL
USING (treinador_id = auth.uid() AND is_treinador(auth.uid()));

-- 9. Criar políticas RLS para modelos_semanas
CREATE POLICY "Treinadores podem gerenciar semanas de seus modelos"
ON public.modelos_semanas
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.modelos_treino mt
    WHERE mt.id = modelos_semanas.modelo_id
    AND mt.treinador_id = auth.uid()
  )
);

-- 10. Criar políticas RLS para modelos_treinos_dia
CREATE POLICY "Treinadores podem gerenciar treinos de seus modelos"
ON public.modelos_treinos_dia
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.modelos_semanas ms
    JOIN public.modelos_treino mt ON mt.id = ms.modelo_id
    WHERE ms.id = modelos_treinos_dia.modelo_semana_id
    AND mt.treinador_id = auth.uid()
  )
);

-- 11. Criar políticas RLS para modelos_exercicios
CREATE POLICY "Treinadores podem gerenciar exercícios de seus modelos"
ON public.modelos_exercicios
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.modelos_treinos_dia mtd
    JOIN public.modelos_semanas ms ON ms.id = mtd.modelo_semana_id
    JOIN public.modelos_treino mt ON mt.id = ms.modelo_id
    WHERE mtd.id = modelos_exercicios.modelo_treino_dia_id
    AND mt.treinador_id = auth.uid()
  )
);