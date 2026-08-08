-- Marcação manual de "concluída" pra atualização enviada pelo aluno — o
-- treinador confere e resolve o que precisar (ex: ajustar treino/dieta) e
-- marca como concluída, saindo da lista de pendentes do dashboard.
alter table public.atualizacao_respostas
  add column if not exists concluida boolean not null default false;

-- Só existia policy de SELECT pro treinador/staff da org nessa tabela;
-- precisa de UPDATE pra marcar/desmarcar concluída.
create policy "trainer update org respostas"
  on public.atualizacao_respostas
  for update
  using (is_org_member(org_id))
  with check (is_org_member(org_id));
