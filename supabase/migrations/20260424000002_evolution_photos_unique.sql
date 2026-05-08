-- Add unique constraint to evolution_photos so upsert works per student+org+slot+date
ALTER TABLE public.evolution_photos
  DROP CONSTRAINT IF EXISTS evolution_photos_student_org_slot_date_key;

ALTER TABLE public.evolution_photos
  ADD CONSTRAINT evolution_photos_student_org_slot_date_key
  UNIQUE (student_id, org_id, slot, taken_at);

-- Create evolution-photos storage bucket (if not exists)
-- Note: bucket creation must be done via Supabase dashboard or API.
-- Ensure bucket "evolution-photos" exists with public: false.
