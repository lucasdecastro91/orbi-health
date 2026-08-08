import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  Activity,
  AlertCircle,
  ChevronRight,
  ClipboardCheck,
  Download,
  Droplet,
  Dumbbell,
  FileText,
  HeartPulse,
  MessageSquare,
  Plus,
  ScanLine,
  Utensils,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { pickTodaysSession, type TodaysSession, type WeekLite } from "@/lib/trainingSchedule";
import { AGUA_META_ML } from "@/lib/agua";
import { grantXP } from "@/lib/xp";
import { evaluateAndUpdateStreak } from "@/lib/streaks";

interface Plano {
  id: string;
  nome_plano: string;
  objetivo: string | null;
  data_inicio: string;
  data_fim: string | null;
  atualizado_em: string;
  visto_pelo_aluno_em: string | null;
}

interface DietaPdf {
  nome_arquivo: string;
  pdf_url: string;
  atualizada_em: string;
  vista_pelo_aluno_em: string | null;
}

interface DietaAtiva {
  id: string;
  title: string;
  calories: number | null;
  created_at: string | null;
  meta_agua_ml: number | null;
}

type DietaStatus =
  | { type: "structured"; data: DietaAtiva }
  | { type: "pdf"; data: DietaPdf };

interface Feedback {
  id: string;
  titulo: string | null;
  mensagem: string;
  created_at: string;
  visto_pelo_aluno: boolean;
}

interface PesoStats {
  inicial: number | null;
  atual: number | null;
  variacao: number | null;
  registros: number;
  chart: { peso: number }[];
}

interface CardioLast {
  tipo: string;
  duracao_minutos: number;
  data_sessao: string;
}

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-white/8 px-4 py-6 text-center">
    <AlertCircle className="w-7 h-7 text-muted-foreground opacity-40 mx-auto mb-2" />
    <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
  </div>
);

// Segunda a domingo — mesma ordem usada no mockup
const WEEK_STRIP_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Data local do Brasil (YYYY-MM-DD) — mesma convenção usada em Agua.tsx pra "hoje" baterem os dois */
const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

/** YYYY-MM-DD (Seg→Dom) da semana atual — mesma convenção de `data_conclusao` usada em Treinos.tsx */
const getCurrentWeekDates = (): string[] => {
  const today = new Date();
  const jsDay = today.getDay(); // 0=domingo..6=sábado
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
};

