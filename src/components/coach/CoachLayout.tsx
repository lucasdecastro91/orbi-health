import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Users, BookOpen, FileText, Settings, LogOut, ShieldCheck,
  Apple, Database, ChevronDown, Calendar, MessageSquare,
  AlertCircle, Crown, Bell, ListOrdered, ClipboardList, ClipboardCheck, Package,
  LayoutDashboard, ScanLine, Target, Wallet, Lock, Users2, Trophy,
  User, CreditCard, Sun, Moon, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useCollaboratorPermissions } from "@/hooks/useCollaboratorPermissions";
import { useToast } from "@/hooks/use-toast";
import NotificationBell from "@/components/NotificationBell";
import SupportAgentBubble from "@/components/coach/SupportAgentBubble";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

// Cores da sidebar — sempre dark, independente do tema da org.
// (Tentativa de tingir bg/gradiente com a cor primária via color-mix() foi
// testada e abortada em 2026-08-03 — ficou "sujo"/marrom em vez de rico.
// Voltou pros hex sólidos originais.)
const S = {
  bg:          "#0f0f11",
  bgGradientTop:    "#1e1e23",
  bgGradientBottom: "#0e0e10",
  bgHover:     "rgba(255,255,255,0.05)",
  bgActive:    "rgba(255,255,255,0.06)",
  border:      "rgba(255,255,255,0.07)",
  textPrimary: "#ffffff",
  textMuted:   "#ffffff",
  textDim:     "rgba(255,255,255,0.35)",
} as const;

