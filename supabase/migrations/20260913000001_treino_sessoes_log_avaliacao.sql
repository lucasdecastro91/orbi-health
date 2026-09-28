-- Avaliação (1-5 estrelas) + comentário livre que o aluno deixa ao concluir o
-- treino — abre junto com o botão "Concluir treino"/"Marcar treino como
-- concluído" (ExerciseDetail.tsx modo ?seq=1, e Treinos.tsx). O comentário
-- entra na notificação que o treinador já recebe (treino_sessoes_log é a
-- tabela de conclusão real, ver Treinos.tsx.markComplete / trainingCompletion.ts).
ALTER TABLE public.treino_sessoes_log
  ADD COLUMN IF NOT EXISTS avaliacao SMALLINT CHECK (avaliacao BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS comentario TEXT;
