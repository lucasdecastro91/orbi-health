import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  ArrowLeft, Play, Weight,
  ChevronDown, ChevronUp, X,
  Timer, Pause, SkipForward, CheckCircle,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TipoCalculo = 'percentual' | 'reducao' | 'aumento' | 'manual';

interface SerieDetalhe {
  id: string;
  tipo: string; // preset key OR any custom name set by the trainer
  repeticoes: string;
  tipo_calculo: TipoCalculo;
  valor_calculo: string;
}

interface Exercise {
  id: string;
  nome_exercicio: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  video_url: string | null;
  observacoes: string | null;
  descricao: string | null;
  exercicio_base_id: string | null;
  carga_base: string | null;
  series_detalhadas: SerieDetalhe[] | null;
}

interface ExerciseQueryResult {
  id: string;
  nome_exercicio: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  video_url: string | null;
  observacoes: string | null;
  exercicio_base_id: string | null;
  ordem: number | null;
  created_at: string | null;
  treino_id: string;
  exercicios_base: { descricao: string | null } | null;
  carga_base?: string | null;
  series_detalhadas?: any;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const getYouTubeVideoId = (url: string | null): string | null => {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return m ? m[1] : null;
};

const getEmbedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

const getThumbnailUrl = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

const extractNumericWeight = (carga: string): number | null => {
  const m = carga.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

const formatWeight = (carga: string, pct: number): string => {
  const w = extractNumericWeight(carga);
  if (!w) return "";
  const m = carga.match(/[a-zA-Z]+/);
  const unit = m ? m[0] : "kg";
  return `${((w * pct) / 100).toFixed(0)}${unit}`;
};

const parseWarmupSets = (observacoes: string | null) => {
  if (!observacoes) return [];
  const lines = observacoes.split("\n");
  const result: Array<{ type: string; pct: number; line: string }> = [];
  for (const line of lines) {
    const warmup = line.match(/warm-?up.*?~?(\d+)%/i);
    const feeder = line.match(/feeder.*?~?(\d+)%/i);
    if (warmup) result.push({ type: "Warm-up", pct: parseInt(warmup[1]), line: line.trim() });
    if (feeder) result.push({ type: "Feeder set", pct: parseInt(feeder[1]), line: line.trim() });
  }
  return result;
};

const parseDescanso = (d: string | null): string => {
  if (!d) return "60s";
  if (d.includes(":")) return d;
  const n = parseInt(d);
  if (isNaN(n)) return d;
  return n >= 60 ? `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}` : `${n}s`;
};

const SERIE_TIPO_CONFIG: Record<string, { label: string; bg: string; text: string; hint?: string }> = {
  'warm-up':      { label: 'Warm-up',    bg: 'rgba(59,130,246,0.12)',    text: '#60a5fa'       },
  'feeder':       { label: 'Feeder',     bg: 'rgba(245,158,11,0.12)',    text: '#fbbf24'       },
  'trabalho':     { label: 'Work Set',   bg: 'rgba(var(--cp-rgb),0.12)', text: 'var(--cp-400)' },
  'tecnica':      { label: 'Técnica',    bg: 'rgba(168,85,247,0.12)',    text: '#c084fc'       },
  'drop-set':     { label: 'Drop Set',   bg: 'rgba(239,68,68,0.12)',     text: '#f87171'       },
  'cluster':      { label: 'Cluster',    bg: 'rgba(34,197,94,0.12)',     text: '#4ade80'       },
  'rest-pause':   { label: 'Rest Pause', bg: 'rgba(251,113,133,0.12)',   text: '#fb7185',
                    hint: '⏱ 20s rest · mesmo peso · até a falha'               },
  'muscle-round': { label: 'Muscle Rnd', bg: 'rgba(34,211,238,0.12)',    text: '#22d3ee',
                    hint: '🔄 18 reps totais · 10-15s ao falhar · mesmo peso'   },
};

/** Calculate load from base + tipo_calculo + valor */
const calcularCarga = (base: string, tipo: TipoCalculo, valor: string): string | null => {
  const b = parseFloat(base.replace(/[^\d.]/g, ''));
  if (isNaN(b) || b <= 0) return null;
  const v = parseFloat(valor);
  switch (tipo) {
    case 'percentual': return isNaN(v) ? null : `${Math.round(b * v / 100)}kg`;
    case 'reducao':    return isNaN(v) ? null : `${Math.round(b * (1 - v / 100))}kg`;
    case 'aumento':    return isNaN(v) ? null : `${Math.round(b * (1 + v / 100))}kg`;
    case 'manual':     return valor || null;
  }
};

/** "60", "1:30" → seconds (numeric) */
const parseDescansoSecs = (d: string | null | undefined): number => {
  if (!d) return 60;
  const str = d.trim();
  if (str.includes(":")) {
    const [m, s] = str.split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
  }
  return Math.max(0, parseInt(str) || 60);
};

/** seconds → "MM:SS" */
const fmtTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

// ─────────────────────────────────────────────────────────────
// Rest Timer Sheet
// ─────────────────────────────────────────────────────────────

interface RestTimerSheetProps {
  open: boolean;
  seconds: number;
  exerciseName: string;
  onClose: () => void;
}

const RestTimerSheet = ({ open, seconds, exerciseName, onClose }: RestTimerSheetProps) => {
  const [remaining, setRemaining] = useState(seconds);
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef    = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (open) {
      setRemaining(seconds);
      setRunning(true);
      setDone(false);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRunning(false);
    }
  }, [open, seconds]);

