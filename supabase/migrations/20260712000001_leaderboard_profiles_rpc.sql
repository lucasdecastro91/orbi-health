-- RPC pra Ranking do aluno: nomes/avatares de outros alunos da MESMA org.
-- profiles não tem policy de SELECT aluno->aluno (só própria linha, ou treinador/colaborador
-- sobre seus próprios alunos), então o Ranking não conseguia trazer nome de ninguém além
-- do próprio usuário logado. Uma policy de RLS ampla exporia a linha inteira de profiles
-- (inclui whatsapp) pra qualquer aluno da org — em vez disso, expõe só id/nome/avatar_url
-- via função SECURITY DEFINER, com verificação explícita de que quem chama pertence à
-- org informada (fail-closed: retorna vazio se não pertencer). Contexto multi-tenant real:
-- múltiplos treinadores/orgs distintos usam a mesma plataforma, isolamento entre orgs é crítico.

create or replace function public.get_org_leaderboard_profiles(
  p_org_id uuid,
  p_student_ids uuid[]
)
returns table (id uuid, nome text, avatar_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fail-closed: só retorna algo se quem chama for aluno ativo dessa org.
  if not exists (
    select 1 from alunos
    where user_id = auth.uid()
      and org_id = p_org_id
      and ativo = true
  ) then
    return;
  end if;

  return query
    select p.id, p.nome, p.avatar_url
    from profiles p
    join alunos a on a.user_id = p.id
    where a.org_id = p_org_id
      and a.ativo = true
      and p.id = any(p_student_ids);
end;
$$;

revoke all on function public.get_org_leaderboard_profiles(uuid, uuid[]) from public;
grant execute on function public.get_org_leaderboard_profiles(uuid, uuid[]) to authenticated;
