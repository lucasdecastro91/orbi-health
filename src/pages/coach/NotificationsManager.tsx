import { useState, useEffect } from "react";
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
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  profiles?: { nome: string };
}

export default function NotificationsManager() {
  const { orgId, slug } = useTenantContext();
  const { toast } = useToast();

  const [students, setStudents]       = useState<Student[]>([]);
  const [logs, setLogs]               = useState<NotifLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);

  // Form
  const [target, setTarget]       = useState<"all" | string>("all"); // "all" ou user_id
  const [title, setTitle]         = useState("");
  const [body, setBody]           = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const EMOJI_SUGGESTIONS = ["📣", "💪", "🏋️", "🔥", "⚡", "🎯", "✨", "📋", "🥗", "💧", "⏰", "🌟"];

  useEffect(() => {
    if (!orgId) return;
    loadData();
  }, [orgId]);

  const loadData = async () => {
    try {
      // Alunos
      const { data: alunosData } = await supabase
        .from("alunos")
        .select("id, user_id, profiles!inner(nome)")
        .eq("org_id", orgId)
        .eq("ativo", true);

      const mapped = (alunosData ?? []).map((a: any) => ({
        id: a.id,
        user_id: a.user_id,
        nome: a.profiles?.nome ?? "Aluno",
      }));
      setStudents(mapped);

      // Logs
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
        // Envia para todos os alunos em paralelo
        const promises = students.map((s) =>
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
        );
        await Promise.all(promises);
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

      setTitle("");
      setBody("");
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(var(--cp-rgb,22,163,74),0.12)" }}>
          <Bell className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Notificações</h2>
          <p className="text-xs text-white/40">Envie mensagens push para seus alunos</p>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-white/6 bg-white/3 p-5 space-y-4">

        {/* Destinatário */}
        <div className="space-y-2">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Destinatário</Label>
          <div className="relative">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl h-11 px-3 text-white text-sm focus:outline-none focus:border-white/30">
              <option value="all">👥 Todos os alunos ({students.length})</option>
              {students.map((s) => (
                <option key={s.user_id} value={s.user_id}>👤 {s.nome}</option>
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

        {/* Botão enviar */}
        <Button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="w-full h-11 rounded-xl text-white font-semibold"
          style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}>
          {sending
            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
            : <><Send className="w-4 h-4 mr-2" />Enviar notificação</>}
        </Button>
      </div>

      {/* Histórico */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors mb-3">
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
                <div key={log.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${log.delivered ? "bg-green-400" : "bg-white/20"}`}
                    style={log.delivered ? { backgroundColor: "hsl(var(--primary))" } : {}} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80 truncate">{log.title}</p>
                    <p className="text-xs text-white/40 truncate">{log.body}</p>
                    <p className="text-[11px] text-white/25 mt-0.5">
                      {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  {log.delivered && (
                    <CheckCircle2 className="w-4 h-4 text-green-400/60 shrink-0 mt-0.5"
                      style={{ color: "hsl(var(--primary) / 0.6)" }} />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
