-- ─────────────────────────────────────────────────────────────────────────────
-- Slots configuráveis de fotos de evolução por org
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabela de slots customizáveis por org
CREATE TABLE IF NOT EXISTS public.evolution_photo_slots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,
  slot_key   TEXT        NOT NULL,   -- valor usado na coluna "slot" de evolution_photos
  ordem      INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evo_slots_org ON public.evolution_photo_slots (org_id, ordem);

ALTER TABLE public.evolution_photo_slots ENABLE ROW LEVEL SECURITY;

-- Treinador/owner gerencia os slots da sua org
CREATE POLICY "org owner manage evo_slots"
  ON public.evolution_photo_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = evolution_photo_slots.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'trainer')
    )
  );

-- Membros (alunos) leem
CREATE POLICY "org member read evo_slots"
  ON public.evolution_photo_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = evolution_photo_slots.org_id
        AND om.user_id = auth.uid()
    )
  );

-- 2. Se a tabela evolution_photos existir, cria-a com slot TEXT livre.
--    Se já existir, remove o CHECK constraint fixo para permitir slots personalizados.
--    Dados existentes continuam 100% válidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evolution_photos'
  ) THEN
    -- Tabela não existe: cria já sem o CHECK constraint restritivo
    CREATE TABLE public.evolution_photos (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      slot         TEXT        NOT NULL,   -- sem check constraint: aceita valores customizados
      storage_path TEXT        NOT NULL,
      taken_at     DATE        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE public.evolution_photos ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "student own photos"
      ON public.evolution_photos FOR ALL
      USING  (student_id = auth.uid())
      WITH CHECK (student_id = auth.uid());

    CREATE POLICY "trainer read org photos"
      ON public.evolution_photos FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.org_id = evolution_photos.org_id
            AND om.user_id = auth.uid()
            AND om.role IN ('owner', 'trainer')
        )
      );

    CREATE INDEX IF NOT EXISTS evolution_photos_student_idx
      ON public.evolution_photos (student_id, taken_at DESC);
    CREATE INDEX IF NOT EXISTS evolution_photos_org_student_idx
      ON public.evolution_photos (org_id, student_id, taken_at DESC);

    -- Unique constraint necessário para o upsert
    ALTER TABLE public.evolution_photos
      ADD CONSTRAINT evolution_photos_student_org_slot_date_key
      UNIQUE (student_id, org_id, slot, taken_at);

  ELSE
    -- Tabela já existe: apenas remove o CHECK constraint se ainda existir
    ALTER TABLE public.evolution_photos
      DROP CONSTRAINT IF EXISTS evolution_photos_slot_check;
  END IF;
END $$;
