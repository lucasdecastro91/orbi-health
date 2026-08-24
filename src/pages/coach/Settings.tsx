import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Lock, Moon, Sun, Check, Loader2, CreditCard, Crown, AlertCircle, ExternalLink, Ban, Calendar, Camera, Trash2, GripVertical, Plus, X, ChevronDown, MessageCircle, User, Palette, Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { COLOR_PALETTE, ColorEntry } from "@/lib/colors";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

// ── Canvas helper: recorta a imagem e devolve Blob JPEG 400×400 ──────────────
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width  = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, 400, 400,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { blob ? resolve(blob) : reject(new Error("Canvas vazio")); },
      "image/jpeg",
      0.9,
    );
  });
}

// ── SlotInput: input com estado local para evitar re-render do pai a cada tecla ─
// Atualiza o estado do pai apenas no onBlur (quando o usuário sai do campo).
// Isso impede que o componente pai re-renderize a cada keypress,
// o que causava desmontagem/remontagem do PhotoSlotsSection e scroll para o topo.
const SlotInput = ({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) => {
  const [local, setLocal] = useState(value);
  // Sincroniza se o valor externo mudar (ex: ao reordenar slots)
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <Input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      maxLength={30}
      className="flex-1 bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm focus:border-green-600/50"
    />
  );
};

// ── Seção reutilizável ─────────────────────────────────────────
// Definida fora do Settings de propósito: um componente declarado dentro do
// corpo de outro é recriado (novo "tipo") a cada render do pai — o React
// desmonta e remonta seus filhos, e qualquer <input> dentro perde o foco a
// cada tecla digitada. Já aconteceu antes neste mesmo arquivo (ver SlotInput
// acima, workaround via onBlur para o PhotoSlotsSection) e de novo no
// ProfileForm (campo "Nome"), corrigido hoisteando os dois pra cá.
const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="rounded-2xl overflow-hidden"
    style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
    <div className="px-6 py-4 border-b border-white/6">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

