import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Moon, Sun, AlertCircle, Loader2 } from "lucide-react";

// ----------------------------------------------------------------
// Slugs reservados — não podem ser usados como URL de perfil
// ----------------------------------------------------------------
const RESERVED_SLUGS = new Set([
  "auth", "api", "admin", "app", "login", "cadastro", "signup",
  "www", "supabase", "treinador", "aluno", "dashboard", "config",
  "settings", "perfil", "profile", "teste", "test", "demo",
]);

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45) || "meu-perfil";

const isValidSlug = (slug: string): boolean =>
  /^[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]$/.test(slug) &&
  !RESERVED_SLUGS.has(slug);

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------
const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1); // 1 = dados pessoais, 2 = perfil da org

  // Step 1 — dados do treinador
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 — perfil da org
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [loading, setLoading] = useState(false);

  // ── Quando o nome da org muda, auto-gera o slug (se não editado manualmente)
  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugManuallyEdited) {
      const generated = slugify(value);
      setSlug(generated);
      setSlugAvailable(null);
      if (generated.length >= 3) checkSlug(generated);
    }
  };

  // ── Validação em tempo real do slug
  const handleSlugChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(clean);
    setSlugManuallyEdited(true);
    setSlugAvailable(null);
    if (clean.length >= 3) checkSlug(clean);
  };

  const checkSlug = async (s: string) => {
    if (!isValidSlug(s)) {
      setSlugAvailable(false);
      return;
    }
    setCheckingSlug(true);
    try {
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", s)
        .maybeSingle();
      setSlugAvailable(data === null);
    } catch {
      setSlugAvailable(null);
    } finally {
      setCheckingSlug(false);
    }
  };

  // ── Step 1 → Step 2
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    // Pré-preenche org name com o nome do treinador
    if (!orgName) {
      const generated = slugify(nome);
      setOrgName(nome);
      setSlug(generated);
      if (generated.length >= 3) checkSlug(generated);
    }
    setStep(2);
  };

  // ── Finaliza cadastro
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome,
            tipo_usuario: "treinador",
            org_name: orgName || nome,
            slug,
            theme,
            primary_color: "#e8941a",
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: "Conta criada com sucesso!",
          description: `Seu perfil estará em /${slug}`,
        });
        // Redireciona direto para o painel (sessão já está ativa)
        navigate(`/${slug}/treinador`);
      }
    } catch (err: any) {
      toast({
        title: "Erro ao criar conta",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/logos/orbi-logo-horizontal-dark.svg" alt="ORBI Pro" className="h-12 w-auto object-contain" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-premium ${
                  step === s
                    ? "text-black"
                    : s < step
                    ? "bg-green-600/20 text-green-500 border border-green-600/30"
                    : "bg-white/5 text-white/20 border border-white/10"
                }`}
                style={step === s ? {
                  background: "var(--cp-gradient)",
                } : {}}
              >
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 2 && <div className={`w-12 h-px ${step > s ? "bg-green-600/40" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        <div className="glass-card rounded-2xl p-8">

          {/* ── STEP 1: Dados pessoais ── */}
          {step === 1 && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-white">Criar sua conta</h1>
                <p className="text-sm text-white/40 mt-1">Dados de acesso</p>
              </div>

              <form onSubmit={handleStep1} className="space-y-4">
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">
                    Nome completo
                  </label>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    placeholder="Ex: Lucas Silva"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl h-11 focus:border-green-600/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl h-11 focus:border-green-600/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">
                    Senha
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl h-11 focus:border-green-600/50"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl text-white font-semibold mt-2"
                  style={{ background: "var(--cp-gradient)" }}
                >
                  Continuar
                </Button>
              </form>
            </>
          )}

          {/* ── STEP 2: Perfil da org ── */}
          {step === 2 && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-white">Seu perfil profissional</h1>
                <p className="text-sm text-white/40 mt-1">Como seus alunos vão te encontrar</p>
              </div>

              <form onSubmit={handleSignup} className="space-y-5">

                {/* Nome da academia/programa */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">
                    Nome da academia ou programa
                  </label>
                  <Input
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    required
                    placeholder="Ex: Lucas Fit, Studio Ana, Nutri by Carol"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl h-11 focus:border-green-600/50"
                  />
                </div>

                {/* Slug / URL de perfil */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-1.5 block">
                    Endereço do seu perfil
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 text-sm pointer-events-none">
                      seuapp.com/
                    </div>
                    <Input
                      value={slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      required
                      placeholder="lucas-fit"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl h-11 pl-[98px] pr-10 focus:border-green-600/50"
                      style={{
                        borderColor: slug.length >= 3
                          ? slugAvailable === true
                            ? "rgba(var(--cp-rgb), 0.5)"
                            : slugAvailable === false
                            ? "hsl(0 70% 50% / 0.5)"
                            : undefined
                          : undefined,
                      }}
                    />
                    {/* Status indicator */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {checkingSlug && (
                        <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                      )}
                      {!checkingSlug && slug.length >= 3 && slugAvailable === true && (
                        <Check className="w-4 h-4 text-emerald-400" />
                      )}
                      {!checkingSlug && slug.length >= 3 && slugAvailable === false && (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                  {slug.length >= 3 && slugAvailable === false && (
                    <p className="text-xs text-red-400 mt-1.5">
                      {!isValidSlug(slug)
                        ? "Use apenas letras minúsculas, números e hífens"
                        : "Este endereço já está em uso"}
                    </p>
                  )}
                  {slug.length >= 3 && slugAvailable === true && (
                    <p className="text-xs text-emerald-400 mt-1.5">Disponível!</p>
                  )}
                </div>

                {/* Seletor de tema */}
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider mb-3 block">
                    Tema padrão do seu app
                  </label>
                  <div className="grid grid-cols-2 gap-3">

                    {/* Dark */}
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`relative rounded-xl overflow-hidden border-2 transition-premium ${
                        theme === "dark" ? "border-green-600" : "border-white/10"
                      }`}
                    >
                      {/* Preview miniatura — dark */}
                      <div className="bg-zinc-950 p-3 h-24 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-600" />
                          <div className="h-1.5 w-12 bg-white/20 rounded-full" />
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-white/10 rounded-full" />
                          <div className="h-1.5 w-3/4 bg-white/10 rounded-full" />
                        </div>
                        <div className="h-5 w-full rounded-md bg-green-600/80" />
                      </div>
                      <div className={`py-1.5 text-center text-xs font-medium flex items-center justify-center gap-1.5 ${
                        theme === "dark" ? "bg-green-600 text-white" : "bg-white/5 text-white/40"
                      }`}>
                        <Moon className="w-3 h-3" />
                        Dark
                        {theme === "dark" && <Check className="w-3 h-3 ml-0.5" />}
                      </div>
                    </button>

                    {/* Light */}
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`relative rounded-xl overflow-hidden border-2 transition-premium ${
                        theme === "light" ? "border-green-600" : "border-white/10"
                      }`}
                    >
                      {/* Preview miniatura — light */}
                      <div className="bg-white p-3 h-24 flex flex-col justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-600" />
                          <div className="h-1.5 w-12 bg-zinc-200 rounded-full" />
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-zinc-200 rounded-full" />
                          <div className="h-1.5 w-3/4 bg-zinc-200 rounded-full" />
                        </div>
                        <div className="h-5 w-full rounded-md bg-green-600/80" />
                      </div>
                      <div className={`py-1.5 text-center text-xs font-medium flex items-center justify-center gap-1.5 ${
                        theme === "light" ? "bg-green-600 text-white" : "bg-white/5 text-white/40"
                      }`}>
                        <Sun className="w-3 h-3" />
                        Light
                        {theme === "light" && <Check className="w-3 h-3 ml-0.5" />}
                      </div>
                    </button>
                  </div>
                  <p className="text-xs text-white/25 mt-2">
                    Pode ser alterado depois nas configurações
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    className="flex-1 h-11 rounded-xl text-white/50 hover:text-white border border-white/10 hover:bg-white/5"
                  >
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || slugAvailable === false || checkingSlug}
                    className="flex-1 h-11 rounded-xl text-white font-semibold"
                    style={{ background: "var(--cp-gradient)" }}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</>
                    ) : (
                      "Criar conta"
                    )}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Link para login */}
        <p className="text-center text-white/25 text-sm mt-6">
          Já tem conta?{" "}
          <Link to="/auth" className="text-green-500 hover:text-green-400 transition-premium">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
