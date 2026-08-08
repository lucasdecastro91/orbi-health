import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { Plus, X, Pencil, Trash2, Loader2, CreditCard, Smartphone, ToggleLeft, ToggleRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface InstallmentOption {
  installments: number;
  value: number;        // valor base passado para a API do Asaas
  client_value: number; // valor total cobrado do cliente (informativo)
}

interface Plan {
  id: string;
  name: string;
  pix_value: number | null;
  installment_options: InstallmentOption[];
  active: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Converte string no formato brasileiro ("3.943,74" ou "3943,74") para float
const parseBRL = (s: string): number =>
  parseFloat(s.replace(/\./g, "").replace(",", "."));

// ─────────────────────────────────────────────────────────────────────────────
// Modal de criar / editar plano
// ─────────────────────────────────────────────────────────────────────────────
interface PlanModalProps {
  orgId: string;
  trainerId: string;
  plan?: Plan;
  onClose: () => void;
  onSaved: (plan: Plan) => void;
}

const PlanModal = ({ orgId, trainerId, plan, onClose, onSaved }: PlanModalProps) => {
  const { toast } = useToast();
  const isEdit = !!plan;

  const [name,        setName]        = useState(plan?.name ?? "");
  const [pixValue,    setPixValue]    = useState(plan?.pix_value != null ? String(plan.pix_value) : "");
  const [options,     setOptions]     = useState<InstallmentOption[]>(plan?.installment_options ?? []);
  const [saving,      setSaving]      = useState(false);

  // Row temporária para nova opção de parcelamento
  const [newInstall,      setNewInstall]      = useState("");
  const [newValue,        setNewValue]        = useState(""); // valor Asaas
  const [newClientValue,  setNewClientValue]  = useState(""); // valor cobrado do cliente

  const addOption = () => {
    const inst        = parseInt(newInstall);
    const val         = parseBRL(newValue);
    const clientVal   = parseBRL(newClientValue);
    if (!inst || inst < 1 || isNaN(val) || val <= 0) {
      toast({ title: "Informe parcelas e valor Asaas válidos", variant: "destructive" }); return;
    }
    if (isNaN(clientVal) || clientVal <= 0) {
      toast({ title: "Informe o valor cobrado do cliente", variant: "destructive" }); return;
    }
    if (options.find((o) => o.installments === inst)) {
      toast({ title: `Opção de ${inst}x já existe`, variant: "destructive" }); return;
    }
    setOptions((prev) =>
      [...prev, { installments: inst, value: val, client_value: clientVal }]
        .sort((a, b) => a.installments - b.installments)
    );
    setNewInstall(""); setNewValue(""); setNewClientValue("");
  };

  const removeOption = (inst: number) =>
    setOptions((prev) => prev.filter((o) => o.installments !== inst));

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Informe o nome do plano", variant: "destructive" }); return; }
    const pix = pixValue ? parseBRL(pixValue) : null;
    if (pixValue && (isNaN(pix!) || pix! <= 0)) {
      toast({ title: "Valor PIX inválido", variant: "destructive" }); return;
    }
    if (!pix && options.length === 0) {
      toast({ title: "Informe ao menos um valor (PIX ou parcelamento)", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      const payload = {
        org_id:              orgId,
        trainer_id:          trainerId,
        name:                name.trim(),
        pix_value:           pix ?? null,
        installment_options: options,
      };

      if (isEdit) {
        const { data, error } = await supabase
          .from("plans").update(payload).eq("id", plan!.id).select().single();
        if (error) throw error;
        onSaved(data as Plan);
      } else {
        const { data, error } = await supabase
          .from("plans").insert({ ...payload, active: true }).select().single();
        if (error) throw error;
        onSaved(data as Plan);
      }
      toast({ title: isEdit ? "Plano atualizado!" : "Plano criado!" });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl pb-8 pt-5 px-5 space-y-4 overflow-y-auto max-h-[92vh]"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-white">{isEdit ? "Editar plano" : "Novo plano"}</p>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40" /></button>
        </div>

        {/* Nome */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Nome do plano *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Consultoria Online — Plano Anual"
            className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
        </div>

        {/* PIX */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">
            <Smartphone className="inline w-3 h-3 mr-1 mb-0.5" />Valor PIX (R$)
          </Label>
          <Input value={pixValue} onChange={(e) => setPixValue(e.target.value)}
            placeholder="Ex: 3600,00" inputMode="decimal"
            className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
        </div>

        {/* Parcelamento no cartão */}
        <div className="space-y-2">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">
            <CreditCard className="inline w-3 h-3 mr-1 mb-0.5" />Opções de parcelamento no cartão
          </Label>

          {/* Opções já adicionadas */}
          {options.length > 0 && (
            <div className="space-y-1.5">
              {options.map((o) => (
                <div key={o.installments}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--modal-border)" }}>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium">
                      {o.installments}x de {fmtBRL(o.client_value / o.installments)}/mês
                    </p>
                    <p className="text-[11px] text-white/30 mt-0.5">
                      cliente paga {fmtBRL(o.client_value)}
                      <span className="ml-2 text-white/20">· Asaas: {fmtBRL(o.value)}</span>
                    </p>
                  </div>
                  <button onClick={() => removeOption(o.installments)}
                    className="text-white/25 hover:text-red-400 transition-colors ml-3 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar nova opção */}
          <div className="space-y-2 rounded-xl p-3"
            style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Nova opção</p>
            <div className="flex gap-2">
              <div className="w-16 space-y-1 shrink-0">
                <p className="text-[10px] text-white/25">Parcelas</p>
                <Input value={newInstall} onChange={(e) => setNewInstall(e.target.value)}
                  placeholder="6" inputMode="numeric"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[10px] text-white/25">Valor base Asaas (R$)</p>
                <Input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                  placeholder="3845,15" inputMode="decimal"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[10px] text-white/25">Cobrado do cliente (R$)</p>
                <Input value={newClientValue} onChange={(e) => setNewClientValue(e.target.value)}
                  placeholder="3943,74" inputMode="decimal"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
              <button onClick={addOption}
                className="h-9 w-9 flex items-center justify-center rounded-xl shrink-0 self-end transition-all"
                style={{ background: "var(--cp-gradient)" }}>
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-[10px] text-white/20">
              Use os valores da simulação do Asaas. "Base" = enviado à API. "Cobrado" = total pago pelo cliente.
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}
          className="w-full h-11 rounded-xl font-semibold text-white"
          style={{ background: "var(--cp-gradient)" }}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar plano"}
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ProdutosPlanos — página principal
// ─────────────────────────────────────────────────────────────────────────────
const ProdutosPlanos = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [plans,      setPlans]      = useState<Plan[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [trainerId,  setTrainerId]  = useState("");
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editPlan,   setEditPlan]   = useState<Plan | undefined>(undefined);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { setTrainerId(user.id); }
    };
    init();
  }, []);

  useEffect(() => { if (orgId) loadPlans(); }, [orgId]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      setPlans((data ?? []) as Plan[]);
    } finally { setLoading(false); }
  };

  const handleToggle = async (plan: Plan) => {
    const newActive = !plan.active;
    try {
      await supabase.from("plans").update({ active: newActive }).eq("id", plan.id);
      setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, active: newActive } : p));
      toast({ title: newActive ? "Plano ativado" : "Plano desativado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este plano? Cobranças existentes não são afetadas.")) return;
    try {
      await supabase.from("plans").delete().eq("id", id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Plano excluído." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleSaved = (saved: Plan) => {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  return (
    <div className="flex flex-col min-h-screen">

      {/* Modals */}
      {modalOpen && (
        <PlanModal
          orgId={orgId}
          trainerId={trainerId}
          plan={editPlan}
          onClose={() => { setModalOpen(false); setEditPlan(undefined); }}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.2),rgba(245,158,11,0.1))", border: "1px solid rgba(251,191,36,0.2)" }}>
            <ListChecks className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Produtos / Planos</h1>
            <p className="text-xs text-white/35">Planos de serviço para cobranças</p>
          </div>
        </div>
        <Button onClick={() => { setEditPlan(undefined); setModalOpen(true); }}
          className="h-9 px-4 rounded-xl font-semibold text-white text-sm"
          style={{ background: "var(--cp-gradient)" }}>
          <Plus className="w-4 h-4 mr-1" />Novo plano
        </Button>
      </div>

      {/* Lista */}
      <div className="flex-1 px-4 pb-8 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl text-center py-16 space-y-3"
            style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
            <ListChecks className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-sm text-white/25">Nenhum plano cadastrado ainda.</p>
            <p className="text-xs text-white/20">Crie planos para agilizar a emissão de cobranças.</p>
          </div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "#141417",
                border: "1px solid rgba(255,255,255,0.09)",
                boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)",
                opacity: plan.active ? 1 : 0.7,
              }}>

              {/* Row 1: nome + ativo toggle */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className={`font-semibold text-sm truncate ${plan.active ? "text-white" : "text-white/40"}`}>
                    {plan.name}
                  </p>
                  {!plan.active && (
                    <span className="text-[10px] text-white/25 uppercase tracking-wider">Inativo</span>
                  )}
                </div>
                <button onClick={() => handleToggle(plan)} className="shrink-0 transition-opacity" title={plan.active ? "Desativar" : "Ativar"}>
                  {plan.active
                    ? <ToggleRight className="w-6 h-6" style={{ color: "var(--cp-500)" }} />
                    : <ToggleLeft className="w-6 h-6 text-white/20" />}
                </button>
              </div>

              {/* Row 2: valores */}
              <div className="flex flex-wrap gap-2 mb-3">
                {plan.pix_value != null && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                    style={{ backgroundColor: "var(--tag-dieta-bg)", color: "var(--tag-dieta-color)", border: "1px solid var(--tag-dieta-border)" }}>
                    <Smartphone className="w-3 h-3" />
                    PIX {fmtBRL(Number(plan.pix_value))}
                  </span>
                )}
                {(plan.installment_options ?? []).map((o) => (
                  <span key={o.installments}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                    style={{ backgroundColor: "var(--tag-indigo-bg)", color: "var(--tag-indigo-color)", border: "1px solid var(--tag-indigo-border)" }}>
                    <CreditCard className="w-3 h-3" />
                    {o.installments}x de {fmtBRL(o.client_value / o.installments)}/mês
                    <span style={{ color: "var(--tag-indigo-muted)" }}>— cliente paga {fmtBRL(o.client_value)}</span>
                  </span>
                ))}
              </div>

              {/* Row 3: ações */}
              <div className="flex gap-2">
                <button onClick={() => { setEditPlan(plan); setModalOpen(true); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ backgroundColor: "var(--btn-ghost-bg)", color: "var(--btn-ghost-color)" }}>
                  <Pencil className="w-3 h-3" />Editar
                </button>
                <button onClick={() => handleDelete(plan.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ backgroundColor: "var(--btn-danger-bg)", color: "var(--btn-danger-color)", border: "1px solid var(--btn-danger-border)" }}>
                  <Trash2 className="w-3 h-3" />Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProdutosPlanos;
