import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { startTimer, pauseTimer, clearTimer, getActiveTimer } from "@/lib/activeTimer";
import {
  ArrowLeft, Play, Weight,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X,
  Timer, Pause, SkipForward, CheckCircle, TrendingUp,
  Circle, AlertCircle, Link2,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";

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
  quantidade: number; // quantas vezes repetir este bloco (default 1)
  observacoes?: string; // per-serie note set by trainer
  descanso?: string | null; // descanso específico desse tipo de série (sobrescreve o do exercício)
}

/** Carga + reps realizadas num slot físico de uma série (uma série com quantidade=2 tem 2 slots) */
interface SlotValue {
  reps: string;
  carga: string;
  saved: boolean; // true quando os dois campos foram preenchidos e persistidos
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
  treino_id: string;
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

const SERIE_TIPO_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  'warm-up':      { label: 'Warm-up',    bg: 'rgba(59,130,246,0.12)',    text: '#60a5fa'       },
  'feeder':       { label: 'Feeder',     bg: 'rgba(245,158,11,0.12)',    text: '#fbbf24'       },
  'trabalho':     { label: 'Work Set',   bg: 'rgba(var(--cp-rgb),0.12)', text: 'var(--cp-400)' },
  'tecnica':      { label: 'Técnica',    bg: 'rgba(168,85,247,0.12)',    text: '#c084fc'       },
  'drop-set':     { label: 'Drop Set',   bg: 'rgba(239,68,68,0.12)',     text: '#f87171'       },
  'cluster':      { label: 'Cluster',    bg: 'rgba(34,197,94,0.12)',     text: '#4ade80'       },
  'rest-pause':   { label: 'Rest Pause', bg: 'rgba(251,113,133,0.12)',   text: '#fb7185'       },
  'muscle-round': { label: 'Muscle Rnd', bg: 'rgba(34,211,238,0.12)',    text: '#22d3ee'       },
};

// Hardcoded fallback hints — used only when org has no global config set.
const DEFAULT_SERIE_HINT: Record<string, string> = {
  'warm-up':      'Execute com carga leve para aquecer as articulações e preparar o músculo. Não force ao máximo — o objetivo é ativar, não fadigar.',
  'feeder':       'Execute com peso moderado antes das séries de trabalho para sentir o movimento e calibrar a conexão mente-músculo.',
  'trabalho':     'Série principal. Execute dentro da zona de repetições com máxima concentração e conexão mente-músculo.',
  'drop-set':     'Execute as repetições normalmente e, em seguida, reduza o peso conforme o % indicado e execute até a falha. A carga exibida já é a carga reduzida.',
  'rest-pause':   'Execute as repetições da série normalmente. Descanse 20 segundos e, com o mesmo peso, execute até a falha.',
  'muscle-round': 'Execute 18 repetições totais. Ao chegar à falha, descanse 10 segundos e retome de onde parou até completar as 18 reps.',
};

