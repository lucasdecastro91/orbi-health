import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { grantXP } from "@/lib/xp";
import { evaluateAndUpdateStreak } from "@/lib/streaks";
import {
  Dumbbell, Calendar, ChevronDown, ChevronRight,
  Play, Clock, Loader2, MessageSquare, CheckCircle2, TrendingUp, Wind, X, History,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Exercise {
  id: string;
  nome_exercicio: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  video_url: string | null;
  observacoes: string | null;
  ordem: number;
  series_detalhadas?: any;
  conjugado_com_proximo?: boolean;
}

interface Training {
  id: string;
  titulo_treino: string;
  dia_semana: string;
  descricao_geral: string | null;
  ordem: number;
  exercicios: Exercise[];
}

interface Week {
  id: string;
  semana_inicio: number;
  semana_fim: number;
  zona_reps: string | null;
  observacoes: string | null;
  treinos: Training[];
}

interface Plano {
  nome_plano: string;
  objetivo: string | null;
  data_inicio: string;
  data_fim: string | null;
}

interface Stretching {
  id: string;
  nome: string;
  series: number;
  duracao_segundos: number;
  instrucoes: string | null;
  video_url: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const hasVideo = (url: string | null) => !!url;

/** Brazil local date YYYY-MM-DD */
const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

/** Quantas séries um exercício espera (série detalhada, ou fallback pro campo `series`) */
const getExpectedSerieCount = (ex: Exercise): number => {
  const raw = ex.series_detalhadas;
  if (raw) {
    const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return null; } })();
    if (Array.isArray(arr) && arr.length > 0) {
      // Cada bloco pode valer por várias séries físicas (campo `quantidade`) — soma, não conta blocos
      return arr.reduce((sum: number, s: any) => sum + (typeof s.quantidade === 'number' && s.quantidade >= 1 ? s.quantidade : 1), 0);
    }
  }
  const count = parseInt(ex.series);
  return !count || count <= 0 ? 0 : count;
};

/** Progresso de séries concluídas hoje num treino inteiro (soma de todos os exercícios) */
const getTrainingSerieProgress = (
  training: Training,
  serieCompletionCounts: Record<string, number>,
): { done: number; total: number } => {
  let done = 0;
  let total = 0;
  for (const ex of training.exercicios) {
    const expected = getExpectedSerieCount(ex);
    if (expected <= 0) continue; // exercício sem séries rastreáveis não bloqueia o treino
    total += expected;
    done += Math.min(serieCompletionCounts[ex.id] ?? 0, expected);
  }
  return { done, total };
};

/** Normalize DB tipo variants to canonical key */
const normalizeTipo = (tipo: string): string => {
  switch ((tipo ?? '').trim().toLowerCase()) {
    case 'work set': case 'work': return 'trabalho';
    case 'warm up':  case 'warmup': return 'warm-up';
    case 'feeder set': return 'feeder';
    default: return (tipo ?? '').trim();
  }
};

/** Return summary string showing only work sets count × reps */
const getWorkSetSummary = (exercise: Exercise): string => {
  const sd = exercise.series_detalhadas;
  if (!sd || !Array.isArray(sd) || sd.length === 0) {
    return `${exercise.series}×${exercise.repeticoes}`;
  }
  const workSets = sd.filter((s: any) => normalizeTipo(s.tipo ?? '') === 'trabalho');
  if (workSets.length === 0) {
    return `${exercise.series}×${exercise.repeticoes}`;
  }
  const totalQty = workSets.reduce((sum: number, s: any) => sum + (typeof s.quantidade === 'number' ? s.quantidade : 1), 0);
  const reps = workSets.map((s: any) => s.repeticoes).filter(Boolean);
  const uniqueReps = [...new Set(reps)];
  const repStr = uniqueReps.length === 1 ? uniqueReps[0] : uniqueReps.join('/');
  return `${totalQty}× ${repStr}`;
};

