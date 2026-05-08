-- push_subscriptions: one row per browser/device that subscribed
-- endpoint + keys are the Web Push subscription object from the browser

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,   -- public key
  auth_key    text not null,   -- auth secret
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Users manage their own subscriptions
create policy "user own subscriptions"
  on public.push_subscriptions for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trainers can read subscriptions of students in their org
-- (needed by Edge Function running with user context)
create policy "trainer read org subscriptions"
  on public.push_subscriptions for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = push_subscriptions.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  );

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_org_idx  on public.push_subscriptions (org_id);
