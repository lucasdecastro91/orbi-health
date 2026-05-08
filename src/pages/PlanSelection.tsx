import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Check, Zap, Crown, CreditCard, FileText, QrCode,
  ChevronRight, Loader2, Shield, Star,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────────

type Plan = "mensal" | "anual";
type PayMethod = "CREDIT_CARD" | "BOLETO" | "PIX";

interface CardFields {
  card_holder_name: string;
  card_number: string;
  card_exp_month: string;
  card_exp_year: string;
  card_ccv: string;
}

// ── Dados dos planos ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "mensal" as Plan,
    label: "Mensal",
    price: "R$ 197",
    period: "/mês",
    highlight: null,
    features: [
      "Alunos ilimitados",
      "Treinos e dietas personalizados",
      "App white-label para alunos",
      "Suporte via chat",
    ],
  },
  {
    id: "anual" as Plan,
    label: "Anual",
    price: "R$ 1.970",
    period: "/ano",
    highlight: "2 meses grátis",
    features: [
      "Tudo do plano mensal",
      "Economia de R$ 394",
      "Prioridade no suporte",
      "Acesso antecipado a novidades",
    ],
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function PlanSelection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("org");
  const slug = searchParams.get("slug") ?? "";
  const { toast } = useToast();

  const [plan, setPlan] = useState<Plan>("mensal");
  const [method, setMethod] = useState<PayMethod>("CREDIT_CARD");
  const [step, setStep] = useState<"plan" | "payment" | "success">("plan");
  const [loading, setLoading] = useState(false);

  // Dados pessoais
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");

  // Cartão
  const [card, setCard] = useState<CardFields>({
    card_holder_name: "",
    card_number: "",
    card_exp_month: "",
    card_exp_year: "",
    card_ccv: "",
  });

  // Resultado para boleto/pix
  const [payUrl, setPayUrl] = useState<string | null>(null);

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
    if (method === "CREDIT_CARD" && (!card.card_number || !card.card_holder_name || !card.card_exp_month || !card.card_exp_year || !card.card_ccv)) {
      toast({ title: "Dados do cartão incompletos", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const body: Record<string, unknown> = {
        organization_id: orgId,
        plan,
        payment_method: method,
        customer_name: name,
        customer_email: email,
        customer_cpf_cnpj: cpf.replace(/\D/g, ""),
        customer_phone: phone.replace(/\D/g, ""),
      };

      if (method === "CREDIT_CARD") {
        Object.assign(body, {
          card_holder_name: card.card_holder_name,
          card_number: card.card_number.replace(/\s/g, ""),
          card_exp_month: card.card_exp_month,
          card_exp_year: card.card_exp_year,
          card_ccv: card.card_ccv,
        });
      }

      const { data, error } = await supabase.functions.invoke("create-asaas-subscription", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Boleto / PIX → mostra link
      if (data.bank_slip_url || data.invoice_url) {
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
        onChange={(e) => setCard((c) => ({ ...c, [field]: e.target.value }))}
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
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}>
              <Crown className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Escolha seu plano</h1>
            <p className="text-white/50">Você tem 14 dias de trial gratuito. Assine agora e garanta o acesso completo.</p>
          </div>

          {/* Cards de plano */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlan(p.id)}
                className={`relative rounded-2xl border-2 p-5 text-left transition-all ${
                  plan === p.id
                    ? "border-transparent"
                    : "border-white/10 hover:border-white/20"
                }`}
                style={plan === p.id ? { borderColor: "hsl(var(--primary))", background: "rgba(var(--cp-rgb,22,163,74),0.08)" } : { background: "rgba(255,255,255,0.03)" }}>
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-0.5 rounded-full text-white"
                    style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}>
                    {p.highlight}
                  </span>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-white/70">{p.label}</span>
                  {plan === p.id && <Check className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />}
                </div>
                <div className="mb-4">
                  <span className="text-2xl font-bold text-white">{p.price}</span>
                  <span className="text-white/40 text-sm">{p.period}</span>
                </div>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-white/60">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "hsl(var(--primary))" }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          <Button
            className="w-full h-12 rounded-xl text-white font-semibold text-base"
            style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}
            onClick={() => setStep("payment")}>
            Continuar <ChevronRight className="w-4 h-4 ml-1" />
          </Button>

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
              Plano {plan === "mensal" ? "Mensal — R$ 197/mês" : "Anual — R$ 1.970/ano"}
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
                <Input value={cpf} onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00" className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999" className="bg-white/5 border-white/10 text-white rounded-xl h-11" />
              </div>
            </div>
          </div>

          {/* Método de pagamento */}
          <div className="rounded-2xl border border-white/6 bg-white/3 p-5 space-y-4">
            <p className="text-sm font-semibold text-white/70">Método de pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "CREDIT_CARD", label: "Cartão", icon: CreditCard },
                { id: "BOLETO", label: "Boleto", icon: FileText },
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
                {cardField("card_number", "Número do cartão", "0000 0000 0000 0000", 19)}
                <div className="grid grid-cols-3 gap-3">
                  {cardField("card_exp_month", "Mês", "MM", 2)}
                  {cardField("card_exp_year", "Ano", "AAAA", 4)}
                  {cardField("card_ccv", "CVV", "123", 4)}
                </div>
              </div>
            )}

            {method === "BOLETO" && (
              <p className="text-sm text-white/40 pt-1">
                O boleto será gerado após a confirmação. Vencimento em 3 dias úteis.
              </p>
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

  // ── Step: Sucesso ────────────────────────────────────────────────────────

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
              ? "Sua conta está ativa. Bem-vindo ao ORBI Pro!"
              : "Finalize o pagamento para ativar sua conta. A confirmação ocorre automaticamente."}
          </p>
        </div>

        {payUrl && (
          <a href={payUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full h-12 rounded-xl border-white/10 text-white">
              {method === "BOLETO" ? "Abrir boleto" : "Ver QR Code PIX"}
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
