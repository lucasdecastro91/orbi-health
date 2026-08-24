import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { Plus, X, Pencil, Trash2, Loader2, CreditCard, Smartphone, ToggleLeft, ToggleRight, ListChecks, Calculator, Zap, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

// Formata float pra string editável em pt-BR ("3845.15" -> "3.845,15"),
// compatível com parseBRL (que trata "." como separador de milhar)
const toBRLInput = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CALC_LIMITE_LIQUIDO  = 5000;
const CALC_LIMITE_PARCELAS = 12;

interface CalcResult {
  totalCharged: number;
  perInstallment: number;
  netEstimated: number;
  marginApplied: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de criar / editar plano
// ─────────────────────────────────────────────────────────────────────────────
interface PlanModalProps {
  orgId: string;
  trainerId: string;
  isGsBrand: boolean;
  plan?: Plan;
  onClose: () => void;
  onSaved: (plan: Plan) => void;
}

const PlanModal = ({ orgId, trainerId, isGsBrand, plan, onClose, onSaved }: PlanModalProps) => {
  const { toast } = useToast();
  const isEdit = !!plan;

  const [name,        setName]        = useState(plan?.name ?? "");
  const [pixValue,    setPixValue]    = useState(plan?.pix_value != null ? String(plan.pix_value) : "");
  const [options,     setOptions]     = useState<InstallmentOption[]>(plan?.installment_options ?? []);
  const [saving,      setSaving]      = useState(false);

  // Row temporária para nova opção de parcelamento — um único valor, cobrado
  // do cliente e enviado à API são sempre o mesmo número (ver nota em addOption)
  const [newInstall,      setNewInstall]      = useState("");
  const [newValue,        setNewValue]        = useState("");

  // Calculadora de repasse (preenche newValue automaticamente)
  const [calcNetValue,   setCalcNetValue]   = useState("");
  const [calcAnticipate, setCalcAnticipate] = useState(false);
  const [calculating,    setCalculating]    = useState(false);
  const [calcResult,     setCalcResult]     = useState<CalcResult | null>(null);
  const [calcErro,       setCalcErro]       = useState("");

  const calcNetNum   = parseBRL(calcNetValue || "0") || 0;
  const calcInstNum  = parseInt(newInstall) || 0;
  const calcOverLimit = calcNetNum > CALC_LIMITE_LIQUIDO || calcInstNum > CALC_LIMITE_PARCELAS;

  // Valor da parcela exibido ao vivo em "Confirmar parcelamento" — sempre
  // recalculado do que está nos campos, nunca do resultado (possivelmente
  // desatualizado) do passo 1
  const newValueNum = parseBRL(newValue || "0") || 0;
  const newInstNum  = parseInt(newInstall) || 0;

  const handleCalcular = async () => {
    setCalcErro(""); setCalcResult(null);
    const net  = parseBRL(calcNetValue);
    const inst = parseInt(newInstall);
    if (isNaN(net) || net <= 0) { setCalcErro("Informe o valor líquido desejado."); return; }
    if (!inst || inst < 1) { setCalcErro("Informe o número de parcelas."); return; }
    if (net > CALC_LIMITE_LIQUIDO || inst > CALC_LIMITE_PARCELAS) {
      setCalcErro(`Cálculo automático disponível até ${CALC_LIMITE_PARCELAS}x e ${fmtBRL(CALC_LIMITE_LIQUIDO)} líquidos. Pra valores maiores, fale com o suporte (bolha de ajuda no canto da tela).`);
      return;
    }

    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("calcular-repasse-cartao", {
        body: { netDesired: net, installments: inst, anticipate: calcAnticipate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);

      // `value` enviado ao POST /payments da Asaas é o bruto cobrado do
      // aluno (confirmado ao vivo por Lucas, 2026-08-23) — "repassar taxas"
      // do simulador só vale pro checkout hospedado da Asaas, não pra cobrança
      // criada direto via API.
      setNewValue(toBRLInput(data.totalCharged));
      setCalcResult({
        totalCharged:    data.totalCharged,
        perInstallment:  data.perInstallment,
        netEstimated:    data.netEstimated,
        marginApplied:   data.marginApplied,
      });
    } catch (e: any) {
      setCalcErro(e.message ?? "Erro ao calcular");
    } finally { setCalculating(false); }
  };

  const addOption = () => {
    const inst = parseInt(newInstall);
    const val  = parseBRL(newValue);
    if (!inst || inst < 1 || isNaN(val) || val <= 0) {
      toast({ title: "Informe parcelas e valor válidos", variant: "destructive" }); return;
    }
    if (options.find((o) => o.installments === inst)) {
      toast({ title: `Opção de ${inst}x já existe`, variant: "destructive" }); return;
    }
    // client_value = value: o mesmo número serve pro `value` enviado à API e
    // pro que é exibido como total pago pelo cliente (são a mesma coisa)
    setOptions((prev) =>
      [...prev, { installments: inst, value: val, client_value: val }]
        .sort((a, b) => a.installments - b.installments)
    );
    setNewInstall(""); setNewValue("");
    setCalcNetValue(""); setCalcResult(null); setCalcErro("");
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

          {/* Calculadora de repasse — só a base de cálculo da conta master (sem
              split). Outras orgs vão ter o % da ORBI descontado quando Subcontas
              existir, e essa fórmula não contempla isso ainda. */}
          {isGsBrand ? (
            <div className="space-y-2.5 rounded-xl p-3"
              style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-black shrink-0"
                  style={{ background: "var(--cp-gradient)" }}>1</span>
                <Calculator className="w-3 h-3 text-white/40" />
                <p className="text-[10px] text-white/30 uppercase tracking-wider">Calcular automaticamente</p>
              </div>

              <div className="flex gap-2">
                <div className="w-16 space-y-1 shrink-0">
                  <p className="text-[10px] text-white/25">Parcelas</p>
                  <Input value={newInstall} onChange={(e) => { setNewInstall(e.target.value); setCalcResult(null); }}
                    placeholder="6" inputMode="numeric"
                    className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-[10px] text-white/25">Valor líquido desejado (R$)</p>
                  <Input value={calcNetValue} onChange={(e) => { setCalcNetValue(e.target.value); setCalcResult(null); }}
                    placeholder="1000,00" inputMode="decimal"
                    className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
                </div>
              </div>

              <div className="flex items-center justify-between px-0.5">
                <Label className="text-xs text-white/50">Antecipar recebimento</Label>
                <Switch checked={calcAnticipate} onCheckedChange={(v) => { setCalcAnticipate(v); setCalcResult(null); }} />
              </div>

              {calcOverLimit && (calcNetValue || newInstall) && (
                <p className="text-[10px] text-amber-400/80">
                  Cálculo automático vai até {CALC_LIMITE_PARCELAS}x e {fmtBRL(CALC_LIMITE_LIQUIDO)} líquidos. Acima disso, fale com o suporte.
                </p>
              )}
              {calcErro && <p className="text-[11px] text-red-400">{calcErro}</p>}

              <Button onClick={handleCalcular} disabled={calculating || calcOverLimit}
                className="w-full h-9 rounded-xl font-semibold text-white text-xs"
                style={{ background: "var(--cp-gradient)" }}>
                {calculating
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Calculando...</>
                  : <><Zap className="w-3.5 h-3.5 mr-1.5" />Calcular</>}
              </Button>

              {calcResult && (
                <div className="rounded-lg px-3 py-2 space-y-0.5"
                  style={{ backgroundColor: "var(--tag-dieta-bg)", border: "1px solid var(--tag-dieta-border)" }}>
                  <p className="text-xs text-white font-medium">
                    Aluno paga {fmtBRL(calcResult.totalCharged)}
                    {calcInstNum > 1 && <span className="text-white/50"> · {fmtBRL(calcResult.perInstallment)}/mês</span>}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--tag-dieta-color)" }}>
                    Você recebe {fmtBRL(calcResult.netEstimated)} líquidos
                    {calcAnticipate && calcResult.marginApplied > 0 && (
                      <span className="text-white/30"> (margem de segurança de {fmtBRL(calcResult.marginApplied)} já embutida)</span>
                    )}
                  </p>
                </div>
              )}

            </div>
          ) : (
            <div className="rounded-xl p-3 flex items-start gap-2"
              style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
              <Calculator className="w-3.5 h-3.5 text-white/25 shrink-0 mt-0.5" />
              <p className="text-[11px] text-white/35">
                Calculadora automática ainda não disponível pra essa organização — a base de cálculo muda quando
                a comissão da plataforma entrar em cena. Informe os valores manualmente abaixo.
              </p>
            </div>
          )}

          {/* Conector visual entre os dois passos */}
          {isGsBrand && (
            <div className="flex items-center justify-center gap-1.5 -my-1">
              <ArrowDown className="w-3 h-3 text-white/15" />
              <p className="text-[9px] text-white/20">valores calculados caem aqui embaixo</p>
            </div>
          )}

          {/* Adicionar / confirmar opção de parcelamento (via calculadora ou manual) */}
          <div className="space-y-2 rounded-xl p-3"
            style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-1.5">
              {isGsBrand && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-black shrink-0"
                  style={{ background: "var(--cp-gradient)" }}>2</span>
              )}
              <p className="text-[10px] text-white/30 uppercase tracking-wider">
                {isGsBrand ? "Confirmar parcelamento" : "Opção de parcelamento"}
              </p>
            </div>
            <div className="flex gap-2">
              <div className="w-16 space-y-1 shrink-0">
                <p className="text-[10px] text-white/25">Parcelas</p>
                <Input value={newInstall} onChange={(e) => setNewInstall(e.target.value)}
                  placeholder="6" inputMode="numeric"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[10px] text-white/25">Valor cobrado do cliente (R$)</p>
                <Input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                  placeholder="3943,74" inputMode="decimal"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
              {newValueNum > 0 && newInstNum > 1 && (
                <p className="text-sm font-bold text-white/90 whitespace-nowrap self-end h-9 flex items-center shrink-0">
                  = {fmtBRL(newValueNum / newInstNum)}/mês
                </p>
              )}
              <button onClick={addOption}
                className="h-9 w-9 flex items-center justify-center rounded-xl shrink-0 self-end transition-all"
                style={{ background: "var(--cp-gradient)" }}>
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-[10px] text-white/20">
              {isGsBrand
                ? "Preenchido pelo passo 1, ou digite direto — é o valor total enviado à API e pago pelo cliente."
                : "Total que o cliente paga, já com as taxas embutidas."}
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
  const { orgId, org } = useTenantContext();
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
          isGsBrand={org?.is_gs_brand ?? false}
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
            style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
            <ListChecks className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-sm text-white/25">Nenhum plano cadastrado ainda.</p>
            <p className="text-xs text-white/20">Crie planos para agilizar a emissão de cobranças.</p>
          </div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "var(--section-card-bg)",
                border: "1px solid var(--section-card-border)",
                boxShadow: "var(--section-card-shadow)",
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
