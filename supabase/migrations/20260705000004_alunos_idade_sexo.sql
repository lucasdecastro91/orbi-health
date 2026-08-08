-- Idade e sexo do aluno, usados no cálculo de kcal do cardio (fórmula de Keytel)
-- Preenchidos uma única vez (ex: direto na aba Cardio) para alunos que não passaram pela anamnese
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS idade INTEGER,
  ADD COLUMN IF NOT EXISTS sexo  TEXT;
