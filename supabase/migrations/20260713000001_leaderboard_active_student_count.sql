-- Bug real do Ranking do aluno: "N competidores" contava só quem já tem uma linha em
-- xp_totals (quem já gerou XP), não todos os alunos ativos da org — por isso mostrava
-- "7" na Get Shape mesmo com 20 alunos cadastrados. A tela do treinador já conta certo
-- (RLS de org_owner/staff dá acesso a todos os alunos), mas o aluno só tem policy de
-- SELECT sobre a própria linha em `alunos`, então precisa da mesma solução usada em
-- get_org_leaderboard_profiles: função SECURITY DEFINER, fail-closed (só conta se quem
-- chama for aluno ativo da própria org).

create or replace function public.get_org_active_student_count(
  p_org_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from alunos
    where user_id = auth.uid()
      and org_id = p_org_id
      and ativo = true
  ) then
    return 0;
  end if;

  select count(*) into v_count
  from alunos
  where org_id = p_org_id
    and ativo = true;

  return v_count;
end;
$$;

revoke all on function public.get_org_active_student_count(uuid) from public;
grant execute on function public.get_org_active_student_count(uuid) to authenticated;