const StudentDashboard = () => {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [dieta, setDieta] = useState<DietaStatus | null>(null);
  const [proximaAtualizacao, setProximaAtualizacao] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<Feedback | null>(null);
  const [avaliacaoPendente,  setAvaliacaoPendente]  = useState(false);
  const [anamnese_pendente,  setAnamnese_pendente]  = useState(false);
  const [anamneseDismissed,  setAnamneseDismissed]  = useState(false); // só nessa sessão
  const [introAnamnese,      setIntroAnamnese]      = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [totalXp, setTotalXp] = useState(0);
  const [todaysSession, setTodaysSession] = useState<TodaysSession | null>(null);
  const [pesoStats, setPesoStats] = useState<PesoStats | null>(null);
  const [selectedPesoIdx, setSelectedPesoIdx] = useState<number | null>(null);
  const [aguaMl, setAguaMl] = useState(0);
  const [aguaMetaMl, setAguaMetaMl] = useState(AGUA_META_ML);
  const [aguaSaving, setAguaSaving] = useState(false);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [dietaMealCount, setDietaMealCount] = useState<number | null>(null);
  const [cardioLast, setCardioLast] = useState<CardioLast | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const { hasAvaliacaoPostural } = usePlanFeatures();
  const base = `/${slug}/aluno`;

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Efeito separado (não a carga inicial de uma vez só): orgId do TenantContext pode
  // ainda não estar pronto quando o mount original roda, e o efeito de cima nunca
  // re-executa (array de dependências vazio) — isso deixava o XP travado em 0.
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: xpRow } = await supabase
        .from("xp_totals")
        .select("total_xp")
        .eq("student_id", session.user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      setTotalXp((xpRow as any)?.total_xp ?? 0);
    })();
  }, [orgId]);

  const loadDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("tipo_usuario, nome")
        .eq("id", session.user.id)
        .single();

      if (profile?.tipo_usuario !== "aluno") {
        navigate("/treinador");
        return;
      }
      if (profile?.nome) setUserName(profile.nome);

      const { data: aluno } = await (supabase as any)
        .from("alunos")
        .select("id, form_atualizacao_ultima_data, avaliacao_postural_pendente, anamnese_dispensada, anamnese_pendente")
        .eq("user_id", session.user.id)
        .single();

      if (!aluno) {
        toast({
          title: "Erro",
          description: "Dados do aluno não encontrados.",
          variant: "destructive",
        });
        return;
      }

      setProximaAtualizacao(aluno.form_atualizacao_ultima_data);
      setAvaliacaoPendente(!!aluno.avaliacao_postural_pendente);

      // Verifica se a anamnese já foi preenchida (registro na tabela anamneses)
      // independentemente do flag anamnese_pendente (que pode estar desatualizado).
      // Se dispensada pelo treinador, nunca exibe o aviso.
      if (aluno.anamnese_pendente && !aluno.anamnese_dispensada) {
        const { data: anamneseRecord } = await supabase
          .from("anamneses")
          .select("id, pendente")
          .eq("student_id", session.user.id)
          .maybeSingle();

        if (anamneseRecord) {
          if (anamneseRecord.pendente) {
            // Nova anamnese solicitada pelo treinador/colaborador — exibe o aviso
            setAnamnese_pendente(true);
          } else {
            // Anamnese já preenchida e sem nova solicitação — esconde o aviso
            setAnamnese_pendente(false);
            void (supabase as any).from("alunos").update({ anamnese_pendente: false }).eq("id", aluno.id);
          }
        } else {
          setAnamnese_pendente(true);
          // Busca mensagem de boas-vindas da anamnese (se existir)
          if (orgId) {
            const { data: tpl } = await (supabase as any)
              .from("anamnese_templates")
              .select("introducao")
              .eq("org_id", orgId)
              .maybeSingle();
            if (tpl?.introducao) setIntroAnamnese(tpl.introducao);
          }
        }
      } else {
        setAnamnese_pendente(false);
      }

      const { data: planoData } = await supabase
        .from("planos_treino")
        .select("id, nome_plano, objetivo, data_inicio, data_fim, atualizado_em, visto_pelo_aluno_em")
        .eq("aluno_id", aluno.id)
        .eq("ativo", true)
        .maybeSingle();

      setPlano(planoData);

      if (planoData) {
        const { data: semanasLite } = await supabase
          .from("semanas")
          .select("id, semana_inicio, semana_fim, treinos ( id, titulo_treino, dia_semana )")
          .eq("plano_id", planoData.id)
          .order("semana_inicio", { ascending: true });

        if (semanasLite && semanasLite.length > 0) {
          const weeks = semanasLite as unknown as WeekLite[];
          setTodaysSession(pickTodaysSession(weeks, planoData.data_inicio));
        }
      }

      const { data: activeDiet, error: activeDietError } = await supabase
        .from("diets")
        .select("id, title, calories, created_at, meta_agua_ml")
        .eq("student_id", session.user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeDietError) throw activeDietError;

      if (activeDiet) {
        setDieta({ type: "structured", data: activeDiet as DietaAtiva });
        if ((activeDiet as any).meta_agua_ml != null) setAguaMetaMl((activeDiet as any).meta_agua_ml);

        const { count: mealCount } = await supabase
          .from("diet_meals")
          .select("id", { count: "exact", head: true })
          .eq("diet_id", activeDiet.id);
        setDietaMealCount(mealCount ?? null);
      } else {
        const { data: dietaPdfData } = await supabase
          .from("dietas_pdf")
          .select("nome_arquivo, pdf_url, atualizada_em, vista_pelo_aluno_em")
          .eq("aluno_id", aluno.id)
          .maybeSingle();

        setDieta(dietaPdfData ? { type: "pdf", data: dietaPdfData as DietaPdf } : null);
      }

      const { data: feedbackData } = await supabase
        .from("feedbacks_alunos")
        .select("*")
        .eq("aluno_id", aluno.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setLastFeedback(feedbackData);

      const { data: pesoRows } = await supabase
        .from("registros_evolucao")
        .select("data_registro, peso_kg")
        .eq("student_id", session.user.id)
        .order("data_registro", { ascending: true });

      if (pesoRows) {
        const withWeight = (pesoRows as any[]).filter((r) => r.peso_kg != null);
        const last30 = withWeight.slice(-30);
        const inicial = last30[0]?.peso_kg ?? null;
        const atual = last30[last30.length - 1]?.peso_kg ?? null;
        setPesoStats({
          inicial,
          atual,
          variacao: inicial != null && atual != null ? atual - inicial : null,
          registros: last30.length,
          chart: last30.map((r) => ({ peso: r.peso_kg })),
        });
      }

      const todayStr = brazilToday();
      const { data: aguaRow } = await supabase
        .from("registros_agua")
        .select("ml_total")
        .eq("student_id", session.user.id)
        .eq("data_registro", todayStr)
        .maybeSingle();
      setAguaMl((aguaRow as any)?.ml_total ?? 0);

      // Dias da semana atual em que o aluno concluiu algum treino (pra tira de calendário)
      const weekDates = getCurrentWeekDates();
      const { data: completions } = await supabase
        .from("treino_sessoes_log")
        .select("data_conclusao")
        .eq("aluno_id", aluno.id)
        .gte("data_conclusao", weekDates[0])
        .lte("data_conclusao", weekDates[6]);
      setCompletedDates(new Set((completions as any[] ?? []).map((c) => c.data_conclusao)));

      const { data: cardioRow } = await supabase
        .from("cardio_sessoes")
        .select("tipo, duracao_minutos, data_sessao")
        .eq("student_id", session.user.id)
        .order("data_sessao", { ascending: false })
        .limit(1)
        .maybeSingle();
      setCardioLast((cardioRow as CardioLast) ?? null);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString("pt-BR");

  const handleViewDiet = async () => {
    if (!dieta) return;

    if (dieta.type === "structured") {
      navigate(`/${slug}/aluno/dieta`);
      return;
    }

    window.open(dieta.data.pdf_url, "_blank");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: aluno } = await supabase
          .from("alunos")
          .select("id")
          .eq("user_id", session.user.id)
          .single();

        if (aluno) {
          await supabase
            .from("dietas_pdf")
            .update({ vista_pelo_aluno_em: new Date().toISOString() })
            .eq("aluno_id", aluno.id);
        }
      }
    } catch (error) {
      console.error("Erro ao marcar dieta como vista:", error);
    }
  };

  const handleStartTraining = () => {
    if (todaysSession) {
      navigate(`${base}/treinos?weekId=${todaysSession.weekId}&treinoId=${todaysSession.treinoId}`);
    } else {
      navigate(`${base}/treinos`);
    }
  };

  const handleAddAgua = async (amountMl: number) => {
    if (aguaSaving) return;
    setAguaSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const todayStr = brazilToday();
      const newTotal = aguaMl + amountMl;
      const { error } = await supabase
        .from("registros_agua")
        .upsert(
          { student_id: session.user.id, org_id: orgId, data_registro: todayStr, ml_total: newTotal },
          { onConflict: "student_id,data_registro" },
        );
      if (error) throw error;
      setAguaMl(newTotal);
      if (newTotal >= aguaMetaMl && orgId) {
        void grantXP(session.user.id, orgId, "agua_day");
        void evaluateAndUpdateStreak(session.user.id, orgId);
      }
    } catch (err: any) {
      toast({ title: "Erro ao registrar água", description: err.message, variant: "destructive" });
    } finally {
      setAguaSaving(false);
    }
  };

  const isPlanoNovo = plano && (!plano.visto_pelo_aluno_em || new Date(plano.atualizado_em) > new Date(plano.visto_pelo_aluno_em));
  const isDietaNova =
    dieta?.type === "pdf" &&
    (!dieta.data.vista_pelo_aluno_em || new Date(dieta.data.atualizada_em) > new Date(dieta.data.vista_pelo_aluno_em));
  const hasFeedbackNovo = lastFeedback && !lastFeedback.visto_pelo_aluno;
  const firstName = userName.split(" ")[0] || "Aluno";
  const avatarInitial = userName.trim().charAt(0).toUpperCase() || "?";

  // Tira de calendário: segunda a domingo da semana atual
  const today = new Date();
  const jsDay = today.getDay(); // 0=domingo..6=sábado
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const weekStrip = WEEK_STRIP_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    return {
      iso: d.toISOString(),
      label,
      day: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
      hasTreino: completedDates.has(dateKey),
    };
  });

  /** Ponto do gráfico de peso — mostra o kg só quando clicado, pra não poluir com todos os valores à mostra */
  const renderPesoDot = (props: any) => {
    const { cx, cy, index, payload } = props;
    const isSelected = selectedPesoIdx === index;
    return (
      <g
        key={`peso-dot-${index}`}
        onClick={() => setSelectedPesoIdx(isSelected ? null : index)}
        style={{ cursor: "pointer" }}
      >
        <circle cx={cx} cy={cy} r={4} fill="var(--cp-500)" />
        {isSelected && (
          <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fill: "var(--cp-400)" }}>
            {payload.peso}kg
          </text>
        )}
      </g>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando seu painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-2">

      <div className="px-4 pt-3 space-y-3">

        {/* ── Card de anamnese pendente ── */}
        {anamnese_pendente && !anamneseDismissed && (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.10)", borderColor: "rgba(var(--cp-rgb),0.30)" }}
          >
            {/* Faixa de destaque no topo */}
            <div className="h-1 w-full" style={{ background: "var(--cp-gradient)" }} />

            <div className="px-4 pt-4 pb-4 space-y-3">
              {/* Ícone + título */}
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(var(--cp-rgb),0.15)" }}
                >
                  <ClipboardCheck className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
                </div>
                <p className="text-sm font-bold text-foreground leading-snug">
                  Ficha de Anamnese
                </p>
              </div>

              {/* Mensagem: introdução do template ou fallback */}
              {introAnamnese ? (
                <>
                  {/* Estilos para o HTML do editor */}
                  <style>{`
                    .dash-intro b, .dash-intro strong { color: var(--text-high); font-weight: 700; }
                    .dash-intro i, .dash-intro em { font-style: italic; }
                    .dash-intro u { text-decoration: underline; }
                    .dash-intro a { color: var(--cp-400); }
                    .dash-intro p { margin-bottom: 0.5rem; }
                    .dash-intro div { margin-bottom: 0.3rem; }
                  `}</style>
                  <div
                    className="dash-intro text-xs leading-relaxed max-h-48 overflow-y-auto pr-1"
                    style={{ color: "var(--text-mid)" }}
                    dangerouslySetInnerHTML={{ __html: introAnamnese }}
                  />
                </>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-mid)" }}>
                  Para darmos início à estruturação do seu plano, preencha sua ficha de anamnese. Leva poucos minutos e é essencial para personalizar todo o seu material.
                </p>
              )}

              {/* Botões */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigate(`${base}/anamnese`)}
                  className="flex-1 h-11 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "var(--cp-gradient)", color: "var(--cp-text)" }}
                >
                  Preencher agora
                </button>
                <button
                  type="button"
                  onClick={() => setAnamneseDismissed(true)}
                  className="h-11 px-4 rounded-xl text-sm font-medium transition-colors"
                  style={{ backgroundColor: "var(--surface-2)", color: "var(--text-dim)", border: "1px solid var(--border-subtle)" }}
                >
                  Lembrar depois
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Avaliação postural pendente ── */}
        {hasAvaliacaoPostural && avaliacaoPendente && (
          <button
            type="button"
            onClick={() => navigate(`${base}/avaliacao-postural`)}
            className="w-full rounded-2xl border px-4 py-4 flex items-center gap-3 text-left transition-colors hover:opacity-90"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", borderColor: "rgba(var(--cp-rgb),0.25)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.15)" }}>
              <ScanLine className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Avaliação postural pendente</p>
              <p className="text-xs text-muted-foreground mt-0.5">Seu treinador solicitou uma avaliação. Toque para iniciar.</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          </button>
        )}

        {/* ── Novo feedback do treinador ── */}
        {hasFeedbackNovo && (
          <button
            type="button"
            onClick={() => navigate(`${base}/feedbacks`)}
            className="w-full rounded-2xl border px-4 py-4 flex items-center gap-3 text-left transition-colors hover:opacity-90"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", borderColor: "rgba(var(--cp-rgb),0.25)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.15)" }}>
              <MessageSquare className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Novo feedback do treinador</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{lastFeedback?.titulo || "Toque para ver a mensagem"}</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          </button>
        )}

        {/* ── Saudação + XP + tira de calendário ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0"
                style={{ background: "var(--cp-gradient)" }}
              >
                {avatarInitial}
              </div>
              <p className="text-lg font-bold text-foreground truncate">
                Olá, <span style={{ color: "var(--cp-400)" }}>{firstName}!</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`${base}/ranking`)}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 shrink-0 transition-opacity hover:opacity-80"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}
            >
              <Zap className="w-3.5 h-3.5" style={{ color: "var(--cp-400)" }} />
              <span className="text-xs font-bold" style={{ color: "var(--cp-400)" }}>{totalXp} XP</span>
            </button>
          </div>

          {/* ── Tira de calendário da semana ── */}
          <div
            className="rounded-2xl px-2.5 py-2"
            style={{ border: "1.5px solid rgba(var(--cp-rgb),0.35)", backgroundColor: "hsl(var(--background))" }}
          >
            <div className="grid grid-cols-7 gap-1">
              {weekStrip.map((d) =>
                d.isToday ? (
                  <div key={d.iso} className="flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-xl py-1 flex flex-col items-center gap-0.5"
                      style={{ background: "var(--cp-gradient)" }}
                    >
                      <span className="text-[9px] font-semibold text-white uppercase">{d.label}</span>
                      <span className="text-xs font-bold text-white">{d.day}</span>
                    </div>
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: d.hasTreino ? "#fff" : "transparent" }} />
                  </div>
                ) : (
                  <div key={d.iso} className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-medium uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {d.label}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {d.day}
                    </span>
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: d.hasTreino ? "var(--cp-500)" : "transparent" }} />
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        {/* ── Treino de hoje ── */}
        <section className="rounded-2xl border overflow-hidden relative p-4" style={{ backgroundColor: "var(--dash-card-bg)", borderColor: "var(--dash-card-border)", boxShadow: "var(--dash-card-shadow)" }}>
          <div className="relative flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.12)" }}>
              <Dumbbell className="w-[18px] h-[18px]" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">Treino de hoje</p>
              <p className="text-xs text-muted-foreground truncate">
                {todaysSession ? todaysSession.titulo : plano ? "Sem treino hoje" : "Aguardando plano"}
              </p>
            </div>
            {isPlanoNovo && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ backgroundColor: "rgba(var(--cp-rgb),0.18)", color: "var(--cp-400)" }}>
                Novo
              </span>
            )}
          </div>

          <div className="relative flex gap-1 mb-4">
            {weekStrip.map((d) => (
              <span
                key={d.iso}
                className="flex-1 h-0.5 rounded-full"
                style={{ backgroundColor: d.hasTreino ? "var(--cp-500)" : d.isToday ? "rgba(var(--cp-rgb),0.4)" : "var(--border-subtle)" }}
              />
            ))}
          </div>

          {todaysSession ? (
            <button
              type="button"
              onClick={handleStartTraining}
              className="relative w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--cp-gradient)" }}
            >
              Iniciar treino
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : plano ? (
            <button
              type="button"
              onClick={() => navigate(`${base}/treinos`)}
              className="relative w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold text-white"
              style={{ background: "var(--cp-gradient)" }}
            >
              Ver treinos da semana
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <EmptyState>
              Você ainda não tem um treino ativo. Assim que seu treinador publicar, ele aparecerá aqui.
            </EmptyState>
          )}
        </section>

        {/* ── Dieta do dia ── */}
        <section className="rounded-2xl border overflow-hidden relative p-4" style={{ backgroundColor: "var(--dash-card-bg)", borderColor: "var(--dash-card-border)", boxShadow: "var(--dash-card-shadow)" }}>
          <div className="relative flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.12)" }}>
              <Utensils className="w-[18px] h-[18px]" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">
                {dieta ? (dieta.type === "structured" ? dieta.data.title : dieta.data.nome_arquivo) : "Dieta do dia"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {dieta?.type === "structured" && (dietaMealCount != null || dieta.data.calories != null)
                  ? [
                      dietaMealCount != null ? `${dietaMealCount} refeições` : null,
                      dieta.data.calories != null ? `${dieta.data.calories} kcal` : null,
                    ].filter(Boolean).join(" · ")
                  : dieta?.type === "pdf" ? "Arquivo PDF" : "Aguardando dieta"}
              </p>
            </div>
            {isDietaNova && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ backgroundColor: "rgba(var(--cp-rgb),0.18)", color: "var(--cp-400)" }}>
                Novo
              </span>
            )}
          </div>
          {dieta ? (
            <button
              type="button"
              onClick={handleViewDiet}
              className="relative w-full h-11 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              style={{ border: "1.5px solid var(--cp-500)", color: "var(--cp-400)", backgroundColor: "rgba(var(--cp-rgb),0.06)" }}
            >
              {dieta.type === "pdf" ? <Download className="w-4 h-4" /> : <Utensils className="w-4 h-4" />}
              {dieta.type === "structured" ? "Ver dieta" : "Acessar plano alimentar"}
            </button>
          ) : (
            <EmptyState>
              Sua dieta ainda não foi cadastrada. Fale com seu treinador para receber seu plano.
            </EmptyState>
          )}
        </section>

        {/* ── Água ── */}
        <section className="rounded-2xl border overflow-hidden relative p-4" style={{ backgroundColor: "var(--dash-card-bg)", borderColor: "var(--dash-card-border)", boxShadow: "var(--dash-card-shadow)" }}>
          <div className="relative flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.12)" }}>
              <Droplet className="w-[18px] h-[18px]" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Água</p>
              <p className="text-xs text-muted-foreground">
                {(aguaMl / 1000).toFixed(1)}L de {(aguaMetaMl / 1000).toFixed(1)}L
              </p>
            </div>
          </div>
          <div className="relative h-1.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (aguaMl / aguaMetaMl) * 100)}%`, background: "var(--cp-gradient)" }}
            />
          </div>
          <div className="relative grid grid-cols-3 gap-2 mb-2">
            {[250, 500, 1000].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => handleAddAgua(amount)}
                disabled={aguaSaving}
                className="h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-60 transition-opacity"
                style={{ background: "var(--cp-gradient)", color: "#fff" }}
              >
                <Plus className="w-3.5 h-3.5" />
                {amount >= 1000 ? "1L" : `${amount}ml`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate(`${base}/dieta/agua`)}
            className="relative flex items-center gap-1 text-xs font-medium"
            style={{ color: "var(--cp-400)" }}
          >
            Ver mais
            <ChevronRight className="w-3 h-3" />
          </button>
        </section>

        {/* ── Cardio ── */}
        <section className="rounded-2xl border overflow-hidden relative p-4" style={{ backgroundColor: "var(--dash-card-bg)", borderColor: "var(--dash-card-border)", boxShadow: "var(--dash-card-shadow)" }}>
          <div className="relative flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.12)" }}>
              <HeartPulse className="w-[18px] h-[18px]" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Cardio</p>
              <p className="text-xs text-muted-foreground truncate">
                {cardioLast
                  ? `Última sessão: ${cardioLast.tipo} · ${cardioLast.duracao_minutos} min`
                  : "Nenhuma sessão registrada ainda"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`${base}/cardio`)}
            className="relative w-full h-11 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            style={{ border: "1.5px solid var(--cp-500)", color: "var(--cp-400)", backgroundColor: "rgba(var(--cp-rgb),0.06)" }}
          >
            <HeartPulse className="w-4 h-4" />
            Registrar cardio
          </button>
        </section>

        {/* ── Evolução ── */}
        <section className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "var(--dash-card-bg)", borderColor: "var(--dash-card-border)", boxShadow: "var(--dash-card-shadow)" }}>
          <button
            type="button"
            onClick={() => navigate(`${base}/evolucao`)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-white/6 text-left hover:bg-white/3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.12)" }}>
                <Activity className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Evolução</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Últimos 30 dias</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pesoStats?.atual != null && (
                <div className="text-right">
                  <p className="text-base font-bold" style={{ color: "var(--cp-400)" }}>{pesoStats.atual} kg</p>
                  {pesoStats.variacao != null && (
                    <p className="text-[11px] font-semibold" style={{ color: "var(--cp-400)" }}>
                      {pesoStats.variacao > 0 ? "+" : ""}{pesoStats.variacao.toFixed(1)} kg
                    </p>
                  )}
                </div>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50" />
            </div>
          </button>
          <div className="p-4">
            {pesoStats && pesoStats.registros > 0 ? (
              <div className="space-y-3">
                <div className="flex -mx-4 -mt-4">
                  <div className="flex-1 text-center py-2 px-2 border-r" style={{ borderColor: "var(--dash-card-border)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Inicial</p>
                    <p className="text-sm font-semibold text-foreground mt-1">
                      {pesoStats.inicial != null ? `${pesoStats.inicial} kg` : "—"}
                    </p>
                  </div>
                  <div className="flex-1 text-center py-2 px-2 border-r" style={{ borderColor: "var(--dash-card-border)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Variação</p>
                    <p className="text-sm font-semibold mt-1" style={{ color: "var(--cp-400)" }}>
                      {pesoStats.variacao != null ? `${pesoStats.variacao > 0 ? "+" : ""}${pesoStats.variacao.toFixed(1)} kg` : "—"}
                    </p>
                  </div>
                  <div className="flex-1 text-center py-2 px-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Registros</p>
                    <p className="text-sm font-semibold text-foreground mt-1">{pesoStats.registros}</p>
                  </div>
                </div>
                {pesoStats.chart.length >= 2 && (
                  <div style={{ height: 64 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={pesoStats.chart} margin={{ top: 14, right: 4, left: 4, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pesoAreaFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--cp-500)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--cp-500)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="peso"
                          stroke="var(--cp-500)"
                          strokeWidth={2}
                          fill="url(#pesoAreaFill)"
                          dot={renderPesoDot}
                          activeDot={renderPesoDot}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState>
                Registre seu peso na aba Evolução para acompanhar seu progresso aqui.
              </EmptyState>
            )}
          </div>
        </section>

        {/* ── Atualizações e check-in (banner compacto) ── */}
        <button
          type="button"
          onClick={() => navigate(`${base}/atualizacao`)}
          className="w-full rounded-2xl border px-4 py-3 flex items-center gap-3 text-left transition-colors hover:opacity-90"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", borderColor: "rgba(var(--cp-rgb),0.22)" }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.15)" }}>
            <FileText className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Atualização e check-in</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {proximaAtualizacao
                ? `Próxima: ${(() => { const [y, m, d] = proximaAtualizacao.split("-").map(Number); return format(new Date(y, m - 1, d), "dd/MM/yyyy"); })()}`
                : "Envie medidas, fotos e observações"}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
        </button>
      </div>
    </div>
  );
};

export default StudentDashboard;
