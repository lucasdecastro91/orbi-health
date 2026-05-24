import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Users, MessageSquare, ClipboardCheck, Clock, RefreshCw,
  ArrowRight, Loader2, Target, Phone, AlertTriangle,
} from "lucide-react";
import { getSessionDirect } from "@/lib/sessionUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallHoje {
  id: string;
  lead_nome: string;
  data_hora: string;
  observacoes: string | null;
  status: string;
}

interface PlanVencendo {
  id: string;
  nome: string;
  data_fim: string;
  dias: number;
}

interface RecentUpdate {
  id: string;
  nome: string;
  submitted_at: string;
  alunoId: string | null;
}

interface DashData {
  coachName: string;
  totalClientes: number;
  clientesAtivos: number;
  anamnesesPendentes: number;
  planosVencendo: PlanVencendo[];
  mensagensNaoLidas: number;
  atualizacoes: RecentUpdate[];
  callsHoje: CallHoje[];
}

// ── Metric card ────────────────────────────────────────────────────────────────

const MetricCard = ({
  icon: Icon, label, value, color, sub, onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  sub?: string;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border border-white/8 p-5 flex flex-col gap-3 ${onClick ? "cursor-pointer hover:bg-white/5 active:scale-[0.98] transition-all" : ""}`}
    style={{ backgroundColor: "var(--surface-1)" }}
  >
    <div className="flex items-start justify-between">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}1a` }}
      >
        <Icon className="w-[18px] h-[18px]" style={{ color }} />
      </div>
      {onClick && <ArrowRight className="w-3.5 h-3.5 text-white/15 mt-1" />}
    </div>
    <div>
      <p className="text-2xl font-bold text-white leading-none">{value}</p>
      <p className="text-xs text-white/45 mt-1.5">{label}</p>
      {sub && <p className="text-[11px] text-white/25 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────

const CoachDashboard = () => {
  const navigate  = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const [data,    setData]    = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, [orgId]);

  const loadDashboard = async () => {
    const session = getSessionDirect();
    if (!session) { navigate("/auth"); return; }

    try {
      // Auth check
      const { data: profile } = await supabase
        .from("profiles").select("nome, tipo_usuario").eq("id", session.userId).single();
      if (profile?.tipo_usuario !== "treinador") { navigate(`/${slug}/aluno`); return; }

      // All alunos of this trainer
      const { data: alunos } = await supabase
        .from("alunos")
        .select("id, user_id, ativo, data_fim")
        .eq("treinador_id", session.userId);

      const allAlunos  = alunos ?? [];
      const ativosArr  = allAlunos.filter((a) => a.ativo);
      const userIds    = allAlunos.map((a) => a.user_id);
      const alunoIds   = allAlunos.map((a) => a.id);

      const today      = new Date();
      const todayStr   = today.toISOString().split("T")[0];
      const in30Str    = new Date(today.getTime() + 30 * 86_400_000).toISOString().split("T")[0];
      const sevenAgo   = new Date(today.getTime() -  7 * 86_400_000).toISOString();

      const [mensRes, anamneseRes, atualizacoesRes, planosRes] = await Promise.all([
        // Unread messages
        supabase
          .from("mensagens")
          .select("id", { count: "exact", head: true })
          .eq("destinatario_id", session.userId)
          .eq("lida", false),

        // Already-filled anamneses
        userIds.length > 0
          ? supabase.from("anamneses").select("student_id").in("student_id", userIds)
          : Promise.resolve({ data: [] as any[], error: null }),

        // Recent update submissions (last 7 days)
        orgId
          ? supabase
              .from("atualizacao_respostas")
              .select("id, submitted_at, student_id")
              .eq("org_id", orgId)
              .gte("submitted_at", sevenAgo)
              .order("submitted_at", { ascending: false })
              .limit(6)
          : Promise.resolve({ data: [] as any[], error: null }),

        // Plans expiring in next 30 days
        alunoIds.length > 0
          ? supabase
              .from("alunos")
              .select("id, data_fim")
              .in("id", alunoIds)
              .eq("ativo", true)
              .not("data_fim", "is", null)
              .gte("data_fim", todayStr)
              .lte("data_fim", in30Str)
              .order("data_fim", { ascending: true })
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      // ── Anamneses pendentes ──────────────────────────────────
      const anamneseSet = new Set((anamneseRes.data ?? []).map((a: any) => a.student_id));
      const anamnesesPendentes = allAlunos.filter((a) => a.ativo && !anamneseSet.has(a.user_id)).length;

      // ── Planos vencendo — enrich with names ──────────────────
      let planosVencendo: PlanVencendo[] = [];
      const vencIds = (planosRes.data ?? []).map((a: any) => a.id);
      if (vencIds.length > 0) {
        const { data: vAlunos } = await supabase
          .from("alunos")
          .select("id, data_fim, profiles!alunos_user_id_fkey(nome)")
          .in("id", vencIds);
        planosVencendo = (vAlunos ?? []).map((a: any) => ({
          id: a.id,
          nome: (a.profiles as any)?.nome ?? "—",
          data_fim: a.data_fim,
          dias: Math.ceil((new Date(a.data_fim).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000),
        })).sort((x, y) => x.dias - y.dias);
      }

      // ── Recent updates — enrich with names ───────────────────
      const recentResps = (atualizacoesRes.data ?? []) as any[];
      // Map student_id → aluno.id
      const sToAlunoId: Record<string, string> = {};
      for (const a of allAlunos) sToAlunoId[a.user_id] = a.id;

      let atualizacoes: RecentUpdate[] = recentResps.map((r) => ({
        id: r.id,
        nome: "—",
        submitted_at: r.submitted_at,
        alunoId: sToAlunoId[r.student_id] ?? null,
      }));

      if (recentResps.length > 0) {
        const sIds = [...new Set(recentResps.map((r: any) => r.student_id))] as string[];
        const { data: profs } = await supabase
          .from("profiles").select("id, nome").in("id", sIds);
        const profMap: Record<string, string> = {};
        for (const p of (profs ?? [])) profMap[p.id] = p.nome;
        atualizacoes = recentResps.map((r: any) => ({
          id: r.id,
          nome: profMap[r.student_id] ?? "—",
          submitted_at: r.submitted_at,
          alunoId: sToAlunoId[r.student_id] ?? null,
        }));
      }

      // ── Calls de hoje ────────────────────────────────────────
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
      let callsHoje: CallHoje[] = [];
      try {
        const { data: callsData } = await supabase
          .from("lead_calls")
          .select("id, data_hora, observacoes, status, lead_id")
          .eq("treinador_id", session.userId)
          .gte("data_hora", todayStart.toISOString())
          .lte("data_hora", todayEnd.toISOString())
          .order("data_hora", { ascending: true });

        if (callsData && callsData.length > 0) {
          const leadIds = [...new Set(callsData.map((c: any) => c.lead_id))];
          const { data: leadsData } = await supabase
            .from("leads").select("id, nome").in("id", leadIds);
          const leadMap: Record<string, string> = {};
          for (const l of (leadsData ?? [])) leadMap[l.id] = l.nome;
          callsHoje = callsData.map((c: any) => ({
            id:          c.id,
            lead_nome:   leadMap[c.lead_id] ?? "—",
            data_hora:   c.data_hora,
            observacoes: c.observacoes,
            status:      c.status,
          }));
        }
      } catch { /* leads table may not exist yet — degrade gracefully */ }

      setData({
        coachName:         profile?.nome ?? "",
        totalClientes:     allAlunos.length,
        clientesAtivos:    ativosArr.length,
        anamnesesPendentes,
        planosVencendo,
        mensagensNaoLidas: mensRes.count ?? 0,
        atualizacoes,
        callsHoje,
      });
    } catch (e: any) {
      toast({ title: "Erro ao carregar resumo", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
        <p className="text-white/40 text-sm">Carregando resumo...</p>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-6 lg:px-8 py-6 lg:py-8 max-w-5xl">

        {/* ── Greeting ─────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            {greeting}, {data.coachName.split(" ")[0]}!
          </h1>
          <p className="text-white/40 text-sm mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* ── Metric cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-8">
          <MetricCard
            icon={Users}
            label="Clientes Ativos"
            value={data.clientesAtivos}
            color="rgb(74,222,128)"
            sub={`${data.totalClientes} no total`}
            onClick={() => navigate(`/${slug}/treinador/clientes?filter=ativos`)}
          />
          <MetricCard
            icon={RefreshCw}
            label="Novas Atualizações"
            value={data.atualizacoes.length}
            color="rgb(251,191,36)"
            sub="nos últimos 7 dias"
            onClick={data.atualizacoes.length > 0 ? () => navigate(`/${slug}/treinador/clientes`) : undefined}
          />
          <MetricCard
            icon={ClipboardCheck}
            label="Anamneses Pendentes"
            value={data.anamnesesPendentes}
            color="rgb(129,140,248)"
            sub="clientes sem preencher"
          />
          <MetricCard
            icon={Clock}
            label="Planos Vencendo"
            value={data.planosVencendo.length}
            color="rgb(251,146,60)"
            sub="nos próximos 30 dias"
          />
          <MetricCard
            icon={MessageSquare}
            label="Mensagens"
            value={data.mensagensNaoLidas}
            color="var(--cp-400)"
            sub={data.mensagensNaoLidas === 0 ? "nenhuma não lida" : "não lida" + (data.mensagensNaoLidas !== 1 ? "s" : "")}
            onClick={() => navigate(`/${slug}/treinador/mensagens`)}
          />
        </div>

        {/* ── Two-column lists ─────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Planos vencendo */}
          <div className="rounded-2xl border border-white/8 overflow-hidden"
            style={{ backgroundColor: "var(--surface-1)" }}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "rgba(251,146,60,0.12)" }}>
                  <Clock className="w-3.5 h-3.5" style={{ color: "rgb(251,146,60)" }} />
                </div>
                <p className="text-sm font-semibold text-white/80">Planos Vencendo</p>
              </div>
              <button
                onClick={() => navigate(`/${slug}/treinador/clientes`)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: "var(--btn-soft-color)", backgroundColor: "var(--btn-soft-bg)" }}>
                Ver clientes
              </button>
            </div>

            {data.planosVencendo.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-white/20">
                  Nenhum plano vencendo nos próximos 30 dias.
                </p>
              </div>
            ) : (
              <div>
                {data.planosVencendo.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/${slug}/treinador/aluno/${p.id}`)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/3 transition-colors text-left"
                    style={{ borderBottom: "1px solid var(--border-dim)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/75 truncate">{p.nome}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        Vence em {format(new Date(p.data_fim), "dd/MM/yyyy")}
                      </p>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                      style={{
                        backgroundColor: p.dias <= 7  ? "rgba(239,68,68,0.12)"  : "rgba(251,146,60,0.12)",
                        color:           p.dias <= 7  ? "rgb(248,113,113)"       : "rgb(251,146,60)",
                      }}
                    >
                      {p.dias <= 0 ? "Encerrado" : `${p.dias}d`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Últimas atualizações */}
          <div className="rounded-2xl border border-white/8 overflow-hidden"
            style={{ backgroundColor: "var(--surface-1)" }}>
            <div className="px-5 py-4 flex items-center gap-2.5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "rgba(251,191,36,0.12)" }}>
                <RefreshCw className="w-3.5 h-3.5" style={{ color: "rgb(251,191,36)" }} />
              </div>
              <p className="text-sm font-semibold text-white/80">Últimas Atualizações</p>
            </div>

            {data.atualizacoes.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-white/20">
                  Nenhuma atualização recebida nos últimos 7 dias.
                </p>
              </div>
            ) : (
              <div>
                {data.atualizacoes.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => a.alunoId ? navigate(`/${slug}/treinador/aluno/${a.alunoId}`) : undefined}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/3 transition-colors text-left"
                    style={{ borderBottom: "1px solid var(--border-dim)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
                      style={{ background: "var(--cp-gradient)" }}
                    >
                      {a.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/75 truncate">{a.nome}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        {formatDistanceToNow(new Date(a.submitted_at), { locale: ptBR, addSuffix: true })}
                      </p>
                    </div>
                    {a.alunoId && <ArrowRight className="w-3.5 h-3.5 text-white/15 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── Calls de Hoje ─────────────────────────────────── */}
        {data.callsHoje.length > 0 && (
          <div className="mt-5 rounded-2xl border border-white/8 overflow-hidden"
            style={{ backgroundColor: "var(--surface-1)" }}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "rgba(168,85,247,0.12)" }}>
                  <Target className="w-3.5 h-3.5" style={{ color: "#c084fc" }} />
                </div>
                <p className="text-sm font-semibold text-white/80">
                  Calls de hoje
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(168,85,247,0.12)", color: "#c084fc" }}>
                  {data.callsHoje.length}
                </span>
              </div>
              <button
                onClick={() => navigate(`/${slug}/treinador/leads`)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: "var(--btn-soft-color)", backgroundColor: "var(--btn-soft-bg)" }}>
                Ver leads
              </button>
            </div>
            <div>
              {data.callsHoje.map((c, i) => {
                const hora    = format(new Date(c.data_hora), "HH:mm");
                const perdida = c.status === "perdida";
                const feita   = c.status === "realizada";
                const isLast  = i === data.callsHoje.length - 1;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                    style={{
                      borderBottom: isLast ? "none" : "1px solid var(--border-dim)",
                      backgroundColor: perdida ? "rgba(239,68,68,0.04)" : "transparent",
                    }}
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: perdida ? "rgba(239,68,68,0.12)" : "rgba(168,85,247,0.12)" }}>
                      {perdida
                        ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        : <Phone className="w-3.5 h-3.5" style={{ color: "#c084fc" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/80 truncate">{c.lead_nome}</p>
                      {c.observacoes && (
                        <p className="text-[11px] text-white/30 mt-0.5 truncate">{c.observacoes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold"
                        style={{ color: perdida ? "#f87171" : feita ? "#4ade80" : "#c084fc" }}>
                        {hora}
                      </p>
                      {(perdida || feita) && (
                        <p className="text-[10px] mt-0.5"
                          style={{ color: perdida ? "rgba(248,113,113,0.6)" : "rgba(74,222,128,0.6)" }}>
                          {perdida ? "Perdida" : "Realizada"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CoachDashboard;
