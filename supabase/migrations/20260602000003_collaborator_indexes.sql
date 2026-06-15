-- Índices para as funções de RLS de colaboradores não causarem lentidão

-- Índice composto principal: lookup por user_id + status + org_id
CREATE INDEX IF NOT EXISTS collaborators_user_status_org_idx
  ON public.collaborators (user_id, status, org_id);

-- Índice em alunos.org_id para joins rápidos nas funções is_collab_of_*
CREATE INDEX IF NOT EXISTS alunos_org_id_idx
  ON public.alunos (org_id);

-- Índice em alunos.user_id (provavelmente já existe, mas garante)
CREATE INDEX IF NOT EXISTS alunos_user_id_idx
  ON public.alunos (user_id);

-- Índice em planos_treino.aluno_id para is_collab_of_plano
CREATE INDEX IF NOT EXISTS planos_treino_aluno_id_idx
  ON public.planos_treino (aluno_id);
