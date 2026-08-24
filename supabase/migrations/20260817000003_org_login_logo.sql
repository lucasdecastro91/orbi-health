-- Logo específica pra tela de login, separada da logo do header do app.
-- O header é sempre escuro por design (independente do tema da org), então a
-- logo dele pode assumir fundo escuro sempre — mas a tela de login segue o
-- tema da org (claro ou escuro), e uma logo pensada só pra fundo escuro
-- (texto branco) fica ilegível quando a org está no tema claro.
-- Opcional: null cai no fallback da logo normal (logo_url).
alter table public.organizations
  add column login_logo_url text;
