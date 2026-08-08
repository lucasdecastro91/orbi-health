import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { X, Send, Loader2 } from "lucide-react";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/** Símbolo da ORBI recolorido via CSS mask — nunca usa o verde fixo do SVG original,
 * a cor sempre vem de fora (branco aqui, mas poderia ser qualquer cor configurável).
 * O arquivo original tem uma margem interna em volta do anel (viewBox 64x64, anel
 * ocupa só ~70%) — "zoom" > 100% corta essa margem pra preencher mais o container. */
const OrbiMark = ({ size, color, zoom = 100 }: { size: number; color: string; zoom?: number }) => (
  <div
    style={{
      width: size,
      height: size,
      backgroundColor: color,
      WebkitMaskImage: "url(/logos/orbi-logo-icon.svg)",
      maskImage: "url(/logos/orbi-logo-icon.svg)",
      WebkitMaskSize: `${zoom}%`,
      maskSize: `${zoom}%`,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
    }}
  />
);

const SupportAgentBubble = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [open,     setOpen]     = useState(false);
  const [loaded,   setLoaded]   = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input,    setInput]    = useState("");
  const [sending,  setSending]  = useState(false);
  const [teaserDismissed, setTeaserDismissed] = useState(
    () => localStorage.getItem("orbi_agent_teaser_dismissed") === "1"
  );

  const dismissTeaser = () => {
    localStorage.setItem("orbi_agent_teaser_dismissed", "1");
    setTeaserDismissed(true);
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !loaded && orgId) loadHistory();
  }, [open, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("agent_conversations")
        .select("role, content")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(40);
      if (error) throw error;
      setMessages((data ?? []) as AgentMessage[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar conversa", description: err.message, variant: "destructive" });
    } finally {
      setLoaded(true);
    }
  };

  const handleSend = async () => {
    const message = input.trim();
    if (!message || sending || !orgId) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("agente-suporte", {
        body: { org_id: orgId, message },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "Erro ao falar com o agente");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      toast({ title: "Erro no agente de suporte", description: err.message, variant: "destructive" });
      // Remove a mensagem otimista do usuário já que não foi respondida/salva
      setMessages((prev) => prev.slice(0, -1));
      setInput(message);
    } finally {
      setSending(false);
    }
  };

  const openChat = () => {
    setOpen(true);
    dismissTeaser();
  };

  return (
    <>
      {/* Balão de saudação — teaser antes de abrir o chat */}
      {!open && !teaserDismissed && (
        <div
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-2xl pl-4 pr-2.5 py-3 cursor-pointer"
          style={{ backgroundColor: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}
          onClick={openChat}
        >
          <p className="text-sm font-medium" style={{ color: "#18181b" }}>Olá, como posso ajudar hoje?</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismissTeaser(); }}
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 hover:bg-black/5 transition-colors"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" style={{ color: "#71717a" }} />
          </button>
        </div>
      )}

      {/* Balão flutuante */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openChat())}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
        style={{ background: "var(--cp-gradient)", boxShadow: "0 4px 20px rgba(var(--cp-rgb),0.4)" }}
        title="Assistente ORBI Health"
      >
        {open ? <X className="w-5 h-5 text-white" /> : <OrbiMark size={48} color="#fff" />}
      </button>

      {/* Painel de chat */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-8rem))] rounded-2xl border flex flex-col overflow-hidden"
          style={{ backgroundColor: "#0f0f11", borderColor: "rgba(255,255,255,0.1)", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--cp-gradient)" }}>
              <OrbiMark size={32} color="#fff" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Assistente ORBI Health</p>
              <p className="text-[11px] text-white/40">Dúvidas sobre a plataforma</p>
            </div>
          </div>

          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {!loaded ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
                <div className="opacity-20"><OrbiMark size={32} color="#fff" /></div>
                <p className="text-sm text-white/40">
                  Pergunte qualquer coisa sobre como usar o ORBI Health — planos, funcionalidades, onde encontrar cada coisa.
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words"
                    style={
                      m.role === "user"
                        ? { background: "var(--cp-gradient)", color: "#fff" }
                        : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" }
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 shrink-0 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Digite sua pergunta..."
              disabled={sending}
              className="flex-1 h-10 rounded-xl px-3.5 text-sm text-white placeholder:text-white/30 outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
              style={{ background: "var(--cp-gradient)" }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SupportAgentBubble;