/** Agrupa exercícios encadeados por `conjugado_com_proximo` (bi-set/tri-set/giant-set) */
const groupExercises = (exercicios: Exercise[]): Exercise[][] => {
  const groups: Exercise[][] = [];
  let current: Exercise[] = [];
  for (const ex of exercicios) {
    current.push(ex);
    if (!ex.conjugado_com_proximo) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
};

const GROUP_LABEL: Record<number, string> = { 2: "Bi-set", 3: "Tri-set" };

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** Compact exercise row inside a training */
const ExerciseRow = ({
  exercise,
  index,
  onClick,
}: { exercise: Exercise; index: number; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
  >
    {/* Index badge */}
    <span
      className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)", color: "var(--cp-400)" }}
    >
      {String(index + 1).padStart(2, "0")}
    </span>

    {/* Name + meta */}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-foreground truncate">{exercise.nome_exercicio}</p>
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        <span className="text-[11px] text-muted-foreground">
          {getWorkSetSummary(exercise)}
        </span>
        {exercise.conjugado_com_proximo ? (
          <span className="text-[11px] font-medium" style={{ color: "var(--cp-400)" }}>
            sem descanso ↓
          </span>
        ) : exercise.descanso && (
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Clock className="w-2.5 h-2.5" />
            {exercise.descanso}s
          </span>
        )}
      </div>
    </div>

    {/* Video indicator */}
    {hasVideo(exercise.video_url) && (
      <span
        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)" }}
      >
        <Play className="w-3 h-3 ml-0.5" style={{ color: "var(--cp-500)" }} />
      </span>
    )}

    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-40 shrink-0" />
  </button>
);

