-- Histórico do agente de IA de suporte, uma conversa contínua por org.
-- Só o dono da org acessa (não colaboradores) — decidido porque a base de
-- conhecimento do agente inclui preço de planos, billing e decisões de
-- negócio, informação de nível "dono", não operação do dia a dia da equipe.
-- Cliente só LÊ (para carregar o histórico ao abrir o balão); quem grava
-- as duas mensagens (usuário + assistente) é a Edge Function via service
-- role, depois de validar que o caller é o owner — evita um cliente
-- malicioso inserindo mensagens "assistant" falsas no próprio histórico.

create table if not exists public.agent_conversations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

alter table public.agent_conversations enable row level security;

create policy "org owner le a propria conversa do agente"
  on public.agent_conversations for select
  using (is_org_owner(org_id));

create index if not exists agent_conversations_org_created_idx
  on public.agent_conversations (org_id, created_at);
