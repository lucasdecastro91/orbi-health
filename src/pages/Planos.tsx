import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";

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

const Planos = () => {
  const navigate = useNavigate();
  const [tiers, setTiers] = useState<Record<string, Tier>>({ motion: "50", pro: "50" });
  const [billing, setBilling] = useState<Billing>("monthly");
  const period = billing === "annual" ? "/ano" : "/mês";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#050505" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 45% at 20% 15%, rgba(34,197,94,0.16) 0%, transparent 65%)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 45% at 85% 90%, rgba(22,163,74,0.18) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 w-full max-w-3xl">
        <div className="text-center mb-8">
          <img src="/logos/orbi-logo-vertical-dark.svg" alt="ORBI" className="h-20 w-auto object-contain mx-auto mb-8" />
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Escolha seu plano</h1>
          <p className="text-white/40 mt-2">Comece grátis, sem cartão. Sem taxa de implementação. Cancele quando quiser.</p>
        </div>

        {/* Toggle mensal / anual */}
        <div className="flex justify-center mb-8">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setBilling("monthly")}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-all"
              style={
                billing === "monthly"
                  ? { background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }
                  : { color: "rgba(255,255,255,0.4)" }
              }
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling("annual")}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all"
              style={
                billing === "annual"
                  ? { background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }
                  : { color: "rgba(255,255,255,0.4)" }
              }
            >
              Anual
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
              >
                -25%
              </span>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {PLANS.map((p) => {
            const tier = tiers[p.id];
            const hasCollab = tier === "ilimitado";
            return (
              <div key={p.id} className="relative">
                {/* Glow esfumaçado atrás do card */}
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
                  <span
                    className="inline-flex self-start text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-4"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                  >
                    {p.badge}
                  </span>
                  <h2 className="text-lg font-bold text-white">{p.name}</h2>

                  {/* Toggle 50 alunos / ilimitado */}
                  <div className="flex gap-1 mt-3 mb-4 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                    {(["50", "ilimitado"] as Tier[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTiers((prev) => ({ ...prev, [p.id]: t }))}
                        className="flex-1 text-xs font-semibold py-1.5 rounded-md transition-all"
                        style={
                          tier === t
                            ? { background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }
                            : { color: "rgba(255,255,255,0.4)" }
                        }
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
                      style={{
                        color: hasCollab ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.16)",
                        textDecoration: hasCollab ? "none" : "line-through",
                      }}
                    >
                      <Check
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: hasCollab ? "#22c55e" : "rgba(255,255,255,0.16)" }}
                      />
                      Colaboradores
                    </li>
                  </ul>

                  <button
                    onClick={() => navigate(`/cadastro?plano=${p.id}&alunos=${tier}`)}
                    className="w-full h-12 rounded-xl font-semibold text-white text-sm transition-all hover:brightness-110 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 20px rgba(22,163,74,0.3)" }}
                  >
                    Começar grátis
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

export default Planos;
