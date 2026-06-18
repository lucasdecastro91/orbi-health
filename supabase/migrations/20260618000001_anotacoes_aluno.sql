-- Migration: anotacoes_aluno
-- Tabela de anotações internas do treinador sobre cada aluno

create table if not exists anotacoes_aluno (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references organizations(id)  on delete cascade,
  aluno_id      uuid        not null references alunos(id)         on delete cascade,
  treinador_id  uuid        references auth.users(id)              on delete set null,
  texto         text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists anotacoes_aluno_aluno_id_idx  on anotacoes_aluno (aluno_id);
create index if not exists anotacoes_aluno_org_id_idx    on anotacoes_aluno (org_id);

alter table anotacoes_aluno enable row level security;

-- Membros da org (treinador / colaborador) podem ler e criar anotações
create policy "org members can select anotacoes_aluno"
  on anotacoes_aluno for select
  using (is_org_member(org_id));

create policy "org members can insert anotacoes_aluno"
  on anotacoes_aluno for insert
  with check (is_org_member(org_id));

-- Apenas quem criou a anotação (ou owner da org) pode deletar
create policy "org members can delete anotacoes_aluno"
  on anotacoes_aluno for delete
  using (is_org_member(org_id));
