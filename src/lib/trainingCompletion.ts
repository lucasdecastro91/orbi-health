import { supabase } from "@/integrations/supabase/client";
import { grantXP } from "@/lib/xp";
import { evaluateAndUpdateStreak } from "@/lib/streaks";

interface MarkTreinoCompleteParams {
  alunoId: string;
  treinoId: string;
  planoId: string | null;
  studentUserId: string | null;
  orgId: string | null;
  treinadorId: string | null;
  alunoNome: string | null;
  avaliacao?: number | null;
  comentario?: string | null;
}

/** Grava a conclusão do treino do dia em `treino_sessoes_log` + XP/streak/notificação
 *  do treinador — extraído de Treinos.tsx.markComplete pra ser reaproveitado também
 *  pelo fluxo sequencial de ExerciseDetail.tsx (modo ?seq=1), sem duplicar os efeitos
 *  colaterais entre os dois pontos de conclusão. */
export async function markTreinoComplete(p: MarkTreinoCompleteParams): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("treino_sessoes_log").insert({
    aluno_id: p.alunoId,
    plano_id: p.planoId,
    treino_id: p.treinoId,
    data_conclusao: today,
    avaliacao: p.avaliacao ?? null,
    comentario: p.comentario || null,
  });
  if (error) throw error;

  if (p.studentUserId && p.orgId) {
    void grantXP(p.studentUserId, p.orgId, "workout_complete");
    void evaluateAndUpdateStreak(p.studentUserId, p.orgId);
  }

  if (p.treinadorId && p.orgId) {
    void (async () => {
      try {
        const { data: existing } = await supabase.from("notificacoes")
          .select("id").eq("user_id", p.treinadorId).eq("aluno_id", p.alunoId)
          .eq("tipo", "treino_completo").gte("created_at", today).limit(1);
        if (!existing || existing.length === 0) {
          const nome = p.alunoNome ?? "Um aluno";
          // Nota (1-5) em estrelas na própria mensagem — antes era gravada
          // no banco mas não aparecia em lugar nenhum pro treinador.
          const estrelas = p.avaliacao
            ? ` ${"★".repeat(p.avaliacao)}${"☆".repeat(5 - p.avaliacao)}`
            : "";
          const mensagem = p.comentario
            ? `${nome} concluiu o treino de hoje${estrelas} e comentou: "${p.comentario}"`
            : `${nome} concluiu o treino de hoje${estrelas}.`;
          await supabase.from("notificacoes").insert({
            user_id: p.treinadorId, org_id: p.orgId, aluno_id: p.alunoId, aluno_nome: p.alunoNome,
            titulo: "Treino concluído",
            mensagem,
            tipo: "treino_completo",
          });
        }
      } catch { /* best-effort */ }
    })();
  }
}
