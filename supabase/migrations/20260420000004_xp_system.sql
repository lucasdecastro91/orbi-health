-- ─────────────────────────────────────────────────────────────
-- xp_events: one row per XP grant
-- Sources: workout_complete | diet_day | checkin | streak_bonus
-- ─────────────────────────────────────────────────────────────

create table if not exists public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  source      text not null check (source in ('workout_complete','diet_day','checkin','streak_bonus','manual')),
  xp          int  not null default 0,
  ref_date    date not null,               -- the day this XP was earned (Brazil local)
  note        text,                        -- optional description
  created_at  timestamptz not null default now(),
  unique (student_id, source, ref_date)    -- one XP grant per source per day
);

alter table public.xp_events enable row level security;

-- Students read their own
create policy "student read own xp"
  on public.xp_events for select
  using (student_id = auth.uid());

-- Students insert their own (sources: workout_complete, diet_day, checkin)
create policy "student insert own xp"
  on public.xp_events for insert
  with check (student_id = auth.uid());

-- Trainers read all in their org + insert manual XP
create policy "trainer read org xp"
  on public.xp_events for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = xp_events.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  );

create policy "trainer insert org xp"
  on public.xp_events for insert
  with check (
    exists (
      select 1 from public.organization_members om
      where om.org_id = xp_events.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- xp_totals: materialized per-student total (updated by trigger)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.xp_totals (
  student_id  uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  total_xp    int  not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.xp_totals enable row level security;

-- All org members can read leaderboard
create policy "org members read xp_totals"
  on public.xp_totals for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = xp_totals.org_id
        and om.user_id = auth.uid()
    )
  );

-- Trigger: upsert xp_totals whenever xp_events changes
create or replace function public.sync_xp_total()
returns trigger language plpgsql security definer as $$
begin
  insert into public.xp_totals (student_id, org_id, total_xp, updated_at)
  select NEW.student_id, NEW.org_id, coalesce(sum(xp), 0), now()
  from public.xp_events
  where student_id = NEW.student_id and org_id = NEW.org_id
  on conflict (student_id) do update
    set total_xp   = excluded.total_xp,
        updated_at = excluded.updated_at;
  return NEW;
end;
$$;

create or replace trigger trg_sync_xp_total
  after insert or update on public.xp_events
  for each row execute function public.sync_xp_total();

-- Indexes
create index if not exists xp_events_student_date_idx on public.xp_events (student_id, ref_date desc);
create index if not exists xp_totals_org_rank_idx     on public.xp_totals (org_id, total_xp desc);
