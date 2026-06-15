-- ─────────────────────────────────────────────────────────────────────────────
-- CRM de Leads + Agendamento de Calls
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. leads ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
  treinador_id  uuid        NOT NULL REFERENCES auth.users(id)            ON DELETE CASCADE,
  nome          text        NOT NULL,
  whatsapp      text,
  instagram     text,
  origem        text        NOT NULL DEFAULT 'outro',   -- indicacao | instagram | tiktok | outro
  objetivo      text,
  status        text        NOT NULL DEFAULT 'novo',    -- novo | contato_feito | call_agendada | proposta_enviada | fechado | perdido
  aluno_id      uuid        REFERENCES public.alunos(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_org_idx       ON public.leads (org_id);
CREATE INDEX IF NOT EXISTS leads_treinador_idx ON public.leads (treinador_id);
CREATE INDEX IF NOT EXISTS leads_status_idx    ON public.leads (status);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages own leads"
  ON public.leads FOR ALL
  USING  (treinador_id = auth.uid())
  WITH CHECK (treinador_id = auth.uid());

-- ── 2. lead_interactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nota       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_interactions_lead_idx ON public.lead_interactions (lead_id);

ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages own lead interactions"
  ON public.lead_interactions FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.treinador_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.treinador_id = auth.uid()));

-- ── 3. lead_calls ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_calls (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  treinador_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_hora       timestamptz NOT NULL,
  observacoes     text,
  status          text        NOT NULL DEFAULT 'agendada',  -- agendada | realizada | perdida | cancelada
  whatsapp_sent   boolean     NOT NULL DEFAULT false,       -- flag para futura integração WA API
  msg_confirmacao text,
  msg_lembrete    text,
  notificado_2h   boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_calls_lead_idx      ON public.lead_calls (lead_id);
CREATE INDEX IF NOT EXISTS lead_calls_data_hora_idx ON public.lead_calls (data_hora);
CREATE INDEX IF NOT EXISTS lead_calls_status_idx    ON public.lead_calls (status);

ALTER TABLE public.lead_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages own lead calls"
  ON public.lead_calls FOR ALL
  USING  (treinador_id = auth.uid())
  WITH CHECK (treinador_id = auth.uid());

-- ── 4. whatsapp_templates (editável por org) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tipo       text        NOT NULL,   -- confirmacao | lembrete
  template   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, tipo)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer manages own org templates"
  ON public.whatsapp_templates FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.org_id = whatsapp_templates.org_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.org_id = whatsapp_templates.org_id AND m.user_id = auth.uid()));

-- ── 5. Auto-update updated_at on leads ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leads_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_set_updated_at();

-- ── 6. Notification: calls 2h before ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notificar_calls_proximas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN
  -- Mark overdue calls (scheduled start > 2h ago) as perdida
  UPDATE public.lead_calls
  SET status = 'perdida'
  WHERE status = 'agendada'
    AND data_hora < now() - INTERVAL '2 hours';

  -- Notify trainer 2h before upcoming calls (window ±15min around the 2h mark)
  FOR rec IN
    SELECT lc.id, lc.treinador_id, lc.org_id, lc.data_hora, l.nome AS lead_nome
    FROM   public.lead_calls lc
    JOIN   public.leads l ON l.id = lc.lead_id
    WHERE  lc.status = 'agendada'
      AND  lc.notificado_2h = false
      AND  lc.data_hora BETWEEN now() + INTERVAL '1 hour 45 minutes'
                            AND now() + INTERVAL '2 hours 15 minutes'
  LOOP
    INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
    VALUES (
      rec.treinador_id,
      rec.org_id,
      'Call em 2h: ' || rec.lead_nome,
      'Você tem uma call com ' || rec.lead_nome || ' às ' ||
        TO_CHAR(rec.data_hora AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || '.',
      'alerta'
    );
    UPDATE public.lead_calls SET notificado_2h = true WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ── 7. Schedule pg_cron — runs every 15 minutes ──────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('notificar-calls-proximas')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificar-calls-proximas');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'notificar-calls-proximas',
  '*/15 * * * *',
  'SELECT public.notificar_calls_proximas()'
);
