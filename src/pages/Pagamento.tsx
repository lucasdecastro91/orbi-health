import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle2, XCircle, Copy, Check, Lock, QrCode, CreditCard, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AsaasCardFields, { type AsaasCardFieldsHandle } from "@/components/AsaasCardFields";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CobrancaPublica {
  descricao:       string;
  valor:           number;
  status:          string;
  forma_pagamento: string;
  data_vencimento: string;
  pix_key:         string | null;
  installment_count: number;
  org_nome:        string;
  org_slug:        string | null;
  org_logo_url:    string | null;
  org_cor:         string;
  org_tema:        string;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Selo oficial do Asaas (Instituição Prestadora) — variante escura porque o
// card do checkout é sempre branco por dentro, independente do tema da org
// (ver Card abaixo). URL real enviada pela Estela (gerente de contas Asaas)
// em 2026-08-28, mesma usada em Financeiro.tsx (Carteira).
const ASAAS_SELO_URL = "https://baas.asaas.com/selos/Servicos_financeiros_Asaas-Reduzida-Negativo-Preto.svg?id=6bb12931-3438-4d1a-b8fc-3f3406d38a44";

// Evita bug de fuso horário de `new Date("YYYY-MM-DD")` — monta a data direto da string.
const fmtDataBR = (iso: string) => {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
};

// ── Copiar código Pix ───────────────────────────────────────────────────────

const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy}
      className="flex items-center justify-center gap-1.5 w-full h-11 rounded-lg text-sm font-medium transition-colors"
      style={{
        backgroundColor: copied ? "#f0fdf4" : "#18181b",
        color:  copied ? "#16a34a" : "#fff",
        border: `1px solid ${copied ? "#bbf7d0" : "#18181b"}`,
      }}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Código copiado" : "Copiar código Pix"}
    </button>
  );
};

// ── Card wrapper (fora do componente pra não remontar a cada render) ──────────
// Fundo externo segue o tema da org (dark/light, mesmo dado que já controla o
// resto do app) — o card funcional em si fica sempre claro por dentro, pra manter
// QR code e código Pix legíveis sem precisar de uma versão dark de cada elemento.

// Sai da tela — usada pelo botão "X". Sem isso, quem abre o link dentro do
// app (notificação, PWA em modo standalone) fica preso aqui: essa rota não
// tem layout/nav ao redor, e sem chrome do navegador (standalone) não existe
// nem botão de voltar do sistema.
// Sempre navegação completa (nunca history.back()): o clique na notificação
// dentro do app abre essa tela em duas etapas (bug à parte, ainda não
// investigado) e deixa uma página intermediária em branco/preta no histórico —
// voltar caía nela e travava de novo, sem chrome pra sair. Vai pro dashboard
// do aluno quando já sabemos o slug da org; senão cai em "/" (login/redirect).
const CloseButton = ({ slug }: { slug?: string | null }) => (
  <button
    type="button"
    onClick={() => { window.location.href = slug ? `/${slug}/aluno` : "/"; }}
    aria-label="Fechar"
    className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-zinc-500 transition-colors">
    <X className="w-4 h-4" />
  </button>
);

const Card = ({
  children, accentColor, dark, logoUrl, orgNome, orgSlug,
}: {
  children:    React.ReactNode;
  accentColor?: string;
  dark?:        boolean;
  logoUrl?:     string | null;
  orgNome?:     string;
  orgSlug?:     string | null;
}) => {
  const accent = accentColor ?? "#16a34a";
  return (
    <div className="min-h-screen flex justify-center p-4 pt-16 sm:pt-24 relative"
      style={{
        backgroundColor: dark ? "#0a0a0b" : "#f4f4f5",
        backgroundImage: dark
          ? `radial-gradient(circle at 50% 5%, transparent 0%, color-mix(in srgb, ${accent} 30%, transparent) 20%, color-mix(in srgb, ${accent} 6%, transparent) 45%, transparent 75%)`
          : undefined,
      }}>
      {dark && (
        <svg className="absolute top-0 left-0 w-full pointer-events-none" style={{ height: 420, opacity: 0.2 }}
          viewBox="0 0 400 420" fill="none" preserveAspectRatio="none">
          <path d="M -20 60 Q 130 20 400 95" stroke={accent} strokeWidth="1" fill="none" />
          <path d="M 60 -20 Q 110 150 -20 230" stroke={accent} strokeWidth="1" fill="none" />
          <path d="M 320 -20 Q 360 110 420 190" stroke={accent} strokeWidth="1" fill="none" />
        </svg>
      )}
      <div className="w-full max-w-sm relative">
        {orgNome && (
          <div className="mb-4 flex items-center justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt={orgNome} className="max-h-20 max-w-[280px] object-contain" />
            ) : (
              <p className={`text-base font-medium ${dark ? "text-white/70" : "text-zinc-500"}`}>{orgNome}</p>
            )}
          </div>
        )}
        <div className="bg-white rounded-2xl overflow-hidden relative"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #ececec" }}>
          <div className="h-[3px]" style={{ backgroundColor: accentColor ?? "#18181b" }} />
          <CloseButton slug={orgSlug} />
          {children}
        </div>
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const PAGA_STATUSES = ["RECEIVED", "CONFIRMED"];
const CANCELADA_STATUSES = ["CANCELLED", "REFUNDED"];

