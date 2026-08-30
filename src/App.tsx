import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { SplashScreen as NativeSplashScreen } from "@capacitor/splash-screen";
import { supabase } from "@/integrations/supabase/client";
import { TenantProvider } from "@/contexts/TenantContext";
import SplashScreen from "@/components/SplashScreen";

// Pages — auth & público
import Auth          from "./pages/Auth";
import Login         from "./pages/Login";
import Signup        from "./pages/Signup";
import Planos        from "./pages/Planos";
import PlanSelection from "./pages/PlanSelection";
import NotFound      from "./pages/NotFound";

// Pages — org index (redirect inteligente)
import OrgIndex from "./pages/OrgIndex";

// Layouts
import CoachLayout   from "./components/coach/CoachLayout";
import StudentLayout from "./components/student/StudentLayout";
import StudentAccessGate from "./components/student/StudentAccessGate";

// Coach pages
import CoachDashboard    from "./pages/coach/Dashboard";
import MeusClientes      from "./pages/coach/MeusClientes";
import StudentDetails    from "./pages/coach/StudentDetails";
import ExerciseLibrary   from "./pages/coach/ExerciseLibrary";
import TrainingTemplates from "./pages/coach/TrainingTemplates";
import ProdutosPlanos    from "./pages/coach/ProdutosPlanos";
import Settings          from "./pages/coach/Settings";
import CoachAlterarSenha    from "./pages/coach/AlterarSenha";
import RevisaoAlimentos    from "./pages/coach/RevisaoAlimentos";
import BancoAlimentos      from "./pages/coach/BancoAlimentos";
import Agenda              from "./pages/coach/Agenda";
import Mensagens              from "./pages/coach/Mensagens";
import NotificationsManager  from "./pages/coach/NotificationsManager";
import ListaSubstituicao      from "./pages/coach/ListaSubstituicao";
import FormBuilder            from "./pages/coach/FormBuilder";
import AtualizacoesCoach      from "./pages/coach/AtualizacoesCoach";
import Colaboradores          from "./pages/coach/Colaboradores";
import PlanoAtual             from "./pages/coach/PlanoAtual";
import CoachRanking           from "./pages/coach/Ranking";
import ConviteAccept          from "./pages/ConviteAccept";
import Pagamento              from "./pages/Pagamento";
import AnamneseBuilder        from "./pages/coach/AnamneseBuilder";
import PosturalEvalBuilder    from "./pages/coach/PosturalEvalBuilder";
import Leads                  from "./pages/coach/Leads";
import Financeiro             from "./pages/coach/Financeiro";

// Student pages
import StudentDashboard   from "./pages/student/Dashboard";
import Treinos            from "./pages/student/Treinos";
import TreinoHoje         from "./pages/student/TreinoHoje";
import Semanas            from "./pages/student/Semanas";
import SemanaDetail       from "./pages/student/SemanaDetail";
import ExerciseDetail     from "./pages/student/ExerciseDetail";
import Dieta              from "./pages/student/Dieta";
import Historico          from "./pages/student/Historico";
import TreinoHistory      from "./pages/student/TreinoHistory";
import StudentAlterarSenha from "./pages/student/AlterarSenha";
import CheckIn            from "./pages/student/CheckIn";
import Atualizacao        from "./pages/student/Atualizacao";
import Profile            from "./pages/student/Profile";
import Feedbacks          from "./pages/student/Feedbacks";
import Evolucao           from "./pages/student/Evolucao";
import AgendaAluno        from "./pages/student/AgendaAluno";
import MensagensAluno     from "./pages/student/MensagensAluno";
import Anamnese           from "./pages/student/Anamnese";
import DietHistory           from "./pages/student/DietHistory";
import Agua                  from "./pages/student/Agua";
import Ranking               from "./pages/student/Ranking";
import NotificationSettings  from "./pages/student/NotificationSettings";
import AvaliacaoPostural     from "./pages/student/AvaliacaoPostural";
import StudentCardio         from "./pages/student/Cardio";
import SleepCalculator       from "./pages/student/SleepCalculator";

