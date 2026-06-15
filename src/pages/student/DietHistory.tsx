import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { ArrowLeft, Flame, TrendingUp, Zap, CalendarDays } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────

type Range = 7 | 15 | 30 | 60 | 90;

interface DayData {
  date: string;      // YYYY-MM-DD
  done: number;
  total: number;
  pct: number;       // 0–100
}

const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

/** Generate the last N calendar dates ending today (Brazil), most-recent first */
const lastNDates = (n: number): string[] => {
  const today = brazilToday();
  const dates: string[] = [];
  const base = new Date(today + "T12:00:00Z");
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() - i * 86400000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const fmtDate = (iso: string): string => {
  const [, mm, dd] = iso.split("-");
  return `${dd}/${mm}`;
};

const fullFmtDate = (iso: string): string => {
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
};

const pctColor = (pct: number, hasData: boolean): string => {
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

  const [range, setRange]         = useState<Range>(30);
  const [days, setDays]           = useState<DayData[]>([]);
  const [totalMeals, setTotalMeals] = useState(0);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { loadHistory(); }, [range]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      const studentId = session.user.id;

      // 1. Active diet → meal count
      const { data: dietData } = await supabase
        .from("diets")
        .select("id, diet_meals(id)")
        .eq("student_id", studentId)
        .eq("is_active", true)
        .maybeSingle();

      const mealCount = (dietData as any)?.diet_meals?.length ?? 0;
      setTotalMeals(mealCount);

      if (mealCount === 0) { setDays([]); setLoading(false); return; }

      // 2. Completions in range
      const dates   = lastNDates(range);
      const oldest  = dates[dates.length - 1];
      const newest  = dates[0];

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

      const result: DayData[] = dates.map((d) => {
        const done = byDate[d] ?? 0;
        return { date: d, done, total: mealCount, pct: Math.round((done / mealCount) * 100) };
      });

      setDays(result);
    } catch (err: any) {
      toast({ title: "Erro ao carregar histórico", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────

  const daysWithData  = days.filter((d) => d.done > 0);
  const avgPct        = daysWithData.length > 0
    ? Math.round(daysWithData.reduce((s, d) => s + d.pct, 0) / daysWithData.length)
    : 0;
  const perfectDays   = days.filter((d) => d.pct === 100).length;

  // Streak: count consecutive days from today backward with pct >= 80
  let streak = 0;
  for (const d of days) {
    if (d.pct >= 80) streak++;
    else break;
  }

  // ── Render ────────────────────────────────────────────────

  const RANGES: Range[] = [7, 15, 30, 60, 90];

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

        {/* Range filter */}
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="flex-1 h-9 rounded-xl text-xs font-semibold transition-all"
              style={{
                backgroundColor: range === r ? "hsl(var(--primary))" : "rgba(255,255,255,0.06)",
                color: range === r ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              }}
            >
              {r}d
            </button>
          ))}
        </div>

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
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Últimos {range} dias</p>
              <div className="flex flex-wrap gap-1.5">
                {[...days].reverse().map((d) => {
                  const hasData = d.done > 0;
                  return (
                    <div
                      key={d.date}
                      title={`${fullFmtDate(d.date)}: ${d.done}/${d.total} refeições`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all"
                      style={{ backgroundColor: pctColor(d.pct, hasData), color: hasData ? "#fff" : "hsl(var(--muted-foreground))" }}
                    >
                      {hasData ? `${d.pct}` : "—"}
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-3">
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
              </div>
            </div>

            {/* Day-by-day list */}
            <div className="space-y-2">
              {days.map((d) => {
                const hasData = d.done > 0;
                return (
                  <div
                    key={d.date}
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
                      {hasData && (
                        <p className="text-[11px] text-white/35 mt-0.5">{d.done} de {d.total} refeições</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Mini progress bar */}
                      {hasData && (
                        <div
                          className="w-20 h-1.5 rounded-full overflow-hidden"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${d.pct}%`, backgroundColor: pctColor(d.pct, true) }}
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
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DietHistory;