// Formato compacto (R$0, R$10K) pra caber na barrinha de meta do topo
const fmtCompact = (v: number) => {
  if (v >= 1000) {
    const k = v / 1000;
    return `R$${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `R$${Math.round(v)}`;
};

// Wordmark genérico (ícone + nome da org + "Painel Profissional") — fallback
// pra qualquer org sem logo_url configurado em Identidade Visual. Usa o
// `icon_url` da própria org (o mesmo favicon já configurável em Configurações
// → Aparência) e o `name` real, na fonte base do app — nada hardcoded.
const OrgWordmark = ({ emblemSize, iconUrl, name }: { emblemSize: number; iconUrl?: string | null; name: string }) => (
  <div className="flex items-center gap-2.5 min-w-0">
    <img
      src={iconUrl || "/logos/orbi-logo-icon.svg"}
      alt=""
      className="object-contain shrink-0 rounded-md"
      style={{ height: emblemSize, width: emblemSize }}
    />
    <div className="leading-tight min-w-0">
      <p className="font-extrabold text-white text-sm tracking-tight truncate">{name}</p>
      <p className="text-[11px] text-white/50 truncate">Painel Profissional</p>
    </div>
  </div>
);

const CoachLayout = () => {
  const [profileName, setProfileName]     = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [userEmail, setUserEmail]         = useState("");
  const [alimentosOpen, setAlimentosOpen] = useState(false);
  const [configOpen,    setConfigOpen]    = useState(false);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [orgStatus, setOrgStatus]         = useState<string>("trial");
  const [recebidoMes, setRecebidoMes]     = useState(0);
  const [metaInput,   setMetaInput]       = useState("");
  const [savingMeta,  setSavingMeta]      = useState(false);
  const [metaPopoverOpen, setMetaPopoverOpen] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const { slug, org, orgId, isGetShapeOrg, reload } = useTenantContext();
  const { hasDiet, hasTraining, planType, hasAvaliacaoPostural }  = usePlanFeatures();
  const { isCollaborator, can }             = useCollaboratorPermissions();
  const { toast }                           = useToast();
  const base = `/${slug}/treinador`;

  useEffect(() => { loadProfile(); }, []);

  // Meta de faturamento (barra no topo) — recebido do mês atual, mesma
  // lógica de período já usada em Financeiro.tsx (data_pagamento no mês corrente).
  useEffect(() => {
    if (!orgId || !can("gestao", "financeiro")) return;
    (async () => {
      const now = new Date();
      const mesPfx = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const { data } = await supabase
        .from("cobrancas")
        .select("valor, status, data_pagamento")
        .eq("org_id", orgId)
        .in("status", ["RECEIVED", "CONFIRMED"]);
      const total = (data ?? [])
        .filter((c) => c.data_pagamento?.startsWith(mesPfx))
        .reduce((s, c) => s + Number(c.valor || 0), 0);
      setRecebidoMes(total);
    })();
  }, [orgId]);

  const handleSaveMeta = async () => {
    const val = parseFloat(metaInput.replace(",", "."));
    if (isNaN(val) || val <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    setSavingMeta(true);
    try {
      const { error } = await supabase.from("organizations").update({ meta_faturamento: val }).eq("id", orgId);
      if (error) throw error;
      reload();
      setMetaPopoverOpen(false);
      toast({ title: "Meta atualizada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingMeta(false);
    }
  };

  // Carrega status de assinatura da org
  useEffect(() => {
    if (!org) return;
    // Conta oficial da casa (Get Shape Training) nunca é sujeita a
    // trial/cobrança — é a org de referência do próprio Lucas, não uma
    // cliente pagante do Fluxo B.
    if (isGetShapeOrg) return;
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

    // Suspensa (carência esgotada) ou cancelada (assinatura removida na Asaas) → redireciona
    if ((status === "suspended" || status === "cancelled") && !location.pathname.includes("configuracoes") && !location.pathname.includes("assinar")) {
      navigate(`/assinar?org=${orgId}&slug=${slug}`);
    }
  }, [org, isGetShapeOrg]);

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

  // Atalho de tema no menu do avatar — mesma lógica de Settings.tsx
  // (handleSaveTheme), duplicada aqui a pedido do Lucas (2026-08-03).
  const handleToggleTheme = async () => {
    if (!orgId) return;
    const newTheme = org?.theme === "light" ? "dark" : "light";
    document.documentElement.classList.toggle("light", newTheme === "light");
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    try {
      const { error } = await supabase.from("organizations").update({ theme: newTheme }).eq("id", orgId);
      if (error) throw error;
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao trocar tema", description: err.message, variant: "destructive" });
      document.documentElement.classList.toggle("light", org?.theme === "light");
      document.documentElement.classList.toggle("dark", org?.theme !== "light");
    }
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
    { icon: LayoutDashboard, label: "Resumo",   path: base,                    badge: 0 },
    ...(can("treino",         "clientes"      ) ? [{ icon: Users,         label: "Clientes",  path: `${base}/clientes`,      badge: 0           }] : []),
    ...(can("gestao",         "mensagens"     ) ? [{ icon: MessageSquare, label: "Mensagens", path: `${base}/mensagens`,     badge: unreadCount }] : []),
    ...(hasDiet && can("nutricao", "alimentos") ? [{ icon: Apple,         label: "Alimentos", path: `${base}/alimentos`,     badge: 0           }] : []),
    ...(can("administracao",  "configuracoes" ) ? [{ icon: Settings,      label: "Config.",   path: `${base}/configuracoes`, badge: 0           }] : []),
  ];

  // Sidebar items (desktop) — split into groups to allow expandable sections in between
  // Order: Resumo → Clientes → Agenda/Mensagens/Produtos/Biblioteca/Modelos → Alimentos → Notificações → Configurações
  const topItems = [
    { icon: LayoutDashboard, label: "Resumo", path: base, badge: 0, exact: true },
  ];

  const midItems = [
    { icon: Calendar,      label: "Agenda",                  path: `${base}/agenda`,    badge: 0,           exact: false, permCat: "treino" as const,  permKey: "agenda"            },
    { icon: MessageSquare, label: "Mensagens",               path: `${base}/mensagens`, badge: unreadCount,  exact: false, permCat: "gestao" as const,  permKey: "mensagens"         },
    { icon: Trophy,        label: "Ranking",                path: `${base}/ranking`,    badge: 0,           exact: false, permCat: "gestao" as const,  permKey: "ranking"           },
    { icon: Target,        label: "Leads / CRM",            path: `${base}/leads`,      badge: 0,           exact: false, permCat: "gestao" as const,  permKey: "leads_crm"         },
    { icon: Wallet,        label: "Financeiro",             path: `${base}/financeiro`, badge: 0,           exact: false, permCat: "gestao" as const,  permKey: "financeiro"        },
    { icon: Package,       label: "Produtos / Planos",       path: `${base}/produtos`,  badge: 0,           exact: false, permCat: "gestao" as const,  permKey: "produtos_planos"   },
    ...(hasTraining ? [
      { icon: BookOpen, label: "Biblioteca de Exercícios",  path: `${base}/biblioteca`, badge: 0, exact: false, permCat: "treino" as const, permKey: "biblioteca_exercicios" },
      { icon: FileText, label: "Modelos de Treino",         path: `${base}/modelos`,    badge: 0, exact: false, permCat: "treino" as const, permKey: "modelos_treino"        },
    ] : []),
  ];

  const bottomItems = [
    { icon: Bell, label: "Notificações", path: `${base}/notificacoes`, badge: 0, exact: false, permCat: "gestao" as const, permKey: "notificacoes" },
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
    { icon: Settings,      label: "Geral",                    path: `${base}/configuracoes`          },
    { icon: ClipboardCheck, label: "Anamnese",                path: `${base}/anamnese-builder`       },
    ...(hasAvaliacaoPostural ? [{ icon: ScanLine, label: "Avaliação Postural", path: `${base}/postural-eval-builder` }] : []),
    { icon: ClipboardList, label: "Formulário de Atualização", path: `${base}/formulario`            },
    // Colaboradores: só visível para owners (não colaboradores)
    ...(!isCollaborator ? [{ icon: Users2, label: "Colaboradores", path: `${base}/colaboradores` }] : []),
  ];

  // ── Helpers de permissão ───────────────────────────────────────
  // showLocked: colaborador sem permissão em org Pro → mostra com cadeado
  // hideItem:   colaborador sem permissão em org Motion → oculta item
  const showLocked = useCallback((cat: Parameters<typeof can>[0], key: string) =>
    isCollaborator && !can(cat, key) && planType !== "motion",
  [isCollaborator, can, planType]);

  const hideItem = useCallback((cat: Parameters<typeof can>[0], key: string) =>
    isCollaborator && !can(cat, key) && planType === "motion",
  [isCollaborator, can, planType]);

  const notifyNoAccess = () =>
    toast({ title: "Acesso restrito", description: "Você não tem acesso a esta seção. Solicite ao administrador." });

  // Menu de conta (avatar) — canto superior direito do conteúdo, desktop.
  // Sempre dark (mesmo padrão de S/sidebar), independente do tema da org.
  const AccountMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full shrink-0 transition-opacity hover:opacity-80">
          <Avatar className="h-9 w-9" style={{ boxShadow: "0 0 0 2px rgba(var(--cp-rgb),0.3)" }}>
            <AvatarImage src={profileAvatar} alt={profileName} />
            <AvatarFallback className="text-white text-sm font-bold" style={{ background: "var(--cp-gradient)" }}>
              {profileName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border-white/8 rounded-xl">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-white truncate">{profileName}</p>
          <p className="text-xs text-white/50">Treinador</p>
        </div>
        <DropdownMenuSeparator className="bg-white/8" />

        <DropdownMenuItem
          className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
          onClick={() => navigate(`${base}/configuracoes?tab=perfil`)}
        >
          <User className="h-4 w-4 mr-2" />Perfil
        </DropdownMenuItem>

        {hideItem("gestao", "financeiro") ? null : showLocked("gestao", "financeiro") ? (
          <DropdownMenuItem className="text-white/30 rounded-lg cursor-pointer" onClick={notifyNoAccess}>
            <Wallet className="h-4 w-4 mr-2" />Financeiro
            <Lock className="h-3.5 w-3.5 ml-auto opacity-40" />
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
            onClick={() => navigate(`${base}/financeiro`)}
          >
            <Wallet className="h-4 w-4 mr-2" />Financeiro
          </DropdownMenuItem>
        )}

        {hideItem("administracao", "configuracoes") ? null : showLocked("administracao", "configuracoes") ? (
          <DropdownMenuItem className="text-white/30 rounded-lg cursor-pointer" onClick={notifyNoAccess}>
            <Settings className="h-4 w-4 mr-2" />Configurações
            <Lock className="h-3.5 w-3.5 ml-auto opacity-40" />
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem
              className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
              onClick={() => navigate(`${base}/configuracoes?tab=aparencia`)}
            >
              <Settings className="h-4 w-4 mr-2" />Configurações
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
              onClick={() => navigate(`${base}/configuracoes?tab=assinatura`)}
            >
              <CreditCard className="h-4 w-4 mr-2" />Assinatura
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className="bg-white/8" />
        <DropdownMenuItem
          className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
          onClick={handleToggleTheme}
        >
          {org?.theme === "light" ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
          Tema {org?.theme === "light" ? "escuro" : "claro"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
    location.pathname.includes("/postural-eval-builder") ||
    location.pathname.includes("/colaboradores");

  return (
    <div className="min-h-screen bg-background">

      {/* ═══════════════════════════════════════════
          MOBILE — header top + bottom nav (sempre dark)
      ═══════════════════════════════════════════ */}

      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 backdrop-blur-sm"
        style={{ backgroundColor: S.bg, borderBottom: `1px solid ${S.border}` }}
      >
        {org?.logo_url ? (
          <img src={org.logo_url} alt={org?.name ?? "ORBI Health"} className="h-[44px] w-auto object-contain" />
        ) : (
          <OrgWordmark emblemSize={34} iconUrl={org?.icon_url} name={org?.name ?? "ORBI Health"} />
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
        className="hidden lg:flex flex-col w-64 fixed top-3 left-3 bottom-3 z-30 rounded-2xl overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${S.bgGradientTop}, ${S.bgGradientBottom})`,
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 10px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
        }}
      >

        {/* Logo — altura/padding calibrados pra bater com a altura da barra
            superior do conteúdo (sino/avatar h-9 + py-5 = 76px), já descontado
            o gap de 12px (top-3) que a sidebar flutuante tem e o conteúdo não
            — assim as duas linhas divisórias ficam alinhadas. */}
        <div
          className="px-6 py-3 flex items-center justify-start"
          style={{ borderBottom: `1px solid ${S.border}` }}
        >
          {org?.logo_url ? (
            <img src={org.logo_url} alt={org?.name ?? "ORBI Health"} className="h-10 w-auto max-w-[160px] object-contain" />
          ) : (
            <OrgWordmark emblemSize={38} iconUrl={org?.icon_url} name={org?.name ?? "ORBI Health"} />
          )}
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

          {/* ── Meus Clientes ── */}
          {hideItem("treino", "clientes") ? null : showLocked("treino", "clientes") ? (
            <button type="button" className="w-full text-left" onClick={notifyNoAccess}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                <Users className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Meus Clientes</span>
                <Lock className="w-3.5 h-3.5 opacity-40" />
              </div>
            </button>
          ) : (
            <Link to={`${base}/clientes`}>
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                style={
                  isClientesActive
                    ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                    : { color: S.textMuted }
                }
                onMouseEnter={(e) => {
                  if (!isClientesActive) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                    (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isClientesActive) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    (e.currentTarget as HTMLElement).style.color = S.textMuted;
                  }
                }}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="flex-1">Meus Clientes</span>
              </div>
            </Link>
          )}

          {/* ── Mid items: Agenda, Mensagens, Produtos, Biblioteca, Modelos ── */}
          {midItems.map((item) => {
            if (hideItem(item.permCat, item.permKey)) return null;
            const locked = showLocked(item.permCat, item.permKey);
            const active = !locked && isActive(item.path, item.exact);
            const inner = (
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                style={
                  active
                    ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                    : locked
                      ? { color: "rgba(255,255,255,0.3)" }
                      : { color: S.textMuted }
                }
                onMouseEnter={(e) => {
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                }}
                onMouseLeave={(e) => {
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.color = S.textMuted;
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {locked
                  ? <Lock className="w-3.5 h-3.5 opacity-40 shrink-0" />
                  : item.badge > 0 && (
                    <span
                      className="min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1"
                      style={{ backgroundColor: active ? "rgba(255,255,255,0.25)" : "hsl(0 70% 55%)", color: "#fff" }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
              </div>
            );
            return locked
              ? <button key={item.path} type="button" className="w-full text-left" onClick={notifyNoAccess}>{inner}</button>
              : <Link key={item.path} to={item.path}>{inner}</Link>;
          })}

          {/* ── Alimentos (expandable section) — visível só quando hasDiet ── */}
          {hasDiet && (hideItem("nutricao", "alimentos") ? null : showLocked("nutricao", "alimentos") ? (
            <button type="button" className="w-full text-left" onClick={notifyNoAccess}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                <Apple className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Alimentos</span>
                <Lock className="w-3.5 h-3.5 opacity-40" />
              </div>
            </button>
          ) : <div>
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
          </div>)}

          {/* ── Bottom items: Notificações ── */}
          {bottomItems.map((item) => {
            if (hideItem(item.permCat, item.permKey)) return null;
            const locked = showLocked(item.permCat, item.permKey);
            const active = !locked && isActive(item.path, item.exact);
            const inner = (
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                style={
                  active
                    ? { background: "var(--cp-gradient)", color: "#ffffff", boxShadow: "0 2px 12px rgba(var(--cp-rgb), 0.25)" }
                    : locked
                      ? { color: "rgba(255,255,255,0.3)" }
                      : { color: S.textMuted }
                }
                onMouseEnter={(e) => {
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.backgroundColor = S.bgHover;
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.color = S.textPrimary;
                }}
                onMouseLeave={(e) => {
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  if (!active && !locked) (e.currentTarget as HTMLElement).style.color = S.textMuted;
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {locked && <Lock className="w-3.5 h-3.5 opacity-40 shrink-0" />}
              </div>
            );
            return locked
              ? <button key={item.path} type="button" className="w-full text-left" onClick={notifyNoAccess}>{inner}</button>
              : <Link key={item.path} to={item.path}>{inner}</Link>;
          })}

          {/* ── Configurações (expandable section) ── */}
          {hideItem("administracao", "configuracoes") ? null : showLocked("administracao", "configuracoes") ? (
            <button type="button" className="w-full text-left" onClick={notifyNoAccess}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                <Settings className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Configurações</span>
                <Lock className="w-3.5 h-3.5 opacity-40" />
              </div>
            </button>
          ) : <div>
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
          </div>}

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
      <main className="min-h-screen pt-14 pb-20 lg:pt-0 lg:pb-0 lg:ml-[280px] bg-background">
        {/* Barra superior (desktop) — atalho de mensagens + sino + menu de
            conta no canto superior direito. Mensagens usa o mesmo padrão de
            ícone+badge já usado no header mobile do aluno (StudentLayout.tsx). */}
        <div className="hidden lg:flex items-center justify-end gap-3 px-6 py-5 sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
          {can("gestao", "financeiro") && (
            <div className="flex items-center gap-2.5 h-9 shrink-0">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-foreground shrink-0">{fmtCompact(recebidoMes)}</span>

              <button
                type="button"
                onClick={() => navigate(`${base}/financeiro`)}
                className="relative w-36 h-1.5 shrink-0"
                title="Ver financeiro"
              >
                <span className="absolute inset-0 rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-track-bg)" }}>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${org?.meta_faturamento ? Math.min(100, (recebidoMes / org.meta_faturamento) * 100) : 0}%`,
                      background: "var(--cp-gradient)",
                    }}
                  />
                </span>
                <span
                  className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 shadow-sm"
                  style={{
                    left: `${org?.meta_faturamento ? Math.min(100, (recebidoMes / org.meta_faturamento) * 100) : 0}%`,
                    transform: "translate(-50%, -50%)",
                    background: "var(--cp-500)",
                    borderColor: "hsl(var(--background))",
                  }}
                />
              </button>

              <Popover
                open={metaPopoverOpen}
                onOpenChange={(o) => {
                  setMetaPopoverOpen(o);
                  if (o) setMetaInput(String(org?.meta_faturamento ?? 10000));
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-xs font-medium text-foreground/45 hover:text-foreground transition-colors shrink-0"
                    title="Editar meta de faturamento"
                  >
                    {fmtCompact(org?.meta_faturamento ?? 10000)}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-2.5">
                <p className="text-xs font-semibold text-foreground">Meta de faturamento mensal</p>
                <p className="text-[11px] text-foreground/40">
                  Recebido este mês: {recebidoMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={metaInput}
                    onChange={(e) => setMetaInput(e.target.value)}
                    placeholder="10000"
                    inputMode="decimal"
                    className="h-9 text-sm"
                  />
                  <Button
                    onClick={handleSaveMeta}
                    disabled={savingMeta}
                    className="h-9 px-3 shrink-0 text-white font-semibold"
                    style={{ background: "var(--cp-gradient)" }}
                  >
                    {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                  </Button>
                </div>
              </PopoverContent>
              </Popover>
            </div>
          )}
          {can("gestao", "mensagens") && (
            <button
              type="button"
              onClick={() => navigate(`${base}/mensagens`)}
              className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-foreground/60 hover:text-foreground hover:bg-foreground/5"
              title="Mensagens"
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
          )}
          <NotificationBell role="coach" />
          <AccountMenu />
        </div>

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

      {/* Agente de IA de suporte — só o dono da org, não colaboradores */}
      {!isCollaborator && <SupportAgentBubble />}

    </div>
  );
};

export default CoachLayout;
