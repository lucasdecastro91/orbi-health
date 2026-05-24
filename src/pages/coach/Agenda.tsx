import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, startOfWeek, endOfWeek, isToday, parseISO,
  isSameMonth, setHours, setMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2,
  Clock, User, CheckCircle, XCircle, Calendar,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface Agendamento {
  id: string;
  titulo: string;
  descricao: string | null;
  data_hora: string;
  duracao_minutos: number;
  tipo: "consulta" | "avaliacao" | "retorno";
  status: "agendado" | "concluido" | "cancelado";
  aluno_id: string | null;
  profiles?: { nome: string } | null;
}

interface AlunoOption {
  user_id: string;
  profiles: { nome: string };
}

// ── Constants ──────────────────────────────────────────────────────
const TIPO_CONFIG = {
  consulta:  { label: "Consulta",   color: "var(--cp-500)", bg: "rgba(var(--cp-rgb),0.15)" },
  avaliacao: { label: "Avaliação",  color: "hsl(217 91% 65%)", bg: "rgba(99,155,234,0.15)" },
  retorno:   { label: "Retorno",    color: "var(--cp-400)", bg: "rgba(74,197,117,0.15)" },
};

const STATUS_CONFIG = {
  agendado:  { label: "Agendado",   color: "rgba(255,255,255,0.6)" },
  concluido: { label: "Concluído",  color: "var(--cp-400)" },
  cancelado: { label: "Cancelado",  color: "hsl(0 70% 55%)" },
};

