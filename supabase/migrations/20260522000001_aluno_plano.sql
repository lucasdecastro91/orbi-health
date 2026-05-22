-- ─────────────────────────────────────────────────────────────────────────────
-- aluno_plano: campos de plano contratado no aluno + link em notificacoes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Campos de plano atual no aluno (data_expiracao_plano já existe)
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS plano_nome        text,
  ADD COLUMN IF NOT EXISTS plano_inicio      date,
  ADD COLUMN IF NOT EXISTS plano_valor_pago  numeric(10,2),
  ADD COLUMN IF NOT EXISTS plano_cobranca_id uuid REFERENCES public.cobrancas(id) ON DELETE SET NULL;

-- 2. Link clicável em notificações (ex: invoice_url da cobrança)
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS link text;

-- 3. RLS: aluno pode ler seu próprio registro em alunos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'alunos'
      AND policyname = 'aluno reads own record'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "aluno reads own record"
        ON public.alunos FOR SELECT
        USING (user_id = auth.uid())
    $pol$;
  END IF;
END $$;
