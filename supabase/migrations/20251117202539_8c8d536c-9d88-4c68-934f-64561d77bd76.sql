-- Fix privilege escalation: Create separate user_roles table
-- Step 1: Create app_role enum
CREATE TYPE public.app_role AS ENUM ('treinador', 'aluno');

-- Step 2: Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Step 3: Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 4: Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Step 5: Migrate existing data from profiles.tipo_usuario to user_roles
-- Convert user_type enum to app_role enum via text
INSERT INTO public.user_roles (user_id, role)
SELECT id, (tipo_usuario::text)::public.app_role
FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 6: Add RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Step 7: Only allow system (service role) to insert/update/delete roles
-- No INSERT, UPDATE, or DELETE policies for authenticated users

-- Step 8: Update is_treinador function to use user_roles
CREATE OR REPLACE FUNCTION public.is_treinador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'treinador')
$$;

-- Step 9: Create is_aluno function for consistency
CREATE OR REPLACE FUNCTION public.is_aluno(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'aluno')
$$;

-- Step 10: Update profiles RLS to prevent tipo_usuario updates
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;

CREATE POLICY "Users can update their own profile name only"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id 
  AND tipo_usuario = (SELECT tipo_usuario FROM public.profiles WHERE id = auth.uid())
);

-- Step 11: Update handle_new_user trigger function to use user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
BEGIN
  -- Get role from metadata, default to 'aluno'
  user_role := COALESCE((new.raw_user_meta_data->>'tipo_usuario')::public.app_role, 'aluno');
  
  -- Insert into profiles
  INSERT INTO public.profiles (id, nome, tipo_usuario)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', 'Usuário'),
    (user_role::text)::public.user_type
  );
  
  -- Insert into user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, user_role);
  
  RETURN new;
END;
$$;