/** Gera a descrição dinâmica do Cluster com base no número de reps da série. */
const buildClusterHint = (repeticoes: string): string => {
  const reps = parseInt(repeticoes);
  if (!isNaN(reps) && reps > 0) {
    const rpb = Math.ceil(reps / 3);
    return `Aumente a carga conforme o % indicado. Realize 3 blocos de ${rpb} reps com 20 segundos de descanso entre cada (3×${rpb} = ${3 * rpb} reps total). A carga exibida já é a carga aumentada.`;
  }
  return 'Realize blocos de repetições com 20 segundos de descanso entre cada bloco, até completar o total de reps. A carga exibida já é a carga aumentada.';
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

/** Brazil local date YYYY-MM-DD */
const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────
// Rest Timer Sheet
// ─────────────────────────────────────────────────────────────

interface RestTimerSheetProps {
  open: boolean;
  seconds: number;
  /** Instante real (Date.now()) em que o descanso começou — permite restaurar
   *  o tempo restante certo quando o aluno sai da tela e volta, em vez de
   *  reiniciar a contagem do zero. Já vem ajustado pelo pai ao retomar de uma
   *  pausa (descontando o tempo parado), então este componente só lê, nunca ajusta. */
  startedAt: number | null;
  /** Controlado pelo pai — persiste no banco (active_timers.paused_at), então
   *  sobrevive a minimizar/fechar o app sem perder o estado. */
  paused: boolean;
  exerciseName: string;
  /** Só esconde o sheet — o timer continua rodando (active_timers intacto), pra
   *  aparecer minimizado na barra fixa se o aluno for pra outra tela. */
  onMinimize: () => void;
  /** Cancela o descanso de vez (Pular, ou quando o tempo acaba de verdade). */
  onSkip: () => void;
  onTogglePause: () => void;
}

const RestTimerSheet = ({ open, seconds, startedAt, paused, exerciseName, onMinimize, onSkip, onTogglePause }: RestTimerSheetProps) => {
  const [remaining, setRemaining] = useState(seconds);
  const [done,      setDone]      = useState(false);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef     = useRef<AudioContext | null>(null);
  const firedRef      = useRef(false);

  useEffect(() => {
    if (open) {
      setRemaining(seconds);
      setDone(false);
      firedRef.current = false;
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
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
    if (!open || paused || startedAt == null) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const rem = Math.max(0, seconds - elapsed);
      setRemaining(rem);
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDone(true);
        playBeep();
        vibrate();
        setTimeout(onSkip, 1800);
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [open, paused, seconds, startedAt, playBeep, vibrate, onSkip]);

  const r        = 72;
  const circ     = 2 * Math.PI * r;
  const progress = seconds > 0 ? remaining / seconds : 0;
  const offset   = circ * (1 - progress);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onMinimize}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-10 pt-6 px-6"
        style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5" />

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-wider font-medium" style={{ color: "hsl(var(--foreground) / 0.5)" }}>Descanso</p>
            <p className="text-sm font-medium mt-0.5 truncate max-w-[200px]" style={{ color: "hsl(var(--foreground) / 0.6)" }}>
              {exerciseName}
            </p>
          </div>
          <button
            onClick={onMinimize}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "hsl(var(--foreground) / 0.14)" }}
            title="Minimizar (o descanso continua contando)"
          >
            <X className="w-4 h-4" style={{ color: "hsl(var(--foreground) / 0.75)" }} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center">
            <svg width={200} height={200} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={100} cy={100} r={r} fill="none" stroke="hsl(var(--foreground) / 0.06)" strokeWidth={8} />
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
                  <p className="text-5xl font-bold tabular-nums tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                    {fmtTime(remaining)}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: "hsl(var(--foreground) / 0.45)" }}>{fmtTime(seconds)} total</p>
                </>
              )}
            </div>
          </div>

          {!done && (
            <div className="flex gap-3 w-full">
              <button
                onClick={onTogglePause}
                className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.07)", color: "hsl(var(--foreground) / 0.7)" }}
              >
                {paused
                  ? <><Play className="w-4 h-4" /> Continuar</>
                  : <><Pause className="w-4 h-4" /> Pausar</>}
              </button>
              <button
                onClick={onSkip}
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
        style={{ backgroundColor: "hsl(var(--foreground) / 0.05)" }}
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
// Load History Chart
// ─────────────────────────────────────────────────────────────

interface HistoricoEntry {
  carga: string;
  data_registro: string;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const toNum = (s: string): number | null => {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

const CargaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ backgroundColor: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>{payload[0].value} kg</p>
    </div>
  );
};

const HistoricoChart = ({ historico, loading }: { historico: HistoricoEntry[]; loading: boolean }) => {
  const chartData = historico
    .map((r) => ({ date: fmtDate(r.data_registro), carga: toNum(r.carga) }))
    .filter((r) => r.carga != null) as { date: string; carga: number }[];

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ backgroundColor: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--cp-400)" }} />
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Evolução de Carga</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-white/10 animate-spin" style={{ borderTopColor: "var(--cp-500)" }} />
        </div>
      ) : chartData.length < 2 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-xs text-muted-foreground/60 text-center">
            {chartData.length === 0
              ? "Salve sua carga acima para começar a registrar a evolução"
              : "Salve a carga mais uma vez para o gráfico aparecer"}
          </p>
          <div className="flex gap-1 mt-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i < chartData.length ? "var(--cp-500)" : "var(--border-subtle)" }} />
            ))}
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cargaAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--cp-500)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--cp-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tick={{ fill: "var(--chart-tick)", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--chart-tick)", fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CargaTooltip />} />
            <Area
              type="monotone"
              dataKey="carga"
              stroke="var(--cp-500)"
              strokeWidth={2.5}
              fill="url(#cargaAreaFill)"
              dot={{ r: 3, fill: "var(--cp-500)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const ExerciseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { slug, org, orgId } = useTenantContext();

  const [exercise, setExercise]     = useState<Exercise | null>(null);
  const [loading, setLoading]       = useState(true);
  const [carga, setCarga]           = useState("");
  const [cargaFetched, setCargaFetched] = useState(false);
  const [alunoId, setAlunoId]       = useState<string | null>(null);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);
  const [savingCarga, setSavingCarga] = useState(false);
  const [videoOpen, setVideoOpen]   = useState(false);
  const [descOpen, setDescOpen]     = useState(false);
  const [restOpen, setRestOpen]     = useState(false);
  const [restSecs, setRestSecs]     = useState(60);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [restNow, setRestNow]       = useState(() => Date.now());
  // Pausa persistida no banco (active_timers.paused_at) — controla tanto o sheet
  // quanto o indicador inline abaixo, então os dois concordam mesmo se o sheet
  // for minimizado/o app for fechado e reaberto no meio da pausa.
  const [restPaused, setRestPaused] = useState(false);
  const [restPausedAt, setRestPausedAt] = useState<number | null>(null);

  // Só faz ticar quando o sheet está minimizado (fechado, mas com timer ativo) e não
  // pausado — é o que alimenta o indicador inline "Descanso · Xs restantes" abaixo.
  // Com o sheet aberto, ele já tem seu próprio relógio interno, não precisa duplicar.
  useEffect(() => {
    if (restStartedAt == null || restOpen || restPaused) return;
    const id = setInterval(() => setRestNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restStartedAt, restOpen, restPaused]);

  const restNowRef        = restPaused && restPausedAt != null ? restPausedAt : restNow;
  const restElapsedSec   = restStartedAt != null ? Math.floor((restNowRef - restStartedAt) / 1000) : 0;
  const restRemainingSec = restStartedAt != null ? Math.max(0, restSecs - restElapsedSec) : 0;
  const restIsOverdue    = restStartedAt != null && restElapsedSec >= restSecs;
  const restMinimized    = restStartedAt != null && !restOpen;

  /** Pausa o descanso — persiste no banco pra sobreviver a minimizar/fechar o app. */
  const pauseRest = () => {
    setRestPaused(true);
    setRestPausedAt(Date.now());
    if (studentUserId) void pauseTimer(studentUserId);
  };

  /** Retoma o descanso, descontando o tempo parado do instante de início (mesma
   *  ideia do cardio) — e persiste o novo started_at pra limpar o paused_at. */
  const resumeRest = () => {
    if (!restStartedAt || !restPausedAt || !exercise) return;
    const pauseDuration = Date.now() - restPausedAt;
    const newStartedAt = restStartedAt + pauseDuration;
    setRestStartedAt(newStartedAt);
    setRestNow(Date.now());
    setRestPaused(false);
    setRestPausedAt(null);
    if (studentUserId) {
      void startTimer(studentUserId, orgId ?? null, "descanso", exercise.nome_exercicio, restSecs, exercise.id, new Date(newStartedAt));
    }
  };
  const [historico, setHistorico]         = useState<HistoricoEntry[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [pairedNames, setPairedNames]     = useState<string[]>([]);
  const [openHintKey, setOpenHintKey]     = useState<string | null>(null);
  const [prevExerciseId, setPrevExerciseId] = useState<string | null>(null);
  const [nextExerciseId, setNextExerciseId] = useState<string | null>(null);
  // Cache da lista de exercícios do treino atual, pra setas prev/next não
  // refazerem essa query a cada clique — só busca de novo quando o treino muda.
  const siblingsCacheRef = useRef<{ treinoId: string; list: any[] } | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Registro por slot: cada execução física de uma série (quantidade > 1 = múltiplos
  // slots) guarda carga+reps realizadas. Uma série fica "feita" quando todos os seus
  // slots têm os dois campos preenchidos e salvos — sem toggle manual separado.
  const [slots, setSlots]           = useState<Record<string, SlotValue>>({});
  const [openLogKey, setOpenLogKey] = useState<string | null>(null);
  const [savingLogKey, setSavingLogKey] = useState<string | null>(null);

  const slotKey = (serieKey: string, i: number) => `${serieKey}#${i}`;

  const getSlotsCount = (serie: SerieDetalhe) =>
    serie.quantidade && serie.quantidade >= 1 ? serie.quantidade : 1;

  const isSerieFullyDone = (serieKey: string, slotsCount: number) =>
    Array.from({ length: slotsCount }, (_, i) => slots[slotKey(serieKey, i)]?.saved).every(Boolean);

  const updateSlotDraft = (serieKey: string, i: number, field: "reps" | "carga", value: string) => {
    setSlots((prev) => {
      const key = slotKey(serieKey, i);
      const cur = prev[key] ?? { reps: "", carga: "", saved: false };
      return { ...prev, [key]: { ...cur, [field]: value, saved: false } };
    });
  };

  const openLog = (serieKey: string, slotsCount: number, defaultCarga: string) => {
    setOpenLogKey((prev) => (prev === serieKey ? null : serieKey));
    setSlots((prev) => {
      const next = { ...prev };
      for (let i = 0; i < slotsCount; i++) {
        const key = slotKey(serieKey, i);
        if (!next[key]) next[key] = { reps: "", carga: defaultCarga, saved: false };
      }
      return next;
    });
  };

  /** Abre o timer de descanso e registra como "timer ativo" (sobrevive a navegar/minimizar) */
  const openRestTimer = (secs: number) => {
    setRestSecs(secs);
    setRestStartedAt(Date.now());
    setRestOpen(true);
    setRestPaused(false);
    setRestPausedAt(null);
    if (studentUserId && exercise) {
      void startTimer(studentUserId, orgId ?? null, "descanso", exercise.nome_exercicio, secs, exercise.id);
    }
  };

  // Restaura o timer de descanso se o aluno saiu da tela (ex: via barra fixa) e voltou —
  // sem isso, a tela sempre mostrava "Iniciar" do zero, mesmo com um descanso já rodando.
  // getActiveTimer já descarta sozinho um timer esquecido (pausado 1h+/rodando 3h+).
  useEffect(() => {
    if (!studentUserId || !exercise) return;
    void (async () => {
      const active = await getActiveTimer(studentUserId);
      if (active?.tipo === "descanso" && active.ref_id === exercise.id) {
        setRestSecs(active.duracao_segundos);
        setRestStartedAt(new Date(active.started_at).getTime());
        setRestOpen(true);
        if (active.paused_at) {
          setRestPaused(true);
          setRestPausedAt(new Date(active.paused_at).getTime());
        }
      }
    })();
  }, [studentUserId, exercise]);

  const saveSingleSlot = async (serieKey: string, serieDescanso: string | null | undefined, i: number) => {
    if (!studentUserId || !id) return;
    const v = slots[slotKey(serieKey, i)] ?? { reps: "", carga: "" };
    if (!v.reps.trim() || !v.carga.trim()) return; // só salva com os dois campos preenchidos

    const key = slotKey(serieKey, i);
    setSavingLogKey(key);
    try {
      const row = {
        student_id: studentUserId,
        exercicio_id: id,
        serie_key: serieKey,
        slot_index: i,
        date: brazilToday(),
        reps_realizadas: v.reps.trim(),
        carga_realizada: v.carga.trim(),
      };

      const { error } = await supabase
        .from("serie_completions")
        .upsert(row, { onConflict: "student_id,exercicio_id,serie_key,slot_index,date" });
      if (error) throw error;

      setSlots((prev) => ({ ...prev, [key]: { reps: row.reps_realizadas, carga: row.carga_realizada, saved: true } }));

      // Só abre timer automático se o treinador de fato configurou um descanso
      // — nessa série específica, ou (fallback) no campo único do exercício.
      // Nunca um valor "de fábrica" não configurado por ninguém: decisão do
      // Lucas (2026-08-31) pra não vazar o padrão de um treinador (ex: 45s/60s
      // fixos de warm-up/feeder que a Get Shape usa) pra orgs que não setaram
      // nada — cada treinador define o próprio padrão explicitamente.
      const secs = serieDescanso
        ? parseDescansoSecs(serieDescanso)
        : (exercise?.descanso ? parseDescansoSecs(exercise.descanso) : null);
      if (secs != null) {
        setTimeout(() => openRestTimer(secs), 150);
      }
    } catch (err: any) {
      toast({ title: "Não foi possível salvar", description: err.message, variant: "destructive" });
    } finally {
      setSavingLogKey(null);
    }
  };

  const loadSerieCompletions = async () => {
    if (!studentUserId || !id) return;
    try {
      const { data } = await supabase
        .from("serie_completions")
        .select("serie_key, slot_index, reps_realizadas, carga_realizada")
        .eq("student_id", studentUserId)
        .eq("exercicio_id", id)
        .eq("date", brazilToday());
      if (data) {
        const next: Record<string, SlotValue> = {};
        for (const row of data as any[]) {
          next[slotKey(row.serie_key, row.slot_index)] = {
            reps: row.reps_realizadas ?? "",
            carga: row.carga_realizada ?? "",
            saved: !!(row.reps_realizadas && row.carga_realizada),
          };
        }
        setSlots(next);
      }
    } catch { /* silent */ }
  };

  // Limpa estado por-exercício ao trocar de `id` (setas prev/next navegam sem
  // desmontar o componente — sem isso, valores do exercício anterior "vazam"
  // por um instante até os loaders de baixo devolverem os novos).
  useEffect(() => {
    setCarga("");
    setCargaFetched(false);
    setHistorico([]);
    setPairedNames([]);
    setVideoOpen(false);
    setOpenHintKey(null);
    setOpenLogKey(null);
    setSlots({});
  }, [id]);

  // Cancela o timer do loading atrasado se a tela desmontar antes dele disparar
  // (ex: aluno aperta "voltar" no meio de uma troca de exercício lenta).
  useEffect(() => () => { if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current); }, []);

  useEffect(() => { loadExercise(); }, [id]);
  // alunoId/studentUserId são do aluno logado — não mudam ao trocar de exercício
  // (setas prev/next), então busca só 1x no mount, não em toda troca de `id`.
  useEffect(() => { getAlunoId(); }, []);
  useEffect(() => { if (alunoId && id) { loadCarga(); loadHistorico(); } }, [alunoId, id]);
  useEffect(() => { if (studentUserId && id) loadSerieCompletions(); }, [studentUserId, id]);

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
      setStudentUserId(user.id);
      const { data } = await supabase
        .from("alunos").select("id").eq("user_id", user.id).single();
      if (data) setAlunoId(data.id);
    } catch { /* silent */ }
  };

  const loadExercise = async () => {
    // Só mostra a tela cheia de "Carregando exercício..." se a busca passar de
    // 350ms — no primeiro mount `loading` já começa true (nada pra mostrar
    // mesmo), então isso só entra em jogo nas trocas via seta prev/next. Sem
    // esse atraso, toda troca rápida piscava a tela cheia sem necessidade.
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setLoading(true), 350);
    try {
      const { data, error } = await supabase
        .from("exercicios")
        .select(`*, exercicios_base ( descricao )`)
        .eq("id", id)
        .single();
      if (error) throw error;
      const q = data as unknown as ExerciseQueryResult;
      const normalizeSerie = (s: any): SerieDetalhe => ({
        id:            s.id ?? '',
        tipo:          s.tipo ?? 'trabalho',
        repeticoes:    s.repeticoes ?? '',
        tipo_calculo:  s.tipo_calculo ?? (s.tipo_carga === 'percentual' ? 'percentual' : 'manual'),
        valor_calculo: s.valor_calculo ?? s.valor_carga ?? '',
        quantidade:    typeof s.quantidade === 'number' && s.quantidade >= 1 ? s.quantidade : 1,
        // Coach salva o texto em `descricao`; mantém retrocompatibilidade com `observacoes`
        observacoes:   s.observacoes ?? s.descricao ?? '',
        descanso:      s.descanso ?? null,
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
            // Um único bloco com quantidade=count — mesmo formato que o coach usa em
            // migrateToDetailed() (TrainingPlanManager.tsx). Antes isso gerava `count`
            // blocos com quantidade=1 cada, e cada linha somava a quantidade de TODOS
            // os blocos do mesmo tipo pra exibir "Nx" — resultado: N linhas idênticas,
            // cada uma dizendo "Nx", em vez de uma linha só.
            // id vazio de propósito: sem series_detalhadas salva no banco, o índice
            // (via `serie.id || String(idx)`) é a única chave estável entre reloads —
            // um id aleatório aqui mudaria a cada load e quebraria a persistência de conclusão.
            return [{
              id: '',
              tipo: 'trabalho' as const,
              repeticoes: q.repeticoes || '',
              tipo_calculo: 'manual' as TipoCalculo,
              valor_calculo: '',
              quantidade: count,
            }];
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
        treino_id: q.treino_id,
      });

      if (q.treino_id && q.ordem != null) void loadPairedExercises(q.treino_id, q.ordem);
    } catch (err: any) {
      toast({ title: "Erro ao carregar exercício", description: err.message, variant: "destructive" });
    } finally {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setLoading(false);
    }
  };

  /**
   * Descobre se este exercício faz parte de um bi-set/tri-set (cadeia de
   * conjugado_com_proximo) e também os vizinhos anterior/próximo do treino,
   * pra navegação sem precisar voltar pra tela do treino.
   */
  const loadPairedExercises = async (treinoId: string, ordem: number) => {
    try {
      let list: any[];
      if (siblingsCacheRef.current?.treinoId === treinoId) {
        list = siblingsCacheRef.current.list;
      } else {
        const { data } = await supabase
          .from("exercicios")
          .select("id, nome_exercicio, ordem, conjugado_com_proximo")
          .eq("treino_id", treinoId)
          .order("ordem");
        if (!data) return;
        list = data as any[];
        siblingsCacheRef.current = { treinoId, list };
      }
      const idx = list.findIndex((e) => e.ordem === ordem);
      if (idx === -1) return;

      setPrevExerciseId(idx > 0 ? list[idx - 1].id : null);
      setNextExerciseId(idx < list.length - 1 ? list[idx + 1].id : null);

      let start = idx;
      while (start > 0 && list[start - 1].conjugado_com_proximo) start--;
      let end = idx;
      while (list[end]?.conjugado_com_proximo) end++;

      setPairedNames(
        end > start
          ? list.slice(start, end + 1)
              .filter((_, i) => start + i !== idx)
              .map((e) => e.nome_exercicio)
          : []
      );
    } catch { /* silent */ }
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

  const loadHistorico = async () => {
    if (!alunoId || !id) return;
    setLoadingHistorico(true);
    try {
      const { data } = await supabase
        .from("historico_carga")
        .select("carga, data_registro")
        .eq("exercicio_id", id)
        .eq("aluno_id", alunoId)
        .order("data_registro", { ascending: true })
        .limit(60);
      setHistorico(data ?? []);
    } finally {
      setLoadingHistorico(false);
    }
  };

  const saveCarga = async () => {
    if (!alunoId || !id || !carga.trim()) {
      toast({ title: "Atenção", description: "Digite uma carga válida", variant: "destructive" });
      return;
    }
    setSavingCarga(true);
    try {
      const now = new Date().toISOString();
      const [upsertRes, insertRes] = await Promise.all([
        supabase.from("exercicios_carga").upsert(
          { exercicio_id: id, aluno_id: alunoId, carga: carga.trim(), data_registro: now },
          { onConflict: "exercicio_id,aluno_id" }
        ),
        supabase.from("historico_carga").insert(
          { exercicio_id: id, aluno_id: alunoId, carga: carga.trim(), data_registro: now }
        ),
      ]);
      if (upsertRes.error) throw upsertRes.error;
      if (insertRes.error) throw insertRes.error;
      toast({ title: "Carga salva!", description: "Registrada com sucesso" });
      await loadHistorico();
    } catch (err: any) {
      toast({ title: "Erro ao salvar carga", description: err.message, variant: "destructive" });
    } finally {
      setSavingCarga(false);
    }
  };

  const handleBack = () => {
    const treinoId = searchParams.get("treinoId");
    if (treinoId) {
      navigate(`/${slug}/aluno/treinos?treinoId=${treinoId}`);
    } else {
      navigate(-1);
    }
  };

  /** Navega pro exercício anterior/próximo do mesmo treino, sem passar pela tela do treino */
  const goToExercise = (exerciseId: string) => {
    const treinoId = searchParams.get("treinoId");
    navigate(`/${slug}/aluno/exercicio/${exerciseId}${treinoId ? `?treinoId=${treinoId}` : ""}`);
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
        startedAt={restStartedAt}
        paused={restPaused}
        exerciseName={exercise.nome_exercicio}
        onMinimize={() => setRestOpen(false)}
        onSkip={() => {
          setRestOpen(false);
          setRestStartedAt(null);
          setRestPaused(false);
          setRestPausedAt(null);
          if (studentUserId) void clearTimer(studentUserId);
        }}
        onTogglePause={() => (restPaused ? resumeRest() : pauseRest())}
      />

      {/* Video modal */}
      {videoOpen && videoId && (
        <VideoModal videoId={videoId} title={exercise.nome_exercicio} onClose={() => setVideoOpen(false)} />
      )}

      <div className="min-h-screen pb-24">

        {/* ── Sticky back bar — full-width bg, content capped to match cards ──
             Rota é "sem layout" (App.tsx) — não herda o padding-top de
             safe-area do StudentLayout, então essa barra precisa do próprio,
             senão fica atrás da status bar (relógio/wifi/bateria) no app nativo. */}
        <div
          className="sticky top-0 z-10 bg-background/90 backdrop-blur-md"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))", paddingBottom: "0.75rem" }}
        >
          <div className="max-w-2xl mx-auto px-4 flex items-center gap-3">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
              style={{ backgroundColor: "hsl(var(--foreground) / 0.07)" }}
            >
              <ArrowLeft className="w-4 h-4 text-white/70" />
            </button>
            <h1 className="text-base font-semibold text-foreground truncate flex-1">{exercise.nome_exercicio}</h1>

            {/* Navegação entre exercícios do mesmo treino — par discreto, separado
                do botão "voltar" pra não confundir as duas ações. Tamanho igual
                ao botão "voltar" (w-9 h-9) e gap maior entre as duas: alunos
                relataram toque errado entre elas por ficarem pequenas e coladas. */}
            {(prevExerciseId || nextExerciseId) && (
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => prevExerciseId && goToExercise(prevExerciseId)}
                  disabled={!prevExerciseId}
                  aria-label="Exercício anterior"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
                  style={{ backgroundColor: "hsl(var(--foreground) / 0.05)" }}
                >
                  <ChevronLeft className="w-5 h-5 text-white/60" />
                </button>
                <button
                  onClick={() => nextExerciseId && goToExercise(nextExerciseId)}
                  disabled={!nextExerciseId}
                  aria-label="Próximo exercício"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
                  style={{ backgroundColor: "hsl(var(--foreground) / 0.05)" }}
                >
                  <ChevronRight className="w-5 h-5 text-white/60" />
                </button>
              </div>
            )}
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
                style={{ backgroundColor: "hsl(var(--foreground) / 0.03)", border: "1px solid hsl(var(--foreground) / 0.06)", borderRadius: "inherit" }}
              >
                <div className="flex flex-col items-center gap-2 text-white/20">
                  <Play className="w-10 h-10" />
                  <p className="text-xs">Sem vídeo</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Conjugado (bi-set/tri-set) ── */}
          {pairedNames.length > 0 && (
            <div
              className="rounded-2xl border flex items-center gap-2.5 px-4 py-3"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", borderColor: "rgba(var(--cp-rgb),0.2)" }}
            >
              <Link2 className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "var(--cp-400)" }}>
                Conjugado com <span className="font-semibold">{pairedNames.join(" e ")}</span> — sem descanso entre eles, descanse só depois de completar a sequência.
              </p>
            </div>
          )}

          {/* ── Descanso ── */}
          {exercise.descanso && (
            <div
              className="rounded-2xl border flex items-center justify-between px-4 py-3"
              style={{
                backgroundColor: restMinimized ? "rgba(var(--cp-rgb),0.08)" : "var(--surface-2)",
                borderColor: restMinimized ? "rgba(var(--cp-rgb),0.25)" : "var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: restMinimized ? "rgba(var(--cp-rgb),0.15)" : "hsl(var(--foreground) / 0.06)" }}
                >
                  <Timer className="w-3.5 h-3.5" style={{ color: restMinimized ? "var(--cp-400)" : "hsl(var(--muted-foreground))" }} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider leading-none mb-0.5" style={{ color: restMinimized ? "var(--cp-400)" : "hsl(var(--muted-foreground))" }}>
                    {restMinimized ? (restPaused ? "Descanso pausado" : restIsOverdue ? "Descanso concluído" : "Descanso") : "Descanso entre séries"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {restMinimized
                      ? (restPaused ? `${fmtTime(restRemainingSec)} restantes (pausado)` : restIsOverdue ? "Hora da próxima série!" : `${fmtTime(restRemainingSec)} restantes`)
                      : parseDescanso(exercise.descanso)}
                  </p>
                </div>
              </div>
              {restMinimized ? (
                <button
                  onClick={() => setRestOpen(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={{ background: "var(--cp-gradient)", color: "var(--cp-text, #fff)" }}
                >
                  Continuar
                </button>
              ) : (
                <button
                  onClick={() => openRestTimer(parseDescansoSecs(exercise.descanso))}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={{ background: "var(--cp-gradient)", color: "var(--cp-text, #fff)" }}
                >
                  <Timer className="w-3.5 h-3.5" />
                  Iniciar
                </button>
              )}
            </div>
          )}

          {/* ── Carga Base ── (above series so calculations update live as user types) */}
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{ backgroundColor: "hsl(var(--foreground) / 0.02)", borderColor: "hsl(var(--foreground) / 0.07)" }}
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
                  backgroundColor: "hsl(var(--foreground) / 0.06)",
                  border: "1px solid hsl(var(--foreground) / 0.09)",
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
              style={{ backgroundColor: 'hsl(var(--foreground) / 0.02)', borderColor: 'hsl(var(--foreground) / 0.07)' }}
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
                {(() => {
                  // Pré-computa total de séries por tipo somando `quantidade`
                  // Ex: WORK SET com quantidade=2 → serieTotal=2 (exibe "2x" em uma única linha)
                  const tipoCount: Record<string, number> = {};
                  exercise.series_detalhadas!.forEach((s) => {
                    tipoCount[s.tipo] = (tipoCount[s.tipo] || 0) + (s.quantidade ?? 1);
                  });
                  const tipoIdx: Record<string, number> = {};
                  return exercise.series_detalhadas!.map((serie, idx) => {
                  tipoIdx[serie.tipo] = (tipoIdx[serie.tipo] || 0) + 1;
                  const serieNum   = tipoIdx[serie.tipo];
                  const serieTotal = tipoCount[serie.tipo];
                  const serieKey = serie.id || String(idx);
                  const cfg = SERIE_TIPO_CONFIG[serie.tipo] ?? {
                    label: serie.tipo || 'Custom',
                    bg:    'var(--surface-2)',
                    text:  'var(--text-mid)',
                  };

                  const tipoCalculo  = serie.tipo_calculo;
                  const valorCalculo = serie.valor_calculo;

                  const calculatedLoad = tipoCalculo !== 'manual' && carga.trim()
                    ? calcularCarga(carga, tipoCalculo, valorCalculo)
                    : null;
                  // Work set (tipo_calculo manual) normalmente não tem valor próprio —
                  // usa a Carga Base direto, igual aos outros tipos calculados fazem
                  // com ela (mesmo padrão de arredondar e por "kg" que `calcularCarga` usa).
                  const manualLoad = tipoCalculo === 'manual'
                    ? (valorCalculo || (() => {
                        const b = parseFloat(carga.replace(/[^\d.]/g, ''));
                        return !isNaN(b) && b > 0 ? `${Math.round(b)}kg` : null;
                      })())
                    : null;

                  // Prioridade: 1) texto por exercício  2) cluster dinâmico  3) config global da org  4) fallback hardcoded
                  const orgSerieConfig = (org?.serie_config ?? {}) as Record<string, string>;
                  const hintText = (() => {
                    if (serie.observacoes && serie.observacoes.trim()) return serie.observacoes.trim();
                    if (serie.tipo === 'cluster') return buildClusterHint(serie.repeticoes);
                    if (orgSerieConfig[serie.tipo]?.trim()) return orgSerieConfig[serie.tipo].trim();
                    return DEFAULT_SERIE_HINT[serie.tipo] ?? null;
                  })();

                  const slotsCount = getSlotsCount(serie);
                  const done = isSerieFullyDone(serieKey, slotsCount);
                  const suggestedLoad = calculatedLoad ?? manualLoad ?? '';

                  return (
                    <div key={serieKey}>
                      {/* Linha da série — toca em qualquer lugar (fora do "!") pra abrir o registro */}
                      <div
                        onClick={() => openLog(serieKey, slotsCount, suggestedLoad)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer"
                        style={{
                          backgroundColor: done ? 'rgba(34,197,94,0.05)' : 'var(--surface-2)',
                          border: `1px solid ${done ? 'rgba(34,197,94,0.20)' : 'var(--border-subtle)'}`,
                          transition: 'background-color 0.2s',
                        }}
                      >
                        {/* Número */}
                        <span
                          className="text-[10px] font-bold tabular-nums shrink-0"
                          style={{ width: 14, color: done ? 'rgba(74,222,128,0.5)' : 'var(--text-dim)' }}
                        >
                          {idx + 1}
                        </span>

                        {/* Badge do tipo */}
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0"
                          style={{
                            backgroundColor: cfg.bg,
                            color: done ? 'var(--text-dim)' : cfg.text,
                          }}
                        >
                          {cfg.label}
                        </span>

                        {/* Ícone de observação — abre/fecha hint inline */}
                        {hintText && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenHintKey(openHintKey === serieKey ? null : serieKey); }}
                            className="shrink-0 flex items-center justify-center transition-opacity active:scale-95"
                            style={{ color: openHintKey === serieKey ? cfg.text : (done ? 'var(--text-dim)' : cfg.text), opacity: done ? 0.5 : 1 }}
                            aria-label="Ver observações"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Contador — total de séries desse tipo (ex: 1x, 3x) */}
                        <span
                          className="text-[10px] font-semibold tabular-nums shrink-0"
                          style={{ color: done ? 'var(--text-dim)' : cfg.text, opacity: done ? 0.5 : 0.75 }}
                        >
                          {serieTotal}x
                        </span>

                        {/* Repetições */}
                        <span
                          className="text-sm font-medium shrink-0"
                          style={{ color: done ? 'var(--text-dim)' : 'hsl(var(--muted-foreground))' }}
                        >
                          {serie.repeticoes ? `${serie.repeticoes} reps` : '—'}
                        </span>

                      {/* Espaçador */}
                      <div className="flex-1" />

                      {/* Carga calculada */}
                      {(calculatedLoad || manualLoad) && (
                        <div
                          className="flex items-center gap-1 shrink-0"
                          style={{ opacity: done ? 0.4 : 1 }}
                        >
                          {calculatedLoad && carga.trim() && (
                            <span className="text-[10px] text-muted-foreground/50 hidden xs:inline">
                              {carga} →
                            </span>
                          )}
                          <span className="text-sm font-bold" style={{ color: 'var(--cp-400)' }}>
                            {calculatedLoad ?? manualLoad}
                          </span>
                        </div>
                      )}

                        {/* Indicador de conclusão — automático, acende quando todos os slots estão salvos */}
                        <span
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full ml-1"
                          style={{
                            backgroundColor: done ? 'rgba(34,197,94,0.15)' : 'var(--surface-1)',
                            border: `1.5px solid ${done ? 'rgba(34,197,94,0.45)' : 'var(--border-subtle)'}`,
                          }}
                        >
                          {done
                            ? <CheckCircle className="w-4 h-4 text-green-500" />
                            : <Circle className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                          }
                        </span>
                      </div>

                      {/* Painel de registro — abre ao tocar na linha da série */}
                      {openLogKey === serieKey && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl px-3 py-3 mt-1 space-y-2"
                          style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
                        >
                          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: cfg.text }}>
                            Registrar {slotsCount > 1 ? `${slotsCount} séries` : 'série'} realizada{slotsCount > 1 ? 's' : ''}
                          </p>
                          {Array.from({ length: slotsCount }, (_, i) => {
                            const v = slots[slotKey(serieKey, i)] ?? { reps: '', carga: '', saved: false };
                            const canSave = !!v.reps.trim() && !!v.carga.trim();
                            const isSaving = savingLogKey === slotKey(serieKey, i);
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold shrink-0" style={{ width: 36, color: 'var(--text-dim)' }}>
                                  Set {i + 1}
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Carga"
                                  value={v.carga}
                                  onChange={(e) => updateSlotDraft(serieKey, i, 'carga', e.target.value)}
                                  className="w-20 h-9 rounded-lg px-2 text-xs text-foreground outline-none"
                                  style={{ backgroundColor: 'hsl(var(--foreground) / 0.06)', border: '1px solid hsl(var(--foreground) / 0.09)' }}
                                />
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder={serie.repeticoes ? `Reps (${serie.repeticoes})` : 'Reps'}
                                  value={v.reps}
                                  onChange={(e) => updateSlotDraft(serieKey, i, 'reps', e.target.value)}
                                  className="flex-1 min-w-0 h-9 rounded-lg px-2 text-xs text-foreground outline-none"
                                  style={{ backgroundColor: 'hsl(var(--foreground) / 0.06)', border: '1px solid hsl(var(--foreground) / 0.09)' }}
                                />
                                <button
                                  onClick={() => saveSingleSlot(serieKey, serie.descanso, i)}
                                  disabled={!canSave || isSaving}
                                  className="w-6 h-6 flex items-center justify-center shrink-0 transition-transform active:scale-90 disabled:active:scale-100"
                                  aria-label={v.saved ? 'Set salvo' : 'Salvar set'}
                                >
                                  {v.saved
                                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                                    : <Circle className="w-3.5 h-3.5" style={{ color: canSave ? 'var(--cp-400)' : 'var(--text-dim)', opacity: canSave ? 1 : 0.4 }} />
                                  }
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Hint inline — expande abaixo da série ao clicar no "!" */}
                      {openHintKey === serieKey && hintText && (
                        <div
                          className="rounded-xl px-3 py-2.5 mt-1"
                          style={{
                            backgroundColor: 'var(--surface-1)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <p
                            className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
                            style={{ color: cfg.text }}
                          >
                            Observações da série
                          </p>
                          <p
                            className="text-sm leading-relaxed whitespace-pre-line"
                            style={{ color: 'var(--text-mid)' }}
                          >
                            {hintText}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })})()}
              </div>

              {/* Hint when no carga and series need it */}
              {!carga.trim() && exercise.series_detalhadas.some(s => s.tipo_calculo !== 'manual') && (
                <p className="text-[11px] text-muted-foreground/70">
                  ↑ Digite sua carga acima para ver os pesos calculados automaticamente
                </p>
              )}
            </div>
          )}

          {/* ── Evolução de Carga ── */}
          <HistoricoChart historico={historico} loading={loadingHistorico} />

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
                  style={{ backgroundColor: "hsl(var(--foreground) / 0.04)" }}
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
              style={{ backgroundColor: "hsl(var(--foreground) / 0.02)", borderColor: "hsl(var(--foreground) / 0.07)" }}
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
                <div className="px-4 pb-4 border-t" style={{ borderColor: "hsl(var(--foreground) / 0.06)" }}>
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
              style={{ backgroundColor: "hsl(var(--foreground) / 0.02)", borderColor: "hsl(var(--foreground) / 0.07)" }}
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
