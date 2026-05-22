import { useState, useEffect, useLayoutEffect } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users, BookOpen, FileText, Settings, LogOut, ShieldCheck,
  Apple, Database, ChevronDown, Calendar, MessageSquare,
  AlertCircle, Crown, Bell, ListOrdered, ClipboardList, ClipboardCheck, Package,
  LayoutDashboard, ScanLine, Target, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import NotificationBell from "@/components/NotificationBell";

const SUPERADMIN_EMAIL = "lucas.melo1991@gmail.com";

// ── Helper: aplica CSS vars âmbar (Get Shape) no documento ──────
// Valores extraídos diretamente do COLOR_PALETTE (hex #d97706 — "Âmbar")
const AMBER = {
  hsl:      "38 93% 44%",
  rgb:      "217, 119, 6",
  light:    "hsl(38 95% 60%)",
  mid:      "hsl(38 95% 54%)",
  gradient: "linear-gradient(135deg, hsl(38 95% 54%), hsl(38 93% 40%))",
  textOn:   "#ffffff",
} as const;

function applyAmber() {
  const el = document.documentElement;
  el.style.setProperty("--primary",     AMBER.hsl);
  el.style.setProperty("--ring",        AMBER.hsl);
  el.style.setProperty("--accent",      AMBER.hsl);
  el.style.setProperty("--cp-gradient", AMBER.gradient);
  el.style.setProperty("--cp-rgb",      AMBER.rgb);
  el.style.setProperty("--cp-400",      AMBER.light);
  el.style.setProperty("--cp-500",      AMBER.mid);
  el.style.setProperty("--cp-600",      `hsl(${AMBER.hsl})`);
  el.style.setProperty("--cp-text",     AMBER.textOn);
}

// Cores da sidebar — sempre dark, independente do tema da org
const S = {
  bg:          "#0f0f11",
  bgHover:     "rgba(255,255,255,0.05)",
  bgActive:    "rgba(255,255,255,0.06)",
  border:      "rgba(255,255,255,0.07)",
  textPrimary: "#ffffff",
  textMuted:   "rgba(255,255,255,0.55)",
  textDim:     "rgba(255,255,255,0.35)",
} as const;

