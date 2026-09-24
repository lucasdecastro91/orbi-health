import { useEffect, useState } from "react";
import { Star, Loader2, Trophy } from "lucide-react";

interface FinishTrainingSheetProps {
  open: boolean;
  submitting: boolean;
  onSubmit: (avaliacao: number, comentario: string) => void;
  onClose: () => void;
}

/** Sheet de avaliação exibido ao concluir um treino — estrelas (obrigatório)
 *  + comentário livre (opcional). O comentário chega até o treinador via
 *  markTreinoComplete (mesmo insert usado pelos dois pontos de conclusão:
 *  ExerciseDetail.tsx modo ?seq=1 e o botão manual em Treinos.tsx). */
export const FinishTrainingSheet = ({ open, submitting, onSubmit, onClose }: FinishTrainingSheetProps) => {
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open) { setRating(0); setComment(""); }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-10 pt-6 px-6"
        style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5" />

        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}
        >
          <Trophy className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
        </div>
        <p className="text-center text-base font-bold text-foreground mb-1">Finalizar treino</p>
        <p className="text-center text-sm text-muted-foreground mb-5">Como foi o seu treino hoje?</p>

        <div className="flex items-center justify-center gap-2 mb-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
              className="p-1"
            >
              <Star
                className="w-8 h-8 transition-colors"
                style={{
                  color: n <= rating ? "#facc15" : "hsl(var(--foreground) / 0.15)",
                  fill: n <= rating ? "#facc15" : "transparent",
                }}
              />
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
          Feedback adicional (opcional)
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Conte pro seu treinador como foi..."
          rows={3}
          className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 outline-none resize-none mb-5"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.06)", border: "1px solid hsl(var(--foreground) / 0.09)" }}
        />

        <button
          onClick={() => onSubmit(rating, comment.trim())}
          disabled={rating === 0 || submitting}
          className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--cp-gradient)", color: "var(--cp-text, #fff)" }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Enviar e concluir
        </button>
      </div>
    </div>
  );
};
