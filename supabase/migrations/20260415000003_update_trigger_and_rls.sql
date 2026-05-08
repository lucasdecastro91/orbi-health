-- ============================================================
-- Migration 18: Atualiza handle_new_user + RLS org-based
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Atualiza o trigger handle_new_user
--    Quando um TREINADOR se cadastra, cria automaticamente:
--      - organization (com slug derivado do nome ou passado explicitamente)
--      - organization_members com role = 'owner'
--    Alunos não criam org (são adicionados pela migration 17 trigger)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role    public.app_role;
  base_slug    TEXT;
  final_slug   TEXT;
  counter      INTEGER := 0;
  new_org_id   UUID;
BEGIN
  -- Determina o papel do usuário (default: aluno)
  user_role := COALESCE(
    (new.raw_user_meta_data->>'tipo_usuario')::public.app_role,
    'aluno'
  );

  -- Cria o perfil
  INSERT INTO public.profiles (id, nome, tipo_usuario)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', 'Usuário'),
    (user_role::text)::public.user_type
  );

  -- Registra na tabela de roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, user_role);

  -- Se for treinador: cria organização automaticamente
  IF user_role = 'treinador' THEN

    -- Slug: usa valor explícito do metadata ou gera a partir do nome
    IF new.raw_user_meta_data->>'slug' IS NOT NULL
       AND length(trim(new.raw_user_meta_data->>'slug')) >= 3 THEN
      base_slug := trim(new.raw_user_meta_data->>'slug');
    ELSE
      base_slug := public.slugify(
        COALESCE(new.raw_user_meta_data->>'nome', 'treinador')
      );
    END IF;

    final_slug := base_slug;

    -- Garante unicidade do slug (acrescenta sufixo numérico se necessário)
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = final_slug) LOOP
      counter    := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;

    -- Cria a organização
    INSERT INTO public.organizations (
      name,
      slug,
      owner_id,
      theme,
      primary_color
    )
    VALUES (
      COALESCE(new.raw_user_meta_data->>'org_name', new.raw_user_meta_data->>'nome', 'Minha Academia'),
      final_slug,
      new.id,
      COALESCE(new.raw_user_meta_data->>'theme', 'dark'),
      COALESCE(new.raw_user_meta_data->>'primary_color', '#e8941a')
    )
    RETURNING id INTO new_org_id;

    -- Adiciona o treinador como dono na tabela de membros
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (new_org_id, new.id, 'owner');

  END IF;

  RETURN new;
END;
$$;

-- ----------------------------------------------------------------
-- 2. Novas RLS policies em alunos baseadas em org_id
--    (complementam as existentes por treinador_id — ambas coexistem)
-- ----------------------------------------------------------------

-- Dono da org pode ver todos os alunos dela
CREATE POLICY "org_owner_select_alunos"
ON public.alunos FOR SELECT
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.is_org_owner(org_id)
);

-- Dono da org pode atualizar alunos dela
CREATE POLICY "org_owner_update_alunos"
ON public.alunos FOR UPDATE
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.is_org_owner(org_id)
);

-- Dono da org pode deletar alunos dela
CREATE POLICY "org_owner_delete_alunos"
ON public.alunos FOR DELETE
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.is_org_owner(org_id)
);

-- ----------------------------------------------------------------
-- 3. Políticas org-based em exercicios_base
--    Membros da org podem ler a biblioteca completa da org
--    (ex: quando houver múltiplos trainers na mesma org no futuro)
-- ----------------------------------------------------------------
CREATE POLICY "org_members_view_exercises"
ON public.exercicios_base FOR SELECT
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.is_org_member(org_id)
);

-- ----------------------------------------------------------------
-- 4. Políticas org-based em modelos_treino
-- ----------------------------------------------------------------
CREATE POLICY "org_members_view_templates"
ON public.modelos_treino FOR SELECT
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.is_org_member(org_id)
);

-- ----------------------------------------------------------------
-- 5. Trigger updated_at em organizations
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_organizations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_organizations_updated_at();