/** Collapsible training block inside a week */
const TrainingBlock = ({
  training,
  isOpen,
  onToggle,
  onExerciseClick,
  completedToday,
  onMarkComplete,
  completing,
  serieCompletionCounts,
}: {
  training: Training;
  isOpen: boolean;
  onToggle: () => void;
  onExerciseClick: (exId: string, weekId?: string, treinoId?: string) => void;
  completedToday: boolean;
  onMarkComplete: (treinoId: string) => void;
  completing: boolean;
  serieCompletionCounts: Record<string, number>;
}) => {
  const { done: seriesDone, total: seriesTotal } = getTrainingSerieProgress(training, serieCompletionCounts);
  const seriesPending = seriesTotal > 0 && seriesDone < seriesTotal;

  return (
  <div
    className="rounded-2xl border overflow-hidden transition-colors"
    style={{
      borderColor: completedToday ? "rgba(var(--cp-rgb),0.3)" : "var(--border-subtle)",
      backgroundColor: completedToday ? "rgba(var(--cp-rgb),0.03)" : undefined,
    }}
  >
    {/* Training header */}
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/2 transition-colors text-left"
    >
      {/* Completed indicator / dot */}
      {completedToday
        ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
        : <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "var(--cp-500)" }} />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{training.titulo_treino}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{training.dia_semana}</p>
      </div>
      {completedToday && (
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 mr-1"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)", color: "var(--cp-400)" }}
        >
          Feito hoje
        </span>
      )}
      <span className="text-xs text-muted-foreground shrink-0 mr-1">
        {training.exercicios.length} ex.
      </span>
      <ChevronDown
        className="w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0"
        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
      />
    </button>

    {/* Collapsible content */}
    <div
      style={{
        display: "grid",
        gridTemplateRows: isOpen ? "1fr" : "0fr",
        transition: "grid-template-rows 250ms ease",
      }}
    >
      <div className="overflow-hidden">
        {/* Description */}
        {training.descricao_geral && (
          <div
            className="mx-4 mb-3 mt-1 px-3 py-2.5 rounded-xl text-xs text-muted-foreground leading-relaxed whitespace-pre-line"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", borderLeft: "2px solid var(--cp-500)" }}
          >
            {training.descricao_geral}
          </div>
        )}

        {/* Exercise list — exercícios conjugados (bi-set/tri-set) ficam agrupados visualmente */}
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
          {groupExercises(training.exercicios).map((group) => {
            if (group.length === 1) {
              const ex = group[0];
              const idx = training.exercicios.findIndex((e) => e.id === ex.id);
              return (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  index={idx}
                  onClick={() => onExerciseClick(ex.id, undefined, training.id)}
                />
              );
            }
            return (
              <div key={group[0].id} className="flex py-1.5">
                <div className="w-3 shrink-0 flex justify-center">
                  <div className="w-0.5 rounded-full my-1" style={{ backgroundColor: "var(--cp-500)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ml-1 mb-1"
                    style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)", color: "var(--cp-400)" }}
                  >
                    {GROUP_LABEL[group.length] ?? "Giant set"}
                  </span>
                  {group.map((ex) => {
                    const idx = training.exercicios.findIndex((e) => e.id === ex.id);
                    return (
                      <ExerciseRow
                        key={ex.id}
                        exercise={ex}
                        index={idx}
                        onClick={() => onExerciseClick(ex.id, undefined, training.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Mark complete button ── */}
        <div className="px-4 pt-2 pb-3">
          <button
            onClick={() => onMarkComplete(training.id)}
            disabled={completing || completedToday || seriesPending}
            className="w-full h-10 rounded-xl text-sm font-semibold transition-all active:scale-98 disabled:opacity-60 flex items-center justify-center gap-2"
            style={completedToday
              ? { backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }
              : { background: "var(--cp-gradient)", color: "#fff" }
            }
          >
            {completing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <CheckCircle2 className="w-4 h-4" />
            }
            {completedToday ? "Treino concluído hoje ✓" : "Marcar treino como concluído"}
          </button>
          {!completedToday && seriesPending && (
            <p className="text-[11px] text-muted-foreground text-center mt-1.5">
              Conclua todas as séries para liberar ({seriesDone}/{seriesTotal})
            </p>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};

/** Collapsible week section */
const WeekSection = ({
  week,
  isOpen,
  onToggle,
  openTreinos,
  onTreinoToggle,
  onExerciseClick,
  completedTodayIds,
  onMarkComplete,
  completingId,
  serieCompletionCounts,
}: {
  week: Week;
  isOpen: boolean;
  onToggle: () => void;
  openTreinos: string[];
  onTreinoToggle: (id: string) => void;
  onExerciseClick: (exId: string) => void;
  completedTodayIds: string[];
  onMarkComplete: (treinoId: string) => void;
  completingId: string | null;
  serieCompletionCounts: Record<string, number>;
}) => (
  <div className="rounded-2xl border border-border overflow-hidden bg-card">
    {/* Week header */}
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/2 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-foreground">
            Semana {week.semana_inicio}
            {week.semana_fim !== week.semana_inicio && `–${week.semana_fim}`}
          </span>
          {week.zona_reps && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)", color: "var(--cp-400)" }}
            >
              {week.zona_reps}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {week.treinos.length} treino{week.treinos.length !== 1 ? "s" : ""}
        </p>
      </div>
      <ChevronDown
        className="w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0"
        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
      />
    </button>

    {/* Collapsible content */}
    <div
      style={{
        display: "grid",
        gridTemplateRows: isOpen ? "1fr" : "0fr",
        transition: "grid-template-rows 250ms ease",
      }}
    >
      <div className="overflow-hidden">
        <div className="px-4 pb-4 space-y-3">
          {/* Week observations */}
          {week.observacoes && (
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line px-1">
              {week.observacoes}
            </p>
          )}

          {/* Trainings */}
          {week.treinos.map((treino) => (
            <TrainingBlock
              key={treino.id}
              training={treino}
              isOpen={openTreinos.includes(treino.id)}
              onToggle={() => onTreinoToggle(treino.id)}
              onExerciseClick={onExerciseClick}
              completedToday={completedTodayIds.includes(treino.id)}
              onMarkComplete={onMarkComplete}
              completing={completingId === treino.id}
              serieCompletionCounts={serieCompletionCounts}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Stretching section (student view)
// ─────────────────────────────────────────────────────────────

const getYouTubeVideoId = (url: string | null): string | null => {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&\s/?]+)/);
  return m ? m[1] : null;
};

const getEmbedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

const formatAlongMetrica = (s: Stretching) => {
  if (!s.duracao_segundos) return '—';
  if (s.duracao_segundos < 0) {
    const r = Math.abs(s.duracao_segundos);
    return `${r} rep${r !== 1 ? 's' : ''}`;
  }
  return `${s.duracao_segundos}s`;
};

const AlongamentosSection = ({ stretchings }: { stretchings: Stretching[] }) => {
  const [open,       setOpen]       = useState(false);
  const [videoModal, setVideoModal] = useState<{ id: string; title: string } | null>(null);

  if (stretchings.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Video modal — same as ExerciseDetail */}
      {videoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.92)", padding: "16px" }}
          onClick={() => setVideoModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <p className="text-sm font-semibold text-white truncate pr-3">{videoModal.title}</p>
              <button onClick={() => setVideoModal(null)}
                className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div className="relative w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
              <iframe
                src={getEmbedUrl(videoModal.id)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={videoModal.title}
              />
            </div>
          </div>
        </div>
      )}

      {/* Collapsible header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-border bg-card hover:bg-white/2 transition-colors text-left"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}
        >
          <Wind className="w-5 h-5" style={{ color: "var(--cp-500)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Rotina de Alongamentos</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stretchings.length} exercício{stretchings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mr-1"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}
        >
          {stretchings.length}
        </span>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Animated list */}
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 280ms ease" }}>
        <div className="overflow-hidden">
          <div className="space-y-2 pt-1 pb-1">
            {stretchings.map((s, idx) => {
              const videoId = getYouTubeVideoId(s.video_url);
              return (
                <div key={s.id} className="rounded-2xl border border-border flex items-stretch overflow-hidden bg-card">
                  <div className="w-1 shrink-0 self-stretch" style={{ background: "var(--cp-gradient)" }} />
                  <div className="flex items-start gap-3 flex-1 px-4 py-3">
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{s.nome}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", color: "var(--cp-400)" }}
                        >
                          {s.series}× série{s.series !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatAlongMetrica(s)}
                        </span>
                      </div>
                      {s.instrucoes && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{s.instrucoes}</p>
                      )}
                    </div>
                    {videoId && (
                      <button
                        onClick={() => setVideoModal({ id: videoId, title: s.nome })}
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                        style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}
                      >
                        <Play className="w-4 h-4 ml-0.5" style={{ color: "var(--cp-500)" }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Treinos = () => {
  const { slug, orgId }  = useTenantContext();
  const navigate         = useNavigate();
  const { toast }        = useToast();
  const [searchParams]   = useSearchParams();

  const [plano,          setPlano]          = useState<Plano | null>(null);
  const [weeks,          setWeeks]          = useState<Week[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [openWeeks,      setOpenWeeks]      = useState<string[]>([]);
  const [openTreinos,    setOpenTreinos]    = useState<string[]>([]);
  // Stretching routine
  const [stretchings,    setStretchings]    = useState<Stretching[]>([]);
  // Completion tracking
  const [alunoId,        setAlunoId]        = useState<string | null>(null);
  const [studentUserId,  setStudentUserId]  = useState<string | null>(null);
  const [treinadorId,    setTreinadorId]    = useState<string | null>(null);
  const [alunoNome,      setAlunoNome]      = useState<string | null>(null);
  const [planoId,        setPlanoId]        = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState<string[]>([]); // treino_ids logged today
  const [monthCount,     setMonthCount]     = useState(0);            // total logs this month
  const [completingId,   setCompletingId]   = useState<string | null>(null);
  const [serieCompletionCounts, setSerieCompletionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadTrainingPlan();
    markPlanAsViewed();
  }, []);

  // Re-load completion data whenever alunoId becomes available
  useEffect(() => {
    if (alunoId) loadCompletions(alunoId);
  }, [alunoId]);

  // Recarrega as séries concluídas hoje sempre que entrar/voltar pra essa tela
  // (ex: volta do detalhe de um exercício depois de marcar séries como feitas)
  useEffect(() => {
    if (studentUserId) loadSerieCompletionCounts(studentUserId);
  }, [studentUserId, searchParams]);

  useEffect(() => {
    const onFocus = () => { if (studentUserId) loadSerieCompletionCounts(studentUserId); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [studentUserId]);

  // Auto-open week/training from query params (e.g., from notifications)
  useEffect(() => {
    const weekId   = searchParams.get("weekId");
    const treinoId = searchParams.get("treinoId");
    if (weekId   && !openWeeks.includes(weekId))     setOpenWeeks(prev   => [...prev, weekId]);
    if (treinoId && !openTreinos.includes(treinoId)) setOpenTreinos(prev => [...prev, treinoId]);
  }, [searchParams, weeks]);

  // ── Data loading ──────────────────────────────────────────

  const loadTrainingPlan = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setStudentUserId(session.user.id);

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id, treinador_id")
        .eq("user_id", session.user.id)
        .single();

      if (!aluno) return;
      setAlunoId(aluno.id);
      if (aluno.treinador_id) setTreinadorId(aluno.treinador_id);
      const { data: profile } = await supabase.from("profiles").select("nome").eq("id", session.user.id).maybeSingle();
      if (profile?.nome) setAlunoNome(profile.nome);
      loadStretchings(aluno.id);

      const { data: planoData } = await supabase
        .from("planos_treino")
        .select("id, nome_plano, objetivo, data_inicio, data_fim")
        .eq("aluno_id", aluno.id)
        .eq("ativo", true)
        .maybeSingle();

      if (!planoData) { setLoading(false); return; }
      setPlano(planoData);
      setPlanoId(planoData.id);

      const { data: semanasData, error: semanasError } = await supabase
        .from("semanas")
        .select(`
          id, semana_inicio, semana_fim, zona_reps, observacoes,
          treinos (
            id, titulo_treino, dia_semana, descricao_geral, ordem,
            exercicios (
              id, nome_exercicio, series, repeticoes,
              descanso, video_url, observacoes, ordem, series_detalhadas,
              conjugado_com_proximo
            )
          )
        `)
        .eq("plano_id", planoData.id)
        .order("semana_inicio", { ascending: true });

      if (semanasError) throw semanasError;

      const sortedWeeks: Week[] = semanasData.map((week: any) => ({
        ...week,
        treinos: [...week.treinos]
          .sort((a: Training, b: Training) => a.ordem - b.ordem)
          .map((treino: any) => ({
            ...treino,
            exercicios: [...treino.exercicios].sort(
              (a: Exercise, b: Exercise) => a.ordem - b.ordem
            ),
          })),
      }));

      setWeeks(sortedWeeks);

      // Auto-open the first week by default
      if (sortedWeeks.length > 0 && !searchParams.get("weekId")) {
        setOpenWeeks([sortedWeeks[0].id]);
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar treinos", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadStretchings = async (aid: string) => {
    try {
      const { data } = await supabase
        .from('alongamentos')
        .select('id, nome, series, duracao_segundos, instrucoes, video_url')
        .eq('aluno_id', aid)
        .order('created_at', { ascending: true });
      if (data) setStretchings(data);
    } catch { /* fail silently */ }
  };

  const loadCompletions = async (aid: string) => {
    try {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const today    = now.toISOString().slice(0, 10);
      const { data } = await supabase
        .from('treino_sessoes_log')
        .select('treino_id, data_conclusao')
        .eq('aluno_id', aid)
        .gte('data_conclusao', firstDay);
      if (data) {
        setMonthCount(data.length);
        setCompletedToday(data.filter(r => r.data_conclusao === today).map(r => r.treino_id));
      }
    } catch { /* table may not exist yet — fail silently */ }
  };

  const loadSerieCompletionCounts = async (uid: string) => {
    try {
      const { data } = await supabase
        .from('serie_completions')
        .select('exercicio_id')
        .eq('student_id', uid)
        .eq('date', brazilToday());
      if (data) {
        const counts: Record<string, number> = {};
        for (const row of data as any[]) counts[row.exercicio_id] = (counts[row.exercicio_id] ?? 0) + 1;
        setSerieCompletionCounts(counts);
      }
    } catch { /* table may not exist yet — fail silently */ }
  };

  const markComplete = async (treinoId: string) => {
    if (!alunoId || completedToday.includes(treinoId)) return;
    setCompletingId(treinoId);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('treino_sessoes_log').insert({
        aluno_id: alunoId,
        plano_id: planoId,
        treino_id: treinoId,
        data_conclusao: today,
      });
      if (error) throw error;
      setCompletedToday(prev => [...prev, treinoId]);
      setMonthCount(prev => prev + 1);
      toast({ title: 'Treino registrado!', description: 'Continue assim' });
      if (studentUserId && orgId) {
        void grantXP(studentUserId, orgId, "workout_complete");
        void evaluateAndUpdateStreak(studentUserId, orgId);
      }
      if (treinadorId && alunoId && orgId) {
        const todayStr = new Date().toISOString().slice(0, 10);
        void (async () => {
          try {
            const { data: existing } = await supabase.from("notificacoes")
              .select("id").eq("user_id", treinadorId).eq("aluno_id", alunoId)
              .eq("tipo", "treino_completo").gte("created_at", todayStr).limit(1);
            if (!existing || existing.length === 0) {
              await supabase.from("notificacoes").insert({
                user_id: treinadorId, org_id: orgId, aluno_id: alunoId, aluno_nome: alunoNome,
                titulo: "Treino concluído",
                mensagem: `${alunoNome ?? "Um aluno"} concluiu o treino de hoje.`,
                tipo: "treino_completo",
              });
            }
          } catch {}
        })();
      }
    } catch (e: any) {
      toast({ title: 'Erro ao registrar', description: e.message, variant: 'destructive' });
    } finally {
      setCompletingId(null);
    }
  };

  const markPlanAsViewed = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: aluno } = await supabase
        .from("alunos").select("id").eq("user_id", session.user.id).single();
      if (!aluno) return;
      await supabase
        .from("planos_treino")
        .update({ visto_pelo_aluno_em: new Date().toISOString() })
        .eq("aluno_id", aluno.id)
        .eq("ativo", true);
    } catch (err) {
      console.error("Erro ao marcar plano como visto:", err);
    }
  };

  // ── Toggle helpers ───────────────────────────────────────

  const toggleWeek = (id: string) =>
    setOpenWeeks(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);

  const toggleTreino = (id: string) =>
    setOpenTreinos(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const goToExercise = (exId: string, _weekId?: string, treinoId?: string) => {
    const params = treinoId ? `?treinoId=${treinoId}` : '';
    navigate(`/${slug}/aluno/exercicio/${exId}${params}`);
  };

  // ── Loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Carregando...</span>
      </div>
    );
  }

  // ── Empty state (no active plan) ─────────────────────────

  if (!plano) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Dumbbell className="w-5 h-5" style={{ color: "var(--cp-500)" }} />
          <div>
            <h1 className="text-xl font-bold text-foreground">Treinos</h1>
            <p className="text-sm text-muted-foreground">Seu plano de treino personalizado</p>
          </div>
        </div>

        {/* Empty card */}
        <div
          className="rounded-2xl border border-border py-14 flex flex-col items-center gap-3 text-center px-6"
          style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            <Dumbbell className="w-6 h-6 text-muted-foreground opacity-50" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground mb-1">Nenhum treino ativo</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Seu treinador ainda não liberou seu plano
            </p>
          </div>
          <button
            onClick={() => navigate(`/${slug}/aluno/mensagens`)}
            className="mt-2 flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--cp-gradient)" }}
          >
            <MessageSquare className="w-4 h-4" />
            Falar com treinador
          </button>
        </div>
      </div>
    );
  }

  // ── Main content ─────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Dumbbell className="w-5 h-5 shrink-0" style={{ color: "var(--cp-500)" }} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Treinos</h1>
            <p className="text-sm text-muted-foreground">Seu plano de treino personalizado</p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/${slug}/aluno/treinos/historico`)}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
          title="Ver histórico"
        >
          <History className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Monthly completion stats */}
      {monthCount > 0 && (() => {
        const totalSessions = weeks.reduce((n, w) => n + w.treinos.length, 0);
        const expected = Math.max(1, totalSessions * 4);
        const pct = Math.min(100, Math.round((monthCount / expected) * 100));
        const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long' });
        return (
          <div
            className="rounded-2xl border px-4 py-3 space-y-2"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.04)", borderColor: "rgba(var(--cp-rgb),0.2)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
                <span className="text-xs font-semibold text-foreground capitalize">{monthName}</span>
              </div>
              <span className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-white/8">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "var(--cp-gradient)" }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {monthCount} treino{monthCount !== 1 ? 's' : ''} concluído{monthCount !== 1 ? 's' : ''}
              {' · '}meta {expected} no mês
            </p>
          </div>
        );
      })()}

      {/* Plan info card */}
      <div
        className="rounded-2xl px-4 py-4"
        style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", border: "1px solid rgba(var(--cp-rgb),0.2)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}
          >
            <Calendar className="w-5 h-5" style={{ color: "var(--cp-500)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-foreground leading-tight">{plano.nome_plano}</p>
            {plano.objetivo && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{plano.objetivo}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}
              >
                Ativo
              </span>
              <span className="text-[11px] text-muted-foreground">
                Desde {formatDate(plano.data_inicio)}
                {plano.data_fim && ` · até ${formatDate(plano.data_fim)}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stretching routine */}
      <AlongamentosSection stretchings={stretchings} />

      {/* Weeks */}
      {weeks.length === 0 ? (
        <div
          className="rounded-2xl border border-border py-10 text-center"
          style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-muted-foreground text-sm">Nenhum treino cadastrado neste plano ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {weeks.length} semana{weeks.length !== 1 ? "s" : ""}
          </p>
          {weeks.map((week) => (
            <WeekSection
              key={week.id}
              week={week}
              isOpen={openWeeks.includes(week.id)}
              onToggle={() => toggleWeek(week.id)}
              openTreinos={openTreinos}
              onTreinoToggle={toggleTreino}
              onExerciseClick={goToExercise}
              completedTodayIds={completedToday}
              onMarkComplete={markComplete}
              completingId={completingId}
              serieCompletionCounts={serieCompletionCounts}
            />
          ))}
        </div>
      )}

    </div>
  );
};

export default Treinos;
