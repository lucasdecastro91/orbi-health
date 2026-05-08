import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Dumbbell, Calendar, ChevronDown, ChevronRight,
  Play, Clock, Loader2, MessageSquare,
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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const hasVideo = (url: string | null) => !!url;

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
          {exercise.series}×{exercise.repeticoes}
        </span>
        {exercise.descanso && (
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
}: {
  training: Training;
  isOpen: boolean;
  onToggle: () => void;
  onExerciseClick: (exId: string, weekId?: string, treinoId?: string) => void;
}) => (
  <div className="rounded-2xl border border-border overflow-hidden">
    {/* Training header */}
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/2 transition-colors text-left"
    >
      {/* Colored dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: "var(--cp-500)" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{training.titulo_treino}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{training.dia_semana}</p>
      </div>
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

        {/* Exercise list */}
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
          {training.exercicios.map((ex, idx) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              index={idx}
              onClick={() => onExerciseClick(ex.id)}
            />
          ))}
        </div>

        {/* Bottom spacer */}
        <div className="h-1" />
      </div>
    </div>
  </div>
);

/** Collapsible week section */
const WeekSection = ({
  week,
  isOpen,
  onToggle,
  openTreinos,
  onTreinoToggle,
  onExerciseClick,
}: {
  week: Week;
  isOpen: boolean;
  onToggle: () => void;
  openTreinos: string[];
  onTreinoToggle: (id: string) => void;
  onExerciseClick: (exId: string) => void;
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
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Treinos = () => {
  const { slug }         = useTenantContext();
  const navigate         = useNavigate();
  const { toast }        = useToast();
  const [searchParams]   = useSearchParams();

  const [plano,        setPlano]       = useState<Plano | null>(null);
  const [weeks,        setWeeks]       = useState<Week[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [openWeeks,    setOpenWeeks]   = useState<string[]>([]);
  const [openTreinos,  setOpenTreinos] = useState<string[]>([]);

  useEffect(() => {
    loadTrainingPlan();
    markPlanAsViewed();
  }, []);

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

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!aluno) return;

      const { data: planoData } = await supabase
        .from("planos_treino")
        .select("id, nome_plano, objetivo, data_inicio, data_fim")
        .eq("aluno_id", aluno.id)
        .eq("ativo", true)
        .maybeSingle();

      if (!planoData) { setLoading(false); return; }
      setPlano(planoData);

      const { data: semanasData, error: semanasError } = await supabase
        .from("semanas")
        .select(`
          id, semana_inicio, semana_fim, zona_reps, observacoes,
          treinos (
            id, titulo_treino, dia_semana, descricao_geral, ordem,
            exercicios (
              id, nome_exercicio, series, repeticoes,
              descanso, video_url, observacoes, ordem
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

  const goToExercise = (exId: string) => {
    // Navigate to exercise detail — preserve week/treino context if available
    navigate(`/${slug}/aluno/exercicio/${exId}`);
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
      <div className="flex items-center gap-3">
        <Dumbbell className="w-5 h-5" style={{ color: "var(--cp-500)" }} />
        <div>
          <h1 className="text-xl font-bold text-foreground">Treinos</h1>
          <p className="text-sm text-muted-foreground">Seu plano de treino personalizado</p>
        </div>
      </div>

      {/* Plan info card */}
      <div
        className="rounded-2xl border border-border px-4 py-4"
        style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
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
            />
          ))}
        </div>
      )}

    </div>
  );
};

export default Treinos;
