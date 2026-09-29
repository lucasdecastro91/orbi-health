import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Dumbbell, Utensils, HeartPulse, LogOut,
  X, Timer as TimerIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { getActiveTimer, clearTimer, type ActiveTimer } from "@/lib/activeTimer";
import PlanExpiredBanner, { isPlanExpiredBannerVisible } from "@/components/student/PlanExpiredBanner";

const fmtMMSS = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// Altura + margem da cápsula de navegação flutuante — usados pra posicionar o
// menu sheet e a barra de timer ativo logo acima dela, e pra dar respiro
// suficiente no fundo do conteúdo (padding-bottom do <main>).
const NAV_MARGIN = 16;
const NAV_HEIGHT = 60;
// Mesma duração/curva em TUDO que anima na nav (pill de fundo, padding do
// botão, largura do label) — durações descombinadas entre esses elementos
// era o que fazia a transição parecer travada (um "chegava" antes do outro).
const NAV_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
// 2026-09-28: 260ms ficou rápido/seco demais depois do FLIP (sem travar, mas
// sem "naturalidade"). Movimento mais lento + mola no destaque (passa um
// pouco do ponto e volta, como no iOS). Ícones vizinhos usam a curva sem
// mola — mola em todos os itens ao mesmo tempo fica "gelatinoso".
const NAV_MS = 500;
const NAV_SPRING = "cubic-bezier(0.34, 1.32, 0.64, 1)";
// 2026-09-28: SEM transição de padding/max-width/margin (propriedades de
// layout). Animá-las fazia o navegador recalcular a posição de todos os itens
// a cada quadro — somado à tela nova renderizando ao mesmo tempo, travava no
// iPhone. Agora o layout muda na hora e o MOVIMENTO é feito só com transform
// (técnica FLIP, ver useLayoutEffect da nav), que roda na GPU.
const NAV_TRANSITION = `background-color ${NAV_MS}ms ${NAV_EASE}, color ${NAV_MS}ms ${NAV_EASE}`;
// Label: só opacidade (fade) — a largura muda na hora, sem animar.
const NAV_LABEL_TRANSITION = `opacity 300ms ${NAV_EASE} 90ms, transform 380ms ${NAV_SPRING} 90ms`;
// Respiro entre o fim do conteúdo e a barra = 12px, o mesmo espaço entre os
// cards (space-y-3). As telas NÃO adicionam folga própria no fim — a regra
// mora só aqui (2026-09-28). Exceção: telas com botão fixo no rodapé
// (Avaliação Postural nas fases de fotos/revisão) mantêm a folga delas.
const NAV_CLEARANCE = `calc(${NAV_MARGIN + NAV_HEIGHT + 12}px + env(safe-area-inset-bottom, 0px))`;

const StudentLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug, org } = useTenantContext();
  const { hasDiet, hasTraining } = usePlanFeatures();
  const base = `/${slug}/aluno`;
  const isLightTheme = org?.theme === "light";

  const [studentUserId,    setStudentUserId]    = useState<string | null>(null);
  const [activeTimer,      setActiveTimer]      = useState<ActiveTimer | null>(null);
  const [nowTick,          setNowTick]          = useState(Date.now());
  const [dataExpiracaoPlano, setDataExpiracaoPlano] = useState<string | null>(null);

  // Reseta o scroll ao trocar de tela — sem isso a posição rolada da tela
  // anterior "vazava" pra tela nova (o scroll é da janela inteira, React
  // Router não reseta sozinho). Ficava mais visível em telas curtas
  // (Alterar Senha, Sono): abriam já perto do fim, com o topo cortado.
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

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

    // First-login redirect: if student has no anamnese (and not dispensed), redirect to fill it
    if (!location.pathname.includes("/anamnese")) {
      const { data: alunoData } = await supabase
        .from("alunos")
        .select("id, anamnese_dispensada, data_expiracao_plano")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setDataExpiracaoPlano(alunoData?.data_expiracao_plano ?? null);

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
  };

  // ── Navegação ─────────────────────────────────────────────────

  /** Itens que ficam na barra inferior — filtrados pelo plano da org */
  const primaryItems = [
    { path: base,              label: "Início",  icon: Home     },
    ...(hasTraining ? [{ path: `${base}/treinos`, label: "Treinos", icon: Dumbbell }] : []),
    { path: `${base}/cardio`,  label: "Cardio",  icon: HeartPulse },
    ...(hasDiet     ? [{ path: `${base}/dieta`,   label: "Dieta",   icon: Utensils }] : []),
  ] as { path: string; label: string; icon: React.ElementType }[];

  const navHalf = Math.ceil(primaryItems.length / 2);
  const navLeftItems = primaryItems.slice(0, navHalf);
  const navRightItems = primaryItems.slice(navHalf);

  const isActive = (path: string) =>
    path === base
      ? location.pathname === base
      : location.pathname.startsWith(path);

  // Aba "pendente": o destaque vai pro botão tocado NA HORA, e a navegação
  // (que monta a tela nova — trabalho pesado) só dispara depois que a
  // animação já começou a ser desenhada. Assim a renderização da página não
  // disputa os primeiros quadros com a animação.
  const [pendingNavKey, setPendingNavKey] = useState<string | null>(null);
  useEffect(() => { setPendingNavKey(null); }, [location.pathname]);
  const goNav = (key: string, path: string) => {
    setPendingNavKey(key);
    requestAnimationFrame(() => requestAnimationFrame(() => navigate(path)));
  };

  // ── Nav: pill de destaque única, que desliza de um botão pro outro ──
  // Só um item fica "selecionado" por vez. O símbolo ORBI navega pra uma
  // página de verdade (/mais, OrbiHub.tsx) — fica "ativo" tanto nela quanto
  // nas telas que só têm entrada por ela (Feedbacks/Agenda/Calculadora de Sono, ver
  // OrbiHub.tsx), já que hoje não têm atalho próprio em nenhum outro canto.
  // Avaliação Postural NÃO entra aqui de propósito — não faz parte do hub.
  const ORBI_NAV_KEY = "__orbi__";
  const orbiHubPaths = [`${base}/mais`, `${base}/feedbacks`, `${base}/agenda`, `${base}/sono`];
  const orbiHubActive = orbiHubPaths.some((p) => isActive(p));
  const routeNavKey = orbiHubActive ? ORBI_NAV_KEY : (primaryItems.find((i) => isActive(i.path))?.path ?? null);
  const activeNavKey = pendingNavKey ?? routeNavKey;

  const navRowRef = useRef<HTMLDivElement | null>(null);
  const activeNavKeyRef = useRef<string | null>(null);
  activeNavKeyRef.current = activeNavKey;
  const navButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [navHighlight, setNavHighlight] = useState<{ left: number; width: number; visible: boolean }>({ left: 0, width: 0, visible: false });

  // FLIP (2026-09-28): quando a aba ativa muda, o layout novo é aplicado na
  // hora (sem animar tamanho). Aqui, antes do navegador pintar, cada botão
  // recebe um translateX que o "devolve" pra posição antiga e em seguida
  // anima até a nova só com transform — o movimento roda na GPU e não trava
  // mesmo com a tela nova renderizando. A pill anima transform + width, mas é
  // absoluta: mudar a largura dela não empurra nenhum outro item.
  const prevNavRectsRef = useRef<Record<string, { left: number; width: number }>>({});
  useLayoutEffect(() => {
    const row = navRowRef.current;
    if (!row) return;
    const entries = Object.entries(navButtonRefs.current).filter(
      (e): e is [string, HTMLButtonElement] => !!e[1],
    );

    // Posições reais (sem nenhum transform de uma animação anterior)
    for (const [, el] of entries) { el.style.transition = "none"; el.style.transform = ""; }
    const rowLeft = row.getBoundingClientRect().left;
    const next: Record<string, { left: number; width: number }> = {};
    for (const [k, el] of entries) {
      const r = el.getBoundingClientRect();
      next[k] = { left: r.left - rowLeft, width: r.width };
    }

    // Inverte: cada botão começa visualmente onde estava
    const prev = prevNavRectsRef.current;
    let moved = false;
    for (const [k, el] of entries) {
      const dx = prev[k] ? prev[k].left - next[k].left : 0;
      if (Math.abs(dx) > 0.5) { el.style.transform = `translateX(${dx}px)`; moved = true; }
    }
    if (moved) {
      void row.offsetWidth; // força o navegador a registrar a posição invertida
      for (const [, el] of entries) {
        el.style.transition = `transform ${NAV_MS}ms ${NAV_EASE}`;
        el.style.transform = "";
      }
    }
    prevNavRectsRef.current = next;

    const target = activeNavKey ? next[activeNavKey] : null;
    setNavHighlight(target
      ? { left: target.left, width: target.width, visible: true }
      : (h) => ({ ...h, visible: false }));
  }, [activeNavKey, org?.name, primaryItems.length]);

  // Tela girou/redimensionou: remede sem animar
  useEffect(() => {
    const row = navRowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => {
      const rowLeft = row.getBoundingClientRect().left;
      const next: Record<string, { left: number; width: number }> = {};
      for (const [k, el] of Object.entries(navButtonRefs.current)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next[k] = { left: r.left - rowLeft, width: r.width };
      }
      prevNavRectsRef.current = next;
      const key = activeNavKeyRef.current;
      if (key && next[key]) setNavHighlight({ left: next[key].left, width: next[key].width, visible: true });
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

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
        {/* Sem header nesta tela — avatar/saudação do aluno (bloco de cor no
            Dashboard) e o pill ORBI da nav assumem esse papel. O respiro da
            status bar/notch fica por conta de cada tela (o Dashboard estende
            seu bloco colorido por baixo dela; as demais só ganham o padding). */}

        {/* Main Content */}
        {/* --safe-top: altura da faixa de status (hora/bateria) que o
            bloco colorido do topo de cada tela pode "invadir" com margem
            negativa, pra cor ir até o topo (igual Prime). Zero quando o
            banner de plano vencido ocupa o topo — aí o verde não sobe por
            cima dele. Fora do app nativo (desktop/Safari) o env() já é 0. */}
        <main
          style={{
            "--safe-top": isPlanExpiredBannerVisible(dataExpiracaoPlano) ? "0px" : "env(safe-area-inset-top, 0px)",
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: showTimerBar
              ? `calc(${NAV_CLEARANCE} + 56px)`
              : NAV_CLEARANCE,
          } as React.CSSProperties}
        >
          <PlanExpiredBanner dataExpiracaoPlano={dataExpiracaoPlano} />
          <Outlet />
        </main>
      </div>

      {/* O símbolo ORBI da nav agora navega pra uma página de verdade
          (/mais, OrbiHub.tsx) — o bottom sheet foi removido daqui. */}

      {/* ── Barra fixa: timer ativo (descanso/cardio) ────────────── */}
      {showTimerBar && (
        <div
          className="fixed z-40 flex items-center gap-3 px-4"
          style={{
            bottom: NAV_CLEARANCE,
            left: "max(0px, calc(50vw - 195px))",
            width: "min(100vw, 390px)",
            height: 56,
            backgroundColor: "rgba(12,12,14,0.98)",
            borderRadius: 18,
            border: "1px solid rgba(var(--cp-rgb),0.25)",
            marginLeft: 16,
            marginRight: 16,
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

      {/* ── Bottom Navigation: cápsula flutuante estilo Instagram ──── */}
      <nav
        className="fixed z-50"
        style={{
          bottom: `calc(${NAV_MARGIN}px + env(safe-area-inset-bottom, 0px))`,
          left: "max(16px, calc(50vw - 195px + 16px))",
          width: "min(calc(100vw - 32px), 358px)",
          height: NAV_HEIGHT,
          borderRadius: 9999,
          backgroundColor: isLightTheme ? "rgba(255,255,255,0.42)" : "rgba(18,18,20,0.64)",
          // Borda mais visível no claro — sem ela, translúcido branco sobre
          // conteúdo já claro (a maior parte da zona neutra) não lê como
          // "flutuante", vira só uma barra meio apagada. A borda define o
          // contorno da cápsula mesmo quando o blur não tem muito o que
          // revelar atrás (física do efeito: só aparece de verdade sobre
          // algo com cor/contraste, tipo o topo verde).
          border: isLightTheme ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(255,255,255,0.08)",
          backdropFilter: isLightTheme ? "blur(10px)" : "blur(18px)",
          WebkitBackdropFilter: isLightTheme ? "blur(10px)" : "blur(18px)",
          boxShadow: isLightTheme ? "0 10px 30px rgba(0,0,0,0.14)" : "0 10px 30px rgba(0,0,0,0.28)",
          // fixed + backdrop-filter some/pisca durante o scroll no WKWebView
          // (bug conhecido do WebKit no iOS) — força uma camada de composição
          // própria pro elemento, resolve sem afetar a aparência.
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
          willChange: "transform",
        }}
      >
        {/* px 5px = mesma folga que o destaque tem em cima/embaixo
            ((58 internos - 48 do destaque) / 2), pra ele ficar com margem
            igual em todos os lados quando o 1º/último item está ativo.
            justify-between na barra INTEIRA (2026-09-28): os 4 espaços entre
            os 5 itens ficam sempre iguais — quando um item expande, a folga
            é dividida entre todos (padrão do app do BB). Antes eram duas
            metades fixas com o ORBI travado no centro: expandir um item de
            um lado só apertava aquele lado, e o espaçamento ficava torto. */}
        <div ref={navRowRef} className="relative flex items-center justify-between h-full px-[5px]">
          {/* Pill de destaque única — desliza/cresce até o botão ativo em
              vez de cada botão ter seu próprio fundo independente. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: navHighlight.width,
              height: 48, // quase a altura da barra (60), igual BB/Instagram/Prime (2026-09-28)
              transform: `translateY(-50%) translateX(${navHighlight.left}px)`,
              borderRadius: 9999,
              backgroundColor: "rgba(var(--cp-rgb), 0.20)",
              opacity: navHighlight.visible ? 1 : 0,
              transition: `transform ${NAV_MS}ms ${NAV_SPRING}, width ${NAV_MS}ms ${NAV_SPRING}, opacity ${Math.round(NAV_MS * 0.7)}ms ${NAV_EASE}`,
              pointerEvents: "none",
            }}
          />

          {/* Itens da esquerda */}
            {navLeftItems.map((item) => {
              const active = activeNavKey === item.path;
              return (
                <button
                  key={item.path}
                  ref={(el) => { navButtonRefs.current[item.path] = el; }}
                  onClick={() => goNav(item.path, item.path)}
                  className="relative flex items-center"
                  style={{
                    padding: active ? "8px 16px" : "9px",
                    borderRadius: 9999,
                    color: active
                      ? "var(--cp-600)"
                      : (isLightTheme ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.50)"),
                    transition: NAV_TRANSITION,
                  }}
                >
                  <item.icon className={`w-[22px] h-[22px] shrink-0 ${active ? "nav-pop" : ""}`} strokeWidth={active ? 2.3 : 1.8} style={{ transition: `stroke-width ${NAV_MS}ms ${NAV_EASE}` }} />
                  <span
                    className="text-[12px] font-semibold whitespace-nowrap overflow-hidden inline-block"
                    style={{
                      maxWidth: active ? 120 : 0,
                      marginLeft: active ? 6 : 0,
                      opacity: active ? 1 : 0,
                      transform: active ? "translateX(0)" : "translateX(-6px)",
                      transition: NAV_LABEL_TRANSITION,
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}

          {/* Símbolo ORBI — centro da nav, navega pra página própria (/mais).
              Expande e mostra o nome da org quando ativo, igual aos demais
              itens (mesmo padrão do "Meu BB" do Banco do Brasil) — só ele
              fica expandido por vez, a pill acima que desliza até ele. */}
          <button
            ref={(el) => { navButtonRefs.current[ORBI_NAV_KEY] = el; }}
            onClick={() => goNav(ORBI_NAV_KEY, `${base}/mais`)}
            className="relative shrink-0 flex items-center justify-center"
            style={{
              padding: activeNavKey === ORBI_NAV_KEY ? "9px 18px" : "9px",
              borderRadius: 9999,
              color: activeNavKey === ORBI_NAV_KEY
                ? "var(--cp-600)"
                : (isLightTheme ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.50)"),
              transition: NAV_TRANSITION,
            }}
            aria-label="Menu"
          >
            {/* SVG embutido (não <img>) — precisa de currentColor pra
                acompanhar a cor do botão como os demais ícones da nav; o
                arquivo /logos/orbi-logo-icon.svg tem a cor fixa (#16a34a)
                embutida e nunca mudaria de cor sozinho. */}
            <svg
              viewBox="0 0 64 64"
              fill="none"
              className={`shrink-0 ${activeNavKey === ORBI_NAV_KEY ? "nav-pop" : ""}`}
              style={{ width: 28, height: 28, transition: `color ${NAV_MS}ms ${NAV_EASE}` }}
            >
              <path d="M 50.8 25.2 A 20 20 0 1 1 38.8 13.2" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
              <circle cx="46.1" cy="17.9" r="4.5" fill="currentColor" />
              <circle cx="32" cy="32" r="2" fill="currentColor" />
            </svg>
            <span
              className="text-[12px] font-semibold whitespace-nowrap overflow-hidden inline-block"
              style={{
                maxWidth: activeNavKey === ORBI_NAV_KEY ? 120 : 0,
                marginLeft: activeNavKey === ORBI_NAV_KEY ? 6 : 0,
                opacity: activeNavKey === ORBI_NAV_KEY ? 1 : 0,
                transform: activeNavKey === ORBI_NAV_KEY ? "translateX(0)" : "translateX(-6px)",
                transition: NAV_LABEL_TRANSITION,
              }}
            >
              {org?.name || "ORBI"}
            </span>
          </button>

          {/* Itens da direita */}
            {navRightItems.map((item) => {
              const active = activeNavKey === item.path;
              return (
                <button
                  key={item.path}
                  ref={(el) => { navButtonRefs.current[item.path] = el; }}
                  onClick={() => goNav(item.path, item.path)}
                  className="relative flex items-center"
                  style={{
                    padding: active ? "8px 16px" : "9px",
                    borderRadius: 9999,
                    color: active
                      ? "var(--cp-600)"
                      : (isLightTheme ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.50)"),
                    transition: NAV_TRANSITION,
                  }}
                >
                  <item.icon className={`w-[22px] h-[22px] shrink-0 ${active ? "nav-pop" : ""}`} strokeWidth={active ? 2.3 : 1.8} style={{ transition: `stroke-width ${NAV_MS}ms ${NAV_EASE}` }} />
                  <span
                    className="text-[12px] font-semibold whitespace-nowrap overflow-hidden inline-block"
                    style={{
                      maxWidth: active ? 120 : 0,
                      marginLeft: active ? 6 : 0,
                      opacity: active ? 1 : 0,
                      transform: active ? "translateX(0)" : "translateX(-6px)",
                      transition: NAV_LABEL_TRANSITION,
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
        </div>
      </nav>
    </div>
  );
};

export default StudentLayout;
