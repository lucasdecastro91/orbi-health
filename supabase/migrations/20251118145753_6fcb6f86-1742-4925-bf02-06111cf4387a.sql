-- 1. Adicionar coluna de data de última atualização na tabela alunos
ALTER TABLE public.alunos 
ADD COLUMN form_atualizacao_ultima_data DATE;

-- 2. Criar tabela de feedbacks
CREATE TABLE public.feedbacks_alunos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  treinador_id UUID NOT NULL,
  titulo TEXT,
  mensagem TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS na tabela de feedbacks
ALTER TABLE public.feedbacks_alunos ENABLE ROW LEVEL SECURITY;

-- RLS: Treinador pode criar e ver feedbacks dos seus alunos
CREATE POLICY "Treinadores podem gerenciar feedbacks de seus alunos"
ON public.feedbacks_alunos
FOR ALL
USING (
  EXISTS (
    SELECT 1 
    FROM public.alunos a 
    WHERE a.id = feedbacks_alunos.aluno_id 
      AND a.treinador_id = auth.uid()
  )
);

-- RLS: Aluno pode ver seus próprios feedbacks
CREATE POLICY "Alunos podem ver seus feedbacks"
ON public.feedbacks_alunos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.alunos a 
    WHERE a.id = feedbacks_alunos.aluno_id 
      AND a.user_id = auth.uid()
  )
);

-- Criar índice para melhor performance
CREATE INDEX idx_feedbacks_aluno_id ON public.feedbacks_alunos(aluno_id);
CREATE INDEX idx_feedbacks_created_at ON public.feedbacks_alunos(created_at DESC);