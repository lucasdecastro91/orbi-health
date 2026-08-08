import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Check, CreditCard, QrCode, Copy,
  Loader2, Shield, Star, Lock,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────────

type PlanType = "motion" | "pro";
type Cycle = "mensal" | "anual";
type AlunosTier = "50" | "ilimitado";
type PayMethod = "CREDIT_CARD" | "PIX";

interface CardFields {
  card_holder_name: string;
  card_holder_cpf: string;
  card_number: string;
  card_exp_month: string;
  card_exp_year: string;
  card_ccv: string;
}

// ── Preços — mesmos valores da landing page (seção #precos) ────────────────

const PRICES: Record<PlanType, Record<AlunosTier, Record<Cycle, number>>> = {
  motion: {
    "50":      { mensal: 59.90,  anual: 539.10 },
    ilimitado: { mensal: 99.90,  anual: 899.10 },
  },
  pro: {
    "50":      { mensal: 129.90, anual: 1169.10 },
    ilimitado: { mensal: 189.90, anual: 1709.10 },
  },
};

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Máscaras progressivas — formatam conforme digita, sem travar apagar/editar
// no meio (só remontam a partir dos dígitos já presentes no valor).
const formatCPF = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const formatPhone = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  return digits.length > 10
    ? digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2")
    : digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
};

