import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { ArrowLeft, Droplet, Loader2, Plus } from "lucide-react";
import { AGUA_META_ML } from "@/lib/agua";
import { grantXP } from "@/lib/xp";
import { evaluateAndUpdateStreak } from "@/lib/streaks";
import WaterWaveCircle from "@/components/WaterWaveCircle";

const QUICK_AMOUNTS = [150, 250, 350, 500, 1000];

const WEEK_LABELS = ["S", "T", "Q", "Q", "S", "S", "D"]; // Seg..Dom

const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

/** Últimos 7 dias (Seg→Dom da semana atual), formato YYYY-MM-DD */
const currentWeekDates = (): string[] => {
  const today = new Date(brazilToday() + "T12:00:00Z");
  const jsDay = today.getUTCDay(); // 0=domingo..6=sábado
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + mondayOffset + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

interface DayEntry {
  date: string;
  ml: number;
}

const Agua = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const base = `/${slug}/aluno`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aguaMl, setAguaMl] = useState(0);
  const [aguaMetaMl, setAguaMetaMl] = useState(AGUA_META_ML);
  const [week, setWeek] = useState<DayEntry[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const dates = currentWeekDates();
      const [rowsRes, dietRes] = await Promise.all([
        supabase
          .from("registros_agua")
          .select("data_registro, ml_total")
          .eq("student_id", session.user.id)
          .in("data_registro", dates),
        supabase
          .from("diets")
          .select("meta_agua_ml")
          .eq("student_id", session.user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const byDate = new Map((rowsRes.data as any[] ?? []).map((r) => [r.data_registro, r.ml_total as number]));
      setWeek(dates.map((date) => ({ date, ml: byDate.get(date) ?? 0 })));
      setAguaMl(byDate.get(brazilToday()) ?? 0);
      const metaAgua = (dietRes.data as any)?.meta_agua_ml;
      if (metaAgua != null) setAguaMetaMl(metaAgua);
    } catch (err: any) {
      toast({ title: "Erro ao carregar água", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addAgua = async (amountMl: number) => {
    if (saving || amountMl <= 0) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const today = brazilToday();
      const newTotal = aguaMl + amountMl;
      const { error } = await supabase
        .from("registros_agua")
        .upsert(
          { student_id: session.user.id, org_id: orgId, data_registro: today, ml_total: newTotal },
          { onConflict: "student_id,data_registro" },
        );
      if (error) throw error;
      setAguaMl(newTotal);
      setWeek((prev) => prev.map((d) => (d.date === today ? { ...d, ml: newTotal } : d)));
      setCustomValue("");
      setCustomOpen(false);
      if (newTotal >= aguaMetaMl && orgId) {
        void grantXP(session.user.id, orgId, "agua_day");
        void evaluateAndUpdateStreak(session.user.id, orgId);
      }
    } catch (err: any) {
      toast({ title: "Erro ao registrar água", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const pct = Math.min(100, (aguaMl / aguaMetaMl) * 100);

  const message =
    pct >= 100 ? "Meta batida! 🎉" : pct >= 70 ? "Quase lá!" : "Hora de hidratar!";

  const diasCompletos = week.filter((d) => d.ml >= aguaMetaMl).length;
  const mediaDiaria = week.length > 0 ? Math.round(week.reduce((s, d) => s + d.ml, 0) / week.length) : 0;
  const taxaConclusao = week.length > 0 ? Math.round((diasCompletos / week.length) * 100) : 0;
  const today = brazilToday();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate(base)} className="w-8 h-8 flex items-center justify-center -ml-1">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <Droplet className="w-5 h-5 shrink-0" style={{ color: "var(--cp-500)" }} />
        <h1 className="text-xl font-bold text-foreground">Água</h1>
      </div>

      <div className="px-4 space-y-5">
        {/* ── Círculo de onda líquida ── */}
        <div className="flex flex-col items-center py-2">
          <WaterWaveCircle
            pct={pct}
            size={200}
            primaryLabel={`${aguaMl}ml`}
            secondaryLabel={`Meta: ${(aguaMetaMl / 1000).toFixed(1)}L`}
          />
          <p className="text-sm text-muted-foreground mt-3">{message}</p>
        </div>

        {/* ── Botões rápidos ── */}
        <div className="grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              disabled={saving}
              onClick={() => addAgua(amount)}
              className="h-14 rounded-2xl border flex flex-col items-center justify-center gap-0.5 disabled:opacity-60 transition-colors hover:bg-white/3"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-1)" }}
            >
              <Droplet className="w-3.5 h-3.5" style={{ color: "var(--cp-400)" }} />
              <span className="text-xs font-semibold text-foreground">{amount >= 1000 ? "1L" : `${amount}ml`}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="h-14 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors hover:bg-white/3"
            style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-1)" }}
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Outro valor</span>
          </button>
        </div>

        {customOpen && (
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Quantidade em ml"
              className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50"
            />
            <button
              type="button"
              disabled={saving || !customValue}
              onClick={() => addAgua(Number(customValue))}
              className="h-11 px-4 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--cp-gradient)", color: "#fff" }}
            >
              Adicionar
            </button>
          </div>
        )}

        {/* ── Esta semana ── */}
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-1)" }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Esta semana</p>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {week.map((d, i) => {
              const dayPct = Math.min(100, (d.ml / aguaMetaMl) * 100);
              const isToday = d.date === today;
              return (
                <div key={d.date} className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-full overflow-hidden flex items-end"
                    style={{ height: 64, backgroundColor: "rgba(255,255,255,0.06)", border: isToday ? "1.5px solid var(--cp-500)" : "1.5px solid transparent" }}
                  >
                    <div className="w-full rounded-full transition-all" style={{ height: `${dayPct}%`, background: "var(--cp-gradient)" }} />
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: isToday ? "var(--cp-400)" : "hsl(var(--muted-foreground))" }}>
                    {WEEK_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="text-center">
              <p className="text-base font-bold text-foreground">{diasCompletos}/7</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Dias completos</p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-foreground">{(mediaDiaria / 1000).toFixed(1)}L</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Média diária</p>
            </div>
            <div className="text-center">
              <p className="text-base font-bold" style={{ color: "var(--cp-400)" }}>{taxaConclusao}%</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Taxa de conclusão</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Agua;
