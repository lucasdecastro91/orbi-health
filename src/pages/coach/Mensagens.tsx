import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { sendPushNotification } from "@/lib/push";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Search, MessageSquare, ArrowLeft, Loader2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface Mensagem {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string;
  lida: boolean;
  created_at: string;
}

interface Aluno {
  user_id: string;
  profiles: { nome: string };
}

// ── Helpers ────────────────────────────────────────────────────────
const formatMsgTime = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d))     return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
};

// ── Main component ─────────────────────────────────────────────────
const Mensagens = () => {
  const { toast }       = useToast();
  const { orgId }       = useTenantContext();

  const [myId,         setMyId]         = useState<string | null>(null);
  const [alunos,       setAlunos]       = useState<Aluno[]>([]);
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<Aluno | null>(null);
  const [mensagens,    setMensagens]    = useState<Mensagem[]>([]);
  const [unreadMap,    setUnreadMap]    = useState<Record<string, number>>({});
  const [input,        setInput]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [loadingMsgs,  setLoadingMsgs]  = useState(false);
  const [mobileChat,   setMobileChat]   = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // ── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      await loadAlunos(user.id);
      await loadUnreadCounts(user.id);
    };
    init();
  }, []);

  // ── Real-time subscription (new messages to me) ───────────────────
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel(`msgs-coach-${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `destinatario_id=eq.${myId}` },
        (payload) => {
          const msg = payload.new as Mensagem;
          if (selected?.user_id === msg.remetente_id) {
            setMensagens((prev) => [...prev, msg]);
            markRead(msg.remetente_id, myId);
          } else {
            setUnreadMap((prev) => ({
              ...prev,
              [msg.remetente_id]: (prev[msg.remetente_id] ?? 0) + 1,
            }));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myId, selected]);

  // ── Scroll to bottom on new messages ──────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const loadAlunos = async (coachId: string) => {
    const { data, error } = await supabase
      .from("alunos")
      .select("user_id, profiles!alunos_user_id_fkey(nome)")
      .eq("treinador_id", coachId);
    if (!error) setAlunos((data ?? []) as unknown as Aluno[]);
  };

  const loadUnreadCounts = async (coachId: string) => {
    const { data } = await supabase
      .from("mensagens")
      .select("remetente_id")
      .eq("destinatario_id", coachId)
      .eq("lida", false);

    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((m) => { counts[m.remetente_id] = (counts[m.remetente_id] ?? 0) + 1; });
      setUnreadMap(counts);
    }
  };

  const loadMessages = useCallback(async (alunoId: string, coachId: string) => {
    setLoadingMsgs(true);
    try {
      const { data, error } = await supabase
        .from("mensagens")
        .select("*")
        .or(
          `and(remetente_id.eq.${coachId},destinatario_id.eq.${alunoId}),and(remetente_id.eq.${alunoId},destinatario_id.eq.${coachId})`,
        )
        .order("created_at");

      if (error) throw error;
      setMensagens(data as Mensagem[]);
      await markRead(alunoId, coachId);
    } catch (err: any) {
      toast({ title: "Erro ao carregar mensagens", description: err.message, variant: "destructive" });
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const markRead = async (senderId: string, recipientId: string) => {
    await supabase
      .from("mensagens")
      .update({ lida: true })
      .eq("remetente_id", senderId)
      .eq("destinatario_id", recipientId)
      .eq("lida", false);

    setUnreadMap((prev) => { const n = { ...prev }; delete n[senderId]; return n; });
  };

  const selectAluno = (aluno: Aluno) => {
    setSelected(aluno);
    setMobileChat(true);
    if (myId) loadMessages(aluno.user_id, myId);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selected || !myId || sending) return;

    setSending(true);
    const optimistic: Mensagem = {
      id: `tmp-${Date.now()}`,
      remetente_id: myId,
      destinatario_id: selected.user_id,
      conteudo: text,
      lida: false,
      created_at: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const { data, error } = await supabase.from("mensagens").insert({
        org_id:          orgId,
        remetente_id:    myId,
        destinatario_id: selected.user_id,
        conteudo:        text,
      }).select("*").single();

      if (error) throw error;
      setMensagens((prev) => prev.map((m) => m.id === optimistic.id ? data as Mensagem : m));

      // Push notification to recipient
      sendPushNotification({
        user_ids: [selected.user_id],
        title:    "Nova mensagem do treinador",
        body:     text.slice(0, 100),
        tag:      "mensagem",
        url:      `/aluno/mensagens`,
      });
    } catch (err: any) {
      setMensagens((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Filtered alunos ───────────────────────────────────────────────
  const filteredAlunos = alunos.filter((a) =>
    a.profiles.nome.toLowerCase().includes(search.toLowerCase()),
  );

  const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0);

  // ── Render conversation list ──────────────────────────────────────
  const ConvList = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-white/6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar aluno..."
            className="w-full h-9 rounded-xl bg-white/5 border border-white/8 pl-9 pr-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/40 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredAlunos.length === 0 ? (
          <p className="text-center text-white/30 text-sm py-8">Nenhum aluno encontrado</p>
        ) : (
          filteredAlunos.map((aluno) => {
            const unread = unreadMap[aluno.user_id] ?? 0;
            const isSel  = selected?.user_id === aluno.user_id;
            const initials = aluno.profiles.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

            return (
              <button
                key={aluno.user_id}
                onClick={() => selectAluno(aluno)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
                style={{ backgroundColor: isSel ? "rgba(var(--cp-rgb),0.08)" : undefined }}
                onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background: isSel
                      ? "linear-gradient(135deg, var(--cp-500), hsl(var(--primary)))"
                      : "rgba(120,120,128,0.18)",
                    color: isSel ? "#fff" : "var(--muted-foreground)",
                  }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground" style={isSel ? { color: "var(--cp-400)" } : undefined}>
                    {aluno.profiles.nome}
                  </p>
                  <p className="text-xs text-foreground/30 truncate">
                    {unread > 0 ? `${unread} mensagem${unread > 1 ? "ns" : ""} nova${unread > 1 ? "s" : ""}` : "Toque para conversar"}
                  </p>
                </div>
                {unread > 0 && (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: "var(--cp-gradient)" }}
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Render chat area ──────────────────────────────────────────────
  const ChatArea = () => {
    if (!selected) {
      return (
        <div className="hidden lg:flex flex-1 items-center justify-center flex-col gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
            <MessageSquare className="w-7 h-7 text-green-500/40" />
          </div>
          <p className="text-white/40 text-sm">Selecione um aluno para conversar</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6">
          <button
            onClick={() => { setMobileChat(false); setSelected(null); }}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: "var(--cp-gradient)" }}
          >
            {selected.profiles.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{selected.profiles.nome}</p>
            <p className="text-xs text-white/35">Aluno</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loadingMsgs ? (
            <div className="flex items-center justify-center py-12 gap-2 text-white/30">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : mensagens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <MessageSquare className="w-8 h-8 text-white/15" />
              <p className="text-white/30 text-sm">Nenhuma mensagem ainda.</p>
              <p className="text-white/20 text-xs">Envie uma mensagem para começar a conversa.</p>
            </div>
          ) : (
            mensagens.map((msg) => {
              const isMe = msg.remetente_id === myId;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] rounded-2xl px-4 py-2.5"
                    style={{
                      background: isMe ? "linear-gradient(135deg, var(--cp-500), hsl(var(--primary)))" : "rgba(255,255,255,0.07)",
                      borderBottomRightRadius: isMe ? "6px" : undefined,
                      borderBottomLeftRadius:  isMe ? undefined : "6px",
                    }}
                  >
                    <p className="text-sm leading-relaxed" style={{ color: "#fff" }}>
                      {msg.conteudo}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: isMe ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                      {formatMsgTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-white/6">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva uma mensagem..."
              rows={1}
              className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/40 transition-colors resize-none max-h-28 overflow-y-auto"
              style={{ minHeight: "44px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-all"
              style={{ background: "var(--cp-gradient)" }}
            >
              {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-[11px] text-white/20 mt-1.5 ml-1">Enter para enviar · Shift+Enter para nova linha</p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-0px)] lg:h-[calc(100vh-0px)] flex flex-col">
      {/* Page header (visible on desktop) */}
      <div className="px-6 lg:px-8 py-5 border-b border-white/6 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Mensagens</h1>
          {totalUnread > 0 && (
            <p className="text-xs text-green-500/80 mt-0.5">{totalUnread} mensagem{totalUnread > 1 ? "ns" : ""} não lida{totalUnread > 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* Chat layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conv list — hidden on mobile when chat is open */}
        <div
          className={`${mobileChat ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-72 border-r border-white/6 shrink-0`}
          style={{ backgroundColor: "rgba(255,255,255,0.01)" }}
        >
          <ConvList />
        </div>

        {/* Chat area — hidden on mobile when list is shown */}
        <div className={`${!mobileChat ? "hidden lg:flex" : "flex"} flex-1 overflow-hidden`}>
          <ChatArea />
        </div>
      </div>
    </div>
  );
};

export default Mensagens;
