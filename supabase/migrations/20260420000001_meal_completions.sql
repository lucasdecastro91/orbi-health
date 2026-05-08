-- meal_completions: tracks which meals a student marked as done on a given date
-- "date" is stored as DATE in UTC-3 (Brazil) — the app computes local date before inserting

create table if not exists public.meal_completions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users(id) on delete cascade,
  meal_id     uuid not null references public.diet_meals(id) on delete cascade,
  date        date not null,                         -- local Brazil date (UTC-3)
  created_at  timestamptz not null default now(),
  unique (student_id, meal_id, date)
);

-- RLS
alter table public.meal_completions enable row level security;

-- Students can read/write only their own rows
create policy "student own completions"
  on public.meal_completions
  for all
  using  (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Index for fast daily lookups
create index if not exists meal_completions_student_date_idx
  on public.meal_completions (student_id, date);
