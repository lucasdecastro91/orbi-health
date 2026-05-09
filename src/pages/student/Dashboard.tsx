import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  Dumbbell,
  FileText,
  Home,
  MessageSquare,
  ScanLine,
  Utensils,
} from "lucide-react";
import { format } from "date-fns";

interface Plano {
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

interface DashboardCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  isNew?: boolean | null;
  children: React.ReactNode;
}

const DashboardCard = ({ title, description, icon: Icon, isNew, children }: DashboardCardProps) => (
  <section className="rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "var(--surface-1)" }}>
    <div className="px-4 py-3 border-b border-white/6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.12)" }}>
          <Icon className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
            {isNew && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-primary-foreground" style={{ backgroundColor: "hsl(0 70% 55%)" }}>
                Novo
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </div>
    <div className="p-4">
      {children}
    </div>
  </section>
);

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-white/8 px-4 py-6 text-center">
    <AlertCircle className="w-7 h-7 text-muted-foreground opacity-40 mx-auto mb-2" />
    <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "var(--surface-2)" }}>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
    <p className="text-sm font-medium text-foreground leading-snug">{value}</p>
  </div>
);

const StudentDashboard = () => {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [dieta, setDieta] = useState<DietaStatus | null>(null);
  const [proximaAtualizacao, setProximaAtualizacao] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<Feedback | null>(null);
  const [avaliacaoPendente,  setAvaliacaoPendente]  = useState(false);
  const [anamnese_pendente,  setAnamnese_pendente]  = useState(false);
  const [anamneseDismissed,  setAnamneseDismissed]  = useState(false); // só nessa sessão
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("tipo_usuario")
        .eq("id", session.user.id)
        .single();

      if (profile?.tipo_usuario !== "aluno") {
        navigate("/treinador");
        return;
      }

      const { data: aluno } = await supabase
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
      // Usa a coluna na tabela alunos (que o coach consegue atualizar sem bloqueio de RLS)
      setAnamnese_pendente(!!aluno.anamnese_pendente);

      const { data: planoData } = await supabase
        .from("planos_treino")
        .select("nome_plano, objetivo, data_inicio, data_fim, atualizado_em, visto_pelo_aluno_em")
        .eq("aluno_id", aluno.id)
        .eq("ativo", true)
        .maybeSingle();

      setPlano(planoData);

      const { data: activeDiet, error: activeDietError } = await supabase
        .from("diets")
        .select("id, title, calories, created_at")
        .eq("student_id", session.user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeDietError) throw activeDietError;

      if (activeDiet) {
        setDieta({ type: "structured", data: activeDiet as DietaAtiva });
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

  const isPlanoNovo = plano && (!plano.visto_pelo_aluno_em || new Date(plano.atualizado_em) > new Date(plano.visto_pelo_aluno_em));
  const isDietaNova =
    dieta?.type === "pdf" &&
    (!dieta.data.vista_pelo_aluno_em || new Date(dieta.data.atualizada_em) > new Date(dieta.data.vista_pelo_aluno_em));
  const hasFeedbackNovo = lastFeedback && !lastFeedback.visto_pelo_aluno;
  const base = `/${slug}/aluno`;

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
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "var(--cp-gradient)" }}>
            <Home className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Início</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Treino, dieta e atualizações em um só lugar</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { label: "Treino", icon: Dumbbell, path: `${base}/treinos`, active: !!plano },
            { label: "Dieta", icon: Utensils, path: `${base}/dieta`, active: !!dieta },
            { label: "Check-in", icon: ClipboardList, path: `${base}/check-in`, active: true },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => navigate(item.path)}
              className="rounded-2xl border border-white/8 px-3 py-3 text-left transition-colors hover:bg-white/5"
              style={{ backgroundColor: item.active ? "rgba(var(--cp-rgb),0.08)" : "var(--surface-1)" }}
            >
              <item.icon
                className={`w-4 h-4 mb-2 ${!item.active && "text-muted-foreground opacity-60"}`}
                style={item.active ? { color: "var(--cp-400)" } : undefined}
              />
              <span className="block text-[11px] font-medium text-muted-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-3">

        {/* ── Card de anamnese pendente ── */}
        {anamnese_pendente && !anamneseDismissed && (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.07)", borderColor: "rgba(var(--cp-rgb),0.3)" }}
          >
            {/* Faixa de destaque no topo */}
            <div
              className="h-1 w-full"
              style={{ background: "var(--cp-gradient)" }}
            />
            <div className="px-4 pt-4 pb-4 space-y-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(var(--cp-rgb),0.15)" }}
                >
                  <ClipboardCheck className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-bold text-foreground leading-snug">
                    Anamnese pendente
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Seu treinador solicitou o preenchimento da sua ficha de saúde. Leva poucos minutos e é essencial para personalizar seu treino.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`${base}/anamnese`)}
                  className="flex-1 h-11 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "var(--cp-gradient)", color: "#000" }}
                >
                  Preencher agora
                </button>
                <button
                  type="button"
                  onClick={() => setAnamneseDismissed(true)}
                  className="h-11 px-4 rounded-xl text-sm font-medium transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
                >
                  Lembrar depois
                </button>
              </div>
            </div>
          </div>
        )}

        <DashboardCard
          title="Meu treino atual"
          description={plano ? "Plano ativo da consultoria" : "Aguardando plano"}
          icon={Dumbbell}
          isNew={isPlanoNovo}
        >
          {plano ? (
            <div className="space-y-3">
              <InfoRow label="Plano" value={plano.nome_plano} />
              {plano.objetivo && <InfoRow label="Objetivo" value={plano.objetivo} />}
              <InfoRow
                label="Período"
                value={`${formatDate(plano.data_inicio)}${plano.data_fim ? ` até ${formatDate(plano.data_fim)}` : ""}`}
              />
              <Button
                onClick={() => navigate(`${base}/treinos`)}
                className="w-full h-12 rounded-2xl text-primary-foreground text-sm font-semibold"
                style={{ background: "var(--cp-gradient)" }}
              >
                Ver treino
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ) : (
            <EmptyState>
              Você ainda não tem um treino ativo. Assim que seu treinador publicar, ele aparecerá aqui.
            </EmptyState>
          )}
        </DashboardCard>

        <DashboardCard
          title="Minha dieta"
          description={dieta ? "Plano alimentar disponível" : "Aguardando dieta"}
          icon={Utensils}
          isNew={isDietaNova}
        >
          {dieta ? (
            <div className="space-y-3">
              <InfoRow
                label={dieta.type === "structured" ? "Dieta ativa" : "Arquivo"}
                value={dieta.type === "structured" ? dieta.data.title : dieta.data.nome_arquivo}
              />
              {dieta.type === "structured" && dieta.data.calories && (
                <InfoRow label="Meta diária" value={`${dieta.data.calories} kcal`} />
              )}
              <Button
                onClick={handleViewDiet}
                className="w-full h-12 rounded-2xl text-primary-foreground text-sm font-semibold"
                style={{ background: "var(--cp-gradient)" }}
              >
                {dieta.type === "pdf" ? <Download className="w-4 h-4 mr-2" /> : <Utensils className="w-4 h-4 mr-2" />}
                {dieta.type === "structured" ? "Ver dieta" : "Acessar plano alimentar"}
              </Button>
            </div>
          ) : (
            <EmptyState>
              Sua dieta ainda não foi cadastrada. Fale com seu treinador para receber seu plano.
            </EmptyState>
          )}
        </DashboardCard>

        <DashboardCard
          title="Atualizações e check-in"
          description="Envie medidas, fotos e observações"
          icon={FileText}
        >
          <div className="space-y-3">
            {proximaAtualizacao && (
              <div className="rounded-2xl border px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", borderColor: "rgba(var(--cp-rgb),0.22)" }}>
                <CalendarDays className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--cp-300)" }}>
                  Próxima atualização: {format(new Date(proximaAtualizacao), "dd/MM/yyyy")}
                </p>
              </div>
            )}
            <Button
              onClick={() => navigate(`${base}/atualizacao`)}
              className="w-full h-12 rounded-2xl text-primary-foreground text-sm font-semibold"
              style={{ background: "var(--cp-gradient)" }}
            >
              <ChevronRight className="w-4 h-4 mr-2" />
              Responder Atualização
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Último feedback"
          description="Orientações e mensagens do treinador"
          icon={MessageSquare}
          isNew={hasFeedbackNovo}
        >
          {lastFeedback ? (
            <div className="space-y-3">
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: "var(--surface-2)" }}>
                <p className="text-[11px] text-muted-foreground mb-1">{format(new Date(lastFeedback.created_at), "dd/MM/yyyy")}</p>
                <p className="text-sm font-semibold text-foreground mb-2">{lastFeedback.titulo || "Sem título"}</p>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{lastFeedback.mensagem}</p>
              </div>
              <Button
                onClick={() => navigate(`${base}/feedbacks`)}
                variant="ghost"
                className="w-full h-11 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5"
              >
                Ver todos os feedbacks
              </Button>
            </div>
          ) : (
            <EmptyState>
              Seu treinador ainda não enviou feedback por aqui.
            </EmptyState>
          )}
        </DashboardCard>

        {avaliacaoPendente && (
          <button
            type="button"
            onClick={() => navigate(`${base}/avaliacao-postural`)}
            className="w-full rounded-2xl border px-4 py-4 flex items-center gap-3 text-left transition-colors hover:opacity-90"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.07)", borderColor: "rgba(var(--cp-rgb),0.25)" }}
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

        <div className="rounded-2xl border border-white/8 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "var(--surface-1)" }}>
          <CheckCircle2 className="w-4 h-4 text-muted-foreground opacity-50 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Complete seus treinos e check-ins para manter seu acompanhamento sempre em dia.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
