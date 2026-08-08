-- Checkout próprio só cobre Pix (fase 1) — a correção anterior
-- (20260714000002) trocou o link do lembrete de 7 dias pra /pagar/:id
-- incondicionalmente, o que quebraria cobranças de cartão/boleto (a página só
-- tem fluxo de Pix hoje, o aluno cairia numa tela "aguardando" sem forma de
-- pagar). Mesma correção já aplicada em asaas-create-charge/index.ts e nos
-- botões "Copiar link" do Financeiro.tsx: só usa /pagar/:id quando
-- forma_pagamento = 'PIX', senão mantém o invoice_url do Asaas.

CREATE OR REPLACE FUNCTION public.alertar_cobrancas_vencendo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN

  -- ── A. Marca OVERDUE cobranças vencidas que ainda estão PENDING ────────────
  UPDATE public.cobrancas
  SET status = 'OVERDUE'
  WHERE status = 'PENDING'
    AND data_vencimento < CURRENT_DATE;

  -- ── B. Notifica TREINADOR: 30 dias antes ───────────────────────────────────
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento,
           p.nome AS aluno_nome, al.id AS aluno_id
    FROM   public.cobrancas  c
    JOIN   public.alunos     al ON al.id  = c.aluno_id
    JOIN   public.profiles   p  ON p.id   = al.user_id
    WHERE  c.status = 'PENDING'
      AND  c.notificado_30d = false
      AND  c.data_vencimento = CURRENT_DATE + 30
  LOOP
    INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
    VALUES (rec.treinador_id, rec.org_id, rec.aluno_id, rec.aluno_nome,
      'Cobrança vence em 30 dias',
      'Cobrança de ' || rec.aluno_nome || ' — R$ '
        || TO_CHAR(rec.valor, 'FM999G990D00')
        || ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
      'financeiro');
    UPDATE public.cobrancas SET notificado_30d = true WHERE id = rec.id;
  END LOOP;

  -- ── C. Notifica TREINADOR: 15 dias antes ───────────────────────────────────
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento,
           p.nome AS aluno_nome, al.id AS aluno_id
    FROM   public.cobrancas  c
    JOIN   public.alunos     al ON al.id  = c.aluno_id
    JOIN   public.profiles   p  ON p.id   = al.user_id
    WHERE  c.status = 'PENDING'
      AND  c.notificado_15d = false
      AND  c.data_vencimento = CURRENT_DATE + 15
  LOOP
    INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
    VALUES (rec.treinador_id, rec.org_id, rec.aluno_id, rec.aluno_nome,
      'Cobrança vence em 15 dias',
      'Cobrança de ' || rec.aluno_nome || ' — R$ '
        || TO_CHAR(rec.valor, 'FM999G990D00')
        || ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
      'financeiro');
    UPDATE public.cobrancas SET notificado_15d = true WHERE id = rec.id;
  END LOOP;

  -- ── D. Notifica TREINADOR + ALUNO: 7 dias antes ────────────────────────────
  -- Evento 3 (aluno): "Seu plano vence em breve"
  -- Evento 6 (treinador): "Cobrança vencendo"
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento,
           c.descricao, c.invoice_url, c.forma_pagamento,
           c.notificado_7d, c.aluno_notificado_7d,
           p.nome AS aluno_nome, al.id AS aluno_id, al.user_id AS aluno_user_id
    FROM   public.cobrancas  c
    JOIN   public.alunos     al ON al.id  = c.aluno_id
    JOIN   public.profiles   p  ON p.id   = al.user_id
    WHERE  c.status = 'PENDING'
      AND  (c.notificado_7d = false OR c.aluno_notificado_7d = false)
      AND  c.data_vencimento = CURRENT_DATE + 7
  LOOP
    -- Treinador (evento 6)
    IF NOT rec.notificado_7d THEN
      INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
      VALUES (rec.treinador_id, rec.org_id, rec.aluno_id, rec.aluno_nome,
        'Cobrança vencendo',
        'Cobrança de ' || rec.aluno_nome
          || ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
        'financeiro');
      UPDATE public.cobrancas SET notificado_7d = true WHERE id = rec.id;
    END IF;
    -- Aluno (evento 3)
    IF NOT rec.aluno_notificado_7d THEN
      INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo, link)
      VALUES (rec.aluno_user_id, rec.org_id,
        'Seu plano vence em breve',
        rec.descricao
          || ' vence em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY')
          || ' — clique para renovar',
        'financeiro',
        CASE WHEN rec.forma_pagamento = 'PIX'
             THEN 'https://app.orbihealth.com.br/pagar/' || rec.id
             ELSE rec.invoice_url
        END);
      UPDATE public.cobrancas SET aluno_notificado_7d = true WHERE id = rec.id;
    END IF;
  END LOOP;

  -- ── E. Notifica TREINADOR + ALUNO: cobrança vencida (OVERDUE) ─────────────
  -- Evento 4 (aluno): "Plano vencido"
  -- Evento 7 (treinador): "Cobrança vencida"
  FOR rec IN
    SELECT c.id, c.treinador_id, c.org_id, c.valor, c.data_vencimento,
           c.descricao,
           c.trainer_notificado_vencida, c.aluno_notificado_vencida,
           p.nome AS aluno_nome, al.id AS aluno_id, al.user_id AS aluno_user_id
    FROM   public.cobrancas  c
    JOIN   public.alunos     al ON al.id  = c.aluno_id
    JOIN   public.profiles   p  ON p.id   = al.user_id
    WHERE  c.status = 'OVERDUE'
      AND  (c.trainer_notificado_vencida = false OR c.aluno_notificado_vencida = false)
  LOOP
    -- Treinador (evento 7)
    IF NOT rec.trainer_notificado_vencida THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes
        WHERE user_id = rec.treinador_id
          AND aluno_id = rec.aluno_id
          AND tipo = 'financeiro'
          AND titulo = 'Cobrança vencida'
          AND created_at > NOW() - INTERVAL '1 hour'
      ) THEN
        INSERT INTO public.notificacoes (user_id, org_id, aluno_id, aluno_nome, titulo, mensagem, tipo)
        VALUES (rec.treinador_id, rec.org_id, rec.aluno_id, rec.aluno_nome,
          'Cobrança vencida',
          'Cobrança de ' || rec.aluno_nome
            || ' venceu em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
          'financeiro');
      END IF;
      UPDATE public.cobrancas SET trainer_notificado_vencida = true WHERE id = rec.id;
    END IF;
    -- Aluno (evento 4)
    IF NOT rec.aluno_notificado_vencida THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes
        WHERE user_id = rec.aluno_user_id
          AND tipo = 'financeiro'
          AND titulo = 'Plano vencido'
          AND created_at > NOW() - INTERVAL '1 hour'
      ) THEN
        INSERT INTO public.notificacoes (user_id, org_id, titulo, mensagem, tipo)
        VALUES (rec.aluno_user_id, rec.org_id,
          'Plano vencido',
          'Seu plano ' || rec.descricao
            || ' venceu em ' || TO_CHAR(rec.data_vencimento, 'DD/MM/YYYY'),
          'financeiro');
      END IF;
      UPDATE public.cobrancas SET aluno_notificado_vencida = true WHERE id = rec.id;
    END IF;
  END LOOP;

END;
$$;
