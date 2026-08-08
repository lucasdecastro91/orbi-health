-- O relatório de IA (relatorio_ia) é escrito pra leitura do treinador — termos
-- técnicos, terceira pessoa. Não serve pra mandar direto pro aluno. Essa coluna
-- guarda só a mensagem já escrita em segunda pessoa, pronta pra virar feedback,
-- separada do relatório interno.
ALTER TABLE public.atualizacao_respostas
  ADD COLUMN mensagem_feedback text;
