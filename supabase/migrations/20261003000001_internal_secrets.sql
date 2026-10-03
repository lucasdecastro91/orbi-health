-- Segredos internos que só o próprio banco e as Edge Functions (service_role)
-- leem. Primeiro uso: token do testar-alerta, que é disparado pelo banco via
-- pg_net — o token nunca sai do Postgres. RLS ligado sem policies.
create table if not exists public.internal_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.internal_secrets enable row level security;
revoke all on public.internal_secrets from anon, authenticated;

insert into public.internal_secrets (name, value)
values ('testar_alerta_token', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;
