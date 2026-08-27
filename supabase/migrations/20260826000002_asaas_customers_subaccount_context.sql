-- Rastreia em qual "espaço" Asaas (conta master ou subconta específica) cada
-- customer foi criado. Necessário porque customers de uma conta Asaas não
-- existem/funcionam com a api_key de outra conta — quando uma org migra pra
-- subconta, os customers antigos (criados via chave master) ficam inválidos
-- pra cobranças novas ali, e um customer novo precisa nascer no contexto da
-- subconta. null = conta master (comportamento atual, todas as linhas hoje).

alter table public.asaas_customers_alunos
  add column asaas_subaccount_id uuid references public.asaas_subaccounts(id) on delete set null;

create index idx_asaas_customers_alunos_subaccount on public.asaas_customers_alunos(asaas_subaccount_id);