const queryClient = new QueryClient();

// ----------------------------------------------------------------
// OrgWrapper: envolve todas as rotas /:slug/* com TenantProvider.
// O TenantProvider lê o :slug via useParams() e carrega a org,
// aplicando tema e cor primária automaticamente.
// ----------------------------------------------------------------
const OrgWrapper = () => (
  <TenantProvider>
    <Outlet />
  </TenantProvider>
);

// ----------------------------------------------------------------
// Utilitário: troca favicon da aba (usado antes do TenantContext montar)
// ----------------------------------------------------------------
function applyFavicon(href: string, type = "image/x-icon") {
  document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']")
    .forEach((el) => el.parentNode?.removeChild(el));
  const link = document.createElement("link");
  link.rel  = "icon";
  link.type = type;
  link.href = `${href}?v=${Date.now()}`;
  document.head.appendChild(link);
}

// ----------------------------------------------------------------
// App
// ----------------------------------------------------------------
const GET_SHAPE_EMAIL = "lucas.melo1991@gmail.com";

const App = () => {
  const [isLoading,      setIsLoading]      = useState(true);
  const [isGetShapeUser, setIsGetShapeUser] = useState(false);
  const [splashIconUrl,  setSplashIconUrl]  = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const startTime = Date.now();
      const minDisplay = 1000;
      try {
        // Extrai o slug da org de qualquer rota:
        //   /getshape/treinador  → pathParts[0] = "getshape"
        //   /entrar/getshape     → pathParts[0] = "entrar", pathParts[1] = "getshape"
        const pathParts      = window.location.pathname.split("/").filter(Boolean);
        const firstSegment   = pathParts[0] ?? "";
        const loginOrgSlug   = firstSegment === "entrar" ? (pathParts[1] ?? "") : "";
        // slug efetivo da org (ignora segmentos como "entrar", "cadastro" etc.)
        const knownPublicPaths = ["", "auth", "entrar", "cadastro", "planos", "assinar", "auth-legacy", "pagar"];
        const pathSlug = loginOrgSlug || (knownPublicPaths.includes(firstSegment) ? "" : firstSegment);

        // ── Camada 1: cache no localStorage (evita decidir de novo QUAL org é) ──
        // Importante: o cache só decide "é a Get Shape?" — o icon_url em si é
        // SEMPRE revalidado contra o banco logo abaixo. Antes, o icon_url também
        // vinha do cache e nunca era atualizado depois da primeira vez, então
        // trocar o ícone em Configurações nunca aparecia na splash screen até
        // alguém limpar o localStorage manualmente (bug recorrente).
        const storedGsSlug = localStorage.getItem("gs_org_slug");
        const storedOrgId  = localStorage.getItem("gs_org_id");
        if (storedGsSlug && storedGsSlug === pathSlug) {
          localStorage.setItem("gs_brand", "1");
          setIsGetShapeUser(true);
          document.title = "Get Shape";
          applyFavicon("/favicon-gs.png", "image/png");
          if (storedOrgId) {
            const { data: freshOrg } = await supabase
              .from("organizations")
              .select("icon_url")
              .eq("id", storedOrgId)
              .maybeSingle();
            const freshIconUrl = freshOrg?.icon_url ?? null;
            localStorage.setItem("gs_icon_url", freshIconUrl ?? "");
            setSplashIconUrl(freshIconUrl);
          } else {
            setSplashIconUrl(localStorage.getItem("gs_icon_url") || null);
          }
          return;
        }

        // ── Camada 2: e-mail do owner na sessão ───────────────────────────
        // Só aplica a marca GS se a URL não aponta pra uma org específica
        // diferente (pathSlug vazio = rota genérica) — senão o próprio Lucas
        // logado como si mesmo, visitando outra org (ex: testando a Orbi
        // Demo), herdava o emblema/título da Get Shape na splash antes de
        // corrigir (achado 2026-08-24, mesma causa raiz do flash de cor
        // em CoachLayout.tsx).
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email === GET_SHAPE_EMAIL) {
          const { data: freshOrg } = await supabase
            .from("organizations")
            .select("id, slug, icon_url")
            .eq("owner_id", session.user.id)
            .eq("is_gs_brand", true)
            .maybeSingle();
          if (freshOrg && (!pathSlug || freshOrg.slug === pathSlug)) {
            localStorage.setItem("gs_brand", "1");
            setIsGetShapeUser(true);
            document.title = "Get Shape";
            applyFavicon("/favicon-gs.png", "image/png");
            localStorage.setItem("gs_org_id",   freshOrg.id);
            localStorage.setItem("gs_org_slug", freshOrg.slug);
            localStorage.setItem("gs_icon_url", freshOrg.icon_url ?? "");
            setSplashIconUrl(freshOrg.icon_url ?? null);
            return;
          }
          // pathSlug aponta pra outra org — segue pra Camada 3, que decide
          // com base na org real sendo visitada, não no e-mail da sessão.
        }

        // ── Camada 3: primeiro acesso em dispositivo novo ─────────────────
        // Consulta o banco pela flag is_gs_brand.
        if (pathSlug && !knownPublicPaths.includes(pathSlug)) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("id, slug, is_gs_brand, icon_url")
            .eq("slug", pathSlug)
            .eq("active", true)
            .maybeSingle();

          if (orgData?.is_gs_brand) {
            const iconUrl = (orgData as { icon_url?: string | null }).icon_url ?? null;
            localStorage.setItem("gs_org_id",   orgData.id);
            localStorage.setItem("gs_org_slug", orgData.slug);
            localStorage.setItem("gs_brand",    "1");
            localStorage.setItem("gs_icon_url", iconUrl ?? "");
            setIsGetShapeUser(true);
            setSplashIconUrl(iconUrl);
            document.title = "Get Shape";
            applyFavicon("/favicon-gs.png", "image/png");
          } else if (orgData) {
            // Org não-GS: armazena icon_url para o splash
            setSplashIconUrl((orgData as { icon_url?: string | null }).icon_url ?? null);
          }
        }
      } finally {
        if (Capacitor.isNativePlatform()) {
          // No app nativo, a splash nativa (capacitor.config.ts,
          // launchAutoHide: false) já cobre esse momento inteiro — sem
          // delay artificial aqui, só esconde ela assim que terminar.
          // O componente <SplashScreen> web nem chega a renderizar (ver
          // abaixo), então não existe "segunda tela" pra evitar de propósito.
          setIsLoading(false);
          NativeSplashScreen.hide().catch(() => {});
        } else {
          const elapsed   = Date.now() - startTime;
          const remaining = Math.max(0, minDisplay - elapsed);
          setTimeout(() => setIsLoading(false), remaining);
        }
      }
    };
    checkSession();
  }, []);

  if (isLoading) {
    // Nativo: a splash nativa (ainda visível, launchAutoHide: false) já
    // cobre isso — renderizar a versão web aqui só criaria uma segunda
    // tela por baixo dela.
    if (Capacitor.isNativePlatform()) return null;
    return <SplashScreen isGetShape={isGetShapeUser} iconUrl={splashIconUrl} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* ── Rotas públicas / sem contexto de org ── */}
            {/* Novo fluxo 2 etapas com branding por tenant */}
            <Route path="/"                element={<Login />} />
            <Route path="/auth"            element={<Login />} />
            <Route path="/entrar"          element={<Login />} />
            <Route path="/entrar/:orgSlug" element={<Login />} />
            {/* Auth legacy — mantido para compatibilidade interna */}
            <Route path="/auth-legacy"     element={<Auth />} />
            <Route path="/cadastro" element={<Signup />} />
            <Route path="/planos"   element={<Planos />} />
            <Route path="/assinar"  element={<PlanSelection />} />
            <Route path="/convite/:token" element={<ConviteAccept />} />
            <Route path="/pagar/:cobrancaId" element={<Pagamento />} />

            {/* ── Rotas com contexto de org (/:slug/*) ── */}
            <Route path="/:slug" element={<OrgWrapper />}>

              {/* /:slug → redirect para treinador ou aluno */}
              <Route index element={<OrgIndex />} />

              {/* Coach routes */}
              <Route path="treinador" element={<CoachLayout />}>
                <Route index                   element={<CoachDashboard />} />
                <Route path="clientes"         element={<MeusClientes />} />
                <Route path="ranking"          element={<CoachRanking />} />
                <Route path="aluno/:id"        element={<StudentDetails />} />
                <Route path="biblioteca"       element={<ExerciseLibrary />} />
                <Route path="modelos"          element={<TrainingTemplates />} />
                <Route path="produtos"         element={<ProdutosPlanos />} />
                <Route path="configuracoes"    element={<Settings />} />
                <Route path="alterar-senha"      element={<CoachAlterarSenha />} />
                <Route path="revisao-alimentos" element={<RevisaoAlimentos />} />
                <Route path="alimentos"         element={<BancoAlimentos />} />
                <Route path="agenda"            element={<Agenda />} />
                <Route path="mensagens"         element={<Mensagens />} />
                <Route path="notificacoes"      element={<NotificationsManager />} />
                <Route path="lista-substituicao" element={<ListaSubstituicao />} />
                <Route path="formulario"         element={<FormBuilder />} />
                <Route path="atualizacoes"       element={<AtualizacoesCoach />} />
                <Route path="anamnese-builder"        element={<AnamneseBuilder />} />
                <Route path="postural-eval-builder"   element={<PosturalEvalBuilder />} />
                <Route path="leads"                   element={<Leads />} />
                <Route path="financeiro"             element={<Financeiro />} />
                <Route path="colaboradores"         element={<Colaboradores />} />
              </Route>

              {/* Plano — tela standalone, sem o layout/sidebar do painel */}
              <Route path="treinador/plano" element={<PlanoAtual />} />

              {/* Student routes — bloqueio de acesso (alunos.ativo) cobre os dois grupos abaixo */}
              <Route element={<StudentAccessGate />}>

                {/* Student routes — com layout */}
                <Route path="aluno" element={<StudentLayout />}>
                  <Route index                   element={<StudentDashboard />} />
                  <Route path="treinos"          element={<Treinos />} />
                  <Route path="treinos/historico" element={<TreinoHistory />} />
                  <Route path="dieta"            element={<Dieta />} />
                  <Route path="dieta/historico" element={<DietHistory />} />
                  <Route path="dieta/agua"      element={<Agua />} />
                  <Route path="ranking"         element={<Ranking />} />
                  {/* check-in desativado — substituído por Atualização */}
                  <Route path="atualizacao"      element={<Atualizacao />} />
                  <Route path="feedbacks"        element={<Feedbacks />} />
                  <Route path="perfil"           element={<Profile />} />
                  <Route path="alterar-senha"    element={<StudentAlterarSenha />} />
                  <Route path="evolucao"         element={<Evolucao />} />
                  <Route path="agenda"           element={<AgendaAluno />} />
                  <Route path="mensagens"              element={<MensagensAluno />} />
                  <Route path="anamnese"               element={<Anamnese />} />
                  <Route path="notificacoes"           element={<NotificationSettings />} />
                  <Route path="avaliacao-postural"    element={<AvaliacaoPostural />} />
                  <Route path="cardio"               element={<StudentCardio />} />
                  <Route path="sono"                 element={<SleepCalculator />} />
                </Route>

                {/* Student routes — sem layout (fullscreen) */}
                <Route path="aluno/treino-hoje"  element={<TreinoHoje />} />
                <Route path="aluno/semanas"      element={<Semanas />} />
                <Route path="aluno/semana/:id"   element={<SemanaDetail />} />
                <Route path="aluno/exercicio/:id" element={<ExerciseDetail />} />
                <Route path="aluno/historico"    element={<Historico />} />

              </Route>

            </Route>

            {/* ── Rotas legadas (redirect automático via OrgIndex) ── */}
            {/* Mantidas temporariamente para não quebrar links antigos */}
            <Route path="/treinador/*" element={<Auth />} />
            <Route path="/aluno/*"     element={<Auth />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
