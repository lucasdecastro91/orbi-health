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

-- ── Teto: registro próprio de cartão gerado ─────────────────────────────────
-- O teto NÃO pode confiar em `cobrancas`: o treinador edita/apaga as próprias
-- linhas via RLS, o "Cancelar" do ORBI não cancela no Asaas, e cobrança adiada
-- tem created_at de quando foi criada, não de quando virou cartão. Aqui fica
-- um claim por cobrança de cartão no momento em que ela nasce no Asaas.
-- RLS ligado sem policies: só service_role (Edge Functions) lê/escreve.
create table if not exists public.card_charge_claims (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  valor      numeric not null check (valor > 0),
  created_at timestamptz not null default now()
);
create index if not exists card_charge_claims_org_created
  on public.card_charge_claims (org_id, created_at);
alter table public.card_charge_claims enable row level security;

-- Reserva volume de cartão de forma atômica: trava por org (pedidos em
-- paralelo esperam um ao outro), soma os claims dos últimos 30 dias e só grava
-- se couber no teto. Retorna o id do claim, ou null se passar do teto.
-- p_cap null = sem teto (grava mesmo assim, pro histórico).
-- Exatamente no teto é permitido.
create or replace function public.claim_card_volume(p_org_id uuid, p_valor numeric, p_cap numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used numeric;
  v_id   uuid;
begin
  perform pg_advisory_xact_lock(hashtext('card_cap:' || p_org_id::text));
  select coalesce(sum(valor), 0) into v_used
    from public.card_charge_claims
   where org_id = p_org_id and created_at >= now() - interval '30 days';
  if p_cap is not null and v_used + p_valor > p_cap then
    return null;
  end if;
  insert into public.card_charge_claims (org_id, valor) values (p_org_id, p_valor)
  returning id into v_id;
  return v_id;
end;
$$;

-- Volume de cartão gerado nos últimos 30 dias (pra exibir no modal).
create or replace function public.card_claims_30d(p_org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(valor), 0)
    from public.card_charge_claims
   where org_id = p_org_id and created_at >= now() - interval '30 days';
$$;

-- ── Alerta: volume de cartão PAGO nos últimos 30 dias ──────────────────────
-- Só alimenta o e-mail de alerta (não bloqueia nada), então pode ler cobrancas.
-- Usa cobrancas.valor (total da cobrança), então parcelado conta inteiro.
create or replace function public.card_paid_volume_30d(p_org_id uuid)
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
     and c.status in ('RECEIVED', 'CONFIRMED')
     and c.data_pagamento >= ((now() at time zone 'America/Sao_Paulo')::date - 30);
$$;

revoke all on function public.claim_card_volume(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.card_claims_30d(uuid) from public, anon, authenticated;
revoke all on function public.card_paid_volume_30d(uuid) from public, anon, authenticated;
grant execute on function public.claim_card_volume(uuid, numeric, numeric) to service_role;
grant execute on function public.card_claims_30d(uuid) to service_role;
grant execute on function public.card_paid_volume_30d(uuid) to service_role;
