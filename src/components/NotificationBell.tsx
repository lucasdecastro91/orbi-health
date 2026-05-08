import { useState, useEffect, useRef } from "react";
import { Bell, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string | null;
  tipo: string;
  lida: boolean;
  created_at: string;
}

const TIPO_EMOJI: Record<string, string> = {
  checkin:  "📋",
  anamnese: "📝",
  alerta:   "⚠️",
  info:     "ℹ️",
};

const NotificationBell = () => {
  const [notifs,  setNotifs]  = useState<Notificacao[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await load(user.id);

    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        (payload) => setNotifs((prev) => [payload.new as Notificacao, ...prev]),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const load = async (uid: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notificacoes")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(25);
      setNotifs((data as Notificacao[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("user_id", userId)
      .eq("lida", false);
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const markRead = async (id: string) => {
    if (notifs.find((n) => n.id === id)?.lida) return;
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  };

  const unread = notifs.filter((n) => !n.lida).length;

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
        style={{ color: open ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.06)";
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        }}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 pointer-events-none"
            style={{ backgroundColor: "hsl(0 70% 55%)", color: "#fff" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-11 w-80 rounded-2xl border shadow-2xl z-50 overflow-hidden"
          style={{ backgroundColor: "#17171a", borderColor: "rgba(255,255,255,0.1)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Notificações</p>
              {unread > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)", color: "var(--cp-500)" }}
                >
                  {unread} nova{unread !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] transition-colors"
                style={{ color: "var(--cp-500)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--cp-400)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--cp-500)"; }}
              >
                Marcar todas lidas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-white/25">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Carregando...</span>
              </div>
            ) : notifs.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-white/30 text-sm">Sem notificações</p>
              </div>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    backgroundColor: n.lida ? "transparent" : "rgba(var(--cp-rgb),0.04)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = n.lida ? "transparent" : "rgba(var(--cp-rgb),0.04)"; }}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5 shrink-0 leading-none">
                      {TIPO_EMOJI[n.tipo] ?? "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-snug ${n.lida ? "text-white/50" : "text-white"}`}>
                        {n.titulo}
                      </p>
                      {n.mensagem && (
                        <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">{n.mensagem}</p>
                      )}
                      <p className="text-[10px] text-white/20 mt-1">
                        {format(parseISO(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    {!n.lida && (
                      <div
                        className="w-2 h-2 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: "var(--cp-500)" }}
                      />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
