import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  ArrowLeft, CheckCircle, Loader2, Timer, Play, Pause,
  SkipForward, Dumbbell, X, Trophy, TrendingUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type TipoCalculo = 'percentual' | 'reducao' | 'aumento' | 'manual';

interface SerieDetalhe {
  id: string;
  tipo: string; // preset key OR any custom name set by the trainer
  repeticoes: string;
  tipo_calculo: TipoCalculo;
  valor_calculo: string;
  quantidade: number; // quantas séries físicas este bloco representa (default 1)
}

interface Exercicio {
  id: string;
  nome_exercicio: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  observacoes: string | null;
  video_url: string | null;
  ordem: number;
  carga_base: string | null;
  series_detalhadas: SerieDetalhe[] | null;
  exercicio_base_id: string | null;
  grupo_muscular_principal?: string | null;
}

interface Treino {
  id: string;
  titulo_treino: string;
  descricao_geral: string | null;
  dia_semana: string;
  exercicios: Exercicio[];
}

// ── Parsers ────────────────────────────────────────────────────────────────────

/** "3", "3x", "3 séries" → 3 */
const parseSeries = (s: string): number => {
  const n = parseInt(s);
  return isNaN(n) ? 3 : Math.max(1, Math.min(n, 20));
};

/**
 * Um bloco de series_detalhadas pode valer por várias séries físicas (campo
 * `quantidade`, ex: "3x Work Set 9-12 reps" = 1 bloco, 3 séries reais). Sem essa
 * expansão, telas que iteram direto sobre o array (1 item = 1 série) perdem as
 * séries extras de qualquer bloco com quantidade > 1 — eram descartadas em
 * silêncio, sem aparecer em lugar nenhum pro aluno.
 */
const expandSeries = (series: SerieDetalhe[]): SerieDetalhe[] => {
  const result: SerieDetalhe[] = [];
  for (const s of series) {
    const n = s.quantidade ?? 1;
    for (let k = 0; k < n; k++) result.push(s);
  }
  return result;
};

/** Returns number of physical sets to track (soma de `quantidade` por bloco, não a contagem de blocos) */
const getNumSets = (ex: Exercicio): number => {
  if (ex.series_detalhadas && ex.series_detalhadas.length > 0) {
    return ex.series_detalhadas.reduce((sum, s) => sum + (s.quantidade ?? 1), 0);
  }
  return parseSeries(ex.series);
};