const PLAN_CARDS: { id: PlanType; label: string; desc: string; features: string[] }[] = [
  {
    id: "motion",
    label: "ORBI Motion",
    desc: "Para personal trainers em crescimento",
    features: ["Treinos personalizados", "App com sua marca", "Agenda e frequência", "Financeiro e cobranças"],
  },
  {
    id: "pro",
    label: "ORBI Pro",
    desc: "Para coaches com equipe integrada",
    features: ["Tudo do Motion", "Dietas e plano alimentar", "Colaboradores", "Prioridade no suporte"],
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function PlanSelection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("org");
  const slug = searchParams.get("slug") ?? "";
  const { toast } = useToast();

  const [planType, setPlanType] = useState<PlanType>("motion");
  const [cycle, setCycle] = useState<Cycle>("mensal");
  // Tier por plano — desktop usa um toggle único que sincroniza os dois
  // (mesmo comportamento de sempre); mobile tem um toggle dentro de cada
  // card, então cada plano pode ter um tier independente.
  const [tierByPlan, setTierByPlan] = useState<Record<PlanType, AlunosTier>>({ motion: "50", pro: "50" });
  const [method, setMethod] = useState<PayMethod>("CREDIT_CARD");
  const [step, setStep] = useState<"plan" | "payment" | "success">("plan");
  const [loading, setLoading] = useState(false);

  // Persiste o QR Code do PIX gerado — pagar PIX exige sair do navegador
  // pro app do banco; sem isso, voltar (ou recarregar) pra essa aba perdia
  // o código e reiniciava o fluxo do zero. sessionStorage soma até a aba
  // fechar, tempo suficiente pra completar um pagamento.
  const pixStorageKey = orgId ? `orbi_pix_pending_${orgId}` : null;

  useEffect(() => {
    if (!pixStorageKey) return;
    try {
      const saved = sessionStorage.getItem(pixStorageKey);
      if (!saved) return;
      const data = JSON.parse(saved);
      setPlanType(data.planType);
      setCycle(data.cycle);
      setTierByPlan((prev) => ({ ...prev, [data.planType]: data.tier }));
      setMethod("PIX");
      setPixKey(data.pixKey);
      setStep("success");
    } catch {
      // Dado inválido/corrompido — ignora e segue com o fluxo normal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixStorageKey]);

  // Dados pessoais
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");

  // Cartão
  const [card, setCard] = useState<CardFields>({
    card_holder_name: "",
    card_holder_cpf: "",
    card_number: "",
    card_exp_month: "",
    card_exp_year: "",
    card_ccv: "",
  });
  // Endereço do titular — exigido pela Asaas (creditCardHolderInfo).
  // Só CEP e Número são enviados pra API; o resto é buscado via ViaCEP
  // só pra confirmação visual (não pesa na cobrança).
  const [cardCep, setCardCep] = useState("");
  const [cardAddressNumber, setCardAddressNumber] = useState("");
  const [cepAddress, setCepAddress] = useState<{ logradouro: string; bairro: string; localidade: string; uf: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotFound, setCepNotFound] = useState(false);

  const handleCepChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setCardCep(formatted);
    setCepAddress(null);
    setCepNotFound(false);
    if (digits.length !== 8) return;

    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepNotFound(true);
      } else {
        setCepAddress({ logradouro: data.logradouro, bairro: data.bairro, localidade: data.localidade, uf: data.uf });
      }
    } catch {
      // Falha na busca não bloqueia o pagamento — CEP + Número já são
      // suficientes pra Asaas, a busca é só confirmação visual.
    } finally {
      setCepLoading(false);
    }
  };

  // Resultado do pagamento — pixKey é o código copia-e-cola (renderizado
  // direto na nossa tela); payUrl é fallback (fatura hospedada na Asaas, só
  // usado se a busca do QR Code falhar)
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  const copyPixKey = () => {
    if (!pixKey) return;
    const markCopied = () => {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    };
    // navigator.clipboard só existe em contexto seguro (HTTPS ou localhost)
    // — em HTTP puro (ex: testando via IP local/Tailscale), o objeto nem
    // existe no Safari/iOS. Fallback pro método antigo (execCommand), que
    // funciona em qualquer contexto.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pixKey).then(markCopied).catch(() => fallbackCopy(pixKey, markCopied));
    } else {
      fallbackCopy(pixKey, markCopied);
    }
  };

  const fallbackCopy = (text: string, onSuccess: () => void) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      // execCommand devolve false silenciosamente quando falha, não lança
      // erro — precisa checar o retorno, não só o try/catch.
      if (document.execCommand("copy")) onSuccess();
    } catch {
      // Se nem isso funcionar, o código já está visível na tela pra
      // seleção manual — não bloqueia o pagamento.
    } finally {
      document.body.removeChild(textarea);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubscribe = async () => {
    if (!orgId) {
      toast({ title: "Erro", description: "Organização não identificada.", variant: "destructive" });
      return;
    }
    if (!name || !email || !cpf || !phone) {
      toast({ title: "Preencha todos os dados", description: "Nome, e-mail, CPF e telefone são obrigatórios.", variant: "destructive" });
      return;
    }
    if (method === "CREDIT_CARD" && (!card.card_number || !card.card_holder_name || !card.card_holder_cpf || !card.card_exp_month || !card.card_exp_year || !card.card_ccv)) {
      toast({ title: "Dados do cartão incompletos", variant: "destructive" });
      return;
    }
    if (method === "CREDIT_CARD" && (!cardCep || !cardAddressNumber)) {
      toast({ title: "Endereço do titular incompleto", description: "CEP e número são exigidos pela operadora do cartão.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const body: Record<string, unknown> = {
        organization_id: orgId,
        plan_type: planType,
        alunos_tier: tierByPlan[planType],
        cycle,
        payment_method: method,
        customer_name: name,
        customer_email: email,
        customer_cpf_cnpj: cpf.replace(/\D/g, ""),
        customer_phone: phone.replace(/\D/g, ""),
      };

      if (method === "CREDIT_CARD") {
        Object.assign(body, {
          card_holder_name: card.card_holder_name,
          card_holder_cpf: card.card_holder_cpf.replace(/\D/g, ""),
          card_number: card.card_number.replace(/\s/g, ""),
          card_exp_month: card.card_exp_month,
          card_exp_year: card.card_exp_year,
          card_ccv: card.card_ccv,
          card_postal_code: cardCep.replace(/\D/g, ""),
          card_address_number: cardAddressNumber,
        });
      }

      const { data, error } = await supabase.functions.invoke("create-asaas-subscription", { body });
      if (error) {
        // supabase-js só devolve "Edge Function returned a non-2xx status
        // code" por padrão — o motivo real vem no corpo da resposta
        // (error.context), que a função sempre preenche com { error: "..." }.
        const bodyMsg = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(bodyMsg?.error ?? error.message);
      }
      if (data?.error) throw new Error(data.error);

      // PIX → QR Code renderizado na nossa própria tela (código copia-e-cola)
      if (data.pix_key) {
        setPixKey(data.pix_key);
        if (pixStorageKey) {
          sessionStorage.setItem(pixStorageKey, JSON.stringify({
            pixKey: data.pix_key, planType, cycle, tier: tierByPlan[planType],
          }));
        }
      } else if (data.bank_slip_url || data.invoice_url) {
        setPayUrl(data.bank_slip_url ?? data.invoice_url);
      }

      setStep("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao assinar", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const cardField = (field: keyof CardFields, label: string, placeholder: string, maxLength?: number) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-white/50 uppercase tracking-wider">{label}</Label>
      <Input
        value={card[field]}
        onChange={(e) => setCard((c) => ({ ...c, [field]: field === "card_holder_cpf" ? formatCPF(e.target.value) : e.target.value }))}
        placeholder={placeholder}
        maxLength={maxLength}
        className="bg-white/5 border-white/10 text-white rounded-xl h-11"
      />
    </div>
  );

  // ── Step: Plano ──────────────────────────────────────────────────────────

  if (step === "plan") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <img src="/logos/orbi-logo-horizontal-dark.svg" alt="ORBI Health" className="h-12 w-auto object-contain mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">Escolha seu plano</h1>
            <p className="text-white/50">Ative sua assinatura e continue com acesso completo à plataforma.</p>
          </div>

          {/* Toggle de ciclo — sempre visível */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5">
              {(["mensal", "anual"] as Cycle[]).map((c) => (
                <button key={c} onClick={() => setCycle(c)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={cycle === c ? { background: "hsl(var(--primary))", color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                  {c === "mensal" ? "Mensal" : "Anual"}
                </button>
              ))}
            </div>
            {/* Toggle de alunos — só desktop; sincroniza os dois planos juntos.
                No mobile cada card tem o próprio toggle (mais abaixo). */}
            <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-white/5">
              {(["50", "ilimitado"] as AlunosTier[]).map((t) => (
                <button key={t} onClick={() => setTierByPlan({ motion: t, pro: t })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={tierByPlan.motion === t ? { background: "hsl(var(--primary))", color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                  {t === "50" ? "Até 50 alunos" : "Ilimitado"}
                </button>
              ))}
            </div>
          </div>

          {/* Cards de plano — mobile: empilhado, estreito (mais respiro
              lateral), fonte maior, toggle de alunos por card. Desktop:
              lado a lado como sempre, sem mudança nenhuma (tudo via sm:). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4 mb-8 px-4 sm:px-0">
            {PLAN_CARDS.map((p) => {
              const tier = tierByPlan[p.id];
              const price = PRICES[p.id][tier][cycle];
              return (
                <div
                  key={p.id}
                  onClick={() => setPlanType(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPlanType(p.id); }}
                  className={`relative rounded-2xl border-2 p-6 sm:p-5 text-center sm:text-left transition-all flex flex-col items-stretch cursor-pointer ${
                    planType === p.id
                      ? "border-transparent"
                      : "border-white/10 hover:border-white/20"
                  }`}
                  style={planType === p.id ? { borderColor: "hsl(var(--primary))", background: "rgba(var(--cp-rgb,22,163,74),0.08)" } : { background: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                    <span className="text-lg sm:text-sm font-bold sm:font-semibold text-white/90 sm:text-white/70">{p.label}</span>
                    {planType === p.id && <Check className="w-5 h-5 sm:w-4 sm:h-4" style={{ color: "hsl(var(--primary))" }} />}
                  </div>

                  {/* Toggle de alunos — só mobile, um por card */}
                  <div className="flex sm:hidden items-center justify-center gap-1 p-1 rounded-lg bg-white/5 mb-4 mx-auto">
                    {(["50", "ilimitado"] as AlunosTier[]).map((t) => (
                      <button key={t}
                        onClick={(e) => { e.stopPropagation(); setTierByPlan((prev) => ({ ...prev, [p.id]: t })); }}
                        className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                        style={tier === t ? { background: "hsl(var(--primary))", color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        {t === "50" ? "Até 50" : "Ilimitado"}
                      </button>
                    ))}
                  </div>

                  <div className="mb-1">
                    <span className="text-4xl sm:text-2xl font-bold text-white">{formatBRL(price)}</span>
                    <span className="text-white/40 text-base sm:text-sm">{cycle === "mensal" ? "/mês" : "/ano"}</span>
                  </div>
                  <p className="text-sm sm:text-xs text-white/50 mb-4 sm:mb-3">{p.desc}</p>
                  <ul className="space-y-2 sm:space-y-1.5 mb-5 sm:mb-6">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start justify-center sm:justify-start gap-2 text-sm sm:text-xs text-white/60">
                        <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 mt-0.5 shrink-0" style={{ color: "hsl(var(--primary))" }} />
                        <span className="text-left">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full h-11 rounded-xl text-white font-semibold text-sm mt-auto"
                    style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
                    onClick={(e) => { e.stopPropagation(); setPlanType(p.id); setStep("payment"); }}>
                    Assinar agora
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-white/30 mt-4 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Pagamento seguro via Asaas. Cancele quando quiser.
          </p>
        </div>
      </div>
    );
  }

  // ── Step: Pagamento ──────────────────────────────────────────────────────

  if (step === "payment") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-1">Dados de pagamento</h2>
            <p className="text-white/40 text-sm">
              {planType === "motion" ? "ORBI Motion" : "ORBI Pro"} — {method === "CREDIT_CARD"
                ? <>R$ 5 no 1º mês, depois {formatBRL(PRICES[planType][tierByPlan[planType]][cycle])}{cycle === "mensal" ? "/mês" : "/ano"}</>
                : <>{formatBRL(PRICES[planType][tierByPlan[planType]][cycle])}{cycle === "mensal" ? "/mês" : "/ano"} (PIX, valor integral)</>}
            </p>
          </div>

          {/* Dados pessoais */}
          <div className="rounded-2xl border border-white/6 bg-white/3 p-5 space-y-4">
            <p className="text-sm font-semibold text-white/70">Dados pessoais</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Nome completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo" className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-white/50 uppercase tracking-wider">E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com" className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">CPF</Label>
                <Input value={cpf} onChange={(e) => setCpf(formatCPF(e.target.value))} inputMode="numeric"
                  placeholder="000.000.000-00" maxLength={14} className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="numeric"
                  placeholder="(11) 99999-9999" maxLength={15} className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
              </div>
            </div>
          </div>

          {/* Método de pagamento */}
          <div className="rounded-2xl border border-white/6 bg-white/3 p-5 space-y-4">
            <p className="text-sm font-semibold text-white/70">Método de pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "CREDIT_CARD", label: "Cartão", icon: CreditCard },
                { id: "PIX", label: "PIX", icon: QrCode },
              ] as { id: PayMethod; label: string; icon: typeof CreditCard }[]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all text-sm font-medium ${
                    method === id
                      ? "border-transparent text-white"
                      : "border-white/10 text-white/50 hover:border-white/20"
                  }`}
                  style={method === id ? { borderColor: "hsl(var(--primary))", background: "rgba(var(--cp-rgb,22,163,74),0.1)" } : {}}>
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Campos de cartão */}
            {method === "CREDIT_CARD" && (
              <div className="space-y-3 pt-2">
                {cardField("card_holder_name", "Nome no cartão", "Como aparece no cartão")}
                {cardField("card_holder_cpf", "CPF do titular", "CPF de quem é o cartão (pode ser diferente do seu)", 14)}
                {cardField("card_number", "Número do cartão", "0000 0000 0000 0000", 19)}
                <div className="grid grid-cols-3 gap-3">
                  {cardField("card_exp_month", "Mês", "MM", 2)}
                  {cardField("card_exp_year", "Ano", "AAAA", 4)}
                  {cardField("card_ccv", "CVV", "123", 4)}
                </div>
                <p className="text-sm font-semibold text-white/70 pt-2">Endereço de cobrança</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50 uppercase tracking-wider">CEP</Label>
                    <div className="relative">
                      <Input value={cardCep} onChange={(e) => handleCepChange(e.target.value)}
                        placeholder="00000-000" maxLength={9} className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
                      {cepLoading && <Loader2 className="w-4 h-4 animate-spin text-white/40 absolute right-3 top-1/2 -translate-y-1/2" />}
                    </div>
                    {cepNotFound && <p className="text-xs text-red-400">CEP não encontrado.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50 uppercase tracking-wider">Número</Label>
                    <Input value={cardAddressNumber} onChange={(e) => setCardAddressNumber(e.target.value)}
                      placeholder="123" className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
                  </div>
                </div>
                {cepAddress && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs text-white/50 uppercase tracking-wider">Endereço</Label>
                      <Input value={cepAddress.logradouro} readOnly
                        className="bg-white/5 border-white/10 text-white/70 rounded-xl h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/50 uppercase tracking-wider">Bairro</Label>
                      <Input value={cepAddress.bairro} readOnly
                        className="bg-white/5 border-white/10 text-white/70 rounded-xl h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-white/50 uppercase tracking-wider">Cidade / UF</Label>
                      <Input value={`${cepAddress.localidade}/${cepAddress.uf}`} readOnly
                        className="bg-white/5 border-white/10 text-white/70 rounded-xl h-11" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {method === "PIX" && (
              <p className="text-sm text-white/40 pt-1">
                O QR Code PIX será gerado após a confirmação. Validade de 30 minutos.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12 rounded-xl border-white/10 text-white/70"
              onClick={() => setStep("plan")} disabled={loading}>
              Voltar
            </Button>
            <Button
              className="flex-1 h-12 rounded-xl text-white font-semibold"
              style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
              onClick={handleSubscribe}
              disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar assinatura"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Sucesso (PIX) — checkout próprio, QR Code direto na tela ────────
  // Mesmo padrão visual do /pagar/:id (card claro flutuando sobre fundo
  // escuro com glow na cor de destaque) — aqui a marca é sempre ORBI Health
  // fixa (é a ORBI cobrando o treinador, não uma org cobrando aluno).

  if (method === "PIX" && pixKey) {
    const accent = "#16a34a";
    return (
      <div className="min-h-screen flex items-center justify-center p-7 sm:p-4 relative"
        style={{
          backgroundColor: "#0a0a0b",
          backgroundImage: `radial-gradient(circle at 50% 5%, transparent 0%, color-mix(in srgb, ${accent} 30%, transparent) 20%, color-mix(in srgb, ${accent} 6%, transparent) 45%, transparent 75%)`,
        }}>
        <div className="w-full max-w-xs sm:max-w-sm relative">
          <div className="mb-6 sm:mb-5 flex items-center justify-center">
            <img src="/logos/orbi-logo-horizontal-dark.svg" alt="ORBI Health" className="h-14 w-auto object-contain drop-shadow-lg" />
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #ececec" }}>
            <div className="h-[3px]" style={{ backgroundColor: accent }} />
            <div className="px-6 pt-5 pb-4 sm:px-5 sm:pt-4 sm:pb-3">
              <p className="text-xs text-zinc-400 mb-1">Você está pagando</p>
              <p className="text-[28px] font-semibold text-zinc-900 leading-tight">
                {formatBRL(PRICES[planType][tierByPlan[planType]][cycle])}
              </p>
              <p className="text-sm text-zinc-500 mt-0.5">
                {planType === "motion" ? "ORBI Motion" : "ORBI Pro"} — assinatura {cycle}
              </p>
            </div>
            <div className="border-t border-zinc-100" />
            <div className="px-6 pt-4 pb-5 space-y-3 sm:px-5 sm:pt-3 sm:pb-4 sm:space-y-2.5">
              <div className="rounded-lg border border-zinc-100 p-3 flex items-center justify-center">
                <QRCodeSVG value={pixKey} size={170} className="sm:hidden" />
                <QRCodeSVG value={pixKey} size={190} className="hidden sm:block" />
              </div>
              <p className="text-xs text-zinc-400 text-center">
                Abra o app do seu banco e escaneie, ou copie o código abaixo
              </p>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                {/* Input em vez de <p> — permite tocar e usar o menu nativo
                    de seleção/cópia do celular, sem depender de nenhuma API
                    de clipboard do navegador (que falha em contexto HTTP
                    inseguro e tem várias particularidades no Safari). */}
                <input readOnly value={pixKey ?? ""} onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full text-[11px] font-mono text-zinc-500 bg-transparent border-none outline-none truncate" />
              </div>
              <button onClick={copyPixKey}
                className="flex items-center justify-center gap-1.5 w-full h-11 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: pixCopied ? "#f0fdf4" : "#18181b",
                  color: pixCopied ? "#16a34a" : "#fff",
                  border: `1px solid ${pixCopied ? "#bbf7d0" : "#18181b"}`,
                }}>
                {pixCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {pixCopied ? "Código copiado" : "Copiar código Pix"}
              </button>
            </div>
            <div className="border-t border-zinc-100 px-6 py-4 sm:px-5 sm:py-3 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3 text-zinc-300" />
              <p className="text-[11px] text-zinc-400">Pagamento processado com segurança por ORBI Health</p>
            </div>
          </div>
          <Button
            className="w-full h-12 rounded-xl text-white font-semibold mt-4"
            style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
            onClick={() => {
              if (pixStorageKey) sessionStorage.removeItem(pixStorageKey);
              navigate(slug ? `/${slug}/treinador` : "/auth");
            }}>
            Já paguei — acessar meu painel
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Sucesso (Cartão, ou PIX sem QR Code carregado) ──────────────────

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mx-auto"
          style={{ background: "rgba(var(--cp-rgb,22,163,74),0.12)" }}>
          <Star className="w-10 h-10" style={{ color: "hsl(var(--primary))" }} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white mb-3">
            {method === "CREDIT_CARD" ? "Assinatura confirmada!" : "Pagamento gerado!"}
          </h2>
          <p className="text-white/50">
            {method === "CREDIT_CARD"
              ? "Sua conta está ativa. Bem-vindo ao ORBI Health!"
              : "Finalize o pagamento para ativar sua conta. A confirmação ocorre automaticamente."}
          </p>
        </div>

        {payUrl && (
          <a href={payUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full h-12 rounded-xl border-white/10 text-white">
              Ver QR Code PIX
            </Button>
          </a>
        )}

        <Button
          className="w-full h-12 rounded-xl text-white font-semibold"
          style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
          onClick={() => navigate(slug ? `/${slug}/treinador` : "/auth")}>
          Acessar meu painel
        </Button>
      </div>
    </div>
  );
}
