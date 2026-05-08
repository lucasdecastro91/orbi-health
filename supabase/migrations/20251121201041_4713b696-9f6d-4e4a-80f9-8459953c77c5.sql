-- Allow students to view base exercise descriptions for exercises in their workouts
create policy "Students can view base exercises in their workouts"
on public.exercicios_base
for select
to authenticated
using (
  is_aluno(auth.uid())
  AND
  exists (
    select 1
    from public.exercicios e
    join public.treinos t on t.id = e.treino_id
    join public.semanas s on s.id = t.semana_id
    join public.planos_treino pt on pt.id = s.plano_id
    join public.alunos a on a.id = pt.aluno_id
    where
      e.exercicio_base_id = exercicios_base.id
      and a.user_id = auth.uid()
  )
);