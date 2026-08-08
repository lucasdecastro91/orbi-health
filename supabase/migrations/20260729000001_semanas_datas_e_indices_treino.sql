-- APLICADA EM PRODUÇÃO em 2026-07-29 (via MCP apply_migration; os ANALYZE do
-- fim rodaram como statement separado). Verificado depois de aplicar:
--   - plano da query de exercícios virou Index Scan, custo 111.872 → 1.212
--   - UPDATE com data_inicio/data_fim num bloco real funciona (testado com rollback)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Datas por bloco de semanas (macrociclo → blocos com início/fim próprios)
--    O plano (planos_treino) representa o macrociclo; cada bloco (semanas)
--    passa a ter sua própria janela de datas, definida no dialog de edição.
--    Nullable de propósito: blocos já existentes ficam sem data até o
--    treinador preencher, e a data é opcional no formulário.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.semanas
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim    date;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Índices das FKs do caminho plano → semana → treino → exercício
--
--    Nenhuma dessas FKs tinha índice. Consequência medida no projeto
--    (2026-07-29): `select * from exercicios where treino_id = $1` faz Seq Scan
--    (733 linhas varridas pra devolver 8) e a policy RLS "Ver exercícios"
--    reavalia um EXISTS com 4 JOINs por linha varrida — custo estimado 111.872
--    contra 68 sem RLS, e Planning Time de ~105ms por query. Com N colunas de
--    sessão montando em paralelo (cada uma dispara 3 queries), isso empilha
--    até estourar o statement_timeout.
--
--    Índices são aditivos: não alteram dados nem o schema lógico, e as tabelas
--    são pequenas (exercicios = 584 kB), então a criação é praticamente
--    instantânea. Seguro de rodar em produção.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cobre o WHERE treino_id = $1 e o ORDER BY ordem numa só varredura
CREATE INDEX IF NOT EXISTS exercicios_treino_id_ordem_idx
  ON public.exercicios (treino_id, ordem);

-- Usados pelos JOINs internos da policy RLS "Ver exercícios"
CREATE INDEX IF NOT EXISTS treinos_semana_id_idx
  ON public.treinos (semana_id);

CREATE INDEX IF NOT EXISTS planos_treino_aluno_id_idx
  ON public.planos_treino (aluno_id);

-- Atualiza estatísticas pro planner passar a escolher os índices novos
ANALYZE public.exercicios;
ANALYZE public.treinos;
ANALYZE public.planos_treino;
