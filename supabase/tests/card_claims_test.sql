-- Teste do teto de cartão (claims). Roda dentro de transação e desfaz tudo.
-- Uso: colar no SQL editor / execute_sql. Sucesso = 'card_claims ok'.
begin;
do $$
declare
  v_org uuid := '10000000-0000-0000-0000-000000000000';
  a uuid; b uuid; c uuid;
begin
  delete from public.card_charge_claims where org_id = v_org;
  a := public.claim_card_volume(v_org, 4000, 5000);
  if a is null then raise exception 'claim de 4000 com teto 5000 deveria passar'; end if;
  b := public.claim_card_volume(v_org, 1000, 5000);
  if b is null then raise exception 'claim que fecha exatamente 5000 deveria passar'; end if;
  c := public.claim_card_volume(v_org, 0.01, 5000);
  if c is not null then raise exception 'claim de 0,01 acima do teto deveria ser recusado'; end if;
  if public.card_claims_30d(v_org) <> 5000 then raise exception 'soma 30d deveria ser 5000'; end if;
  -- claim antigo (31 dias) não conta
  update public.card_charge_claims set created_at = now() - interval '31 days' where id = a;
  if public.card_claims_30d(v_org) <> 1000 then raise exception 'claim de 31 dias não deveria contar'; end if;
  -- sem teto (null) sempre passa
  if public.claim_card_volume(v_org, 999999, null) is null then raise exception 'teto null deveria passar'; end if;
  -- authenticated não executa
  if has_function_privilege('authenticated', 'public.claim_card_volume(uuid, numeric, numeric)', 'execute') then
    raise exception 'authenticated não pode executar claim_card_volume';
  end if;
  raise notice 'card_claims ok';
end $$;
select 'card_claims ok' as resultado;
rollback;
