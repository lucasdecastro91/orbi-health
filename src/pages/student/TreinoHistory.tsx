import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { ArrowLeft, Dumbbell, TrendingUp, Zap, CalendarDays, ChevronDown, History } from "lucide-react";
import { getWeekForDate, getTodayWeekdayKey, normalizeWeekday, type WeekLite } from "@/lib/trainingSchedule";

// ─────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────

interface DayData {
  date: string;        // YYYY-MM-DD
  isScheduled: boolean; // dia com treino previsto, segundo a semana do plano vigente naquela data
  done: boolean;
  isFuture: boolean;    // ainda não chegou (mês atual, dias à frente de hoje)
}

/** "YYYY-MM" */
type MonthKey = string;

const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

const monthKeyOf = (iso: string): MonthKey => iso.slice(0, 7);

const currentMonthKey = (): MonthKey => monthKeyOf(brazilToday());

/** All calendar dates of a given month (YYYY-MM) — sempre o mês inteiro, incluindo dias futuros */
const datesOfMonth = (monthKey: MonthKey): string[] => {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  const dates: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    dates.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  return dates;
};

/** Lista de meses (mais recente primeiro) desde `startIso` até o mês atual, inclusive */
const monthsSince = (startIso: string): MonthKey[] => {
  const start = monthKeyOf(startIso);
  const [sy, sm] = start.split("-").map(Number);
  const [cy, cm] = currentMonthKey().split("-").map(Number);

  const months: MonthKey[] = [];
  let y = sy;
  let m = sm;
  while (y < cy || (y === cy && m <= cm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months.reverse();
};

const monthLabel = (monthKey: MonthKey): string => {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const fullFmtDate = (iso: string): string => {
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
};

const cellColor = (d: DayData): string => {
  if (d.isFuture) return "rgba(255,255,255,0.015)";
  if (!d.isScheduled) return "rgba(255,255,255,0.04)";
  return d.done ? "var(--cp-500)" : "hsl(0 70% 55%)";
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const TreinoHistory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();
  const base = `/${slug}/aluno`;

  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(currentMonthKey());
  const [availableMonths, setAvailableMonths] = useState<MonthKey[]>([currentMonthKey()]);
  const [mesesOpen, setMesesOpen] = useState(false);
  const [days, setDays]     = useState<DayData[]>([]);
  const [hasPlano, setHasPlano] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHistory(); }, [selectedMonth]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!aluno) { setHasPlano(false); setLoading(false); return; }

      const { data: planoData } = await supabase
        .from("planos_treino")
        .select("id, data_inicio")
        .eq("aluno_id", aluno.id)
        .eq("ativo", true)
        .maybeSingle();

      if (!planoData) { setHasPlano(false); setLoading(false); return; }
      setHasPlano(true);
      setAvailableMonths(monthsSince(planoData.data_inicio));

      const { data: semanasLite } = await supabase
        .from("semanas")
        .select("id, semana_inicio, semana_fim, treinos ( id, titulo_treino, dia_semana )")
        .eq("plano_id", planoData.id)
        .order("semana_inicio", { ascending: true });

      const weeks = (semanasLite ?? []) as unknown as WeekLite[];

      // Para cada dia, resolve a semana do plano que valia NAQUELA data — não a semana
      // atual — assim, se o treinador trocou a divisão de treinos no meio do caminho,
      // meses passados continuam refletindo o que estava previsto na época.
      const scheduledWeekdaysForDate = (dateStr: string): Set<string> => {
        const week = getWeekForDate(weeks, planoData.data_inicio, new Date(dateStr + "T12:00:00Z"));
        return new Set(
          (week?.treinos ?? [])
            .map((t) => normalizeWeekday(t.dia_semana))
            .filter((k): k is string => !!k),
        );
      };

      const dates = datesOfMonth(selectedMonth);
      const oldest = dates[0];
      const newest = dates[dates.length - 1];

      const { data: completions } = oldest && newest
        ? await supabase
            .from("treino_sessoes_log")
            .select("data_conclusao")
            .eq("aluno_id", aluno.id)
            .gte("data_conclusao", oldest)
            .lte("data_conclusao", newest)
        : { data: [] as { data_conclusao: string }[] };

      const doneDates = new Set((completions ?? []).map((c: any) => c.data_conclusao));
      const todayIso = brazilToday();

      const result: DayData[] = dates.map((dateStr) => {
        const weekdayKey = getTodayWeekdayKey(new Date(dateStr + "T12:00:00Z"));
        return {
          date: dateStr,
          isScheduled: scheduledWeekdaysForDate(dateStr).has(weekdayKey),
          done: doneDates.has(dateStr),
          isFuture: dateStr > todayIso,
        };
      });

      setDays(result);
    } catch (err: any) {
      toast({ title: "Erro ao carregar histórico", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────

  const pastDays = days.filter((d) => !d.isFuture);
  const scheduledDays = pastDays.filter((d) => d.isScheduled);
  const doneCount = scheduledDays.filter((d) => d.done).length;
  const avgPct = scheduledDays.length > 0 ? Math.round((doneCount / scheduledDays.length) * 100) : 0;

  // Sequência: dias previstos consecutivos, do mais recente pro mais antigo, dentro do mês selecionado
  let streak = 0;
  for (const d of [...pastDays].reverse()) {
    if (!d.isScheduled) continue;
    if (d.done) streak++;
    else break;
  }

  const isCurrentMonth = selectedMonth === currentMonthKey();

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24">

      {/* Sticky back bar */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: "rgba(9,9,11,0.85)", backdropFilter: "blur(12px)" }}
      >
        <button
          onClick={() => navigate(`${base}/treinos`)}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white/70" />
        </button>
        <h1 className="text-base font-semibold text-white flex-1">Histórico de Treinos</h1>
      </div>

      <div className="px-4 md:px-6 pt-2 space-y-4">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          </div>
        ) : !hasPlano ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Dumbbell className="w-10 h-10 text-white/10" />
            <p className="text-white/30 text-sm text-center">Nenhum plano de treino ativo encontrado</p>
          </div>
        ) : (
          <>
            {/* Mês selecionado */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {monthLabel(selectedMonth)}
              </p>
              {isCurrentMonth && (
                <span className="text-[10px] text-white/30">atualiza automaticamente</span>
              )}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-2.5">
              <div
                className="rounded-2xl p-3 flex flex-col items-center gap-1 border"
                style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", borderColor: "rgba(var(--cp-rgb),0.18)" }}
              >
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">Aderência</p>
                <p className="text-xl font-bold text-green-500">{avgPct}%</p>
              </div>
              <div
                className="rounded-2xl p-3 flex flex-col items-center gap-1 border"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <Zap className="w-4 h-4 text-yellow-400" />
                <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">Sequência</p>
                <p className="text-xl font-bold text-white">{streak}d</p>
              </div>
              <div
                className="rounded-2xl p-3 flex flex-col items-center gap-1 border"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <CalendarDays className="w-4 h-4 text-green-500" />
                <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">Concluídos</p>
                <p className="text-xl font-bold text-white">{doneCount}</p>
              </div>
            </div>

            {/* Dot grid heatmap */}
            <div
              className="rounded-2xl border p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Dias do mês</p>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => (
                  <div
                    key={d.date}
                    title={`${fullFmtDate(d.date)}: ${!d.isScheduled ? "dia de descanso" : d.done ? "treino feito" : "treino não feito"}`}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: cellColor(d) }}
                  >
                    {d.isScheduled && !d.isFuture && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.done ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }} />
                    )}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--cp-500)" }} />
                  <span className="text-[10px] text-white/35">Feito</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(0 70% 55%)" }} />
                  <span className="text-[10px] text-white/35">Não feito</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
                  <span className="text-[10px] text-white/35">Descanso</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.015)" }} />
                  <span className="text-[10px] text-white/35">Ainda não chegou</span>
                </div>
              </div>
            </div>

            {/* Day-by-day list — só dias com treino previsto */}
            <div className="space-y-2">
              {days.filter((d) => d.isScheduled && !d.isFuture).map((d) => (
                <div
                  key={d.date}
                  className="rounded-2xl border px-4 py-3 flex items-center justify-between"
                  style={{
                    backgroundColor: d.done ? "rgba(var(--cp-rgb),0.05)" : "rgba(255,255,255,0.015)",
                    borderColor: d.done ? "rgba(var(--cp-rgb),0.2)" : "rgba(255,255,255,0.05)",
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                    {fullFmtDate(d.date)}
                  </p>
                  <p className="text-sm font-bold" style={{ color: d.done ? "var(--cp-400)" : "hsl(0 70% 62%)" }}>
                    {d.done ? "Feito" : "Não feito"}
                  </p>
                </div>
              ))}
              {days.filter((d) => d.isScheduled && !d.isFuture).length === 0 && (
                <p className="text-white/30 text-sm text-center py-6">Nenhum treino previsto nesse mês.</p>
              )}
            </div>

            {/* Meses anteriores — colapsável */}
            {availableMonths.length > 1 && (
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <button
                  onClick={() => setMesesOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-3"
                >
                  <History className="w-4 h-4 text-white/40" />
                  <span className="text-sm font-medium flex-1 text-left" style={{ color: "hsl(var(--foreground))" }}>
                    Meses anteriores
                  </span>
                  <ChevronDown
                    className="w-4 h-4 text-white/40 transition-transform"
                    style={{ transform: mesesOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: mesesOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 0.25s ease",
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 space-y-1.5">
                      {availableMonths.map((mk) => (
                        <button
                          key={mk}
                          onClick={() => { setSelectedMonth(mk); setMesesOpen(false); }}
                          className="w-full rounded-xl px-3 py-2.5 flex items-center justify-between text-sm"
                          style={{
                            backgroundColor: mk === selectedMonth ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.03)",
                            color: mk === selectedMonth ? "var(--cp-400)" : "hsl(var(--foreground))",
                            fontWeight: mk === selectedMonth ? 600 : 400,
                          }}
                        >
                          <span>{monthLabel(mk)}</span>
                          {mk === currentMonthKey() && (
                            <span className="text-[10px] text-white/30">atual</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TreinoHistory;
