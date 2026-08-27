-- Subcontas Asaas por organização (treinador) — Fluxo A passa a nascer na
-- subconta do treinador, com split automático pra carteira master da ORBI.
-- api_key nunca é exposta ao client: RLS habilitado sem nenhuma policy,
-- só service_role (Edge Functions) bypassa e lê/escreve.

create table public.asaas_subaccounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  asaas_account_id text not null,
  wallet_id text not null,
  api_key text not null,
  status text not null default 'pending', -- pending | em_analise | aprovado | rejeitado
  onboarding_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asaas_subaccounts enable row level security;

-- Nenhuma policy criada de propósito — bloqueia client (anon/authenticated)
-- por completo. Edge Functions usam service_role, que ignora RLS.

create index idx_asaas_subaccounts_org_id on public.asaas_subaccounts(org_id);