  const playBeep = useCallback(() => {
    try {
      if (!audioRef.current)
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine"; gain.gain.value = 0.35;
      osc.start(); osc.stop(ctx.currentTime + 0.4);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const g2   = ctx.createGain();
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.frequency.value = 1100; osc2.type = "sine"; g2.gain.value = 0.3;
        osc2.start(); osc2.stop(ctx.currentTime + 0.25);
      }, 500);
    } catch { /* audio not supported */ }
  }, []);

  const vibrate = useCallback(() => {
    try { navigator.vibrate?.([200, 100, 300]); } catch { /* not supported */ }
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            setDone(true);
            playBeep();
            vibrate();
            setTimeout(onClose, 1800);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, playBeep, vibrate, onClose]);

  const r        = 72;
  const circ     = 2 * Math.PI * r;
  const progress = seconds > 0 ? remaining / seconds : 0;
  const offset   = circ * (1 - progress);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-10 pt-6 px-6"
        style={{ backgroundColor: "#111113", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5" />

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Descanso</p>
            <p className="text-sm font-medium text-muted-foreground mt-0.5 truncate max-w-[200px]">
              {exerciseName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center">
            <svg width={200} height={200} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={100} cy={100} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
              <circle
                cx={100} cy={100} r={r} fill="none"
                stroke={done ? "var(--cp-500)" : "hsl(var(--primary))"}
                strokeWidth={8} strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              {done ? (
                <>
                  <CheckCircle className="w-10 h-10 text-green-500 mb-1" />
                  <p className="text-base font-bold text-green-500">Pronto!</p>
                </>
              ) : (
                <>
                  <p className="text-5xl font-bold text-foreground tabular-nums tracking-tight">
                    {fmtTime(remaining)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">{fmtTime(seconds)} total</p>
                </>
              )}
            </div>
          </div>

          {!done && (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setRunning((v) => !v)}
                className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "hsl(var(--foreground) / 0.7)" }}
              >
                {running
                  ? <><Pause className="w-4 h-4" /> Pausar</>
                  : <><Play className="w-4 h-4" /> Continuar</>}
              </button>
              <button
                onClick={onClose}
                className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold"
                style={{ background: "var(--cp-gradient)", color: "var(--cp-text)" }}
              >
                <SkipForward className="w-4 h-4" />
                <span>Pular</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Video Modal
// ─────────────────────────────────────────────────────────────

const VideoModal = ({
  videoId, title, onClose,
}: { videoId: string; title: string; onClose: () => void }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center"
    style={{ backgroundColor: "rgba(0,0,0,0.92)", padding: "16px" }}
    onClick={onClose}
  >
    <div
      className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
      >
        <p className="text-sm font-semibold text-white truncate pr-3">{title}</p>
        <button
          onClick={onClose}
          className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>
      {/* iframe — aspect-ratio 16/9, iframe fills 100% × 100% */}
      <div
        className="relative w-full bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        <iframe
          src={getEmbedUrl(videoId)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
        />
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const ExerciseDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();

  const [exercise, setExercise]     = useState<Exercise | null>(null);
  const [loading, setLoading]       = useState(true);
  const [carga, setCarga]           = useState("");
  const [cargaFetched, setCargaFetched] = useState(false);
  const [alunoId, setAlunoId]       = useState<string | null>(null);
  const [savingCarga, setSavingCarga] = useState(false);
  const [videoOpen, setVideoOpen]   = useState(false);
  const [descOpen, setDescOpen]     = useState(false);
  const [restOpen, setRestOpen]     = useState(false);
  const [restSecs, setRestSecs]     = useState(60);

  useEffect(() => { loadExercise(); getAlunoId(); }, [id]);
  useEffect(() => { if (alunoId && id) loadCarga(); }, [alunoId, id]);

  // Pre-fill carga from exercise.carga_base when student has no saved carga
  useEffect(() => {
    if (exercise && cargaFetched && !carga && exercise.carga_base) {
      setCarga(exercise.carga_base);
    }
  }, [exercise, cargaFetched]);

  // ── data loaders ──────────────────────────────────────────

  const getAlunoId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("alunos").select("id").eq("user_id", user.id).single();
      if (data) setAlunoId(data.id);
    } catch { /* silent */ }
  };

  const loadExercise = async () => {
    try {
      const { data, error } = await supabase
        .from("exercicios")
        .select(`*, exercicios_base ( descricao )`)
        .eq("id", id)
        .single();
      if (error) throw error;
      const q = data as unknown as ExerciseQueryResult;
      const normalizeSerie = (s: any): SerieDetalhe => ({
        id:           s.id ?? '',
        tipo:         s.tipo ?? 'trabalho',
        repeticoes:   s.repeticoes ?? '',
        tipo_calculo: s.tipo_calculo ?? (s.tipo_carga === 'percentual' ? 'percentual' : 'manual'),
        valor_calculo: s.valor_calculo ?? s.valor_carga ?? '',
      });

      const rawSd = (q as any).series_detalhadas;
      const parsedSd: SerieDetalhe[] | null = (() => {
        if (!rawSd) return null;
        const arr = Array.isArray(rawSd) ? rawSd : (() => { try { return JSON.parse(rawSd); } catch { return null; } })();
        return arr ? (arr as any[]).map(normalizeSerie) : null;
      })();

      // Auto-migrate old series format to detailed
      const effectiveSd: SerieDetalhe[] | null = (parsedSd && parsedSd.length > 0)
        ? parsedSd
        : (() => {
            const count = parseInt(q.series);
            if (!count || count <= 0) return null;
            return Array.from({ length: count }, () => ({
              id: crypto.randomUUID(),
              tipo: 'trabalho' as const,
              repeticoes: q.repeticoes || '',
              tipo_calculo: 'manual' as TipoCalculo,
              valor_calculo: '',
            }));
          })();

      setExercise({
        id: q.id,
        nome_exercicio: q.nome_exercicio,
        series: q.series,
        repeticoes: q.repeticoes,
        descanso: q.descanso,
        video_url: q.video_url,
        observacoes: q.observacoes,
        exercicio_base_id: q.exercicio_base_id,
        carga_base: q.carga_base ?? null,
        descricao: q.exercicios_base?.descricao ?? null,
        series_detalhadas: effectiveSd,
      });
    } catch (err: any) {
      toast({ title: "Erro ao carregar exercício", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadCarga = async () => {
    if (!alunoId || !id) return;
    try {
      const { data } = await supabase
        .from("exercicios_carga")
        .select("carga")
        .eq("exercicio_id", id)
        .eq("aluno_id", alunoId)
        .maybeSingle();
      if (data?.carga) setCarga(data.carga);
    } catch { /* silent */ } finally {
      setCargaFetched(true);
    }
  };

  const saveCarga = async () => {
    if (!alunoId || !id || !carga.trim()) {
      toast({ title: "Atenção", description: "Digite uma carga válida", variant: "destructive" });
      return;
    }
    setSavingCarga(true);
    try {
      const { error } = await supabase.from("exercicios_carga").upsert(
        { exercicio_id: id, aluno_id: alunoId, carga: carga.trim(), data_registro: new Date().toISOString() },
        { onConflict: "exercicio_id,aluno_id" }
      );
      if (error) throw error;
      toast({ title: "Carga salva!", description: "Registrada com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar carga", description: err.message, variant: "destructive" });
    } finally {
      setSavingCarga(false);
    }
  };

  const handleBack = () => {
    const weekId  = searchParams.get("weekId");
    const treinoId = searchParams.get("treinoId");
    const params  = new URLSearchParams();
    if (weekId)   params.set("weekId", weekId);
    if (treinoId) params.set("treinoId", treinoId);
    navigate(`/${slug}/aluno/treinos${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // ── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando exercício...</p>
        </div>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-white/40">Exercício não encontrado.</p>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────

  const videoId    = getYouTubeVideoId(exercise.video_url);
  const warmupSets = parseWarmupSets(exercise.observacoes);
  const showWarmup = warmupSets.length > 0 && !!carga.trim() && !(exercise.series_detalhadas?.length);

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Rest timer sheet */}
      <RestTimerSheet
        open={restOpen}
        seconds={restSecs}
        exerciseName={exercise.nome_exercicio}
        onClose={() => setRestOpen(false)}
      />

      {/* Video modal */}
      {videoOpen && videoId && (
        <VideoModal videoId={videoId} title={exercise.nome_exercicio} onClose={() => setVideoOpen(false)} />
      )}

      <div className="min-h-screen pb-24">

        {/* ── Sticky back bar — full-width bg, content capped to match cards ── */}
        <div
          className="sticky top-0 z-10 py-3"
          style={{ backgroundColor: "rgba(9,9,11,0.85)", backdropFilter: "blur(12px)" }}
        >
          <div className="max-w-2xl mx-auto px-4 flex items-center gap-3">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
            >
              <ArrowLeft className="w-4 h-4 text-white/70" />
            </button>
            <h1 className="text-base font-semibold text-foreground truncate flex-1">{exercise.nome_exercicio}</h1>
          </div>
        </div>

        <div className="px-4 space-y-4 pt-2 max-w-2xl mx-auto">

          {/* ── YouTube thumbnail / no-video placeholder ── */}
          {videoId ? (
            /*
             * Aspect-ratio container: a <div> with padding-top:56.25% is the
             * most reliable 16:9 trick on mobile WebViews (including older
             * Android). A <button> as the padding container is NOT reliable —
             * mobile browsers don't always compute % padding-top on <button>.
             * So: div = aspect-ratio holder, button = absolute fill inside it.
             */
            <div
              className="relative w-full rounded-2xl overflow-hidden"
              style={{ paddingTop: "56.25%" }}
            >
              <button
                onClick={() => setVideoOpen(true)}
                className="absolute inset-0 group focus:outline-none"
                style={{ width: "100%", height: "100%", display: "block", padding: 0, border: "none", background: "none" }}
                aria-label="Assistir vídeo"
              >
                <img
                  src={getThumbnailUrl(videoId)}
                  alt={exercise.nome_exercicio}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Dark overlay */}
                <div
                  className="absolute inset-0 transition-opacity duration-200 group-hover:opacity-70"
                  style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                />
                {/* Centred play button */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-transform duration-200 group-hover:scale-110"
                    style={{ background: "var(--cp-gradient)" }}
                  >
                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                  </div>
                </div>
                {/* Label */}
                <div
                  className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-xs text-white/80 font-medium pointer-events-none"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                >
                  Toque para assistir
                </div>
              </button>
            </div>
          ) : (
            /* No-video placeholder */
            <div
              className="relative w-full rounded-2xl overflow-hidden"
              style={{ paddingTop: "56.25%" }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "inherit" }}
              >
                <div className="flex flex-col items-center gap-2 text-white/20">
                  <Play className="w-10 h-10" />
                  <p className="text-xs">Sem vídeo</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Descanso ── */}
          {exercise.descanso && (
            <div
              className="rounded-2xl border flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider leading-none mb-0.5">
                    Descanso entre séries
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {parseDescanso(exercise.descanso)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setRestSecs(parseDescansoSecs(exercise.descanso));
                  setRestOpen(true);
                }}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={{ background: "var(--cp-gradient)", color: "var(--cp-text, #fff)" }}
              >
                <Timer className="w-3.5 h-3.5" />
                Iniciar
              </button>
            </div>
          )}

          {/* ── Carga Base ── (above series so calculations update live as user types) */}
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-1.5">
              <Weight className="w-3.5 h-3.5 text-green-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {exercise.series_detalhadas?.length ? 'Carga Base' : 'Carga Utilizada'}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={exercise.carga_base ? `Sugestão: ${exercise.carga_base}` : "Ex: 40kg, 55kg"}
                value={carga}
                onChange={(e) => setCarga(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCarga()}
                className="flex-1 h-11 rounded-xl px-3 text-sm text-foreground placeholder-muted-foreground/50 outline-none focus:ring-1"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  // @ts-ignore
                  "--tw-ring-color": "rgba(var(--cp-rgb), 0.5)",
                }}
              />
              <button
                onClick={saveCarga}
                disabled={savingCarga}
                className="h-11 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ background: "var(--cp-gradient)" }}
              >
                {savingCarga ? "..." : "Salvar"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              {exercise.series_detalhadas?.some(s => s.tipo_calculo !== 'manual')
                ? 'Este valor é usado como base para o cálculo automático das séries abaixo'
                : 'Registre o peso utilizado neste exercício'}
            </p>
          </div>

          {/* ── Séries Detalhadas ── */}
          {exercise.series_detalhadas && exercise.series_detalhadas.length > 0 && (
            <div
              className="rounded-2xl border p-4 space-y-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  Séries Detalhadas
                </p>
                {carga.trim() && (
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--cp-400)' }}>
                    Base: {carga}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {exercise.series_detalhadas.map((serie, idx) => {
                  const cfg = SERIE_TIPO_CONFIG[serie.tipo] ?? {
                    label: serie.tipo || 'Custom',
                    bg: 'rgba(255,255,255,0.08)',
                    text: 'rgba(255,255,255,0.55)',
                  };
                  const tipoCalculo = serie.tipo_calculo;
                  const valorCalculo = serie.valor_calculo;

                  const calculatedLoad = tipoCalculo !== 'manual' && carga.trim()
                    ? calcularCarga(carga, tipoCalculo, valorCalculo)
                    : null;
                  const manualLoad = tipoCalculo === 'manual' ? valorCalculo || null : null;

                  return (
                    <div
                      key={serie.id || idx}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    >
                      <span
                        className="text-[10px] font-bold tabular-nums shrink-0 text-muted-foreground/60"
                        style={{ width: 16 }}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0"
                        style={{ backgroundColor: cfg.bg, color: cfg.text }}
                      >
                        {cfg.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-muted-foreground font-medium">
                          {serie.repeticoes ? `${serie.repeticoes} reps` : '—'}
                        </span>
                        {cfg.hint && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-snug">
                            {cfg.hint}
                          </p>
                        )}
                      </div>
                      {/* Load display */}
                      {(calculatedLoad || manualLoad) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {calculatedLoad && carga.trim() && (
                            <span className="text-[11px] text-muted-foreground/60">
                              {carga} →
                            </span>
                          )}
                          <span className="text-sm font-bold" style={{ color: 'var(--cp-400)' }}>
                            {calculatedLoad ?? manualLoad}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Hint when no carga and series need it */}
              {!carga.trim() && exercise.series_detalhadas.some(s => s.tipo_calculo !== 'manual') && (
                <p className="text-[11px] text-muted-foreground/70">
                  ↑ Digite sua carga acima para ver os pesos calculados automaticamente
                </p>
              )}
            </div>
          )}

          {/* ── Warm-up / Feeder auto-calc ── */}
          {showWarmup && (
            <div
              className="rounded-2xl border p-4 space-y-2.5"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.04)", borderColor: "rgba(var(--cp-rgb),0.15)" }}
            >
              <p className="text-xs text-green-500/70 uppercase tracking-wider font-medium">
                Cargas calculadas automaticamente
              </p>
              {warmupSets.map((ws, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  <div>
                    <p className="text-sm text-white/80 font-medium">{ws.type}</p>
                    <p className="text-[11px] text-white/35">{ws.pct}% da carga de trabalho</p>
                  </div>
                  <p className="text-lg font-bold text-green-500">{formatWeight(carga, ws.pct)}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Descrição técnica (collapsible) ── */}
          {exercise.descricao && (
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <button
                onClick={() => setDescOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <p className="text-sm font-semibold text-foreground/70">Instruções técnicas</p>
                {descOpen
                  ? <ChevronUp className="w-4 h-4 text-white/30" />
                  : <ChevronDown className="w-4 h-4 text-white/30" />}
              </button>
              {descOpen && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed pt-3">
                    {exercise.descricao}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Observações ── */}
          {exercise.observacoes && (
            <div
              className="rounded-2xl border p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Observações do treinador</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {exercise.observacoes}
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default ExerciseDetail;
