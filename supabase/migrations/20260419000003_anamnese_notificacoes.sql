-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260419000003 — Anamnese + Notificações + pg_cron lembretes
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Adiciona coluna data_proxima_atualizacao em alunos ─────────────
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS data_proxima_atualizacao DATE;

-- ── 2. Template de anamnese por organização ───────────────────────────
CREATE TABLE IF NOT EXISTS public.anamnese_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  perguntas   jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now()
);

-- ── 3. Respostas de anamnese por aluno ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anamneses (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                  uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Objetivo e perfil
  objetivo                text,
  nivel_atividade         text,
  frequencia_treino       integer,
  tempo_treino_minutos    integer,
  -- Saúde
  historico_lesoes        text,
  doencas                 text,
  medicamentos            text,
  suplementos             text,
  -- Alimentação
  restricoes_alimentares  text,
  -- Hábitos
  habitos_sono            text,
  nivel_estresse          text,
  hidratacao_diaria       text,
  -- Observações
  observacoes             text,
  -- Perguntas personalizadas do treinador
  respostas_extras        jsonb       DEFAULT '{}',
  -- Status
  pendente                boolean     DEFAULT false,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE (student_id, org_id)
);

-- ── 4. Notificações ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo     text        NOT NULL,
  mensagem   text,
  tipo       text        DEFAULT 'info',  -- 'info' | 'alerta' | 'checkin' | 'anamnese'
  lida       boolean     DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── 5. RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.anamnese_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamneses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes       ENABLE ROW LEVEL SECURITY;

-- anamnese_templates: dono da org faz tudo; membros (alunos) leem
CREATE POLICY "template_owner_all" ON public.anamnese_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = anamnese_templates.org_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "template_member_read" ON public.anamnese_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = anamnese_templates.org_id AND om.user_id = auth.uid()
    )
  );

-- anamneses: aluno gerencia a própria; treinador lê/atualiza de seus alunos
CREATE POLICY "anamnese_student_all" ON public.anamneses
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "anamnese_trainer_select" ON public.anamneses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id AND a.treinador_id = auth.uid()
    )
  );

CREATE POLICY "anamnese_trainer_update" ON public.anamneses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id AND a.treinador_id = auth.uid()
    )
  );

-- notificacoes: usuário lê/atualiza as próprias; qualquer autenticado insere
CREATE POLICY "notif_user_select" ON public.notificacoes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_user_update" ON public.notificacoes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notif_authenticated_insert" ON public.notificacoes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 6. Trigger: updated_at em anamneses ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_anamnese_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anamnese_updated_at ON public.anamneses;
CREATE TRIGGER trg_anamnese_updated_at
  BEFORE UPDATE ON public.anamneses
  FOR EACH ROW EXECUTE FUNCTION public.set_anamnese_updated_at();

-- ── 7. Função: verificar lembretes de check-in ────────────────────────
CREATE OR REPLACE FUNCTION public.verificar_lembretes_checkin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec  RECORD;
  dias integer;
BEGIN
  FOR rec IN
    SELECT a.user_id, a.org_id, a.data_proxima_atualizacao
    FROM public.alunos a
    WHERE a.ativo = true
      AND a.data_proxima_atualizacao IS NOT NULL
  LOOP
    dias := (rec.data_proxima_atualizacao - CURRENT_DATE)::integer;

    IF dias IN (0, 1, 2) THEN
      -- Evita duplicata: não insere se já existe notificação checkin hoje para este aluno
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.user_id  = rec.user_id
          AND n.tipo     = 'checkin'
          AND n.created_at >= CURRENT_DATE::timestamptz
          AND n.created_at <  (CURRENT_DATE + 1)::timestamptz
      ) THEN
        INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
        VALUES (
          rec.user_id,
          rec.org_id,
          CASE dias
            WHEN 0 THEN 'Hoje é dia do seu check-in!'
            WHEN 1 THEN 'Check-in amanhã'
            ELSE        'Check-in em 2 dias'
          END,
          CASE dias
            WHEN 0 THEN 'Clique para enviar seu check-in e registrar seu progresso.'
            WHEN 1 THEN 'Sua atualização é amanhã. Não esqueça de enviar seu check-in!'
            ELSE        'Sua atualização é em 2 dias. Prepare-se para enviar seu check-in!'
          END,
          'checkin'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ── 8. pg_cron: 8h todo dia ──────────────────────────────────────────
-- Requer extensão pg_cron habilitada no projeto Supabase (Dashboard > Extensions).
-- Se não estiver habilitada, este bloco retorna erro silencioso.
DO $$
BEGIN
  PERFORM cron.schedule(
    'verificar-checkins-pendentes',
    '0 8 * * *',
    'SELECT public.verificar_lembretes_checkin();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron não disponível: %', SQLERRM;
END;
$$;
