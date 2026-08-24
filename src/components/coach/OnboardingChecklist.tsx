import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { CheckCircle2, Circle, X, ChevronDown, ChevronUp } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CheckState {
  logo:      boolean;
  icon:      boolean;
  aluno:     boolean;
  exercicio: boolean;
  plano:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const OnboardingChecklist = () => {
  const navigate = useNavigate();
  const { org, orgId, slug, reload } = useTenantContext();

  // ── Todos os hooks ANTES de qualquer return condicional ───────────────────
  const [checks,     setChecks]     = useState<CheckState | null>(null);
  const [dismissed,  setDismissed]  = useState(false);
  const [collapsed,  setCollapsed]  = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const autoCompleted = useRef(false);

  // Carrega contagens do banco quando a org estiver disponível
  useEffect(() => {
    if (!orgId || !org || org.onboarding_completed) return;

    const load = async () => {
      const [alunoRes, exercicioRes, planoRes] = await Promise.all([
        supabase
          .from("alunos")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
        supabase
          .from("exercicios_base")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
        supabase
          .from("plans")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId),
      ]);

      setChecks({
        logo:      !!org.logo_url,
        icon:      !!org.icon_url,
        aluno:     (alunoRes.count  ?? 0) > 0,
        exercicio: (exercicioRes.count ?? 0) > 0,
        plano:     (planoRes.count  ?? 0) > 0,
      });
    };

    load();
  // Re-executa quando logo_url ou icon_url mudarem (após upload)
  }, [orgId, org?.logo_url, org?.icon_url, org?.onboarding_completed]);

  // Auto-completa quando todos os itens estiverem marcados
  useEffect(() => {
    if (!checks || !orgId) return;
    const all = Object.values(checks).every(Boolean);
    if (all && !autoCompleted.current) {
      autoCompleted.current = true;
      supabase
        .from("organizations")
        .update({ onboarding_completed: true })
        .eq("id", orgId)
        .then(() => reload());
    }
  }, [checks, orgId]);

  // ── Guards de render (depois de todos os hooks) ───────────────────────────
  if (!org || org.onboarding_completed || dismissed) return null;

  // ── Funções de ação ───────────────────────────────────────────────────────
  const markComplete = async () => {
    if (!orgId) return;
    await supabase
      .from("organizations")
      .update({ onboarding_completed: true })
      .eq("id", orgId);
    reload();
  };

  const handleDismissPermanently = async () => {
    setDismissing(true);
    await markComplete();
  };

  // ── Derivados ─────────────────────────────────────────────────────────────
  const items = [
    {
      key:   "logo",
      done:  checks?.logo     ?? false,
      label: "Adicione sua logo",
      sub:   "Configurações › Identidade Visual",
      path:  `/${slug}/treinador/configuracoes`,
    },
    {
      key:   "icon",
      done:  checks?.icon     ?? false,
      label: "Adicione seu ícone",
      sub:   "Configurações › Identidade Visual",
      path:  `/${slug}/treinador/configuracoes`,
    },
    {
      key:   "aluno",
      done:  checks?.aluno    ?? false,
      label: "Cadastre seu primeiro aluno",
      sub:   "Meus Clientes",
      path:  `/${slug}/treinador/clientes`,
    },
    {
      key:   "exercicio",
      done:  checks?.exercicio ?? false,
      label: "Crie seu primeiro exercício",
      sub:   "Biblioteca de Exercícios",
      path:  `/${slug}/treinador/biblioteca`,
    },
    {
      key:   "plano",
      done:  checks?.plano    ?? false,
      label: "Configure sua cobrança",
      sub:   "Produtos / Planos",
      path:  `/${slug}/treinador/produtos`,
    },
  ];

  const total = items.length;
  const done  = items.filter((i) => i.done).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed bottom-6 right-4 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-[320px] rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--sheet-bg-2)",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
        style={{ borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.06)" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold"
            style={{
              background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))",
              color: "#000",
            }}
          >
            {done}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white leading-none">Configure sua conta</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {done} de {total} concluídos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {collapsed
            ? <ChevronUp   className="w-4 h-4 text-white/30" />
            : <ChevronDown className="w-4 h-4 text-white/30" />
          }
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
            className="ml-1 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors"
            title="Fechar temporariamente"
          >
            <X className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
      </div>

      {/* ── Corpo (expandido) ───────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          {/* Barra de progresso */}
          <div className="px-4 pt-3 pb-1">
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: pct === 100
                    ? "rgb(74,222,128)"
                    : "linear-gradient(90deg, hsl(42 95% 58%), hsl(35 92% 44%))",
                }}
              />
            </div>
          </div>

          {/* Lista de itens */}
          <div className="px-3 pt-2 pb-1">
            {checks === null ? (
              <p className="text-[12px] text-white/30 text-center py-4">Carregando...</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-start gap-3 px-1.5 py-2 rounded-xl hover:bg-white/5 active:bg-white/8 transition-colors text-left"
                >
                  {item.done ? (
                    <CheckCircle2
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "rgb(74,222,128)" }}
                    />
                  ) : (
                    <Circle className="w-4 h-4 mt-0.5 shrink-0 text-white/20" />
                  )}
                  <div className="min-w-0">
                    <p
                      className="text-[13px] font-medium leading-tight"
                      style={{
                        color:          item.done ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.8)",
                        textDecoration: item.done ? "line-through" : "none",
                      }}
                    >
                      {item.label}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                      {item.sub}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Dispensar definitivamente */}
          <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              type="button"
              onClick={handleDismissPermanently}
              disabled={dismissing}
              className="w-full text-[11px] font-medium py-2 rounded-xl transition-colors hover:text-white/55"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              {dismissing ? "Dispensando..." : "Dispensar definitivamente"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default OnboardingChecklist;
