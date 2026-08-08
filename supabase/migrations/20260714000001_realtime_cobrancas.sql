-- Checkout próprio (fase 1, Pix): a página pública /pagar/:id precisa saber em
-- tempo real quando o Asaas confirma o pagamento (via asaas-webhook atualizando
-- cobrancas.status), sem precisar de polling. Mesmo padrão já usado pra
-- active_timers (20260707000003_realtime_active_timers.sql).
alter publication supabase_realtime add table public.cobrancas;
