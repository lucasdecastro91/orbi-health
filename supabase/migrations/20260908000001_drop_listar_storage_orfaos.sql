-- ═══════════════════════════════════════════════════════════════════════════
-- Remove listar_storage_orfaos(bucket, tabela) — RPC usada pela Edge Function
-- `limpar-storage-orfaos`, limpeza pontual de 2026-08-27 já descartável por
-- definição (ver comentário original em 20260827210000_rpc_listar_storage_orfaos.sql).
--
-- Causou perda de dados real: pra o bucket `evolution-photos`, ela só conhecia
-- a tabela `evolution_photos` — mas fotos de avaliação postural também moram
-- nesse bucket (prefixo `postural/...`), referenciadas por `avaliacao_fotos`,
-- tabela que a RPC nunca soube filtrar. Toda foto de avaliação postural
-- parecia "órfã" e foi apagada de verdade quando a função rodou de novo depois
-- de 27/08 — vítima confirmada: as 13 fotos da avaliação postural do Pedro
-- Cipriano (28/08/2026), sem como recuperar.
--
-- Função e Edge Function removidas em 2026-09-08. Avaliação postural passa a
-- usar bucket próprio (avaliacoes-posturais), isolado deste tipo de limpeza.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.listar_storage_orfaos(text, text);
