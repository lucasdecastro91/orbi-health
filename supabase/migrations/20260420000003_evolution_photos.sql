-- evolution_photos: one row per student per upload date per slot
-- slots: front | side_left | side_right | back | free

create table if not exists public.evolution_photos (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  slot        text not null check (slot in ('front','side_left','side_right','back','free')),
  storage_path text not null,          -- path inside the bucket, e.g. "org-id/student-id/2026-04-20_front.jpg"
  taken_at    date not null,           -- Brazil local date chosen by student
  created_at  timestamptz not null default now()
);

alter table public.evolution_photos enable row level security;

-- Student can manage their own photos
create policy "student own photos"
  on public.evolution_photos for all
  using  (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Trainer can read photos of students in their org
create policy "trainer read org photos"
  on public.evolution_photos for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = evolution_photos.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'trainer')
    )
  );

-- Indexes
create index if not exists evolution_photos_student_idx on public.evolution_photos (student_id, taken_at desc);
create index if not exists evolution_photos_org_student_idx on public.evolution_photos (org_id, student_id, taken_at desc);
