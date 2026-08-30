-- push_subscriptions passa a guardar tanto Web Push (browser) quanto device
-- tokens nativos do APNs (iOS), lado a lado, na mesma tabela.
--
-- Reaproveita a coluna `endpoint` pra guardar o device token do APNs nas
-- linhas platform='ios' — mantém o unique(user_id, endpoint) funcionando sem
-- mudança, e o hook nativo usa o mesmo upsert onConflict "user_id,endpoint"
-- que o hook web já usa. p256dh/auth_key não fazem sentido pra APNs, viram
-- opcionais e um check constraint garante que cada platform preenche o que
-- precisa.

alter table public.push_subscriptions
  add column platform text not null default 'web' check (platform in ('web', 'ios'));

alter table public.push_subscriptions alter column p256dh   drop not null;
alter table public.push_subscriptions alter column auth_key drop not null;

alter table public.push_subscriptions add constraint push_subscriptions_platform_fields_check check (
  (platform = 'web' and p256dh is not null and auth_key is not null) or
  (platform = 'ios' and p256dh is null     and auth_key is null)
);

create index if not exists push_subscriptions_platform_idx on public.push_subscriptions (platform);
