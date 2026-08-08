import { useTenantContext } from "@/contexts/TenantContext";

export type PlanType = "motion" | "pro" | "balance" | "clinic";

/**
 * Retorna flags booleanas de acesso a módulos baseadas no plan_type da org.
 *
 * motion  → só treino
 * pro     → treino + dieta
 * balance → só dieta
 * clinic  → treino + dieta (mesmo acesso do pro por enquanto)
 *
 * Default 'pro' garante que orgs sem plan_type definido tenham acesso total.
 */
export function usePlanFeatures() {
  const { org } = useTenantContext();
  const planType   = ((org as any)?.plan_type ?? "pro") as PlanType;
  const alunosTier = ((org as any)?.alunos_tier ?? "ilimitado") as "50" | "ilimitado";

  return {
    planType,
    alunosTier,
    hasTraining:        (["motion", "pro", "clinic"] as PlanType[]).includes(planType),
    hasDiet:            (["pro", "balance", "clinic"] as PlanType[]).includes(planType),
    hasSupplementation: (["pro", "balance", "clinic"] as PlanType[]).includes(planType),
    // Colaboradores só disponível no tier de alunos ilimitados
    hasCollaborators:   alunosTier === "ilimitado",
    // Avaliação Postural: liberada pra todas as orgs (2026-07-16) — deixou de
    // ser diferencial sob encomenda pra virar feature padrão do produto.
    hasAvaliacaoPostural: true,
  };
}