const ProfileForm = ({
  nome, setNome, email, avatarUrl, uploading, savingProfile,
  fileInputRef, handleAvatarChange, handleSaveProfile,
}: {
  nome: string;
  setNome: (v: string) => void;
  email: string;
  avatarUrl: string;
  uploading: boolean;
  savingProfile: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSaveProfile: (e: React.FormEvent) => void;
}) => (
  <Section title="Perfil do Treinador" subtitle="Suas informações pessoais">
    <form onSubmit={handleSaveProfile} className="space-y-5">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <Avatar className="w-20 h-20 ring-2 ring-white/10 group-hover:ring-green-600/40 transition-premium">
            <AvatarImage src={avatarUrl} alt={nome} className="object-cover" />
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
          <p className="text-xs text-white/40 mt-0.5">Para melhor resultado, use foto quadrada (1:1).</p>
          <p className="text-xs text-white/40 mt-0.5">JPG, PNG ou GIF · máx 2MB.</p>
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

// Hoisted pro escopo do módulo — evita o bug de "campo perde foco/rola pro
// topo a cada tecla" (componente inline no corpo de Settings seria recriado
// a cada render; ver memória "inline-component-focus-loss-bug").
const OrgNameSection = ({
  orgName, setOrgName, savingOrgName, currentName, handleSaveOrgName,
}: {
  orgName: string;
  setOrgName: (v: string) => void;
  savingOrgName: boolean;
  currentName: string;
  handleSaveOrgName: () => void;
}) => (
  <Section title="Nome exibido" subtitle="Aparece na sidebar/header do app (junto do ícone) quando não há uma Logo completa enviada, e em e-mails automáticos">
    <Label className="text-xs text-white/50 uppercase tracking-wider">Nome da organização</Label>
    <Input
      value={orgName}
      onChange={(e) => setOrgName(e.target.value)}
      className="bg-white/5 border-white/10 text-white rounded-xl h-11 focus:border-amber-500/50 mt-2 mb-4"
      placeholder="Ex: Get Shape"
    />
    <Button
      type="button"
      onClick={handleSaveOrgName}
      disabled={savingOrgName || orgName.trim() === currentName}
      className="h-10 px-5 rounded-xl text-white font-semibold text-sm"
      style={{ background: "var(--cp-gradient)" }}
    >
      {savingOrgName
        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
        : "Salvar nome"
      }
    </Button>
  </Section>
);

// Sub-navegação da tela de Configurações (desktop). Agrupa por "o que o
// treinador está tentando fazer", não por componente: Tema/Cor/Logo/Ícone/Slots
// são todos "como a plataforma se parece", então caem juntos em "Aparência".
const SETTINGS_NAV = [
  { key: "perfil"        as const, label: "Perfil",        icon: User },
  { key: "aparencia"     as const, label: "Aparência",     icon: Palette },
  { key: "whatsapp"      as const, label: "WhatsApp",      icon: MessageCircle },
  { key: "notificacoes"  as const, label: "Notificações",  icon: Bell },
  { key: "assinatura"    as const, label: "Assinatura",    icon: CreditCard },
  { key: "seguranca"     as const, label: "Segurança",     icon: Lock },
];

const VALID_SETTINGS_TABS = ["perfil", "aparencia", "whatsapp", "notificacoes", "assinatura", "seguranca"] as const;
type SettingsTab = typeof VALID_SETTINGS_TABS[number];

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { slug, orgId, org, reload, isGetShapeOrg } = useTenantContext();

  // Sub-navegação da tela (só desktop — mobile continua rolando tudo empilhado).
  // Aceita ?tab= na URL (atalhos do menu de conta no avatar, CoachLayout.tsx).
  const tabParam = searchParams.get("tab");
  const initialTab: SettingsTab = (VALID_SETTINGS_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as SettingsTab)
    : "perfil";
  const [activeSection, setActiveSection] = useState<SettingsTab>(initialTab);

  // Perfil
  const [nome, setNome]         = useState("");
  const [email, setEmail]       = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop modal
  const [cropModalOpen,     setCropModalOpen]     = useState(false);
  const [cropSrc,           setCropSrc]           = useState<string | null>(null);
  const [cropPosition,      setCropPosition]      = useState({ x: 0, y: 0 });
  const [cropZoom,          setCropZoom]          = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Tema da org
  const [theme, setTheme]       = useState<"dark" | "light">("dark");
  const [savingTheme, setSavingTheme] = useState(false);

  // Cor primária
  const [primaryColor,  setPrimaryColor]  = useState<string>("#16a34a");
  const [savingColor,   setSavingColor]   = useState(false);

  // Nome exibido (sidebar/header) — organizations.name, editável (2026-08-03)
  const [orgName,        setOrgName]        = useState("");
  const [savingOrgName,  setSavingOrgName]  = useState(false);

  // Logo da org
  const [logoUrl,         setLogoUrl]         = useState<string | null>(null);
  const [logoPreview,     setLogoPreview]     = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [uploadingLogo,   setUploadingLogo]   = useState(false);
  const [removingLogo,    setRemovingLogo]    = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Logo da tela de login — separada da logo do header (opcional, cai na
  // logo normal se não configurada). Ver TenantContext.tsx pro motivo.
  const [loginLogoUrl,         setLoginLogoUrl]         = useState<string | null>(null);
  const [loginLogoPreview,     setLoginLogoPreview]     = useState<string | null>(null);
  const [pendingLoginLogoFile, setPendingLoginLogoFile] = useState<File | null>(null);
  const [uploadingLoginLogo,   setUploadingLoginLogo]   = useState(false);
  const [removingLoginLogo,    setRemovingLoginLogo]    = useState(false);
  const loginLogoInputRef = useRef<HTMLInputElement>(null);

  // Ícone do app (favicon)
  const [iconUrl,         setIconUrl]         = useState<string | null>(null);
  const [iconPreview,     setIconPreview]     = useState<string | null>(null);
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null);
  const [uploadingIcon,   setUploadingIcon]   = useState(false);
  const [removingIcon,    setRemovingIcon]    = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Slots de foto de evolução
  interface EvoSlot { id?: string; label: string; slot_key: string; ordem: number; isNew?: boolean }
  const DEFAULT_EVO_SLOTS: EvoSlot[] = [
    { label: "Frente",    slot_key: "front",      ordem: 0 },
    { label: "Lado E.",   slot_key: "side_left",  ordem: 1 },
    { label: "Lado D.",   slot_key: "side_right", ordem: 2 },
    { label: "Costas",    slot_key: "back",        ordem: 3 },
    { label: "Livre",     slot_key: "free",        ordem: 4 },
  ];
  const [evoSlots,       setEvoSlots]       = useState<EvoSlot[]>(DEFAULT_EVO_SLOTS);
  const [evoSlotsLoaded, setEvoSlotsLoaded] = useState(false);
  const [savingSlots,    setSavingSlots]    = useState(false);

  useEffect(() => {
    if (orgId && !evoSlotsLoaded) loadEvoSlots(orgId);
  }, [orgId]);

  const loadEvoSlots = async (oid: string) => {
    const { data } = await supabase
      .from("evolution_photo_slots")
      .select("id, label, slot_key, ordem")
      .eq("org_id", oid)
      .order("ordem", { ascending: true });
    if (data && data.length > 0) setEvoSlots(data as EvoSlot[]);
    setEvoSlotsLoaded(true);
  };

  const handleSaveSlots = async () => {
    if (!orgId) return;
    setSavingSlots(true);
    try {
      // Remove todos os existentes e recria na ordem atual
      await supabase.from("evolution_photo_slots").delete().eq("org_id", orgId);
      const rows = evoSlots.map((s, i) => ({
        org_id:   orgId,
        label:    s.label.trim() || `Slot ${i + 1}`,
        slot_key: s.slot_key,
        ordem:    i,
      }));
      const { error } = await supabase.from("evolution_photo_slots").insert(rows);
      if (error) throw error;
      toast({ title: "Slots salvos!", description: "Alunos verão a nova configuração ao recarregar a página." });
      loadEvoSlots(orgId);
    } catch (err: any) {
      toast({ title: "Erro ao salvar slots", description: err.message, variant: "destructive" });
    } finally {
      setSavingSlots(false);
    }
  };

  const addSlot = () => {
    const idx = evoSlots.length;
    setEvoSlots(s => [...s, { label: `Slot ${idx + 1}`, slot_key: `custom_${Date.now()}`, ordem: idx, isNew: true }]);
  };

  const removeSlot = (i: number) => setEvoSlots(s => s.filter((_, idx) => idx !== i));

  const moveSlot = (from: number, to: number) => {
    if (to < 0 || to >= evoSlots.length) return;
    setEvoSlots(s => {
      const arr = [...s];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  const updateSlotLabel = (i: number, label: string) =>
    setEvoSlots(s => s.map((slot, idx) => idx === i ? { ...slot, label } : slot));

  // Assinatura / Billing
  interface SubscriptionData {
    plan: string;
    plan_type: string | null;
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
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [cancellingPlan, setCancellingPlan] = useState(false);

  // WhatsApp (Evolution API)
  type WaStatus = "disconnected" | "connecting" | "connected" | "banned";
  const [waStatus, setWaStatus]       = useState<WaStatus>("disconnected");
  const [waConnectedAt, setWaConnectedAt] = useState<string | null>(null);
  const [waQrCode, setWaQrCode]       = useState<string | null>(null);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waLoading, setWaLoading]     = useState(false);
  const waPollRef = useRef<number | null>(null);

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

  useEffect(() => {
    setOrgName(org?.name ?? "");
  }, [org?.name]);

  useEffect(() => {
    setLogoUrl(org?.logo_url ?? null);
  }, [org?.logo_url]);

  useEffect(() => {
    setLoginLogoUrl(org?.login_logo_url ?? null);
  }, [org?.login_logo_url]);

  useEffect(() => {
    setIconUrl(org?.icon_url ?? null);
  }, [org?.icon_url]);

  useEffect(() => {
    setWaStatus(((org as any)?.whatsapp_status as WaStatus) ?? "disconnected");
    setWaConnectedAt((org as any)?.whatsapp_connected_at ?? null);
  }, [org]);

  // Para de perguntar o status quando o componente desmonta (troca de página)
  useEffect(() => () => {
    if (waPollRef.current) window.clearInterval(waPollRef.current);
  }, []);


  const loadSubscription = async (oid: string) => {
    setLoadingBilling(true);
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan, plan_type, status, next_billing_date, grace_until")
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

  // ── WhatsApp (Evolution API) ────────────────────────────────────
  // A função usa o header "x-orbi-auth" em vez de "Authorization" porque a
  // borda do Supabase rejeita tokens de sessão atuais (ES256) nesse header
  // específico — bug de plataforma, ver CLAUDE.md seção 14/15. Enquanto isso
  // não for corrigido pelo Supabase, chamamos essa função via fetch direto.
  const callWhatsappInstance = async (method: "GET" | "POST" | "DELETE", oid: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance?org_id=${oid}`,
      { method, headers: { "x-orbi-auth": token, "Content-Type": "application/json" } },
    );
    return res.json();
  };

  const startWaPolling = (oid: string) => {
    if (waPollRef.current) window.clearInterval(waPollRef.current);
    waPollRef.current = window.setInterval(async () => {
      const data = await callWhatsappInstance("GET", oid);
      if (data.status === "connected") {
        setWaStatus("connected");
        setWaModalOpen(false);
        if (waPollRef.current) window.clearInterval(waPollRef.current);
        toast({ title: "WhatsApp conectado!" });
        reload();
      }
    }, 3000);
  };

  const handleConnectWhatsapp = async () => {
    if (!orgId) return;
    setWaLoading(true);
    try {
      const data = await callWhatsappInstance("POST", orgId);
      if (data.qrcode) {
        setWaQrCode(data.qrcode);
        setWaModalOpen(true);
        setWaStatus("connecting");
        startWaPolling(orgId);
      } else {
        toast({ title: "Erro ao gerar QR code", description: data.error ?? "Tente novamente.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao conectar WhatsApp", description: err.message, variant: "destructive" });
    } finally {
      setWaLoading(false);
    }
  };

  const handleDisconnectWhatsapp = async () => {
    if (!orgId) return;
    setWaLoading(true);
    try {
      await callWhatsappInstance("DELETE", orgId);
      setWaStatus("disconnected");
      toast({ title: "WhatsApp desconectado" });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao desconectar", description: err.message, variant: "destructive" });
    } finally {
      setWaLoading(false);
    }
  };

  const closeWaModal = () => {
    setWaModalOpen(false);
    if (waPollRef.current) window.clearInterval(waPollRef.current);
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

  // ── Upload de avatar — abre modal de crop ──────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(file.type)) {
      toast({ title: "Tipo inválido", description: "Envie JPG, PNG ou GIF.", variant: "destructive" });
      return;
    }
    if (file.size > 2097152) {
      toast({ title: "Arquivo grande", description: "Máximo 2MB.", variant: "destructive" });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
    setCroppedAreaPixels(null);
    setCropModalOpen(true);
  };

  const closeCropModal = () => {
    setCropModalOpen(false);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleCropCancel = () => closeCropModal();

  const handleCropConfirm = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (avatarUrl) {
        const oldPath = avatarUrl.split("/").pop();
        if (oldPath) await supabase.storage.from("avatars").remove([`${user.id}/${oldPath}`]);
      }

      const filePath = `${user.id}/${user.id}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, { contentType: "image/jpeg" });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      setAvatarUrl(publicUrl);
      toast({ title: "Foto atualizada!" });
      closeCropModal();
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
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

  // ── Salva nome exibido da org (sidebar/header/e-mails) ───────────
  const handleSaveOrgName = async () => {
    if (!orgId) return;
    const trimmed = orgName.trim();
    if (!trimmed) {
      toast({ title: "Nome não pode ficar vazio", variant: "destructive" });
      return;
    }
    setSavingOrgName(true);
    try {
      const { error } = await supabase.from("organizations").update({ name: trimmed }).eq("id", orgId);
      if (error) throw error;
      toast({ title: "Nome atualizado!" });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao salvar nome", description: err.message, variant: "destructive" });
    } finally {
      setSavingOrgName(false);
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

  // ── Seleciona logo (preview local, sem upload ainda) ───────────
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/svg+xml", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Formato não suportado. Use PNG, JPG, SVG ou WebP.", variant: "destructive" });
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }
    if (file.size > 2097152) {
      toast({ title: "Imagem muito grande. Máximo 2MB.", variant: "destructive" });
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }

    setLogoPreview(URL.createObjectURL(file));
    setPendingLogoFile(file);
  };

  // ── Salva logo no Storage e atualiza org ────────────────────────
  const handleSaveLogo = async () => {
    if (!pendingLogoFile || !orgId || !org?.slug) return;
    setUploadingLogo(true);
    try {
      // Remove logo antiga do Storage (se existir)
      if (logoUrl) {
        const logoPath = logoUrl.split("/logos/")[1];
        if (logoPath) await supabase.storage.from("logos").remove([decodeURIComponent(logoPath)]);
      }

      const ext      = pendingLogoFile.name.split(".").pop();
      const filePath = `${org.slug}/logo-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("logos").upload(filePath, pendingLogoFile);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(filePath);

      const { error: dbErr } = await supabase
        .from("organizations")
        .update({ logo_url: publicUrl })
        .eq("id", orgId);
      if (dbErr) throw dbErr;

      setLogoUrl(publicUrl);
      setLogoPreview(null);
      setPendingLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      toast({ title: "Logo atualizada com sucesso!" });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao salvar logo", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Remove logo ─────────────────────────────────────────────────
  const handleRemoveLogo = async () => {
    if (!orgId) return;
    setRemovingLogo(true);
    try {
      if (logoUrl) {
        const logoPath = logoUrl.split("/logos/")[1];
        if (logoPath) await supabase.storage.from("logos").remove([decodeURIComponent(logoPath)]);
      }
      await supabase.from("organizations").update({ logo_url: null }).eq("id", orgId);
      setLogoUrl(null);
      setLogoPreview(null);
      setPendingLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      toast({ title: "Logo removida." });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao remover logo", description: err.message, variant: "destructive" });
    } finally {
      setRemovingLogo(false);
    }
  };

  // ── Seleciona logo do login (preview local, sem upload ainda) ──
  const handleLoginLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/svg+xml", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Formato não suportado. Use PNG, JPG, SVG ou WebP.", variant: "destructive" });
      if (loginLogoInputRef.current) loginLogoInputRef.current.value = "";
      return;
    }
    if (file.size > 2097152) {
      toast({ title: "Imagem muito grande. Máximo 2MB.", variant: "destructive" });
      if (loginLogoInputRef.current) loginLogoInputRef.current.value = "";
      return;
    }

    setLoginLogoPreview(URL.createObjectURL(file));
    setPendingLoginLogoFile(file);
  };

  // ── Salva logo do login no Storage e atualiza org ───────────────
  const handleSaveLoginLogo = async () => {
    if (!pendingLoginLogoFile || !orgId || !org?.slug) return;
    setUploadingLoginLogo(true);
    try {
      if (loginLogoUrl) {
        const logoPath = loginLogoUrl.split("/logos/")[1];
        if (logoPath) await supabase.storage.from("logos").remove([decodeURIComponent(logoPath)]);
      }

      const ext      = pendingLoginLogoFile.name.split(".").pop();
      const filePath = `${org.slug}/login-logo-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("logos").upload(filePath, pendingLoginLogoFile);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(filePath);

      const { error: dbErr } = await supabase
        .from("organizations")
        .update({ login_logo_url: publicUrl })
        .eq("id", orgId);
      if (dbErr) throw dbErr;

      setLoginLogoUrl(publicUrl);
      setLoginLogoPreview(null);
      setPendingLoginLogoFile(null);
      if (loginLogoInputRef.current) loginLogoInputRef.current.value = "";
      toast({ title: "Logo do login atualizada com sucesso!" });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao salvar logo do login", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLoginLogo(false);
    }
  };

  // ── Remove logo do login ─────────────────────────────────────────
  const handleRemoveLoginLogo = async () => {
    if (!orgId) return;
    setRemovingLoginLogo(true);
    try {
      if (loginLogoUrl) {
        const logoPath = loginLogoUrl.split("/logos/")[1];
        if (logoPath) await supabase.storage.from("logos").remove([decodeURIComponent(logoPath)]);
      }
      await supabase.from("organizations").update({ login_logo_url: null }).eq("id", orgId);
      setLoginLogoUrl(null);
      setLoginLogoPreview(null);
      setPendingLoginLogoFile(null);
      if (loginLogoInputRef.current) loginLogoInputRef.current.value = "";
      toast({ title: "Logo do login removida." });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao remover logo do login", description: err.message, variant: "destructive" });
    } finally {
      setRemovingLoginLogo(false);
    }
  };

  // ── Seleciona ícone (preview local, sem upload ainda) ──────────
  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/svg+xml", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Formato não suportado. Use PNG, JPG, SVG ou WebP.", variant: "destructive" });
      if (iconInputRef.current) iconInputRef.current.value = "";
      return;
    }
    if (file.size > 2097152) {
      toast({ title: "Imagem muito grande. Máximo 2MB.", variant: "destructive" });
      if (iconInputRef.current) iconInputRef.current.value = "";
      return;
    }

    setIconPreview(URL.createObjectURL(file));
    setPendingIconFile(file);
  };

  // ── Salva ícone no Storage e atualiza org ───────────────────────
  const handleSaveIcon = async () => {
    if (!pendingIconFile || !orgId || !org?.slug) return;
    setUploadingIcon(true);
    try {
      if (iconUrl) {
        const iconPath = iconUrl.split("/logos/")[1];
        if (iconPath) await supabase.storage.from("logos").remove([decodeURIComponent(iconPath)]);
      }

      const ext      = pendingIconFile.name.split(".").pop();
      const filePath = `${org.slug}/icon-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("logos").upload(filePath, pendingIconFile);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(filePath);

      const { error: dbErr } = await supabase
        .from("organizations")
        .update({ icon_url: publicUrl })
        .eq("id", orgId);
      if (dbErr) throw dbErr;

      setIconUrl(publicUrl);
      setIconPreview(null);
      setPendingIconFile(null);
      if (iconInputRef.current) iconInputRef.current.value = "";
      toast({ title: "Ícone atualizado com sucesso!" });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao salvar ícone", description: err.message, variant: "destructive" });
    } finally {
      setUploadingIcon(false);
    }
  };

  // ── Remove ícone ────────────────────────────────────────────────
  const handleRemoveIcon = async () => {
    if (!orgId) return;
    setRemovingIcon(true);
    try {
      if (iconUrl) {
        const iconPath = iconUrl.split("/logos/")[1];
        if (iconPath) await supabase.storage.from("logos").remove([decodeURIComponent(iconPath)]);
      }
      await supabase.from("organizations").update({ icon_url: null }).eq("id", orgId);
      setIconUrl(null);
      setIconPreview(null);
      setPendingIconFile(null);
      if (iconInputRef.current) iconInputRef.current.value = "";
      toast({ title: "Ícone removido." });
      reload();
    } catch (err: any) {
      toast({ title: "Erro ao remover ícone", description: err.message, variant: "destructive" });
    } finally {
      setRemovingIcon(false);
    }
  };

const senhaPath = `/${slug}/treinador/alterar-senha`;

  const PhotoSlotsSection = () => (
    <Section title="Slots de Fotos (Evolução)" subtitle="Defina os ângulos que seus alunos registram na Evolução e no formulário de Atualização">
      <div className="space-y-2 mb-4">
        {evoSlots.map((slot, i) => (
          <div key={slot.slot_key + i} className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <button type="button" onClick={() => moveSlot(i, i - 1)} disabled={i === 0}
                className="w-5 h-4 flex items-center justify-center rounded text-white/20 hover:text-white/60 disabled:opacity-20 transition-colors">
                <span className="text-[10px] leading-none">▲</span>
              </button>
              <button type="button" onClick={() => moveSlot(i, i + 1)} disabled={i === evoSlots.length - 1}
                className="w-5 h-4 flex items-center justify-center rounded text-white/20 hover:text-white/60 disabled:opacity-20 transition-colors">
                <span className="text-[10px] leading-none">▼</span>
              </button>
            </div>
            <SlotInput
              value={slot.label}
              onCommit={v => updateSlotLabel(i, v)}
            />
            <button
              type="button"
              onClick={() => removeSlot(i)}
              disabled={evoSlots.length <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-20"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addSlot}
          disabled={evoSlots.length >= 8}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar slot
        </button>
        <Button
          type="button"
          onClick={handleSaveSlots}
          disabled={savingSlots}
          className="h-8 px-4 rounded-xl text-white font-semibold text-xs"
          style={{ background: "var(--cp-gradient)" }}
        >
          {savingSlots ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</> : <><Check className="w-3.5 h-3.5 mr-1.5" />Salvar slots</>}
        </Button>
      </div>
      <p className="text-[11px] text-white/30 mt-3">
        Máx 8 slots. Orgs sem configuração usam os 5 padrão (Frente, Lado E., Lado D., Costas, Livre).
      </p>
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
        style={{ backgroundColor: "var(--section-card-bg-2)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow-2)" }}
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

  const LogoSection = () => {
    // GS brand sem logo próprio enviado: o app mostra o logo padrão do Get Shape
    // (ver StudentLayout.tsx/CoachLayout.tsx) — a prévia aqui precisa refletir isso,
    // senão parece que "não tem logo nenhum" quando na verdade tem um aplicado.
    const usingGsFallback = isGetShapeOrg && !logoPreview && !logoUrl;
    const displaySrc = logoPreview ?? logoUrl ?? (usingGsFallback ? "/logo-gs.png" : null);
    return (
      <Section title="Identidade Visual" subtitle="Logo exibida no sidebar e header do app">
        <div className="space-y-4">
          {/* Preview */}
          <div
            className="relative flex items-center justify-center rounded-xl overflow-hidden cursor-pointer group"
            style={{
              height: 96,
              backgroundColor: "hsl(var(--foreground) / 0.04)",
              border: "1px dashed hsl(var(--foreground) / 0.15)",
            }}
            onClick={() => logoInputRef.current?.click()}
          >
            {displaySrc ? (
              <img
                src={displaySrc}
                alt="Logo da organização"
                style={{ maxHeight: 72, maxWidth: "80%", objectFit: "contain" }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Camera className="w-7 h-7 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Clique para enviar logo
                </span>
              </div>
            )}
            {/* Hover overlay */}
            <div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "var(--upload-hover-scrim)" }}
            >
              <Upload className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Input hidden */}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/svg+xml,image/webp"
            onChange={handleLogoSelect}
            className="hidden"
          />

          {/* Orientação */}
          <p className="text-xs text-muted-foreground">
            Use PNG com fundo transparente, preferencialmente 600x170px. Máx 2MB.
          </p>
          {usingGsFallback && (
            <p className="text-xs" style={{ color: "var(--cp-400)" }}>
              Nenhum logo próprio enviado — usando o padrão do Get Shape. Envie o seu pra substituir.
            </p>
          )}

          {/* Botões */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo || removingLogo}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Enviar Logo
            </button>

            {pendingLogoFile && (
              <button
                type="button"
                onClick={handleSaveLogo}
                disabled={uploadingLogo}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40 text-black"
                style={{ background: "var(--cp-gradient)" }}
              >
                {uploadingLogo
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5" />
                }
                Salvar
              </button>
            )}

            {logoUrl && !pendingLogoFile && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={removingLogo}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
                style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "rgba(239,68,68,0.75)" }}
              >
                {removingLogo
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
                Remover Logo
              </button>
            )}
          </div>
        </div>
      </Section>
    );
  };

  const LoginLogoSection = () => {
    // O header do app é sempre escuro por design (independente do tema da
    // org), então a logo dele pode assumir texto branco sempre. A tela de
    // login segue o tema da org — se não tiver uma logo própria, cai na logo
    // do header, o que quebra visualmente se a org estiver no tema claro.
    const displaySrc = loginLogoPreview ?? loginLogoUrl;
    return (
      <Section title="Logo da tela de login" subtitle="Opcional — se não enviar, usa a mesma logo do header. Útil se sua logo tem texto branco e sua org usa tema claro.">
        <div className="space-y-4">
          {/* Preview */}
          <div
            className="relative flex items-center justify-center rounded-xl overflow-hidden cursor-pointer group"
            style={{
              height: 96,
              backgroundColor: "hsl(var(--foreground) / 0.04)",
              border: "1px dashed hsl(var(--foreground) / 0.15)",
            }}
            onClick={() => loginLogoInputRef.current?.click()}
          >
            {displaySrc ? (
              <img
                src={displaySrc}
                alt="Logo da tela de login"
                style={{ maxHeight: 72, maxWidth: "80%", objectFit: "contain" }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Camera className="w-7 h-7 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Clique para enviar logo do login
                </span>
              </div>
            )}
            {/* Hover overlay */}
            <div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "var(--upload-hover-scrim)" }}
            >
              <Upload className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Input hidden */}
          <input
            ref={loginLogoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/svg+xml,image/webp"
            onChange={handleLoginLogoSelect}
            className="hidden"
          />

          {/* Orientação */}
          <p className="text-xs text-muted-foreground">
            Use PNG com fundo transparente, preferencialmente 600x170px. Máx 2MB.
          </p>

          {/* Botões */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loginLogoInputRef.current?.click()}
              disabled={uploadingLoginLogo || removingLoginLogo}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Enviar Logo
            </button>

            {pendingLoginLogoFile && (
              <button
                type="button"
                onClick={handleSaveLoginLogo}
                disabled={uploadingLoginLogo}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40 text-black"
                style={{ background: "var(--cp-gradient)" }}
              >
                {uploadingLoginLogo
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5" />
                }
                Salvar
              </button>
            )}

            {loginLogoUrl && !pendingLoginLogoFile && (
              <button
                type="button"
                onClick={handleRemoveLoginLogo}
                disabled={removingLoginLogo}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
                style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "rgba(239,68,68,0.75)" }}
              >
                {removingLoginLogo
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
                Remover Logo
              </button>
            )}
          </div>
        </div>
      </Section>
    );
  };

  const IconSection = () => {
    const displaySrc = iconPreview ?? iconUrl;
    return (
      <Section title="Ícone do App" subtitle="Usado como favicon e ícone do app. Use uma imagem quadrada (PNG recomendado).">
        <div className="space-y-4">
          {/* Preview quadrado 48×48 */}
          <div className="flex items-center gap-4">
            <div
              className="relative flex items-center justify-center rounded-xl overflow-hidden cursor-pointer group shrink-0"
              style={{
                width: 64,
                height: 64,
                backgroundColor: "hsl(var(--foreground) / 0.04)",
                border: "1px dashed hsl(var(--foreground) / 0.15)",
              }}
              onClick={() => iconInputRef.current?.click()}
            >
              {displaySrc ? (
                <img
                  src={displaySrc}
                  alt="Ícone do app"
                  style={{ width: 48, height: 48, objectFit: "contain" }}
                />
              ) : (
                <Camera className="w-5 h-5 text-muted-foreground" />
              )}
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: "var(--upload-hover-scrim)" }}
              >
                <Upload className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use PNG com fundo transparente, preferencialmente 512×512px. Máx 2MB.
            </p>
          </div>

          {/* Input hidden */}
          <input
            ref={iconInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/svg+xml,image/webp"
            onChange={handleIconSelect}
            className="hidden"
          />

          {/* Botões */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => iconInputRef.current?.click()}
              disabled={uploadingIcon || removingIcon}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Enviar Ícone
            </button>

            {pendingIconFile && (
              <button
                type="button"
                onClick={handleSaveIcon}
                disabled={uploadingIcon}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40 text-black"
                style={{ background: "var(--cp-gradient)" }}
              >
                {uploadingIcon
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5" />
                }
                Salvar
              </button>
            )}

            {iconUrl && !pendingIconFile && (
              <button
                type="button"
                onClick={handleRemoveIcon}
                disabled={removingIcon}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
                style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "rgba(239,68,68,0.75)" }}
              >
                {removingIcon
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
                Remover Ícone
              </button>
            )}
          </div>
        </div>
      </Section>
    );
  };

  const WA_BADGE: Record<WaStatus, { label: string; bg: string; color: string }> = {
    disconnected: { label: "Desconectado",       bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" },
    connecting:   { label: "Aguardando leitura", bg: "rgba(186,117,23,0.18)",  color: "#FAC775" },
    connected:    { label: "Conectado",          bg: "rgba(29,158,117,0.18)",  color: "#5DCAA5" },
    banned:       { label: "Bloqueado",          bg: "rgba(226,75,74,0.18)",   color: "#F09595" },
  };

  const WhatsAppSection = () => {
    const badge = WA_BADGE[waStatus];
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--section-card-bg)",
          border: "1px solid var(--section-card-border)",
          boxShadow: "var(--section-card-shadow)",
        }}
      >
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-white/70" />
              <h2 className="text-sm font-semibold text-white">WhatsApp</h2>
            </div>
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{ background: badge.bg, color: badge.color }}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-white/45 mt-1 mb-4">
            Conecte o WhatsApp da sua conta pra enviar lembretes e conversar com alunos e leads direto pelo ORBI.
          </p>

          {waStatus === "connected" ? (
            <div className="space-y-3">
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: "var(--section-card-bg-2)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow-2)" }}
              >
                <Check className="w-4 h-4" style={{ color: "#5DCAA5" }} />
                <span className="text-xs text-white">
                  {waConnectedAt
                    ? `Conectado desde ${new Date(waConnectedAt).toLocaleDateString("pt-BR")}`
                    : "Conectado"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDisconnectWhatsapp}
                disabled={waLoading}
                className="h-9 px-4 rounded-xl text-xs font-semibold w-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {waLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Desconectar"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectWhatsapp}
              disabled={waLoading}
              className="h-10 w-full rounded-xl text-sm font-semibold flex items-center justify-center"
              style={{ background: "var(--cp-gradient)", color: "var(--cp-text)" }}
            >
              {waLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conectar WhatsApp"}
            </button>
          )}

          <p className="text-[11px] text-white/25 mt-3 text-center">
            Use o WhatsApp do seu atendimento — evite conectar seu número pessoal.
          </p>
        </div>
      </div>
    );
  };

  const NotificationsSection = () => {
    const push = usePushNotifications(orgId);
    const status = !push.supported
      ? { label: "Indisponível", bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }
      : push.permission === "denied"
      ? { label: "Bloqueado", bg: "rgba(226,75,74,0.18)", color: "#F09595" }
      : push.subscribed
      ? { label: "Ativado", bg: "rgba(93,202,165,0.18)", color: "#5DCAA5" }
      : { label: "Desativado", bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" };

    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--section-card-bg)",
          border: "1px solid var(--section-card-border)",
          boxShadow: "var(--section-card-shadow)",
        }}
      >
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-white/70" />
              <h2 className="text-sm font-semibold text-white">Notificações push</h2>
            </div>
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{ background: status.bg, color: status.color }}
            >
              {status.label}
            </span>
          </div>
          <p className="text-xs text-white/45 mt-1 mb-4">
            Receba avisos de agendamento, cobrança e alunos sem atualização direto no seu celular, mesmo com o app fechado.
          </p>

          {push.supported && push.permission !== "denied" && (
            <button
              type="button"
              onClick={push.subscribed ? push.unsubscribe : push.subscribe}
              disabled={push.subscribing}
              className="h-10 w-full rounded-xl text-sm font-semibold flex items-center justify-center"
              style={
                push.subscribed
                  ? { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }
                  : { background: "var(--cp-gradient)", color: "var(--cp-text)" }
              }
            >
              {push.subscribing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : push.subscribed
                ? "Desativar notificações"
                : "Ativar notificações"}
            </button>
          )}

          {push.permission === "denied" && (
            <p className="text-xs text-white/45">
              As notificações estão bloqueadas nas permissões do navegador/dispositivo. Ative manualmente nas configurações do site pra receber os avisos.
            </p>
          )}

          {!push.supported && (
            <p className="text-xs text-white/45">
              Seu navegador não suporta notificações push.
            </p>
          )}

          {push.error && (
            <p className="text-[11px] mt-2 text-center" style={{ color: "#F09595" }}>{push.error}</p>
          )}
        </div>
      </div>
    );
  };

  const PLAN_INFO: Record<string, { label: string; description: string; badge?: string }> = {
    motion:  { label: "Orbi Motion",  description: "Gestão de treinos"                  },
    pro:     { label: "Orbi Pro",     description: "Treinos + Dieta"                    },
    balance: { label: "Orbi Balance", description: "Gestão de dieta", badge: "em breve" },
    clinic:  { label: "Orbi Clinic",  description: "Treinos + Dieta", badge: "em breve" },
  };

  const PlanSection = () => {
    const planType = (org as any)?.plan_type ?? "pro";
    const info = PLAN_INFO[planType] ?? PLAN_INFO.pro;
    return (
      <Section title="Plano Ativo" subtitle="Módulos disponíveis nesta organização">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--cp-gradient)" }}
            >
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                {info.label}
                {info.badge && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/10">
                    {info.badge}
                  </span>
                )}
              </p>
              <p className="text-xs text-white/40 mt-0.5">{info.description}</p>
            </div>
          </div>
          <p className="text-[11px] text-white/25 shrink-0">via admin</p>
        </div>
      </Section>
    );
  };

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
    // Só os eventos que contam uma história real pro treinador ("paguei",
    // "venceu", "cancelei") aparecem no histórico — eventos internos como
    // SUBSCRIPTION_CREATED são registrados no banco (payment_events) só
    // pra auditoria/debug, sem interesse nenhum pra quem tá vendo a tela.
    const eventLabel: Record<string, string> = {
      PAYMENT_CONFIRMED: "Pagamento confirmado",
      PAYMENT_RECEIVED: "Pagamento recebido",
      PAYMENT_OVERDUE: "Pagamento vencido",
      PAYMENT_DELETED: "Pagamento removido",
      SUBSCRIPTION_DELETED: "Assinatura cancelada",
    };
    const visibleEvents = paymentEvents.filter((ev) => ev.event_type in eventLabel);
    const EventRow = ({ ev }: { ev: PaymentEventData }) => (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
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
    );

    const orgStatus = (org as any)?.subscription_status ?? "trial";
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
              style={{ backgroundColor: "var(--section-card-bg-2)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow-2)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
                  <span className="text-sm font-semibold text-white">
                    {subscription
                      ? `${subscription.plan_type === "pro" ? "ORBI Pro" : "ORBI Motion"} — ${subscription.plan === "mensal" ? "Mensal" : "Anual"}`
                      : "Trial gratuito"}
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

            {/* Histórico de pagamentos — sempre mostra só o evento mais recente;
                o resto fica atrás do "Ver tudo" pra não empurrar a página pra baixo
                conforme os meses passam. */}
            {visibleEvents.length > 0 && (
              <div>
                {visibleEvents.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setShowFullHistory((v) => !v)}
                    className="flex items-center justify-between w-full mb-2"
                  >
                    <span className="text-xs text-white/40 uppercase tracking-wider">Histórico de pagamentos</span>
                    <span className="flex items-center gap-1 text-[11px] text-white/30">
                      {showFullHistory ? "Ver menos" : `Ver tudo (${visibleEvents.length})`}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFullHistory ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                ) : (
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Histórico de pagamentos</p>
                )}
                <div className="space-y-1.5">
                  <EventRow ev={visibleEvents[0]} />
                  {showFullHistory && visibleEvents.slice(1).map((ev) => <EventRow key={ev.id} ev={ev} />)}
                </div>
              </div>
            )}

            {visibleEvents.length === 0 && subscription && (
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

        <div className="mb-8 lg:max-w-xl lg:mx-auto">
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Configurações</h1>
          <p className="text-white/50 mt-1 text-sm">Gerencie seu perfil e preferências da plataforma</p>
        </div>

        {/* ── Mobile: coluna única ── Desktop: 2 colunas ─────── */}
        <div className="block lg:hidden max-w-xl space-y-4">
          <ProfileForm
            nome={nome} setNome={setNome} email={email} avatarUrl={avatarUrl}
            uploading={uploading} savingProfile={savingProfile}
            fileInputRef={fileInputRef} handleAvatarChange={handleAvatarChange}
            handleSaveProfile={handleSaveProfile}
          />
          <WhatsAppSection />
          <NotificationsSection />
          <OrgNameSection
            orgName={orgName} setOrgName={setOrgName} savingOrgName={savingOrgName}
            currentName={org?.name ?? ""} handleSaveOrgName={handleSaveOrgName}
          />
          <LogoSection />
          <LoginLogoSection />
          <IconSection />
          <ThemeSelector />
          <ColorPicker />
          <PhotoSlotsSection />
          <PlanSection />
          <BillingSection />
          <SecuritySection />
        </div>

        {/* Desktop: barra de navegação horizontal (mesmo padrão das abas do
            perfil do aluno, StudentDetails.tsx) + painel da seção ativa */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-1 border-b mb-6 overflow-x-auto scrollbar-none max-w-xl mx-auto"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {SETTINGS_NAV.map((item) => {
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
                  style={{
                    color: active ? "var(--tab-text-active)" : "var(--tab-text-inactive)",
                    borderBottomColor: active ? "var(--cp-500)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--tab-text-hover)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--tab-text-inactive)"; }}
                >
                  <item.icon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: active ? "var(--cp-500)" : undefined }}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-4 min-w-0 max-w-xl mx-auto">
            {activeSection === "perfil" && (
              <ProfileForm
                nome={nome} setNome={setNome} email={email} avatarUrl={avatarUrl}
                uploading={uploading} savingProfile={savingProfile}
                fileInputRef={fileInputRef} handleAvatarChange={handleAvatarChange}
                handleSaveProfile={handleSaveProfile}
              />
            )}
            {activeSection === "aparencia" && (
              <>
                <ThemeSelector />
                <ColorPicker />
                <OrgNameSection
                  orgName={orgName} setOrgName={setOrgName} savingOrgName={savingOrgName}
                  currentName={org?.name ?? ""} handleSaveOrgName={handleSaveOrgName}
                />
                <LogoSection />
                <LoginLogoSection />
                <IconSection />
                <PhotoSlotsSection />
              </>
            )}
            {activeSection === "whatsapp" && <WhatsAppSection />}
            {activeSection === "notificacoes" && <NotificationsSection />}
            {activeSection === "assinatura" && (
              <>
                <PlanSection />
                <BillingSection />
              </>
            )}
            {activeSection === "seguranca" && <SecuritySection />}
          </div>
        </div>

      </div>

      {/* ── Modal de QR code do WhatsApp ─────────────────────────────── */}
      {waModalOpen && waQrCode && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))" }}
          >
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h2 className="text-base font-semibold text-white">Conectar WhatsApp</h2>
              <p className="text-xs text-white/40 mt-0.5">Escaneie o código com o número que vai enviar os lembretes</p>
            </div>

            <div className="p-6 flex flex-col items-center">
              <div className="bg-white p-3 rounded-xl">
                <img src={waQrCode} alt="QR code do WhatsApp" width={220} height={220} />
              </div>
              <ol className="text-xs text-white/50 mt-4 space-y-1.5 list-decimal list-inside self-start">
                <li>Abra o WhatsApp no celular</li>
                <li>Toque em Mais opções → Dispositivos conectados</li>
                <li>Toque em Conectar um dispositivo e escaneie</li>
              </ol>
            </div>

            <div className="px-5 py-4 flex justify-end" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button
                type="button"
                onClick={closeWaModal}
                className="h-9 px-4 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de recorte de avatar ───────────────────────────────── */}
      {cropModalOpen && cropSrc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))" }}
          >
            {/* Header */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h2 className="text-base font-semibold text-white">Recortar foto</h2>
              <p className="text-xs text-white/40 mt-0.5">Arraste e use o zoom para enquadrar</p>
            </div>

            {/* Área do crop */}
            <div className="relative" style={{ height: 320 }}>
              <Cropper
                image={cropSrc}
                crop={cropPosition}
                zoom={cropZoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCropPosition}
                onZoomChange={setCropZoom}
                onCropComplete={(_, area) => setCroppedAreaPixels(area)}
              />
            </div>

            {/* Slider de zoom */}
            <div
              className="px-5 py-3 flex items-center gap-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
            >
              <span className="text-sm text-white/30 select-none leading-none">−</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
                className="flex-1 h-1 cursor-pointer rounded-full"
                style={{ accentColor: "hsl(var(--primary))" }}
              />
              <span className="text-sm text-white/30 select-none leading-none">+</span>
            </div>

            {/* Footer */}
            <div
              className="px-5 py-4 flex gap-3 justify-end"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
            >
              <button
                type="button"
                onClick={handleCropCancel}
                className="h-9 px-4 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCropConfirm}
                disabled={uploading}
                className="h-9 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center"
                style={{ background: "var(--cp-gradient)" }}
              >
                {uploading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Confirmar"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
