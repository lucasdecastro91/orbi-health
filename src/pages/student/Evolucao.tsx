import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Weight, Plus, Activity, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import BodyMeasurementsList, { EMPTY_BODY_MEASUREMENTS, buildBodyMeasurements, hasAnyMeasurement, type BodyMeasurements } from "@/components/BodyMeasurements";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Registro {
  id: string;
  data_registro: string;
  peso_kg: number | null;
  created_at: string;
}

// Quantos registros de peso mostrar antes de precisar expandir — a lista
// crescia sem fim (achado ao vivo, 2026-08-27), igual ao problema que as
// fotos de progresso tinham.
const WEIGHT_HISTORY_COLLAPSED_COUNT = 6;

// ─────────────────────────────────────────────────────────────
// Custom chart tooltip
// ─────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2" style={{ backgroundColor: "var(--sheet-bg-2)" }}>
      <p className="text-[11px] text-white/40 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-green-500">{payload[0].value} kg</p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Evolucao = () => {
  const { toast }   = useToast();
  const { orgId }   = useTenantContext();

  // Weight state
  const [registros,  setRegistros]  = useState<Registro[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [peso,       setPeso]       = useState("");
  const [data,       setData]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [showAllWeight, setShowAllWeight] = useState(false);

  // Medidas corporais — última avaliação física com alguma medida
  // preenchida, comparada com a anterior a ela.
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurements>(EMPTY_BODY_MEASUREMENTS);

  useEffect(() => { loadAll(); }, []);

  // ── Data loaders ─────────────────────────────────────────

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const weightRes = await supabase
        .from("registros_evolucao")
        .select("*")
        .eq("student_id", session.user.id)
        .order("data_registro", { ascending: false });

      if (weightRes.error) throw weightRes.error;
      setRegistros(weightRes.data as Registro[]);

      // Medidas corporais — precisa do aluno_id (diferente do user_id usado
      // acima) pra buscar as avaliações físicas com medidas.
      try {
        const { data: alunoRow } = await supabase.from("alunos").select("id").eq("user_id", session.user.id).maybeSingle();
        if (alunoRow) {
          const { data: avaliacoes } = await supabase
            .from("avaliacoes_fisicas")
            .select("data_avaliacao, medida_biceps_dir, medida_biceps_esq, medida_peitoral, medida_cintura, medida_quadril, medida_coxa_dir, medida_coxa_esq, medida_panturrilha_dir, medida_panturrilha_esq")
            .eq("aluno_id", alunoRow.id)
            .order("data_avaliacao", { ascending: false });
          const comMedida = (avaliacoes ?? []).filter((a: any) =>
            a.medida_biceps_dir != null || a.medida_biceps_esq != null || a.medida_peitoral != null ||
            a.medida_cintura != null || a.medida_quadril != null || a.medida_coxa_dir != null ||
            a.medida_coxa_esq != null || a.medida_panturrilha_dir != null || a.medida_panturrilha_esq != null);
          setBodyMeasurements(buildBodyMeasurements(comMedida[0] ?? null, comMedida[1] ?? null));
        }
      } catch { /* medidas ficam vazias se falhar — não bloqueia o resto da tela */ }
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Weight handlers ───────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peso || isNaN(Number(peso))) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase.from("registros_evolucao").upsert({
        student_id:    session.user.id,
        org_id:        orgId,
        data_registro: data,
        peso_kg:       Number(peso),
      }, { onConflict: "student_id,data_registro" });
      if (error) throw error;
      toast({ title: "Peso registrado!" });
      setPeso("");
      await loadAll();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("registros_evolucao").delete().eq("id", id);
      if (error) throw error;
      setRegistros((r) => r.filter((x) => x.id !== id));
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ── Derived ───────────────────────────────────────────────

  const withWeight  = registros.filter((r) => r.peso_kg != null);
  const sorted      = [...withWeight].sort((a, b) => a.data_registro.localeCompare(b.data_registro));
  const pesoInicial = sorted[0]?.peso_kg ?? null;
  const pesoAtual   = sorted[sorted.length - 1]?.peso_kg ?? null;
  const variacao    = pesoInicial != null && pesoAtual != null ? pesoAtual - pesoInicial : null;

  const chartData = sorted.slice(-30).map((r) => ({
    date: format(parseISO(r.data_registro), "dd/MM", { locale: ptBR }),
    peso: r.peso_kg,
  }));

  const visibleRegistros = showAllWeight ? registros : registros.slice(0, WEIGHT_HISTORY_COLLAPSED_COUNT);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

      {/* ── Weight header ─────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Activity className="w-5 h-5" style={{ color: "var(--cp-500)" }} />
        <div>
          <h1 className="text-xl font-bold text-foreground">Evolução</h1>
          <p className="text-muted-foreground text-sm">Peso e medidas corporais</p>
        </div>
      </div>

      {/* Weight stats */}
      {withWeight.length >= 2 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Inicial",  value: `${pesoInicial} kg`, colorClass: "text-foreground" },
            { label: "Atual",    value: `${pesoAtual} kg`,   colorClass: "text-foreground" },
            {
              label: "Variação",
              value: variacao == null ? "—" : `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)} kg`,
              colorClass:
                variacao == null ? "text-muted-foreground" :
                variacao < 0     ? "text-green-500" :
                variacao > 0     ? "text-red-400"   : "text-muted-foreground",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/8 px-4 py-3"
              style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}
            >
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.colorClass}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length >= 2 && (
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Gráfico de peso</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="pesoAreaFillFull" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--cp-500)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--cp-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="peso" stroke="var(--cp-500)" strokeWidth={2.5}
                fill="url(#pesoAreaFillFull)"
                dot={{ r: 3, fill: "var(--cp-500)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "var(--cp-500)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Medidas corporais */}
      {hasAnyMeasurement(bodyMeasurements) && (
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Medidas corporais</p>
          <p className="text-[11px] text-muted-foreground opacity-70 mb-3">Da última avaliação física feita pelo seu treinador</p>
          <BodyMeasurementsList measurements={bodyMeasurements} />
        </div>
      )}

      {/* Register weight */}
      <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Registrar peso</p>
        <form onSubmit={handleSave} className="flex gap-3 items-end">
          <div className="flex-1 min-w-0">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Peso (kg)</label>
            <div className="relative">
              <Weight className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-50 pointer-events-none" />
              <input
                type="number" step="0.1" value={peso}
                onChange={(e) => setPeso(e.target.value)}
                placeholder="72.5"
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 text-base font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50 transition-colors"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Data</label>
            <input
              type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-green-600/50 transition-colors"
            />
          </div>
          <button
            type="submit" disabled={saving || !peso}
            className="h-11 w-11 rounded-xl text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50"
            style={{ background: "var(--cp-gradient)" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* Weight history — colapsado por padrão, expande sob demanda */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Histórico de peso</p>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : registros.length === 0 ? (
          <div className="rounded-2xl border border-white/8 py-10 text-center" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
            <Weight className="w-8 h-8 text-muted-foreground opacity-30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhum registro ainda.</p>
            <p className="text-muted-foreground opacity-60 text-xs mt-1">Registre seu peso acima para começar.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              {visibleRegistros.map((r, idx) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
                  style={{ borderBottom: idx < visibleRegistros.length - 1 ? "1px solid hsl(var(--foreground) / 0.04)" : "none" }}
                >
                  <p className="text-sm font-medium text-foreground">
                    {format(parseISO(r.data_registro), "dd 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-green-500">{r.peso_kg} kg</span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {registros.length > WEIGHT_HISTORY_COLLAPSED_COUNT && (
              <button
                onClick={() => setShowAllWeight((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 mt-2 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}
              >
                {showAllWeight ? (
                  <>Ver menos <ChevronUp className="w-3.5 h-3.5" /></>
                ) : (
                  <>Ver histórico completo ({registros.length}) <ChevronDown className="w-3.5 h-3.5" /></>
                )}
              </button>
            )}
          </>
        )}
      </div>

    </div>
  );
};

export default Evolucao;
