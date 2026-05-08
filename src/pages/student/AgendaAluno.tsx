import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isAfter, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface Agendamento {
  id: string;
  titulo: string;
  descricao: string | null;
  data_hora: string;
  duracao_minutos: number;
  tipo: "consulta" | "avaliacao" | "retorno";
  status: "agendado" | "concluido" | "cancelado";
  treinador_profiles?: { nome: string } | null;
}

const TIPO_CONFIG = {
  consulta:  { label: "Consulta",  color: "var(--cp-500)", bg: "rgba(var(--cp-rgb),0.15)" },
  avaliacao: { label: "Avaliação", color: "hsl(217 91% 65%)", bg: "rgba(99,155,234,0.15)" },
  retorno:   { label: "Retorno",   color: "var(--cp-400)", bg: "rgba(74,197,117,0.15)" },
};

const STATUS_CONFIG = {
  agendado:  { label: "Agendado",  color: "hsl(var(--muted-foreground))", icon: Clock },
  concluido: { label: "Concluído", color: "var(--cp-400)",       icon: CheckCircle },
  cancelado: { label: "Cancelado", color: "hsl(0 70% 55%)",         icon: XCircle },
};

const AgendaAluno = () => {
  const { toast } = useToast();
  const [apts,    setApts]    = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"proximos" | "todos" | "passados">("proximos");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("aluno_id", session.user.id)
        .order("data_hora", { ascending: true });

      if (error) throw error;
      setApts(data as Agendamento[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar agenda", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const now = startOfDay(new Date());

  const filtered = apts.filter((a) => {
    const d = parseISO(a.data_hora);
    if (filter === "proximos") return isAfter(d, new Date()) && a.status === "agendado";
    if (filter === "passados") return isBefore(d, new Date()) || a.status !== "agendado";
    return true;
  });

  const FilterBtn = ({ value, label }: { value: typeof filter; label: string }) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-3 h-8 rounded-xl text-xs font-medium transition-colors ${filter !== value ? "bg-white/5 text-foreground/50" : ""}`}
      style={filter === value ? { background: "var(--cp-gradient)", color: "hsl(var(--primary-foreground))" } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      <div className="flex items-center gap-3 mb-5">
        <Calendar className="w-5 h-5 text-green-500" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Minha Agenda</h1>
          <p className="text-white/40 text-sm">Consultas e avaliações com o treinador</p>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        <FilterBtn value="proximos" label="Próximos" />
        <FilterBtn value="todos"    label="Todos" />
        <FilterBtn value="passados" label="Histórico" />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-white/30 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/8 py-14 flex flex-col items-center gap-3 text-center" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
          <Calendar className="w-10 h-10 text-white/15" />
          <p className="text-white/40 text-sm font-medium">
            {filter === "proximos" ? "Nenhum agendamento próximo" : "Nenhum agendamento encontrado"}
          </p>
          <p className="text-white/25 text-xs max-w-xs">
            Quando seu treinador agendar uma consulta ou avaliação, ela aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((apt) => {
            const tipo    = TIPO_CONFIG[apt.tipo];
            const status  = STATUS_CONFIG[apt.status];
            const SIcon   = status.icon;
            const dateStr = format(parseISO(apt.data_hora), "EEEE, dd 'de' MMMM", { locale: ptBR });
            const timeStr = format(parseISO(apt.data_hora), "HH:mm");

            return (
              <div
                key={apt.id}
                className="rounded-2xl border border-white/8 p-4"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  opacity: apt.status === "cancelado" ? 0.6 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tipo.bg, color: tipo.color }}
                      >
                        {tipo.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: status.color }}>
                        <SIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white mb-1">{apt.titulo}</p>
                    <p className="flex items-center gap-1.5 text-xs text-white/45 capitalize">
                      <Calendar className="w-3 h-3" />
                      {dateStr}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-white/45 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {timeStr} · {apt.duracao_minutos} min
                    </p>
                    {apt.descricao && (
                      <p className="text-xs text-white/30 mt-2 leading-relaxed">{apt.descricao}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgendaAluno;
