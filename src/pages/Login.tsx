/**
 * Login.tsx — Fluxo de login em 2 etapas com branding dinamico por tenant.
 *
 * Layout MOBILE  — topo verde (logo branca) + base preta (formulario)
 * Layout DESKTOP — card centralizado em fundo claro, estilo clean/profissional
 *
 * Etapa 1 (email)  → resolve tenant pelo e-mail via RPC get_tenant_by_email
 * Etapa 2 (senha)  → signInWithPassword + redirect por tipo_usuario
 * Etapa 3 (forgot) → resetPasswordForEmail
 *
 * Rota /entrar/:orgSlug → pre-carrega branding antes do usuario digitar
 */

import { useState, useEffect, useLayoutEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import SplashScreen from "@/components/SplashScreen";
import { getColorEntry } from "@/lib/colors";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = "email" | "password" | "forgot";

interface TenantBranding {
  name: string;
  slug: string;
  logo_url: string | null;
  login_logo_url: string | null;
  icon_url: string | null;
  primary_color: string | null;
  theme: "dark" | "light";
  is_gs_brand: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const applyFavicon = (href: string, type = "image/x-icon") => {
  // Remove todos os <link> de favicon existentes (podem ter type errado)
  document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']")
    .forEach((el) => el.parentNode?.removeChild(el));
  // Cria novo <link> com tipo correto + cache-bust para forçar re-fetch
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = type;
  link.href = `${href}?v=${Date.now()}`;
  document.head.appendChild(link);
};

// Remove todos os favicons sem adicionar um novo (org sem ícone customizado)
const removeFavicon = () => {
  document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']")
    .forEach((el) => el.parentNode?.removeChild(el));
};

const applyColorVars = (color: ReturnType<typeof getColorEntry>) => {
  const el = document.documentElement;
  el.style.setProperty("--primary",     color.hsl);
  el.style.setProperty("--ring",        color.hsl);
  el.style.setProperty("--accent",      color.hsl);
  el.style.setProperty("--cp-gradient", color.gradient);
  el.style.setProperty("--cp-rgb",      color.rgb);
  el.style.setProperty("--cp-400",      color.light);
  el.style.setProperty("--cp-500",      color.mid);
  el.style.setProperty("--cp-600",      `hsl(${color.hsl})`);
  el.style.setProperty("--cp-text",     color.textOn);
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const GET_SHAPE_EMAIL = "lucas.melo1991@gmail.com";

// ─── Login ─────────────────────────────────────────────────────────────────────

const Login = () => {
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  const navigate    = useNavigate();
  const { toast }   = useToast();

  const [step,    setStep]    = useState<Step>("email");
  const [visible, setVisible] = useState(true);

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [emailLoading, setEmailLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent,    setResetSent]    = useState(false);
  const [redirecting,  setRedirecting]  = useState(false);
  const [slugLoading,  setSlugLoading]  = useState(false);

  const [tenant, setTenant] = useState<TenantBranding | null>(null);

  useEffect(() => {
    // Cor primária vem sempre da org (independente de ser "Get Shape"/is_gs_brand
    // ou não) — antes disso ficava travado em "#d97706" (âmbar) pra qualquer login
    // GS, ignorando o primary_color de verdade da org (ex: Get Shape mudou pra
    // #16a34a e o botão continuava âmbar). Sem org identificada ainda (ou sem
    // primary_color salvo), getColorEntry(null) cai no primeiro item da paleta —
    // Verde Esmeralda #16a34a — que é o verde padrão da própria ORBI.
    const color = getColorEntry(tenant?.primary_color ?? null);
    applyColorVars(color);
    return () => { applyColorVars(getColorEntry("#16a34a")); };
  }, [tenant?.primary_color]);

  useEffect(() => {
    const gsLogin   = email.trim().toLowerCase() === GET_SHAPE_EMAIL
                      || (!!gsOrgSlug && !!tenant && tenant.slug === gsOrgSlug);
    const forceLight = !gsLogin && tenant?.theme === "light";
    if (forceLight) {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
    return () => {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    };
  }, [tenant?.theme, tenant?.slug, email]);

  useEffect(() => {
    if (!orgSlug) return;
    setSlugLoading(true);
    supabase
      .from("organizations")
      .select("name, slug, logo_url, login_logo_url, icon_url, primary_color, theme, is_gs_brand")
      .eq("slug", orgSlug)
      .eq("active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const t = data as TenantBranding;
          setTenant(t);
          if (t.is_gs_brand) {
            localStorage.setItem("gs_org_slug", data.slug);
            localStorage.setItem("gs_org_id",   "");   // filled by TenantContext later
            localStorage.setItem("gs_brand",    "1");
            // Favicon GS: icon_url → logo_url → favicon padrão GS
            applyFavicon(t.icon_url ?? t.logo_url ?? "/favicon-gs.png", "image/png");
            document.title = data.name ?? "Get Shape Training";
          } else {
            // Tenant não-GS: usa icon_url como favicon, ou remove qualquer favicon padrão
            if (t.icon_url) {
              applyFavicon(t.icon_url, "image/png");
            } else {
              removeFavicon();
            }
            document.title = t.name ?? "ORBI Health";
          }
        }
        setSlugLoading(false);
      });
  }, [orgSlug]);

  // ── Favicon dinâmico: detecta slug diretamente na URL (sem DB, sem localStorage) ─
  // useLayoutEffect roda antes do paint → sem flash do favicon errado
  useLayoutEffect(() => {
    const isGS = orgSlug === "getshape"
              || (!!orgSlug && orgSlug === localStorage.getItem("gs_org_slug"));
    if (isGS) {
      applyFavicon("/favicon-gs.png", "image/png");
      document.title = "Get Shape Training";
    }
    return () => {
      applyFavicon("/logos/orbi-logo-icon.svg", "image/svg+xml");
      document.title = "ORBI Health";
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Favicon dinâmico: atualiza quando email GS é reconhecido ao digitar ──────
  // Só age quando não há slug GS na URL (esse caso já foi tratado acima)
  useEffect(() => {
    if (orgSlug === "getshape") return;
    const gsSlug = localStorage.getItem("gs_org_slug");
    if (orgSlug && gsSlug && orgSlug === gsSlug) return;

    if (isGetShapeEmail || isGetShapeTenant) {
      applyFavicon("/favicon-gs.png", "image/png");
      document.title = "Get Shape Training";
    } else if (orgSlug && tenant) {
      // Tenant com slug carregado: icon_url → sem favicon (nunca Orbi como fallback)
      if (tenant.icon_url) {
        applyFavicon(tenant.icon_url, "image/png");
      } else {
        removeFavicon();
      }
      document.title = tenant.name ?? "ORBI Health";
    } else if (!orgSlug) {
      // Login padrão Orbi sem slug — mantém favicon Orbi
      applyFavicon("/logos/orbi-logo-icon.svg", "image/svg+xml");
      document.title = "ORBI Health";
    }
  }, [email, tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setRedirecting(true); redirectUser(session.user.id, session.user.user_metadata); }
    });
  }, []);

  const goToStep = (next: Step) => {
    setVisible(false);
    setTimeout(() => { setStep(next); setVisible(true); }, 200);
  };

  const redirectUser = async (userId: string, userMeta?: Record<string, any>) => {
    // Colaborador: redireciona direto para a org convidada via metadata
    const collabOrgSlug = userMeta?.collab_org_slug as string | undefined;
    if (collabOrgSlug) {
      navigate(`/${collabOrgSlug}/treinador`, { replace: true });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("tipo_usuario").eq("id", userId).maybeSingle();

    if (profileError) {
      toast({ title: "Erro ao carregar perfil", description: "Erro de banco de dados. Tente novamente.", variant: "destructive" });
      setRedirecting(false);
      await supabase.auth.signOut();
      return;
    }

    if (!profile) {
      await new Promise((r) => setTimeout(r, 1200));
      const { data: retry } = await supabase
        .from("profiles").select("tipo_usuario").eq("id", userId).maybeSingle();
      if (!retry) {
        toast({ title: "Perfil nao encontrado", description: "Seu cadastro pode nao ter sido concluido. Contate o suporte.", variant: "destructive" });
        setRedirecting(false);
        await supabase.auth.signOut();
        return;
      }
      return redirectUser(userId, userMeta);
    }

    const { data: member } = await supabase
      .from("organization_members")
      .select("role, organizations(slug)")
      .eq("user_id", userId)
      .maybeSingle();

    const orgSlugFound = (member?.organizations as any)?.slug as string | undefined;
    if (!orgSlugFound) {
      toast({ title: "Organizacao nao encontrada", description: "Seu perfil esta sendo configurado. Aguarde e tente novamente.", variant: "destructive" });
      setRedirecting(false);
      await supabase.auth.signOut();
      return;
    }

    if (profile.tipo_usuario === "treinador") {
      navigate(`/${orgSlugFound}/treinador`, { replace: true });
    } else {
      navigate(`/${orgSlugFound}/aluno`, { replace: true });
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    if (tenant) { goToStep("password"); return; }
    if (!email.trim()) return;
    setEmailLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_tenant_by_email", {
        p_email: email.trim().toLowerCase(),
      });
      if (error) throw error;
      if (!data) { setEmailError("E-mail nao encontrado. Verifique e tente novamente."); return; }
      setTenant(data as TenantBranding);
      goToStep("password");
    } catch {
      setEmailError("E-mail nao encontrado. Verifique e tente novamente.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const isNotConfirmed = error.message?.toLowerCase().includes("not confirmed") || error.message?.toLowerCase().includes("email");
        toast({
          title: isNotConfirmed ? "E-mail não confirmado" : "Senha incorreta",
          description: isNotConfirmed
            ? "Confirme seu e-mail antes de entrar, ou peça ao administrador para desativar a confirmação."
            : "Verifique sua senha e tente novamente.",
          variant: "destructive",
        });
        return;
      }
      if (data.user) { setRedirecting(true); await redirectUser(data.user.id, data.user.user_metadata); }
    } catch (err: any) {
      toast({ title: "Erro no login", description: err.message, variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      toast({ title: "Erro ao enviar e-mail", description: err.message, variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  // Detecta branding Get Shape em duas camadas:
  // 1. E-mail digitado é o do owner (lucas) → resposta imediata ao digitar
  // 2. Tenant carregado tem o slug da org Get Shape → cobre alunos e outros usuários
  const isGetShapeEmail   = email.trim().toLowerCase() === GET_SHAPE_EMAIL;
  const gsOrgSlug         = localStorage.getItem("gs_org_slug");
  const isGetShapeTenant  = !!gsOrgSlug && !!tenant && tenant.slug === gsOrgSlug;
  const isGetShapeLogin   = isGetShapeEmail || isGetShapeTenant;
  const isGetShape        = !!tenant && isGetShapeLogin;

  // Só assume o branding próprio da org quando ela configurou uma logo em
  // Configurações — sem logo, mantém o visual padrão ORBI (mesmo com org resolvida).
  const hasCustomBranding = !!tenant?.logo_url;

  // Tema do tenant: aplica sempre que a org foi resolvida (via slug na URL OU
  // via busca por e-mail) e tem logo própria (incluindo GS brand). Não checar
  // orgSlug aqui — senão o tema da org é ignorado no fluxo de login por e-mail
  // (sem slug na URL), caindo incorretamente no fundo claro padrão.
  const isOrgDark  = !!tenant && hasCustomBranding && tenant.theme === "dark";
  // Antes só ativava com logo de cabeçalho própria (hasCustomBranding) —
  // orgs usando só a logo de login (login_logo_url, sem logo_url) nunca
  // conseguiam sair do visual escuro padrão da ORBI, mesmo com o tema
  // configurado como "light" em Configurações. Agora qualquer org com
  // tenant resolvido segue o próprio tema.
  const isOrgLight = !!tenant && tenant.theme === "light";

  // Login padrão ORBI (sem tenant resolvido ou sem logo própria) usa o mesmo visual dark do cadastro
  const useDarkTheme = isOrgDark || !hasCustomBranding;

  if (redirecting || slugLoading) return <SplashScreen isGetShape={isGetShapeLogin} iconUrl={tenant?.icon_url ?? null} />;

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <>

      {/* ==================================================================
          LAYOUT MOBILE — exibido apenas em telas < md
          Mantido EXATAMENTE como estava — nenhuma alteracao
      ================================================================== */}
      <div className="md:hidden min-h-screen w-full flex flex-col" style={{ backgroundColor: isOrgLight ? "#F4F6F4" : "#0A0A0A" }}>

        {/* TOPO — fundo na cor do tenant (preto para Get Shape) */}
        <div
          className="relative flex-none flex items-center justify-center overflow-hidden"
          style={{ height: "48vh", background: isGetShapeLogin ? "#0A0A0A" : "var(--cp-gradient)" }}
        >
          {/* Brilho interno */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 42%, rgba(255,255,255,0.13) 0%, transparent 65%)",
            }}
          />
          {/* Fusao gradiente → fundo da pagina */}
          <div
            aria-hidden
            className="absolute bottom-0 left-0 right-0 pointer-events-none"
            style={{
              height: "68%",
              background: isOrgLight
                ? "linear-gradient(to bottom, transparent 0%, rgba(244,246,244,0.55) 45%, #F4F6F4 80%, #F4F6F4 100%)"
                : "linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.55) 45%, #0A0A0A 80%, #0A0A0A 100%)",
            }}
          />
          {/* Logo */}
          <div className="relative z-10 px-10 text-center select-none">
            {tenant?.logo_url ? (
              <img src={tenant.login_logo_url ?? tenant.logo_url} alt={tenant.name} style={{ maxHeight: 170, maxWidth: 320, objectFit: "contain", display: "block", margin: "0 auto" }} />
            ) : isGetShapeLogin ? (
              <img src="/logo-gs.png" alt="Get Shape Training" className="h-28 mx-auto object-contain" />
            ) : (
              <img src="/logos/orbi-logo-vertical-white.svg" alt="ORBI" className="w-[230px] h-auto" />
            )}
          </div>
        </div>

        {/* BASE — fundo preto + formulario */}
        <div className="flex-1 flex flex-col px-6 pb-10">
          <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
            <div style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }} className="flex-1 flex flex-col">

              <h2 className={`text-[1.75rem] font-bold tracking-tight mb-1 mt-3 ${isOrgLight ? "text-gray-900" : "text-white"}`}>
                {step === "email"    && "Acesse sua conta"}
                {step === "password" && "Sua senha"}
                {step === "forgot"   && "Recuperar acesso"}
              </h2>
              <p className="text-sm mb-7" style={{ color: isOrgLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.38)" }}>
                {step === "email"    && "Entre com seu e-mail para continuar"}
                {step === "password" && email}
                {step === "forgot"   && "Enviaremos um link de recuperacao"}
              </p>

              {/* Email */}
              {step === "email" && (
                <form onSubmit={handleEmailContinue} className="flex flex-col gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: isOrgLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)" }}>E-mail</label>
                    <Input
                      type="email" value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                      required autoFocus placeholder="Digite seu e-mail"
                      className={[
                        "h-13 rounded-xl text-sm border transition-all duration-200",
                        "focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-primary/25",
                        isOrgLight
                          ? (emailError ? "border-red-300 bg-red-50 text-gray-900 placeholder:text-gray-300" : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus-visible:border-primary/40")
                          : (emailError ? "border-red-500/40 bg-red-500/[0.06] text-white placeholder:text-white/25" : "border-white/[0.1] bg-[#111111] text-white placeholder:text-white/25 focus-visible:border-primary/40"),
                      ].join(" ")}
                    />
                    {emailError && <p className="text-xs px-0.5" style={{ color: "rgba(248,113,113,0.9)" }}>{emailError}</p>}
                  </div>
                  <div className="pt-2">
                    <button type="submit" disabled={emailLoading}
                      className="w-full h-14 rounded-2xl font-semibold text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ background: "var(--cp-gradient)", color: "var(--cp-text)", boxShadow: "0 0 24px rgba(var(--cp-rgb), 0.28), 0 4px 12px rgba(var(--cp-rgb), 0.15)" }}>
                      {emailLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : "Continuar"}
                    </button>
                  </div>
                </form>
              )}

              {/* Senha */}
              {step === "password" && (
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: isOrgLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)" }}>Senha</label>
                    <Input
                      type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required autoFocus placeholder="Digite sua senha" minLength={6}
                      className={`h-13 rounded-xl text-sm border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-primary/25 focus-visible:border-primary/40 ${isOrgLight ? "text-gray-900 bg-white border-gray-200 placeholder:text-gray-300" : "text-white border-white/[0.1] bg-[#111111] placeholder:text-white/25"}`}
                    />
                    <div className="flex justify-end pt-1">
                      <button type="button" onClick={() => goToStep("forgot")}
                        className="text-sm font-medium transition-opacity hover:opacity-75"
                        style={{ color: "hsl(var(--primary))" }}>
                        Esqueci minha senha
                      </button>
                    </div>
                  </div>
                  <div className="pt-2">
                    <button type="submit" disabled={loginLoading}
                      className="w-full h-14 rounded-2xl font-semibold text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ background: "var(--cp-gradient)", color: "var(--cp-text)", boxShadow: "0 0 24px rgba(var(--cp-rgb), 0.28), 0 4px 12px rgba(var(--cp-rgb), 0.15)" }}>
                      {loginLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : "Entrar"}
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button type="button" onClick={() => goToStep("email")}
                      className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-75"
                      style={{ color: isOrgLight ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.38)" }}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                    </button>
                  </div>
                </form>
              )}

              {/* Forgot */}
              {step === "forgot" && (
                <>
                  {!resetSent ? (
                    <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                      <p className="text-sm leading-relaxed" style={{ color: isOrgLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)" }}>
                        Enviaremos um link para{" "}
                        <span className="font-medium" style={{ color: isOrgLight ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)" }}>{email}</span>
                      </p>
                      <div className="pt-2">
                        <button type="submit" disabled={resetLoading}
                          className="w-full h-14 rounded-2xl font-semibold text-base transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          style={{ background: "var(--cp-gradient)", color: "var(--cp-text)", boxShadow: "0 0 24px rgba(var(--cp-rgb), 0.28), 0 4px 12px rgba(var(--cp-rgb), 0.15)" }}>
                          {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : "Enviar link de recuperacao"}
                        </button>
                      </div>
                      <div className="flex justify-center">
                        <button type="button" onClick={() => goToStep("password")}
                          className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-75"
                          style={{ color: isOrgLight ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.38)" }}>
                          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-5">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: "rgba(var(--cp-rgb), 0.12)", border: "1px solid rgba(var(--cp-rgb), 0.25)" }}>
                        <Mail className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
                      </div>
                      <div>
                        <h3 className={`font-semibold text-lg ${isOrgLight ? "text-gray-900" : "text-white"}`}>E-mail enviado!</h3>
                        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: isOrgLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)" }}>
                          Verifique sua caixa de entrada em{" "}
                          <span style={{ color: isOrgLight ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)" }}>{email}</span>
                        </p>
                      </div>
                      <button type="button" onClick={() => goToStep("password")}
                        className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-75"
                        style={{ color: isOrgLight ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.38)" }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="flex-1" />

              {/* Rodape mobile */}
              <div className="flex items-center justify-between pt-5" style={{ borderTop: `1px solid ${isOrgLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)"}` }}>
                <span className="text-[10px] uppercase tracking-[0.15em] select-none" style={{ color: isOrgLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)" }}>
                  {tenant ? "Powered by ORBI Health" : "ORBI Health"}
                </span>
                {!tenant && (
                  <Link to="/planos" className="text-sm font-medium transition-opacity hover:opacity-75" style={{ color: "hsl(var(--primary))" }}>
                    Criar conta
                  </Link>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================
          LAYOUT DESKTOP — exibido apenas em telas >= md
          Card centralizado em fundo claro, estilo clean/profissional
      ================================================================== */}
      <div
        className="hidden md:flex flex-col min-h-screen w-full items-center justify-center px-4 relative overflow-hidden"
        style={{ backgroundColor: !hasCustomBranding ? "#050505" : isOrgDark ? "#09090b" : "#F4F6F4" }}
      >
          {/* Brilho ambiente — segue a cor primária já resolvida (org detectada pelo e-mail);
              cai pro verde ORBI padrão só no estado genérico, sem org/cor ainda identificada */}
          {!hasCustomBranding && (
            <>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 60% 45% at 20% 15%, rgba(var(--cp-rgb, 34,197,94),0.16) 0%, transparent 65%)" }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 55% 45% at 85% 90%, rgba(var(--cp-rgb, 22,163,74),0.18) 0%, transparent 65%)" }}
              />
            </>
          )}

          {/* Logo acima do card — aneis orbitais concentricos ao fundo */}
          <div className="relative flex justify-center mb-8">

            {/* Aneis orbitais — referencia ao emblema ORBI, tecnologia + saude */}
            <svg
              aria-hidden
              className="absolute pointer-events-none"
              style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", overflow: "visible" }}
              width="0" height="0"
              viewBox="0 0 0 0"
            >
              <circle cx="0" cy="0" r="75"  fill="none" stroke="hsl(var(--primary))" strokeWidth="0.8" opacity="0.18" />
              <circle cx="0" cy="0" r="108" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.7" opacity="0.12" />
              <circle cx="0" cy="0" r="148" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.6" opacity="0.08" />
              <circle cx="0" cy="0" r="195" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.05" />
            </svg>

            {tenant?.logo_url ? (
              <img src={tenant.login_logo_url ?? tenant.logo_url} alt={tenant.name} className="relative object-contain" style={{ maxHeight: 170, maxWidth: 320 }} />
            ) : isGetShapeLogin ? (
              <img src="/logo-full.png" alt="Get Shape Training" className="relative h-[90px] w-auto object-contain" />
            ) : (
              <img src="/logos/orbi-logo-vertical-dark.svg" alt="ORBI" className="relative h-24 w-auto" />
            )}
          </div>

        <div
          className={`relative w-full max-w-[420px] rounded-2xl px-10 py-12${useDarkTheme ? " border border-white/6" : ""}`}
          style={{
            backgroundColor: !hasCustomBranding ? "#111814" : isOrgDark ? "#111111" : "#ffffff",
            boxShadow: useDarkTheme
              ? "0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)"
              : "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
          }}
        >

          {/* Fade entre etapas */}
          <div style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}>

            {/* Cabecalho */}
            <div className="mb-6">
              <h2 className={`text-xl font-bold tracking-tight ${useDarkTheme ? "text-white" : "text-gray-900"}`}>
                {step === "email"    && "Acesse sua conta"}
                {step === "password" && "Sua senha"}
                {step === "forgot"   && "Recuperar acesso"}
              </h2>
              <p className={`text-sm mt-1 ${useDarkTheme ? "text-white/40" : "text-gray-400"}`}>
                {step === "email"    && "Entre com seu e-mail para continuar"}
                {step === "password" && email}
                {step === "forgot"   && "Enviaremos um link de recuperacao"}
              </p>
            </div>

            {/* Email */}
            {step === "email" && (
              <form onSubmit={handleEmailContinue} className="space-y-3">
                <div className="space-y-1.5">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${useDarkTheme ? "text-white/50" : "text-gray-400"}`}>E-mail</label>
                  <Input
                    type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                    required autoFocus placeholder="Digite seu e-mail"
                    className={[
                      "h-12 rounded-xl text-sm border",
                      "transition-all focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/50",
                      useDarkTheme
                        ? (emailError ? "border-red-500/40 bg-white/5 text-white placeholder:text-white/25" : "border-white/10 bg-white/5 text-white placeholder:text-white/25")
                        : (emailError ? "border-red-300 text-gray-900 bg-white placeholder:text-gray-300" : "border-gray-200 text-gray-900 bg-white placeholder:text-gray-300"),
                    ].join(" ")}
                  />
                  {emailError && <p className="text-xs text-red-500 px-0.5">{emailError}</p>}
                </div>
                <div className="pt-1">
                  <button type="submit" disabled={emailLoading}
                    className="w-full h-12 rounded-xl font-semibold text-sm text-white transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: "var(--cp-gradient)" }}>
                    {emailLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : "Continuar"}
                  </button>
                </div>
              </form>
            )}

            {/* Senha */}
            {step === "password" && (
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1.5">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${useDarkTheme ? "text-white/50" : "text-gray-400"}`}>Senha</label>
                  <Input
                    type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required autoFocus placeholder="Digite sua senha" minLength={6}
                    className={`h-12 rounded-xl text-sm border transition-all focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/50 ${useDarkTheme ? "text-white bg-white/5 border-white/10 placeholder:text-white/25" : "text-gray-900 bg-white border-gray-200 placeholder:text-gray-300"}`}
                  />
                  <div className="flex justify-end pt-0.5">
                    <button type="button" onClick={() => goToStep("forgot")}
                      className="text-sm font-medium transition-opacity hover:opacity-75"
                      style={{ color: "hsl(var(--primary))" }}>
                      Esqueci minha senha
                    </button>
                  </div>
                </div>
                <div className="pt-1">
                  <button type="submit" disabled={loginLoading}
                    className="w-full h-12 rounded-xl font-semibold text-sm text-white transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: "var(--cp-gradient)" }}>
                    {loginLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : "Entrar"}
                  </button>
                </div>
                <div className="flex justify-center pt-1">
                  <button type="button" onClick={() => goToStep("email")}
                    className={`flex items-center gap-1.5 text-sm transition-colors hover:opacity-75 ${useDarkTheme ? "text-white/40" : "text-gray-400"}`}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                  </button>
                </div>
              </form>
            )}

            {/* Forgot */}
            {step === "forgot" && (
              <>
                {!resetSent ? (
                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <p className={`text-sm leading-relaxed ${useDarkTheme ? "text-white/50" : "text-gray-500"}`}>
                      Enviaremos um link para{" "}
                      <span className={`font-medium ${useDarkTheme ? "text-white/80" : "text-gray-800"}`}>{email}</span>
                    </p>
                    <div className="pt-1">
                      <button type="submit" disabled={resetLoading}
                        className="w-full h-12 rounded-xl font-semibold text-sm text-white transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{ background: "var(--cp-gradient)" }}>
                        {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : "Enviar link de recuperacao"}
                      </button>
                    </div>
                    <div className="flex justify-center pt-1">
                      <button type="button" onClick={() => goToStep("password")}
                        className={`flex items-center gap-1.5 text-sm transition-colors hover:opacity-75 ${useDarkTheme ? "text-white/40" : "text-gray-400"}`}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(var(--cp-rgb), 0.08)", border: "1px solid rgba(var(--cp-rgb), 0.2)" }}>
                      <Mail className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
                    </div>
                    <div>
                      <h3 className={`font-semibold ${useDarkTheme ? "text-white" : "text-gray-900"}`}>E-mail enviado!</h3>
                      <p className={`text-sm mt-1 leading-relaxed ${useDarkTheme ? "text-white/50" : "text-gray-500"}`}>
                        Verifique sua caixa de entrada em{" "}
                        <span className={`font-medium ${useDarkTheme ? "text-white/70" : "text-gray-700"}`}>{email}</span>
                      </p>
                    </div>
                    <button type="button" onClick={() => goToStep("password")}
                      className={`flex items-center gap-1.5 text-sm transition-colors hover:opacity-75 ${useDarkTheme ? "text-white/40" : "text-gray-400"}`}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rodape desktop */}
          <div className={`mt-8 pt-6 flex items-center justify-between ${useDarkTheme ? "border-t border-white/8" : "border-t border-gray-100"}`}>
            <span className={`text-[10px] uppercase tracking-[0.15em] select-none ${useDarkTheme ? "text-white/20" : "text-gray-300"}`}>
              {tenant ? "Powered by ORBI Health" : "ORBI Health"}
            </span>
            {!tenant && (
              <Link to="/planos" className="text-sm font-medium transition-opacity hover:opacity-75"
                style={{ color: "hsl(var(--primary))" }}>
                Criar conta
              </Link>
            )}
          </div>

        </div>
      </div>

    </>
  );
};

export default Login;
