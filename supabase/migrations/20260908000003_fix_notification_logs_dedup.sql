-- Bug real (2026-09-08): alreadyLoggedToday() em notify-scheduled usava
-- .maybeSingle() pra checar duplicidade e voltava sempre "não mandei ainda"
-- pro tipo meals_incomplete (único cron por minuto que dependia só dessa
-- checagem) — resultado: notificação repetida a cada minuto, indefinidamente,
-- pra qualquer aluno com refeição pendente. Afetou pelo menos 6 pessoas desde
-- 26/08/2026 (uma com 202 cópias). Cron pausado manualmente, código corrigido
-- à parte. Esta migration: remove as duplicatas acumuladas (mantém a primeira
-- de cada) e adiciona constraint única como trava definitiva contra qualquer
-- futura falha de checagem — nenhum insert duplicado passa disso daqui pra frente.

delete from notification_logs nl
using (
  select id, row_number() over (partition by recipient_id, tag order by created_at asc) as rn
  from notification_logs
  where notification_type = 'meals_incomplete'
) dup
where nl.id = dup.id and dup.rn > 1;

alter table public.notification_logs
  add constraint notification_logs_recipient_tag_unique unique (recipient_id, tag);
