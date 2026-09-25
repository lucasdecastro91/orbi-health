import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import NotificationBell from "@/components/NotificationBell";
import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Droplet,
  Dumbbell,
  FileText,
  HeartPulse,
  LogOut,
  MessageSquare,
  Plus,
  ScanLine,
  User,
  Utensils,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { getCurrentWeek, pickTodaysSession, type TodaysSession, type WeekLite } from "@/lib/trainingSchedule";
import { AGUA_META_ML } from "@/lib/agua";
import { grantXP } from "@/lib/xp";
import { evaluateAndUpdateStreak } from "@/lib/streaks";
import { computeCycleAdherence, type CycleAdherence } from "@/lib/cycleAdherence";

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

interface DietMacros {
  kcal: number;
  carb: number;
  prot: number;
  gord: number;
}

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-white/8 px-4 py-6 text-center">
    <AlertCircle className="w-7 h-7 text-muted-foreground opacity-40 mx-auto mb-2" />
    <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
  </div>
);

// Segunda a domingo — mesma ordem usada no mockup
const WEEK_STRIP_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Mesmas cores da distribuição de macros do painel do treinador
// (DietManager.tsx ~1510) — não é cor primária, é a identidade fixa de
// cada macronutriente, igual nos dois lados (treinador/aluno).
const MACRO_COLORS = { carb: "#fb923c", prot: "#f87171", gord: "#60a5fa" };

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [totalXp, setTotalXp] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [todaysSession, setTodaysSession] = useState<TodaysSession | null>(null);
  const [pesoStats, setPesoStats] = useState<PesoStats | null>(null);
  const [aguaMl, setAguaMl] = useState(0);
  const [aguaMetaMl, setAguaMetaMl] = useState(AGUA_META_ML);
  const [aguaSaving, setAguaSaving] = useState(false);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [dietaMealCount, setDietaMealCount] = useState<number | null>(null);
  const [dietaMacros, setDietaMacros] = useState<DietMacros | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [cardioDoneToday, setCardioDoneToday] = useState(false);
  const [dietaRefeicoesFeitasHoje, setDietaRefeicoesFeitasHoje] = useState(0);
  const [cycleAdherence, setCycleAdherence] = useState<CycleAdherence | null>(null);
  const [selectedChip, setSelectedChip] = useState<"treino" | "dieta" | "cardio" | "agua" | null>(null);
  // Tamanho do anel medido de verdade a partir da altura renderizada dos 4
  // chips (ResizeObserver) — testado duas vezes com CSS Grid puro (aspect-
  // ratio+stretch, depois row-span-2 com altura explícita) e as duas vezes
  // o anel voltou a ficar maior que os chips de um jeito inconsistente:
  // grid faz o auto-sizing de LINHA considerando a altura que o próprio
  // anel PEDE (via row-span-2), então definir a altura do anel a partir
  // da altura medida dos chips e ainda deixar os dois na mesma grade cria
  // margem pra grid "esticar" a linha de volta — sutil, difícil de prever
  // pela spec, já rendeu 2 bugs de alinhamento diferentes.
  //
  // Troquei a linha inteira (anel + chips) de CSS Grid pra Flexbox: o anel
  // é um item `shrink-0` com largura/altura explícitas (não participa de
  // nenhum cálculo de tamanho de linha/coluna), e o bloco de chips é
  // `flex-1` (pega o espaço que sobra, do lado do anel, sem reservar 1/3
  // fixo) — como cada item flex em `items-start` é dimensionado sozinho,
  // não tem como o tamanho de um influenciar o do outro. Isso também fecha
  // o vão horizontal de graça, sem precisar de margem negativa calculada
  // à parte (o `colShift`/`gridRef` de antes não existem mais).
  const chipsBlockRef = useRef<HTMLDivElement>(null);
  const [ringSize, setRingSize] = useState<number | null>(null);
  useLayoutEffect(() => {
    const chipsEl = chipsBlockRef.current;
    if (!chipsEl) return;
    // Teto de 40% da largura da linha: rede de segurança contra o loop
    // anel↔chips (anel maior → chips mais estreitos → mais altos → anel
    // maior). A largura da linha não depende do anel, então o teto é estável.
    const rowEl = chipsEl.parentElement;
    const measure = () => {
      const cap = rowEl ? rowEl.clientWidth * 0.4 : Infinity;
      setRingSize(Math.min(chipsEl.offsetHeight, cap));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(chipsEl);
    if (rowEl) ro.observe(rowEl);
    return () => ro.disconnect();
  }, []);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId, org } = useTenantContext();
  const { hasAvaliacaoPostural, hasDiet } = usePlanFeatures();
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
        .select("tipo_usuario, nome, avatar_url")
        .eq("id", session.user.id)
        .single();

      if (profile?.tipo_usuario !== "aluno") {
        navigate("/treinador");
        return;
      }
      if (profile?.nome) setUserName(profile.nome);
      setAvatarUrl(profile?.avatar_url ?? null);

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

      // Hoisted (não fica só dentro do if) — reaproveitado depois pra calcular
      // a frequência semanal de treino do ciclo de aderência.
      let weeksForAdherence: WeekLite[] = [];

      if (planoData) {
        const { data: semanasLite } = await supabase
          .from("semanas")
          .select("id, semana_inicio, semana_fim, treinos ( id, titulo_treino, dia_semana )")
          .eq("plano_id", planoData.id)
          .order("semana_inicio", { ascending: true });

        if (semanasLite && semanasLite.length > 0) {
          const weeks = semanasLite as unknown as WeekLite[];
          weeksForAdherence = weeks;
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

      // Capturados localmente (não como state) porque são usados ainda
      // dentro desta função, no cálculo de aderência — setState não fica
      // disponível de volta na mesma execução (é assíncrono/em lote).
      let totalMealsForAdherence = 0;
      let metaAguaForAdherence = AGUA_META_ML;

      if (activeDiet) {
        setDieta({ type: "structured", data: activeDiet as DietaAtiva });
        if ((activeDiet as any).meta_agua_ml != null) {
          setAguaMetaMl((activeDiet as any).meta_agua_ml);
          metaAguaForAdherence = (activeDiet as any).meta_agua_ml;
        }

        const { data: mealsWithFoods, count: mealCount } = await supabase
          .from("diet_meals")
          .select(
            "id, diet_meal_foods ( quantidade, parent_food_id, lista_subst_grupo_id, alimentos ( porcao_gramas, kcal, proteina_g, carb_g, gordura_g ) )",
            { count: "exact" },
          )
          .eq("diet_id", activeDiet.id);
        setDietaMealCount(mealCount ?? null);
        totalMealsForAdherence = mealCount ?? 0;

        // Soma só os alimentos principais de cada refeição (sem substitutos nem
        // referências de lista, que não têm macro próprio) — mesma regra usada
        // em DietManager.tsx (totalMacros/mealMacros) pro painel do treinador.
        if (mealsWithFoods) {
          const totals = (mealsWithFoods as any[]).reduce(
            (acc, meal) => {
              const foods = (meal.diet_meal_foods ?? []) as any[];
              for (const f of foods) {
                if (f.parent_food_id || f.lista_subst_grupo_id !== null) continue;
                const alimento = f.alimentos;
                if (!alimento?.porcao_gramas) continue;
                const r = (parseFloat(f.quantidade) || 0) / alimento.porcao_gramas;
                acc.kcal += (alimento.kcal ?? 0) * r;
                acc.carb += (alimento.carb_g ?? 0) * r;
                acc.prot += (alimento.proteina_g ?? 0) * r;
                acc.gord += (alimento.gordura_g ?? 0) * r;
              }
              return acc;
            },
            { kcal: 0, carb: 0, prot: 0, gord: 0 },
          );
          setDietaMacros({
            kcal: Math.round(totals.kcal),
            carb: Math.round(totals.carb * 10) / 10,
            prot: Math.round(totals.prot * 10) / 10,
            gord: Math.round(totals.gord * 10) / 10,
          });
        }
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

      const { count: msgCount } = await supabase
        .from("mensagens")
        .select("id", { count: "exact", head: true })
        .eq("destinatario_id", session.user.id)
        .eq("lida", false);
      setUnreadCount(msgCount ?? 0);

      // Status de "hoje" pra cada chip do bloco colorido — separado do
      // percentual do ciclo (que é sobre o período todo, não só hoje).
      const [{ count: cardioTodayCount }, { data: mealTodayLogs }] = await Promise.all([
        supabase
          .from("cardio_sessoes")
          .select("id", { count: "exact", head: true })
          .eq("student_id", session.user.id)
          .eq("data_sessao", todayStr),
        supabase
          .from("meal_completions")
          .select("id")
          .eq("student_id", session.user.id)
          .eq("date", todayStr),
      ]);
      setCardioDoneToday((cardioTodayCount ?? 0) > 0);
      setDietaRefeicoesFeitasHoje((mealTodayLogs ?? []).length);

      // Aderência no ciclo atual — só calcula se já existe pelo menos um
      // treino ativo (pra ter frequência semanal) ou dieta (pra ter total de
      // refeições); os dois entram como 0 se não existirem, o que já é
      // tratado dentro de computeCycleAdherence.
      const treinoWeeklyFreq = getCurrentWeek(weeksForAdherence, planoData?.data_inicio ?? null)?.treinos.length ?? 0;
      const adherence = await computeCycleAdherence({
        studentId: session.user.id,
        alunoId: aluno.id,
        treinoWeeklyFreq,
        dietaTotalMeals: totalMealsForAdherence,
        aguaMetaMl: metaAguaForAdherence,
      });
      setCycleAdherence(adherence);
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
      navigate(`${base}/treinos?weekId=${todaysSession.weekId}&treinoId=${todaysSession.treinoId}&autostart=1`);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(slug ? `/entrar/${slug}` : "/auth");
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

  // ── Anel do bloco colorido — geometria do SVG (o dado exibido agora é
  //     aderência do ciclo, calculada em ringDisplayPct mais abaixo) ──
  const RING_R = 34;
  const RING_CIRC = 2 * Math.PI * RING_R;

  const macroChartData = dietaMacros
    ? [
        { name: "Carboidratos", value: Math.round(dietaMacros.carb * 4), color: MACRO_COLORS.carb },
        { name: "Proteína", value: Math.round(dietaMacros.prot * 4), color: MACRO_COLORS.prot },
        { name: "Gorduras", value: Math.round(dietaMacros.gord * 9), color: MACRO_COLORS.gord },
      ].filter((d) => d.value > 0)
    : [];

  // ── Dados do bloco colorido (chips + anel de aderência) ──────────
  const CHIP_LABELS = { agua: "Água", dieta: "Dieta", treino: "Treino", cardio: "Cardio" } as const;
  const CHIP_UNIT = { agua: "dias", dieta: "dias", treino: "treinos", cardio: "sessões" } as const;

  const todayStrForChips = brazilToday();
  const aguaDoneToday = aguaMl > 0 && aguaMl >= aguaMetaMl;
  const dietaDoneToday = (dietaMealCount ?? 0) > 0 && dietaRefeicoesFeitasHoje >= (dietaMealCount ?? 0);
  const treinoDoneToday = completedDates.has(todayStrForChips);

  const CHIP_DEFS = [
    { id: "agua" as const, icon: Droplet, doneToday: aguaDoneToday, todayText: aguaMl === 0 ? "—" : `${(aguaMl / 1000).toFixed(1)}L` },
    { id: "dieta" as const, icon: Utensils, doneToday: dietaDoneToday, todayText: dietaMealCount ? `${dietaRefeicoesFeitasHoje}/${dietaMealCount}` : "—" },
    { id: "treino" as const, icon: Dumbbell, doneToday: treinoDoneToday, todayText: "—" },
    { id: "cardio" as const, icon: HeartPulse, doneToday: cardioDoneToday, todayText: "—" },
  ];

  const ringDisplayPct = cycleAdherence ? (selectedChip ? cycleAdherence[selectedChip].pct : cycleAdherence.overall) : 0;

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

      {/* ══════════════════════════════════════════════════════════════
          Bloco de cor cheio no topo — identidade + progresso agregado
          do aluno. Nunca conteúdo específico de "treino de hoje" aqui
          (fica na zona neutra abaixo, nivelado com os outros cards).
         ══════════════════════════════════════════════════════════════ */}
      <div
        className="relative px-4 pt-4 pb-8"
        style={{
          // Degradê vertical (não o --cp-gradient diagonal usado em botões):
          // mais claro perto da costura com a zona neutra embaixo, ficando
          // mais consistente/escuro subindo — mesmo efeito observado no azul
          // da Prime perto da transição pro preto, evita um bloco de cor
          // "chapado" uniforme.
          background: "linear-gradient(to top, var(--cp-400) 0%, var(--cp-600) 45%, var(--cp-600) 100%)",
          color: "var(--cp-text)",
          // Sombra na mesma cor por baixo do bloco — mesma regra de "alto
          // relevo, não clarear" já usada nos cards elevados (CARD_BG/
          // CARD_SHADOW). Sem isso o bloco verde só "corta" reto pro preto
          // da zona neutra, sem nenhuma pista de profundidade — parece
          // colado, não flutuando por cima. A zona neutra (marginTop: -24)
          // desenha por cima dessa sombra, então ela só aparece vazando
          // logo acima da costura arredondada.
          boxShadow: "0 24px 40px -12px rgba(var(--cp-rgb), 0.5)",
        }}
      >
        {/* Ícones de notificação/mensagem nesta faixa são sempre brancos,
            porque o fundo é sempre a cor primária cheia — independe de tema. */}
        <div
          style={{
            "--notif-bell-color": "rgba(255,255,255,0.85)",
            "--notif-bell-color-open": "rgba(255,255,255,1)",
            "--notif-bell-hover-bg": "rgba(255,255,255,0.15)",
          } as React.CSSProperties}
        >
          {/* Linha 1: avatar + saudação (esquerda) · notificações (direita) */}
          <div className="flex items-center justify-between mb-5">
            <div className="relative flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setAvatarMenuOpen((v) => !v)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-opacity hover:opacity-90 overflow-hidden"
                style={{ backgroundColor: "rgba(255,255,255,0.20)", color: "#fff" }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : org?.icon_url ? (
                  // Sem foto do aluno: cai pro ícone da org (mesmo padrão da
                  // Prime) em vez de inicial. O filtro força branco sólido
                  // (funciona com qualquer cor original do ícone) — sem
                  // isso, um ícone da mesma cor primária do fundo (caso
                  // comum quando a org ainda usa o ícone padrão da ORBI)
                  // ficava quase invisível, sem contraste nenhum.
                  <img
                    src={org.icon_url}
                    alt=""
                    className="w-6 h-6 object-contain"
                    style={{ filter: "brightness(0) invert(1)" }}
                  />
                ) : (
                  avatarInitial
                )}
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium opacity-80 leading-none">Olá,</p>
                <p className="text-lg font-bold truncate leading-tight">{firstName}!</p>
              </div>

              {/* ── Dropdown de conta — só lançador rápido (Perfil / Sair).
                  Alterar senha e Notificações NÃO ficam aqui — já vivem
                  dentro da própria página de Perfil (seção Conta), e tê-las
                  nos dois lugares só duplicava a navegação sem necessidade. ── */}
              {avatarMenuOpen && (
                <>
                  <div
                    onClick={() => setAvatarMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  />
                  <div
                    className="absolute left-0 top-full mt-2 w-56 rounded-2xl overflow-hidden z-50 bg-card border border-border"
                    style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.35)" }}
                  >
                    {[
                      { label: "Perfil", icon: User, path: `${base}/perfil` },
                    ].map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => { setAvatarMenuOpen(false); navigate(item.path); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-card-foreground hover:bg-foreground/5 transition-colors text-left"
                      >
                        <item.icon className="w-4 h-4 opacity-60 shrink-0" />
                        {item.label}
                      </button>
                    ))}
                    <div className="h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => { setAvatarMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-foreground/5 transition-colors text-left"
                      style={{ color: "rgb(248,113,113)" }}
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Sair da conta
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Sino de notificações — voltou a aparecer aqui (as vars
                  --notif-bell-* logo acima já esperavam por ele, mas o
                  componente tinha ficado de fora durante o redesign). */}
              <NotificationBell role="student" badgeColor="rgba(255,255,255,0.28)" badgeTextColor="#fff" />
              <button
                type="button"
                onClick={() => navigate(`${base}/mensagens`)}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
              >
                <MessageSquare className="w-5 h-5" style={{ color: "rgba(255,255,255,0.9)" }} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.28)", color: "#fff" }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {/* XP — antes era um card na fileira de badges embaixo, junto
                  com "Seq." (removido: o clique nele já leva pro Ranking,
                  que mostra sequência atual/recorde + bônus, então o card
                  de Seq. separado só duplicava a mesma informação). Subiu
                  pra cá, perto da saudação — mesma posição de referência
                  usada pela Prime. */}
              <button
                type="button"
                onClick={() => navigate(`${base}/ranking`)}
                className="h-7 px-3 rounded-full flex items-center gap-1.5 transition-colors hover:bg-white/10"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-bold">{totalXp} XP</span>
              </button>
            </div>
          </div>

          {/* Linha 2: Flexbox (não mais CSS Grid — ver comentário grande
              perto de `chipsBlockRef` lá em cima com o histórico completo
              do porquê). O anel é item `shrink-0` com tamanho explícito
              (medido dos chips via JS), os chips ficam num bloco `flex-1`
              ao lado — cada um dimensionado independente, sem nenhuma
              chance de um influenciar o tamanho do outro. */}
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setSelectedChip(null)}
              className="relative shrink-0 transition-opacity hover:opacity-90"
              style={{ width: ringSize ?? undefined, height: ringSize ?? undefined }}
              aria-label="Ver aderência geral do ciclo"
            >
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                {/* Traço mais grosso que o original (7→8) — o anel ficou
                    fisicamente menor (medido pela altura dos 4 chips agora),
                    então engrossar o traço dá mais peso visual sem crescer
                    nada em altura. Chegou a ir pra 9, mas ficou grosso
                    demais — 8 é o meio-termo. */}
                <circle cx="40" cy="40" r={RING_R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={8} />
                <circle
                  cx="40" cy="40" r={RING_R} fill="none"
                  stroke="#fff" strokeWidth={8} strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC * (1 - ringDisplayPct / 100)}
                  style={{ transition: "stroke-dashoffset 500ms ease" }}
                />
              </svg>
              {/* Texto interno em tamanho proporcional ao anel (não mais
                  text-3xl/text-[9px] fixos) — senão, com o anel agora
                  menor (medido pela altura dos chips), o texto ficava
                  grande demais e espremido dentro do círculo. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-extrabold leading-none" style={{ fontSize: ringSize ? ringSize * 0.3 : 30 }}>
                  {cycleAdherence ? `${ringDisplayPct}%` : "—"}
                </span>
                <span
                  className="font-medium uppercase tracking-wider opacity-75 mt-1 text-center px-1 leading-tight"
                  style={{ fontSize: ringSize ? Math.max(ringSize * 0.095, 8) : 9 }}
                >
                  {selectedChip ? CHIP_LABELS[selectedChip] : "Geral"}
                </span>
              </div>
            </button>

            {/* ref no wrapper inteiro (chips + respiro) — dessa vez de
                propósito: o respiro agora SEMPRE mostra uma frase (nunca
                fica vazio, ver abaixo), então faz sentido reservar altura
                pra ele sempre e o anel cobrir esse espaço — decisão do
                Lucas (2026-09-25): deixa o anel maior, que é o que ele
                queria desde o começo, sem reintroduzir o vão vazio "à toa"
                que motivou tirar a min-height antes (agora não é mais "à
                toa", tem conteúdo sempre). */}
            <div ref={chipsBlockRef} className="flex-1 min-w-0">
              <div className="grid grid-cols-2 gap-2">
                {CHIP_DEFS.map((chip) => {
                  const active = selectedChip === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setSelectedChip((c) => (c === chip.id ? null : chip.id))}
                      className="flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-left transition-colors"
                      style={{
                        border: active ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.16)",
                        backgroundColor: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <chip.icon className="w-4 h-4 shrink-0 opacity-90" />
                      <span className="text-[11px] font-medium flex-1 min-w-0 truncate">{CHIP_LABELS[chip.id]}</span>
                      {chip.doneToday
                        ? <Check className="w-3.5 h-3.5 shrink-0" />
                        : <span className="text-[11px] font-bold shrink-0">{chip.todayText}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Respiro/detalhe — SEMPRE mostra uma frase agora (chip
                  selecionado: "X de Y no período"; "Geral": período do
                  ciclo), nunca fica vazio — é o que justifica reservar
                  altura pra ele (min-h) e o anel cobrir esse espaço. */}
              {/* Frase SEMPRE numa linha só (truncate): a altura deste bloco
                  define o tamanho do anel, e o anel ocupa largura — se a
                  frase quebrasse linha, o bloco crescia, o anel crescia,
                  espremia os chips, a frase quebrava mais... (loop que
                  estourou o layout em 2026-09-25). */}
              <div className="flex items-center mt-2 min-h-[16px] min-w-0">
                {selectedChip && cycleAdherence ? (
                  <p className="text-[11px] opacity-80 truncate">
                    {cycleAdherence[selectedChip].completed} de {Math.round(cycleAdherence[selectedChip].expected)} {CHIP_UNIT[selectedChip]} no período
                    {selectedChip === "dieta" && dietaMealCount
                      ? ` · ${dietaRefeicoesFeitasHoje}/${dietaMealCount} refeições hoje`
                      : ""}
                  </p>
                ) : cycleAdherence ? (
                  <p className="text-[11px] opacity-80 truncate">
                    {(() => {
                      const [y, m, d] = cycleAdherence.cycleStart.split("-").map(Number);
                      return `Ciclo desde ${format(new Date(y, m - 1, d), "dd/MM")}`;
                    })()}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Zona neutra (branca/preta conforme tema) — sobe por cima do
          bloco colorido (margin-top negativo + cantos arredondados no
          topo), dando a impressão de um card sobreposto — mesmo efeito
          do branco "por cima" do azul no app do BB e do preto "por cima"
          do azul na Prime, em vez de um corte reto na divisão.
         ══════════════════════════════════════════════════════════════ */}
      <div
        className="relative px-4 pt-6 pb-2 space-y-3 rounded-t-[28px]"
        style={{ marginTop: -24, backgroundColor: "hsl(var(--background))" }}
      >

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
              style={{
                background: "var(--cp-gradient)",
                // Teste de "profundidade" no botão (brilho no topo + sombra
                // por baixo), tipo o que a Prime usa nos botões dela — só
                // nesse botão por enquanto, pra ver se vale estender pros
                // outros. Alto relevo sem clarear o fundo (mesma regra do
                // resto do app, ver CLAUDE.md/feedback_alto_relevo).
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.25)",
              }}
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

        {/* ── Dieta do dia + macronutrientes — só orgs com plano que inclui dieta (Motion é só treino) ── */}
        {hasDiet && (
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

          {/* Donut de macronutrientes — mesma peça/cores do painel do treinador (DietManager.tsx) */}
          {macroChartData.length > 0 && dietaMacros && (
            <div className="relative flex items-center gap-4 mb-4 pb-4 border-b" style={{ borderColor: "var(--dash-card-border)" }}>
              <div className="w-[74px] h-[74px] shrink-0">
                <PieChart width={74} height={74}>
                  <Pie data={macroChartData} cx="50%" cy="50%" innerRadius={21} outerRadius={35} paddingAngle={2} dataKey="value">
                    {macroChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} kcal`, name]}
                    contentStyle={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-card-border)", borderRadius: 6, fontSize: 11 }}
                  />
                </PieChart>
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                {[
                  { label: "Carboidratos", color: MACRO_COLORS.carb, pct: dietaMacros.kcal > 0 ? Math.round((dietaMacros.carb * 4 / dietaMacros.kcal) * 100) : 0 },
                  { label: "Proteína", color: MACRO_COLORS.prot, pct: dietaMacros.kcal > 0 ? Math.round((dietaMacros.prot * 4 / dietaMacros.kcal) * 100) : 0 },
                  { label: "Gorduras", color: MACRO_COLORS.gord, pct: dietaMacros.kcal > 0 ? Math.round((dietaMacros.gord * 9 / dietaMacros.kcal) * 100) : 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-muted-foreground truncate">{item.label}</span>
                    <span className="text-[11px] text-foreground ml-auto font-semibold shrink-0">{item.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        )}

        {/* ── Água — sempre visível, independe de ter dieta (é hábito geral,
            não recurso da dieta; ficou preso ao hasDiet por engano e sumia
            pra planos só-treino) ── */}
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
          <div className="relative h-1.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.08)" }}>
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

        {/* ── Evolução — acesso compacto (1 linha), mesmo padrão do banner
            de Atualização logo abaixo. Único jeito de chegar na tela de
            peso/medidas desde que o anel do bloco colorido virou aderência
            do ciclo (deixou de levar pra cá). Peso/variação em destaque
            (grande, negrito, verde) — igual à referência do Lucas, não
            texto discreto como na 1ª tentativa. */}
        <button
          type="button"
          onClick={() => navigate(`${base}/evolucao`)}
          className="w-full rounded-2xl border px-4 py-3 flex items-center gap-3 text-left transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--dash-card-bg)", borderColor: "var(--dash-card-border)" }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(var(--cp-rgb),0.15)" }}>
            <Activity className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Evolução</p>
            <p className="text-xs text-muted-foreground mt-0.5">Últimos 30 dias</p>
          </div>
          {pesoStats?.atual != null && (
            <div className="text-right shrink-0">
              <p className="text-base font-bold" style={{ color: "var(--cp-400)" }}>{pesoStats.atual}kg</p>
              {pesoStats.variacao != null && (
                <p className="text-xs font-semibold" style={{ color: "var(--cp-400)" }}>
                  {pesoStats.variacao > 0 ? "+" : ""}{pesoStats.variacao.toFixed(1)}kg
                </p>
              )}
            </div>
          )}
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
        </button>

        {/* ── Atualizações e check-in — sempre aqui agora (voltou pra zona
            neutra, saiu do bloco colorido). Sem data marcada: chamada pra
            ação padrão. Com data marcada: mostra "Enviar até DD/MM" e muda
            de cor quando atrasado — mesma lógica que era do badge verde. ── */}
        {(() => {
          let corBorda = "rgba(var(--cp-rgb),0.22)";
          let corFundo = "rgba(var(--cp-rgb),0.08)";
          let corIcone = "var(--cp-400)";
          let subtitulo = "Envie medidas, fotos e observações";

          if (proximaAtualizacao) {
            const [y, m, d] = proximaAtualizacao.split("-").map(Number);
            const alvo = new Date(y, m - 1, d);
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const atrasado = alvo.getTime() < hoje.getTime();
            const dataFmt = format(alvo, "dd/MM");
            corBorda = atrasado ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.35)";
            corFundo = atrasado ? "rgba(239,68,68,0.10)" : "rgba(245,158,11,0.10)";
            corIcone = atrasado ? "#f87171" : "#fbbf24";
            subtitulo = `Enviar até ${dataFmt}`;
          }

          return (
            <button
              type="button"
              onClick={() => navigate(`${base}/atualizacao`)}
              className="w-full rounded-2xl border px-4 py-3 flex items-center gap-3 text-left transition-colors hover:opacity-90"
              style={{ backgroundColor: corFundo, borderColor: corBorda }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: corFundo }}>
                <FileText className="w-4 h-4" style={{ color: corIcone }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Atualização e check-in</p>
                <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: corIcone }} />
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export default StudentDashboard;
