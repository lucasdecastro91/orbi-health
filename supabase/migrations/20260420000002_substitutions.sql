-- ─────────────────────────────────────────────────────────────
-- substitution_groups: a named group of interchangeable foods
-- Each diet_meal_food can belong to one group (nullable FK)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.substitution_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.substitution_groups enable row level security;

create policy "org members read substitution_groups"
  on public.substitution_groups for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = substitution_groups.org_id
        and om.user_id = auth.uid()
    )
  );

create policy "trainer manage substitution_groups"
  on public.substitution_groups for all
  using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = substitution_groups.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.org_id = substitution_groups.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- substitution_foods: options inside a group
-- ─────────────────────────────────────────────────────────────

create table if not exists public.substitution_foods (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.substitution_groups(id) on delete cascade,
  alimento_id   uuid references public.alimentos(id) on delete set null,
  nome_custom   text,              -- fallback name if no alimentos link
  quantidade    numeric,
  unidade       text default 'g',
  order_index   int  not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.substitution_foods enable row level security;

create policy "org members read substitution_foods"
  on public.substitution_foods for select
  using (
    exists (
      select 1 from public.substitution_groups sg
      join public.organization_members om on om.org_id = sg.org_id
      where sg.id = substitution_foods.group_id
        and om.user_id = auth.uid()
    )
  );

create policy "trainer manage substitution_foods"
  on public.substitution_foods for all
  using (
    exists (
      select 1 from public.substitution_groups sg
      join public.organization_members om on om.org_id = sg.org_id
      where sg.id = substitution_foods.group_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  )
  with check (
    exists (
      select 1 from public.substitution_groups sg
      join public.organization_members om on om.org_id = sg.org_id
      where sg.id = substitution_foods.group_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Add substitution_group_id to diet_meal_foods
-- ─────────────────────────────────────────────────────────────

alter table public.diet_meal_foods
  add column if not exists substitution_group_id uuid
    references public.substitution_groups(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- daily_food_selections: which substitute a student chose today
-- ─────────────────────────────────────────────────────────────

create table if not exists public.daily_food_selections (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references auth.users(id) on delete cascade,
  diet_meal_food_id   uuid not null references public.diet_meal_foods(id) on delete cascade,
  substitution_food_id uuid not null references public.substitution_foods(id) on delete cascade,
  date                date not null,
  created_at          timestamptz not null default now(),
  unique (student_id, diet_meal_food_id, date)
);

alter table public.daily_food_selections enable row level security;

create policy "student own daily_food_selections"
  on public.daily_food_selections for all
  using  (student_id = auth.uid())
  with check (student_id = auth.uid());

create index if not exists daily_food_selections_student_date_idx
  on public.daily_food_selections (student_id, date);
