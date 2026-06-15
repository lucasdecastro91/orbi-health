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
  const planType = ((org as any)?.plan_type ?? "pro") as PlanType;

  return {
    planType,
    hasTraining:        (["motion", "pro", "clinic"] as PlanType[]).includes(planType),
    hasDiet:            (["pro", "balance", "clinic"] as PlanType[]).includes(planType),
    hasSupplementation: (["pro", "balance", "clinic"] as PlanType[]).includes(planType),
  };
}