const CoachLayout = () => {
  const [profileName, setProfileName]     = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [userEmail, setUserEmail]         = useState("");
  const [clientesOpen,  setClientesOpen]  = useState(false);
  const [alimentosOpen, setAlimentosOpen] = useState(false);
  const [configOpen,    setConfigOpen]    = useState(false);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [orgStatus, setOrgStatus]         = useState<string>("trial");
  const navigate  = useNavigate();
  const location  = useLocation();
  const { slug, org, orgId, isGetShapeOrg } = useTenantContext();
  const base = `/${slug}/treinador`;

  useEffect(() => { loadProfile(); }, []);

  // Carrega status de assinatura da org
  useEffect(() => {
    if (!org) return;
    const status = (org as any).subscription_status ?? "trial";
    setOrgStatus(status);

    const trialEndsAt = (org as any).trial_ends_at;
    if (trialEndsAt) {
      const days = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
      setTrialDaysLeft(days);

      // Redireciona para assinatura se trial expirou e não está na página de billing
      if (days === 0 && status === "trial" && !location.pathname.includes("configuracoes") && !location.pathname.includes("assinar")) {
        navigate(`/assinar?org=${orgId}&slug=${slug}`);
      }
    }

    // Suspensa além da carência → redireciona
    if (status === "suspended" && !location.pathname.includes("configuracoes") && !location.pathname.includes("assinar")) {
      navigate(`/assinar?org=${orgId}&slug=${slug}`);
    }
  }, [org]);

  // Auto-expand Clientes section if we're on the clientes page
  useEffect(() => {
    if (location.pathname.includes("/clientes")) {
      setClientesOpen(true);
    }
  }, [location.pathname]);

  // Auto-expand Alimentos section if we're on a food page
  useEffect(() => {
    if (
      location.pathname.includes("/alimentos") ||
      location.pathname.includes("/revisao-alimentos") ||
      location.pathname.includes("/lista-substituicao")
    ) {
      setAlimentosOpen(true);
    }
  }, [location.pathname]);

  // Auto-expand Configurações section if we're on config, formulario or anamnese page
  useEffect(() => {
    if (
      location.pathname.includes("/configuracoes") ||
      location.pathname.includes("/formulario") ||
      location.pathname.includes("/alterar-senha") ||
      location.pathname.includes("/anamnese-builder") ||
      location.pathname.includes("/postural-eval-builder")
    ) {
      setConfigOpen(true);
    }
  }, [location.pathname]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles").select("nome, avatar_url").eq("id", user.id).single();
      if (profile) {
        setProfileName(profile.nome);
        setProfileAvatar(profile.avatar_url || "");
      }
      // Load unread messages count
      loadUnread(user.id);
      // Subscribe to new messages
      const channel = supabase
        .channel(`coach-unread-${user.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "mensagens",
          filter: `destinatario_id=eq.${user.id}`,
        }, () => { loadUnread(user.id); })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } catch (err) { console.error("Error loading profile:", err); }
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
    localStorage.removeItem("gs_brand");
    await supabase.auth.signOut();
    // Volta para o login com branding do tenant preservado
    navigate(slug ? `/entrar/${slug}` : "/auth");
  };

  // isSuperAdmin: verdadeiro se o usuário logado É o dono (lucas) OU se
  // isGetShapeOrg está ativo (cobre co-coaches da mesma org no futuro).
  const isSuperAdmin = userEmail === SUPERADMIN_EMAIL || isGetShapeOrg;

  // ── Força cor âmbar para Get Shape ───────────────────────────
  // useLayoutEffect: aplica ANTES do paint, eliminando o flash verde
  // na montagem inicial (lê cache do localStorage).
  useLayoutEffect(() => {
    if (localStorage.getItem("gs_brand") !== "1") return;
    applyAmber();
  }, []);

  // useEffect: confirma após email carregado e reaplica sempre que
  // TenantContext sobrescrever com a cor do banco.
  useEffect(() => {
    if (!isSuperAdmin) return;
    localStorage.setItem("gs_brand", "1");
    applyAmber();
  }, [isSuperAdmin, org?.primary_color]);

  // Mobile bottom-nav items (flat, no sub-items)
  const menuItems = [
    { icon: LayoutDashboard, label: "Resumo",    path: base,                       badge: 0 },
    { icon: Users,           label: "Clientes",  path: `${base}/clientes`,         badge: 0 },
    { icon: MessageSquare,   label: "Mensagens", path: `${base}/mensagens`,        badge: unreadCount },
    { icon: Apple,           label: "Alimentos", path: `${base}/alimentos`,        badge: 0 },
    { icon: Settings,        label: "Config.",   path: `${base}/configuracoes`,    badge: 0 },
  ];

  // Sidebar items (desktop) — split into groups to allow expandable sections in between
  // Order: Resumo → Clientes → Agenda/Mensagens/Produtos/Biblioteca/Modelos → Alimentos → Notificações → Configurações
  const topItems = [
    { icon: LayoutDashboard, label: "Resumo", path: base, badge: 0, exact: true },
  ];

  const midItems = [
    { icon: Calendar,      label: "Agenda",                   path: `${base}/agenda`,     badge: 0,          exact: false },
    { icon: MessageSquare, label: "Mensagens",                path: `${base}/mensagens`,  badge: unreadCount, exact: false },
    { icon: Target,        label: "Leads / CRM",             path: `${base}/leads`,       badge: 0,          exact: false },
    { icon: Wallet,        label: "Financeiro",              path: `${base}/financeiro`,  badge: 0,          exact: false },
    { icon: Package,       label: "Produtos / Planos",        path: `${base}/produtos`,   badge: 0,          exact: false },
    { icon: BookOpen,      label: "Biblioteca de Exercícios", path: `${base}/biblioteca`, badge: 0,          exact: false },
    { icon: FileText,      label: "Modelos de Treino",        path: `${base}/modelos`,    badge: 0,          exact: false },
  ];

  const bottomItems = [
    { icon: Bell, label: "Notificações", path: `${base}/notificacoes`, badge: 0, exact: false },
  ];

  // Meus Clientes sub-items
  const clientesItems = [
    { label: "Todos",     path: `${base}/clientes`,                  dot: "rgba(255,255,255,0.3)" },
    { label: "Ativos",   path: `${base}/clientes?filter=ativos`,    dot: "rgb(74,222,128)" },
    { label: "Inativos", path: `${base}/clientes?filter=inativos`,  dot: "rgba(255,255,255,0.3)" },
  ];

  // Alimentos sub-items
  const alimentosItems = [
    { icon: Database,      label: "Banco de Alimentos",    path: `${base}/alimentos` },
    { icon: ListOrdered,   label: "Lista de Substituição", path: `${base}/lista-substituicao` },
    ...(isSuperAdmin
      ? [{ icon: ShieldCheck, label: "Revisão",            path: `${base}/revisao-alimentos` }]
      : []),
  ];

  // Configurações sub-items
  const configItems = [
    { icon: Settings,      label: "Configurações",            path: `${base}/configuracoes`          },
    { icon: ClipboardCheck, label: "Anamnese",                path: `${base}/anamnese-builder`       },
    { icon: ScanLine,      label: "Avaliação Postural",        path: `${base}/postural-eval-builder`  },
    { icon: ClipboardList, label: "Formulário de Atualização", path: `${base}/formulario`            },
  ];

  const isActive = (path: string, exact = false) =>
    exact || path === base
      ? location.pathname === path
      : location.pathname.startsWith(path);

  const isClientesActive = location.pathname.startsWith(`${base}/clientes`);

  const isAlimentosActive =
    location.pathname.includes("/alimentos") ||
    location.pathname.includes("/revisao-alimentos") ||
    location.pathname.includes("/lista-substituicao");

  const isConfigActive =
    location.pathname.includes("/configuracoes") ||
    location.pathname.includes("/formulario") ||
    location.pathname.includes("/alterar-senha") ||
    location.pathname.includes("/anamnese-builder") ||
    location.pathname.includes("/postural-eval-builder");

  return (
    <div className="min-h-screen bg-background">

      {/* ═══════════════════════════════════════════
          MOBILE — header top + bottom nav (sempre dark)
      ═══════════════════════════════════════════ */}

      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 backdrop-blur-sm"
        style={{ backgroundColor: S.bg, borderBottom: `1px solid ${S.border}` }}
      >
        {isSuperAdmin ? (
          <img
            src="/logo-gs.png"
            alt="Get Shape Training"
            className="h-[40px] w-auto object-contain"
          />
        ) : (
          <img
            src={org?.logo_url ?? "/logos/orbi-logo-horizontal-dark.svg"}
            alt={org?.name ?? "ORBI Pro"}
            className="h-9 w-auto object-contain"
          />
        )}
        <div className="flex items-center gap-2">
          <NotificationBell role="coach" />
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.07)", color: S.textMuted }}
            title="Sair da conta"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-sm"
        style={{ backgroundColor: S.bg, borderTop: `1px solid ${S.border}` }}
      >
        <div className="flex items-stretch h-16">
          {menuItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
                style={{ color: active ? "var(--cp-500)" : S.textDim }}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.badge > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-bold flex items-center justify-center px-0.5"
                      style={{ backgroundColor: "hsl(0 70% 55%)", color: "#fff" }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════
          DESKTOP — sidebar fixa (sempre dark)
      ═══════════════════════════════════════════ */}

      <aside
        className="hidden lg:flex flex-col w-64 min-h-screen fixed top-0 left-0 bottom-0 z-30"
        style={{ backgroundColor: S.bg, borderRight: `1px solid ${S.border}` }}
      >

        {/* Logo + bell */}
        <div
          className="px-6 pt-6 pb-5 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${S.border}` }}
        >
          {isSuperAdmin ? (
            <img
              src="/logo-gs.png"
              alt="Get Shape Training"
              className="h-[52px] w-auto object-contain"
            />
          ) : (
            <img
              src={org?.logo_url ?? "/logos/orbi-logo-horizontal-dark.svg"}
              alt={org?.name ?? "ORBI Pro"}
              className="w-[120px] h-auto object-contain"
            />
          )}
          <NotificationBell role="coach" />
        </div>

        {/* Profile */}
        <div
          className="px-4 py-4"
          style={{ borderBottom: `1px solid ${S.border}` }}
        >
          <div
            className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors cursor-default"
            style={{ backgroundColor: S.bgActive }}
          >
            <Avatar className="h-9 w-9 shrink-0" style={{ boxShadow: "0 0 0 2px rgba(var(--cp-rgb),0.3)" }}>
              <AvatarImage src={profileAvatar} alt={profileName} />
              <AvatarFallback
                className="text-white text-sm font-bold"
                style={{ background: "var(--cp-gradient)" }}
              >
                {profileName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate" style={{ color: S.textPrimary }}>
                {profileName}
              </p>
              <p className="text-xs tracking-wide" style={{ color: S.textMuted }}>
                Treinador
              </p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">

          {/* ── Top items: Resumo ── */}
          {topItems.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <Link key={item.path} to={item.path}>
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  style={
                    active
                      ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                      : { color: S.textMuted }
                  }
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                    if (!active) (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    if (!active) (e.currentTarget as HTMLElement).style.color = S.textMuted;
                  }}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </div>
              </Link>
            );
          })}

          {/* ── Meus Clientes (expandable section) ── */}
          <div>
            <button
              onClick={() => setClientesOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={
                isClientesActive && !clientesOpen
                  ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                  : { color: isClientesActive ? S.textPrimary : S.textMuted }
              }
              onMouseEnter={(e) => {
                if (!isClientesActive || clientesOpen) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                  (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                }
              }}
              onMouseLeave={(e) => {
                if (!isClientesActive || clientesOpen) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = isClientesActive ? S.textPrimary : S.textMuted;
                }
              }}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Meus Clientes</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform duration-200"
                style={{ transform: clientesOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {clientesOpen && (
              <div className="mt-0.5 ml-3 pl-3 space-y-0.5" style={{ borderLeft: `1px solid ${S.border}` }}>
                {clientesItems.map((item) => {
                  const active = location.pathname + location.search === item.path ||
                    (item.path === `${base}/clientes` && location.pathname === `${base}/clientes` && !location.search);
                  return (
                    <Link key={item.path} to={item.path}>
                      <div
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                        style={active
                          ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 8px rgba(var(--cp-rgb), 0.2)" }
                          : { color: S.textMuted }}
                        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover; (e.currentTarget as HTMLElement).style.color = S.textPrimary; } }}
                        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = S.textMuted; } }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: active ? "rgba(255,255,255,0.7)" : item.dot }}
                        />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Mid items: Agenda, Mensagens, Produtos, Biblioteca, Modelos ── */}
          {midItems.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <Link key={item.path} to={item.path}>
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  style={
                    active
                      ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                      : { color: S.textMuted }
                  }
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                    if (!active) (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    if (!active) (e.currentTarget as HTMLElement).style.color = S.textMuted;
                  }}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span
                      className="min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1"
                      style={{ backgroundColor: active ? "rgba(255,255,255,0.25)" : "hsl(0 70% 55%)", color: "#fff" }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          {/* ── Alimentos (expandable section) ── */}
          <div>
            <button
              onClick={() => setAlimentosOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={
                isAlimentosActive && !alimentosOpen
                  ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                  : { color: isAlimentosActive ? S.textPrimary : S.textMuted }
              }
              onMouseEnter={(e) => {
                if (!isAlimentosActive || alimentosOpen) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                  (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                }
              }}
              onMouseLeave={(e) => {
                if (!isAlimentosActive || alimentosOpen) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = isAlimentosActive ? S.textPrimary : S.textMuted;
                }
              }}
            >
              <Apple className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Alimentos</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform duration-200"
                style={{ transform: alimentosOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {alimentosOpen && (
              <div className="mt-0.5 ml-3 pl-3 space-y-0.5" style={{ borderLeft: `1px solid ${S.border}` }}>
                {alimentosItems.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link key={item.path} to={item.path}>
                      <div
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                        style={active ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 8px rgba(var(--cp-rgb), 0.2)" } : { color: S.textMuted }}
                        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover; (e.currentTarget as HTMLElement).style.color = S.textPrimary; } }}
                        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = S.textMuted; } }}
                      >
                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Bottom items: Notificações ── */}
          {bottomItems.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <Link key={item.path} to={item.path}>
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  style={
                    active
                      ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                      : { color: S.textMuted }
                  }
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                    if (!active) (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    if (!active) (e.currentTarget as HTMLElement).style.color = S.textMuted;
                  }}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </div>
              </Link>
            );
          })}

          {/* ── Configurações (expandable section) ── */}
          <div>
            <button
              onClick={() => setConfigOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={
                isConfigActive && !configOpen
                  ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                  : { color: isConfigActive ? S.textPrimary : S.textMuted }
              }
              onMouseEnter={(e) => {
                if (!isConfigActive || configOpen) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                  (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                }
              }}
              onMouseLeave={(e) => {
                if (!isConfigActive || configOpen) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = isConfigActive ? S.textPrimary : S.textMuted;
                }
              }}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Configurações</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform duration-200"
                style={{ transform: configOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {configOpen && (
              <div className="mt-0.5 ml-3 pl-3 space-y-0.5" style={{ borderLeft: `1px solid ${S.border}` }}>
                {configItems.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link key={item.path} to={item.path}>
                      <div
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                        style={active ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 8px rgba(var(--cp-rgb), 0.2)" } : { color: S.textMuted }}
                        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover; (e.currentTarget as HTMLElement).style.color = S.textPrimary; } }}
                        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = S.textMuted; } }}
                      >
                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

        </nav>

        {/* Logout */}
        <div
          className="px-4 pb-6 pt-4"
          style={{ borderTop: `1px solid ${S.border}` }}
        >
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-colors"
            style={{ color: S.textMuted }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
              (e.currentTarget as HTMLElement).style.color = S.textPrimary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.color = S.textMuted;
            }}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════
          CONTEÚDO PRINCIPAL — segue o tema
      ═══════════════════════════════════════════ */}
      <main className="min-h-screen pt-14 pb-20 lg:pt-0 lg:pb-0 lg:ml-64 bg-background">
        {/* Banner de trial */}
        {orgStatus === "trial" && trialDaysLeft !== null && trialDaysLeft <= 7 && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            style={{
              background: trialDaysLeft <= 2
                ? "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))"
                : "linear-gradient(90deg, rgba(251,191,36,0.15), rgba(251,191,36,0.08))",
              borderBottom: `1px solid ${trialDaysLeft <= 2 ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)"}`,
            }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className={`w-4 h-4 shrink-0 ${trialDaysLeft <= 2 ? "text-red-400" : "text-amber-400"}`} />
              <span className={trialDaysLeft <= 2 ? "text-red-300" : "text-amber-300"}>
                {trialDaysLeft === 0
                  ? "Seu trial expirou."
                  : `Seu trial termina em ${trialDaysLeft} dia${trialDaysLeft !== 1 ? "s" : ""}.`}
              </span>
            </div>
            <button
              onClick={() => navigate(`/assinar?org=${orgId}&slug=${slug}`)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0"
              style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
            >
              <Crown className="w-3.5 h-3.5" />
              Assinar agora
            </button>
          </div>
        )}
        <Outlet />
      </main>

    </div>
  );
};

export default CoachLayout;
