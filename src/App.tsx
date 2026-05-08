import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TenantProvider } from "@/contexts/TenantContext";
import SplashScreen from "@/components/SplashScreen";

// Pages — auth & público
import Auth          from "./pages/Auth";
import Login         from "./pages/Login";
import Signup        from "./pages/Signup";
import PlanSelection from "./pages/PlanSelection";
import NotFound      from "./pages/NotFound";

// Pages — org index (redirect inteligente)
import OrgIndex from "./pages/OrgIndex";

// Layouts
import CoachLayout   from "./components/coach/CoachLayout";
import StudentLayout from "./components/student/StudentLayout";

// Coach pages
import CoachDashboard    from "./pages/coach/Dashboard";
import StudentDetails    from "./pages/coach/StudentDetails";
import ExerciseLibrary   from "./pages/coach/ExerciseLibrary";
import TrainingTemplates from "./pages/coach/TrainingTemplates";
import Settings          from "./pages/coach/Settings";
import CoachAlterarSenha    from "./pages/coach/AlterarSenha";
import RevisaoAlimentos    from "./pages/coach/RevisaoAlimentos";
import BancoAlimentos      from "./pages/coach/BancoAlimentos";
import Agenda              from "./pages/coach/Agenda";
import Mensagens              from "./pages/coach/Mensagens";
import NotificationsManager  from "./pages/coach/NotificationsManager";

// Student pages
import StudentDashboard   from "./pages/student/Dashboard";
import Treinos            from "./pages/student/Treinos";
import TreinoHoje         from "./pages/student/TreinoHoje";
import Semanas            from "./pages/student/Semanas";
import SemanaDetail       from "./pages/student/SemanaDetail";
import ExerciseDetail     from "./pages/student/ExerciseDetail";
import Dieta              from "./pages/student/Dieta";
import Historico          from "./pages/student/Historico";
import StudentAlterarSenha from "./pages/student/AlterarSenha";
import CheckIn            from "./pages/student/CheckIn";
import Profile            from "./pages/student/Profile";
import Feedbacks          from "./pages/student/Feedbacks";
import Evolucao           from "./pages/student/Evolucao";
import AgendaAluno        from "./pages/student/AgendaAluno";
import MensagensAluno     from "./pages/student/MensagensAluno";
import Anamnese           from "./pages/student/Anamnese";
import DietHistory           from "./pages/student/DietHistory";
import Ranking               from "./pages/student/Ranking";
import NotificationSettings  from "./pages/student/NotificationSettings";
import AvaliacaoPostural     from "./pages/student/AvaliacaoPostural";

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
function applyFavicon(href: string) {
  document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]'
  ).forEach((el) => { el.href = href; });
}

// ----------------------------------------------------------------
// App
// ----------------------------------------------------------------
const GET_SHAPE_EMAIL = "lucas.melo1991@gmail.com";

