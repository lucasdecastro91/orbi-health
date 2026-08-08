-- ══════════════════════════════════════════════════════════════════════
-- DRAFT — integração WhatsApp (Evolution API), schema pra fase beta
-- AINDA NÃO APLICADO. Revisar antes de rodar (Supabase Dashboard ou MCP).
-- ══════════════════════════════════════════════════════════════════════

-- 1. Estado da conexão WhatsApp por organização
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS whatsapp_instance_name text UNIQUE,
  ADD COLUMN IF NOT EXISTS whatsapp_status text NOT NULL DEFAULT 'disconnected'
    CHECK (whatsapp_status IN ('disconnected', 'connecting', 'connected', 'banned')),
  ADD COLUMN IF NOT EXISTS whatsapp_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_last_disconnected_at timestamptz;

-- 2. Fila de envio — uma linha por mensagem individual, com scheduled_for
--    já carregando o jitter (staggering), pra não bater tudo no mesmo segundo
--    quando o cron dispara os lembretes de várias orgs ao mesmo tempo.
CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aluno_id       uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  message_type   text NOT NULL, -- 'lembrete_treino' | 'lembrete_dieta' | 'lembrete_hidratacao' | 'motivacional'
  telefone       text NOT NULL, -- resolvido no momento do enqueue (fonte: anamnese ou cadastro)
  payload        jsonb NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  scheduled_for  timestamptz NOT NULL,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_queue_pending_idx
  ON public.whatsapp_message_queue (scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

-- Só leitura pro cliente (ex: um painel de "envios recentes"). Quem grava
-- é sempre a Edge Function via service role, depois de montar o telefone
-- e o payload — mesmo padrão de agent_conversations.
CREATE POLICY "org member le a fila da propria org"
  ON public.whatsapp_message_queue FOR SELECT
  USING (is_org_member(org_id));

-- 3. Log de eventos de conexão — auditoria/debug de queda de sessão
--    (quando o celular do treinador desconecta, reconecta, ou é banido)
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type   text NOT NULL, -- 'connection.update' | 'qrcode.updated' | 'messages.upsert' etc.
  status       text,
  raw_payload  jsonb,
  received_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org owner le eventos de conexao da propria org"
  ON public.whatsapp_connection_events FOR SELECT
  USING (is_org_owner(org_id));

CREATE INDEX IF NOT EXISTS whatsapp_connection_events_org_idx
  ON public.whatsapp_connection_events (org_id, received_at DESC);
