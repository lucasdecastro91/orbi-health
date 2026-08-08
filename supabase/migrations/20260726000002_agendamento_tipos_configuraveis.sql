-- Tipos de agendamento (Consulta/Avaliação/Retorno) deixam de ser fixos no
-- código e passam a ser configuráveis por org — cada treinador pode editar
-- os que já existem ou adicionar novos.
alter table public.organizations
  add column if not exists agendamento_tipos jsonb not null default '[
    {"key": "consulta",  "label": "Consulta",  "color": "var(--cp-500)"},
    {"key": "avaliacao", "label": "Avaliação", "color": "hsl(217 91% 65%)"},
    {"key": "retorno",   "label": "Retorno",   "color": "var(--cp-400)"}
  ]'::jsonb;

-- A checagem fixa de 3 valores não faz sentido mais que o tipo virou
-- configurável por org — a validação de "tipo existe na config da org"
-- passa a ser responsabilidade do client (mesmo padrão já usado por outras
-- colunas jsonb livres do projeto, ex: medidas_extras).
alter table public.agendamentos drop constraint if exists agendamentos_tipo_check;