const App = () => {
  const [isLoading,     setIsLoading]     = useState(true);
  const [isGetShapeUser, setIsGetShapeUser] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const startTime = Date.now();
      const minDisplay = 1000;
      try {
        // ── Camada 1: cache no localStorage (sem consulta ao banco) ──────
        // Se o slug da URL já corresponde ao slug da org GS salvo anteriormente,
        // ativa o branding instantaneamente — funciona para alunos em revisitas.
        const storedGsSlug = localStorage.getItem("gs_org_slug");
        const pathSlug     = window.location.pathname.split("/")[1] ?? "";

        if (storedGsSlug && storedGsSlug === pathSlug) {
          localStorage.setItem("gs_brand", "1");
          setIsGetShapeUser(true);
          document.title = "Get Shape";
          applyFavicon("/favicon-gs.png");
          return; // já sabemos — não precisa consultar o banco
        }

        // ── Camada 2: e-mail do owner na sessão ───────────────────────────
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email === GET_SHAPE_EMAIL) {
          localStorage.setItem("gs_brand", "1");
          setIsGetShapeUser(true);
          document.title = "Get Shape";
          applyFavicon("/favicon-gs.png");
          return;
        }

        // ── Camada 3: primeiro acesso em dispositivo novo ─────────────────
        // Consulta o banco pela flag is_gs_brand.
        // Aplica somente quando há um slug de org na URL (evita query em /auth, /cadastro etc.)
        const knownPublicPaths = ["", "auth", "entrar", "cadastro", "assinar", "auth-legacy"];
        if (pathSlug && !knownPublicPaths.includes(pathSlug)) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("id, slug, is_gs_brand")
            .eq("slug", pathSlug)
            .eq("active", true)
            .maybeSingle();

          if (orgData?.is_gs_brand) {
            localStorage.setItem("gs_org_id",   orgData.id);
            localStorage.setItem("gs_org_slug", orgData.slug);
            localStorage.setItem("gs_brand",    "1");
            setIsGetShapeUser(true);
            document.title = "Get Shape";
            applyFavicon("/favicon-gs.png");
          }
        }
      } finally {
        const elapsed   = Date.now() - startTime;
        const remaining = Math.max(0, minDisplay - elapsed);
        setTimeout(() => setIsLoading(false), remaining);
      }
    };
    checkSession();
  }, []);

  if (isLoading) return <SplashScreen isGetShape={isGetShapeUser} />;

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
            <Route path="/assinar"  element={<PlanSelection />} />

            {/* ── Rotas com contexto de org (/:slug/*) ── */}
            <Route path="/:slug" element={<OrgWrapper />}>

              {/* /:slug → redirect para treinador ou aluno */}
              <Route index element={<OrgIndex />} />

              {/* Coach routes */}
              <Route path="treinador" element={<CoachLayout />}>
                <Route index                   element={<CoachDashboard />} />
                <Route path="aluno/:id"        element={<StudentDetails />} />
                <Route path="biblioteca"       element={<ExerciseLibrary />} />
                <Route path="modelos"          element={<TrainingTemplates />} />
                <Route path="configuracoes"    element={<Settings />} />
                <Route path="alterar-senha"      element={<CoachAlterarSenha />} />
                <Route path="revisao-alimentos" element={<RevisaoAlimentos />} />
                <Route path="alimentos"         element={<BancoAlimentos />} />
                <Route path="agenda"            element={<Agenda />} />
                <Route path="mensagens"         element={<Mensagens />} />
                <Route path="notificacoes"      element={<NotificationsManager />} />
              </Route>

              {/* Student routes — com layout */}
              <Route path="aluno" element={<StudentLayout />}>
                <Route index                   element={<StudentDashboard />} />
                <Route path="treinos"          element={<Treinos />} />
                <Route path="dieta"            element={<Dieta />} />
                <Route path="dieta/historico" element={<DietHistory />} />
                <Route path="ranking"         element={<Ranking />} />
                <Route path="check-in"         element={<CheckIn />} />
                <Route path="feedbacks"        element={<Feedbacks />} />
                <Route path="perfil"           element={<Profile />} />
                <Route path="alterar-senha"    element={<StudentAlterarSenha />} />
                <Route path="evolucao"         element={<Evolucao />} />
                <Route path="agenda"           element={<AgendaAluno />} />
                <Route path="mensagens"              element={<MensagensAluno />} />
                <Route path="anamnese"               element={<Anamnese />} />
                <Route path="notificacoes"           element={<NotificationSettings />} />
                <Route path="avaliacao-postural"    element={<AvaliacaoPostural />} />
              </Route>

              {/* Student routes — sem layout (fullscreen) */}
              <Route path="aluno/treino-hoje"  element={<TreinoHoje />} />
              <Route path="aluno/semanas"      element={<Semanas />} />
              <Route path="aluno/semana/:id"   element={<SemanaDetail />} />
              <Route path="aluno/exercicio/:id" element={<ExerciseDetail />} />
              <Route path="aluno/historico"    element={<Historico />} />

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
