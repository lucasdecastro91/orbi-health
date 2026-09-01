import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, X, Copy, Check, Loader2, CreditCard,
  Wallet, ChevronDown, CheckCircle2, AlertTriangle,
  Smartphone, TrendingUp, Settings, Landmark, Circle, ReceiptText,
  Calculator, Zap,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

// Converte string no formato brasileiro ("1.800,00" ou "1800,00") pra float —
// substitui o parseFloat(v.replace(",", ".")) antigo, que quebrava com
// separador de milhar (ex: "1.412,87" virava 1.412, não 1412.87).
const parseBRL = (s: string): number =>
  parseFloat(s.replace(/\./g, "").replace(",", "."));

const toBRLInput = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CALC_LIMITE_LIQUIDO  = 5000;
const CALC_LIMITE_PARCELAS = 12;

// Nosso checkout (/pagar/:id) cobre Pix e Cartão (tokenizado via
// pagar-cobranca-cartao) — só boleto ainda cai no link hospedado pelo Asaas
// (não construímos boleto na nossa página, e o projeto decidiu não usar
// boleto de qualquer forma).
const checkoutLink = (c: Pick<Cobranca, "id" | "forma_pagamento" | "invoice_url">) =>
  c.forma_pagamento === "PIX" || c.forma_pagamento === "CREDIT_CARD"
    ? `${window.location.origin}/pagar/${c.id}`
    : c.invoice_url;

const FINANCEIRO_NAV = [
  { key: "cobrancas" as const, label: "Financeiro", icon: CreditCard },
  { key: "carteira"  as const, label: "Carteira",   icon: Landmark },
];
const VALID_FINANCEIRO_TABS = ["cobrancas", "carteira"] as const;
type FinanceiroTab = typeof VALID_FINANCEIRO_TABS[number];

const CARTEIRA_CHECKLIST = [
  { label: "Identidade verificada",       done: false },
  { label: "Dados bancários / chave Pix", done: false },
  { label: "Conta liberada pra saque",    done: false },
];

// Selo oficial de identificação do Asaas como Instituição Prestadora
// (exigência da Resolução Conjunta nº 16/2025 pro modelo BaaS — sem isso, a
// Asaas não homologa a operação). URL real enviada pela Estela (gerente de
// contas) em 2026-08-28, não é o exemplo genérico do Playbook.
const ASAAS_SELO_URL = "https://baas.asaas.com/selos/Servicos_financeiros_Asaas-Reduzida-Negativo-Branco.svg?id=6bb12931-3438-4d1a-b8fc-3f3406d38a44";

const PIX_KEY_TYPES = [
  { value: "CPF",   label: "CPF" },
  { value: "CNPJ",  label: "CNPJ" },
  { value: "EMAIL", label: "E-mail" },
  { value: "PHONE", label: "Telefone" },
  { value: "EVP",   label: "Chave aleatória" },
];

interface Withdrawal {
  id: string;
  value: number;
  status: string;
  fail_reason: string | null;
  created_at: string;
}

