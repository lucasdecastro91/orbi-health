-- ═══════════════════════════════════════════════════════════════════════════
-- Limpeza automática de cron.job_run_details / net._http_response
--
-- Incidente 2026-08-27: o banco esgotou o Disk IO Budget (compute Nano) e o
-- app parou de responder. Causa raiz achada: `cron.job_run_details` (231MB)
-- e `net._http_response` (85MB) somavam ~316MB de um banco de 353MB — quase
-- tudo era log interno do pg_cron/pg_net (histórico de execução de job e
-- resposta de chamada HTTP assíncrona), nunca limpo, crescendo sem limite há
-- meses (3 jobs rodam a cada minuto, ver `cron.job`). Truncado manualmente
-- na hora (banco caiu pra 37MB), mas sem limpeza recorrente elas voltam a
-- encher e o mesmo problema se repete em algumas semanas.
--
-- Mantém só os últimos 3 dias de cada — suficiente pra depurar um job que
-- falhou recentemente, sem deixar acumular indefinidamente.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'limpar-logs-cron-net',
  '0 3 * * *',
  $$
    DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days';
    DELETE FROM net._http_response WHERE created < now() - interval '3 days';
  $$
);
