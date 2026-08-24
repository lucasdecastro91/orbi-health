-- Optional note attached to a lead's follow-up flag (leads.follow_up_at,
-- migration 20260817000001) — the "why" behind the follow-up reminder.
alter table public.leads
  add column follow_up_note text;