const SERIE_TIPO_CONFIG: Record<string, { label: string; bg: string; text: string; hint?: string }> = {
  'warm-up':      { label: 'W-UP',  bg: 'rgba(59,130,246,0.18)',    text: '#60a5fa'       },
  'feeder':       { label: 'FEED',  bg: 'rgba(245,158,11,0.18)',     text: '#fbbf24'       },
  'trabalho':     { label: 'WORK',  bg: 'rgba(var(--cp-rgb),0.18)', text: 'var(--cp-400)' },
  'tecnica':      { label: 'TÉC',   bg: 'rgba(168,85,247,0.18)',    text: '#c084fc'       },
  'drop-set':     { label: 'DROP',  bg: 'rgba(239,68,68,0.18)',      text: '#f87171'       },
  'cluster':      { label: 'CLU',   bg: 'rgba(34,197,94,0.18)',      text: '#4ade80'       },
  'rest-pause':   { label: 'R-P',   bg: 'rgba(251,113,133,0.18)',   text: '#fb7185',
                    hint: '⏱ 20s rest · mesmo peso · falha'            },
  'muscle-round': { label: 'M-RND', bg: 'rgba(34,211,238,0.18)',    text: '#22d3ee',
                    hint: '🔄 18 reps · 10-15s ao falhar · mesmo peso' },
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

/** "60", "90s", "1:30", "1min30" → seconds */
const parseDescanso = (d: string | null | undefined): number => {
  if (!d) return 60;
  const str = d.trim();
  if (str.includes(":")) {
    const [m, s] = str.split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
  }
  return Math.max(0, parseInt(str) || 60);
};

/** Format seconds → "MM:SS" */
const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

/**
 * For each index in a series_detalhadas array, returns the position (1-based)
 * and total size of the consecutive same-tipo run it belongs to.
 * Example: [warm-up, work, work, work] →
 *   [{pos:1,total:1}, {pos:1,total:3}, {pos:2,total:3}, {pos:3,total:3}]
 */
const getSerieGrouping = (series: SerieDetalhe[]): Array<{ pos: number; total: number }> => {
  const result: Array<{ pos: number; total: number }> = [];
  let i = 0;
  while (i < series.length) {
    const tipo = series[i].tipo;
    let j = i;
    while (j < series.length && series[j].tipo === tipo) j++;
    const total = j - i;
    for (let k = 0; k < total; k++) result.push({ pos: k + 1, total });
    i = j;
  }
  return result;
};

/** YouTube hqdefault thumbnail */
const getThumb = (url: string | null): string | null => {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
};

// ── Rest Timer Bottom Sheet ────────────────────────────────────────────────────

interface RestTimerSheetProps {
  open: boolean;
  seconds: number;
  exerciseName: string;
  onClose: () => void;
}

const RestTimerSheet = ({ open, seconds, exerciseName, onClose }: RestTimerSheetProps) => {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning]     = useState(false);
  const [done, setDone]           = useState(false);
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

  const r = 72;
  const circ = 2 * Math.PI * r;
  const progress = seconds > 0 ? remaining / seconds : 0;
  const offset = circ * (1 - progress);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-10 pt-6 px-6"
        style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5" />

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="typo-label mb-0.5">Descanso</p>
            <p className="text-sm font-medium text-muted-foreground mt-0.5 truncate max-w-[200px]">
              {exerciseName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: "hsl(var(--foreground) / 0.07)" }}
          >
            <X className="w-4 h-4 text-white/50" />
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
                  <p className="text-5xl font-bold text-foreground tabular-nums tracking-tight">
                    {fmt(remaining)}
                  </p>
                  <p className="typo-meta mt-1">{fmt(seconds)} total</p>
                </>
              )}
            </div>
          </div>

          {!done && (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setRunning((v) => !v)}
                className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.07)", color: "hsl(var(--foreground) / 0.7)" }}
              >
                {running
                  ? <><Pause className="w-4 h-4" /> Pausar</>
                  : <><Play className="w-4 h-4" /> Continuar</>
                }
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

// ── Main component ─────────────────────────────────────────────────────────────

