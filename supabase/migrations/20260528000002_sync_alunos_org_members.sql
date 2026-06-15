-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: sincroniza alunos → organization_members
--
-- Problema: alunos adicionados ANTES da migration 20260415000002
-- (que criou o trigger trg_sync_aluno_org_members) não foram inseridos
-- automaticamente em organization_members para a org do treinador.
-- Resultado: esses alunos ficavam sem entrada em organization_members,
-- fazendo o login redirecionar para a org errada e o RLS bloquear dados
-- (ex: lista de substituição retornava 0 linhas → erro no app).
--
-- Este script insere as entradas faltando de forma idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.organization_members (org_id, user_id, role)
SELECT a.org_id, a.user_id, 'student'
FROM   public.alunos a
WHERE  a.org_id   IS NOT NULL
  AND  a.user_id  IS NOT NULL
  AND  NOT EXISTS (
    SELECT 1
    FROM   public.organization_members om
    WHERE  om.org_id   = a.org_id
      AND  om.user_id  = a.user_id
  )
ON CONFLICT (org_id, user_id) DO NOTHING;
