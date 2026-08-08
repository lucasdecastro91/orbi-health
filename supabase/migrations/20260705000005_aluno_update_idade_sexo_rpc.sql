-- Alunos não têm política de UPDATE na tabela `alunos` (só treinador/org staff),
-- e não queremos abrir UPDATE geral pro próprio aluno (poderia alterar treinador_id,
-- ativo, org_id etc). Esta função só permite escrever idade/sexo do próprio registro.
CREATE OR REPLACE FUNCTION public.update_own_idade_sexo(p_idade INTEGER, p_sexo TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.alunos
  SET idade = p_idade, sexo = p_sexo
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_own_idade_sexo(INTEGER, TEXT) TO authenticated;
