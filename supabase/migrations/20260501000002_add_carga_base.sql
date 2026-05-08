-- Adiciona carga base de referência para cálculo automático das séries detalhadas
ALTER TABLE exercicios ADD COLUMN IF NOT EXISTS carga_base text;

COMMENT ON COLUMN exercicios.carga_base IS
  'Carga base de referência definida pelo treinador. Usada para cálculo automático das séries detalhadas (warm-up, feeder, drop-set, etc.).';
