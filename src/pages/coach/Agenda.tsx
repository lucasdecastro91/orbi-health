import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isToday, parseISO, isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2,
  Clock, User, CheckCircle, XCircle, Calendar, Settings, Trash2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types ──────────────────────────────────────────────────────────
interface Agendamento {
  id: string;
  titulo: string;
  descricao: string | null;
  data_hora: string;
  duracao_minutos: number;
  tipo: string;
  status: "agendado" | "concluido" | "cancelado";
  aluno_id: string | null;
  profiles?: { nome: string } | null;
}

interface AlunoOption {
  user_id: string;
  profiles: { nome: string };
}

export interface TipoAgendamento {
  key: string;
  label: string;
  color: string;
}

// ── Constants ──────────────────────────────────────────────────────
// Usado só como fallback antes da org carregar, ou se a org nunca tiver
// configurado tipos próprios — os tipos de verdade vêm de
// `organizations.agendamento_tipos`, configuráveis pelo dono.
const DEFAULT_TIPOS: TipoAgendamento[] = [
  { key: "consulta",  label: "Consulta",  color: "var(--cp-500)" },
  { key: "avaliacao", label: "Avaliação", color: "hsl(217 91% 65%)" },
  { key: "retorno",   label: "Retorno",   color: "var(--cp-400)" },
];

const tipoBg = (color: string) => `color-mix(in srgb, ${color} 15%, transparent)`;

// Resolve any CSS color (var(--x), hsl(...), named color) to a hex string —
// needed because <input type="color"> only understands hex, but tipo.color
// can be a dynamic org-brand var (ex: "var(--cp-500)") to follow the tenant theme.
const resolveHex = (color: string): string => {
  if (color.startsWith("#")) return color;
  if (typeof document === "undefined") return "#60a5fa";
  const el = document.createElement("div");
  el.style.color = color;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return "#60a5fa";
  const [r, g, b] = m.map(Number);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
};

const STATUS_CONFIG = {
  agendado:  { label: "Agendado",   color: "rgba(255,255,255,0.6)" },
  concluido: { label: "Concluído",  color: "var(--cp-400)" },
  cancelado: { label: "Cancelado",  color: "hsl(0 70% 55%)" },
};

const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Mesmo tratamento "alto relevo" já usado no Dashboard e em Meus Clientes.
const CARD_BG     = "var(--section-card-bg)";
const CARD_BORDER = "var(--section-card-border)";
const CARD_SHADOW = "var(--section-card-shadow)";

