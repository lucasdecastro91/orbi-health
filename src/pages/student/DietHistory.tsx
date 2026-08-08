import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { ArrowLeft, Flame, TrendingUp, Zap, CalendarDays, ChevronDown, History } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────

interface DayData {
  date: string;      // YYYY-MM-DD
  done: number;
  total: number;
  pct: number;       // 0–100
  isFuture: boolean; // ainda não chegou (mês atual, dias à frente de hoje)
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

const pctColor = (pct: number, hasData: boolean, isFuture: boolean): string => {
  if (isFuture) return "rgba(255,255,255,0.015)";
  if (!hasData) return "rgba(255,255,255,0.08)";
  if (pct >= 80) return "var(--cp-500)";
  if (pct >= 50) return "hsl(42 95% 55%)";
  return "hsl(0 70% 55%)";
};

const pctTextColor = (pct: number, hasData: boolean): string => {
  if (!hasData) return "hsl(var(--muted-foreground))";
  if (pct >= 80) return "var(--cp-400)";
  if (pct >= 50) return "hsl(42 95% 62%)";
  return "hsl(0 70% 62%)";
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const DietHistory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();

  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(currentMonthKey());
  const [availableMonths, setAvailableMonths] = useState<MonthKey[]>([currentMonthKey()]);
  const [mesesOpen, setMesesOpen] = useState(false);
  const [days, setDays]           = useState<DayData[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [totalMeals, setTotalMeals] = useState(0);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { loadHistory(); }, [selectedMonth]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      const studentId = session.user.id;

      // 1. Todas as dietas do aluno (não só a ativa) → cada mês passado usa a contagem
      // de refeições da dieta que estava em vigor NAQUELA época, não a de hoje.
      const { data: allDiets } = await supabase
        .from("diets")
        .select("id, created_at, is_active, diet_meals(id)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: true });

      const dietsSorted = ((allDiets ?? []) as any[])
        .map((d) => ({ createdAtDate: d.created_at.slice(0, 10), mealCount: d.diet_meals?.length ?? 0 }))
        .sort((a, b) => a.createdAtDate.localeCompare(b.createdAtDate));

      const activeDiet = ((allDiets ?? []) as any[]).find((d) => d.is_active);
      const mealCount = activeDiet?.diet_meals?.length ?? 0;
      setTotalMeals(mealCount);

      if (!activeDiet || mealCount === 0) { setDays([]); setLoading(false); return; }

      setAvailableMonths(monthsSince(dietsSorted[0].createdAtDate));

      // Pra uma data qualquer, pega a última dieta criada até aquele dia (a que estava valendo)
      const mealCountForDate = (dateStr: string): number => {
        let count = 0;
        for (const d of dietsSorted) {
          if (d.createdAtDate <= dateStr) count = d.mealCount;
          else break;
        }
        return count;
      };

      // 2. Completions no mês selecionado
      const dates   = datesOfMonth(selectedMonth);
      const oldest  = dates[0];
      const newest  = dates[dates.length - 1];

      const { data: completions, error } = await supabase
        .from("meal_completions")
        .select("meal_id, date")
        .eq("student_id", studentId)
        .gte("date", oldest)
        .lte("date", newest);

      // Tabela ainda não existe no banco → trata silenciosamente
      if (error) {
        const missing =
          error?.code === "PGRST205" ||
          error?.code === "42P01" ||
          String(error?.message ?? "").includes("meal_completions");
        if (missing) { setDays([]); setLoading(false); return; }
        throw error;
      }

      // Group by date
      const byDate: Record<string, number> = {};
      for (const c of completions ?? []) {
        byDate[c.date] = (byDate[c.date] ?? 0) + 1;
      }

      const todayIso = brazilToday();
      const result: DayData[] = dates.map((d) => {
        const done = byDate[d] ?? 0;
        const total = mealCountForDate(d);
        return {
          date: d,
          done,
          total,
          pct: total > 0 ? Math.round((done / total) * 100) : 0,
          isFuture: d > todayIso,
        };
      });

      setDays(result);

      // Seleciona por padrão hoje (se estiver visível neste mês) ou o dia mais
      // recente já passado — assim o card de detalhe nunca abre vazio.
      const pastResult = result.filter((d) => !d.isFuture);
      const defaultDay = pastResult.find((d) => d.date === todayIso) ?? pastResult[pastResult.length - 1];
      setSelectedDay(defaultDay?.date ?? null);
    } catch (err: any) {
      toast({ title: "Erro ao carregar histórico", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────

  const pastDays      = days.filter((d) => !d.isFuture);
  const daysWithData  = pastDays.filter((d) => d.done > 0);
  const avgPct        = daysWithData.length > 0
    ? Math.round(daysWithData.reduce((s, d) => s + d.pct, 0) / daysWithData.length)
    : 0;
  const perfectDays   = pastDays.filter((d) => d.pct === 100).length;

  // Streak: dias consecutivos com pct >= 80, do mais recente pro mais antigo
  let streak = 0;
  for (const d of [...pastDays].reverse()) {
    if (d.pct >= 80) streak++;
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
          onClick={() => navigate(`/${slug}/aluno/dieta`)}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white/70" />
        </button>
        <h1 className="text-base font-semibold text-white flex-1">Histórico de Dieta</h1>
      </div>

      <div className="px-4 md:px-6 pt-2 space-y-4">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          </div>
        ) : totalMeals === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Flame className="w-10 h-10 text-white/10" />
            <p className="text-white/30 text-sm text-center">Nenhuma dieta ativa encontrada</p>
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
                <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">Média</p>
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
                <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">100%</p>
                <p className="text-xl font-bold text-white">{perfectDays}d</p>
              </div>
            </div>

            {/* Dot grid heatmap */}
            <div
              className="rounded-2xl border p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Dias do mês</p>
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => {
                  const hasData = d.done > 0;
                  const isSelected = d.date === selectedDay;
                  return (
                    <button
                      key={d.date}
                      disabled={d.isFuture}
                      onClick={() => setSelectedDay(d.date)}
                      title={`${fullFmtDate(d.date)}: ${d.isFuture ? "ainda não chegou" : `${d.done}/${d.total} refeições`}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all disabled:cursor-default"
                      style={{
                        backgroundColor: pctColor(d.pct, hasData, d.isFuture),
                        color: hasData ? "#fff" : "hsl(var(--muted-foreground))",
                        boxShadow: isSelected ? "0 0 0 2px hsl(var(--background)), 0 0 0 4px var(--cp-500)" : "none",
                      }}
                    >
                      {!d.isFuture && (hasData ? `${d.pct}` : "—")}
                    </button>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--cp-500)" }} />
                  <span className="text-[10px] text-white/35">≥80%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(42 95% 55%)" }} />
                  <span className="text-[10px] text-white/35">50–79%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(0 70% 55%)" }} />
                  <span className="text-[10px] text-white/35">&lt;50%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                  <span className="text-[10px] text-white/35">sem dados</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(255,255,255,0.015)" }} />
                  <span className="text-[10px] text-white/35">Ainda não chegou</span>
                </div>
              </div>
            </div>

            {/* Detalhe do dia selecionado (clique numa bolinha acima pra trocar) */}
            {(() => {
              const d = days.find((x) => x.date === selectedDay);
              if (!d) return null;
              const hasData = d.done > 0;
              return (
                <div
                  className="rounded-2xl border px-4 py-3 flex items-center justify-between"
                  style={{
                    backgroundColor: hasData ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.01)",
                    borderColor: hasData ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: hasData ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                      {fullFmtDate(d.date)}
                    </p>
                    <p className="text-[11px] text-white/35 mt-0.5">
                      {hasData ? `${d.done} de ${d.total} refeições` : "Nenhuma refeição registrada"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {hasData && (
                      <div
                        className="w-20 h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${d.pct}%`, backgroundColor: pctColor(d.pct, true, false) }}
                        />
                      </div>
                    )}
                    <p
                      className="text-sm font-bold w-10 text-right"
                      style={{ color: pctTextColor(d.pct, hasData) }}
                    >
                      {hasData ? `${d.pct}%` : "—"}
                    </p>
                  </div>
                </div>
              );
            })()}

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

export default DietHistory;
