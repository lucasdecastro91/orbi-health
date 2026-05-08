-- ============================================================
-- Migration 19: Corrige handle_new_user
--
-- Bugs corrigidos:
-- 1. COALESCE com tipo incompatível ('aluno' text vs app_role enum)
--    → cast explícito: 'aluno'::public.app_role
-- 2. Exceção na criação da org revertia o INSERT do profile
--    → org creation isolada em BEGIN...EXCEPTION block
-- 3. slugify retornava strings inválidas para nomes curtos/especiais
--    → lógica de fallback robustecida
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       public.app_role;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_counter    INTEGER := 0;
  v_org_id     UUID;
BEGIN

  -- ── 1. Determina o papel ─────────────────────────────────────
  -- Cast explícito no fallback evita erro de tipo no COALESCE.
  v_role := COALESCE(
    (new.raw_user_meta_data->>'tipo_usuario')::public.app_role,
    'aluno'::public.app_role
  );

  -- ── 2. Cria perfil (caminho crítico — SEMPRE executa) ────────
  INSERT INTO public.profiles (id, nome, tipo_usuario)
  VALUES (
    new.id,
    COALESCE(NULLIF(trim(new.raw_user_meta_data->>'nome'), ''), 'Usuário'),
    (v_role::text)::public.user_type
  );

  -- ── 3. Registra role (caminho crítico) ───────────────────────
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, v_role);

  -- ── 4. Cria organização para treinadores ─────────────────────
  -- Isolada em bloco de exceção: falha aqui NÃO reverte o profile.
  IF v_role = 'treinador'::public.app_role THEN
    BEGIN

      -- Slug: usa valor do metadata se válido, senão gera do nome
      v_base_slug :=
        CASE
          WHEN new.raw_user_meta_data->>'slug' IS NOT NULL
               AND length(trim(new.raw_user_meta_data->>'slug')) >= 3
          THEN lower(trim(new.raw_user_meta_data->>'slug'))
          ELSE public.slugify(
                 COALESCE(
                   NULLIF(trim(new.raw_user_meta_data->>'nome'), ''),
                   'treinador'
                 )
               )
        END;

      -- Garante que o slug base é seguro (fallback se vazio)
      IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'perfil-' || substr(new.id::text, 1, 8);
      END IF;

      v_slug := v_base_slug;

      -- Unicidade: adiciona sufixo numérico se necessário
      LOOP
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.organizations WHERE slug = v_slug
        );
        v_counter := v_counter + 1;
        v_slug    := v_base_slug || '-' || v_counter;
      END LOOP;

      -- Cria a organização
      INSERT INTO public.organizations (name, slug, owner_id, theme, primary_color)
      VALUES (
        COALESCE(
          NULLIF(trim(new.raw_user_meta_data->>'org_name'), ''),
          NULLIF(trim(new.raw_user_meta_data->>'nome'), ''),
          'Minha Academia'
        ),
        v_slug,
        new.id,
        COALESCE(NULLIF(new.raw_user_meta_data->>'theme', ''), 'dark'),
        COALESCE(NULLIF(new.raw_user_meta_data->>'primary_color', ''), '#e8941a')
      )
      RETURNING id INTO v_org_id;

      -- Adiciona como owner em organization_members
      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES (v_org_id, new.id, 'owner');

    EXCEPTION WHEN OTHERS THEN
      -- Log do erro sem falhar o trigger — profile já foi criado acima
      RAISE WARNING 'handle_new_user: falha ao criar org para user % — %: %',
        new.id, SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN new;
END;
$$;