// ── Calendar ───────────────────────────────────────────────────────
const CalendarGrid = ({
  month, selected, appointments, onSelect, tipoConfig,
}: {
  month: Date;
  selected: string;
  appointments: Map<string, Agendamento[]>;
  onSelect: (d: string) => void;
  tipoConfig: Record<string, TipoAgendamento>;
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
      <div className="grid grid-cols-7 mb-1.5">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-white/35 uppercase tracking-wider py-1.5">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key    = format(day, "yyyy-MM-dd");
          const apts   = appointments.get(key) ?? [];
          const isSel  = selected === key;
          const today  = isToday(day);
          const inMon  = isSameMonth(day, month);
          const visible = apts.slice(0, 2);
          const extra   = apts.length - visible.length;

          const cell = (
            <button
              onClick={() => onSelect(key)}
              className="relative flex flex-col items-start w-full rounded-2xl p-1.5 transition-all"
              style={{
                minHeight: "64px",
                backgroundColor: isSel ? "rgba(var(--cp-rgb),0.15)" : today ? "var(--cal-today-bg)" : undefined,
                border: isSel ? "1.5px solid rgba(var(--cp-rgb),0.5)" : today ? "1px solid var(--cal-today-border)" : "1px solid transparent",
                opacity: inMon ? 1 : 0.3,
              }}
            >
              <span
                className="text-sm font-bold leading-none mb-1"
                style={{ color: isSel ? "var(--cp-400)" : today ? "var(--cal-today-color)" : "var(--cal-day-color)" }}
              >
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-1 w-full">
                {visible.map((a) => (
                  <div
                    key={a.id}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate w-full text-left"
                    style={{ backgroundColor: tipoBg(tipoConfig[a.tipo]?.color ?? "rgba(255,255,255,0.4)"), color: tipoConfig[a.tipo]?.color ?? "rgba(255,255,255,0.6)" }}
                  >
                    {format(parseISO(a.data_hora), "HH:mm")} {a.titulo}
                  </div>
                ))}
                {extra > 0 && (
                  <span className="text-[10px] text-white/30 px-1.5">+{extra} mais</span>
                )}
              </div>
            </button>
          );

          if (apts.length === 0) return <div key={i}>{cell}</div>;

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                <div className="space-y-1">
                  {apts
                    .slice()
                    .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
                    .map((a) => (
                      <div key={a.id} className="flex items-center gap-1.5 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tipoConfig[a.tipo]?.color ?? "rgba(255,255,255,0.4)" }} />
                        <span className="font-medium">{format(parseISO(a.data_hora), "HH:mm")}</span>
                        <span className="truncate">{a.titulo}</span>
                      </div>
                    ))}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

// ── Appointment card ───────────────────────────────────────────────
const AptCard = ({
  apt, onComplete, onCancel, onDelete, tipoConfig,
}: { apt: Agendamento; onComplete: () => void; onCancel: () => void; onDelete: () => void; tipoConfig: Record<string, TipoAgendamento> }) => {
  const tipo   = tipoConfig[apt.tipo] ?? { label: apt.tipo, color: "rgba(255,255,255,0.4)" };
  const status = STATUS_CONFIG[apt.status];

  return (
    <div
      className="rounded-2xl p-4 transition-colors"
      style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Time + duration */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: tipoBg(tipo.color), color: tipo.color }}
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

        {/* Actions — concluir/cancelar só cabem enquanto está agendado;
            excluir fica disponível sempre (ex: agendamento criado errado). */}
        <div className="flex items-center gap-1 shrink-0">
          {apt.status === "agendado" && (
            <>
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
            </>
          )}
          <button
            onClick={onDelete}
            title="Excluir"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-white/25 hover:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ── New appointment modal ──────────────────────────────────────────
const NewAptModal = ({
  open, onClose, alunos, defaultDate, onSaved, orgId, tipos,
}: {
  open: boolean;
  onClose: () => void;
  alunos: AlunoOption[];
  defaultDate: string;
  onSaved: () => void;
  orgId: string | null;
  tipos: TipoAgendamento[];
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    aluno_id: "",
    data: defaultDate,
    hora: "09:00",
    duracao: "60",
    duracaoCustom: "",
    tipo: tipos[0]?.key ?? "consulta",
    descricao: "",
  });

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, data: defaultDate, titulo: "", descricao: "", aluno_id: "", tipo: tipos[0]?.key ?? "consulta", duracao: "60", duracaoCustom: "" }));
  }, [open, defaultDate]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.titulo.trim()) return;
    const duracaoMinutos = form.duracao === "custom" ? Number(form.duracaoCustom) : Number(form.duracao);
    if (!duracaoMinutos || duracaoMinutos <= 0) {
      toast({ title: "Duração inválida", description: "Informe uma duração personalizada válida.", variant: "destructive" });
      return;
    }
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
        duracao_minutos: duracaoMinutos,
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
      <div className="w-full max-w-md rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "var(--sheet-bg)" }}>
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
              {form.duracao === "custom" ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  autoFocus
                  value={form.duracaoCustom}
                  onChange={set("duracaoCustom")}
                  placeholder="Minutos"
                  required
                  className={inputCls}
                />
              ) : (
                <select value={form.duracao} onChange={set("duracao")} className={inputCls + " cursor-pointer"} style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                  <option value="120">120 min</option>
                  <option value="custom">Personalizado</option>
                </select>
              )}
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={form.tipo} onChange={set("tipo")} className={inputCls + " cursor-pointer"} style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                {tipos.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
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

// ── Manage appointment types modal ──────────────────────────────────
const ManageTiposModal = ({
  open, onClose, tipos, orgId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tipos: TipoAgendamento[];
  orgId: string | null;
  onSaved: () => void;
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<TipoAgendamento[]>(tipos);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setRows(tipos); }, [open, tipos]);

  if (!open) return null;

  const updateRow = (i: number, patch: Partial<TipoAgendamento>) => {
    setRows((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  };

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const addRow = () => {
    const n = rows.length + 1;
    setRows((r) => [...r, { key: `tipo_${Date.now()}`, label: `Novo tipo ${n}`, color: "#60a5fa" }]);
  };

  const handleSave = async () => {
    const cleaned = rows.map((r) => ({ ...r, label: r.label.trim() })).filter((r) => r.label);
    if (cleaned.length === 0) {
      toast({ title: "Precisa de pelo menos 1 tipo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("organizations").update({ agendamento_tipos: cleaned }).eq("id", orgId);
      if (error) throw error;
      toast({ title: "Tipos atualizados!" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "flex-1 h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "var(--sheet-bg)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">Tipos de agendamento</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                type="color"
                value={resolveHex(row.color)}
                onChange={(e) => updateRow(i, { color: e.target.value })}
                className="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer shrink-0"
                title="Cor"
              />
              <input
                type="text"
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                className={inputCls}
                placeholder="Nome do tipo"
              />
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length <= 1}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-20 disabled:hover:bg-transparent shrink-0"
                title="Remover"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 h-8 rounded-lg transition-colors"
            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar tipo
          </button>

          <p className="text-[11px] text-white/25 pt-1">
            Tipos usados por agendamentos já existentes não são apagados — só param de aparecer como opção pra novos.
          </p>
        </div>

        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "var(--cp-gradient)" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────
const Agenda = () => {
  const { toast }   = useToast();
  const { orgId, org, reload } = useTenantContext();

  const [month,       setMonth]       = useState(new Date());
  const [selected,    setSelected]    = useState(format(new Date(), "yyyy-MM-dd"));
  const [apts,        setApts]        = useState<Agendamento[]>([]);
  const [alunos,      setAlunos]      = useState<AlunoOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [manageOpen,  setManageOpen]  = useState(false);

  const tipos = useMemo(
    () => (org?.agendamento_tipos?.length ? org.agendamento_tipos : DEFAULT_TIPOS),
    [org?.agendamento_tipos]
  );
  const tipoConfig = useMemo(
    () => Object.fromEntries(tipos.map((t) => [t.key, t])) as Record<string, TipoAgendamento>,
    [tipos]
  );

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

  const selDate    = useMemo(() => parseISO(selected), [selected]);
  const selDayApts = useMemo(
    () => (byDate.get(selected) ?? []).slice().sort((a, b) => a.data_hora.localeCompare(b.data_hora)),
    [byDate, selected]
  );

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setApts((prev) => prev.map((a) => a.id === id ? { ...a, status: status as any } : a));
  };

  const [deletingAptId, setDeletingAptId] = useState<string | null>(null);

  const deleteApt = async () => {
    if (!deletingAptId) return;
    const id = deletingAptId;
    setDeletingAptId(null);
    const { error } = await supabase.from("agendamentos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setApts((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Agendamento excluído" });
  };

  return (
    <div className="px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Agenda</h1>
          <p className="text-white/40 text-sm mt-1">{apts.filter((a) => a.status === "agendado").length} agendamento{apts.filter(a => a.status === "agendado").length !== 1 ? "s" : ""} pendente{apts.filter(a => a.status === "agendado").length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setManageOpen(true)}
            title="Gerenciar tipos de agendamento"
            className="h-10 w-10 flex items-center justify-center rounded-xl text-white/40 hover:text-white/70 hover:bg-white/8 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="h-10 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-2"
            style={{ background: "var(--cp-gradient)" }}
          >
            <Plus className="w-4 h-4" />
            Novo agendamento
          </button>
        </div>
      </div>

      {/* ── Calendar — full width, dominant element ── */}
      <div className="rounded-3xl p-5" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}>
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/8 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-white/50" />
          </button>
          <h2 className="text-lg font-bold text-white capitalize">
            {format(month, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/8 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-white/50" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-white/30 py-16">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : (
          <CalendarGrid
            month={month}
            selected={selected}
            appointments={byDate}
            onSelect={(d) => { setSelected(d); setMonth(parseISO(d)); }}
            tipoConfig={tipoConfig}
          />
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5 pt-4 border-t border-white/6">
          {tipos.map((t) => (
            <div key={t.key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="text-xs text-white/40">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected day panel — só o dia clicado, sem os outros 6 vazios ── */}
      <div className="rounded-3xl p-6 mt-6" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-500/70" />
            <div>
              <h3 className="text-sm font-bold text-white capitalize">
                {format(selDate, "EEEE", { locale: ptBR })}
                {isToday(selDate) && <span className="ml-2 text-xs font-semibold" style={{ color: "var(--cp-400)" }}>Hoje</span>}
              </h3>
              <p className="text-xs text-white/40 capitalize">{format(selDate, "d 'de' MMMM", { locale: ptBR })}</p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold transition-colors"
            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Novo neste dia
          </button>
        </div>

        {selDayApts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-white/25 italic">Nenhum agendamento neste dia.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selDayApts.map((apt) => (
              <AptCard
                key={apt.id}
                apt={apt}
                onComplete={() => updateStatus(apt.id, "concluido")}
                onCancel={() => updateStatus(apt.id, "cancelado")}
                onDelete={() => setDeletingAptId(apt.id)}
                tipoConfig={tipoConfig}
              />
            ))}
          </div>
        )}
      </div>

      <NewAptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        alunos={alunos}
        defaultDate={selected}
        onSaved={loadAll}
        orgId={orgId}
        tipos={tipos}
      />

      <ManageTiposModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        tipos={tipos}
        orgId={orgId}
        onSaved={reload}
      />

      <AlertDialog open={!!deletingAptId} onOpenChange={(open) => !open && setDeletingAptId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agendamento será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteApt}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Agenda;
