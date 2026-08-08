-- Permite persistir o instante em que um timer ativo (descanso/cardio) foi pausado.
-- Antes, o "pausado" só existia como estado local no componente — ao minimizar o
-- sheet, navegar pra outra tela ou fechar o app, o pause se perdia: a barra fixa
-- (StudentLayout) e a tela ao reabrir voltavam a mostrar o timer "rodando" a partir
-- do started_at original, ignorando o tempo parado. Com paused_at persistido, dá pra
-- restaurar o estado pausado corretamente e também detectar timers esquecidos
-- pausados por muito tempo (ver activeTimer.ts, isTimerStale).
alter table public.active_timers add column paused_at timestamptz null;
