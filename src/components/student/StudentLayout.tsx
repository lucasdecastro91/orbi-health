import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Dumbbell, Utensils, HeartPulse,
  MessageSquare, MessageCircle, Calendar, User, LogOut,
  MoreHorizontal, X, ScanLine, Timer as TimerIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import NotificationBell from "@/components/NotificationBell";
import { getActiveTimer, clearTimer, type ActiveTimer } from "@/lib/activeTimer";

const fmtMMSS = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const StudentLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug, org, isGetShapeOrg } = useTenantContext();
  const { hasDiet, hasTraining, hasAvaliacaoPostural } = usePlanFeatures();
  const base = `/${slug}/aluno`;

  const [userName,         setUserName]         = useState("");
  const [unreadCount,      setUnreadCount]      = useState(0);
  const [menuOpen,         setMenuOpen]         = useState(false);
  const [avaliacaoPendente, setAvaliacaoPendente] = useState(false);
  const [feedbackNovo,     setFeedbackNovo]     = useState(false);
  const [studentUserId,    setStudentUserId]    = useState<string | null>(null);
  const [activeTimer,      setActiveTimer]      = useState<ActiveTimer | null>(null);
  const [nowTick,          setNowTick]          = useState(Date.now());

  // Fecha o menu ao navegar via hardware back / location change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => { loadUser(); }, []);

  // Reage na hora a start/pause/resume/cancel do timer ativo (descanso/cardio) via Realtime —
  // assim a barra aparece/some em qualquer tela sem esperar um polling, mesmo que o timer
  // tenha sido iniciado em outra página. Assinatura única por sessão (não depende da rota).
  useEffect(() => {
    if (!studentUserId) return;

    const channel = supabase
      .channel(`student-active-timer-${studentUserId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "active_timers",
        filter: `student_id=eq.${studentUserId}`,
      }, (payload) => {
        setActiveTimer(payload.eventType === "DELETE" ? null : (payload.new as ActiveTimer));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentUserId]);

  // Reconsulta o timer ativo direto no banco a cada troca de tela — o Realtime cobre
  // atualizações instantâneas enquanto o aluno já está em algum lugar do app, mas logo
  // após iniciar um timer (ex: clicar "Iniciar" e trocar de tela na sequência) o evento
  // de INSERT pode não ter chegado ainda. Sem isso, a barra minimizada ficava esperando
  // um evento que às vezes demorava ou se perdia, e só aparecia depois de outra ação
  // (ex: pausar) gerar um novo evento.
  useEffect(() => {
    if (!studentUserId) return;
    void getActiveTimer(studentUserId).then(setActiveTimer);
  }, [studentUserId, location.pathname]);

  // Recalcula o tempo decorrido a partir de started_at (não de um contador local) —
  // assim, mesmo se o app ficar minimizado um tempo, o valor exibido volta certo.
  // O tick é alinhado ao segundo cheio do relógio (em vez de setInterval a partir do
  // instante de montagem) — assim esta barra e o cronômetro da tela de Cardio batem
  // no mesmo segundo, sem defasagem visual entre os dois.
  useEffect(() => {
    if (!activeTimer) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleTick = () => {
      timeoutId = setTimeout(() => {
        setNowTick(Date.now());
        scheduleTick();
      }, 1000 - (Date.now() % 1000));
    };
    scheduleTick();
    return () => clearTimeout(timeoutId);
  }, [activeTimer]);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setStudentUserId(session.user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", session.user.id)
      .single();
    if (profile) setUserName(profile.nome);

    // First-login redirect: if student has no anamnese (and not dispensed), redirect to fill it
    if (!location.pathname.includes("/anamnese")) {
      const { data: alunoData } = await supabase
        .from("alunos")
        .select("id, anamnese_dispensada, avaliacao_postural_pendente")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (alunoData?.avaliacao_postural_pendente) setAvaliacaoPendente(true);

      if (alunoData?.id) {
        const { count: feedbackCount } = await supabase
          .from("feedbacks_alunos")
          .select("id", { count: "exact", head: true })
          .eq("aluno_id", alunoData.id)
          .eq("visto_pelo_aluno", false);
        setFeedbackNovo((feedbackCount ?? 0) > 0);
      }

      if (!alunoData?.anamnese_dispensada) {
        const { data: existing } = await supabase
          .from("anamneses")
          .select("id")
          .eq("student_id", session.user.id)
          .maybeSingle();
        if (!existing) {
          navigate(`/${slug}/aluno/anamnese`);
          return;
        }
      }
    }

    loadUnread(session.user.id);

    const channel = supabase
      .channel(`student-unread-${session.user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "mensagens",
        filter: `destinatario_id=eq.${session.user.id}`,
      }, () => { loadUnread(session.user.id); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const loadUnread = async (userId: string) => {
    try {
      const { count } = await supabase
        .from("mensagens")
        .select("id", { count: "exact", head: true })
        .eq("destinatario_id", userId)
        .eq("lida", false);
      setUnreadCount(count ?? 0);
    } catch {}
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Volta para o login com branding do tenant preservado
    navigate(slug ? `/entrar/${slug}` : "/auth");
  };

  // ── Navegação ─────────────────────────────────────────────────

  /** Itens que ficam na barra inferior — filtrados pelo plano da org */
  const primaryItems = [
    { path: base,              label: "Início",  icon: Home     },
    ...(hasTraining ? [{ path: `${base}/treinos`, label: "Treinos", icon: Dumbbell }] : []),
    { path: `${base}/cardio`,  label: "Cardio",  icon: HeartPulse },
    ...(hasDiet     ? [{ path: `${base}/dieta`,   label: "Dieta",   icon: Utensils }] : []),
  ] as { path: string; label: string; icon: React.ElementType }[];

  /** Itens agrupados no Menu */
  const secondaryItems = [
    { path: `${base}/mensagens`,          label: "Mensagens",   icon: MessageSquare, badge: unreadCount },
    { path: `${base}/agenda`,             label: "Agenda",      icon: Calendar,      badge: 0 },
    ...(hasAvaliacaoPostural ? [{ path: `${base}/avaliacao-postural`, label: "Avaliação", icon: ScanLine, badge: avaliacaoPendente ? 1 : 0 }] : []),
    { path: `${base}/feedbacks`,          label: "Feedbacks",   icon: MessageCircle, badge: feedbackNovo ? 1 : 0 },
    { path: `${base}/perfil`,             label: "Perfil",      icon: User,          badge: 0 },
  ] as { path: string; label: string; icon: React.ElementType; badge: number }[];

  const isGetShape = isGetShapeOrg;

  const isActive = (path: string) =>
    path === base
      ? location.pathname === base
      : location.pathname.startsWith(path);

  const menuHasActive = secondaryItems.some((i) => isActive(i.path));

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  // ── Timer ativo (descanso/cardio) ────────────────────────────

  // Enquanto pausado, o "agora" pra fins de cálculo congela no instante da pausa —
  // sem isso, a barra continuava contando um timer que o aluno já tinha pausado.
  const effectiveNow = activeTimer?.paused_at ? new Date(activeTimer.paused_at).getTime() : nowTick;
  const elapsedSec = activeTimer
    ? Math.max(0, Math.floor((effectiveNow - new Date(activeTimer.started_at).getTime()) / 1000))
    : 0;
  const remainingSec = activeTimer ? Math.max(0, activeTimer.duracao_segundos - elapsedSec) : 0;
  const isOverdue = activeTimer ? elapsedSec >= activeTimer.duracao_segundos : false;
  const isPaused = !!activeTimer?.paused_at;

  const timerLabel = !activeTimer
    ? ""
    : activeTimer.tipo === "cardio"
      ? isPaused ? `Cardio pausado · ${fmtMMSS(elapsedSec)}` : `Cardio em andamento · ${fmtMMSS(elapsedSec)}`
      : isPaused
        ? `Descanso pausado · ${fmtMMSS(remainingSec)} restantes`
        : isOverdue
          ? "Descanso concluído — próxima série!"
          : `Descanso · ${fmtMMSS(remainingSec)} restantes`;

  const closeActiveTimer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!studentUserId) return;
    setActiveTimer(null);
    void clearTimer(studentUserId);
  };

  const continueActiveTimer = () => {
    if (!activeTimer) return;
    if (activeTimer.tipo === "descanso" && activeTimer.ref_id) {
      navigate(`${base}/exercicio/${activeTimer.ref_id}`);
    } else if (activeTimer.tipo === "cardio") {
      navigate(`${base}/cardio`);
    }
  };

  // A própria tela do timer (Cardio ou o detalhe do exercício em descanso) já mostra o
  // cronômetro ao vivo — a barra fixa só faz sentido como "versão minimizada" quando o
  // aluno está em outra tela, senão fica redundante com o que já está na tela.
  const isOnActiveTimerScreen = activeTimer
    ? activeTimer.tipo === "cardio"
      ? location.pathname === `${base}/cardio`
      : !!activeTimer.ref_id && location.pathname === `${base}/exercicio/${activeTimer.ref_id}`
    : false;
  const showTimerBar = !!activeTimer && !isOnActiveTimerScreen;

  // ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "hsl(var(--background))" }}>

      {/* ── Frame mobile 390px ─────────────────────────────────── */}
      <div
        className="relative mx-auto bg-zinc-950"
        style={{ maxWidth: 390, minHeight: "100vh" }}
      >
        {/* Header */}
        <header
          className="sticky top-0 z-10 backdrop-blur-sm"
          style={{
            // GetShape logo is light-on-dark → always keep header dark regardless of theme
            backgroundColor: isGetShape ? "rgba(9,9,11,0.96)" : "var(--header-bg)",
            borderBottom: "2px solid rgba(var(--cp-rgb),0.55)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-1">
            <div className="flex items-center gap-3">
              {isGetShape && !org?.logo_url ? (
                <img
                  src="/logo-gs.png"
                  alt="Get Shape Training"
                  className="h-[44px] w-auto object-contain"
                />
              ) : (
                <img
                  src={org?.logo_url ?? "/logos/orbi-logo-horizontal-dark.svg"}
                  alt={org?.name ?? "ORBI Health"}
                  className="h-[52px] object-contain"
                />
              )}
              {userName && (
                <p className="text-sm text-muted-foreground font-medium hidden xs:block">
                  Olá, <span className="text-foreground">{userName}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(`${base}/mensagens`)}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ color: "var(--notif-bell-color)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--notif-bell-color-open)";
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--notif-bell-hover-bg)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--notif-bell-color)";
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                }}
              >
                <MessageSquare className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none"
                    style={{ backgroundColor: "hsl(0 70% 55%)", color: "#fff" }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main style={{ paddingBottom: showTimerBar ? 136 : 80 }}>
          <Outlet />
        </main>
      </div>

      {/* ── Backdrop do menu ─────────────────────────────────────── */}
      <div
        onClick={() => setMenuOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          backgroundColor: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
      />

      {/* ── Menu Sheet (desliza acima da nav) ────────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 64, // altura da nav bar
          left: "max(0px, calc(50vw - 195px))",
          width: "min(100vw, 390px)",
          zIndex: 45,
          backgroundColor: "rgba(12,12,14,0.98)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px 20px 0 0",
          transform: menuOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle visual */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="rounded-full"
            style={{ width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.15)" }}
          />
        </div>

        <div className="px-4 pb-4 pt-2">
          {/* Grid 3 colunas — itens secundários */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            {secondaryItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className="flex flex-col items-center gap-2 rounded-2xl py-4 px-2 transition-colors relative"
                  style={{
                    backgroundColor: active
                      ? "rgba(var(--cp-rgb), 0.14)"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "var(--cp-500)" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {/* Badge de mensagens não lidas */}
                  <div className="relative">
                    <item.icon className="w-6 h-6" />
                    {item.badge > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] rounded-full text-[9px] font-bold flex items-center justify-center px-0.5"
                        style={{ backgroundColor: "hsl(0 70% 55%)", color: "#fff" }}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium leading-none">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sair — separado no fundo do sheet */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors mt-1"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "rgba(248,113,113,0.7)",
            }}
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sair da conta</span>
          </button>

          {/* Powered by ORBI — assinatura discreta */}
          <p
            className="text-center mt-3 select-none"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.13)", letterSpacing: "0.12em" }}
          >
            Tecnologia ORBI Health
          </p>
        </div>
      </div>

      {/* ── Barra fixa: timer ativo (descanso/cardio) ────────────── */}
      {showTimerBar && (
        <div
          className="fixed z-40 flex items-center gap-3 px-4"
          style={{
            bottom: 64,
            left: "max(0px, calc(50vw - 195px))",
            width: "min(100vw, 390px)",
            height: 56,
            backgroundColor: "rgba(12,12,14,0.98)",
            borderTop: "1px solid rgba(var(--cp-rgb),0.25)",
          }}
        >
          <button
            type="button"
            onClick={continueActiveTimer}
            className="flex-1 min-w-0 flex items-center gap-3 text-left"
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}
            >
              <TimerIcon className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
                {timerLabel}
              </p>
              <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                {activeTimer.titulo}
              </p>
            </div>
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
              style={{ background: "var(--cp-gradient)", color: "#fff" }}
            >
              Continuar
            </span>
          </button>
          <button
            type="button"
            onClick={closeActiveTimer}
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            aria-label="Encerrar timer"
          >
            <X className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.6)" }} />
          </button>
        </div>
      )}

      {/* ── Bottom Navigation ────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 z-50"
        style={{
          backgroundColor: "rgba(0,0,0,0.96)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          left: "max(0px, calc(50vw - 195px))",
          width: "min(100vw, 390px)",
        }}
      >
        <div
          className="flex items-stretch"
          style={{ height: 64 }}
        >
          {/* Itens primários */}
          {primaryItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-colors"
                style={{
                  color: active
                    ? "var(--cp-500)"
                    : "rgba(255,255,255,0.38)",
                }}
              >
                <item.icon
                  className="w-[22px] h-[22px]"
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className="text-[10px] font-semibold tracking-wide"
                  style={{ opacity: active ? 1 : 0.8 }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Botão Menu */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-colors"
            style={{
              color:
                menuOpen || menuHasActive
                  ? "var(--cp-500)"
                  : "rgba(255,255,255,0.38)",
            }}
          >
            {/* Alterna entre X e MoreHorizontal com animação suave */}
            <div
              style={{
                transition: "transform 250ms ease, opacity 200ms ease",
                transform: menuOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              {menuOpen
                ? <X className="w-[22px] h-[22px]" strokeWidth={2.2} />
                : <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={1.8} />
              }
            </div>
            <span
              className="text-[10px] font-semibold tracking-wide"
              style={{ opacity: menuOpen || menuHasActive ? 1 : 0.8 }}
            >
              Menu
            </span>
          </button>
        </div>

        {/* Safe area para dispositivos com home indicator (iOS) */}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </nav>
    </div>
  );
};

export default StudentLayout;
