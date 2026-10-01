-- Sessão "alternativa"/substituta (ex: fullbody de backup pra qualquer um dos
-- dias normais que o aluno faltar) não deve inflar a meta semanal de treino
-- usada no anel de aderência e no card de progresso mensal. Default `true`
-- preserva o comportamento atual pra toda sessão já existente.
alter table public.treinos
  add column conta_meta_semanal boolean not null default true;

comment on column public.treinos.conta_meta_semanal is
  'false = sessão alternativa/opcional (ex: substituta de backup) — não conta na meta semanal de treino nem disputa o destaque de "treino de hoje", mas conclui-la normalmente ainda soma como dia treinado na aderência.';
