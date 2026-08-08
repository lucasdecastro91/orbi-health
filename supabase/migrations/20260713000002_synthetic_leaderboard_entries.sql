-- Decisão de produto do Lucas (2026-07-13, só pra Get Shape): a org tem só ~19-20 alunos
-- reais cadastrados hoje, o que faz qualquer aluno real ficar trivialmente perto do topo
-- do ranking (pouca competição de verdade). Ele quer que o Ranking pareça ter ~93
-- competidores, sem criar contas fake de verdade (poluiria Auth/billing/painel de
-- clientes) e sem nunca deixar um "fake" aparecer pro aluno real (nome no top 3, ou no
-- ranking do painel do treinador).
--
-- Solução: tabela separada, SEM NENHUMA relação com auth.users/alunos/profiles — os
-- fakes nunca entram em `xp_totals` (que tem FK pra auth.users), então:
--   - o top 3 do aluno (Ranking.tsx) e o ranking do treinador (coach/Ranking.tsx) só
--     leem `xp_totals`/`alunos` de verdade — impossível um fake aparecer ali, não
--     importa o XP que ele tenha, porque fisicamente não é a mesma tabela.
--   - só entram no cálculo de "N competidores" e no "seu rank" (via função nova).
--
-- Regra de segurança que TEM que ser respeitada em qualquer ajuste futuro: o XP de um
-- fake nunca pode passar do 3º maior total_xp real da org (hoje 60) — senão um aluno
-- real que aparece no top 3 visível passaria a ver um "rank" (número) inconsistente
-- com a lista (ex: aparece 2º na lista, mas o card diz "16º lugar"). Empate é seguro:
-- o desempate do top 3 usa xp_totals.updated_at mais antigo primeiro, e quem já bateu
-- 60 de verdade sempre tem updated_at mais antigo que um fake inserido agora.
--
-- Escrita é 100% manual — nenhum código do app grava aqui. Ajustes futuros (Lucas pediu
-- um jeito de "subir gradualmente" sem painel): ele pede em chat, e quem ajusta via SQL
-- reaplica essa mesma regra de teto a cada vez.

create table if not exists public.xp_totals_synthetic (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  total_xp    int  not null check (total_xp >= 0),
  created_at  timestamptz not null default now()
);

alter table public.xp_totals_synthetic enable row level security;
-- Sem policies = nenhum client (anon/authenticated) lê ou escreve direto. Só acessível
-- via função SECURITY DEFINER abaixo, e via SQL manual (service role / MCP).

-- "N competidores" passa a somar alunos reais ativos + linhas sintéticas da org.
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

  select
    (select count(*) from alunos where org_id = p_org_id and ativo = true)
    + (select count(*) from xp_totals_synthetic where org_id = p_org_id)
  into v_count;

  return v_count;
end;
$$;

-- Rank combinado (real + sintético). Substitui o cálculo antigo no frontend
-- (board.findIndex, limitado ao top 20 de xp_totals), que já estava latentemente
-- errado pra quem ficasse fora do top 20 — só nunca tinha acontecido por só termos
-- ~19 alunos na org. Ranking por "competição": empate divide a mesma posição (mesmo
-- critério já usado no painel do treinador).
create or replace function public.get_my_leaderboard_rank(
  p_org_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_xp integer;
  v_rank  integer;
begin
  if not exists (
    select 1 from alunos
    where user_id = auth.uid()
      and org_id = p_org_id
      and ativo = true
  ) then
    return 0;
  end if;

  select coalesce(total_xp, 0) into v_my_xp
  from xp_totals
  where student_id = auth.uid() and org_id = p_org_id;
  v_my_xp := coalesce(v_my_xp, 0);

  select 1
    + (select count(*) from xp_totals where org_id = p_org_id and total_xp > v_my_xp)
    + (select count(*) from xp_totals_synthetic where org_id = p_org_id and total_xp > v_my_xp)
  into v_rank;

  return v_rank;
end;
$$;

revoke all on function public.get_org_active_student_count(uuid) from public;
grant execute on function public.get_org_active_student_count(uuid) to authenticated;
revoke all on function public.get_my_leaderboard_rank(uuid) from public;
grant execute on function public.get_my_leaderboard_rank(uuid) to authenticated;

-- Seed inicial só pra Get Shape (2026-07-13): 74 linhas, teto dinâmico = 3º maior
-- total_xp real da org no momento (hoje 60), cauda longa (maioria baixo engajamento).
-- No-op em qualquer outra instância/org (guard por slug).
do $$
declare
  v_org_id uuid;
  v_cap    integer;
begin
  select id into v_org_id from public.organizations where slug = 'getshape';
  if v_org_id is null then
    return;
  end if;

  select total_xp into v_cap
  from public.xp_totals
  where org_id = v_org_id
  order by total_xp desc
  offset 2 limit 1;
  v_cap := coalesce(v_cap, 0);

  insert into public.xp_totals_synthetic (org_id, total_xp)
  select v_org_id, 0
  from generate_series(1, 25)
  union all
  select v_org_id, floor(random() * 20)::int + 1        -- 1-20
  from generate_series(1, 25)
  union all
  select v_org_id, floor(random() * 20)::int + 21        -- 21-40
  from generate_series(1, 15)
  union all
  select v_org_id, floor(random() * greatest(v_cap - 40, 1))::int + 41  -- 41-v_cap
  from generate_series(1, 9);
end $$;
