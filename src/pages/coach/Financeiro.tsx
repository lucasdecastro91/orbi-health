import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, X, Copy, Check, Loader2, CreditCard,
  Wallet, ChevronDown, CheckCircle2, AlertTriangle,
  Smartphone, TrendingUp, Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type PayStatus = "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "CANCELLED" | "REFUNDED";

interface Cobranca {
  id: string;
  aluno_id: string;
  treinador_id: string;
  descricao: string;
  asaas_id: string | null;
  forma_pagamento: string;
  valor: number;
  status: PayStatus;
  data_vencimento: string;
  data_pagamento: string | null;
  invoice_url: string | null;
  pix_key: string | null;
  created_at: string;
  aluno_nome?: string;
}

interface AlunoOption {
  id: string;
  user_id: string;
  nome: string;
}

interface InstallmentOption {
  installments: number;
  value: number;        // valor base para API Asaas
  client_value: number; // valor total cobrado do cliente
}

interface Plan {
  id: string;
  name: string;
  pix_value: number | null;
  installment_options: InstallmentOption[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<PayStatus, { label: string; bg: string; text: string }> = {
  PENDING:   { label: "Pendente",     bg: "rgba(251,191,36,0.12)",  text: "#fbbf24" },
  RECEIVED:  { label: "Pago",         bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
  CONFIRMED: { label: "Confirmado",   bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
  OVERDUE:   { label: "Vencido",      bg: "rgba(239,68,68,0.12)",   text: "#f87171" },
  CANCELLED: { label: "Cancelado",    bg: "rgba(107,114,128,0.12)", text: "#9ca3af" },
  REFUNDED:  { label: "Reembolsado",  bg: "rgba(107,114,128,0.12)", text: "#9ca3af" },
};

const FORMA_LABEL: Record<string, string> = {
  PIX: "PIX", CREDIT_CARD: "Cartão", BOLETO: "Boleto",
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return iso; }
};

// ─────────────────────────────────────────────────────────────────────────────
// CopyButton
// ─────────────────────────────────────────────────────────────────────────────
const CopyBtn = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
      style={{
        backgroundColor: copied ? "var(--btn-success-bg)" : "var(--btn-ghost-bg)",
        color:  copied ? "var(--btn-success-color)" : "var(--btn-ghost-color)",
        border: `1px solid ${copied ? "var(--btn-success-border)" : "var(--btn-ghost-border)"}`,
      }}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copiado!" : label}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PaymentSuccessModal — exibido após criação da cobrança
// ─────────────────────────────────────────────────────────────────────────────
const PaymentSuccessModal = ({
  cobranca, alunoNome, onClose,
}: { cobranca: Cobranca; alunoNome: string; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center"
    style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={onClose}>
    <div className="w-full max-w-lg rounded-t-3xl pb-8 pt-5 px-5 space-y-4"
      style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)" }}
      onClick={(e) => e.stopPropagation()}>

      <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(34,197,94,0.15)" }}>
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <p className="text-base font-bold text-white">Cobrança gerada!</p>
          <p className="text-xs text-white/40">{alunoNome} — {fmtBRL(Number(cobranca.valor))}</p>
        </div>
      </div>

      {/* PIX copia e cola */}
      {cobranca.pix_key && (
        <div className="rounded-xl p-3 space-y-2.5"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">PIX — Copia e Cola</p>
          <p className="text-[11px] text-white/40 font-mono break-all leading-relaxed line-clamp-2">
            {cobranca.pix_key}
          </p>
          <CopyBtn text={cobranca.pix_key} label="Copiar chave PIX" />
        </div>
      )}

      {/* Link de pagamento */}
      {cobranca.invoice_url && (
        <div className="rounded-xl p-3 space-y-2.5"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">Link de pagamento</p>
          <p className="text-[11px] text-white/40 break-all">{cobranca.invoice_url}</p>
          <CopyBtn text={cobranca.invoice_url} label="Copiar link" />
        </div>
      )}

      {!cobranca.pix_key && !cobranca.invoice_url && (
        <p className="text-sm text-white/40 text-center py-2">
          Cobrança criada. Acesse o painel Asaas para obter o link de pagamento.
        </p>
      )}

      <Button onClick={onClose}
        className="w-full h-11 rounded-xl font-semibold text-white"
        style={{ background: "var(--cp-gradient)" }}>
        Fechar
      </Button>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// NovaCobrancaModal
// ─────────────────────────────────────────────────────────────────────────────
interface NovaCobrancaProps {
  orgId: string;
  alunos: AlunoOption[];
  onClose: () => void;
  onCreated: (c: Cobranca) => void;
}

const CUSTOM_PLAN_ID = "__custom__";

const NovaCobrancaModal = ({ orgId, alunos, onClose, onCreated }: NovaCobrancaProps) => {
  const { toast }  = useToast();
  const navigate   = useNavigate();

  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 30);
  const defaultDueStr = defaultDue.toISOString().slice(0, 10);

  const [plans,        setPlans]        = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [alunoId,      setAlunoId]      = useState(alunos[0]?.id ?? "");
  const [planId,       setPlanId]       = useState("");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [descricao,    setDescricao]    = useState("");
  const [manualValor,  setManualValor]  = useState("");
  const [forma,        setForma]        = useState("PIX");
  const [installments, setInstallments] = useState<number | null>(null);
  const [vencimento,   setVencimento]   = useState(defaultDueStr);
  const [saving,       setSaving]       = useState(false);
  const [cpf,          setCpf]          = useState("");

  useEffect(() => {
    supabase.from("plans").select("*").eq("org_id", orgId).eq("active", true)
      .order("name").then(({ data }) => {
        setPlans((data ?? []) as Plan[]);
        setPlansLoading(false);
      });
  }, [orgId]);

  const handlePlanChange = (id: string) => {
    setPlanId(id);
    setInstallments(null);
    if (id === CUSTOM_PLAN_ID || id === "") {
      setSelectedPlan(null);
      setForma("PIX");
    } else {
      const p = plans.find((p) => p.id === id) ?? null;
      setSelectedPlan(p);
      if (p) setForma(p.pix_value != null ? "PIX" : "CREDIT_CARD");
    }
  };

  const handleFormaChange = (f: string) => { setForma(f); setInstallments(null); };

  const computedValor = (): number | null => {
    if (!selectedPlan || planId === CUSTOM_PLAN_ID) return null;
    if (forma === "PIX") return selectedPlan.pix_value;
    if (forma === "CREDIT_CARD" && installments != null) {
      return selectedPlan.installment_options.find((o) => o.installments === installments)?.value ?? null;
    }
    return null;
  };

  const valorFinal = computedValor();

  const handleCpfChange = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 14);
    let fmt = d;
    if (d.length <= 11) {
      fmt = d
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
    } else {
      fmt = d
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
        .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
    }
    setCpf(fmt);
  };

  const handleCreate = async () => {
    if (!alunoId) { toast({ title: "Selecione um aluno", variant: "destructive" }); return; }
    if (!planId)  { toast({ title: "Selecione um plano", variant: "destructive" }); return; }

    const isCustom  = planId === CUSTOM_PLAN_ID;
    const descFinal = isCustom ? descricao.trim() : (selectedPlan?.name ?? "");
    if (!descFinal) { toast({ title: "Informe a descrição", variant: "destructive" }); return; }

    let valorNum: number;
    if (isCustom) {
      valorNum = parseFloat(manualValor.replace(",", "."));
      if (isNaN(valorNum) || valorNum <= 0) {
        toast({ title: "Informe um valor válido", variant: "destructive" }); return;
      }
    } else {
      if (valorFinal == null) {
        toast({ title: forma === "CREDIT_CARD" ? "Selecione o número de parcelas" : "Plano sem valor PIX", variant: "destructive" }); return;
      }
      valorNum = valorFinal;
    }

    if (!vencimento) { toast({ title: "Informe a data de vencimento", variant: "destructive" }); return; }
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      toast({ title: "Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) do cliente", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-create-charge", {
        body: {
          aluno_id:          alunoId,
          org_id:            orgId,
          descricao:         descFinal,
          valor:             valorNum,
          vencimento,
          forma_pagamento:   forma,
          cpf:               cpfDigits,
          installment_count: forma === "CREDIT_CARD" && installments ? installments : 1,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onCreated(data.cobranca as Cobranca);
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao gerar cobrança", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const isCustom = planId === CUSTOM_PLAN_ID;
  const hasPix   = selectedPlan?.pix_value != null;
  const hasCard  = (selectedPlan?.installment_options?.length ?? 0) > 0;
  const cardOpts = selectedPlan?.installment_options ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl pb-8 pt-5 px-5 space-y-4 overflow-y-auto max-h-[92vh]"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-white">Nova cobrança</p>
          <button onClick={onClose}><X className="w-5 h-5 text-white/40" /></button>
        </div>

        {/* Aluno */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Aluno *</Label>
          <div className="relative">
            <select value={alunoId} onChange={(e) => setAlunoId(e.target.value)}
              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl h-11 px-3 text-sm text-white focus:outline-none cursor-pointer">
              {alunos.length === 0
                ? <option value="">Nenhum aluno encontrado</option>
                : alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        {/* CPF / CNPJ */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">CPF / CNPJ *</Label>
          <Input value={cpf} onChange={(e) => handleCpfChange(e.target.value)}
            placeholder="000.000.000-00 ou 00.000.000/0000-00" inputMode="numeric"
            className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
        </div>

        {/* Plano */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-white/40 uppercase tracking-wider">Plano *</Label>
            {!plansLoading && plans.length === 0 && (
              <button onClick={() => { onClose(); navigate("../planos"); }}
                className="flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors">
                <Settings className="w-3 h-3" />Cadastrar planos
              </button>
            )}
          </div>
          <div className="relative">
            <select value={planId} onChange={(e) => handlePlanChange(e.target.value)}
              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl h-11 px-3 text-sm text-white focus:outline-none cursor-pointer">
              <option value="">Selecione um plano…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={CUSTOM_PLAN_ID}>Outro (personalizado)</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        {/* Personalizado: descrição + valor */}
        {isCustom && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-white/40 uppercase tracking-wider">Descrição *</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Mensalidade Junho/2025"
                className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-white/40 uppercase tracking-wider">Valor (R$) *</Label>
              <Input value={manualValor} onChange={(e) => setManualValor(e.target.value)}
                placeholder="150,00" inputMode="decimal"
                className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
            </div>
          </>
        )}

        {/* Forma de pagamento */}
        {planId && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-white/40 uppercase tracking-wider">Forma de pagamento</Label>
            <div className={`grid gap-2 ${(isCustom || (hasPix && hasCard)) ? "grid-cols-2" : "grid-cols-1"}`}>
              {(isCustom || hasPix) && (
                <button onClick={() => handleFormaChange("PIX")}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: forma === "PIX" ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
                    color:           forma === "PIX" ? "#fbbf24" : "rgba(255,255,255,0.45)",
                    border: `1px solid ${forma === "PIX" ? "rgba(251,191,36,0.35)" : "transparent"}`,
                  }}>
                  <Smartphone className="w-4 h-4" />
                  PIX {!isCustom && selectedPlan?.pix_value != null && (
                    <span className="text-xs opacity-70">{fmtBRL(Number(selectedPlan.pix_value))}</span>
                  )}
                </button>
              )}
              {(isCustom || hasCard) && (
                <button onClick={() => handleFormaChange("CREDIT_CARD")}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: forma === "CREDIT_CARD" ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
                    color:           forma === "CREDIT_CARD" ? "#fbbf24" : "rgba(255,255,255,0.45)",
                    border: `1px solid ${forma === "CREDIT_CARD" ? "rgba(251,191,36,0.35)" : "transparent"}`,
                  }}>
                  <CreditCard className="w-4 h-4" />Cartão
                </button>
              )}
            </div>
          </div>
        )}

        {/* Parcelas */}
        {planId && !isCustom && forma === "CREDIT_CARD" && cardOpts.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-white/40 uppercase tracking-wider">Parcelas *</Label>
            <div className="grid grid-cols-2 gap-2">
              {cardOpts.map((o) => (
                <button key={o.installments} onClick={() => setInstallments(o.installments)}
                  className="flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl text-sm font-medium transition-all px-2"
                  style={{
                    backgroundColor: installments === o.installments ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
                    color:           installments === o.installments ? "#fbbf24" : "rgba(255,255,255,0.45)",
                    border: `1px solid ${installments === o.installments ? "rgba(251,191,36,0.35)" : "transparent"}`,
                  }}>
                  <span className="font-bold">{o.installments}x de {fmtBRL(o.client_value / o.installments)}/mês</span>
                  <span className="text-[10px] opacity-60">cliente paga {fmtBRL(o.client_value)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resumo do valor */}
        {valorFinal != null && (
          <div className="rounded-xl px-4 py-3 space-y-1"
            style={{ backgroundColor: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">
                {forma === "PIX" ? "Valor PIX" : `${installments}x — cobrado do cliente`}
              </span>
              <span className="text-base font-bold text-amber-400">
                {forma === "PIX"
                  ? fmtBRL(valorFinal)
                  : fmtBRL(cardOpts.find((o) => o.installments === installments)?.client_value ?? valorFinal)}
              </span>
            </div>
            {forma === "CREDIT_CARD" && installments && (
              <p className="text-[10px] text-white/25 text-right">valor Asaas: {fmtBRL(valorFinal)}</p>
            )}
          </div>
        )}

        {/* Vencimento */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-white/40 uppercase tracking-wider">Data de vencimento *</Label>
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)}
            className="w-full h-11 rounded-xl px-3 text-sm text-foreground outline-none"
            style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }} />
        </div>

        <Button onClick={handleCreate} disabled={saving || alunos.length === 0}
          className="w-full h-11 rounded-xl font-semibold text-white"
          style={{ background: "var(--cp-gradient)" }}>
          {saving
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
            : <><Plus className="w-4 h-4 mr-2" />Gerar cobrança</>}
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Financeiro — página principal
// ─────────────────────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: "TODAS",     label: "Todas"     },
  { key: "PENDENTES", label: "Pendentes" },
  { key: "PAGAS",     label: "Pagas"     },
  { key: "VENCIDAS",  label: "Vencidas"  },
];

const Financeiro = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [cobrancas,    setCobrancas]    = useState<Cobranca[]>([]);
  const [alunos,       setAlunos]       = useState<AlunoOption[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [modalOpen,    setModalOpen]    = useState(false);
  const [successData,  setSuccessData]  = useState<{ cobranca: Cobranca; nome: string } | null>(null);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? "";

      const [cobRes, alunosRes] = await Promise.all([
        supabase
          .from("cobrancas")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("alunos")
          .select("id, user_id")
          .eq("org_id", orgId)
          .eq("treinador_id", userId)
          .eq("ativo", true),
      ]);

      const alunosData = alunosRes.data ?? [];
      if (alunosData.length > 0) {
        const userIds = alunosData.map((a) => a.user_id).filter(Boolean);
        const { data: profiles } = await supabase
          .from("profiles").select("id, nome").in("id", userIds);

        const alunoList: AlunoOption[] = alunosData.map((a) => ({
          id:      a.id,
          user_id: a.user_id,
          nome:    profiles?.find((p) => p.id === a.user_id)?.nome ?? "Sem nome",
        }));
        setAlunos(alunoList.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));

        setCobrancas(
          (cobRes.data ?? []).map((c) => ({
            ...c,
            aluno_nome: alunoList.find((a) => a.id === c.aluno_id)?.nome ?? "Desconhecido",
          }))
        );
      } else {
        setCobrancas((cobRes.data ?? []) as Cobranca[]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      await supabase.from("cobrancas")
        .update({ status: "RECEIVED", data_pagamento: today })
        .eq("id", id);
      setCobrancas((prev) =>
        prev.map((c) => c.id === id ? { ...c, status: "RECEIVED", data_pagamento: today } : c)
      );
      toast({ title: "Marcada como paga!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await supabase.from("cobrancas").update({ status: "CANCELLED" }).eq("id", id);
      setCobrancas((prev) =>
        prev.map((c) => c.id === id ? { ...c, status: "CANCELLED" } : c)
      );
      toast({ title: "Cobrança cancelada." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCreated = (c: Cobranca) => {
    const nome = alunos.find((a) => a.id === c.aluno_id)?.nome ?? "";
    const enriched = { ...c, aluno_nome: nome };
    setCobrancas((prev) => [enriched, ...prev]);
    setSuccessData({ cobranca: enriched, nome });
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now        = new Date();
  const mesPfx     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const totalMes   = cobrancas
    .filter((c) => ["RECEIVED","CONFIRMED"].includes(c.status) && c.data_pagamento?.startsWith(mesPfx))
    .reduce((s, c) => s + Number(c.valor), 0);
  const totalPend  = cobrancas.filter((c) => c.status === "PENDING").reduce((s, c) => s + Number(c.valor), 0);
  const totalVenc  = cobrancas.filter((c) => c.status === "OVERDUE").reduce((s, c) => s + Number(c.valor), 0);
  const countPend  = cobrancas.filter((c) => c.status === "PENDING").length;
  const countVenc  = cobrancas.filter((c) => c.status === "OVERDUE").length;

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = cobrancas.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.aluno_nome?.toLowerCase().includes(q) ||
      c.descricao.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "TODAS" ||
      (statusFilter === "PAGAS"     && ["RECEIVED","CONFIRMED"].includes(c.status)) ||
      (statusFilter === "PENDENTES" && c.status === "PENDING") ||
      (statusFilter === "VENCIDAS"  && c.status === "OVERDUE");
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Modals */}
      {modalOpen && (
        <NovaCobrancaModal
          orgId={orgId}
          alunos={alunos}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
      {successData && (
        <PaymentSuccessModal
          cobranca={successData.cobranca}
          alunoNome={successData.nome}
          onClose={() => setSuccessData(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.2),rgba(245,158,11,0.1))", border: "1px solid rgba(251,191,36,0.2)" }}>
            <Wallet className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Financeiro</h1>
            <p className="text-xs text-white/35">Cobranças e pagamentos</p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}
          className="h-9 px-4 rounded-xl font-semibold text-white text-sm"
          style={{ background: "var(--cp-gradient)" }}>
          <Plus className="w-4 h-4 mr-1" />Nova cobrança
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <div className="rounded-2xl p-3"
          style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Recebido</p>
          </div>
          <p className="text-sm font-bold text-green-400">{fmtBRL(totalMes)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">este mês</p>
        </div>
        <div className="rounded-2xl p-3"
          style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Pendente</p>
          </div>
          <p className="text-sm font-bold text-amber-400">{fmtBRL(totalPend)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">{countPend} cobranças</p>
        </div>
        <div className="rounded-2xl p-3"
          style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Vencido</p>
          </div>
          <p className="text-sm font-bold text-red-400">{fmtBRL(totalVenc)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">{countVenc} cobranças</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar aluno ou descrição..."
            className="bg-white/5 border-white/10 text-white rounded-xl h-10 pl-9 text-sm" />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
        {FILTER_TABS.map((tab) => {
          const cnt =
            tab.key === "PENDENTES" ? countPend :
            tab.key === "VENCIDAS"  ? countVenc : 0;
          return (
            <button key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: statusFilter === tab.key ? "var(--filter-active-bg)" : "var(--filter-inactive-bg)",
                color:           statusFilter === tab.key ? "var(--filter-active-color)" : "var(--filter-inactive-color)",
                border: `1px solid ${statusFilter === tab.key ? "var(--filter-active-border)" : "var(--filter-inactive-border)"}`,
              }}>
              {tab.label}
              {cnt > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 px-4 pb-8 space-y-2.5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Wallet className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-sm text-white/25">
              {cobrancas.length === 0
                ? 'Nenhuma cobrança ainda. Clique em "+ Nova cobrança" para começar.'
                : "Nenhuma cobrança encontrada."}
            </p>
          </div>
        ) : (
          filtered.map((c) => {
            const cfg      = STATUS_CFG[c.status] ?? STATUS_CFG.PENDING;
            const isActive = c.status === "PENDING" || c.status === "OVERDUE";
            const initials = (c.aluno_nome ?? "?")[0].toUpperCase();

            return (
              <div key={c.id} className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--surface-1)",
                  border: c.status === "OVERDUE"
                    ? "1px solid rgba(239,68,68,0.25)"
                    : "1px solid var(--border-subtle)",
                }}>

                {/* Row 1: avatar + info + status */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.aluno_nome}</p>
                      <p className="text-xs text-white/40 truncate">{c.descricao}</p>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                    {cfg.label}
                  </span>
                </div>

                {/* Row 2: valor + data + forma */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-sm font-bold text-white">{fmtBRL(Number(c.valor))}</span>
                  <span className="text-white/20">•</span>
                  <span className="text-xs text-white/40">
                    {["RECEIVED","CONFIRMED"].includes(c.status) && c.data_pagamento
                      ? `Pago em ${fmtDate(c.data_pagamento)}`
                      : `Vence ${fmtDate(c.data_vencimento)}`}
                  </span>
                  <span className="text-white/20">•</span>
                  <span className="text-xs text-white/40">{FORMA_LABEL[c.forma_pagamento] ?? c.forma_pagamento}</span>
                </div>

                {/* Row 3: actions */}
                <div className="flex flex-wrap gap-2">
                  {c.pix_key     && <CopyBtn text={c.pix_key}      label="Copiar PIX"  />}
                  {c.invoice_url && <CopyBtn text={c.invoice_url}   label="Copiar link" />}
                  {isActive && (
                    <button onClick={() => handleMarkPaid(c.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ backgroundColor: "var(--btn-success-bg)", color: "var(--btn-success-color)", border: "1px solid var(--btn-success-border)" }}>
                      <CheckCircle2 className="w-3 h-3" />
                      Marcar pago
                    </button>
                  )}
                  {isActive && (
                    <button onClick={() => handleCancel(c.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ backgroundColor: "var(--btn-danger-bg)", color: "var(--btn-danger-color)", border: "1px solid var(--btn-danger-border)" }}>
                      <X className="w-3 h-3" />
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Financeiro;
