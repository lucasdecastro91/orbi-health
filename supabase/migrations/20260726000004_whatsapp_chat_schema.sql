-- Telefone como campo de primeira classe no aluno (fonte única de verdade pra
-- casar número do WhatsApp -> aluno). Nullable: alunos migrados de outra
-- plataforma não terão isso preenchido de cara.
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS telefone text;

-- Histórico de conversa por WhatsApp — vinculado a um aluno OU a um lead
-- (nunca os dois, nunca nenhum), pra suportar o CRM de leads também.
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aluno_id      uuid REFERENCES public.alunos(id) ON DELETE CASCADE,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  direction     text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content       text NOT NULL,
  wa_message_id text,
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_one_recipient CHECK (
    (aluno_id IS NOT NULL AND lead_id IS NULL) OR (aluno_id IS NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_aluno_idx ON public.whatsapp_messages (aluno_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_messages_lead_idx ON public.whatsapp_messages (lead_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx ON public.whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org member le mensagens da propria org"
  ON public.whatsapp_messages FOR SELECT
  USING (is_org_member(org_id));

-- Realtime pra tela de chat atualizar sozinha quando o aluno/lead responde
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
