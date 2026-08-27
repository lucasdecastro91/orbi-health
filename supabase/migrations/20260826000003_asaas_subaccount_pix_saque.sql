-- Chave Pix de destino do saque da subconta. Não é a chave que os alunos
-- usam pra pagar (essa é a `cobrancas.pix_key`, gerada pela Asaas por
-- cobrança) — é onde o SALDO da subconta ORBI Pay é transferido quando o
-- treinador pede saque. Guardada só na nossa base: a API de transferência
-- (/v3/transfers) recebe a chave direto em cada chamada, não existe um
-- endpoint de "cadastrar" chave Pix previamente na Asaas.
alter table public.asaas_subaccounts
  add column pix_key text,
  add column pix_key_type text; -- CPF | CNPJ | EMAIL | PHONE | EVP

-- Histórico de saques solicitados — auditoria e base do Extrato.
create table public.asaas_subaccount_withdrawals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  asaas_transfer_id text,
  value numeric(12,2) not null,
  pix_key text not null,
  pix_key_type text not null,
  status text not null default 'pending', -- pending | bank_processing | done | failed | cancelled
  fail_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asaas_subaccount_withdrawals enable row level security;

-- Nenhuma policy criada de propósito — mesmo padrão de asaas_subaccounts,
-- só service_role (Edge Functions) acessa; o client nunca lê a tabela direto.

create index idx_asaas_subaccount_withdrawals_org_id on public.asaas_subaccount_withdrawals(org_id);
