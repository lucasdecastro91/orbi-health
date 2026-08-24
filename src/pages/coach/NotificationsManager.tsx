import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Bell, Send, Users, User, Clock, CheckCircle2,
  Loader2, ChevronDown,
  ClipboardList, ClipboardCheck, ScanLine, Dumbbell,
  Utensils, MessageSquare, AlertTriangle, Info, Check,
  Inbox,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  user_id: string;
  nome: string;
}

interface NotifLog {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  delivered: boolean;
  created_at: string;
  recipient_id: string;
}

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string | null;
  tipo: string;
  lida: boolean;
  created_at: string;
  aluno_nome: string | null;
  aluno_id: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_ICON: Record<string, React.ElementType> = {
  atualizacao:    ClipboardList,
  anamnese:       ClipboardCheck,
  avaliacao:      ScanLine,
  treino:         Dumbbell,
  treino_completo: Dumbbell,
  dieta:          Utensils,
  dieta_completa: Utensils,
  mensagem:       MessageSquare,
  alerta:         AlertTriangle,
  info:           Info,
};

const TIPO_COR: Record<string, { bg: string; text: string }> = {
  atualizacao:    { bg: "rgba(59,130,246,0.12)",  text: "#60a5fa" },
  anamnese:       { bg: "rgba(var(--cp-rgb),0.12)", text: "var(--cp-400)" },
  avaliacao:      { bg: "rgba(168,85,247,0.12)",  text: "#c084fc" },
  treino:         { bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
  treino_completo: { bg: "rgba(34,197,94,0.12)",  text: "#4ade80" },
  dieta:          { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24" },
  dieta_completa: { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24" },
  mensagem:       { bg: "rgba(34,211,238,0.12)",  text: "#22d3ee" },
  alerta:         { bg: "rgba(239,68,68,0.12)",   text: "#f87171" },
  info:           { bg: "rgba(255,255,255,0.07)", text: "rgba(255,255,255,0.5)" },
};

const TIPO_LABEL: Record<string, string> = {
  todos:          "Todos",
  atualizacao:    "Atualização",
  anamnese:       "Anamnese",
  avaliacao:      "Avaliação",
  treino_completo: "Treino",
  dieta_completa: "Dieta",
  mensagem:       "Mensagem",
  alerta:         "Alertas",
};

const EMOJI_SUGGESTIONS = ["📣", "💪", "🏋️", "🔥", "⚡", "🎯", "✨", "📋", "🥗", "💧", "⏰", "🌟"];

// ─── Inbox Tab ────────────────────────────────────────────────────────────────

const InboxTab = ({ userId, orgId }: { userId: string; orgId: string }) => {
  const [notifs,       setNotifs]       = useState<Notificacao[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tipoFiltro,   setTipoFiltro]   = useState<string>("todos");
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);

  useEffect(() => {
    if (!userId) return;
    load();

    const channel = supabase
      .channel(`coach-inbox-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        (payload) => setNotifs((prev) => [payload.new as Notificacao, ...prev]),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notificacoes")
        .select("id, titulo, mensagem, tipo, lida, created_at, aluno_nome, aluno_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      setNotifs((data as Notificacao[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  };

  const markAllRead = async () => {
    await supabase.from("notificacoes").update({ lida: true }).eq("user_id", userId).eq("lida", false);
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  // Unread counts per tipo (for filter badges)
  const unreadByTipo: Record<string, number> = {};
  notifs.filter((n) => !n.lida).forEach((n) => {
    unreadByTipo[n.tipo] = (unreadByTipo[n.tipo] ?? 0) + 1;
  });
  const totalUnread = notifs.filter((n) => !n.lida).length;

  // Apply filters
  const filtered = notifs.filter((n) => {
    if (tipoFiltro !== "todos" && n.tipo !== tipoFiltro) return false;
    if (apenasNaoLidas && n.lida) return false;
    return true;
  });

  const tiposList = ["todos", "atualizacao", "anamnese", "avaliacao", "treino_completo", "dieta_completa", "mensagem", "alerta"];

  return (
    <div className="space-y-4">
      {/* Filter pills — tipo. Scroll horizontal em vez de quebrar linha: com 8
          chips, o wrap deixava "Alertas" sozinho numa segunda linha torta. */}
      <div className="flex gap-2 items-center overflow-x-auto scrollbar-none pb-1">
        {tiposList.map((tipo) => {
          const count = tipo === "todos" ? totalUnread : (unreadByTipo[tipo] ?? 0);
          const active = tipoFiltro === tipo;
          return (
            <button
              key={tipo}
              onClick={() => setTipoFiltro(tipo)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 whitespace-nowrap"
              style={{
                backgroundColor: active ? "var(--filter-active-bg)" : "var(--ui-inactive-bg)",
                color: active ? "var(--filter-active-color)" : "var(--ui-inactive-color)",
                border: `1px solid ${active ? "var(--filter-active-border)" : "var(--ui-inactive-border)"}`,
              }}
            >
              {TIPO_LABEL[tipo]}
              {count > 0 && (
                <span
                  className="min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-1"
                  style={{
                    backgroundColor: active ? "var(--filter-badge-bg)" : "rgba(239,68,68,0.25)",
                    color: active ? "var(--filter-badge-color)" : "#f87171",
                  }}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter pills — estado de leitura + ação em massa (linha própria, nunca mistura com os chips de tipo) */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          onClick={() => setApenasNaoLidas((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            backgroundColor: apenasNaoLidas ? "rgba(239,68,68,0.12)" : "var(--ui-inactive-bg)",
            color: apenasNaoLidas ? "#f87171" : "var(--ui-inactive-color)",
            border: `1px solid ${apenasNaoLidas ? "rgba(239,68,68,0.3)" : "var(--ui-inactive-border)"}`,
          }}
        >
          Não lidas
        </button>
        {totalUnread > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{
              backgroundColor: "var(--ui-inactive-bg)",
              color: "var(--ui-inactive-color)",
              border: "1px solid var(--ui-inactive-border)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-high)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ui-inactive-color)"; }}
          >
            <Check className="w-3 h-3" />
            Marcar todas lidas
          </button>
        )}
      </div>

      {/* Notification list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-white/25">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Inbox className="w-10 h-10 text-white/10" />
            <p className="text-sm text-white/30">
              {apenasNaoLidas ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
              {tipoFiltro !== "todos" ? ` para ${TIPO_LABEL[tipoFiltro].toLowerCase()}` : ""}
            </p>
          </div>
        ) : (
          filtered.map((n, i) => {
            const IconComp = TIPO_ICON[n.tipo] ?? Bell;
            const cor = TIPO_COR[n.tipo] ?? TIPO_COR.info;
            const isLast = i === filtered.length - 1;
            return (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3.5 transition-colors"
                style={{
                  borderBottom: isLast ? "none" : "1px solid var(--row-divider)",
                  backgroundColor: n.lida ? "transparent" : "rgba(var(--cp-rgb),0.03)",
                }}
              >
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: n.lida ? "var(--toggle-bg)" : cor.bg }}
                >
                  <IconComp
                    className="w-4 h-4"
                    style={{ color: n.lida ? "rgba(255,255,255,0.25)" : cor.text }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold leading-snug ${n.lida ? "text-white/45" : "text-white"}`}>
                      {n.titulo}
                    </p>
                    <p className="text-[10px] text-white/25 shrink-0 mt-0.5">
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>

                  {/* Aluno tag */}
                  {n.aluno_nome && (
                    <div className="flex items-center gap-1 mt-1">
                      <div
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: "var(--subtle-overlay)" }}
                      >
                        <User className="w-2.5 h-2.5 text-white/40" />
                        <span className="text-[10px] text-white/50 font-medium">{n.aluno_nome}</span>
                      </div>
                    </div>
                  )}

                  {n.mensagem && (
                    <p className="text-xs text-white/35 mt-1 leading-relaxed">{n.mensagem}</p>
                  )}

                  <p className="text-[10px] text-white/20 mt-1.5">
                    {format(parseISO(n.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>

                {/* Mark-read button */}
                {!n.lida && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors mt-0.5"
                    style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(34,197,94,0.15)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
                    title="Marcar como lida"
                  >
                    <Check className="w-3.5 h-3.5 text-white/40" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ─── Sender Tab ───────────────────────────────────────────────────────────────

const SenderTab = ({ orgId }: { orgId: string }) => {
  const { toast } = useToast();
  const [students,     setStudents]     = useState<Student[]>([]);
  const [logs,         setLogs]         = useState<NotifLog[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [target,       setTarget]       = useState<"all" | string>("all");
  const [title,        setTitle]        = useState("");
  const [body,         setBody]         = useState("");
  const [showHistory,  setShowHistory]  = useState(false);

  useEffect(() => {
    if (!orgId) return;
    loadData();
  }, [orgId]);

  const loadData = async () => {
    try {
      const { data: alunosData } = await supabase
        .from("alunos")
        .select("id, user_id, profiles!inner(nome)")
        .eq("org_id", orgId)
        .eq("ativo", true);

      setStudents(
        (alunosData ?? []).map((a: any) => ({
          id: a.id,
          user_id: a.user_id,
          nome: a.profiles?.nome ?? "Aluno",
        }))
      );
      await loadLogs();
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    const { data } = await supabase
      .from("notification_logs")
      .select("id, title, body, notification_type, delivered, created_at, recipient_id")
      .eq("org_id", orgId)
      .in("notification_type", ["manual", "trainer_action"])
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs((data as NotifLog[]) ?? []);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles").select("nome").eq("id", user?.id).maybeSingle();
      const trainerName = profile?.nome ?? "Treinador";

      if (target === "all") {
        await Promise.all(
          students.map((s) =>
            supabase.functions.invoke("notify-trainer-action", {
              body: {
                type: "manual",
                student_id: s.user_id,
                org_id: orgId,
                trainer_name: trainerName,
                student_name: s.nome,
                extra: { title: title.trim(), body: body.trim() },
              },
            })
          )
        );
        toast({ title: `Notificação enviada para ${students.length} aluno(s)!` });
      } else {
        const student = students.find((s) => s.user_id === target);
        await supabase.functions.invoke("notify-trainer-action", {
          body: {
            type: "manual",
            student_id: target,
            org_id: orgId,
            trainer_name: trainerName,
            student_name: student?.nome,
            extra: { title: title.trim(), body: body.trim() },
          },
        });
        toast({ title: "Notificação enviada!" });
      }
      setTitle(""); setBody("");
      await loadLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao enviar", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Form */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>

        {/* Destinatário */}
        <div className="space-y-2">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Destinatário</Label>
          <div className="relative">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl h-11 px-3 text-white text-sm focus:outline-none focus:border-white/30"
            >
              <option value="all">Todos os alunos ({students.length})</option>
              {students.map((s) => (
                <option key={s.user_id} value={s.user_id}>{s.nome}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        {/* Emoji shortcuts */}
        <div className="flex flex-wrap gap-1.5">
          {EMOJI_SUGGESTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setTitle((t) => t + emoji)}
              className="w-8 h-8 rounded-lg text-base hover:bg-white/10 transition-colors flex items-center justify-center"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Título */}
        <div className="space-y-2">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Título</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: 💪 Novo treino disponível!"
            className="bg-white/5 border-white/10 text-white rounded-xl h-11"
            maxLength={80}
          />
          <p className="text-[11px] text-white/20 text-right">{title.length}/80</p>
        </div>

        {/* Mensagem */}
        <div className="space-y-2">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Mensagem</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Digite a mensagem completa aqui..."
            rows={3}
            className="bg-white/5 border-white/10 text-white rounded-xl resize-none"
            maxLength={200}
          />
          <p className="text-[11px] text-white/20 text-right">{body.length}/200</p>
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="w-full h-11 rounded-xl text-white font-semibold"
          style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
        >
          {sending
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
            : <><Send className="w-4 h-4 mr-2" />Enviar notificação</>}
        </Button>
      </div>

      {/* Histórico */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors mb-3"
        >
          <Clock className="w-4 h-4" />
          Histórico de notificações enviadas
          <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>

        {showHistory && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-white/25 text-center py-4">Nenhuma notificação enviada ainda.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0`}
                    style={{ backgroundColor: log.delivered ? "hsl(var(--primary))" : "rgba(255,255,255,0.2)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80 truncate">{log.title}</p>
                    <p className="text-xs text-white/40 truncate">{log.body}</p>
                    <p className="text-[11px] text-white/25 mt-0.5">
                      {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  {log.delivered && (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(var(--primary) / 0.6)" }} />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotificationsManager() {
  const { orgId } = useTenantContext();
  const [tab,    setTab]    = useState<"inbox" | "sender">("inbox");
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const TAB_BTN = (id: "inbox" | "sender", label: string, icon: React.ElementType) => {
    const Icon = icon;
    const active = tab === id;
    return (
      <button
        key={id}
        onClick={() => setTab(id)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
        style={{
          backgroundColor: active ? "var(--filter-active-bg)" : "var(--ui-inactive-bg)",
          color: active ? "var(--filter-active-color)" : "var(--ui-inactive-color)",
          border: `1px solid ${active ? "var(--filter-active-border)" : "var(--ui-inactive-border)"}`,
        }}
      >
        <Icon className="w-4 h-4" />
        {label}
      </button>
    );
  };

  return (
    <div className="px-6 lg:px-8 py-6 lg:py-8">
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(var(--cp-rgb,22,163,74),0.12)" }}
        >
          <Bell className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Notificações</h2>
          <p className="text-xs text-white/40">Central de alertas e comunicações</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TAB_BTN("inbox",  "Recebidas", Inbox)}
        {TAB_BTN("sender", "Enviar",    Send)}
      </div>

      {/* Content */}
      {tab === "inbox"  && userId && orgId && <InboxTab  userId={userId} orgId={orgId} />}
      {tab === "sender" && orgId            && <SenderTab orgId={orgId} />}
    </div>
    </div>
  );
}
