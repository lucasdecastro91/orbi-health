-- Create security definer function to check if user is a trainer
CREATE OR REPLACE FUNCTION public.is_treinador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND tipo_usuario = 'treinador'
  )
$$;

-- Create security definer function to check if user is their student
CREATE OR REPLACE FUNCTION public.is_my_student(_student_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alunos
    WHERE user_id = _student_user_id
      AND treinador_id = auth.uid()
  )
$$;

-- Drop existing alunos policies
DROP POLICY IF EXISTS "Alunos podem ver seus próprios dados" ON public.alunos;
DROP POLICY IF EXISTS "Treinadores podem atualizar seus alunos" ON public.alunos;
DROP POLICY IF EXISTS "Treinadores podem criar alunos" ON public.alunos;
DROP POLICY IF EXISTS "Treinadores podem deletar seus alunos" ON public.alunos;
DROP POLICY IF EXISTS "Treinadores podem ver seus alunos" ON public.alunos;

-- Create new alunos policies using security definer functions
CREATE POLICY "Trainers can insert students"
ON public.alunos
FOR INSERT
TO authenticated
WITH CHECK (public.is_treinador(auth.uid()) AND treinador_id = auth.uid());

CREATE POLICY "Trainers can select their students"
ON public.alunos
FOR SELECT
TO authenticated
USING (public.is_treinador(auth.uid()) AND treinador_id = auth.uid());

CREATE POLICY "Students can select their own data"
ON public.alunos
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Trainers can update their students"
ON public.alunos
FOR UPDATE
TO authenticated
USING (public.is_treinador(auth.uid()) AND treinador_id = auth.uid());

CREATE POLICY "Trainers can delete their students"
ON public.alunos
FOR DELETE
TO authenticated
USING (public.is_treinador(auth.uid()) AND treinador_id = auth.uid());

-- Add policy for trainers to see their students' profiles
CREATE POLICY "Trainers can view their students profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_my_student(id));