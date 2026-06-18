-- Migration: avaliacoes_fisicas
-- Tabela para registrar avaliações físicas (InBody, dinamometria, etc.)

create table if not exists avaliacoes_fisicas (
  id                      uuid        primary key default gen_random_uuid(),
  org_id                  uuid        not null references organizations(id) on delete cascade,
  aluno_id                uuid        not null references alunos(id)        on delete cascade,
  data_avaliacao          date        not null,
  peso                    numeric(6,2),
  massa_muscular_kg       numeric(6,2),
  percentual_gordura      numeric(5,2),
  massa_gordura_kg        numeric(6,2),
  imc                     numeric(5,2),
  taxa_metabolica_basal   integer,
  gordura_visceral        integer,
  pontuacao_inbody        integer,
  dinamometria_dorsal     integer,
  dinamometria_escapular  integer,
  dinamometria_manual     integer,
  foto_url                text,
  observacoes             text,
  created_at              timestamptz not null default now()
);

create index if not exists avaliacoes_fisicas_aluno_id_idx on avaliacoes_fisicas (aluno_id);
create index if not exists avaliacoes_fisicas_org_id_idx   on avaliacoes_fisicas (org_id);

alter table avaliacoes_fisicas enable row level security;

create policy "org members can select avaliacoes_fisicas"
  on avaliacoes_fisicas for select
  using (is_org_member(org_id));

create policy "org members can insert avaliacoes_fisicas"
  on avaliacoes_fisicas for insert
  with check (is_org_member(org_id));

create policy "org members can delete avaliacoes_fisicas"
  on avaliacoes_fisicas for delete
  using (is_org_member(org_id));
