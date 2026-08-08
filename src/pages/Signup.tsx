import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Moon, Sun, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

const RESERVED_SLUGS = new Set([
  "auth", "api", "admin", "app", "login", "cadastro", "signup",
  "www", "supabase", "treinador", "aluno", "dashboard", "config",
  "settings", "perfil", "profile", "teste", "test", "demo",
  "planos", "assinar", "entrar",
]);

const slugify = (text: string): string => {
  const result = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45);
  return result || "meu-perfil";
};

const isValidSlug = (slug: string): boolean =>
  /^[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]$/.test(slug) &&
  !RESERVED_SLUGS.has(slug);

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const planoParam = searchParams.get("plano");
  const planType: "motion" | "pro" = planoParam === "pro" ? "pro" : "motion";
  const alunosParam = searchParams.get("alunos");
  const alunosTier: "50" | "ilimitado" = alunosParam === "ilimitado" ? "ilimitado" : "50";

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");

  // Step 2
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loading, setLoading] = useState(false);

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugManuallyEdited) {
      const generated = slugify(value);
      setSlug(generated);
      setSlugAvailable(null);
      if (generated.length >= 3) checkSlug(generated);
    }
  };

  const handleSlugChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(clean);
    setSlugManuallyEdited(true);
    setSlugAvailable(null);
    if (clean.length >= 3) checkSlug(clean);
  };

  const checkSlug = async (s: string) => {
    if (!isValidSlug(s)) { setSlugAvailable(false); return; }
    setCheckingSlug(true);
    try {
      const { data } = await supabase.from("organizations").select("id").eq("slug", s).maybeSingle();
      setSlugAvailable(data === null);
    } catch {
      setSlugAvailable(null);
    } finally {
      setCheckingSlug(false);
    }
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (!orgName) {
      const generated = slugify(nome);
      setOrgName(nome);
      setSlug(generated);
      if (generated.length >= 3) checkSlug(generated);
    }
    setStep(2);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidSlug(slug)) {
      toast({ title: "Slug inválido", description: "Use apenas letras, números e hífens (3-50 caracteres).", variant: "destructive" });
      return;
    }
    if (slugAvailable === false) {
      toast({ title: "URL já em uso", description: "Escolha outro endereço de perfil.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-trainer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email,
            password,
            nome,
            whatsapp,
            org_name: orgName || nome,
            slug,
            theme,
            primary_color: "#16a34a",
            plan_type: planType,
            alunos_tier: alunosTier,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao criar conta");

      // Cria conta já confirmada — agora estabelece a sessão via login
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;

      toast({ title: "Conta criada com sucesso!", description: `Seu perfil estará em /${slug}` });
      navigate(`/${slug}/treinador`);
    } catch (err: any) {
      toast({ title: "Erro ao criar conta", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#050505" }}
    >
      {/* Ambient green glow, landing-page style */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 45% at 20% 15%, rgba(34,197,94,0.16) 0%, transparent 65%)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 45% at 85% 90%, rgba(22,163,74,0.18) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-5">
          <img src="/logos/orbi-logo-vertical-dark.svg" alt="ORBI" className="h-24 w-auto object-contain drop-shadow-lg" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4 justify-center">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                style={
                  step === s
                    ? { background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }
                    : s < step
                    ? { background: "rgba(22,163,74,0.15)", color: "#4ade80", border: "1px solid rgba(22,163,74,0.3)" }
                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.1)" }
                }
              >
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 2 && (
                <div
                  className="w-14 h-px transition-all duration-300"
                  style={{ background: step > s ? "rgba(22,163,74,0.4)" : "rgba(255,255,255,0.1)" }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "#111814",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
          }}
        >

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div className="mb-4">
                <h1 className="text-xl font-bold text-white tracking-tight">Criar sua conta</h1>
                <p className="text-sm text-white/40 mt-1">14 dias grátis. Depois, só R$5 no primeiro mês no Cartão (PIX no valor integral).</p>
              </div>

              <form onSubmit={handleStep1} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                    Nome completo
                  </label>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    autoFocus
                    placeholder="Ex: Lucas Silva"
                    className="h-11 rounded-xl text-sm border border-white/10 bg-white/[0.04] text-white placeholder:text-white/20 focus-visible:border-green-600/50 focus-visible:ring-1 focus-visible:ring-green-600/20 focus-visible:ring-offset-0"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                    E-mail
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                    className="h-11 rounded-xl text-sm border border-white/10 bg-white/[0.04] text-white placeholder:text-white/20 focus-visible:border-green-600/50 focus-visible:ring-1 focus-visible:ring-green-600/20 focus-visible:ring-offset-0"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                    WhatsApp <span className="text-white/20 normal-case font-normal">(opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30 pointer-events-none select-none">
                      🇧🇷 +55
                    </span>
                    <Input
                      type="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="h-11 rounded-xl text-sm border border-white/10 bg-white/[0.04] text-white placeholder:text-white/20 pl-16 focus-visible:border-green-600/50 focus-visible:ring-1 focus-visible:ring-green-600/20 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                    Senha
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    className="h-11 rounded-xl text-sm border border-white/10 bg-white/[0.04] text-white placeholder:text-white/20 focus-visible:border-green-600/50 focus-visible:ring-1 focus-visible:ring-green-600/20 focus-visible:ring-offset-0"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-11 rounded-xl font-semibold text-white text-sm mt-2 transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 20px rgba(22,163,74,0.3)" }}
                >
                  Continuar
                </button>
              </form>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div className="mb-4">
                <h1 className="text-xl font-bold text-white tracking-tight">Seu perfil profissional</h1>
                <p className="text-sm text-white/40 mt-1">Como seus alunos vão te encontrar</p>
              </div>

              <form onSubmit={handleSignup} className="space-y-3">

                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                    Nome da academia ou programa
                  </label>
                  <Input
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    required
                    autoFocus
                    placeholder="Ex: Lucas Fit, Studio Ana"
                    className="h-11 rounded-xl text-sm border border-white/10 bg-white/[0.04] text-white placeholder:text-white/20 focus-visible:border-green-600/50 focus-visible:ring-1 focus-visible:ring-green-600/20 focus-visible:ring-offset-0"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
                    Endereço do seu app
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/25 pointer-events-none select-none">
                      orbihealth.com.br/
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      required
                      placeholder="lucas-fit"
                      className="h-12 rounded-xl text-sm border bg-white/[0.04] text-white placeholder:text-white/20 pl-[148px] pr-10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-green-600/20"
                      style={{
                        borderColor: slug.length >= 3
                          ? slugAvailable === true ? "rgba(34,197,94,0.4)"
                          : slugAvailable === false ? "rgba(239,68,68,0.4)"
                          : "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.08)",
                      }}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {checkingSlug && <Loader2 className="w-4 h-4 text-white/30 animate-spin" />}
                      {!checkingSlug && slug.length >= 3 && slugAvailable === true && <Check className="w-4 h-4 text-green-400" />}
                      {!checkingSlug && slug.length >= 3 && slugAvailable === false && <AlertCircle className="w-4 h-4 text-red-400" />}
                    </div>
                  </div>
                  {slug.length >= 3 && slugAvailable === true && (
                    <p className="text-xs text-green-400 mt-1.5">Disponível!</p>
                  )}
                  {slug.length >= 3 && slugAvailable === false && (
                    <p className="text-xs text-red-400 mt-1.5">
                      {!isValidSlug(slug) ? "Use apenas letras minúsculas, números e hífens" : "Este endereço já está em uso"}
                    </p>
                  )}
                </div>

                {/* Tema */}
                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
                    Tema do app
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Dark */}
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className="relative rounded-xl overflow-hidden transition-all duration-200"
                      style={{
                        border: theme === "dark" ? "2px solid rgba(34,197,94,0.6)" : "2px solid rgba(255,255,255,0.08)",
                        boxShadow: theme === "dark" ? "0 0 16px rgba(34,197,94,0.15)" : "none",
                      }}
                    >
                      <div className="bg-zinc-950 p-3 h-20 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <div className="h-1.5 w-10 bg-white/15 rounded-full" />
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-white/8 rounded-full" />
                          <div className="h-1.5 w-2/3 bg-white/8 rounded-full" />
                        </div>
                        <div className="h-4 w-full rounded-md bg-green-600/70" />
                      </div>
                      <div
                        className="py-1.5 text-center text-xs font-medium flex items-center justify-center gap-1.5"
                        style={theme === "dark"
                          ? { background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff" }
                          : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}
                      >
                        <Moon className="w-3 h-3" /> Dark
                        {theme === "dark" && <Check className="w-3 h-3" />}
                      </div>
                    </button>

                    {/* Light */}
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className="relative rounded-xl overflow-hidden transition-all duration-200"
                      style={{
                        border: theme === "light" ? "2px solid rgba(34,197,94,0.6)" : "2px solid rgba(255,255,255,0.08)",
                        boxShadow: theme === "light" ? "0 0 16px rgba(34,197,94,0.15)" : "none",
                      }}
                    >
                      <div className="bg-white p-3 h-20 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-600" />
                          <div className="h-1.5 w-10 bg-zinc-200 rounded-full" />
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-zinc-100 rounded-full" />
                          <div className="h-1.5 w-2/3 bg-zinc-100 rounded-full" />
                        </div>
                        <div className="h-4 w-full rounded-md bg-green-600/70" />
                      </div>
                      <div
                        className="py-1.5 text-center text-xs font-medium flex items-center justify-center gap-1.5"
                        style={theme === "light"
                          ? { background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff" }
                          : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}
                      >
                        <Sun className="w-3 h-3" /> Light
                        {theme === "light" && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mt-2">Pode ser alterado depois nas configurações</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center justify-center gap-1.5 h-12 px-5 rounded-xl text-sm text-white/40 hover:text-white/70 transition-colors border border-white/10 hover:border-white/20"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || slugAvailable === false || checkingSlug}
                    className="flex-1 h-12 rounded-xl font-semibold text-white text-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 20px rgba(22,163,74,0.3)" }}
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : "Criar conta"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/80 text-xs mt-4">
          Já tem conta?{" "}
          <Link to="/entrar" className="font-semibold text-white hover:text-emerald-100 transition-colors">
            Fazer login
          </Link>
        </p>

      </div>
    </div>
  );
};

export default Signup;
