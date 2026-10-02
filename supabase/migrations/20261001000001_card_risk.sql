-- Teto/reserva de cartão para contas novas da Carteira (spec 2026-10-01).
-- Só adiciona colunas nullable + 1 função; não altera dado existente além do
-- backfill de aprovado_em (só subcontas já aprovadas, hoje só a Orbi Demo).

alter table public.asaas_subaccounts
  add column if not exists aprovado_em timestamptz,
  add column if not exists limite_cartao_30d numeric;

comment on column public.asaas_subaccounts.aprovado_em is
  'Quando o Asaas aprovou a subconta (webhook ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED). Início dos 90 dias de conta nova.';
comment on column public.asaas_subaccounts.limite_cartao_30d is
  'Override manual (reais) do teto de cartão em 30 dias. null = regra padrão (R$ 5.000 nos 90 dias de conta nova).';

update public.asaas_subaccounts
   set aprovado_em = created_at
 where status = 'aprovado' and aprovado_em is null;

-- Volume de cobranças de cartão da org nos últimos 30 dias corridos.
-- p_paid=false: geradas (teto) — conta o que foi criado no Asaas, pago ou não.
-- p_paid=true: pagas (alerta).
-- Usa cobrancas.valor (total da cobrança), então parcelado conta inteiro.
create or replace function public.card_volume_30d(p_org_id uuid, p_paid boolean default false)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.valor), 0)
    from public.cobrancas c
   where c.org_id = p_org_id
     and c.forma_pagamento = 'CREDIT_CARD'
     and c.asaas_id is not null
     and case
           when p_paid then c.status in ('RECEIVED', 'CONFIRMED')
                        and c.data_pagamento >= ((now() at time zone 'America/Sao_Paulo')::date - 30)
           else c.status not in ('CANCELLED', 'REFUNDED')
                and c.created_at >= now() - interval '30 days'
         end;
$$;

revoke all on function public.card_volume_30d(uuid, boolean) from public, anon, authenticated;
grant execute on function public.card_volume_30d(uuid, boolean) to service_role;
