-- notification_logs nunca existiu de verdade, apesar de já ser referenciada em
-- notify-scheduled/index.ts (dedup de handleUpdateReminder e log de auditoria de todos os
-- handlers) — os inserts/selects falhavam silenciosamente (erro não checado), então o dedup
-- de "já mandei essa notificação hoje?" sempre retornava vazio e disparava de novo.
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  tag text,
  delivered boolean not null default true,
  created_at timestamptz not null default now()
);

create index notification_logs_recipient_tag_idx on public.notification_logs (recipient_id, tag);

alter table public.notification_logs enable row level security;

-- Só a Edge Function (service_role, bypassa RLS) escreve; usuário pode ler os próprios logs.
create policy notification_logs_own_read on public.notification_logs
  for select using (recipient_id = auth.uid());
