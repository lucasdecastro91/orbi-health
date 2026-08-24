import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext, useDraggable, useDroppable, useSensor, useSensors,
  PointerSensor, TouchSensor, pointerWithin, type DragEndEvent,
} from "@dnd-kit/core";
import {
  Target, Plus, Search, X, Phone, Instagram, ChevronRight,
  Calendar, Clock, Copy, Check, MessageSquare, Pencil,
  Trash2, FileText, UserPlus, AlertTriangle, CheckCircle2,
  SlidersHorizontal, ChevronDown, Loader2, RotateCcw, GripVertical, Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LeadStatus =
  | "novo" | "contato_feito" | "call_agendada"
  | "proposta_enviada" | "fechado" | "perdido";

type LeadOrigem = "indicacao" | "instagram" | "tiktok" | "outro";

interface Lead {
  id: string;
  org_id: string;
  treinador_id: string;
  nome: string;
  whatsapp: string | null;
  instagram: string | null;
  origem: LeadOrigem;
  objetivo: string | null;
  status: LeadStatus;
  aluno_id: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadInteraction {
  id: string;
  lead_id: string;
  nota: string;
  created_at: string;
}

interface LeadCall {
  id: string;
  lead_id: string;
  data_hora: string;
  observacoes: string | null;
  status: "agendada" | "realizada" | "perdida" | "cancelada";
  whatsapp_sent: boolean;
  msg_confirmacao: string | null;
  msg_lembrete: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config & helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<LeadStatus, { label: string; bg: string; text: string; dot: string }> = {
  novo:             { label: "Novo",            bg: "var(--tag-neutral-bg)", text: "var(--tag-neutral-color)", dot: "var(--tag-neutral-color)" },
  contato_feito:    { label: "Contato feito",   bg: "var(--tag-neutral-bg)", text: "var(--tag-neutral-color)", dot: "var(--tag-neutral-color)" },
  call_agendada:    { label: "Call agendada",   bg: "rgba(var(--cp-rgb),0.12)", text: "var(--cp-400)", dot: "var(--cp-500)" },
  proposta_enviada: { label: "Proposta enviada",bg: "rgba(var(--cp-rgb),0.12)", text: "var(--cp-400)", dot: "var(--cp-500)" },
  fechado:          { label: "Fechado ✓",       bg: "rgba(34,197,94,0.12)",   text: "#4ade80", dot: "#22c55e" },
  perdido:          { label: "Perdido",         bg: "var(--tag-neutral-bg)", text: "var(--tag-neutral-color)", dot: "var(--tag-neutral-color)" },
};

const ORIGEM_CFG: Record<string, { label: string; color: string }> = {
  indicacao: { label: "Indicação",  color: "var(--tag-neutral-color)" },
  instagram: { label: "Instagram",  color: "var(--tag-neutral-color)" },
  tiktok:    { label: "TikTok",     color: "var(--tag-neutral-color)" },
  outro:     { label: "Outro",      color: "var(--tag-neutral-color)" },
};

const STATUS_ORDER: LeadStatus[] = [
  "novo", "contato_feito", "call_agendada", "proposta_enviada", "fechado", "perdido",
];

const fmtBR = (iso: string) =>
  format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

const fmtDate = (iso: string) =>
  format(new Date(iso), "d 'de' MMMM", { locale: ptBR });

const fmtHora = (iso: string) =>
  format(new Date(iso), "HH:mm");

// Follow-up sempre grava hora (00:00 = "sem horário específico, só o dia") —
// usado pra decidir se mostra a hora no selo/form ou só a data.
const followUpHasTime = (iso: string | null | undefined) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
};

// ── Call assunto suggestions ────────────────────────────────────────────────
const ASSUNTO_SUGESTOES = [
  "Apresentação do método",
  "Avaliação inicial",
  "Retorno após proposta",
  "Acompanhamento",
  "Dúvidas sobre planos",
  "Outro",
];

// ── Default message templates (variables: [Nome] [dia] [data] [hora] [assunto]) ─
const DEFAULT_TEMPLATES = {
  agendamento:
    "📅 [dia] | [data]\n🕒 Horário: [hora]\n[assunto]\nNos vemos amanhã! 🙏🏻",
  confirmacao:
    "Olá, [Nome]! [saudacao]\nConfirmando nossa conversa agendada para [dia], [data] às [hora].\n\n[assunto]\n\nPor favor, confirme sua presença respondendo essa mensagem. 😊",
  lembrete:
    "Olá, [Nome]! [saudacao] Tudo bem?\nPassando só pra te lembrar da nossa call hoje às [hora].\n\nPor favor, confirme sua presença respondendo essa mensagem. 🙏🏻",
};

type Templates = typeof DEFAULT_TEMPLATES;

const resolveTemplate = (template: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((t, [k, v]) => t.split(`[${k}]`).join(v), template);

const getSaudacao = (): string => {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
};

const gerarMensagens = (nome: string, dataHora: string, assunto: string, tpls?: Templates) => {
  const dt       = new Date(dataHora);
  const dia      = format(dt, "EEEE", { locale: ptBR });
  const data     = format(dt, "d 'de' MMMM", { locale: ptBR });
  const hora     = format(dt, "HH:mm");
  const saudacao = getSaudacao();
  const tmpl     = tpls ?? DEFAULT_TEMPLATES;
  const vars     = { Nome: nome, dia, data, hora, assunto: assunto || "", saudacao };
  return {
    agendamento: resolveTemplate(tmpl.agendamento, vars),
    confirmacao: resolveTemplate(tmpl.confirmacao, vars),
    lembrete:    resolveTemplate(tmpl.lembrete, vars),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CopyButton
// ─────────────────────────────────────────────────────────────────────────────
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
      style={{ backgroundColor: copied ? "var(--btn-success-bg)" : "var(--btn-ghost-bg)" }}
      title="Copiar"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5 text-white/40" />}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LeadFormModal — add / edit lead
// ─────────────────────────────────────────────────────────────────────────────
interface LeadFormProps {
  orgId: string;
  treinadorId: string;
  lead?: Lead | null;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}

const EMPTY_FORM = {
  nome: "", whatsapp: "", instagram: "",
  origem: "outro" as LeadOrigem, objetivo: "", status: "novo" as LeadStatus,
};

const LeadFormModal = ({ orgId, treinadorId, lead, onClose, onSaved }: LeadFormProps) => {
  const { toast } = useToast();
  const [form, setForm] = useState(
    lead
      ? { nome: lead.nome, whatsapp: lead.whatsapp ?? "", instagram: lead.instagram ?? "",
          origem: lead.origem, objetivo: lead.objetivo ?? "", status: lead.status }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        org_id: orgId, treinador_id: treinadorId,
        nome: form.nome.trim(),
        whatsapp:  form.whatsapp.trim() || null,
        instagram: form.instagram.trim() || null,
        origem: form.origem, objetivo: form.objetivo.trim() || null,
        status: form.status,
      };
      if (lead) {
        const { data, error } = await supabase.from("leads").update(payload).eq("id", lead.id).select().single();
        if (error) throw error;
        onSaved(data as Lead);
        toast({ title: "Lead atualizado!" });
      } else {
        const { data, error } = await supabase.from("leads").insert(payload).select().single();
        if (error) throw error;
        onSaved(data as Lead);
        toast({ title: "Lead criado!" });
      }
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl pb-8 pt-5 px-5 space-y-4 overflow-y-auto max-h-[92vh] sm:max-h-[85vh]"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)", boxShadow: "var(--dash-card-shadow)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />

        <div className="flex items-center justify-between mb-1">
          <p className="text-base font-bold text-white">{lead ? "Editar Lead" : "Novo Lead"}</p>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40" /></button>
        </div>

        {/* Nome */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Nome *</Label>
          <Input value={form.nome} onChange={(e) => set("nome", e.target.value)}
            placeholder="Nome completo"
            className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
        </div>

        {/* WhatsApp + Instagram */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-white/40 uppercase tracking-wider">WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="(11) 99999-9999"
              className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-white/40 uppercase tracking-wider">Instagram</Label>
            <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)}
              placeholder="@usuario"
              className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
          </div>
        </div>

        {/* Origem */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Origem</Label>
          <div className="grid grid-cols-4 gap-2">
            {(["indicacao", "instagram", "tiktok", "outro"] as LeadOrigem[]).map((o) => {
              const cfg = ORIGEM_CFG[o];
              return (
                <button key={o} onClick={() => set("origem", o)}
                  className="py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: form.origem === o ? "rgba(var(--cp-rgb),0.2)" : "var(--ui-inactive-bg)",
                    color:           form.origem === o ? "var(--cp-400)" : "var(--ui-inactive-color)",
                    border: `1px solid ${form.origem === o ? "rgba(var(--cp-rgb),0.4)" : "var(--ui-inactive-border)"}`,
                  }}>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Objetivo */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Objetivo principal</Label>
          <Input value={form.objetivo} onChange={(e) => set("objetivo", e.target.value)}
            placeholder="Ex: Perder peso, ganhar massa..."
            className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Status</Label>
          <div className="relative">
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl h-11 px-3 text-sm text-white focus:outline-none">
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_CFG[s].label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}
          className="w-full h-11 rounded-xl font-semibold text-white"
          style={{ background: "var(--cp-gradient)" }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : lead ? "Salvar alterações" : "Criar lead"}
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WhatsappTemplatesModal — manage org message templates
// ─────────────────────────────────────────────────────────────────────────────
interface CustomTpl {
  tipo: string;
  label: string;
  template: string;
}

interface TemplatesModalProps {
  orgId: string;
  onClose: () => void;
  onSaved: (base: Templates, custom: CustomTpl[]) => void;
}

const TEMPLATE_LABELS: Record<keyof Templates, string> = {
  agendamento: "📅 Agendamento",
  confirmacao: "✅ Confirmação",
  lembrete:    "🔔 Lembrete (no dia)",
};

const BASE_TIPOS = new Set(["agendamento", "confirmacao", "lembrete"]);

const WhatsappTemplatesModal = ({ orgId, onClose, onSaved }: TemplatesModalProps) => {
  const { toast } = useToast();
  const [tpls,       setTpls]       = useState<Templates>({ ...DEFAULT_TEMPLATES });
  const [customTpls, setCustomTpls] = useState<CustomTpl[]>([]);
  const [toDelete,   setToDelete]   = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase
          .from("whatsapp_templates")
          .select("tipo, template")
          .eq("org_id", orgId);
        if (data && data.length > 0) {
          const merged = { ...DEFAULT_TEMPLATES };
          const customs: CustomTpl[] = [];
          for (const row of data) {
            if (BASE_TIPOS.has(row.tipo)) {
              merged[row.tipo as keyof Templates] = row.template;
            } else {
              customs.push({ tipo: row.tipo, label: row.tipo, template: row.template });
            }
          }
          setTpls(merged);
          setCustomTpls(customs);
        }
      } finally { setLoading(false); }
    })();
  }, [orgId]);

  const addCustom = () =>
    setCustomTpls((prev) => [
      ...prev,
      { tipo: `custom_${Date.now()}`, label: "Novo modelo", template: "" },
    ]);

  const updateCustom = (tipo: string, field: "label" | "template", value: string) =>
    setCustomTpls((prev) => prev.map((c) => c.tipo === tipo ? { ...c, [field]: value } : c));

  const deleteCustom = (tipo: string) => {
    setCustomTpls((prev) => prev.filter((c) => c.tipo !== tipo));
    setToDelete((prev) => [...prev, tipo]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert base templates
      const baseRows = (Object.keys(tpls) as (keyof Templates)[]).map((tipo) => ({
        org_id: orgId, tipo, template: tpls[tipo],
      }));
      // Upsert custom templates
      const customRows = customTpls.map((c) => ({
        org_id: orgId, tipo: c.tipo, template: c.template,
      }));
      const { error } = await supabase
        .from("whatsapp_templates")
        .upsert([...baseRows, ...customRows], { onConflict: "org_id,tipo" });
      if (error) throw error;

      // Delete removed custom templates
      if (toDelete.length > 0) {
        await supabase
          .from("whatsapp_templates")
          .delete()
          .eq("org_id", orgId)
          .in("tipo", toDelete);
      }

      onSaved(tpls, customTpls);
      toast({ title: "Modelos salvos!" });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl pb-8 pt-5 px-5 space-y-4 overflow-y-auto max-h-[92vh] sm:max-h-[85vh]"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)", boxShadow: "var(--dash-card-shadow)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-base font-bold text-white">Modelos de Mensagem</p>
            <p className="text-xs text-white/40 mt-0.5">Variáveis: [Nome] [dia] [data] [hora] [assunto] [saudacao]</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : (
          <>
            {/* ── Base templates (fixed, not deletable) ── */}
            {(Object.keys(tpls) as (keyof Templates)[]).map((tipo) => (
              <div key={tipo} className="space-y-1.5">
                <Label className="text-[11px] text-white/40 uppercase tracking-wider">
                  {TEMPLATE_LABELS[tipo]}
                </Label>
                <Textarea
                  value={tpls[tipo]}
                  onChange={(e) => setTpls((p) => ({ ...p, [tipo]: e.target.value }))}
                  rows={4}
                  className="bg-white/5 border-white/10 text-white rounded-xl resize-none text-xs leading-relaxed"
                />
              </div>
            ))}

            {/* ── Custom templates ── */}
            {customTpls.length > 0 && (
              <div className="pt-1 space-y-3">
                <p className="text-[11px] text-white/25 uppercase tracking-wider">Modelos personalizados</p>
                {customTpls.map((c) => (
                  <div key={c.tipo} className="rounded-xl p-3 space-y-2"
                    style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
                    {/* Label row */}
                    <div className="flex items-center gap-2">
                      <input
                        value={c.label}
                        onChange={(e) => updateCustom(c.tipo, "label", e.target.value)}
                        placeholder="Nome do modelo"
                        className="flex-1 bg-transparent text-xs text-white/70 font-medium outline-none border-b border-white/10 pb-0.5 focus:border-white/30"
                      />
                      <button
                        onClick={() => deleteCustom(c.tipo)}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-white/30 hover:text-red-400" />
                      </button>
                    </div>
                    <Textarea
                      value={c.template}
                      onChange={(e) => updateCustom(c.tipo, "template", e.target.value)}
                      rows={3}
                      placeholder="Digite o texto do modelo..."
                      className="bg-white/5 border-white/10 text-white rounded-xl resize-none text-xs leading-relaxed"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── Add custom button ── */}
            <button
              onClick={addCustom}
              className="w-full h-10 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)" }}
            >
              <Plus className="w-4 h-4" />
              Novo modelo
            </button>
          </>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={() => { setTpls({ ...DEFAULT_TEMPLATES }); setCustomTpls([]); }}
            className="flex-1 h-10 rounded-xl text-sm border-white/10 text-white/50 hover:text-white bg-transparent">
            Restaurar padrões
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}
            className="flex-1 h-10 rounded-xl font-semibold text-white"
            style={{ background: "var(--cp-gradient)" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar modelos"}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CallModal — schedule a call
// ─────────────────────────────────────────────────────────────────────────────
interface MsgItem {
  id: string;
  label: string;
  text: string;
  isCustom: boolean;
}

interface CallModalProps {
  lead: Lead;
  orgId: string;
  treinadorId: string;
  onClose: () => void;
  onSaved: (call: LeadCall) => void;
}

const CallModal = ({ lead, orgId, treinadorId, onClose, onSaved }: CallModalProps) => {
  const { toast } = useToast();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

  const [dataHora,      setDataHora]      = useState(toLocal(tomorrow));
  const [assunto,       setAssunto]       = useState("");
  const [assuntoCustom, setAssuntoCustom] = useState("");
  const [obs,           setObs]           = useState("");
  const [saving,        setSaving]        = useState(false);
  const [tplsOpen,      setTplsOpen]      = useState(false);
  const [templates,     setTemplates]     = useState<Templates>({ ...DEFAULT_TEMPLATES });

  // Editable message items
  const [msgItems, setMsgItems] = useState<MsgItem[]>(() => {
    const gen = gerarMensagens(lead.nome, toLocal(tomorrow), "", DEFAULT_TEMPLATES);
    return [
      { id: "agendamento", label: "Agendamento",       text: gen.agendamento, isCustom: false },
      { id: "confirmacao", label: "Confirmação",       text: gen.confirmacao, isCustom: false },
      { id: "lembrete",    label: "Lembrete (no dia)", text: gen.lembrete,    isCustom: false },
    ];
  });

  const assuntoFinal = assunto === "Outro" ? assuntoCustom : assunto;

  // Helper: regenerate a single base item's text
  const regenerateItem = useCallback((id: string) => {
    if (!dataHora) return;
    const gen = gerarMensagens(lead.nome, dataHora, assuntoFinal, templates);
    const freshText = gen[id as keyof typeof gen];
    if (!freshText) return;
    setMsgItems((prev) => prev.map((m) => m.id === id ? { ...m, text: freshText } : m));
  }, [dataHora, assuntoFinal, lead.nome, templates]);

  // Load org templates on mount
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase
          .from("whatsapp_templates")
          .select("tipo, template")
          .eq("org_id", orgId);
        if (data && data.length > 0) {
          const merged = { ...DEFAULT_TEMPLATES };
          const customs: CustomTpl[] = [];
          for (const row of data) {
            if (BASE_TIPOS.has(row.tipo)) {
              merged[row.tipo as keyof Templates] = row.template;
            } else {
              customs.push({ tipo: row.tipo, label: row.tipo, template: row.template });
            }
          }
          setTemplates(merged);
          // Regenerate base messages with org templates (user hasn't edited yet)
          if (dataHora) {
            const gen = gerarMensagens(lead.nome, dataHora, assuntoFinal, merged);
            const customItems: MsgItem[] = customs.map((c) => ({
              id: c.tipo,
              label: c.label,
              text: resolveTemplate(c.template, {
                Nome: lead.nome,
                dia:      format(new Date(dataHora), "EEEE", { locale: ptBR }),
                data:     format(new Date(dataHora), "d 'de' MMMM", { locale: ptBR }),
                hora:     format(new Date(dataHora), "HH:mm"),
                assunto:  assuntoFinal,
                saudacao: getSaudacao(),
              }),
              isCustom: false,
            }));
            setMsgItems((prev) => {
              const base = prev
                .filter((m) => BASE_TIPOS.has(m.id))
                .map((m) => ({ ...m, text: gen[m.id as keyof typeof gen] ?? m.text }));
              return [...base, ...customItems];
            });
          }
        }
      } catch { /* use defaults */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const updateMsgText = (id: string, text: string) =>
    setMsgItems((prev) => prev.map((m) => m.id === id ? { ...m, text } : m));

  const updateMsgLabel = (id: string, label: string) =>
    setMsgItems((prev) => prev.map((m) => m.id === id ? { ...m, label } : m));

  const deleteMsg = (id: string) =>
    setMsgItems((prev) => prev.filter((m) => m.id !== id));

  const addCustomMsg = () =>
    setMsgItems((prev) => [...prev, {
      id: `custom_${Date.now()}`,
      label: "Nova mensagem",
      text: "",
      isCustom: true,
    }]);

  const handleSave = async () => {
    if (!dataHora) { toast({ title: "Selecione data e hora", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const confirmacaoItem = msgItems.find((m) => m.id === "confirmacao");
      const lembreteItem    = msgItems.find((m) => m.id === "lembrete");
      const obsPayload = [assuntoFinal, obs.trim()].filter(Boolean).join(" — ");
      const { data, error } = await supabase.from("lead_calls").insert({
        lead_id:         lead.id,
        org_id:          orgId,
        treinador_id:    treinadorId,
        data_hora:       new Date(dataHora).toISOString(),
        observacoes:     obsPayload || null,
        msg_confirmacao: confirmacaoItem?.text ?? null,
        msg_lembrete:    lembreteItem?.text ?? null,
      }).select().single();
      if (error) throw error;

      if (["novo", "contato_feito"].includes(lead.status)) {
        await supabase.from("leads").update({ status: "call_agendada" }).eq("id", lead.id);
      }

      onSaved(data as LeadCall);
      toast({ title: "Call agendada!", description: "Mensagens prontas para copiar." });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <>
    {tplsOpen && (
      <WhatsappTemplatesModal
        orgId={orgId}
        onClose={() => setTplsOpen(false)}
        onSaved={(base, customs) => {
          setTemplates(base);
          if (dataHora) {
            const gen = gerarMensagens(lead.nome, dataHora, assuntoFinal, base);
            const customItems: MsgItem[] = customs.map((c) => ({
              id: c.tipo,
              label: c.label,
              text: resolveTemplate(c.template, {
                Nome:     lead.nome,
                dia:      format(new Date(dataHora), "EEEE", { locale: ptBR }),
                data:     format(new Date(dataHora), "d 'de' MMMM", { locale: ptBR }),
                hora:     format(new Date(dataHora), "HH:mm"),
                assunto:  assuntoFinal,
                saudacao: getSaudacao(),
              }),
              isCustom: false,
            }));
            setMsgItems((prev) => {
              // Rebuild: keep manually-added items (isCustom=true), regen base, add template-customs
              const manualItems = prev.filter((m) => m.isCustom);
              const baseItems   = prev
                .filter((m) => BASE_TIPOS.has(m.id))
                .map((m) => ({ ...m, text: gen[m.id as keyof typeof gen] ?? m.text }));
              return [...baseItems, ...customItems, ...manualItems];
            });
          }
          setTplsOpen(false);
        }}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl pb-8 pt-5 px-5 space-y-4 overflow-y-auto max-h-[92vh] sm:max-h-[85vh]"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)", boxShadow: "var(--dash-card-shadow)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-base font-bold text-white">Agendar Call</p>
            <p className="text-xs text-white/40 mt-0.5">{lead.nome}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTplsOpen(true)}
              className="text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors px-2 py-1 rounded-lg"
              style={{ backgroundColor: "rgba(251,191,36,0.08)" }}
            >
              Gerenciar modelos
            </button>
            <button onClick={onClose}><X className="w-5 h-5 text-white/40" /></button>
          </div>
        </div>

        {/* Date + Time */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Data e Hora</Label>
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)}
            className="w-full h-11 rounded-xl px-3 text-sm text-white outline-none"
            style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }} />
        </div>

        {/* Assunto da Call */}
        <div className="space-y-2">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Assunto da Call</Label>
          <div className="flex flex-wrap gap-2">
            {ASSUNTO_SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => setAssunto(assunto === s ? "" : s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: assunto === s ? "rgba(var(--cp-rgb),0.15)" : "var(--ui-inactive-bg)",
                  color:           assunto === s ? "var(--cp-400)" : "var(--ui-inactive-color)",
                  border: `1px solid ${assunto === s ? "rgba(var(--cp-rgb),0.35)" : "var(--ui-inactive-border)"}`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {assunto === "Outro" && (
            <input
              value={assuntoCustom}
              onChange={(e) => setAssuntoCustom(e.target.value)}
              placeholder="Descreva o assunto..."
              className="w-full h-9 rounded-xl px-3 text-sm text-white outline-none"
              style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            />
          )}
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Observações</Label>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Ex: Primeira conversa, retorno após proposta..."
            rows={2}
            className="bg-white/5 border-white/10 text-white rounded-xl resize-none text-sm" />
        </div>

        {/* Editable message items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-white/40 uppercase tracking-wider">Mensagens</p>
            <button
              onClick={addCustomMsg}
              className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </button>
          </div>

          {msgItems.map((item) => (
            <div key={item.id} className="rounded-xl p-3 space-y-2"
              style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>

              {/* Label row */}
              <div className="flex items-center gap-2">
                {item.isCustom ? (
                  <input
                    value={item.label}
                    onChange={(e) => updateMsgLabel(item.id, e.target.value)}
                    className="flex-1 bg-transparent text-[10px] text-white/50 uppercase tracking-wider outline-none border-b border-white/10 pb-0.5 focus:border-white/30"
                  />
                ) : (
                  <p className="flex-1 text-[10px] text-white/35 uppercase tracking-wider">{item.label}</p>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  {/* Regenerate button — only for base messages */}
                  {!item.isCustom && (
                    <button
                      onClick={() => regenerateItem(item.id)}
                      title="Regenerar a partir do modelo"
                      className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
                    >
                      <RotateCcw className="w-3 h-3 text-white/30 hover:text-white/60" />
                    </button>
                  )}
                  {/* Delete button — only for custom messages */}
                  {item.isCustom && (
                    <button
                      onClick={() => deleteMsg(item.id)}
                      title="Remover mensagem"
                      className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3 h-3 text-white/30 hover:text-red-400" />
                    </button>
                  )}
                  <CopyButton text={item.text} />
                </div>
              </div>

              {/* Editable textarea */}
              <textarea
                value={item.text}
                onChange={(e) => updateMsgText(item.id, e.target.value)}
                rows={item.text.split("\n").length + 1}
                placeholder={item.isCustom ? "Digite sua mensagem..." : ""}
                className="w-full bg-transparent text-xs text-white/70 leading-relaxed resize-none outline-none placeholder:text-white/20"
                style={{ minHeight: "2.5rem" }}
              />
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving}
          className="w-full h-11 rounded-xl font-semibold text-white"
          style={{ background: "var(--cp-gradient)" }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Calendar className="w-4 h-4 mr-2" />Agendar Call</>}
        </Button>
      </div>
    </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LeadChatBox — histórico de WhatsApp em tempo real (Supabase Realtime)
// ─────────────────────────────────────────────────────────────────────────────
interface WaMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  created_at: string;
}

const LeadChatBox = ({ lead, orgId }: { lead: Lead; orgId: string }) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [text,     setText]     = useState("");
  const [sending,  setSending]  = useState(false);
  const bottomRef = useMemo(() => ({ current: null as HTMLDivElement | null }), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("id, direction, content, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: true });
      if (active) { setMessages((data as WaMessage[]) ?? []); setLoading(false); }
    })();

    const channel = supabase
      .channel(`wa-messages-lead-${lead.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `lead_id=eq.${lead.id}` },
        (payload) => {
          const msg = payload.new as WaMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [lead.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, bottomRef]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send-message`, {
        method: "POST",
        headers: { "x-orbi-auth": token, "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, lead_id: lead.id, content }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const messages: Record<string, string> = {
          whatsapp_not_connected: "Conecte o WhatsApp da org em Configurações antes de enviar.",
          no_phone_on_file: "Esse lead não tem número de WhatsApp cadastrado.",
        };
        throw new Error(messages[data.error] ?? data.error ?? "Erro ao enviar");
      }
      setText("");
      if (data.message) {
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar mensagem", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!lead.whatsapp) {
    return (
      <div>
        <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium mb-3">Conversa no WhatsApp</p>
        <p className="text-xs text-white/25 py-3">Esse lead não tem WhatsApp cadastrado.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium mb-3">Conversa no WhatsApp</p>
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)" }}
      >
        <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 260 }}>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/20" /></div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-4">Nenhuma mensagem ainda.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap"
                  style={m.direction === "outbound"
                    ? { background: "var(--cp-gradient)", color: "var(--cp-text)", borderBottomRightRadius: 4 }
                    : { backgroundColor: "var(--section-card-bg-2)", color: "hsl(var(--foreground) / 0.85)", borderBottomLeftRadius: 4 }}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          <div ref={(el) => { bottomRef.current = el; }} />
        </div>
        <div className="flex gap-2 p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Digite uma mensagem"
            className="flex-1 h-9 rounded-xl px-3 text-xs text-white outline-none"
            style={{ backgroundColor: "var(--section-card-bg-2)", border: "1px solid var(--section-card-border)" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{ background: "var(--cp-gradient)" }}
          >
            {sending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--cp-text)" }} />
              : <Send className="w-3.5 h-3.5" style={{ color: "var(--cp-text)" }} />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LeadDetailSheet — full detail with interactions & calls
// ─────────────────────────────────────────────────────────────────────────────
interface DetailSheetProps {
  lead: Lead;
  orgId: string;
  treinadorId: string;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onCallScheduled: (call: LeadCall) => void;
  onConverted: (leadId: string, alunoId: string) => void;
  onFollowUpChange: (id: string, followUpAt: string | null, note: string | null) => void;
  onCallUpdated: (call: LeadCall) => void;
  onCallDeleted: (callId: string) => void;
}

const LeadDetailSheet = ({
  lead, orgId, treinadorId, onClose, onEdit, onDelete,
  onStatusChange, onCallScheduled, onConverted, onFollowUpChange,
  onCallUpdated, onCallDeleted,
}: DetailSheetProps) => {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const { slug }  = useTenantContext();

  const [interactions, setInteractions] = useState<LeadInteraction[]>([]);
  const [calls,        setCalls]        = useState<LeadCall[]>([]);
  const [loadingData,  setLoadingData]  = useState(true);
  const [nota,         setNota]         = useState("");
  const [addingNota,   setAddingNota]   = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [convOpen,      setConvOpen]    = useState(false);
  const [convEmail,     setConvEmail]   = useState("");
  const [converting,    setConverting]  = useState(false);
  const [deletingCall,  setDeletingCall] = useState<string | null>(null);
  const [followUpPickerOpen, setFollowUpPickerOpen] = useState(false);
  const [followUpNoteDraft, setFollowUpNoteDraft] = useState(lead.follow_up_note ?? "");
  const [followUpDateDraft, setFollowUpDateDraft] = useState(lead.follow_up_at?.slice(0, 10) ?? "");
  const [followUpTimeDraft, setFollowUpTimeDraft] = useState(followUpHasTime(lead.follow_up_at) ? fmtHora(lead.follow_up_at!) : "");

  useEffect(() => { loadDetail(); }, [lead.id]);

  const loadDetail = async () => {
    setLoadingData(true);
    const [intRes, callRes] = await Promise.all([
      supabase.from("lead_interactions").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
      supabase.from("lead_calls").select("*").eq("lead_id", lead.id).order("data_hora", { ascending: true }),
    ]);
    setInteractions((intRes.data as LeadInteraction[]) ?? []);
    setCalls((callRes.data as LeadCall[]) ?? []);
    setLoadingData(false);
  };

  const addNota = async () => {
    if (!nota.trim()) return;
    setAddingNota(true);
    try {
      const { data, error } = await supabase.from("lead_interactions").insert({
        lead_id: lead.id, org_id: orgId, nota: nota.trim(),
      }).select().single();
      if (error) throw error;
      setInteractions((prev) => [data as LeadInteraction, ...prev]);
      setNota("");
      toast({ title: "Anotação salva!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setAddingNota(false); }
  };

  const deleteInteraction = async (id: string) => {
    await supabase.from("lead_interactions").delete().eq("id", id);
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  };

  const saveFollowUp = async (dateStr: string, timeStr: string) => {
    if (!dateStr) return;
    const iso  = new Date(`${dateStr}T${timeStr || "00:00"}:00`).toISOString();
    const note = followUpNoteDraft.trim() || null;
    await supabase.from("leads").update({ follow_up_at: iso, follow_up_note: note }).eq("id", lead.id);
    onFollowUpChange(lead.id, iso, note);
    setFollowUpPickerOpen(false);
  };

  const clearFollowUp = async () => {
    await supabase.from("leads").update({ follow_up_at: null, follow_up_note: null }).eq("id", lead.id);
    onFollowUpChange(lead.id, null, null);
    setFollowUpNoteDraft("");
  };

  const markCallDone = async (callId: string) => {
    await supabase.from("lead_calls").update({ status: "realizada" }).eq("id", callId);
    setCalls((prev) => {
      const next = prev.map((c) => c.id === callId ? { ...c, status: "realizada" as const } : c);
      const updated = next.find((c) => c.id === callId);
      if (updated) onCallUpdated(updated);
      return next;
    });
  };

  const deleteCall = async (callId: string) => {
    setDeletingCall(callId);
    await supabase.from("lead_calls").delete().eq("id", callId);
    setCalls((prev) => prev.filter((c) => c.id !== callId));
    onCallDeleted(callId);
    setDeletingCall(null);
  };

  const convertToStudent = async () => {
    if (!convEmail.trim()) { toast({ title: "E-mail obrigatório", variant: "destructive" }); return; }
    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-student", {
        body: { nome: lead.nome, email: convEmail.trim(), treinador_id: treinadorId, org_id: orgId },
      });
      if (error) throw error;
      const alunoId = data?.aluno_id ?? data?.id;
      if (!alunoId) throw new Error("Aluno não retornado pela função.");
      await supabase.from("leads").update({ aluno_id: alunoId, status: "fechado" }).eq("id", lead.id);
      onConverted(lead.id, alunoId);
      toast({ title: "Lead convertido em aluno!", description: `${lead.nome} agora é um aluno.` });
      setConvOpen(false);
      onClose();
      navigate(`/${slug}/treinador/aluno/${alunoId}`);
    } catch (e: any) {
      toast({ title: "Erro ao converter", description: e.message, variant: "destructive" });
    } finally { setConverting(false); }
  };

  const cfg = STATUS_CFG[lead.status];

  return (
    <>
      {callModalOpen && (
        <CallModal
          lead={lead} orgId={orgId} treinadorId={treinadorId}
          onClose={() => setCallModalOpen(false)}
          onSaved={(c) => { setCalls((prev) => [...prev, c].sort((a, b) => a.data_hora.localeCompare(b.data_hora))); onCallScheduled(c); setCallModalOpen(false); }}
        />
      )}

      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={onClose}>
        <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl pb-8 overflow-y-auto"
          style={{ maxHeight: "92vh", backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)", boxShadow: "var(--dash-card-shadow)" }}
          onClick={(e) => e.stopPropagation()}>

          <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-5 mb-4" />

          {/* Header */}
          <div className="px-5 pb-4 flex items-start gap-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white truncate">{lead.nome}</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                  {cfg.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {lead.whatsapp && (
                  <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-white/40 hover:text-green-400 transition-colors">
                    <Phone className="w-3 h-3" />{lead.whatsapp}
                  </a>
                )}
                {lead.instagram && (
                  <a href={`https://instagram.com/${lead.instagram.replace("@","")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-white/40 hover:text-purple-400 transition-colors">
                    <Instagram className="w-3 h-3" />{lead.instagram}
                  </a>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: "var(--tag-neutral-bg)", color: "var(--tag-neutral-color)" }}>
                  {ORIGEM_CFG[lead.origem]?.label ?? lead.origem}
                </span>
              </div>
              {lead.objetivo && (
                <p className="text-xs text-white/35 mt-1.5 italic">"{lead.objetivo}"</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { onClose(); onEdit(lead); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
                <Pencil className="w-3.5 h-3.5 text-white/50" />
              </button>
              <button onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </div>

          {/* Status pipeline */}
          <div className="px-5 py-4 flex gap-1 overflow-x-auto"
            style={{ borderBottom: "1px solid var(--subtle-overlay)" }}>
            {STATUS_ORDER.map((s, i) => {
              const sc    = STATUS_CFG[s];
              const isDone = STATUS_ORDER.indexOf(lead.status) >= i;
              return (
                <button key={s} onClick={() => onStatusChange(lead.id, s)}
                  className="flex-1 min-w-0 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap px-1 transition-all"
                  style={{
                    backgroundColor: s === lead.status ? sc.bg : (isDone ? "var(--ui-inactive-bg)" : "transparent"),
                    color: s === lead.status ? sc.text : (isDone ? "var(--ui-inactive-color)" : "var(--text-dim)"),
                    border: `1px solid ${s === lead.status ? sc.dot : "var(--subtle-overlay)"}`,
                  }}>
                  {sc.label.replace(" ✓","").split(" ")[0]}
                </button>
              );
            })}
          </div>

          {/* Follow-up */}
          <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--subtle-overlay)" }}>
            {lead.follow_up_at && !followUpPickerOpen ? (
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${new Date(lead.follow_up_at) <= new Date() ? "text-red-400" : "text-amber-400"}`}
                    style={{ backgroundColor: "var(--tag-neutral-bg)" }}>
                    <Clock className="w-3.5 h-3.5" /> Follow-up em {fmtDate(lead.follow_up_at)}
                    {followUpHasTime(lead.follow_up_at) && ` · ${fmtHora(lead.follow_up_at)}`}
                  </span>
                  {lead.follow_up_note && (
                    <p className="text-xs text-white/40 mt-1.5">{lead.follow_up_note}</p>
                  )}
                </div>
                <button onClick={() => {
                  setFollowUpNoteDraft(lead.follow_up_note ?? "");
                  setFollowUpDateDraft(lead.follow_up_at?.slice(0, 10) ?? "");
                  setFollowUpTimeDraft(followUpHasTime(lead.follow_up_at) ? fmtHora(lead.follow_up_at!) : "");
                  setFollowUpPickerOpen(true);
                }} className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0">Alterar</button>
                <button onClick={clearFollowUp} className="text-xs text-white/40 hover:text-red-400 transition-colors shrink-0">Remover</button>
              </div>
            ) : followUpPickerOpen ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input type="date" value={followUpDateDraft}
                    onChange={(e) => setFollowUpDateDraft(e.target.value)}
                    className="h-8 rounded-lg px-2 text-xs text-white outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid var(--subtle-overlay)" }} />
                  <input type="time" value={followUpTimeDraft}
                    onChange={(e) => setFollowUpTimeDraft(e.target.value)}
                    placeholder="Horário (opcional)"
                    className="h-8 rounded-lg px-2 text-xs text-white outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid var(--subtle-overlay)" }} />
                </div>
                <Textarea value={followUpNoteDraft} onChange={(e) => setFollowUpNoteDraft(e.target.value)}
                  placeholder="Observação (opcional) — ex: retornar após envio da proposta"
                  rows={2}
                  className="bg-white/5 border-white/10 text-white rounded-lg resize-none text-xs" />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveFollowUp(followUpDateDraft, followUpTimeDraft)}
                    disabled={!followUpDateDraft}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                    Salvar
                  </button>
                  <button onClick={() => setFollowUpPickerOpen(false)} className="text-xs text-white/40 hover:text-white/70 transition-colors">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setFollowUpNoteDraft(""); setFollowUpDateDraft(""); setFollowUpTimeDraft(""); setFollowUpPickerOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-medium text-white/40 hover:text-white/70 transition-colors">
                <Clock className="w-3.5 h-3.5" /> Marcar follow-up
              </button>
            )}
          </div>

          <div className="px-5 pt-4 space-y-6">

            {/* Conversa WhatsApp (tempo real) */}
            <LeadChatBox lead={lead} orgId={orgId} />

            {/* Calls */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Calls</p>
                <button onClick={() => setCallModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                  style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                  <Plus className="w-3 h-3" />Agendar
                </button>
              </div>

              {loadingData ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/20" /></div>
              ) : calls.length === 0 ? (
                <p className="text-xs text-white/25 py-3">Nenhuma call agendada.</p>
              ) : (
                <div className="space-y-2">
                  {calls.map((c) => {
                    const isPast    = new Date(c.data_hora) < new Date();
                    const isPerdida = c.status === "perdida";
                    const isFeita   = c.status === "realizada";
                    return (
                      <div key={c.id} className="rounded-xl p-3"
                        style={{
                          backgroundColor: isPerdida ? "rgba(239,68,68,0.06)" : isFeita ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${isPerdida ? "rgba(239,68,68,0.2)" : isFeita ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}`,
                        }}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white">
                                {fmtDate(c.data_hora)} às {fmtHora(c.data_hora)}
                              </p>
                              {isPerdida && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                                  Perdida
                                </span>
                              )}
                              {isFeita && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                                  Realizada
                                </span>
                              )}
                            </div>
                            {c.observacoes && <p className="text-xs text-white/40 mt-0.5">{c.observacoes}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!isFeita && !isPerdida && (
                              <button onClick={() => markCallDone(c.id)} title="Marcar realizada"
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                                style={{ backgroundColor: "rgba(34,197,94,0.12)" }}>
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              </button>
                            )}
                            <button onClick={() => deleteCall(c.id)} title="Excluir"
                              disabled={deletingCall === c.id}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                              style={{ backgroundColor: "var(--btn-ghost-bg)" }}>
                              <Trash2 className="w-3 h-3 text-white/30" />
                            </button>
                          </div>
                        </div>
                        {/* Messages */}
                        {(c.msg_confirmacao || c.msg_lembrete) && (
                          <div className="mt-2 space-y-1.5">
                            {c.msg_confirmacao && (
                              <div className="flex items-start gap-2 rounded-lg p-2"
                                style={{ backgroundColor: "var(--surface-1)" }}>
                                <p className="text-[10px] text-white/30 leading-relaxed flex-1">{c.msg_confirmacao}</p>
                                <CopyButton text={c.msg_confirmacao} />
                              </div>
                            )}
                            {c.msg_lembrete && (
                              <div className="flex items-start gap-2 rounded-lg p-2"
                                style={{ backgroundColor: "var(--surface-1)" }}>
                                <p className="text-[10px] text-white/30 leading-relaxed flex-1">{c.msg_lembrete}</p>
                                <CopyButton text={c.msg_lembrete} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Interaction history */}
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium mb-3">Histórico de Interações</p>

              {/* Add note */}
              <div className="flex gap-2 mb-3">
                <Textarea value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Nova anotação..."
                  rows={2}
                  className="bg-white/5 border-white/10 text-white rounded-xl resize-none text-sm flex-1" />
                <button onClick={addNota} disabled={addingNota || !nota.trim()}
                  className="w-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
                  style={{ background: "var(--cp-gradient)" }}>
                  {addingNota ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Plus className="w-4 h-4 text-white" />}
                </button>
              </div>

              {loadingData ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/20" /></div>
              ) : interactions.length === 0 ? (
                <p className="text-xs text-white/25 py-3">Nenhuma interação registrada.</p>
              ) : (
                <div className="space-y-2">
                  {interactions.map((i) => (
                    <div key={i.id} className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: "var(--surface-1)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/75 leading-relaxed whitespace-pre-line">{i.nota}</p>
                        <p className="text-[10px] text-white/25 mt-1">{fmtBR(i.created_at)}</p>
                      </div>
                      <button onClick={() => deleteInteraction(i.id)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-100"
                        style={{ backgroundColor: "var(--btn-ghost-bg)" }}>
                        <X className="w-3 h-3 text-white/30" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Convert to student */}
            {lead.status === "fechado" && !lead.aluno_id && (
              <div className="rounded-xl p-4 space-y-3"
                style={{ backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-green-400" />
                  <p className="text-sm font-semibold text-green-400">Converter em aluno</p>
                </div>
                {!convOpen ? (
                  <button onClick={() => setConvOpen(true)}
                    className="w-full h-9 rounded-xl text-xs font-semibold transition-colors"
                    style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                    Iniciar conversão
                  </button>
                ) : (
                  <div className="space-y-2">
                    <Input value={convEmail} onChange={(e) => setConvEmail(e.target.value)}
                      placeholder="E-mail do novo aluno"
                      className="bg-white/5 border-white/10 text-white rounded-xl h-10 text-sm" />
                    <p className="text-[11px] text-white/30">Uma senha temporária será enviada por e-mail.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConvOpen(false)}
                        className="flex-1 h-9 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: "var(--btn-ghost-bg)", color: "var(--btn-ghost-color)" }}>
                        Cancelar
                      </button>
                      <button onClick={convertToStudent} disabled={converting}
                        className="flex-1 h-9 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                        {converting ? "Convertendo..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Danger zone */}
            <div className="pt-2 pb-2">
              <button
                onClick={() => { if (confirm(`Excluir lead "${lead.nome}"?`)) { onDelete(lead.id); onClose(); } }}
                className="w-full h-9 rounded-xl text-xs font-semibold transition-colors"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.6)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.15)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.08)"; }}>
                Excluir lead
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LeadCard
// ─────────────────────────────────────────────────────────────────────────────
interface LeadCardProps {
  lead: Lead;
  nextCall?: LeadCall;
  onDetail: (lead: Lead) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

// Card minimalista pro Kanban — nome + origem só, mesmo "alto relevo" já usado
// no resto do painel (Dashboard/Meus Clientes/Agenda). Clique abre o detalhe
// completo (LeadDetailSheet); o drag-handle não propaga o clique.
const LeadCard = ({ lead, nextCall, onDetail, dragHandleProps }: LeadCardProps) => {
  const origem = ORIGEM_CFG[lead.origem] ?? ORIGEM_CFG.outro;
  const callPerdida = nextCall?.status === "perdida";
  const followUpLate = lead.follow_up_at ? new Date(lead.follow_up_at) <= new Date() : false;

  return (
    <div
      onClick={() => onDetail(lead)}
      className="rounded-xl p-3 cursor-pointer transition-all hover:-translate-y-0.5"
      style={{
        backgroundColor: "var(--dash-card-bg)",
        border: `1px solid ${callPerdida ? "rgba(239,68,68,0.4)" : "var(--dash-card-border)"}`,
        boxShadow: "var(--dash-card-shadow)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white truncate">{lead.nome}</p>
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            title="Arrastar"
            className="shrink-0 w-5 h-5 rounded flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-3.5 h-3.5 text-white/20" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "var(--tag-neutral-bg)", color: "var(--tag-neutral-color)" }}>
          {origem.label}
        </span>
        {callPerdida ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400">
            <AlertTriangle className="w-3 h-3" /> Call perdida
          </span>
        ) : nextCall?.status === "agendada" ? (
          <span className="text-[10px] text-purple-400 font-medium">
            {fmtDate(nextCall.data_hora)} · {fmtHora(nextCall.data_hora)}
          </span>
        ) : null}
        {lead.follow_up_at && (
          <span
            title={lead.follow_up_note ?? undefined}
            className={`flex items-center gap-1 text-[10px] font-semibold ${followUpLate ? "text-red-400" : "text-amber-400"}`}>
            <Clock className="w-3 h-3" /> Follow-up {fmtDate(lead.follow_up_at)}{followUpHasTime(lead.follow_up_at) && ` · ${fmtHora(lead.follow_up_at)}`}
          </span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Kanban board — drag-and-drop pipeline (Kommo/Pipedrive style)
// ─────────────────────────────────────────────────────────────────────────────
const DraggableLeadCard = (props: LeadCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: props.lead.id,
  });
  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
      }
    : {};

  return (
    <div ref={setNodeRef} style={style}>
      <LeadCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
};

const FOLLOW_UP_COLUMN_ID = "follow_up";

const KanbanColumn = ({
  id, label, countBg, countText, leads, callMap, onDetail, droppable = true, dashed = false, emptyLabel = "Nenhum lead",
}: {
  id: string;
  label: string;
  countBg: string;
  countText: string;
  leads: Lead[];
  callMap: Record<string, LeadCall>;
  onDetail: (lead: Lead) => void;
  droppable?: boolean;
  dashed?: boolean;
  emptyLabel?: string;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col shrink-0 w-[260px] rounded-2xl p-2 transition-colors ${dashed ? "border border-dashed border-white/10" : ""}`}
      style={{ backgroundColor: isOver ? "rgba(255,255,255,0.04)" : "transparent" }}
    >
      <div className="flex items-center justify-between px-2 py-1.5 mb-2">
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--tag-neutral-color)" }}>
          {dashed && <Clock className="w-3 h-3" />}
          {label}
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: countBg, color: countText }}>
          {leads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 min-h-[80px]">
        {leads.map((lead) => (
          <DraggableLeadCard
            key={lead.id}
            lead={lead}
            nextCall={callMap[lead.id]}
            onDetail={onDetail}
          />
        ))}
        {leads.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/8 py-6 text-center">
            <p className="text-[11px] text-white/20">{emptyLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const KanbanBoard = ({
  leads, callMap, onDetail, onStatusChange, onFollowUpClear,
}: {
  leads: Lead[];
  callMap: Record<string, LeadCall>;
  onDetail: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onFollowUpClear: (id: string) => void;
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  // Leads com follow-up marcado saem da coluna de etapa e "estacionam" na
  // coluna virtual Follow-up (ordenados por data mais próxima primeiro) — a
  // etapa real (status) não muda, só onde o card aparece. Volta pra coluna
  // de etapa quando o follow-up é removido (manual ou arrastando de volta).
  const grouped = useMemo(() => {
    const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as Lead[]])) as Record<LeadStatus, Lead[]>;
    leads.forEach((l) => { if (!l.follow_up_at) map[l.status]?.push(l); });
    return map;
  }, [leads]);

  const followUpLeads = useMemo(() =>
    leads.filter((l) => l.follow_up_at)
      .sort((a, b) => (a.follow_up_at as string).localeCompare(b.follow_up_at as string)),
    [leads]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const targetId = String(over.id);
    if (targetId === FOLLOW_UP_COLUMN_ID) return; // não é um destino válido de arraste
    const leadId    = String(active.id);
    const newStatus = targetId as LeadStatus;
    const lead      = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (lead.status !== newStatus) onStatusChange(leadId, newStatus);
    if (lead.follow_up_at) onFollowUpClear(leadId); // "resgatado" da coluna Follow-up
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 hide-scrollbar">
        {/* Primeira coluna de propósito — é a lista de "o que precisa de
            atenção hoje", quer aparecer antes de mergulhar no funil normal. */}
        <KanbanColumn
          id={FOLLOW_UP_COLUMN_ID}
          label="Follow-up"
          countBg="rgba(245,158,11,0.15)"
          countText="hsl(42 95% 58%)"
          leads={followUpLeads}
          callMap={callMap}
          onDetail={onDetail}
          droppable={false}
          dashed
          emptyLabel="Nenhum follow-up marcado"
        />
        <div className="w-px shrink-0 self-stretch my-2" style={{ backgroundColor: "var(--subtle-overlay)" }} />
        {STATUS_ORDER.map((s) => {
          const cfg = STATUS_CFG[s];
          return (
            <KanbanColumn
              key={s}
              id={s}
              label={cfg.label.replace(" ✓", "")}
              countBg={cfg.bg}
              countText={cfg.text}
              leads={grouped[s]}
              callMap={callMap}
              onDetail={onDetail}
            />
          );
        })}
      </div>
    </DndContext>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const Leads = () => {
  const { orgId, slug }  = useTenantContext();
  const { toast }        = useToast();

  const [leads,       setLeads]       = useState<Lead[]>([]);
  const [calls,       setCalls]       = useState<LeadCall[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [treinadorId, setTreinadorId] = useState<string>("");
  const [search,      setSearch]      = useState("");

  // Modal states
  const [addOpen,      setAddOpen]      = useState(false);
  const [editLead,     setEditLead]     = useState<Lead | null>(null);
  const [detailLead,   setDetailLead]   = useState<Lead | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setTreinadorId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!orgId || !treinadorId) return;
    loadLeads();
  }, [orgId, treinadorId]);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const [leadsRes, callsRes] = await Promise.all([
        supabase.from("leads")
          .select("*")
          .eq("org_id", orgId)
          .eq("treinador_id", treinadorId)
          .order("updated_at", { ascending: false }),
        supabase.from("lead_calls")
          .select("*")
          .eq("treinador_id", treinadorId)
          .in("status", ["agendada", "perdida"])
          .order("data_hora", { ascending: true }),
      ]);
      setLeads((leadsRes.data as Lead[]) ?? []);
      setCalls((callsRes.data as LeadCall[]) ?? []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar leads", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleSaved = (lead: Lead) => {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === lead.id);
      return idx >= 0 ? prev.map((l) => l.id === lead.id ? lead : l) : [lead, ...prev];
    });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("leads").delete().eq("id", id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    toast({ title: "Lead excluído" });
  };

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    await supabase.from("leads").update({ status }).eq("id", id);
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
    if (detailLead?.id === id) setDetailLead((prev) => prev ? { ...prev, status } : prev);
  };

  const handleConverted = (leadId: string, alunoId: string) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, aluno_id: alunoId, status: "fechado" } : l));
  };

  const handleFollowUpChange = (id: string, followUpAt: string | null, note: string | null) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, follow_up_at: followUpAt, follow_up_note: note } : l));
    if (detailLead?.id === id) setDetailLead((prev) => prev ? { ...prev, follow_up_at: followUpAt, follow_up_note: note } : prev);
  };

  // Arrastar um lead estacionado na coluna Follow-up de volta pra uma coluna
  // de etapa "resgata" ele — limpa o follow-up pra não voltar a se esconder ali.
  const handleFollowUpClear = async (id: string) => {
    await supabase.from("leads").update({ follow_up_at: null, follow_up_note: null }).eq("id", id);
    handleFollowUpChange(id, null, null);
  };

  // Map: leadId → next upcoming/overdue call
  const callByLead = useCallback(() => {
    const map: Record<string, LeadCall> = {};
    calls.forEach((c) => {
      if (!map[c.lead_id]) map[c.lead_id] = c;
    });
    return map;
  }, [calls]);

  // Filtered leads (search only — status is now expressed by Kanban column)
  const filtered = leads.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.nome.toLowerCase().includes(q) ||
      (l.whatsapp ?? "").includes(q) ||
      (l.instagram ?? "").toLowerCase().includes(q) ||
      (l.objetivo ?? "").toLowerCase().includes(q);
  });

  const callMap = callByLead();

  // Loading
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
        <p className="text-white/30 text-sm">Carregando leads...</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Modals */}
      {(addOpen || editLead) && treinadorId && orgId && (
        <LeadFormModal
          orgId={orgId} treinadorId={treinadorId}
          lead={editLead}
          onClose={() => { setAddOpen(false); setEditLead(null); }}
          onSaved={handleSaved}
        />
      )}
      {detailLead && treinadorId && orgId && (
        <LeadDetailSheet
          lead={detailLead} orgId={orgId} treinadorId={treinadorId}
          onClose={() => setDetailLead(null)}
          onEdit={(l) => setEditLead(l)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onCallScheduled={(c) => setCalls((prev) => [...prev, c])}
          onConverted={handleConverted}
          onFollowUpChange={handleFollowUpChange}
          onCallUpdated={(call) => setCalls((prev) => prev.map((c) => c.id === call.id ? call : c))}
          onCallDeleted={(callId) => setCalls((prev) => prev.filter((c) => c.id !== callId))}
        />
      )}
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-6">

          {/* Header */}
          <div className="flex items-center justify-between pt-6 pb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--cp-gradient)" }}>
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Leads</h1>
                <p className="text-xs text-white/40 mt-0.5">{leads.length} prospect{leads.length !== 1 ? "s" : ""} no total</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar lead..."
                  className="w-full sm:w-64 h-10 pl-10 pr-4 rounded-xl text-sm text-white placeholder-white/25 outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-white/30" />
                  </button>
                )}
              </div>
              <button onClick={() => setAddOpen(true)}
                className="flex items-center gap-2 h-10 px-4 rounded-xl font-semibold text-sm text-white transition-all active:scale-95 shrink-0"
                style={{ background: "var(--cp-gradient)" }}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo Lead</span>
              </button>
            </div>
          </div>

          {/* Kanban pipeline */}
          {leads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/8 px-4 py-14 text-center mt-4">
              <Target className="w-9 h-9 text-white/10 mx-auto mb-3" />
              <p className="text-sm font-medium text-white/50 mb-1">Nenhum lead ainda</p>
              <p className="text-xs text-white/25">Clique em "Novo Lead" para começar a capturar prospects.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/8 px-4 py-14 text-center mt-4">
              <Target className="w-9 h-9 text-white/10 mx-auto mb-3" />
              <p className="text-sm font-medium text-white/50 mb-1">Nenhum resultado</p>
              <p className="text-xs text-white/25">Tente ajustar a busca.</p>
            </div>
          ) : (
            <KanbanBoard
              leads={filtered}
              callMap={callMap}
              onDetail={setDetailLead}
              onStatusChange={handleStatusChange}
              onFollowUpClear={handleFollowUpClear}
            />
          )}

        </div>
      </div>
    </>
  );
};

export default Leads;
