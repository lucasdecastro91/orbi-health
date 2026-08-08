import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useToast } from "@/hooks/use-toast";

type Tier = "50" | "ilimitado";
type Billing = "monthly" | "annual";

const PLANS = [
  {
    id: "motion",
    badge: "Mais popular",
    name: "ORBI Motion",
    price: {
      monthly: { "50": "R$59,90", ilimitado: "R$99,90" },
      annual:  { "50": "R$539,10", ilimitado: "R$899,10" },
    },
    desc: "Para personal trainers em crescimento",
    features: [
      "Treinos personalizados",
      "App com sua marca",
      "Agenda e frequência",
      "Financeiro e cobranças",
    ],
  },
  {
    id: "pro",
    badge: "Mais completo",
    name: "ORBI Pro",
    price: {
      monthly: { "50": "R$129,90", ilimitado: "R$189,90" },
      annual:  { "50": "R$1.169,10", ilimitado: "R$1.709,10" },
    },
    desc: "Para coaches com equipe integrada",
    features: [
      "Tudo do Motion",
      "Gestão de dieta completa",
      "Banco de alimentos completo",
      "IA para análise de check-ins",
    ],
  },
];

const PlanoAtual = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { orgId, slug, reload } = useTenantContext();
  const { planType: currentPlan, alunosTier: currentTier } = usePlanFeatures();

  const [tiers, setTiers] = useState<Record<string, Tier>>({ motion: "50", pro: "50" });
  const [billing, setBilling] = useState<Billing>("monthly");
  const [saving, setSaving] = useState<string | null>(null);
  const period = billing === "annual" ? "/ano" : "/mês";

  const handleChangePlan = async (planId: "motion" | "pro", tier: Tier) => {
    if (!orgId) return;
    setSaving(`${planId}-${tier}`);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ plan_type: planId, alunos_tier: tier })
        .eq("id", orgId);
      if (error) throw error;
      await reload?.();
      toast({ title: "Plano atualizado!", description: `Você agora está no ${planId === "motion" ? "ORBI Motion" : "ORBI Pro"} (${tier === "50" ? "até 50 alunos" : "ilimitado"}).` });
      navigate(`/${slug}/treinador/colaboradores`);
    } catch (err: any) {
      toast({ title: "Erro ao mudar de plano", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-hidden" style={{ background: "#050505" }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 45% at 20% 15%, rgba(34,197,94,0.16) 0%, transparent 65%)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 45% at 85% 90%, rgba(22,163,74,0.18) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(`/${slug}/treinador/colaboradores`)}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Seu plano</h1>
          <p className="text-white/40 mt-2">Altere seu plano a qualquer momento. Sem taxa de implementação.</p>
        </div>

        {/* Toggle mensal / anual */}
        <div className="flex justify-center mb-8">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setBilling("monthly")}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-all"
              style={billing === "monthly" ? { background: "var(--cp-gradient)", color: "#fff" } : { color: "rgba(255,255,255,0.4)" }}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling("annual")}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all"
              style={billing === "annual" ? { background: "var(--cp-gradient)", color: "#fff" } : { color: "rgba(255,255,255,0.4)" }}
            >
              Anual
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                -25%
              </span>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {PLANS.map((p) => {
            const tier = tiers[p.id as "motion" | "pro"];
            const hasCollab = tier === "ilimitado";
            const isCurrent = currentPlan === p.id && currentTier === tier;
            const key = `${p.id}-${tier}`;
            return (
              <div key={p.id} className="relative">
                <div
                  className="absolute -inset-4 rounded-3xl pointer-events-none"
                  style={{ background: "radial-gradient(ellipse 80% 70% at 50% 20%, rgba(34,197,94,0.18) 0%, transparent 70%)", filter: "blur(8px)" }}
                />
                <div
                  className="relative rounded-2xl p-6 flex flex-col h-full"
                  style={{
                    background: "#111814",
                    border: "1px solid rgba(34,197,94,0.35)",
                    boxShadow: "0 0 0 1px rgba(34,197,94,0.12), 0 0 40px rgba(34,197,94,0.12), 0 8px 40px rgba(0,0,0,0.4)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className="inline-flex text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                    >
                      {p.badge}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white/70" style={{ background: "rgba(255,255,255,0.08)" }}>
                        Plano atual
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white">{p.name}</h2>

                  <div className="flex gap-1 mt-3 mb-4 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                    {(["50", "ilimitado"] as Tier[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTiers((prev) => ({ ...prev, [p.id]: t }))}
                        className="flex-1 text-xs font-semibold py-1.5 rounded-md transition-all"
                        style={tier === t ? { background: "var(--cp-gradient)", color: "#fff" } : { color: "rgba(255,255,255,0.4)" }}
                      >
                        {t === "50" ? "Até 50 alunos" : "Ilimitado"}
                      </button>
                    ))}
                  </div>

                  <div className="mt-1 mb-1">
                    <span className="text-3xl font-bold text-white">{p.price[billing][tier]}</span>
                    <span className="text-white/40 text-sm">{period}</span>
                  </div>
                  <p className="text-sm text-white/40 mb-5">{p.desc}</p>

                  <ul className="space-y-2.5 mb-6 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                        <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                        {f}
                      </li>
                    ))}
                    <li
                      className="flex items-start gap-2 text-sm transition-colors"
                      style={{ color: hasCollab ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.16)", textDecoration: hasCollab ? "none" : "line-through" }}
                    >
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: hasCollab ? "#22c55e" : "rgba(255,255,255,0.16)" }} />
                      Colaboradores
                    </li>
                  </ul>

                  <button
                    onClick={() => handleChangePlan(p.id as "motion" | "pro", tier)}
                    disabled={isCurrent || saving === key}
                    className="w-full h-12 rounded-xl font-semibold text-white text-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: isCurrent ? "rgba(255,255,255,0.08)" : "var(--cp-gradient)", boxShadow: isCurrent ? "none" : "0 4px 20px rgba(22,163,74,0.3)" }}
                  >
                    {saving === key ? <Loader2 className="w-4 h-4 animate-spin" /> : isCurrent ? "Plano atual" : "Mudar para este plano"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PlanoAtual;
