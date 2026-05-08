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

import { useState, useEffect } from "react";
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
  primary_color: string | null;
  theme: "dark" | "light";
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
    const gsLogin  = email.trim().toLowerCase() === GET_SHAPE_EMAIL
                     || (!!gsOrgSlug && !!tenant && tenant.slug === gsOrgSlug);
    const colorHex = gsLogin ? "#d97706" : (tenant?.primary_color ?? null);
    const color    = getColorEntry(colorHex);
    applyColorVars(color);
    return () => { applyColorVars(getColorEntry("#16a34a")); };
  }, [tenant?.primary_color, tenant?.slug, email]);

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
      .select("name, slug, logo_url, primary_color, theme")
      .eq("slug", orgSlug)
      .eq("active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTenant(data as TenantBranding);
        setSlugLoading(false);
      });
  }, [orgSlug]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setRedirecting(true); redirectUser(session.user.id); }
    });
  }, []);

  const goToStep = (next: Step) => {
    setVisible(false);
    setTimeout(() => { setStep(next); setVisible(true); }, 200);
  };

  const redirectUser = async (userId: string) => {
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
      return redirectUser(userId);
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
        toast({ title: "Senha incorreta", description: "Verifique sua senha e tente novamente.", variant: "destructive" });
        return;
      }
      if (data.user) { setRedirecting(true); await redirectUser(data.user.id); }
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

  if (redirecting || slugLoading) return <SplashScreen isGetShape={isGetShapeLogin} />;

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <>

      {/* ==================================================================
          LAYOUT MOBILE — exibido apenas em telas < md
          Mantido EXATAMENTE como estava — nenhuma alteracao
      ================================================================== */}
      <div className="md:hidden min-h-screen w-full flex flex-col" style={{ backgroundColor: "#0A0A0A" }}>

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
          {/* Fusao gradiente → preto */}
          <div
            aria-hidden
            className="absolute bottom-0 left-0 right-0 pointer-events-none"
            style={{
              height: "68%",
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.55) 45%, #0A0A0A 80%, #0A0A0A 100%)",
            }}
          />
          {/* Logo */}
          <div className="relative z-10 px-10 text-center select-none">
            {isGetShapeLogin ? (
              <img src="/logo-gs.png" alt="Get Shape Training" className="h-28 mx-auto object-contain" />
            ) : tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-20 max-w-[200px] mx-auto object-contain" />
            ) : tenant ? (
              <span className="text-4xl font-black tracking-tight text-white leading-tight">{tenant.name}</span>
            ) : (
              <img src="/logos/orbi-logo-vertical-white.svg" alt="ORBI" className="w-[230px] h-auto" />
            )}
          </div>
        </div>

        {/* BASE — fundo preto + formulario */}
        <div className="flex-1 flex flex-col px-6 pb-10">
          <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
            <div style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }} className="flex-1 flex flex-col">

              <h2 className="text-[1.75rem] font-bold text-white tracking-tight mb-1 mt-3">
                {step === "email"    && "Acesse sua conta"}
                {step === "password" && "Sua senha"}
                {step === "forgot"   && "Recuperar acesso"}
              </h2>
              <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.38)" }}>
                {step === "email"    && "Entre com seu e-mail para continuar"}
                {step === "password" && email}
                {step === "forgot"   && "Enviaremos um link de recuperacao"}
              </p>

              {/* Email */}
              {step === "email" && (
                <form onSubmit={handleEmailContinue} className="flex flex-col gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>E-mail</label>
                    <Input
                      type="email" value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                      required autoFocus placeholder="Digite seu e-mail"
                      className={[
                        "h-13 rounded-xl text-sm text-white placeholder:text-white/25 border transition-all duration-200",
                        "focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-primary/25",
                        emailError
                          ? "border-red-500/40 bg-red-500/[0.06]"
                          : "border-white/[0.1] bg-[#111111] focus-visible:border-primary/40",
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
                    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>Senha</label>
                    <Input
                      type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required autoFocus placeholder="Digite sua senha" minLength={6}
                      className="h-13 rounded-xl text-sm text-white border border-white/[0.1] bg-[#111111] placeholder:text-white/25 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-primary/25 focus-visible:border-primary/40"
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
                      className="flex items-center gap-1.5 text-sm transition-colors hover:text-white/60"
                      style={{ color: "rgba(255,255,255,0.38)" }}>
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
                      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Enviaremos um link para{" "}
                        <span className="font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>{email}</span>
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
                          className="flex items-center gap-1.5 text-sm transition-colors hover:text-white/60"
                          style={{ color: "rgba(255,255,255,0.38)" }}>
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
                        <h3 className="text-white font-semibold text-lg">E-mail enviado!</h3>
                        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                          Verifique sua caixa de entrada em{" "}
                          <span style={{ color: "rgba(255,255,255,0.7)" }}>{email}</span>
                        </p>
                      </div>
                      <button type="button" onClick={() => goToStep("password")}
                        className="flex items-center gap-1.5 text-sm transition-colors hover:text-white/60"
                        style={{ color: "rgba(255,255,255,0.38)" }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="flex-1" />

              {/* Rodape mobile */}
              <div className="flex items-center justify-between pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="text-[10px] uppercase tracking-[0.15em] select-none" style={{ color: "rgba(255,255,255,0.15)" }}>
                  {tenant ? "Powered by ORBI Health" : "ORBI Pro"}
                </span>
                {!tenant && (
                  <Link to="/assinar" className="text-sm font-medium transition-opacity hover:opacity-75" style={{ color: "hsl(var(--primary))" }}>
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
        className="hidden md:flex flex-col min-h-screen w-full items-center justify-center px-4"
        style={{ backgroundColor: "#F4F6F4" }}
      >
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

            {isGetShapeLogin ? (
              <img src="/logo-gs.png" alt="Get Shape Training" className="relative h-[90px] w-auto object-contain" style={{ filter: "brightness(0)" }} />
            ) : tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="relative h-[70px] object-contain" />
            ) : tenant ? (
              <span className="relative text-2xl font-black tracking-tight text-gray-900">{tenant.name}</span>
            ) : (
              <img src="/logos/orbi-logo-vertical-light.svg" alt="ORBI" className="relative h-[107px] w-auto" />
            )}
          </div>

        <div
          className="w-full max-w-[420px] bg-white rounded-2xl px-10 py-12"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)" }}
        >

          {/* Fade entre etapas */}
          <div style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}>

            {/* Cabecalho */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                {step === "email"    && "Acesse sua conta"}
                {step === "password" && "Sua senha"}
                {step === "forgot"   && "Recuperar acesso"}
              </h2>
              <p className="text-sm mt-1 text-gray-400">
                {step === "email"    && "Entre com seu e-mail para continuar"}
                {step === "password" && email}
                {step === "forgot"   && "Enviaremos um link de recuperacao"}
              </p>
            </div>

            {/* Email */}
            {step === "email" && (
              <form onSubmit={handleEmailContinue} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">E-mail</label>
                  <Input
                    type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                    required autoFocus placeholder="Digite seu e-mail"
                    className={[
                      "h-12 rounded-xl text-sm text-gray-900 bg-white border placeholder:text-gray-300",
                      "transition-all focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/50",
                      emailError ? "border-red-300" : "border-gray-200",
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Senha</label>
                  <Input
                    type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required autoFocus placeholder="Digite sua senha" minLength={6}
                    className="h-12 rounded-xl text-sm text-gray-900 bg-white border border-gray-200 placeholder:text-gray-300 transition-all focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:border-primary/50"
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
                    className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600">
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
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Enviaremos um link para{" "}
                      <span className="font-medium text-gray-800">{email}</span>
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
                        className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600">
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
                      <h3 className="font-semibold text-gray-900">E-mail enviado!</h3>
                      <p className="text-sm mt-1 text-gray-500 leading-relaxed">
                        Verifique sua caixa de entrada em{" "}
                        <span className="font-medium text-gray-700">{email}</span>
                      </p>
                    </div>
                    <button type="button" onClick={() => goToStep("password")}
                      className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600">
                      <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rodape desktop */}
          <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.15em] text-gray-300 select-none">
              {tenant ? "Powered by ORBI Health" : "ORBI Pro"}
            </span>
            {!tenant && (
              <Link to="/assinar" className="text-sm font-medium transition-opacity hover:opacity-75"
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
