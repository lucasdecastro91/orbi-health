import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, MessageSquare, Loader2 } from "lucide-react";

interface Mensagem {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string;
  lida: boolean;
  created_at: string;
}

const formatMsgTime = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d))     return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
};

const MensagensAluno = () => {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const { orgId }   = useTenantContext();

  const [myId,        setMyId]        = useState<string | null>(null);
  const [treinadorId, setTreinadorId] = useState<string | null>(null);
  const [treinadorNome, setTreinadorNome] = useState("Treinador");
  const [mensagens,   setMensagens]   = useState<Mensagem[]>([]);
  const [input,       setInput]       = useState("");
  const [sending,     setSending]     = useState(false);
  const [loading,     setLoading]     = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // ── Init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      setMyId(session.user.id);

      // Busca treinador do aluno
      const { data: aluno } = await supabase
        .from("alunos")
        .select("treinador_id, profiles!alunos_treinador_id_fkey(nome)")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (aluno?.treinador_id) {
        setTreinadorId(aluno.treinador_id);
        setTreinadorNome((aluno as any).profiles?.nome ?? "Treinador");
        await loadMessages(session.user.id, aluno.treinador_id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Real-time ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`msgs-student-${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `destinatario_id=eq.${myId}` },
        (payload) => {
          setMensagens((prev) => [...prev, payload.new as Mensagem]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const loadMessages = useCallback(async (alunoId: string, trId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mensagens")
        .select("*")
        .or(
          `and(remetente_id.eq.${alunoId},destinatario_id.eq.${trId}),and(remetente_id.eq.${trId},destinatario_id.eq.${alunoId})`,
        )
        .order("created_at");

      if (error) throw error;
      setMensagens(data as Mensagem[]);

      // Marca como lidas
      await supabase
        .from("mensagens")
        .update({ lida: true })
        .eq("remetente_id", trId)
        .eq("destinatario_id", alunoId)
        .eq("lida", false);
    } catch (err: any) {
      toast({ title: "Erro ao carregar mensagens", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !myId || !treinadorId || sending) return;

    setSending(true);
    const optimistic: Mensagem = {
      id: `tmp-${Date.now()}`,
      remetente_id: myId,
      destinatario_id: treinadorId,
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
        destinatario_id: treinadorId,
        conteudo:        text,
      }).select("*").single();

      if (error) throw error;
      setMensagens((prev) => prev.map((m) => m.id === optimistic.id ? data as Mensagem : m));
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

  const initials = treinadorNome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 9rem)" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/6">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0"
          style={{ background: "var(--cp-gradient)" }}
        >
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{treinadorNome}</p>
          <p className="text-xs text-muted-foreground">Seu treinador</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : !treinadorId ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-sm">Nenhum treinador vinculado</p>
            <p className="text-muted-foreground opacity-60 text-xs">Fale com seu treinador para ser adicionado à plataforma.</p>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-sm">Nenhuma mensagem ainda</p>
            <p className="text-muted-foreground opacity-60 text-xs">Envie uma mensagem para seu treinador!</p>
          </div>
        ) : (
          mensagens.map((msg) => {
            const isMe = msg.remetente_id === myId;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[78%] rounded-2xl px-4 py-2.5"
                  style={{
                    background: isMe ? "linear-gradient(135deg, var(--cp-500), hsl(var(--primary)))" : "rgba(255,255,255,0.07)",
                    borderBottomRightRadius: isMe ? "6px" : undefined,
                    borderBottomLeftRadius:  isMe ? undefined : "6px",
                  }}
                >
                  <p className={`text-sm leading-relaxed ${isMe ? "text-primary-foreground" : "text-foreground"}`}>
                    {msg.conteudo}
                  </p>
                  <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground opacity-60" : "text-muted-foreground"}`}>
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
      {treinadorId && (
        <div className="px-4 py-3 border-t border-white/6">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem para o treinador..."
              rows={1}
              className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-green-600/40 transition-colors resize-none max-h-28 overflow-y-auto"
              style={{ minHeight: "44px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 disabled:opacity-40"
              style={{ background: "var(--cp-gradient)" }}
            >
              {sending ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" /> : <Send className="w-4 h-4 text-primary-foreground" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MensagensAluno;