const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// ── Calendar ───────────────────────────────────────────────────────
const CalendarGrid = ({
  month, selected, appointments, onSelect,
}: {
  month: Date;
  selected: string;
  appointments: Map<string, Agendamento[]>;
  onSelect: (d: string) => void;
}) => {
  const start  = startOfMonth(month);
  const end    = endOfMonth(month);
  const days   = eachDayOfInterval({ start, end });
  const offset = (getDay(start) + 6) % 7; // Monday first

  const cells: (Date | null)[] = [...Array(offset).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-white/30 py-1.5">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="aspect-square" />;
          const key    = format(day, "yyyy-MM-dd");
          const apts   = appointments.get(key) ?? [];
          const isSel  = selected === key;
          const today  = isToday(day);
          const inMon  = isSameMonth(day, month);

          return (
            <button
              key={i}
              onClick={() => onSelect(key)}
              className="relative flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-all"
              style={{
                aspectRatio: "1",
                backgroundColor: isSel ? "rgba(var(--cp-rgb),0.15)" : today ? "var(--cal-today-bg)" : undefined,
                border: isSel ? "1.5px solid rgba(var(--cp-rgb),0.5)" : today ? "1px solid var(--cal-today-border)" : "1px solid transparent",
                opacity: inMon ? 1 : 0.3,
              }}
            >
              <span
                className="text-xs font-semibold leading-none"
                style={{ color: isSel ? "var(--cp-400)" : today ? "var(--cal-today-color)" : "var(--cal-day-color)" }}
              >
                {format(day, "d")}
              </span>
              {/* Appointment dots — always reserve space so number stays centered */}
              <div className="flex gap-0.5 h-1.5">
                {apts.slice(0, 3).map((a, j) => (
                  <div
                    key={j}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: TIPO_CONFIG[a.tipo]?.color ?? "rgba(255,255,255,0.4)" }}
                  />
                ))}
                {apts.length > 3 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Appointment card ───────────────────────────────────────────────
const AptCard = ({
  apt, onComplete, onCancel,
}: { apt: Agendamento; onComplete: () => void; onCancel: () => void }) => {
  const tipo   = TIPO_CONFIG[apt.tipo];
  const status = STATUS_CONFIG[apt.status];

  return (
    <div
      className="rounded-2xl border border-white/8 p-4 transition-colors"
      style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Time + duration */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: tipo.bg, color: tipo.color }}
            >
              {tipo.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-white/40">
              <Clock className="w-3 h-3" />
              {format(parseISO(apt.data_hora), "HH:mm")} · {apt.duracao_minutos}min
            </span>
            {apt.status !== "agendado" && (
              <span className="text-xs font-medium" style={{ color: status.color }}>
                {status.label}
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-white truncate">{apt.titulo}</p>

          {apt.profiles?.nome && (
            <p className="flex items-center gap-1 text-xs text-white/45 mt-0.5">
              <User className="w-3 h-3" />
              {apt.profiles.nome}
            </p>
          )}

          {apt.descricao && (
            <p className="text-xs text-white/30 mt-1.5 line-clamp-2 leading-relaxed">
              {apt.descricao}
            </p>
          )}
        </div>

        {/* Actions (only for agendado) */}
        {apt.status === "agendado" && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onComplete}
              title="Concluir"
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-white/25 hover:text-green-400 hover:bg-green-500/10"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onCancel}
              title="Cancelar"
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-white/25 hover:text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── New appointment modal ──────────────────────────────────────────
const NewAptModal = ({
  open, onClose, alunos, defaultDate, onSaved, orgId,
}: {
  open: boolean;
  onClose: () => void;
  alunos: AlunoOption[];
  defaultDate: string;
  onSaved: () => void;
  orgId: string | null;
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    aluno_id: "",
    data: defaultDate,
    hora: "09:00",
    duracao: "60",
    tipo: "consulta",
    descricao: "",
  });

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, data: defaultDate, titulo: "", descricao: "", aluno_id: "" }));
  }, [open, defaultDate]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [h, m] = form.hora.split(":").map(Number);
      const dataHora = new Date(`${form.data}T${form.hora}:00`);

      const { error } = await supabase.from("agendamentos").insert({
        org_id:          orgId,
        treinador_id:    user.id,
        aluno_id:        form.aluno_id || null,
        titulo:          form.titulo.trim(),
        descricao:       form.descricao || null,
        data_hora:       dataHora.toISOString(),
        duracao_minutos: Number(form.duracao),
        tipo:            form.tipo,
        status:          "agendado",
      });

      if (error) throw error;
      toast({ title: "Agendamento criado!" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao criar agendamento", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputCls = "w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors";
  const labelCls = "text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "#111113" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">Novo Agendamento</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={labelCls}>Título *</label>
            <input type="text" value={form.titulo} onChange={set("titulo")} placeholder="Ex: Avaliação física" required className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Aluno</label>
            <select value={form.aluno_id} onChange={set("aluno_id")} className={inputCls + " cursor-pointer"} style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <option value="">— Sem aluno vinculado —</option>
              {alunos.map((a) => (
                <option key={a.user_id} value={a.user_id}>{a.profiles.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Data *</label>
              <input type="date" value={form.data} onChange={set("data")} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hora *</label>
              <input type="time" value={form.hora} onChange={set("hora")} required className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Duração</label>
              <select value={form.duracao} onChange={set("duracao")} className={inputCls + " cursor-pointer"} style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">120 min</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={form.tipo} onChange={set("tipo")} className={inputCls + " cursor-pointer"} style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                <option value="consulta">Consulta</option>
                <option value="avaliacao">Avaliação</option>
                <option value="retorno">Retorno</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Descrição (opcional)</label>
            <textarea value={form.descricao} onChange={set("descricao")} rows={2} placeholder="Observações sobre o agendamento..." className={inputCls + " py-2.5 resize-none h-auto"} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !form.titulo.trim()} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "var(--cp-gradient)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "Salvando..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────
const Agenda = () => {
  const { toast }   = useToast();
  const { orgId }   = useTenantContext();

  const [month,      setMonth]      = useState(new Date());
  const [selected,   setSelected]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [apts,       setApts]       = useState<Agendamento[]>([]);
  const [alunos,     setAlunos]     = useState<AlunoOption[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modalOpen,  setModalOpen]  = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [aptsRes, alunosRes] = await Promise.all([
        supabase
          .from("agendamentos")
          .select("*")
          .eq("treinador_id", user.id)
          .order("data_hora"),
        supabase
          .from("alunos")
          .select("user_id, profiles!alunos_user_id_fkey(nome)")
          .eq("treinador_id", user.id),
      ]);

      if (aptsRes.error) throw aptsRes.error;

      // Build aluno_id → nome map and enrich appointments client-side
      // (avoids PostgREST schema-cache error when agendamentos has no direct FK to profiles)
      const alunoList = (alunosRes.data ?? []) as unknown as AlunoOption[];
      const nomeByUserId = new Map<string, string>(
        alunoList.map((a) => [a.user_id, a.profiles?.nome ?? ""])
      );
      const enriched = (aptsRes.data ?? []).map((a: any) => ({
        ...a,
        profiles: a.aluno_id && nomeByUserId.has(a.aluno_id)
          ? { nome: nomeByUserId.get(a.aluno_id)! }
          : null,
      }));

      setApts(enriched as Agendamento[]);
      setAlunos(alunoList);
    } catch (err: any) {
      toast({ title: "Erro ao carregar agenda", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Group appointments by date string
  const byDate = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    apts.forEach((a) => {
      const key = format(parseISO(a.data_hora), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [apts]);

  // Week days for the right panel
  const selDate  = useMemo(() => parseISO(selected), [selected]);
  const weekStart = useMemo(() => startOfWeek(selDate, { weekStartsOn: 1 }), [selDate]);
  const weekEnd   = useMemo(() => endOfWeek(selDate, { weekStartsOn: 1 }), [selDate]);
  const weekDaysArr = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setApts((prev) => prev.map((a) => a.id === id ? { ...a, status: status as any } : a));
  };

  const weekLabel = `${format(weekStart, "d 'de' MMM", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMM", { locale: ptBR })}`;

  return (
    <div className="px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Agenda</h1>
          <p className="text-white/40 text-sm mt-1">{apts.filter((a) => a.status === "agendado").length} agendamento{apts.filter(a => a.status === "agendado").length !== 1 ? "s" : ""} pendente{apts.filter(a => a.status === "agendado").length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="h-10 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-2 shrink-0"
          style={{ background: "var(--cp-gradient)" }}
        >
          <Plus className="w-4 h-4" />
          Novo agendamento
        </button>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">

        {/* ── Left: Calendar ── */}
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setMonth((m) => subMonths(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/8 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-white/50" />
            </button>
            <h2 className="text-sm font-semibold text-white capitalize">
              {format(month, "MMMM yyyy", { locale: ptBR })}
            </h2>
            <button
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/8 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-white/50" />
            </button>
          </div>

          <CalendarGrid
            month={month}
            selected={selected}
            appointments={byDate}
            onSelect={(d) => { setSelected(d); setMonth(parseISO(d)); }}
          />

          {/* Legend */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-white/6">
            {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => (
              <div key={tipo} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span className="text-[11px] text-white/40">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Week view ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-green-500/70" />
            <h3 className="text-sm font-semibold text-white/70">{weekLabel}</h3>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-white/30 py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : (
            weekDaysArr.map((day) => {
              const key  = format(day, "yyyy-MM-dd");
              const dayApts = byDate.get(key) ?? [];
              const isSel = key === selected;
              const today = isToday(day);

              return (
                <div key={key}>
                  {/* Day label */}
                  <button
                    onClick={() => setSelected(key)}
                    className="flex items-center gap-2 mb-2 group"
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-colors"
                      style={{
                        backgroundColor: isSel ? "rgba(var(--cp-rgb),0.15)" : today ? "rgba(255,255,255,0.06)" : "transparent",
                        color: isSel ? "var(--cp-400)" : today ? "#fff" : "rgba(255,255,255,0.5)",
                        border: isSel ? "1.5px solid rgba(var(--cp-rgb),0.4)" : today ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                      }}
                    >
                      {format(day, "d")}
                    </div>
                    <span className="text-sm font-medium capitalize" style={{ color: isSel ? "var(--cp-400)" : "rgba(255,255,255,0.5)" }}>
                      {format(day, "EEEE", { locale: ptBR })}
                    </span>
                    {dayApts.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                        {dayApts.length}
                      </span>
                    )}
                  </button>

                  {dayApts.length === 0 ? (
                    <div className="ml-10 mb-3 text-xs text-white/20 italic">Nenhum agendamento</div>
                  ) : (
                    <div className="ml-10 space-y-2 mb-3">
                      {dayApts
                        .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
                        .map((apt) => (
                          <AptCard
                            key={apt.id}
                            apt={apt}
                            onComplete={() => updateStatus(apt.id, "concluido")}
                            onCancel={() => updateStatus(apt.id, "cancelado")}
                          />
                        ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <NewAptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        alunos={alunos}
        defaultDate={selected}
        onSaved={loadAll}
        orgId={orgId}
      />
    </div>
  );
};

export default Agenda;