const WITHDRAWAL_STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  pending:         { label: "Pendente",    bg: "rgba(251,191,36,0.12)",  text: "#fbbf24" },
  bank_processing: { label: "Processando", bg: "rgba(251,191,36,0.12)",  text: "#fbbf24" },
  done:            { label: "Concluído",   bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
  failed:          { label: "Falhou",      bg: "rgba(239,68,68,0.12)",   text: "#f87171" },
  cancelled:       { label: "Cancelado",   bg: "rgba(107,114,128,0.12)", text: "#9ca3af" },
};

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
  <div className="fixed inset-0 z-50 flex items-end justify-center pb-16 lg:pb-0"
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

      {/* Link de pagamento — nosso checkout (/pagar/:id) pra Pix e Cartão; Asaas só pra boleto */}
      {checkoutLink(cobranca) && (
        <div className="rounded-xl p-3 space-y-2.5"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">Link de pagamento</p>
          <p className="text-[11px] text-white/40 break-all">{checkoutLink(cobranca)}</p>
          <CopyBtn text={checkoutLink(cobranca)!} label="Copiar link" />
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
  isGsBrand: boolean;
  alunos: AlunoOption[];
  onClose: () => void;
  onCreated: (c: Cobranca) => void;
}

const CUSTOM_PLAN_ID = "__custom__";

const NovaCobrancaModal = ({ orgId, isGsBrand, alunos, onClose, onCreated }: NovaCobrancaProps) => {
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

  // Calculadora de repasse pra cobrança personalizada no cartão — o valor
  // digitado em "Valor (R$)" nesse caso é o líquido desejado, não o bruto;
  // precisa do mesmo cálculo de repasse de taxa + antecipação já usado em
  // Produtos & Planos (mesma Edge Function), já que aqui não existe um plano
  // pré-configurado com installment_options prontos.
  const [calcNetValue,   setCalcNetValue]   = useState("");
  const [calcAnticipate, setCalcAnticipate] = useState(false);
  const [calcInstall,    setCalcInstall]    = useState("1");
  const [calculating,    setCalculating]    = useState(false);
  const [calcResult,     setCalcResult]     = useState<{ totalCharged: number; perInstallment: number; netEstimated: number; marginApplied: number } | null>(null);
  const [calcErro,       setCalcErro]       = useState("");

  const calcNetNum   = parseBRL(calcNetValue || "0") || 0;
  const calcInstNum  = parseInt(calcInstall) || 0;
  const calcOverLimit = calcNetNum > CALC_LIMITE_LIQUIDO || calcInstNum > CALC_LIMITE_PARCELAS;

  const handleCalcularCustom = async () => {
    setCalcErro(""); setCalcResult(null);
    const net  = parseBRL(calcNetValue);
    const inst = parseInt(calcInstall);
    if (isNaN(net) || net <= 0) { setCalcErro("Informe o valor líquido desejado."); return; }
    if (!inst || inst < 1) { setCalcErro("Informe o número de parcelas."); return; }
    if (net > CALC_LIMITE_LIQUIDO || inst > CALC_LIMITE_PARCELAS) {
      setCalcErro(`Cálculo automático disponível até ${CALC_LIMITE_PARCELAS}x e ${fmtBRL(CALC_LIMITE_LIQUIDO)} líquidos. Pra valores maiores, fale com o suporte.`);
      return;
    }
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("calcular-repasse-cartao", {
        body: { netDesired: net, installments: inst, anticipate: calcAnticipate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      setManualValor(toBRLInput(data.totalCharged));
      setInstallments(inst);
      setCalcResult({
        totalCharged:   data.totalCharged,
        perInstallment: data.perInstallment,
        netEstimated:   data.netEstimated,
        marginApplied:  data.marginApplied,
      });
    } catch (e: any) {
      setCalcErro(e.message ?? "Erro ao calcular");
    } finally { setCalculating(false); }
  };

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
      valorNum = parseBRL(manualValor);
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
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}>
      <div className="w-full max-w-lg rounded-t-3xl pb-8 pt-5 px-5 space-y-4 overflow-y-auto max-h-[92vh]"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)" }}>

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
              <button onClick={() => { onClose(); navigate("../produtos"); }}
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

        {/* Calculadora de repasse — cobrança personalizada no cartão */}
        {isCustom && forma === "CREDIT_CARD" && isGsBrand && (
          <div className="space-y-2.5 rounded-xl p-3"
            style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-1.5">
              <Calculator className="w-3 h-3 text-white/40" />
              <p className="text-[10px] text-white/30 uppercase tracking-wider">Calcular quanto cobrar (valor acima = líquido)</p>
            </div>

            <div className="flex gap-2">
              <div className="w-20 space-y-1 shrink-0">
                <p className="text-[10px] text-white/25">Parcelas</p>
                <Input value={calcInstall} onChange={(e) => { setCalcInstall(e.target.value); setCalcResult(null); }}
                  placeholder="1" inputMode="numeric"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[10px] text-white/25">Valor líquido desejado (R$)</p>
                <Input value={calcNetValue} onChange={(e) => { setCalcNetValue(e.target.value); setCalcResult(null); }}
                  placeholder="1300,00" inputMode="decimal"
                  className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm" />
              </div>
            </div>

            <div className="flex items-center justify-between px-0.5">
              <Label className="text-xs text-white/50">Antecipar recebimento</Label>
              <Switch checked={calcAnticipate} onCheckedChange={(v) => { setCalcAnticipate(v); setCalcResult(null); }} />
            </div>

            {calcOverLimit && (calcNetValue || calcInstall !== "1") && (
              <p className="text-[10px] text-amber-400/80">
                Cálculo automático vai até {CALC_LIMITE_PARCELAS}x e {fmtBRL(CALC_LIMITE_LIQUIDO)} líquidos. Acima disso, fale com o suporte.
              </p>
            )}
            {calcErro && <p className="text-[11px] text-red-400">{calcErro}</p>}

            <Button onClick={handleCalcularCustom} disabled={calculating || calcOverLimit}
              className="w-full h-9 rounded-xl font-semibold text-white text-xs"
              style={{ background: "var(--cp-gradient)" }}>
              {calculating
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Calculando...</>
                : <><Zap className="w-3.5 h-3.5 mr-1.5" />Calcular</>}
            </Button>

            {calcResult && (
              <div className="rounded-lg px-3 py-2 space-y-0.5"
                style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <p className="text-xs text-white font-medium">
                  Aluno paga {fmtBRL(calcResult.totalCharged)}
                  {calcInstNum > 1 && <span className="text-white/50"> · {fmtBRL(calcResult.perInstallment)}/mês</span>}
                </p>
                <p className="text-[11px] text-green-400">
                  Você recebe {fmtBRL(calcResult.netEstimated)} líquidos
                  {calcAnticipate && calcResult.marginApplied > 0 && (
                    <span className="text-white/30"> (margem de segurança de {fmtBRL(calcResult.marginApplied)} já embutida)</span>
                  )}
                </p>
              </div>
            )}

            <p className="text-[10px] text-white/20">
              Preenche o campo "Valor (R$)" acima automaticamente com o total a cobrar do aluno.
            </p>
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

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding de subconta (Carteira) — içado pro escopo do módulo de propósito
// (mesmo padrão de OrgNameSection/ProfileForm): um componente definido dentro
// do corpo de Financeiro seria recriado a cada render e re-montaria os
// inputs a cada tecla digitada, perdendo foco (bug já documentado no
// projeto). Formulário só de KYC — dados de quem vai receber, não da org.
// ─────────────────────────────────────────────────────────────────────────────
interface SubaccountFormValues {
  name: string; email: string; cpf: string; birthDate: string; phone: string;
  cep: string; address: string; number: string; complement: string; bairro: string;
  incomeValue: string;
}

function SubaccountOnboardingForm({
  values, onChange, onSubmit, onCancel, submitting, cepLoading,
}: {
  values: SubaccountFormValues;
  onChange: (field: keyof SubaccountFormValues, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  cepLoading: boolean;
}) {
  const field = (key: keyof SubaccountFormValues, label: string, placeholder: string, colSpan2 = false, type: "text" | "date" = "text") => (
    <div className={`space-y-1.5 ${colSpan2 ? "col-span-2" : ""}`}>
      <Label className="text-xs text-white/50 uppercase tracking-wider">{label}</Label>
      <Input
        type={type}
        value={values[key]}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder}
        className="bg-white/5 border-white/10 text-white rounded-xl h-11"
      />
    </div>
  );

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
      <div>
        <p className="text-sm font-semibold text-white">Criar sua conta</p>
        <p className="text-xs text-white/40 mt-1">
          Dados de quem vai receber os pagamentos — depois de criada, você recebe um e-mail com os próximos passos pra completar a verificação de identidade.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("name", "Nome completo", "Nome como no documento", true)}
        {field("email", "E-mail de contato", "Onde você vai receber o acesso", true)}
        {field("cpf", "CPF", "000.000.000-00")}
        {field("birthDate", "Data de nascimento", "", false, "date")}
        {field("phone", "Telefone/WhatsApp", "(11) 99999-9999", true)}
        {field("cep", "CEP", "00000-000")}
        {field("number", "Número", "123")}
        {field("address", "Endereço", "Rua, avenida...", true)}
        {field("bairro", "Bairro", "Bairro")}
        {field("complement", "Complemento", "Opcional")}
        {field("incomeValue", "Renda mensal declarada", "5000", true)}
      </div>
      {cepLoading && <p className="text-xs text-white/30">Buscando endereço pelo CEP...</p>}
      <div className="flex items-center justify-between gap-3 pt-1">
        <img src={ASAAS_SELO_URL} alt="Serviços financeiros prestados pelo Asaas" className="h-8 w-auto shrink-0" />
        <div className="flex gap-3 flex-1 justify-end">
          <Button variant="outline" className="h-11 px-5 rounded-xl border-white/10 text-white/70" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            className="h-11 px-5 rounded-xl text-white font-semibold"
            style={{ background: "var(--cp-gradient)" }}
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar conta"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PixKeyForm — cadastro/edição da chave Pix de destino do saque
// ─────────────────────────────────────────────────────────────────────────────
function PixKeyForm({
  keyType, keyValue, onChangeType, onChangeValue, onSubmit, onCancel, submitting,
}: {
  keyType: string;
  keyValue: string;
  onChangeType: (v: string) => void;
  onChangeValue: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
      <div>
        <p className="text-sm font-semibold text-white">Cadastrar chave Pix</p>
        <p className="text-xs text-white/40 mt-1">É pra essa chave que o saldo vai quando você solicitar um saque.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Tipo</Label>
          <div className="relative">
            <select value={keyType} onChange={(e) => onChangeType(e.target.value)}
              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl h-11 px-3 text-sm text-white focus:outline-none cursor-pointer">
              {PIX_KEY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Chave Pix</Label>
          <Input value={keyValue} onChange={(e) => onChangeValue(e.target.value)}
            placeholder="Sua chave Pix" className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button variant="outline" className="flex-1 h-11 rounded-xl border-white/10 text-white/70" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          className="flex-1 h-11 rounded-xl text-white font-semibold"
          style={{ background: "var(--cp-gradient)" }}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar chave"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SaqueModal — confirmação de solicitação de saque
// ─────────────────────────────────────────────────────────────────────────────
function SaqueModal({
  balance, onClose, onConfirm, submitting,
}: {
  balance: number;
  onClose: () => void;
  onConfirm: (value: number) => void;
  submitting: boolean;
}) {
  const [value, setValue] = useState(balance.toFixed(2));
  const numericValue = Number(value.replace(",", "."));
  const invalid = !numericValue || numericValue <= 0 || numericValue > balance;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-16 lg:pb-0"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl pb-8 pt-5 px-5 space-y-4"
        style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-2" />

        <div>
          <p className="text-base font-bold text-white">Solicitar saque</p>
          <p className="text-xs text-white/40">Saldo disponível: {fmtBRL(balance)}</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-white/50 uppercase tracking-wider">Valor a sacar</Label>
          <Input type="number" step="0.01" min="0" max={balance} value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
          {numericValue > balance && (
            <p className="text-xs" style={{ color: "#f87171" }}>Valor maior que o saldo disponível.</p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1 h-11 rounded-xl border-white/10 text-white/70" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            className="flex-1 h-11 rounded-xl text-white font-semibold"
            style={{ background: "var(--cp-gradient)" }}
            onClick={() => onConfirm(numericValue)}
            disabled={submitting || invalid}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar saque"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const Financeiro = () => {
  const { orgId, org } = useTenantContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialTab: FinanceiroTab = (VALID_FINANCEIRO_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as FinanceiroTab)
    : "cobrancas";
  const [activeTab, setActiveTab] = useState<FinanceiroTab>(initialTab);
  const changeTab = (tab: FinanceiroTab) => {
    setActiveTab(tab);
    setSearchParams(tab === "cobrancas" ? {} : { tab });
  };

  const [cobrancas,    setCobrancas]    = useState<Cobranca[]>([]);
  const [alunos,       setAlunos]       = useState<AlunoOption[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [modalOpen,    setModalOpen]    = useState(false);
  const [successData,  setSuccessData]  = useState<{ cobranca: Cobranca; nome: string } | null>(null);

  // ── Carteira / subconta ──────────────────────────────────────────────────
  const [subStatus, setSubStatus] = useState<{
    exists: boolean; status?: string; balance?: number | null; eligible?: boolean; reason?: string;
    pixKeySet?: boolean; pixKey?: string | null; pixKeyType?: string | null; withdrawals?: Withdrawal[];
  } | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [creatingSub, setCreatingSub] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [subForm, setSubForm] = useState<SubaccountFormValues>({
    name: "", email: "", cpf: "", birthDate: "", phone: "",
    cep: "", address: "", number: "", complement: "", bairro: "",
    incomeValue: "",
  });

  // ── Chave Pix / saque ────────────────────────────────────────────────────
  const [showPixKeyForm, setShowPixKeyForm] = useState(false);
  const [savingPixKey, setSavingPixKey] = useState(false);
  const [pixKeyType, setPixKeyType] = useState("CPF");
  const [pixKeyValue, setPixKeyValue] = useState("");
  const [showSaqueModal, setShowSaqueModal] = useState(false);
  const [submittingSaque, setSubmittingSaque] = useState(false);

  const loadSubaccountStatus = async () => {
    if (!orgId) return;
    setSubLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-asaas-subaccount", {
        body: { organization_id: orgId },
      });
      if (error) throw error;
      setSubStatus(data);
    } catch (e) {
      console.error("[Financeiro] loadSubaccountStatus falhou:", e instanceof Error ? e.message : e);
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "carteira" && orgId) loadSubaccountStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId]);

  const handleSubFormChange = (field: keyof SubaccountFormValues, value: string) => {
    setSubForm((prev) => ({ ...prev, [field]: value }));
    if (field === "cep") {
      const digits = value.replace(/\D/g, "").slice(0, 8);
      if (digits.length === 8) {
        setCepLoading(true);
        fetch(`https://viacep.com.br/ws/${digits}/json/`)
          .then((r) => r.json())
          .then((data) => {
            if (!data.erro) {
              setSubForm((prev) => ({ ...prev, address: data.logradouro ?? prev.address, bairro: data.bairro ?? prev.bairro }));
            }
          })
          .catch(() => { /* CEP + número já bastam pra Asaas — falha na busca não bloqueia */ })
          .finally(() => setCepLoading(false));
      }
    }
  };

  const handleCreateSubaccount = async () => {
    if (!subForm.email) {
      toast({ title: "E-mail obrigatório", description: "Informe o e-mail que vai receber o acesso pra completar o cadastro.", variant: "destructive" });
      return;
    }
    setCreatingSub(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-asaas-subaccount", {
        body: {
          organization_id: orgId,
          name: subForm.name,
          email: subForm.email,
          cpfCnpj: subForm.cpf.replace(/\D/g, ""),
          birthDate: subForm.birthDate,
          mobilePhone: subForm.phone.replace(/\D/g, ""),
          postalCode: subForm.cep.replace(/\D/g, ""),
          address: subForm.address,
          addressNumber: subForm.number,
          ...(subForm.complement ? { complement: subForm.complement } : {}),
          province: subForm.bairro,
          incomeValue: Number(subForm.incomeValue),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Conta criada!", description: data?.message ?? "Verifique seu e-mail pra completar a verificação." });
      setShowSubForm(false);
      await loadSubaccountStatus();
    } catch (e: unknown) {
      toast({ title: "Erro ao criar conta", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setCreatingSub(false);
    }
  };

  const handleSavePixKey = async () => {
    if (!pixKeyValue.trim()) {
      toast({ title: "Chave Pix obrigatória", variant: "destructive" });
      return;
    }
    setSavingPixKey(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-asaas-pix-key", {
        body: { organization_id: orgId, pix_key: pixKeyValue.trim(), pix_key_type: pixKeyType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Chave Pix salva!" });
      setShowPixKeyForm(false);
      await loadSubaccountStatus();
    } catch (e: unknown) {
      toast({ title: "Erro ao salvar chave Pix", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingPixKey(false);
    }
  };

  const handleRequestSaque = async (value: number) => {
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSubmittingSaque(true);
    try {
      const { data, error } = await supabase.functions.invoke("solicitar-saque-asaas", {
        body: { organization_id: orgId, value },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Saque solicitado!", description: "Acompanhe o status no extrato." });
      setShowSaqueModal(false);
      await loadSubaccountStatus();
    } catch (e: unknown) {
      toast({ title: "Erro ao solicitar saque", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSubmittingSaque(false);
    }
  };

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
          isGsBrand={org?.is_gs_brand ?? false}
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

      <div className="w-full max-w-5xl mx-auto">
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
        {activeTab === "cobrancas" && (
          <Button onClick={() => setModalOpen(true)}
            className="h-9 px-4 rounded-xl font-semibold text-white text-sm"
            style={{ background: "var(--cp-gradient)" }}>
            <Plus className="w-4 h-4 mr-1" />Nova cobrança
          </Button>
        )}
      </div>

      {/* Abas: Financeiro / Carteira */}
      <div className="flex items-center gap-1 border-b px-4 mb-4 overflow-x-auto scrollbar-none"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {FINANCEIRO_NAV.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => changeTab(item.key)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
              style={{
                color: active ? "var(--tab-text-active)" : "var(--tab-text-inactive)",
                borderBottomColor: active ? "var(--cp-500)" : "transparent",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--tab-text-hover)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--tab-text-inactive)"; }}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" style={{ color: active ? "var(--cp-500)" : undefined }} />
              {item.label}
            </button>
          );
        })}
      </div>

      {activeTab === "cobrancas" && (
      <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <div className="rounded-2xl p-3"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Recebido</p>
          </div>
          <p className="text-sm font-bold text-green-400">{fmtBRL(totalMes)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">este mês</p>
        </div>
        <div className="rounded-2xl p-3"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Pendente</p>
          </div>
          <p className="text-sm font-bold text-amber-400">{fmtBRL(totalPend)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">{countPend} cobranças</p>
        </div>
        <div className="rounded-2xl p-3"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
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
          <div className="rounded-2xl text-center py-16 space-y-2"
            style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
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
                  backgroundColor: "var(--section-card-bg)",
                  border: c.status === "OVERDUE"
                    ? "1px solid rgba(239,68,68,0.35)"
                    : "1px solid var(--section-card-border)",
                  boxShadow: "var(--section-card-shadow)",
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
                  {c.pix_key && <CopyBtn text={c.pix_key} label="Copiar PIX" />}
                  {checkoutLink(c) && <CopyBtn text={checkoutLink(c)!} label="Copiar link" />}
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
      </>
      )}

      {activeTab === "carteira" && (
      <div className="px-4 pb-8 space-y-4">

        {/* Saldo */}
        <div className="rounded-2xl p-6 relative overflow-hidden"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-[0.15] pointer-events-none"
            style={{ background: "var(--cp-gradient)" }} />
          <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/40 mb-2">Saldo disponível</p>
              <p className="text-3xl font-bold text-white leading-none">
                {fmtBRL(subStatus?.balance ?? 0)}
              </p>
              {subStatus?.exists ? (
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full mt-2"
                  style={{ background: "rgba(var(--cp-rgb), 0.15)", color: "var(--cp-400)" }}>
                  {subStatus.status === "aprovado" ? "Conta aprovada" : "Aguardando aprovação"}
                </span>
              ) : (
                <p className="text-xs text-white/30 mt-2">Nenhuma conta criada ainda</p>
              )}
            </div>
            <button
              onClick={() => setShowSaqueModal(true)}
              disabled={!(subStatus?.status === "aprovado" && subStatus?.pixKeySet && (subStatus?.balance ?? 0) > 0)}
              className="h-10 px-5 rounded-xl text-sm font-semibold shrink-0 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "var(--cp-gradient)", color: "var(--cp-text)" }}>
              <Landmark className="w-4 h-4" />
              Sacar
            </button>
          </div>
          <div className="relative flex items-center justify-between gap-3 mt-5 pt-4" style={{ borderTop: "1px solid var(--section-card-border)" }}>
            <img src={ASAAS_SELO_URL} alt="Serviços financeiros prestados pelo Asaas" className="h-7 w-auto shrink-0" />
            <p className="text-[11px] text-white/30 text-right">
              Dúvidas sobre pagamentos/saques? <a href="mailto:contato@asaas.com.br" className="underline">contato@asaas.com.br</a> · 0800 009 0037
            </p>
          </div>
        </div>

        {/* Checklist de liberação */}
        <div className="rounded-2xl p-5 space-y-3"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <p className="text-sm font-semibold text-white">Finalize sua conta pra vender e receber</p>
          <div className="space-y-2.5">
            {CARTEIRA_CHECKLIST.map((step, i) => {
              const done =
                i === 0 ? subStatus?.status === "aprovado"
                : i === 1 ? !!subStatus?.pixKeySet
                : subStatus?.status === "aprovado" && !!subStatus?.pixKeySet;
              return (
                <div key={step.label} className="flex items-center gap-2.5">
                  {done
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#4ade80" }} />
                    : <Circle className="w-4 h-4 shrink-0 text-white/20" />}
                  <span className={`text-sm ${done ? "text-white/70" : "text-white/40"}`}>{step.label}</span>
                </div>
              );
            })}
          </div>
          {!subLoading && !subStatus?.exists && !showSubForm && (
            subStatus?.eligible ? (
              <Button
                className="w-full h-10 rounded-xl text-white font-semibold text-sm mt-2"
                style={{ background: "var(--cp-gradient)" }}
                onClick={() => setShowSubForm(true)}
              >
                Criar minha conta
              </Button>
            ) : (
              <div className="rounded-xl px-3 py-2.5 mt-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-xs text-white/40">{subStatus?.reason ?? "Ainda não disponível."}</p>
              </div>
            )
          )}

          {!subLoading && subStatus?.status === "aprovado" && !subStatus?.pixKeySet && !showPixKeyForm && (
            <Button
              className="w-full h-10 rounded-xl text-white font-semibold text-sm mt-2"
              style={{ background: "var(--cp-gradient)" }}
              onClick={() => { setPixKeyType("CPF"); setPixKeyValue(""); setShowPixKeyForm(true); }}
            >
              Cadastrar chave Pix
            </Button>
          )}
          {!subLoading && subStatus?.pixKeySet && !showPixKeyForm && (
            <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 mt-2" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-xs text-white/50 truncate">
                Chave Pix: <span className="text-white/70 font-mono">{subStatus.pixKey}</span>
              </p>
              <button
                onClick={() => { setPixKeyType(subStatus.pixKeyType ?? "CPF"); setPixKeyValue(subStatus.pixKey ?? ""); setShowPixKeyForm(true); }}
                className="text-xs font-medium shrink-0" style={{ color: "var(--cp-400)" }}>
                Alterar
              </button>
            </div>
          )}
        </div>

        {showSubForm && (
          <SubaccountOnboardingForm
            values={subForm}
            onChange={handleSubFormChange}
            onSubmit={handleCreateSubaccount}
            onCancel={() => setShowSubForm(false)}
            submitting={creatingSub}
            cepLoading={cepLoading}
          />
        )}

        {showPixKeyForm && (
          <PixKeyForm
            keyType={pixKeyType}
            keyValue={pixKeyValue}
            onChangeType={setPixKeyType}
            onChangeValue={setPixKeyValue}
            onSubmit={handleSavePixKey}
            onCancel={() => setShowPixKeyForm(false)}
            submitting={savingPixKey}
          />
        )}

        {/* Extrato */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40 mb-2 px-1">Extrato</p>
          {subStatus?.withdrawals && subStatus.withdrawals.length > 0 ? (
            <div className="space-y-2">
              {subStatus.withdrawals.map((w) => {
                const cfg = WITHDRAWAL_STATUS_CFG[w.status] ?? WITHDRAWAL_STATUS_CFG.pending;
                return (
                  <div key={w.id} className="rounded-2xl p-4 flex items-center justify-between gap-2"
                    style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Saque Pix</p>
                      <p className="text-xs text-white/40">{fmtDate(w.created_at)}</p>
                      {w.fail_reason && <p className="text-xs mt-0.5" style={{ color: "#f87171" }}>{w.fail_reason}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">{fmtBRL(Number(w.value))}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl text-center py-16 space-y-2"
              style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
              <ReceiptText className="w-8 h-8 text-white/10 mx-auto" />
              <p className="text-sm text-white/25">Nenhuma movimentação ainda.</p>
            </div>
          )}
        </div>

      </div>
      )}

      {showSaqueModal && (
        <SaqueModal
          balance={subStatus?.balance ?? 0}
          onClose={() => setShowSaqueModal(false)}
          onConfirm={handleRequestSaque}
          submitting={submittingSaque}
        />
      )}
      </div>
    </div>
  );
};

export default Financeiro;
