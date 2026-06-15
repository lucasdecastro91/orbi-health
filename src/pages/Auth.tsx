import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import SplashScreen from "@/components/SplashScreen";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLoading(true);
        redirectUser(session.user.id, session.user.user_metadata);
      }
    });
  }, []);

  /**
   * Após autenticar, busca a org do usuário e redireciona para
   * /:slug/treinador  ou  /:slug/aluno
   */
  const redirectUser = async (userId: string, userMeta?: Record<string, any>) => {
    // ── 1. Busca perfil ──────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tipo_usuario")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      toast({
        title: "Erro ao carregar perfil",
        description: "Erro de banco de dados. Tente novamente.",
        variant: "destructive",
      });
      setLoading(false);
      await supabase.auth.signOut();
      return;
    }

    if (!profile) {
      // Trigger pode ter falhado — dá uma segunda chance após 1s
      await new Promise((r) => setTimeout(r, 1200));

      const { data: retry } = await supabase
        .from("profiles")
        .select("tipo_usuario")
        .eq("id", userId)
        .maybeSingle();

      if (!retry) {
        toast({
          title: "Perfil não encontrado",
          description: "Seu cadastro pode não ter sido concluído. Tente se cadastrar novamente ou contate o suporte.",
          variant: "destructive",
        });
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      // Retry funcionou — segue com o perfil retornado
      return redirectUser(userId);
    }

    // ── 2. Verifica se é colaborador via user_metadata ──────────────────────
    const collabOrgSlug = userMeta?.collab_org_slug as string | undefined;

    if (collabOrgSlug) {
      setLoading(false);
      navigate(`/${collabOrgSlug}/treinador`, { replace: true });
      return;
    }

    // ── 3. Busca organização do usuário ──────────────────────────
    let orgSlug: string | undefined;

    // Para alunos: usa a tabela 'alunos' como fonte principal do slug.
    // É mais confiável do que organization_members porque o treinador
    // adicionou o aluno explicitamente nessa org. Evita conflito quando
    // o aluno possui entradas em organization_members de múltiplas orgs.
    if (profile.tipo_usuario !== "treinador") {
      const { data: alunoRecord } = await supabase
        .from("alunos")
        .select("organizations(slug)")
        .eq("user_id", userId)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      orgSlug = (alunoRecord?.organizations as any)?.slug;
    }

    // Para treinadores (e fallback para alunos sem registro ativo em 'alunos'):
    // usa organization_members
    if (!orgSlug) {
     const { data: member } = await supabase
  .from("organization_members")
  .select("role, organizations(slug)")
  .eq("user_id", userId)
  .in("role", ["owner", "trainer"])
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();
      orgSlug = (member?.organizations as any)?.slug as string | undefined;
    }

    if (!orgSlug) {
      toast({
        title: "Organização não encontrada",
        description: "Seu perfil está sendo configurado. Aguarde alguns segundos e tente novamente.",
        variant: "destructive",
      });
      setLoading(false);
      await supabase.auth.signOut();
      return;
    }

    // ── 3. Redireciona para a área correta ───────────────────────
    setLoading(false);
    if (profile.tipo_usuario === "treinador") {
      navigate(`/${orgSlug}/treinador`, { replace: true });
    } else {
      navigate(`/${orgSlug}/aluno`, { replace: true });
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Erro no login",
          description: error.message || "Verifique suas credenciais.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (data.user) {
        await redirectUser(data.user.id, data.user.user_metadata);
      } else {
        toast({
          title: "Erro no login",
          description: "Não foi possível obter os dados do usuário.",
          variant: "destructive",
        });
        setLoading(false);
      }
    } catch (err: any) {
      toast({
        title: "Erro no login",
        description: err.message || "Verifique suas credenciais.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <>
      {loading && <SplashScreen />}

      {/* Background photo */}
      <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/coach-hero.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/20" />

        {/* Card */}
        <div className="relative z-10 w-full max-w-sm mx-4">
          <div className="flex justify-center mb-8">
            <img
              src="/logos/orbi-logo-horizontal-dark.svg"
              alt="ORBI Pro"
              className="h-16 w-auto object-contain drop-shadow-2xl"
            />
          </div>

          <div className="glass-card rounded-2xl p-8 shadow-2xl">
            <div className="mb-6 text-center">
              <h1 className="text-xl font-semibold text-white tracking-wide">
                Acesse sua conta
              </h1>
              <p className="text-sm text-white/40 mt-1">Bem-vindo de volta</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Email"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl h-12 focus:border-green-600/60 focus:ring-green-600/20 transition-premium"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Senha"
                minLength={6}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl h-12 focus:border-green-600/60 focus:ring-green-600/20 transition-premium"
              />

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl font-semibold text-white text-base mt-2 transition-premium hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "var(--cp-gradient)",
                  boxShadow: "0 4px 24px rgba(var(--cp-rgb), 0.35)",
                }}
              >
                {loading ? "Aguarde..." : "Entrar"}
              </Button>
            </form>
          </div>

          <div className="flex items-center justify-between mt-6 px-1">
            <p className="text-white/20 text-xs tracking-widest uppercase">
              ORBI Pro
            </p>
            <Link
              to="/cadastro"
              className="text-white/30 text-xs hover:text-green-500 transition-premium"
            >
              Criar conta →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;
