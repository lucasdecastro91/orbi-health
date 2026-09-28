-- ══════════════════════════════════════════════════════════════════════
-- Migration 20260921000001 — Cobrança "adiada": aluno escolhe Pix ou
-- parcela no próprio checkout, em vez do treinador fixar isso na hora de
-- gerar a cobrança.
--
--   • alunos.plano_id: vínculo de verdade com a tabela `plans` (a que tem
--     pix_value + installment_options — não confundir com `planos_produto`,
--     tabela morta de uma feature abandonada, sem uso em nenhum lugar do
--     código hoje, que fica intocada). Preenchido em StudentDetails.tsx
--     quando o treinador escolhe um Plano salvo pro aluno.
--   • cobrancas.plano_id: mesma tabela, mas na cobrança em si — pra
--     `get-cobranca-publica` saber quais opções (Pix/parcelas) oferecer
--     quando a cobrança ainda não tem `asaas_id` (ver abaixo).
--   • Não criamos um status novo: reaproveita status = 'PENDING' com
--     `asaas_id IS NULL` como sinal de "aguardando o aluno escolher a
--     forma de pagamento" — assim `alertar_cobrancas_vencendo()` (D-30/
--     D-15/D-7/vencida, treinador + aluno, já manda o link /pagar/:id)
--     continua funcionando sem nenhuma alteração nela.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS plano_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS plano_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;