const Pagamento = () => {
  const { cobrancaId } = useParams<{ cobrancaId: string }>();

  const [phase, setPhase] = useState<"loading" | "not_found" | "pending" | "paid" | "cancelled">("loading");
  const [data,  setData]  = useState<CobrancaPublica | null>(null);

  const [method, setMethod] = useState<"pix" | "card">("pix");
  const cardRef = useRef<AsaasCardFieldsHandle>(null);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    if (!cobrancaId) { setPhase("not_found"); return; }
    load();
  }, [cobrancaId]);

  const load = async () => {
    try {
      const { data: res, error } = await supabase.functions.invoke("get-cobranca-publica", {
        body: { cobranca_id: cobrancaId },
      });
      if (error || !res || res.error) { setPhase("not_found"); return; }

      const cobranca = res as CobrancaPublica;
      // Cobrança criada como CREDIT_CARD não tem pix_key nenhum — abrir na aba
      // Pix deixaria a tela sempre em "aguardando geração do código", mesmo
      // com o cartão disponível e funcionando. Só decide isso na 1ª carga
      // (data === null), pra não sobrescrever se o pagador já trocou de aba.
      if (data === null && cobranca.forma_pagamento === "CREDIT_CARD") setMethod("card");
      setData(cobranca);
      applyStatus(cobranca.status);
    } catch {
      setPhase("not_found");
    }
  };

  const applyStatus = (status: string) => {
    if (PAGA_STATUSES.includes(status)) setPhase("paid");
    else if (CANCELADA_STATUSES.includes(status)) setPhase("cancelled");
    else setPhase("pending");
  };

  const handlePayWithCard = async () => {
    if (!cobrancaId || !cardRef.current) return;
    if (!cardRef.current.isComplete()) {
      setCardError("Preencha todos os campos do cartão e do endereço.");
      return;
    }
    setCardError(null);
    setCardSubmitting(true);
    try {
      const values = cardRef.current.getValues();
      const { data: res, error } = await supabase.functions.invoke("pagar-cobranca-cartao", {
        body: { cobranca_id: cobrancaId, ...values },
      });
      if (error) {
        const ctx = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(ctx?.error ?? error.message ?? "Erro ao processar o pagamento");
      }
      if (!res?.ok) throw new Error(res?.error ?? "Erro ao processar o pagamento");

      // Atualiza a tela na hora em vez de esperar o próximo tick do polling —
      // o pagamento por cartão confirma (ou recusa) na hora, diferente do Pix.
      await load();
    } catch (e: any) {
      setCardError(e.message ?? "Não foi possível processar o pagamento. Confira os dados do cartão.");
    } finally {
      setCardSubmitting(false);
    }
  };

  // Atualização automática enquanto aguarda pagamento — polling, não Realtime:
  // `cobrancas` só tem RLS pro treinador (funil de campos via edge function, mesmo
  // padrão do resto do projeto), então uma sessão anônima nunca receberia o evento
  // de Realtime (ele respeita RLS) mesmo com a tabela na publicação. Poucos segundos
  // de atraso são aceitáveis pra essa tela.
  useEffect(() => {
    if (phase !== "pending" || !cobrancaId) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [phase, cobrancaId]);

  // ── Render states ────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f4f5] relative">
        <CloseButton />
        <Loader2 className="w-6 h-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-zinc-900 font-medium">Cobrança não encontrada</p>
          <p className="text-sm text-zinc-500">Este link de pagamento não é válido.</p>
        </div>
      </Card>
    );
  }

  if (phase === "paid") {
    return (
      <Card accentColor={data?.org_cor} dark={data?.org_tema === "dark"}
        logoUrl={data?.org_logo_url} orgNome={data?.org_nome} orgSlug={data?.org_slug}>
        <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <p className="text-zinc-900 font-medium">Pagamento confirmado</p>
          <p className="text-sm text-zinc-500">
            {data?.descricao} · {data ? fmtBRL(Number(data.valor)) : ""}
          </p>
        </div>
      </Card>
    );
  }

  if (phase === "cancelled") {
    return (
      <Card accentColor={data?.org_cor} dark={data?.org_tema === "dark"}
        logoUrl={data?.org_logo_url} orgNome={data?.org_nome} orgSlug={data?.org_slug}>
        <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
          <XCircle className="w-10 h-10 text-amber-500" />
          <p className="text-zinc-900 font-medium">Cobrança cancelada</p>
          <p className="text-sm text-zinc-500">Esta cobrança não está mais disponível para pagamento.</p>
        </div>
      </Card>
    );
  }

  // pending
  return (
    <Card accentColor={data?.org_cor} dark={data?.org_tema === "dark"}
      logoUrl={data?.org_logo_url} orgNome={data?.org_nome} orgSlug={data?.org_slug}>
      <div className="px-5 pt-4 pb-3">
        <p className="text-xs text-zinc-400 mb-1">Você está pagando</p>
        <p className="text-[28px] font-semibold text-zinc-900 leading-tight">
          {data ? fmtBRL(Number(data.valor)) : ""}
        </p>
        <p className="text-sm text-zinc-500 mt-0.5">{data?.descricao}</p>
        {data && data.forma_pagamento === "CREDIT_CARD" && data.installment_count > 1 && (
          <p className="text-xs text-zinc-500 mt-1">
            Em até {data.installment_count}x de {fmtBRL(Number(data.valor) / data.installment_count)}
          </p>
        )}
        {data?.data_vencimento && (
          <p className="text-xs text-zinc-400 mt-1">Vence em {fmtDataBR(data.data_vencimento)}</p>
        )}
      </div>

      <div className="border-t border-zinc-100" />

      <div className="px-5 pt-3 pb-4">
        <p className="text-[13px] font-medium text-zinc-900 mb-2">Forma de pagamento</p>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setMethod("pix")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-[1.5px] transition-colors ${
              method === "pix" ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 bg-white"
            }`}>
            <QrCode className={`w-4 h-4 ${method === "pix" ? "text-zinc-900" : "text-zinc-400"}`} />
            <span className={`text-[13px] font-medium ${method === "pix" ? "text-zinc-900" : "text-zinc-400"}`}>Pix</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod("card")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-[1.5px] transition-colors ${
              method === "card" ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 bg-white"
            }`}>
            <CreditCard className={`w-4 h-4 ${method === "card" ? "text-zinc-900" : "text-zinc-400"}`} />
            <span className={`text-[13px] font-medium ${method === "card" ? "text-zinc-900" : "text-zinc-400"}`}>Cartão</span>
          </button>
        </div>

        {method === "pix" ? (
          data?.pix_key ? (
            <div className="space-y-2.5">
              <div className="rounded-lg border border-zinc-100 p-3 flex items-center justify-center">
                <QRCodeSVG value={data.pix_key} size={190} />
              </div>
              <p className="text-xs text-zinc-400 text-center">
                Abra o app do seu banco e escaneie, ou copie o código abaixo
              </p>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                <p className="text-[11px] font-mono text-zinc-500 truncate">{data.pix_key}</p>
              </div>
              <CopyBtn text={data.pix_key} />
            </div>
          ) : (
            <p className="text-sm text-zinc-400 text-center py-6">
              Aguardando geração do código de pagamento.
            </p>
          )
        ) : (
          <div className="space-y-3">
            <AsaasCardFields
              ref={cardRef}
              inputClassName="bg-zinc-50 border-zinc-200 text-zinc-900 rounded-lg h-11"
              labelClassName="text-xs text-zinc-400 uppercase tracking-wider"
            />
            {cardError && <p className="text-xs text-red-500">{cardError}</p>}
            <button
              type="button"
              onClick={handlePayWithCard}
              disabled={cardSubmitting}
              className="flex items-center justify-center gap-1.5 w-full h-11 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: "#18181b" }}>
              {cardSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {cardSubmitting ? "Processando..." : "Pagar com cartão"}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 px-5 py-3 flex flex-col items-center justify-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3 h-3 text-zinc-300" />
          <p className="text-[11px] text-zinc-400">Pagamento processado com segurança</p>
        </div>
        <img src={ASAAS_SELO_URL} alt="Serviços financeiros prestados pelo Asaas" className="h-4 w-auto opacity-80" />
      </div>
    </Card>
  );
};

export default Pagamento;
