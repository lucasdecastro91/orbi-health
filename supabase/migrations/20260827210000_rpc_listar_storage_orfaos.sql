-- ═══════════════════════════════════════════════════════════════════════════
-- listar_storage_orfaos(bucket, tabela) — lista arquivos no Storage sem
-- nenhuma linha correspondente na tabela que deveria referenciá-los.
--
-- Usada pela Edge Function `limpar-storage-orfaos` (limpeza pontual
-- 2026-08-27, ver comentário lá pro contexto completo do incidente). Só
-- chamável via service_role (a Edge Function já valida superadmin antes de
-- chamar) — nunca exposta a `authenticated`, senão qualquer usuário logado
-- poderia listar caminhos de arquivo de outras orgs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.listar_storage_orfaos(p_bucket text, p_table text)
RETURNS TABLE(name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table = 'evolution_photos' THEN
    RETURN QUERY
      SELECT o.name FROM storage.objects o
       WHERE o.bucket_id = p_bucket
         AND NOT EXISTS (SELECT 1 FROM public.evolution_photos p WHERE p.storage_path = o.name);
  ELSIF p_table = 'atualizacao_resposta_arquivos' THEN
    RETURN QUERY
      SELECT o.name FROM storage.objects o
       WHERE o.bucket_id = p_bucket
         AND NOT EXISTS (SELECT 1 FROM public.atualizacao_resposta_arquivos p WHERE p.storage_path = o.name);
  ELSE
    RAISE EXCEPTION 'Tabela não suportada: %', p_table;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_storage_orfaos(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_storage_orfaos(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.listar_storage_orfaos(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.listar_storage_orfaos(text, text) TO service_role;
