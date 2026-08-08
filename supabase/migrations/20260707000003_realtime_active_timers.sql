-- Habilita Realtime (postgres_changes) na tabela active_timers, pra StudentLayout
-- reagir na hora ao iniciar/pausar/retomar/cancelar um timer, sem depender de polling.
-- RLS já restringe cada aluno a enxergar só a própria linha (active_timers_student_all),
-- então o canal Realtime não vaza dados entre alunos.
alter publication supabase_realtime add table public.active_timers;
