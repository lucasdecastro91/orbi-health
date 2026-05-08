-- Criar tipo enum para tipo de usuário
CREATE TYPE public.user_type AS ENUM ('treinador', 'aluno');

-- Criar tabela de perfis (estende auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo_usuario public.user_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies para profiles
CREATE POLICY "Usuários podem ver seu próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Treinadores podem ver perfis de alunos"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tipo_usuario = 'treinador'
    )
  );

-- Criar tabela de alunos
CREATE TABLE public.alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  treinador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alunos podem ver seus próprios dados"
  ON public.alunos FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Treinadores podem ver seus alunos"
  ON public.alunos FOR SELECT
  USING (treinador_id = auth.uid());

CREATE POLICY "Treinadores podem criar alunos"
  ON public.alunos FOR INSERT
  WITH CHECK (treinador_id = auth.uid());

CREATE POLICY "Treinadores podem atualizar seus alunos"
  ON public.alunos FOR UPDATE
  USING (treinador_id = auth.uid());

CREATE POLICY "Treinadores podem deletar seus alunos"
  ON public.alunos FOR DELETE
  USING (treinador_id = auth.uid());

-- Criar tabela de planos de treino
CREATE TABLE public.planos_treino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  nome_plano TEXT NOT NULL,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.planos_treino ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alunos podem ver seus planos"
  ON public.planos_treino FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Treinadores podem gerenciar planos de seus alunos"
  ON public.planos_treino FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id AND a.treinador_id = auth.uid()
    )
  );

-- Criar tabela de semanas
CREATE TABLE public.semanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id UUID NOT NULL REFERENCES public.planos_treino(id) ON DELETE CASCADE,
  numero_semana INTEGER NOT NULL,
  foco_semana TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plano_id, numero_semana)
);

ALTER TABLE public.semanas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver semanas do plano"
  ON public.semanas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.planos_treino pt
      JOIN public.alunos a ON a.id = pt.aluno_id
      WHERE pt.id = plano_id AND (a.user_id = auth.uid() OR a.treinador_id = auth.uid())
    )
  );

CREATE POLICY "Treinadores podem gerenciar semanas"
  ON public.semanas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.planos_treino pt
      JOIN public.alunos a ON a.id = pt.aluno_id
      WHERE pt.id = plano_id AND a.treinador_id = auth.uid()
    )
  );

-- Criar tabela de treinos
CREATE TABLE public.treinos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id UUID NOT NULL REFERENCES public.semanas(id) ON DELETE CASCADE,
  dia_semana TEXT NOT NULL,
  titulo_treino TEXT NOT NULL,
  descricao_geral TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.treinos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver treinos"
  ON public.treinos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semanas s
      JOIN public.planos_treino pt ON pt.id = s.plano_id
      JOIN public.alunos a ON a.id = pt.aluno_id
      WHERE s.id = semana_id AND (a.user_id = auth.uid() OR a.treinador_id = auth.uid())
    )
  );

CREATE POLICY "Treinadores podem gerenciar treinos"
  ON public.treinos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.semanas s
      JOIN public.planos_treino pt ON pt.id = s.plano_id
      JOIN public.alunos a ON a.id = pt.aluno_id
      WHERE s.id = semana_id AND a.treinador_id = auth.uid()
    )
  );

-- Criar tabela de exercícios
CREATE TABLE public.exercicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treino_id UUID NOT NULL REFERENCES public.treinos(id) ON DELETE CASCADE,
  nome_exercicio TEXT NOT NULL,
  series TEXT NOT NULL,
  repeticoes TEXT NOT NULL,
  descanso TEXT,
  observacoes TEXT,
  video_url TEXT,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exercicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver exercícios"
  ON public.exercicios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.treinos t
      JOIN public.semanas s ON s.id = t.semana_id
      JOIN public.planos_treino pt ON pt.id = s.plano_id
      JOIN public.alunos a ON a.id = pt.aluno_id
      WHERE t.id = treino_id AND (a.user_id = auth.uid() OR a.treinador_id = auth.uid())
    )
  );

CREATE POLICY "Treinadores podem gerenciar exercícios"
  ON public.exercicios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.treinos t
      JOIN public.semanas s ON s.id = t.semana_id
      JOIN public.planos_treino pt ON pt.id = s.plano_id
      JOIN public.alunos a ON a.id = pt.aluno_id
      WHERE t.id = treino_id AND a.treinador_id = auth.uid()
    )
  );

-- Criar tabela de treinos concluídos
CREATE TABLE public.treinos_concluidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treino_id UUID NOT NULL REFERENCES public.treinos(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  data_conclusao TIMESTAMPTZ DEFAULT NOW(),
  comentario TEXT
);

ALTER TABLE public.treinos_concluidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alunos podem ver e criar conclusões"
  ON public.treinos_concluidos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Treinadores podem ver conclusões de seus alunos"
  ON public.treinos_concluidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id AND a.treinador_id = auth.uid()
    )
  );

-- Criar tabela de dietas PDF
CREATE TABLE public.dietas_pdf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aluno_id)
);

ALTER TABLE public.dietas_pdf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alunos podem ver sua dieta"
  ON public.dietas_pdf FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Treinadores podem gerenciar dietas"
  ON public.dietas_pdf FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id AND a.treinador_id = auth.uid()
    )
  );

-- Trigger para criar perfil automaticamente ao criar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, tipo_usuario)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', 'Usuário'),
    COALESCE((new.raw_user_meta_data->>'tipo_usuario')::public.user_type, 'aluno')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();