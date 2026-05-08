-- Adiciona coluna de séries detalhadas à tabela exercicios
ALTER TABLE exercicios ADD COLUMN IF NOT EXISTS series_detalhadas jsonb;

COMMENT ON COLUMN exercicios.series_detalhadas IS
  'Array opcional de séries detalhadas. Quando presente, substitui series/repeticoes padrão na interface do aluno.';
