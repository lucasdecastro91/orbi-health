-- ================================================================
-- Sistema de Notificações — logs, frases motivacionais, preferências
-- ================================================================

-- 1. Preferências de notificação por aluno
CREATE TABLE IF NOT EXISTS notification_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,

  -- Toggles por tipo
  meals_enabled         boolean DEFAULT true,
  hydration_enabled     boolean DEFAULT true,
  workout_enabled       boolean DEFAULT true,
  motivational_enabled  boolean DEFAULT true,
  trainer_actions_enabled boolean DEFAULT true,

  -- Horários configuráveis
  workout_time          time DEFAULT '07:00',       -- horário do treino
  motivational_time     time DEFAULT '08:00',       -- horário da motivacional diária

  -- Não perturbar
  dnd_enabled       boolean DEFAULT false,
  dnd_start         time DEFAULT '22:00',
  dnd_end           time DEFAULT '07:00',

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  UNIQUE(user_id, org_id)
);

-- 2. Log de notificações enviadas
CREATE TABLE IF NOT EXISTS notification_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id) ON DELETE SET NULL,
  recipient_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- null = sistema
  notification_type text NOT NULL,    -- 'meal', 'hydration', 'workout', 'motivational', 'trainer_action', 'manual'
  title           text NOT NULL,
  body            text NOT NULL,
  icon            text,
  url             text,
  tag             text,
  delivered       boolean DEFAULT false,
  opened          boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_logs_recipient_idx ON notification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS notification_logs_org_idx ON notification_logs(org_id);
CREATE INDEX IF NOT EXISTS notification_logs_created_idx ON notification_logs(created_at DESC);

-- 3. Frases motivacionais
CREATE TABLE IF NOT EXISTS motivational_phrases (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- null = global
  phrase    text NOT NULL,
  active    boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Frases globais padrão (org_id null = disponível para todos)
INSERT INTO motivational_phrases (phrase, org_id) VALUES
  ('💪 Cada treino te deixa mais próximo dos seus objetivos. Continue!', null),
  ('🔥 Hoje é mais um dia para superar seus limites.', null),
  ('🌟 Consistência é o segredo de quem transforma o corpo.', null),
  ('🏋️ Dor de hoje, resultado de amanhã. Vá treinar!', null),
  ('🎯 Foco no objetivo. Cada rep conta.', null),
  ('🚀 Seu futuro eu vai te agradecer por não desistir hoje.', null),
  ('💡 O progresso começa quando você começa. Hoje é o dia!', null),
  ('⚡ Não existe atalho. Existe treino, dieta e consistência.', null),
  ('🌅 Novo dia, nova oportunidade de ser melhor que ontem.', null),
  ('🏆 Campeões são feitos nas horas em que ninguém está olhando.', null),
  ('🔑 A disciplina é a ponte entre seus objetivos e seus resultados.', null),
  ('💎 Transformação não acontece da noite para o dia, mas acontece.', null),
  ('🌊 Cada treino é um passo na direção certa. Continue nadando!', null),
  ('🦁 Acorde faminto. Durma satisfeito. Repita.', null),
  ('✨ Seu único limite é você mesmo. Quebre-o hoje!', null),
  ('🎯 Dieta + treino + descanso = resultado. Não negligencie nenhum.', null),
  ('💪 Não treine para parecer bom. Treine para ser bom.', null),
  ('🔥 A motivação te inicia. O hábito te mantém. A disciplina te leva ao topo.', null),
  ('🌱 Cada gota de suor é um investimento no seu futuro.', null),
  ('⭐ Você é mais forte do que pensa. Prove isso hoje!', null)
ON CONFLICT DO NOTHING;

-- 4. Hidratação — meta e registros diários
CREATE TABLE IF NOT EXISTS hydration_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  log_date    date NOT NULL DEFAULT CURRENT_DATE,
  glasses     int NOT NULL DEFAULT 0,      -- copos de 250ml tomados
  goal_glasses int NOT NULL DEFAULT 8,     -- meta do dia (padrão 8 = 2L)
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, log_date)
);

-- 5. RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivational_phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hydration_logs ENABLE ROW LEVEL SECURITY;

-- Aluno vê/edita próprias preferências
CREATE POLICY "own_notif_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Aluno vê próprios logs
CREATE POLICY "own_notif_logs" ON notification_logs
  FOR SELECT USING (recipient_id = auth.uid());

-- Treinador vê logs da sua org
CREATE POLICY "trainer_notif_logs" ON notification_logs
  FOR ALL USING (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
  );

-- Frases globais: todos leem
CREATE POLICY "read_motivational" ON motivational_phrases
  FOR SELECT USING (org_id IS NULL OR org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Treinador gerencia frases da sua org
CREATE POLICY "trainer_motivational" ON motivational_phrases
  FOR ALL USING (
    org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
  );

-- Aluno gerencia própria hidratação
CREATE POLICY "own_hydration" ON hydration_logs
  FOR ALL USING (user_id = auth.uid());

-- Service role bypass
CREATE POLICY "sr_notif_prefs" ON notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "sr_notif_logs" ON notification_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "sr_motivational" ON motivational_phrases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "sr_hydration" ON hydration_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_notif_pref_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_notif_pref_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_notif_pref_updated_at();

CREATE OR REPLACE FUNCTION update_hydration_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_hydration_updated_at
  BEFORE UPDATE ON hydration_logs
  FOR EACH ROW EXECUTE FUNCTION update_hydration_updated_at();
