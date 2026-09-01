-- Guarda o número de parcelas de uma cobrança em cartão. Sem isso, o valor
-- ia pro Asaas via installmentCount mas se perdia — a tela pública de
-- checkout (/pagar/:id) não tinha como saber que era parcelado, só mostrava
-- o valor total, sem "Nx de R$Y" (achado ao vivo, 2026-08-31).
ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS installment_count integer NOT NULL DEFAULT 1;
