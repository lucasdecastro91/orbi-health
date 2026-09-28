-- Bucket dedicado pra fotos de avaliação postural, isolado do bucket
-- compartilhado `evolution-photos` (fotos de Evolução/Atualização) — motivo:
-- a limpeza de órfãos removida em 20260908000001_drop_listar_storage_orfaos.sql
-- só sabia filtrar por uma tabela por bucket, e apagou fotos de avaliação
-- postural por engano por elas dividirem espaço com outra funcionalidade.
-- Bucket próprio impede recorrência do mesmo tipo de erro no futuro.
-- Privado (não público) — o app sempre usou createSignedUrl, nunca URL
-- pública direta, então não muda nada funcionalmente, só fecha acesso
-- anônimo desnecessário a fotos do corpo de alunos.
insert into storage.buckets (id, name, public)
values ('avaliacoes-posturais', 'avaliacoes-posturais', false)
on conflict (id) do nothing;

-- Caminho em uso: postural/{org_id}/{student_user_id}/{avaliacao_id}/{arquivo}
-- foldername(name): [1]=postural  [2]=org_id  [3]=student_user_id  [4]=avaliacao_id
-- Aluno mexe só nas próprias fotos; staff da org vê/apaga as fotos dos alunos
-- da própria org (mesmo padrão de is_org_staff já usado no bucket postural-media).
create policy "Aluno le proprias fotos avaliacao postural"
  on storage.objects for select
  using (bucket_id = 'avaliacoes-posturais' and (auth.uid())::text = (storage.foldername(name))[3]);

create policy "Aluno envia proprias fotos avaliacao postural"
  on storage.objects for insert
  with check (bucket_id = 'avaliacoes-posturais' and (auth.uid())::text = (storage.foldername(name))[3]);

create policy "Aluno atualiza proprias fotos avaliacao postural"
  on storage.objects for update
  using (bucket_id = 'avaliacoes-posturais' and (auth.uid())::text = (storage.foldername(name))[3]);

create policy "Staff da org le fotos avaliacao postural"
  on storage.objects for select
  using (bucket_id = 'avaliacoes-posturais' and is_org_staff(((storage.foldername(name))[2])::uuid));

create policy "Staff da org apaga fotos avaliacao postural"
  on storage.objects for delete
  using (bucket_id = 'avaliacoes-posturais' and is_org_staff(((storage.foldername(name))[2])::uuid));
