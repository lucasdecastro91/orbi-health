-- Avaliação Postural é feature reservada pra apps sob encomenda (~R$25-30k),
-- não faz parte do ORBI Motion/Pro comercial. Hoje toda org vê/usa sem
-- restrição nenhuma. Flag por org, desligada por padrão, ligada manualmente
-- só nos builds customizados (Get Shape é o único caso hoje).

alter table public.organizations
  add column if not exists has_avaliacao_postural boolean not null default false;

update public.organizations
  set has_avaliacao_postural = true
  where slug = 'getshape';
