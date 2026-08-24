import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Weight, Camera, Dumbbell, Utensils, Star, ChevronRight,
  ChevronLeft, Check, Loader2, Upload, X, ClipboardList,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface Step {
  id: number;
  icon: React.ElementType;
  label: string;
  color: string;
}

const STEPS: Step[] = [
  { id: 1, icon: Weight,    label: "Peso & Fotos",  color: "var(--cp-500)" },
  { id: 2, icon: Dumbbell,  label: "Treino",        color: "hsl(217 91% 60%)" },
  { id: 3, icon: Utensils,  label: "Alimentação",   color: "hsl(var(--primary))" },
  { id: 4, icon: Star,      label: "Aderência",     color: "hsl(280 65% 60%)" },
];

// ── Star rating component ──────────────────────────────────────────
const StarRating = ({
  value, onChange, color,
}: { value: number; onChange: (v: number) => void; color: string }) => (
  <div className="flex gap-2">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(n)}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
        style={{
          backgroundColor: n <= value ? `${color}20` : "hsl(var(--foreground) / 0.04)",
          border: `1.5px solid ${n <= value ? color : "hsl(var(--foreground) / 0.08)"}`,
        }}
      >
        <Star
          className="w-4 h-4"
          style={{ color: n <= value ? color : "hsl(var(--muted-foreground))", fill: n <= value ? color : "none" }}
        />
      </button>
    ))}
  </div>
);

const ratingLabel = (v: number) => {
  if (!v) return "";
  return ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"][v];
};

