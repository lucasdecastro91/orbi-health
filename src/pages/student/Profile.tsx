import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { User, KeyRound, Save, LogOut, Loader2, Camera, Instagram, ClipboardList, ChevronRight, Bell, ScanLine, CreditCard, CalendarDays, CheckCircle2, AlertTriangle, Clock, Moon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const Profile = () => {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const { slug } = useTenantContext();
  const { hasAvaliacaoPostural } = usePlanFeatures();

  const [nome,           setNome]           = useState("");
  const [email,          setEmail]          = useState("");
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [loggingOut,     setLoggingOut]     = useState(false);
  const [anamneseDate,   setAnamneseDate]   = useState<string | null>(null);
  const [plano, setPlano] = useState<{
    plano_nome: string | null;
    plano_inicio: string | null;
    data_expiracao_plano: string | null;
    plano_valor_pago: number | null;
  } | null>(null);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const [profileRes, anamneseRes, alunoRes] = await Promise.all([
        supabase.from("profiles").select("nome, avatar_url").eq("id", session.user.id).single(),
        supabase.from("anamneses").select("updated_at").eq("student_id", session.user.id).maybeSingle(),
        supabase.from("alunos")
          .select("plano_nome, plano_inicio, data_expiracao_plano, plano_valor_pago")
          .eq("user_id", session.user.id)
          .maybeSingle(),
      ]);

      if (profileRes.data) {
        setNome(profileRes.data.nome);
        setAvatarUrl(profileRes.data.avatar_url);
      }
      setEmail(session.user.email || "");
      if (anamneseRes.data?.updated_at) setAnamneseDate(anamneseRes.data.updated_at);
      if (alunoRes.data?.plano_nome) setPlano(alunoRes.data as any);
    } catch (err: any) {
      toast({ title: "Erro ao carregar perfil", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase.from("profiles").update({ nome }).eq("id", session.user.id);
      if (error) throw error;
      toast({ title: "Perfil atualizado!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/gif"].includes(file.type)) {
      toast({ title: "Tipo inválido", description: "Envie JPG, PNG ou GIF.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const ext      = file.name.split(".").pop();
      const fileName = `${session.user.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(fileName, file);
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", session.user.id);
      if (updErr) throw updErr;
      setAvatarUrl(data.publicUrl);
      toast({ title: "Foto atualizada!" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const initials = nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <User className="w-5 h-5 text-green-500" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas informações pessoais</p>
        </div>
      </div>

      {/* Avatar */}
      <div className="rounded-2xl border border-white/8 p-6 mb-4 flex flex-col items-center gap-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        <div className="relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full object-cover" style={{ boxShadow: "0 0 0 3px rgba(var(--cp-rgb),0.3)" }} />
          ) : (
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-primary-foreground"
              style={{ background: "var(--cp-gradient)", boxShadow: "0 0 0 3px rgba(var(--cp-rgb),0.3)" }}
            >
              {initials || <User className="w-8 h-8" />}
            </div>
          )}
          {/* Upload overlay */}
          <label
            htmlFor="avatar-upload"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-opacity"
            style={{ background: "var(--cp-gradient)" }}
          >
            {uploading
              ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              : <Camera className="w-4 h-4 text-primary-foreground" />
            }
          </label>
          <input id="avatar-upload" type="file" className="hidden" accept="image/jpeg,image/png,image/gif" onChange={handleAvatarChange} disabled={uploading} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">{nome}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-white/8 p-5 mb-4 space-y-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados pessoais</p>

        {/* Nome */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50 transition-colors"
          />
        </div>

        {/* Email (readonly) */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">E-mail</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-[11px] text-muted-foreground opacity-60 mt-1">O e-mail não pode ser alterado</p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-11 rounded-xl text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--cp-gradient)" }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      {/* Anamnese */}
      <div className="rounded-2xl border border-white/8 p-5 mb-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Anamnese</p>
        <button
          onClick={() => navigate(`/${slug}/aluno/anamnese`)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.04)", border: "1px solid hsl(var(--foreground) / 0.07)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: anamneseDate ? "rgba(var(--cp-rgb),0.12)" : "hsl(var(--foreground) / 0.06)" }}
          >
            <ClipboardList className="w-4 h-4" style={{ color: anamneseDate ? "var(--cp-500)" : "hsl(var(--muted-foreground))" }} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-foreground">
              {anamneseDate ? "Editar anamnese" : "Preencher anamnese"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {anamneseDate
                ? `Última atualização: ${format(parseISO(anamneseDate), "dd/MM/yyyy", { locale: ptBR })}`
                : "Ficha de saúde e objetivos não preenchida"
              }
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 shrink-0" />
        </button>
      </div>

      {/* Meu Plano */}
      {(() => {
        // ── sem plano: banner informativo ───────────────────────────────────
        if (!plano) {
          return (
            <div className="rounded-2xl border border-white/8 p-5 mb-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Meu Plano</p>
              <div className="rounded-xl p-4 flex items-center gap-3"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.03)", border: "1px dashed hsl(var(--foreground) / 0.1)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "hsl(var(--foreground) / 0.05)" }}>
                  <CreditCard className="w-4 h-4 text-muted-foreground opacity-40" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground opacity-50">Plano não registrado</p>
                  <p className="text-xs text-muted-foreground opacity-50 mt-0.5">
                    Seu treinador ainda não vinculou um plano à sua conta.
                  </p>
                </div>
              </div>
            </div>
          );
        }

        // ── com plano: informações completas ────────────────────────────────
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const venc = plano.data_expiracao_plano ? new Date(plano.data_expiracao_plano + "T00:00:00") : null;
        const diasRestantes = venc ? Math.ceil((venc.getTime() - hoje.getTime()) / 86400000) : null;

        const statusColor =
          diasRestantes === null ? "hsl(var(--foreground) / 0.4)" :
          diasRestantes < 0     ? "hsl(0 70% 60%)"        :
          diasRestantes <= 7    ? "hsl(38 95% 58%)"        :
          "hsl(142 70% 50%)";

        const statusBg =
          diasRestantes === null ? "hsl(var(--foreground) / 0.05)"  :
          diasRestantes < 0     ? "rgba(239,68,68,0.08)"    :
          diasRestantes <= 7    ? "rgba(245,158,11,0.08)"   :
          "rgba(34,197,94,0.08)";

        const StatusIcon =
          diasRestantes === null ? Clock         :
          diasRestantes < 0     ? AlertTriangle  :
          diasRestantes <= 7    ? AlertTriangle  :
          CheckCircle2;

        const statusText =
          diasRestantes === null ? "Sem vencimento"                 :
          diasRestantes < 0     ? "Vencido"                        :
          diasRestantes === 0   ? "Vence hoje"                     :
          diasRestantes <= 7    ? `Vence em ${diasRestantes} dias` :
          "Ativo";

        return (
          <div className="rounded-2xl border border-white/8 p-5 mb-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Meu Plano</p>
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: statusBg, border: `1px solid ${statusColor}22` }}>
              {/* Nome do plano + status badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 shrink-0" style={{ color: statusColor }} />
                  <p className="text-sm font-semibold text-foreground leading-tight">{plano.plano_nome}</p>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: `${statusColor}20`, color: statusColor }}>
                  <StatusIcon className="w-3 h-3" />
                  {statusText}
                </span>
              </div>

              {/* Datas + valor */}
              <div className="grid grid-cols-2 gap-2">
                {plano.plano_inicio && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Início</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">
                      {format(new Date(plano.plano_inicio + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
                {venc && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vencimento</p>
                    <p className="text-xs font-medium mt-0.5" style={{ color: statusColor }}>
                      {format(venc, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
                {plano.plano_valor_pago != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor pago</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">
                      {Number(plano.plano_valor_pago).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Ferramentas IA */}
      <div className="rounded-2xl border border-white/8 p-5 mb-4 space-y-2" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ferramentas</p>

        {/* Avaliação postural */}
        {hasAvaliacaoPostural && (
          <button
            onClick={() => navigate(`/${slug}/aluno/avaliacao-postural`)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors text-left"
            style={{ backgroundColor: "hsl(var(--foreground) / 0.04)", border: "1px solid hsl(var(--foreground) / 0.07)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}>
              <ScanLine className="w-4 h-4" style={{ color: "var(--cp-500)" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Avaliação Postural</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fotos anterior, posterior e lateral</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 shrink-0" />
          </button>
        )}

        {/* Calculadora de sono */}
        <button
          onClick={() => navigate(`/${slug}/aluno/sono`)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors text-left"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.04)", border: "1px solid hsl(var(--foreground) / 0.07)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}>
            <Moon className="w-4 h-4" style={{ color: "var(--cp-500)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">ORBI Sleep</p>
            <p className="text-xs text-muted-foreground mt-0.5">Calculadora de ciclos de sono</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 shrink-0" />
        </button>

      </div>

      {/* Actions */}
      <div className="rounded-2xl border border-white/8 p-5 mb-4 space-y-2" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Conta</p>

        {/* Notificações */}
        <button
          onClick={() => navigate(`/${slug}/aluno/notificacoes`)}
          className="w-full h-11 rounded-xl flex items-center gap-3 px-4 text-sm font-medium transition-colors text-foreground/70 hover:text-foreground"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.04)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
        >
          <Bell className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
          Notificações
          <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground opacity-40" />
        </button>

        {/* Alterar senha */}
        <button
          onClick={() => navigate(`/${slug}/aluno/alterar-senha`)}
          className="w-full h-11 rounded-xl flex items-center gap-3 px-4 text-sm font-medium transition-colors text-foreground/70 hover:text-foreground"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.04)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
        >
          <KeyRound className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
          Alterar senha
        </button>

        {/* Instagram */}
        <button
          onClick={() => window.open("https://instagram.com/lucasdecastro.fit", "_blank")}
          className="w-full h-11 rounded-xl flex items-center gap-3 px-4 text-sm font-medium transition-colors text-foreground/70 hover:text-foreground"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.04)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
        >
          <Instagram className="w-4 h-4 text-pink-400" />
          Instagram do treinador
        </button>
      </div>

      {/* Logout — zona de perigo */}
      <div className="rounded-2xl border p-5" style={{ backgroundColor: "rgba(239,68,68,0.04)", borderColor: "rgba(239,68,68,0.15)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(239,68,68,0.6)" }}>Sessão</p>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "hsl(0 70% 60%)", border: "1px solid rgba(239,68,68,0.2)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.18)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.1)"; }}
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          {loggingOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>

    </div>
  );
};

export default Profile;
