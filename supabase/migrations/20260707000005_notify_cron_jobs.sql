-- Cron jobs pros tipos de notify-scheduled que nunca tiveram um cron de verdade
-- registrado (meals, meals_incomplete, hydration, morning, workout_incomplete) —
-- só existiam "sugeridos" em comentário no código. Mesmo padrão dos jobs já
-- existentes (check-active-timers, update-reminder-daily): net.http_post direto
-- pra Edge Function, reaproveitando a mesma anon key.
select cron.schedule(
  'notify-meals',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mdbqhmkblzyllkyxjhrd.supabase.co/functions/v1/notify-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnFobWtibHp5bGxreXhqaHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTEwMzQsImV4cCI6MjA5MTc4NzAzNH0.Fpc8MCctDGqWrzw54OP1El0s3aS33yrh-i9Tr3jZlBs"}'::jsonb,
    body := '{"type": "meals"}'::jsonb
  );
  $$
);

select cron.schedule(
  'notify-meals-incomplete',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mdbqhmkblzyllkyxjhrd.supabase.co/functions/v1/notify-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnFobWtibHp5bGxreXhqaHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTEwMzQsImV4cCI6MjA5MTc4NzAzNH0.Fpc8MCctDGqWrzw54OP1El0s3aS33yrh-i9Tr3jZlBs"}'::jsonb,
    body := '{"type": "meals_incomplete"}'::jsonb
  );
  $$
);

select cron.schedule(
  'notify-hydration',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := 'https://mdbqhmkblzyllkyxjhrd.supabase.co/functions/v1/notify-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnFobWtibHp5bGxreXhqaHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTEwMzQsImV4cCI6MjA5MTc4NzAzNH0.Fpc8MCctDGqWrzw54OP1El0s3aS33yrh-i9Tr3jZlBs"}'::jsonb,
    body := '{"type": "hydration"}'::jsonb
  );
  $$
);

-- 11h UTC = 8h BRT
select cron.schedule(
  'notify-morning',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://mdbqhmkblzyllkyxjhrd.supabase.co/functions/v1/notify-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnFobWtibHp5bGxreXhqaHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTEwMzQsImV4cCI6MjA5MTc4NzAzNH0.Fpc8MCctDGqWrzw54OP1El0s3aS33yrh-i9Tr3jZlBs"}'::jsonb,
    body := '{"type": "morning"}'::jsonb
  );
  $$
);

-- 23h UTC = 20h BRT
select cron.schedule(
  'notify-workout-incomplete',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://mdbqhmkblzyllkyxjhrd.supabase.co/functions/v1/notify-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnFobWtibHp5bGxreXhqaHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTEwMzQsImV4cCI6MjA5MTc4NzAzNH0.Fpc8MCctDGqWrzw54OP1El0s3aS33yrh-i9Tr3jZlBs"}'::jsonb,
    body := '{"type": "workout_incomplete"}'::jsonb
  );
  $$
);