const TreinoHoje = () => {
  const navigate        = useNavigate();
  const { toast }       = useToast();
  const { slug }        = useTenantContext();

  const [treino,    setTreino]    = useState<Treino | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [alunoId,   setAlunoId]   = useState<string | null>(null);

  // Per-set tracking: { [exercicioId]: Set<setIndex> }
  const [completedSets, setCompletedSets] = useState<Record<string, Set<number>>>({});

  // Saved cargas per exercise: { [exercicioId]: "80kg" }
  const [cargasBase, setCargasBase] = useState<Record<string, string>>({});

  // Inline carga editing in card header
  const [editingCargaId,    setEditingCargaId]    = useState<string | null>(null);
  const [editingCargaValue, setEditingCargaValue] = useState("");

  // Brief "just completed" set — drives pop-in animation on check icon
  const [justDoneEx, setJustDoneEx] = useState<Set<string>>(new Set());

  // Rest timer
  const [restOpen,   setRestOpen]   = useState(false);
  const [restSecs,   setRestSecs]   = useState(60);
  const [restExName, setRestExName] = useState("");

  // Stopwatch
  const [elapsed,    setElapsed]    = useState(0);
  const stopwatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    stopwatchRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (stopwatchRef.current) clearInterval(stopwatchRef.current); };
  }, []);

  useEffect(() => { loadTreino(); }, []);

  const loadTreino = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const { data: aluno } = await supabase
        .from("alunos").select("id").eq("user_id", session.user.id).single();
      if (!aluno) { setLoading(false); return; }
      setAlunoId(aluno.id);

      // .order + .limit(1) antes do .maybeSingle(): se por algum motivo o
      // aluno tiver mais de um plano com ativo=true (não deveria, mas
      // .single() quebra silenciosamente nesse caso — não lança erro, só
      // devolve null — e o aluno via "nenhum treino ativo" tendo um de
      // verdade), pega o mais recente em vez de falhar.
      const { data: plano } = await supabase
        .from("planos_treino").select("id").eq("aluno_id", aluno.id).eq("ativo", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!plano) { setLoading(false); return; }

      const { data: semana } = await supabase
        .from("semanas").select("id").eq("plano_id", plano.id)
        .order("semana_inicio", { ascending: true }).limit(1).single();
      if (!semana) { setLoading(false); return; }

      const { data: treinoData } = await supabase
        .from("treinos")
        .select(`id, titulo_treino, descricao_geral, dia_semana,
          exercicios (id, nome_exercicio, series, repeticoes, descanso, observacoes, video_url, ordem, carga_base, series_detalhadas, exercicio_base_id, exercicios_base(grupo_muscular_principal))`)
        .eq("semana_id", semana.id)
        .order("ordem", { ascending: true })
        .limit(1).single();

      if (treinoData) {
        const normalizeSerie = (s: any): SerieDetalhe => ({
          id:            s.id ?? '',
          tipo:          s.tipo ?? 'trabalho',
          repeticoes:    s.repeticoes ?? '',
          tipo_calculo:  s.tipo_calculo ?? (s.tipo_carga === 'percentual' ? 'percentual' : 'manual'),
          valor_calculo: s.valor_calculo ?? s.valor_carga ?? '',
          quantidade:    typeof s.quantidade === 'number' && s.quantidade >= 1 ? s.quantidade : 1,
        });

        const sortedExs = [...(treinoData.exercicios as any[])].sort(
          (a, b) => (a.ordem || 0) - (b.ordem || 0),
        ).map((ex: any) => {
          const parsedSd: SerieDetalhe[] | null = (() => {
            const sd = ex.series_detalhadas;
            if (!sd) return null;
            const arr = Array.isArray(sd) ? sd : (() => { try { return JSON.parse(sd); } catch { return null; } })();
            return arr ? (arr as any[]).map(normalizeSerie) : null;
          })();

          // Auto-migrate old series format to detailed
          const effectiveSd: SerieDetalhe[] | null = (parsedSd && parsedSd.length > 0)
            ? parsedSd
            : (() => {
                const count = parseInt(ex.series);
                if (!count || count <= 0) return null;
                // Um único bloco com quantidade=count — mesmo formato que o coach usa em
                // migrateToDetailed() (TrainingPlanManager.tsx) e que ExerciseDetail.tsx
                // também usa. Antes isso gerava `count` blocos com quantidade=1 cada, o
                // que duplicava a linha em qualquer tela que resume por bloco (ex:
                // "Séries Detalhadas" em ExerciseDetail.tsx mostrava N linhas "Nx" iguais
                // em vez de uma só). expandSeries() abaixo já cuida de expandir por
                // quantidade quando o que se quer é uma linha por série física.
                return [{
                  id: crypto.randomUUID(),
                  tipo: 'trabalho' as const,
                  repeticoes: ex.repeticoes || '',
                  tipo_calculo: 'manual' as TipoCalculo,
                  valor_calculo: '',
                  quantidade: count,
                }];
              })();

          const grupoMuscular = (ex.exercicios_base as any)?.grupo_muscular_principal ?? null;
          return {
            ...ex,
            series_detalhadas: effectiveSd,
            grupo_muscular_principal: grupoMuscular,
          };
        });

        const treino = { ...treinoData, exercicios: sortedExs } as Treino;
        setTreino(treino);

        // Load saved cargas for all exercises
        const exIds = sortedExs.map((e: any) => e.id);
        if (exIds.length > 0) {
          const { data: cargaRows } = await supabase
            .from("exercicios_carga")
            .select("exercicio_id, carga")
            .eq("aluno_id", aluno.id)
            .in("exercicio_id", exIds);
          if (cargaRows) {
            const map: Record<string, string> = {};
            cargaRows.forEach((r: any) => { map[r.exercicio_id] = r.carga; });
            // Fall back to exercise.carga_base if no saved carga
            sortedExs.forEach((ex: any) => {
              if (!map[ex.id] && ex.carga_base) map[ex.id] = ex.carga_base;
            });
            setCargasBase(map);
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar treino", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Set management ────────────────────────────────────────────────

  const markSet = (exId: string, setIdx: number, descanso: string | null) => {
    setCompletedSets((prev) => {
      const next     = { ...prev };
      const existing = new Set(next[exId] ?? []);
      existing.add(setIdx);
      next[exId] = existing;
      return next;
    });

    // Detect exercise completion for pop-in animation + historico_carga save
    const ex = treino?.exercicios.find((e) => e.id === exId);
    if (ex) {
      const prevDone = completedSets[exId]?.size ?? 0;
      if (prevDone + 1 >= getNumSets(ex)) {
        setJustDoneEx((prev) => new Set([...prev, exId]));
        setTimeout(
          () => setJustDoneEx((prev) => { const n = new Set(prev); n.delete(exId); return n; }),
          550,
        );
        // Silently log to historico_carga when all sets are done
        const cargaAtual = cargasBase[exId];
        if (alunoId && cargaAtual) {
          supabase.from("historico_carga").insert({
            exercicio_id: exId,
            aluno_id: alunoId,
            carga: cargaAtual,
          }).then(({ error }) => {
            if (error) console.warn("[historico_carga]", error.message);
          });
        }
      }
    }

    const secs = parseDescanso(descanso);
    if (secs > 0) {
      setRestSecs(secs);
      setRestExName(ex?.nome_exercicio ?? "");
      setRestOpen(true);
    }
  };

  const unmarkSet = (exId: string, setIdx: number) => {
    setCompletedSets((prev) => {
      const next = { ...prev };
      if (next[exId]) {
        const s = new Set([...next[exId]]);
        s.delete(setIdx);
        next[exId] = s;
      }
      return next;
    });
  };

  const handleSaveCargaTreino = async (exId: string) => {
    const novaCarga = editingCargaValue.trim();
    if (!novaCarga || !alunoId) { setEditingCargaId(null); return; }
    const now = new Date().toISOString();
    setCargasBase((prev) => ({ ...prev, [exId]: novaCarga }));
    setEditingCargaId(null);
    await Promise.all([
      supabase.from("exercicios_carga").upsert(
        { exercicio_id: exId, aluno_id: alunoId, carga: novaCarga, data_registro: now },
        { onConflict: "exercicio_id,aluno_id" },
      ),
      supabase.from("historico_carga").insert(
        { exercicio_id: exId, aluno_id: alunoId, carga: novaCarga, data_registro: now },
      ),
    ]).catch((err) => console.warn("[saveCargaTreino]", err));
  };

  // ── Totals ────────────────────────────────────────────────────────

  const totalSets = treino ? treino.exercicios.reduce((acc, e) => acc + getNumSets(e), 0) : 0;

  const doneSetsCount = Object.values(completedSets).reduce((acc, s) => acc + s.size, 0);
  const allDone = totalSets > 0 && doneSetsCount >= totalSets;

  // ── Finish workout ────────────────────────────────────────────────

  const handleConcluir = async () => {
    if (!treino || !alunoId) return;
    setFinishing(true);
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    try {
      const { error } = await supabase
        .from("treinos_concluidos")
        .insert({ treino_id: treino.id, aluno_id: alunoId });
      if (error) throw error;
      toast({ title: "Treino concluído! 🏆", description: `Tempo total: ${fmt(elapsed)}` });
      navigate(`/${slug}/aluno`);
    } catch (err: any) {
      toast({ title: "Erro ao concluir treino", description: err.message, variant: "destructive" });
      if (stopwatchRef.current === null)
        stopwatchRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } finally {
      setFinishing(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Carregando treino...</span>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────

  if (!treino) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <button
          onClick={() => navigate(`/${slug}/aluno`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div
          className="rounded-2xl border border-white/8 py-16 flex flex-col items-center gap-3 text-center"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}
        >
          <Dumbbell className="w-10 h-10 text-white/15" />
          <p className="text-foreground/50 font-medium">Sem treino programado</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Aguarde seu treinador criar e ativar um plano de treino para você.
          </p>
        </div>
      </div>
    );
  }

  // ── Active exercise = first not-yet-fully-done ────────────────────

  const activeExId = treino.exercicios.find(
    (ex) => (completedSets[ex.id]?.size ?? 0) < getNumSets(ex),
  )?.id ?? null;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      <RestTimerSheet
        open={restOpen}
        seconds={restSecs}
        exerciseName={restExName}
        onClose={() => setRestOpen(false)}
      />

      {/* ── Scrollable content ── */}
      <div className="max-w-lg mx-auto px-4 pt-6 pb-44">

        {/* Back */}
        <button
          onClick={() => navigate(`/${slug}/aluno`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Início
        </button>

        {/* Workout header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="typo-label mb-1">{treino.dia_semana}</p>
              <h1 className="typo-page-title">{treino.titulo_treino}</h1>
            </div>
            <div
              className="px-2.5 py-1 rounded-xl text-xs font-semibold shrink-0"
              style={{
                backgroundColor: allDone
                  ? "rgba(var(--cp-rgb),0.15)"
                  : "hsl(var(--foreground) / 0.06)",
                color: allDone ? "var(--cp-500)" : "hsl(var(--muted-foreground))",
              }}
            >
              {doneSetsCount}/{totalSets} séries
            </div>
          </div>
          {treino.descricao_geral && (
            <p className="typo-body mt-2">{treino.descricao_geral}</p>
          )}
        </div>

        {/* ── Exercise cards ── */}
        <div className="space-y-3">
          {treino.exercicios.map((ex, exIdx) => {
            const numSets   = getNumSets(ex);
            const thumb     = getThumb(ex.video_url);
            const exDone    = completedSets[ex.id]?.size ?? 0;
            const allExDone = exDone >= numSets;
            const isActive  = ex.id === activeExId;
            // Expande os blocos por `quantidade` — 1 item aqui = 1 série física de verdade
            const expandedSd = ex.series_detalhadas ? expandSeries(ex.series_detalhadas) : null;
            // Pre-compute groupings for X/N counter (consecutive same-tipo runs)
            const serieGroupings = expandedSd
              ? getSerieGrouping(expandedSd)
              : null;

            return (
              <div
                key={ex.id}
                className="rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  border: allExDone
                    ? "1px solid rgba(var(--cp-rgb), 0.28)"
                    : isActive
                      ? "1px solid rgba(var(--cp-rgb), 0.40)"
                      : "1px solid hsl(var(--foreground) / 0.07)",
                  backgroundColor: allExDone
                    ? "rgba(var(--cp-rgb), 0.04)"
                    : isActive
                      ? "rgba(var(--cp-rgb), 0.025)"
                      : "hsl(var(--foreground) / 0.02)",
                  boxShadow: isActive && !allExDone
                    ? "0 0 28px rgba(var(--cp-rgb), 0.13), inset 0 1px 0 rgba(var(--cp-rgb), 0.08)"
                    : "none",
                }}
              >

                {/* ── Card header ── */}
                <div className="p-4">
                  <div className="flex items-start gap-3">

                    {/* Number badge → becomes animated check when done */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
                      style={{
                        backgroundColor: allExDone
                          ? "rgba(var(--cp-rgb), 0.18)"
                          : isActive
                            ? "rgba(var(--cp-rgb), 0.12)"
                            : "hsl(var(--foreground) / 0.06)",
                      }}
                    >
                      {allExDone ? (
                        <CheckCircle
                          className={`text-green-500${justDoneEx.has(ex.id) ? " animate-pop-in" : ""}`}
                          style={{ width: 18, height: 18 }}
                        />
                      ) : (
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{
                            color: isActive
                              ? "var(--cp-400)"
                              : "hsl(var(--foreground) / 0.3)",
                          }}
                        >
                          {String(exIdx + 1).padStart(2, "0")}
                        </span>
                      )}
                    </div>

                    {/* Name + info chips */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-bold leading-snug transition-all duration-200"
                        style={{
                          fontSize: "1.0625rem",
                          color: allExDone
                            ? "hsl(var(--muted-foreground))"
                            : "hsl(var(--foreground))",
                          textDecoration: allExDone ? "line-through" : "none",
                          opacity: allExDone ? 0.65 : 1,
                        }}
                      >
                        {ex.nome_exercicio}
                      </p>

                      {/* Chips row */}
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {/* Series × reps chip */}
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                          style={{
                            backgroundColor: isActive && !allExDone
                              ? "rgba(var(--cp-rgb), 0.1)"
                              : "hsl(var(--foreground) / 0.06)",
                            color: isActive && !allExDone
                              ? "var(--cp-400)"
                              : "hsl(var(--muted-foreground))",
                          }}
                        >
                          {ex.series_detalhadas?.length
                            ? `${numSets} séries`
                            : `${ex.series}× ${ex.repeticoes}`}
                        </span>

                        {/* Rest chip */}
                        {ex.descanso && (
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1"
                            style={{
                              backgroundColor: "hsl(var(--foreground) / 0.05)",
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            <Timer className="w-2.5 h-2.5" />
                            {ex.descanso}s
                          </span>
                        )}

                        {/* Mid-progress chip */}
                        {exDone > 0 && !allExDone && (
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                            style={{
                              backgroundColor: "rgba(var(--cp-rgb), 0.12)",
                              color: "var(--cp-400)",
                            }}
                          >
                            {exDone}/{numSets}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Observation — internal card */}
                  {ex.observacoes && (
                    <div
                      className="mt-3 px-3 py-2 rounded-xl flex items-start gap-2"
                      style={{
                        backgroundColor: "hsl(var(--foreground) / 0.03)",
                        border: "1px solid hsl(var(--foreground) / 0.06)",
                      }}
                    >
                      <span className="text-sm shrink-0" style={{ marginTop: 1 }}>💡</span>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {ex.observacoes}
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Carga inline editor ── */}
                <div className="px-4 pb-2">
                  {editingCargaId === ex.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        inputMode="decimal"
                        value={editingCargaValue}
                        onChange={(e) => setEditingCargaValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveCargaTreino(ex.id);
                          if (e.key === "Escape") setEditingCargaId(null);
                        }}
                        placeholder="Ex: 40kg"
                        className="flex-1 h-8 rounded-xl px-3 text-sm outline-none"
                        style={{ backgroundColor: "hsl(var(--foreground) / 0.07)", border: "1px solid hsl(var(--foreground) / 0.12)", color: "hsl(var(--foreground))" }}
                      />
                      <button onClick={() => handleSaveCargaTreino(ex.id)} className="h-8 px-3 rounded-xl text-xs font-semibold" style={{ background: "var(--cp-gradient)", color: "var(--cp-text, #fff)" }}>OK</button>
                      <button onClick={() => setEditingCargaId(null)} className="h-8 px-2.5 rounded-xl" style={{ backgroundColor: "hsl(var(--foreground) / 0.07)", color: "hsl(var(--foreground) / 0.45)" }}><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCargaId(ex.id); setEditingCargaValue(cargasBase[ex.id] ?? ""); }}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span style={{ color: "hsl(var(--foreground) / 0.2)" }}>Carga:</span>
                      <span className="font-semibold" style={{ color: cargasBase[ex.id] ? "hsl(42 95% 58%)" : "hsl(var(--foreground) / 0.2)" }}>
                        {cargasBase[ex.id] ?? "— toque para registrar"}
                      </span>
                    </button>
                  )}
                </div>

                {/* ── Separator ── */}
                <div
                  className="mx-4 h-px"
                  style={{ backgroundColor: "hsl(var(--foreground) / 0.05)" }}
                />

                {/* ── Set rows ── */}
                <div className="px-3 py-2 space-y-1">
                  {Array.from({ length: numSets }).map((_, i) => {
                    const isDone   = completedSets[ex.id]?.has(i) ?? false;
                    const detalhe  = expandedSd?.[i];
                    const tipoCfg  = detalhe
                      ? (SERIE_TIPO_CONFIG[detalhe.tipo] ?? {
                          label: detalhe.tipo || 'Custom',
                          bg: 'hsl(var(--foreground) / 0.08)',
                          text: 'hsl(var(--foreground) / 0.55)',
                        })
                      : null;
                    const repsLabel = detalhe?.repeticoes
                      ? `${detalhe.repeticoes} reps`
                      : `${ex.repeticoes} reps`;

                    // X/N counter — show only when consecutive group has > 1 set
                    const grp        = serieGroupings?.[i];
                    const showCounter = grp && grp.total > 1;

                    // Calculate load for this set
                    const base = cargasBase[ex.id] ?? '';
                    const calculatedLoad = detalhe && detalhe.tipo_calculo !== 'manual' && base
                      ? calcularCarga(base, detalhe.tipo_calculo, detalhe.valor_calculo)
                      : null;
                    const manualLoad = detalhe?.tipo_calculo === 'manual'
                      ? detalhe.valor_calculo || null
                      : null;
                    const loadLabel = calculatedLoad ?? manualLoad;

                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all duration-200"
                        style={{
                          backgroundColor: isDone ? 'rgba(var(--cp-rgb), 0.08)' : 'hsl(var(--foreground) / 0.02)',
                        }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all"
                          style={{
                            backgroundColor: isDone ? 'rgba(var(--cp-rgb), 0.2)' : 'hsl(var(--foreground) / 0.06)',
                            color: isDone ? 'var(--cp-500)' : 'hsl(var(--foreground) / 0.3)',
                          }}
                        >
                          {isDone ? '✓' : i + 1}
                        </div>
                        {tipoCfg && (
                          <span
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md shrink-0 tracking-wide"
                            style={{ backgroundColor: tipoCfg.bg, color: tipoCfg.text }}
                          >
                            {tipoCfg.label}
                          </span>
                        )}
                        {/* X/N counter — subtle, só aparece em grupos com > 1 série do mesmo tipo */}
                        {showCounter && (
                          <span
                            className="text-[9px] font-bold tabular-nums shrink-0"
                            style={{ color: isDone ? 'var(--cp-500)' : 'hsl(var(--foreground) / 0.22)', minWidth: 18 }}
                          >
                            {grp!.pos}/{grp!.total}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <span
                            className="text-sm font-medium transition-colors"
                            style={{ color: isDone ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}
                          >
                            {repsLabel}
                            {!detalhe && ex.descanso && !isDone && (
                              <span className="text-[11px] ml-2" style={{ color: 'hsl(var(--foreground) / 0.2)' }}>
                                ⏱ {ex.descanso}s
                              </span>
                            )}
                          </span>
                          {tipoCfg?.hint && !isDone && (
                            <p className="text-[9px] text-muted-foreground/55 mt-0.5 leading-snug">
                              {tipoCfg.hint}
                            </p>
                          )}
                        </div>
                        {/* Calculated / manual load badge */}
                        {loadLabel && (
                          <div className="flex items-center gap-1 shrink-0">
                            {calculatedLoad && base && (
                              <span className="text-[10px]" style={{ color: 'hsl(var(--foreground) / 0.25)' }}>
                                {base} →
                              </span>
                            )}
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: isDone ? 'var(--cp-500)' : 'var(--cp-400)' }}
                            >
                              {loadLabel}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => isDone ? unmarkSet(ex.id, i) : markSet(ex.id, i, ex.descanso)}
                          className="h-8 px-3 rounded-xl text-[11px] font-semibold transition-all active:scale-95"
                          style={
                            isDone
                              ? { backgroundColor: 'rgba(var(--cp-rgb), 0.15)', color: 'var(--cp-500)' }
                              : { backgroundColor: 'hsl(var(--foreground) / 0.07)', color: 'hsl(var(--foreground) / 0.55)' }
                          }
                        >
                          {isDone ? '✓ Feito' : 'Marcar'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* ── Video strip ── */}
                {thumb && ex.video_url && (
                  <a
                    href={ex.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-3 mb-3 mt-1 rounded-xl overflow-hidden relative"
                    style={{
                      display: "block",
                      aspectRatio: "16 / 6",
                      backgroundColor: "rgba(0,0,0,0.3)",
                      border: "1px solid hsl(var(--foreground) / 0.07)",
                      textDecoration: "none",
                    }}
                  >
                    <img
                      src={thumb}
                      alt={ex.nome_exercicio}
                      className="w-full h-full object-cover"
                      style={{ opacity: 0.55 }}
                      onError={(e) => {
                        const el = e.currentTarget.parentElement as HTMLElement | null;
                        if (el) el.style.display = "none";
                      }}
                    />
                    {/* Dark gradient */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.3) 100%)",
                      }}
                    />
                    {/* Play button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.55)",
                          border: "1.5px solid hsl(var(--foreground) / 0.25)",
                          backdropFilter: "blur(4px)",
                          WebkitBackdropFilter: "blur(4px)",
                        }}
                      >
                        <Play className="w-4 h-4 text-white" style={{ marginLeft: 2 }} />
                      </div>
                    </div>
                    {/* Label */}
                    <div className="absolute bottom-2 left-3">
                      <p className="text-[10px] font-medium text-white/60">
                        Ver demonstração
                      </p>
                    </div>
                  </a>
                )}

                {/* ── Ver evolução de carga ── */}
                <button
                  onClick={() => navigate(`/${slug}/aluno/exercicio/${ex.id}`)}
                  className="mx-3 mb-3 flex items-center gap-1.5 text-xs"
                  style={{ color: "hsl(var(--foreground) / 0.25)" }}
                >
                  <TrendingUp className="w-3 h-3" />
                  Ver evolução de carga
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          VOLUME RESUMO — Resumo do volume por grupamento muscular
      ══════════════════════════════════════════════════════════════ */}
      {treino && (() => {
        // Build volume map: grupo → total series × reps
        const parseRepsNum = (r: string): number => {
          if (!r) return 0;
          const clean = r.trim().replace(/\s*x\s*/i, '');
          if (clean.includes('-')) {
            const parts = clean.split('-').map(Number);
            return parts.every(n => !isNaN(n)) ? Math.round((parts[0] + parts[1]) / 2) : 0;
          }
          const n = parseFloat(clean);
          return isNaN(n) ? 0 : n;
        };

        const volumeMap: Record<string, number> = {};
        treino.exercicios.forEach(ex => {
          const grupo = ex.grupo_muscular_principal;
          if (!grupo) return;
          let vol = 0;
          if (ex.series_detalhadas && ex.series_detalhadas.length > 0) {
            vol = ex.series_detalhadas.reduce((acc, s) => acc + parseRepsNum(s.repeticoes) * (s.quantidade ?? 1), 0);
          } else {
            const sets = parseInt(ex.series) || 0;
            const reps = parseRepsNum(ex.repeticoes);
            vol = sets * reps;
          }
          volumeMap[grupo] = (volumeMap[grupo] || 0) + vol;
        });

        const entries = Object.entries(volumeMap).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return null;

        const maxVol = entries[0][1];

        return (
          <div className="max-w-lg mx-auto px-4 pb-4">
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: "hsl(var(--foreground) / 0.07)", backgroundColor: "hsl(var(--foreground) / 0.02)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "hsl(var(--foreground) / 0.35)" }}>
                Volume do treino
              </p>
              <div className="space-y-2">
                {entries.map(([grupo, vol]) => (
                  <div key={grupo} className="flex items-center gap-2.5">
                    <span className="text-xs w-24 shrink-0 text-right" style={{ color: "hsl(var(--foreground) / 0.55)" }}>
                      {grupo}
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "hsl(var(--foreground) / 0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round((vol / maxVol) * 100)}%`,
                          background: "var(--cp-gradient, linear-gradient(135deg, #f59e0b, #d97706))",
                          opacity: 0.5 + 0.5 * (vol / maxVol),
                        }}
                      />
                    </div>
                    <span className="text-xs w-8 shrink-0" style={{ color: "hsl(var(--foreground) / 0.35)" }}>
                      {vol}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2.5" style={{ color: "hsl(var(--foreground) / 0.2)" }}>
                Volume = séries × repetições por grupamento
              </p>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════
          FIXED BOTTOM BAR
          Gradiente de fade + botão de conclusão + stopwatch compacto
      ══════════════════════════════════════════════════════════════ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-3"
        style={{
          background: "linear-gradient(to top, hsl(var(--background)) 60%, transparent 100%)",
          paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
        }}
      >
        <div className="max-w-lg mx-auto space-y-2.5">

          {/* Finish button */}
          <button
            onClick={handleConcluir}
            disabled={finishing}
            className="w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 disabled:opacity-50 transition-all duration-300"
            style={{
              background: allDone
                ? "var(--cp-gradient)"
                : "hsl(var(--foreground) / 0.08)",
              color: allDone
                ? "var(--cp-text, #ffffff)"
                : "hsl(var(--foreground) / 0.45)",
              boxShadow: allDone
                ? "0 4px 24px rgba(var(--cp-rgb), 0.32)"
                : "none",
            }}
          >
            {finishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : allDone ? (
              <Trophy className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {finishing
              ? "Salvando..."
              : allDone
                ? "Treino completo! Concluir"
                : "Encerrar treino"}
          </button>

          {/* Stopwatch + progress row */}
          <div className="flex items-center justify-between px-1">
            {/* Timer */}
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ backgroundColor: "rgba(var(--cp-rgb), 0.15)" }}
              >
                <Timer className="w-3 h-3" style={{ color: "var(--cp-400)" }} />
              </div>
              <span className="text-xs font-bold tabular-nums text-foreground">
                {fmt(elapsed)}
              </span>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {doneSetsCount}/{totalSets} séries
              </span>
              <div
                className="w-20 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.08)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: totalSets > 0
                      ? `${(doneSetsCount / totalSets) * 100}%`
                      : "0%",
                    background: "var(--cp-gradient)",
                  }}
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default TreinoHoje;
