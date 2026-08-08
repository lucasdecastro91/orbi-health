import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle2, XCircle, Copy, Check, Lock, QrCode, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CobrancaPublica {
  descricao:       string;
  valor:           number;
  status:          string;
  forma_pagamento: string;
  data_vencimento: string;
  pix_key:         string | null;
  org_nome:        string;
  org_logo_url:    string | null;
  org_cor:         string;
  org_tema:        string;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

const Card = ({
  children, accentColor, dark, logoUrl, orgNome,
}: {
  children:    React.ReactNode;
  accentColor?: string;
  dark?:        boolean;
  logoUrl?:     string | null;
  orgNome?:     string;
}) => {
  const accent = accentColor ?? "#16a34a";
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
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
        <div className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid #ececec" }}>
          <div className="h-[3px]" style={{ backgroundColor: accentColor ?? "#18181b" }} />
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

      setData(res as CobrancaPublica);
      applyStatus((res as CobrancaPublica).status);
    } catch {
      setPhase("not_found");
    }
  };

  const applyStatus = (status: string) => {
    if (PAGA_STATUSES.includes(status)) setPhase("paid");
    else if (CANCELADA_STATUSES.includes(status)) setPhase("cancelled");
    else setPhase("pending");
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
      <div className="min-h-screen flex items-center justify-center bg-[#f4f4f5]">
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
        logoUrl={data?.org_logo_url} orgNome={data?.org_nome}>
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
        logoUrl={data?.org_logo_url} orgNome={data?.org_nome}>
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
      logoUrl={data?.org_logo_url} orgNome={data?.org_nome}>
      <div className="px-5 pt-4 pb-3">
        <p className="text-xs text-zinc-400 mb-1">Você está pagando</p>
        <p className="text-[28px] font-semibold text-zinc-900 leading-tight">
          {data ? fmtBRL(Number(data.valor)) : ""}
        </p>
        <p className="text-sm text-zinc-500 mt-0.5">{data?.descricao}</p>
        {data?.data_vencimento && (
          <p className="text-xs text-zinc-400 mt-1">Vence em {fmtDataBR(data.data_vencimento)}</p>
        )}
      </div>

      <div className="border-t border-zinc-100" />

      <div className="px-5 pt-3 pb-4">
        <p className="text-[13px] font-medium text-zinc-900 mb-2">Forma de pagamento</p>

        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-[1.5px] border-zinc-900 bg-zinc-50">
            <QrCode className="w-4 h-4 text-zinc-900" />
            <span className="text-[13px] font-medium text-zinc-900">Pix</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg border border-zinc-100 bg-zinc-50/50">
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-zinc-300" />
              <span className="text-[13px] font-medium text-zinc-300">Cartão</span>
            </div>
            <span className="text-[9px] text-zinc-300">em breve</span>
          </div>
        </div>

        {data?.pix_key ? (
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
        )}
      </div>

      <div className="border-t border-zinc-100 px-5 py-3 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3 text-zinc-300" />
        <p className="text-[11px] text-zinc-400">Pagamento processado com segurança por ORBI Health</p>
      </div>
    </Card>
  );
};

export default Pagamento;
