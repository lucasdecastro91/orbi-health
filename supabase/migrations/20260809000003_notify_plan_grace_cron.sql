-- Cron diário pro fluxo de carência de plano vencido (dia 0, dias 1-6, bloqueio
-- automático no dia 7) — mesmo padrão de net.http_post já usado pros outros
-- jobs de notify-scheduled em 20260707000005_notify_cron_jobs.sql.

select cron.schedule(
  'notify-plan-grace',
  '0 11 * * *',  -- 11h UTC = 8h BRT
  $$
  select net.http_post(
    url := 'https://mdbqhmkblzyllkyxjhrd.supabase.co/functions/v1/notify-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnFobWtibHp5bGxreXhqaHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTEwMzQsImV4cCI6MjA5MTc4NzAzNH0.Fpc8MCctDGqWrzw54OP1El0s3aS33yrh-i9Tr3jZlBs"}'::jsonb,
    body := '{"type": "plan_grace"}'::jsonb
  );
  $$
);
