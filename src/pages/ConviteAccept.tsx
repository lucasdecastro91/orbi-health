import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InviteInfo {
  name:        string;
  email:       string;
  role:        string;
  org_name:    string;
  org_slug:    string;
}

// ── Card wrapper (fora do componente para evitar re-mount a cada render) ──────

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center bg-black p-6">
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <img src="/logos/orbi-logo-vertical-dark.svg" alt="ORBI Health" className="h-20 mx-auto" />
      </div>
      <div className="rounded-2xl p-6"
        style={{ backgroundColor: "#111113", border: "1px solid rgba(255,255,255,0.08)" }}>
        {children}
      </div>
    </div>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const ConviteAccept = () => {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();

  const [phase,      setPhase]      = useState<"loading" | "form" | "invalid" | "expired" | "used" | "success">("loading");
  const [invite,     setInvite]     = useState<InviteInfo | null>(null);
  const [password,   setPassword]   = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Fetch invite info ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setPhase("invalid"); return; }
    fetchInvite();
  }, [token]);

  const fetchInvite = async () => {
    try {
      // Query public: RLS policy "public_pending_token_read" permite isso
      const { data, error } = await supabase
        .from("collaborators")
        .select("name, email, role, status, invite_expires_at, organizations!collaborators_org_id_fkey(name, slug)")
        .eq("invite_token", token!)
        .maybeSingle();

      if (error || !data) { setPhase("invalid"); return; }

      if (data.status !== "pending")                             { setPhase("used");    return; }
      if (new Date(data.invite_expires_at) < new Date())        { setPhase("expired"); return; }

      const org = (data.organizations as any);
      setInvite({
        name:     data.name,
        email:    data.email,
        role:     data.role,
        org_name: org?.name  ?? "sua plataforma",
        org_slug: org?.slug  ?? "",
      });
      setPhase("form");
    } catch {
      setPhase("invalid");
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6)          { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (password !== confirm)          { setError("As senhas não coincidem.");                  return; }

    setSubmitting(true);
    try {
      const res = await supabase.functions.invoke("accept-collaborator-invite", {
        body: { token, password },
      });

      if (res.error) {
        const msgs: Record<string, string> = {
          invalid_token:    "Token inválido.",
          invite_expired:   "Este convite expirou.",
          invite_already_used: "Este convite já foi utilizado.",
          password_too_short: "A senha deve ter pelo menos 6 caracteres.",
        };
        throw new Error(msgs[res.error.message] ?? res.error.message);
      }

      const { email: acceptedEmail, org_slug } = res.data;

      // Sign in
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    acceptedEmail,
        password,
      });
      if (signInErr) throw signInErr;

      setPhase("success");
      setTimeout(() => navigate(`/${org_slug}/treinador`), 1500);
    } catch (e: any) {
      setError(e.message ?? "Ocorreu um erro. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render states ──────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-white font-semibold">Convite inválido</p>
          <p className="text-sm text-white/40">Este link de convite não é válido ou já foi removido.</p>
        </div>
      </Card>
    );
  }

  if (phase === "expired") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <XCircle className="w-10 h-10 text-amber-400" />
          <p className="text-white font-semibold">Convite expirado</p>
          <p className="text-sm text-white/40">
            Este link expirou após 24 horas. Solicite um novo convite ao administrador da plataforma.
          </p>
        </div>
      </Card>
    );
  }

  if (phase === "used") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p className="text-white font-semibold">Convite já utilizado</p>
          <p className="text-sm text-white/40">Este convite já foi aceito. Faça login para acessar o painel.</p>
          <Button
            onClick={() => navigate("/auth")}
            className="mt-2 rounded-xl text-black font-semibold"
            style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))" }}>
            Fazer login
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === "success") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p className="text-white font-semibold">Bem-vindo(a)!</p>
          <p className="text-sm text-white/40">Conta criada. Redirecionando para o painel…</p>
          <Loader2 className="w-4 h-4 animate-spin text-white/30 mt-1" />
        </div>
      </Card>
    );
  }

  // form
  return (
    <Card>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">
          Convite para colaborar
        </p>
        <h1 className="text-lg font-bold text-white leading-tight">
          {invite?.org_name}
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Você foi convidado como <strong className="text-white/75">{invite?.role}</strong>.
          Crie uma senha para acessar o painel.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* E-mail readonly */}
        <div>
          <Label className="text-xs text-white/50 uppercase tracking-wider">E-mail</Label>
          <Input
            value={invite?.email ?? ""}
            readOnly
            className="mt-1.5 bg-white/5 border-white/10 text-white/60 rounded-xl h-11 cursor-default"
          />
        </div>

        {/* Senha */}
        <div>
          <Label className="text-xs text-white/50 uppercase tracking-wider">Criar senha</Label>
          <div className="relative mt-1.5">
            <Input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="bg-white/5 border-white/10 text-white rounded-xl h-11 pr-10"
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirmar senha */}
        <div>
          <Label className="text-xs text-white/50 uppercase tracking-wider">Confirmar senha</Label>
          <Input
            type={showPwd ? "text" : "password"}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repita a senha"
            className="mt-1.5 bg-white/5 border-white/10 text-white rounded-xl h-11"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 rounded-xl text-white font-semibold mt-2"
          style={{ background: "#16a34a" }}>
          {submitting
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : "Criar conta e acessar"}
        </Button>
      </form>
    </Card>
  );
};

export default ConviteAccept;
