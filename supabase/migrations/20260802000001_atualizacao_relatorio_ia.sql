-- Relatório de IA para respostas de Atualização (substitui o Check-in, seção 15 do CLAUDE.md).
-- Mesmas duas colunas que já existem em check_ins (relatorio_ia, relatorio_gerado_em),
-- sem relatorio_visualizado: lá esse campo nunca era lido por nenhuma tela, então não
-- replicamos a coluna morta aqui.
ALTER TABLE public.atualizacao_respostas
  ADD COLUMN relatorio_ia text,
  ADD COLUMN relatorio_gerado_em timestamptz;
