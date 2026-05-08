-- Adicionar flag de visualização na tabela de feedbacks
ALTER TABLE public.feedbacks_alunos 
ADD COLUMN visto_pelo_aluno boolean NOT NULL DEFAULT false;

-- Adicionar campos de atualização/visualização nos planos de treino
ALTER TABLE public.planos_treino 
ADD COLUMN atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
ADD COLUMN visto_pelo_aluno_em timestamp with time zone;

-- Adicionar campos de atualização/visualização nas dietas
ALTER TABLE public.dietas_pdf 
ADD COLUMN atualizada_em timestamp with time zone NOT NULL DEFAULT now(),
ADD COLUMN vista_pelo_aluno_em timestamp with time zone;

-- Criar índices para melhorar performance das queries
CREATE INDEX idx_feedbacks_visto ON public.feedbacks_alunos(aluno_id, visto_pelo_aluno);
CREATE INDEX idx_planos_atualizado ON public.planos_treino(aluno_id, atualizado_em);
CREATE INDEX idx_dietas_atualizada ON public.dietas_pdf(aluno_id, atualizada_em);