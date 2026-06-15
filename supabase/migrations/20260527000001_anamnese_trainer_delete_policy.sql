-- Adiciona política de DELETE para treinador na tabela anamneses.
-- Sem ela o Supabase bloqueia o DELETE silenciosamente (sem erro),
-- fazendo a exclusão parecer bem-sucedida no client mas o registro
-- continuar no banco e reaparecer ao recarregar a página.

CREATE POLICY "anamnese_trainer_delete" ON public.anamneses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.user_id = anamneses.student_id
        AND a.treinador_id = auth.uid()
    )
  );
