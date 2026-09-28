-- Treinador/staff da org passa a LER os treinos concluídos dos alunos da org
-- (antes só o próprio aluno lia) — necessário pra seção "Treinos concluídos"
-- (nota + comentário) na aba Treinos da ficha do aluno (TreinoFeedbacks.tsx).
-- A org vem de alunos.org_id: treino_sessoes_log.org_id nunca foi preenchido
-- (null em 100% das linhas em 2026-09-28). Só SELECT — nenhuma escrita nova.
CREATE POLICY "staff_select_org_logs" ON public.treino_sessoes_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.alunos a
    WHERE a.id = treino_sessoes_log.aluno_id
      AND public.is_org_staff(a.org_id)
  ));
