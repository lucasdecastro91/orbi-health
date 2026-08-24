import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Calculadora de repasse de cartão pra Produtos & Planos.
//
// A conta Asaas do Lucas tem "Repassar taxas do cartão" ligado: ao criar uma
// cobrança com `value = X`, o Asaas cobra do ALUNO um valor maior (X + taxa
// do cartão) e garante que o treinador recebe exatamente X líquido. Ou seja,
// pra "sem antecipação" o campo `value` que vai pro plano é o próprio valor
// líquido desejado — não precisa de fórmula nenhuma pra ESSA parte.
//
// O que a gente precisa calcular (e não vem de graça da Asaas):
// 1. Quanto o aluno efetivamente vai pagar (pra mostrar na tela) — não tem
//    endpoint "valor líquido → valor cobrado", só o inverso
//    (POST /v3/payments/simulate: valor cobrado → valor líquido, SEM
//    considerar repasse). Resolve por busca linear (a relação é afim, então
//    converge em no máximo 2 chamadas): chuta um valor cobrado, chama a API,
//    ajusta pela diferença.
// 2. Se o treinador vai ANTECIPAR o recebimento, a Asaas cobra um custo de
//    antecipação em cima do líquido (fora do repasse de taxa de cartão, que
//    só cobre a maquininha). Não tem API disponível pra isso (exige conta
//    aprovada) — fórmula derivada por engenharia reversa e validada contra o
//    simulador oficial (ver memória do projeto, 2026-08-23). Adiciona uma
//    margem de segurança em cima pra nunca entregar menos que o líquido
//    pedido por causa do resíduo (~0,17 a 0,24 por R$1.000, cresce com o
//    valor).
//
// Limite de negócio: valor líquido desejado até R$5.000,00 e até 12x. Acima
// disso, orienta a falar com o suporte (bolha de IA já fica disponível em
// toda tela do coach) em vez de confiar no cálculo automático.

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_API_KEY    = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV        = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";

const ASAAS_BASE = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LIMITE_LIQUIDO   = 5000;
const LIMITE_PARCELAS  = 12;

// ── Tabela oficial de taxas do cartão (asaas.com/precos-e-taxas) ────────────
function feePercent(installments: number): number {
  if (installments <= 1) return 2.99;
  if (installments <= 6) return 3.49;
  if (installments <= 12) return 3.99;
  return 4.29; // 13-21x — fora do limite de negócio, mas cobre o caso
}
const OPERATION_FEE = 0.49; // cobrada uma vez por cobrança, não por parcela

// ── Custo de antecipação (fórmula derivada, validada 2026-08-23) ────────────
function anticipationPercent(installments: number): number {
  const taxaMensal = installments <= 1 ? 1.25 : 1.70;
  return taxaMensal * (32 / 30) * ((installments + 1) / 2);
}

// ── Margem de segurança em cima do resíduo da fórmula de antecipação ────────
function safetyMargin(netValue: number): number {
  return Math.max(netValue * 0.003, 2);
}

interface SimulateResult {
  grossValue: number;
  netValue: number;
  perInstallmentGross: number;
}

// Chama /payments/simulate e resolve por aproximação linear o valor bruto
// (cobrado do aluno) que resulta no líquido desejado. A relação é afim
// (netValue = grossValue*(1-fee%) - taxaFixa), então converge em <=2 chamadas.
async function resolveGrossForNet(targetNet: number, installments: number): Promise<SimulateResult> {
  const fee = feePercent(installments) / 100;
  let grossGuess = (targetNet + OPERATION_FEE) / (1 - fee);

  let last: any = null;
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${ASAAS_BASE}/payments/simulate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
      body:    JSON.stringify({
        value: Number(grossGuess.toFixed(2)),
        installmentCount: installments,
        billingTypes: ["CREDIT_CARD"],
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.creditCard) {
      throw new Error(`Asaas simulate error: ${JSON.stringify(data)}`);
    }
    last = data;
    const netValue = Number(data.creditCard.netValue);
    const diff = targetNet - netValue;
    if (Math.abs(diff) <= 0.01) break;
    grossGuess = grossGuess + diff / (1 - fee);
  }

  const installment = last.creditCard.installment;
  return {
    grossValue:          Number(last.value),
    netValue:             Number(last.creditCard.netValue),
    perInstallmentGross:  installment ? Number(installment.paymentValue) : Number(last.value) / installments,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const netDesired    = Number(body.netDesired);
    const installments   = Number(body.installments);
    const anticipate     = Boolean(body.anticipate);

    if (!netDesired || netDesired <= 0 || !installments || installments < 1) {
      throw new Error("Informe o valor líquido desejado e o número de parcelas.");
    }

    if (netDesired > LIMITE_LIQUIDO || installments > LIMITE_PARCELAS) {
      return new Response(JSON.stringify({
        error: "limite_excedido",
        message: `Cálculo automático disponível até ${LIMITE_PARCELAS}x e R$ ${LIMITE_LIQUIDO.toLocaleString("pt-BR")},00 líquidos. Pra valores maiores, fale com o suporte.`,
      }), { status: 422, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let planValue: number;      // valor a configurar no plano (enviado à Asaas)
    let marginApplied = 0;

    if (anticipate) {
      const antecipPct = anticipationPercent(installments);
      const margin = safetyMargin(netDesired);
      marginApplied = margin;
      // valor que precisa "sobrar" líquido de cartão antes da antecipação
      // corroer o custo, já embutindo a margem de segurança
      planValue = (netDesired + margin) / (1 - antecipPct / 100);
    } else {
      planValue = netDesired;
    }

    const sim = await resolveGrossForNet(planValue, installments);

    return new Response(JSON.stringify({
      scenario:            anticipate ? "anticipation" : "no_anticipation",
      installments,
      netDesired,
      planValue:            Number(planValue.toFixed(2)),   // vai no campo "value" do plano
      totalCharged:         sim.grossValue,                  // total que o aluno paga
      perInstallment:       sim.perInstallmentGross,          // valor de cada parcela pro aluno
      netEstimated:         netDesired,                       // líquido garantido pro treinador
      marginApplied:        Number(marginApplied.toFixed(2)),
      feePercent:           feePercent(installments),
      anticipationPercent:  anticipate ? Number(anticipationPercent(installments).toFixed(2)) : null,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
