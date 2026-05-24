import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Lock, Moon, Sun, Check, Loader2, CreditCard, Crown, AlertCircle, ExternalLink, Ban, Calendar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTenantContext } from "@/contexts/TenantContext";
import { COLOR_PALETTE, ColorEntry } from "@/lib/colors";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId, org, reload } = useTenantContext();

  // Perfil
  const [nome, setNome]         = useState("");
  const [email, setEmail]       = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tema da org
  const [theme, setTheme]       = useState<"dark" | "light">("dark");
  const [savingTheme, setSavingTheme] = useState(false);

  // Cor primária
  const [primaryColor,  setPrimaryColor]  = useState<string>("#16a34a");
  const [savingColor,   setSavingColor]   = useState(false);

  // Assinatura / Billing
  interface SubscriptionData {
    plan: string;
    status: string;
    next_billing_date: string | null;
    grace_until: string | null;
  }
  interface PaymentEventData {
    id: string;
    event_type: string;
    amount: number | null;
    paid_at: string | null;
    due_date: string | null;
    created_at: string;
  }
  const [subscription, setSubscription]     = useState<SubscriptionData | null>(null);
  const [paymentEvents, setPaymentEvents]   = useState<PaymentEventData[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [cancellingPlan, setCancellingPlan] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (orgId) loadSubscription(orgId);
  }, [orgId]);

  // Sincroniza os seletores quando a org carrega via contexto
  useEffect(() => {
    if (org?.theme) setTheme(org.theme as "dark" | "light");
  }, [org?.theme]);

  useEffect(() => {
    if (org?.primary_color) setPrimaryColor(org.primary_color);
  }, [org?.primary_color]);

  const loadSubscription = async (oid: string) => {
    setLoadingBilling(true);
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan, status, next_billing_date, grace_until")
        .eq("organization_id", oid)
        .maybeSingle();
      setSubscription(sub ?? null);

      const { data: events } = await supabase
        .from("payment_events")
        .select("id, event_type, amount, paid_at, due_date, created_at")
        .eq("organization_id", oid)
        .order("created_at", { ascending: false })
        .limit(10);
      setPaymentEvents(events ?? []);
    } catch { /* silencia */ } finally {
      setLoadingBilling(false);
    }
  };

  const handleCancelPlan = async () => {
    if (!window.confirm("Tem certeza que deseja cancelar sua assinatura? O acesso continuará até o fim do período pago.")) return;
    if (!orgId) return;
    setCancellingPlan(true);
    try {
      // Cancela na API do Asaas via Edge Function
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("asaas_subscription_id")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (subData?.asaas_subscription_id) {
        await supabase.functions.invoke("cancel-asaas-subscription", {
          body: { asaas_subscription_id: subData.asaas_subscription_id, organization_id: orgId },
        });
      }
      toast({ title: "Assinatura cancelada", description: "Seu acesso continua até o fim do período." });
      loadSubscription(orgId);
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" });
    } finally {
      setCancellingPlan(false);
    }
  };

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("nome, avatar_url")
        .eq("id", user.id)
        .single();

      if (profile) {
        setNome(profile.nome);
        setAvatarUrl(profile.avatar_url || "");
      }
      setEmail(user.email || "");
    } catch (err: any) {
      toast({ title: "Erro ao carregar perfil", description: err.message, variant: "destructive" });
    }
  };

  // ── Upload de avatar ────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type)) {
      toast({ title: "Tipo inválido", description: "Envie JPG, PNG ou GIF.", variant: "destructive" });
      return;
    }
    if (file.size > 2097152) {
      toast({ title: "Arquivo grande", description: "Máximo 2MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (avatarUrl) {
        const oldPath = avatarUrl.split("/").pop();
        if (oldPath) await supabase.storage.from("avatars").remove([`${user.id}/${oldPath}`]);
      }

      const ext      = file.name.split(".").pop();
      const filePath = `${user.id}/${user.id}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      setAvatarUrl(publicUrl);
      toast({ title: "Foto atualizada!" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Salva nome ──────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ nome }).eq("id", user.id);
      if (error) throw error;
      toast({ title: "Perfil atualizado!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Salva tema da org ────────────────────────────────────────────
  const handleSaveTheme = async (newTheme: "dark" | "light") => {
    if (!orgId) {
      toast({ title: "Organização não encontrada", variant: "destructive" });
      return;
    }

    setTheme(newTheme);
    setSavingTheme(true);

    // Aplica imediatamente no documento
    if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ theme: newTheme })
        .eq("id", orgId);

      if (error) throw error;

      toast({
        title: `Tema ${newTheme === "dark" ? "Dark" : "Light"} ativado`,
        description: "Todos os acessos à sua org vão usar este tema.",
      });

      reload(); // atualiza o TenantContext com o novo tema
    } catch (err: any) {
      toast({ title: "Erro ao salvar tema", description: err.message, variant: "destructive" });
      // Reverte visualmente em caso de erro
      setTheme(org?.theme as "dark" | "light" ?? "dark");
    } finally {
      setSavingTheme(false);
    }
  };

  // ── Preview imediato da cor ao clicar no swatch ─────────────────
  const applyColorPreview = (c: ColorEntry) => {
    const el = document.documentElement;
    el.style.setProperty("--primary",      c.hsl);
    el.style.setProperty("--ring",         c.hsl);
    el.style.setProperty("--accent",       c.hsl);
    el.style.setProperty("--cp-gradient",  c.gradient);
    el.style.setProperty("--cp-rgb",       c.rgb);
    el.style.setProperty("--cp-400",       c.light);
    el.style.setProperty("--cp-500",       c.mid);
    el.style.setProperty("--cp-600",       `hsl(${c.hsl})`);
    el.style.setProperty("--cp-text",      c.textOn);
  };

  // ── Salva cor primária da org ─────────────────────────────────────
  const handleSaveColor = async () => {
    if (!orgId) return;
    setSavingColor(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ primary_color: primaryColor })
        .eq("id", orgId);
      if (error) throw error;
      toast({
        title: "Cor atualizada!",
        description: "A nova cor já está aplicada em toda a plataforma.",
      });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSavingColor(false);
    }
  };

  const senhaPath = `/${slug}/treinador/alterar-senha`;

  // ── Seção reutilizável ─────────────────────────────────────────
  const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-white/6 bg-white/3 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/6">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );

  // ── Sub-components reutilizáveis ──────────────────────────
  const ProfileForm = () => (
    <Section title="Perfil do Treinador" subtitle="Suas informações pessoais">
      <form onSubmit={handleSaveProfile} className="space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Avatar className="w-20 h-20 ring-2 ring-white/10 group-hover:ring-green-600/40 transition-premium">
              <AvatarImage src={avatarUrl} alt={nome} />
              <AvatarFallback
                className="text-white text-2xl font-bold"
                style={{ background: "var(--cp-gradient)" }}
              >
                {nome.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-premium flex items-center justify-center">
              {uploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Upload className="w-5 h-5 text-white" />
              }
            </div>
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif" onChange={handleAvatarChange} className="hidden" />
            <p className="text-sm text-white/70 font-medium">Foto de perfil</p>
            <p className="text-xs text-white/40 mt-0.5">JPG, PNG ou GIF · máx 2 MB</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-xs text-green-500 hover:text-green-400 mt-1.5 transition-premium disabled:opacity-40">
              {uploading ? "Enviando..." : "Alterar foto"}
            </button>
          </div>
        </div>

        {/* Nome */}
        <div className="space-y-1.5">
          <Label className="text-xs text-white/55 uppercase tracking-wider">Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required
            className="bg-white/5 border-white/10 text-white rounded-xl h-11 focus:border-green-600/50" />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label className="text-xs text-white/55 uppercase tracking-wider">E-mail</Label>
          <Input type="email" value={email} disabled
            className="bg-white/3 border-white/6 text-white/35 rounded-xl h-11 cursor-not-allowed" />
          <p className="text-xs text-white/35">O e-mail não pode ser alterado</p>
        </div>

        <Button type="submit" disabled={savingProfile}
          className="h-10 px-5 rounded-xl text-white font-semibold text-sm"
          style={{ background: "var(--cp-gradient)" }}>
          {savingProfile ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar alterações"}
        </Button>
      </form>
    </Section>
  );

  const ThemeSelector = () => (
    <Section title="Tema da Organização" subtitle="Aparência aplicada para todos que acessam sua plataforma">
      <div className="grid grid-cols-2 gap-3">
        {/* Dark */}
        <button type="button" onClick={() => !savingTheme && handleSaveTheme("dark")} disabled={savingTheme}
          className={`relative rounded-xl overflow-hidden border-2 transition-premium ${
            theme === "dark" ? "border-white/0" : "border-white/10 hover:border-white/20"
          }`}
          style={theme === "dark" ? { borderColor: "hsl(var(--primary))" } : {}}>
          <div className="p-3 h-24 flex flex-col justify-between" style={{ backgroundColor: '#09090b' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
              <div className="h-1.5 w-14 rounded-full" style={{ backgroundColor: 'rgb(255 255 255 / 0.15)' }} />
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: 'rgb(255 255 255 / 0.10)' }} />
              <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: 'rgb(255 255 255 / 0.10)' }} />
            </div>
            <div className="h-5 w-full rounded-md" style={{ backgroundColor: "hsl(var(--primary) / 0.8)" }} />
          </div>
          <div className={`py-2 text-center text-xs font-semibold flex items-center justify-center gap-1.5 transition-premium ${
            theme === "dark" ? "text-white" : "bg-white/5 text-white/50"
          }`}
          style={theme === "dark" ? { backgroundColor: "hsl(var(--primary))" } : {}}>
            {savingTheme && theme === "dark" ? <Loader2 className="w-3 h-3 animate-spin" /> : theme === "dark" ? <Check className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            Dark
          </div>
        </button>

        {/* Light */}
        <button type="button" onClick={() => !savingTheme && handleSaveTheme("light")} disabled={savingTheme}
          className={`relative rounded-xl overflow-hidden border-2 transition-premium ${
            theme === "light" ? "border-white/0" : "border-white/10 hover:border-white/20"
          }`}
          style={theme === "light" ? { borderColor: "hsl(var(--primary))" } : {}}>
          <div className="bg-white p-3 h-24 flex flex-col justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
              <div className="h-1.5 w-14 bg-zinc-200 rounded-full" />
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full bg-zinc-200 rounded-full" />
              <div className="h-1.5 w-3/4 bg-zinc-200 rounded-full" />
            </div>
            <div className="h-5 w-full rounded-md" style={{ backgroundColor: "hsl(var(--primary) / 0.8)" }} />
          </div>
          <div className={`py-2 text-center text-xs font-semibold flex items-center justify-center gap-1.5 transition-premium ${
            theme === "light" ? "text-white" : "bg-white/5 text-white/50"
          }`}
          style={theme === "light" ? { backgroundColor: "hsl(var(--primary))" } : {}}>
            {savingTheme && theme === "light" ? <Loader2 className="w-3 h-3 animate-spin" /> : theme === "light" ? <Check className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
            Light
          </div>
        </button>
      </div>
      <p className="text-xs text-white/40 mt-3">
        A preferência de tema é salva na organização e aplicada automaticamente para treinadores e alunos.
      </p>
    </Section>
  );

  const ColorPicker = () => (
    <Section title="Cor Principal" subtitle="Cor base de botões, links ativos, badges e destaques">
      {/* Grid de swatches 3×3 */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {COLOR_PALETTE.map((c) => {
          const selected = primaryColor === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => { setPrimaryColor(c.hex); applyColorPreview(c); }}
              className="relative rounded-xl transition-premium"
              style={{
                border: selected ? "2px solid white" : "2px solid transparent",
                padding: "2px",
              }}
            >
              <div
                className="h-9 w-full rounded-[9px]"
                style={{ background: c.gradient }}
              />
              {selected && (
                <div className="absolute inset-0 flex items-center justify-center pb-5">
                  <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                </div>
              )}
              <p className="text-[10px] text-white/45 text-center mt-1 leading-none truncate px-0.5">
                {c.label}
              </p>
            </button>
          );
        })}
      </div>

      {/* Live preview */}
      <div
        className="rounded-xl p-4 mb-4 space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-[10px] text-white/30 uppercase tracking-wider">Preview</p>
        <div className="flex flex-wrap items-center gap-3">
          {/* Botão primário */}
          <div
            className="h-8 px-4 rounded-xl text-xs font-semibold text-white flex items-center"
            style={{ background: "var(--cp-gradient)" }}
          >
            Botão primário
          </div>
          {/* Badge */}
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
          >
            Badge
          </span>
          {/* Link ativo */}
          <span className="text-sm font-medium" style={{ color: "var(--cp-400)" }}>
            Link ativo
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-2/3 rounded-full" style={{ background: "var(--cp-gradient)" }} />
        </div>
      </div>

      <Button
        type="button"
        onClick={handleSaveColor}
        disabled={savingColor || primaryColor === org?.primary_color}
        className="h-10 px-5 rounded-xl text-white font-semibold text-sm"
        style={{ background: "var(--cp-gradient)" }}
      >
        {savingColor
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
          : "Salvar aparência"
        }
      </Button>
    </Section>
  );

  const BillingSection = () => {
    const statusLabel: Record<string, string> = {
      trial: "Trial gratuito",
      active: "Ativa",
      suspended: "Suspensa",
      cancelled: "Cancelada",
      pending: "Aguardando pagamento",
    };
    const statusColor: Record<string, string> = {
      trial: "text-amber-400",
      active: "text-green-400",
      suspended: "text-red-400",
      cancelled: "text-white/40",
      pending: "text-amber-400",
    };
    const eventLabel: Record<string, string> = {
      PAYMENT_CONFIRMED: "Pagamento confirmado",
      PAYMENT_OVERDUE: "Pagamento vencido",
      PAYMENT_DELETED: "Pagamento removido",
      SUBSCRIPTION_CANCELLED: "Assinatura cancelada",
    };

    const orgStatus = org?.subscription_status ?? "trial";
    const trialEndsAt = (org as any)?.trial_ends_at;
    const trialDaysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
      : null;

    return (
      <Section title="Minha Assinatura" subtitle="Plano, cobrança e histórico de pagamentos">
        {loadingBilling ? (
          <div className="flex items-center gap-2 text-white/30 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status card */}
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
                  <span className="text-sm font-semibold text-white">
                    {subscription ? (subscription.plan === "mensal" ? "Plano Mensal" : "Plano Anual") : "Trial gratuito"}
                  </span>
                </div>
                <span className={`text-xs font-semibold ${statusColor[orgStatus] ?? "text-white/40"}`}>
                  {statusLabel[orgStatus] ?? orgStatus}
                </span>
              </div>

              {orgStatus === "trial" && trialDaysLeft !== null && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">
                    {trialDaysLeft > 0
                      ? `Seu trial termina em ${trialDaysLeft} dia${trialDaysLeft !== 1 ? "s" : ""}.`
                      : "Seu trial expirou. Assine para continuar usando."}
                  </p>
                </div>
              )}

              {subscription?.next_billing_date && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Calendar className="w-3.5 h-3.5" />
                  Próxima cobrança: {new Date(subscription.next_billing_date).toLocaleDateString("pt-BR")}
                </div>
              )}

              {subscription?.grace_until && orgStatus === "suspended" && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-300">
                    Carência até {new Date(subscription.grace_until).toLocaleDateString("pt-BR")}. Regularize seu pagamento.
                  </p>
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-2">
              {(orgStatus === "trial" || orgStatus === "suspended" || orgStatus === "cancelled") && (
                <Button
                  className="h-9 px-4 rounded-xl text-white font-semibold text-sm"
                  style={{ background: "var(--cp-gradient)" }}
                  onClick={() => navigate(`/assinar?org=${orgId}&slug=${slug}`)}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {orgStatus === "trial" ? "Assinar agora" : "Reativar assinatura"}
                </Button>
              )}
              {orgStatus === "active" && (
                <Button
                  variant="ghost"
                  className="h-9 px-4 rounded-xl text-red-400 hover:text-red-300 border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/30 text-sm"
                  onClick={handleCancelPlan}
                  disabled={cancellingPlan}>
                  {cancellingPlan ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                  Cancelar assinatura
                </Button>
              )}
            </div>

            {/* Histórico de pagamentos */}
            {paymentEvents.length > 0 && (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Histórico de pagamentos</p>
                <div className="space-y-1.5">
                  {paymentEvents.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div>
                        <p className="text-xs font-medium text-white/70">{eventLabel[ev.event_type] ?? ev.event_type}</p>
                        <p className="text-[11px] text-white/30">
                          {new Date(ev.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      {ev.amount && (
                        <span className="text-xs font-semibold text-white/60">
                          R$ {ev.amount.toFixed(2).replace(".", ",")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paymentEvents.length === 0 && subscription && (
              <p className="text-xs text-white/25">Nenhum evento de pagamento ainda.</p>
            )}
          </div>
        )}
      </Section>
    );
  };

  const SecuritySection = () => (
    <Section title="Segurança" subtitle="Gerenciamento de acesso">
      <Button variant="ghost" onClick={() => navigate(senhaPath)}
        className="h-10 px-4 rounded-xl text-white/60 hover:text-white border border-white/10 hover:bg-white/5 hover:border-white/20 transition-premium gap-2">
        <Lock className="w-4 h-4" />
        Alterar senha
      </Button>
    </Section>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-6 lg:px-8 py-6 lg:py-8">

        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Configurações</h1>
          <p className="text-white/50 mt-1 text-sm">Gerencie seu perfil e preferências da plataforma</p>
        </div>

        {/* ── Mobile: coluna única ── Desktop: 2 colunas ─────── */}
        <div className="block lg:hidden max-w-xl space-y-4">
          <ProfileForm />
          <ThemeSelector />
          <ColorPicker />
          <BillingSection />
          <SecuritySection />
        </div>

        <div className="hidden lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start lg:max-w-5xl">
          {/* Coluna esquerda — Perfil */}
          <ProfileForm />

          {/* Coluna direita — Tema + Cor + Billing + Segurança */}
          <div className="space-y-4">
            <ThemeSelector />
            <ColorPicker />
            <BillingSection />
            <SecuritySection />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