// ── Photo upload component ─────────────────────────────────────────
const PhotoUploader = ({
  photos, onAdd, onRemove, uploading,
}: {
  photos: string[];
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
  uploading: boolean;
}) => (
  <div>
    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-2 block">
      Fotos de progresso (opcional)
    </label>
    <div className="flex flex-wrap gap-2">
      {photos.map((url) => (
        <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10">
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(url)}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ))}

      {photos.length < 4 && (
        <label className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-green-600/40 transition-colors">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
          ) : (
            <>
              <Camera className="w-5 h-5 text-white/30" />
              <span className="text-[10px] text-white/30">Adicionar</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAdd(f);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
    <p className="text-[11px] text-white/25 mt-1.5">Máximo 4 fotos · JPG/PNG · até 5 MB cada</p>
  </div>
);

// ── Main CheckIn component ─────────────────────────────────────────
const CheckIn = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Step 1
  const [weight, setWeight]     = useState("");
  const [photos, setPhotos]     = useState<string[]>([]);

  // Step 2
  const [treinoRating, setTreinoRating] = useState(0);
  const [treinoObs, setTreinoObs]       = useState("");

  // Step 3
  const [dietaRating, setDietaRating] = useState(0);
  const [dietaObs, setDietaObs]       = useState("");

  // Step 4
  const [aderencia, setAderencia]   = useState(0);
  const [obsGeral, setObsGeral]     = useState("");

  // Trainee data
  const [treinadorId, setTreinadorId] = useState<string | null>(null);
  const [orgId, setOrgId]             = useState<string | null>(null);
  const [alunoRecId,  setAlunoRecId]  = useState<string | null>(null);
  const [alunoNome,   setAlunoNome]   = useState<string | null>(null);

  useEffect(() => {
    loadContext();
  }, []);

  const loadContext = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const [alunoRes, profileRes] = await Promise.all([
        supabase.from("alunos").select("id, treinador_id, org_id").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("profiles").select("nome").eq("id", session.user.id).maybeSingle(),
      ]);

      if (alunoRes.data) {
        setTreinadorId(alunoRes.data.treinador_id);
        setOrgId(alunoRes.data.org_id);
        setAlunoRecId(alunoRes.data.id);
      }
      if (profileRes.data?.nome) setAlunoNome(profileRes.data.nome);
    } catch {}
  };

  // ── Photo upload ─────────────────────────────────────────────────
  const handleAddPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Foto muito grande", description: "Máximo 5 MB por foto.", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${session.user.id}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage.from("checkins").upload(path, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from("checkins").getPublicUrl(path);
      setPhotos((p) => [...p, publicUrl]);
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (url: string) => {
    setPhotos((p) => p.filter((u) => u !== url));
  };

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: inserted, error } = await supabase.from("check_ins").insert({
        student_id:      session.user.id,
        treinador_id:    treinadorId,
        org_id:          orgId,
        weight:          weight ? Number(weight) : null,
        fotos:           photos.length > 0 ? photos : null,
        treino_avaliacao: treinoRating || null,
        treino_obs:       treinoObs || null,
        dieta_avaliacao:  dietaRating || null,
        dieta_obs:        dietaObs || null,
        aderencia:        aderencia || null,
        obs_geral:        obsGeral || null,
      }).select("id").single();

      if (error) throw error;

      // Best-effort: trigger AI analysis + notify trainer
      if (inserted?.id) {
        supabase.functions.invoke("analisar-checkin", {
          body: { checkin_id: inserted.id },
        }).catch(() => { /* ignore */ });
      }
      if (treinadorId && orgId) {
        void (async () => {
          try {
            await supabase.from("notificacoes").insert({
              user_id:    treinadorId,
              org_id:     orgId,
              aluno_id:   alunoRecId,
              aluno_nome: alunoNome,
              titulo:     "Novo check-in recebido",
              mensagem:   `${alunoNome ?? "Um aluno"} enviou um novo check-in. Acesse o perfil para visualizar.`,
              tipo:       "checkin",
            });
          } catch { /* silencioso */ }
        })();
      }

      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Erro ao enviar check-in", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step validation ──────────────────────────────────────────────
  const canProceed = () => {
    if (step === 1) return true; // peso e fotos são opcionais
    if (step === 2) return treinoRating > 0;
    if (step === 3) return dietaRating > 0;
    if (step === 4) return aderencia > 0;
    return true;
  };

  // ── Success screen ───────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: "var(--cp-gradient)" }}
        >
          <Check className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Check-in enviado!</h2>
        <p className="text-white/50 text-sm mb-8 max-w-xs">
          Seu treinador já pode visualizar seu progresso. Continue assim! 💪
        </p>
        <button
          onClick={() => navigate(`/${slug}/aluno`)}
          className="h-12 px-8 rounded-2xl text-white text-sm font-semibold"
          style={{ background: "var(--cp-gradient)" }}
        >
          Voltar ao início
        </button>
      </div>
    );
  }

  const currentStepData = STEPS[step - 1];
  const StepIcon = currentStepData.icon;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <ClipboardList className="w-5 h-5 text-green-500" />
          <h1 className="text-xl font-bold text-white">Check-in semanal</h1>
        </div>
        <p className="text-white/40 text-sm">Compartilhe seu progresso com o treinador</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, idx) => {
          const done    = step > s.id;
          const current = step === s.id;
          const SIcon   = s.icon;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div
                className="flex flex-col items-center gap-1 flex-1"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: done
                      ? "rgba(34,197,94,0.15)"
                      : current
                        ? `${s.color}20`
                        : "hsl(var(--foreground) / 0.04)",
                    border: `1.5px solid ${done ? "rgba(34,197,94,0.4)" : current ? s.color : "hsl(var(--foreground) / 0.08)"}`,
                  }}
                >
                  {done
                    ? <Check className="w-4 h-4 text-green-400" />
                    : <SIcon className="w-4 h-4" style={{ color: current ? s.color : "hsl(var(--muted-foreground))" }} />
                  }
                </div>
                <span
                  className="text-[10px] font-medium hidden sm:block"
                  style={{ color: current ? s.color : done ? "hsl(var(--foreground) / 0.6)" : "hsl(var(--muted-foreground))" }}
                >
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className="h-px flex-1 mb-5"
                  style={{ backgroundColor: step > s.id ? "rgba(34,197,94,0.3)" : "hsl(var(--foreground) / 0.06)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-white/8 p-5 mb-6" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        {/* Step title */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${currentStepData.color}15`, border: `1.5px solid ${currentStepData.color}40` }}
          >
            <StepIcon className="w-5 h-5" style={{ color: currentStepData.color }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{currentStepData.label}</h2>
            <p className="text-xs text-white/40">Passo {step} de {STEPS.length}</p>
          </div>
        </div>

        {/* ── Step 1: Peso & Fotos ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-2 block">
                Peso atual (kg)
              </label>
              <div className="relative">
                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                <input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Ex: 72.5"
                  className="w-full h-12 rounded-xl bg-white/5 border border-white/10 pl-9 pr-4 text-lg font-semibold text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/50 transition-colors"
                />
              </div>
            </div>
            <PhotoUploader
              photos={photos}
              onAdd={handleAddPhoto}
              onRemove={handleRemovePhoto}
              uploading={uploadingPhoto}
            />
            <p className="text-xs text-white/25 italic">
              Peso e fotos são opcionais — preencha o que puder.
            </p>
          </div>
        )}

        {/* ── Step 2: Treino ───────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-3 block">
                Como foi sua semana de treinos?
              </label>
              <StarRating value={treinoRating} onChange={setTreinoRating} color={STEPS[1].color} />
              {treinoRating > 0 && (
                <p className="text-sm font-medium mt-2" style={{ color: STEPS[1].color }}>
                  {ratingLabel(treinoRating)}
                </p>
              )}
            </div>
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-2 block">
                Observações sobre o treino (opcional)
              </label>
              <textarea
                value={treinoObs}
                onChange={(e) => setTreinoObs(e.target.value)}
                placeholder="Alguma dificuldade, dor, exercício que não conseguiu fazer?"
                rows={3}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* ── Step 3: Alimentação ──────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-3 block">
                Como foi sua semana de alimentação?
              </label>
              <StarRating value={dietaRating} onChange={setDietaRating} color={STEPS[2].color} />
              {dietaRating > 0 && (
                <p className="text-sm font-medium mt-2" style={{ color: STEPS[2].color }}>
                  {ratingLabel(dietaRating)}
                </p>
              )}
            </div>
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-2 block">
                Observações sobre a alimentação (opcional)
              </label>
              <textarea
                value={dietaObs}
                onChange={(e) => setDietaObs(e.target.value)}
                placeholder="Teve alguma dificuldade com a dieta? Comeu algo fora do planejado?"
                rows={3}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Aderência geral ──────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-3 block">
                Como avalia sua aderência geral à consultoria?
              </label>
              <StarRating value={aderencia} onChange={setAderencia} color={STEPS[3].color} />
              {aderencia > 0 && (
                <p className="text-sm font-medium mt-2" style={{ color: STEPS[3].color }}>
                  {ratingLabel(aderencia)}
                </p>
              )}
            </div>
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider mb-2 block">
                Mensagem para o treinador (opcional)
              </label>
              <textarea
                value={obsGeral}
                onChange={(e) => setObsGeral(e.target.value)}
                placeholder="Dúvidas, sugestões, como está se sentindo no geral..."
                rows={4}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        {step > 1 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="h-12 px-5 rounded-2xl border border-white/10 text-white/60 text-sm font-medium flex items-center gap-2 hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
        )}

        {step < STEPS.length ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
            style={{ background: "var(--cp-gradient)" }}
          >
            Próximo
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canProceed() || submitting}
            className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
            style={{ background: "var(--cp-gradient)" }}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
              : <><Check className="w-4 h-4" />Enviar check-in</>
            }
          </button>
        )}
      </div>
    </div>
  );
};

export default CheckIn;
