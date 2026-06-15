import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { grantXP } from "@/lib/xp";
import {
  Clock, Utensils, Flame, Beef, Wheat, Droplet,
  CheckCircle2, Circle, X, RefreshCw, ChevronRight, History,
  BookOpen, ChefHat, Shuffle, ListOrdered, Leaf, FileText,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

const isMissingMealCompletionsTable = (error: any) =>
  error?.code === "PGRST205" ||
  error?.code === "42P01" ||
  String(error?.message ?? "").includes("meal_completions");

const isMissingMealAltsTable = (error: any) =>
  error?.code === "PGRST205" ||
  error?.code === "42P01" ||
  String(error?.message ?? "").includes("meal_alternative");

const round1 = (value: number) => Math.round(value * 10) / 10;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AlimentoData {
  id: string;
  nome: string;
  porcao_gramas: number | null;
  kcal: number | null;
  proteina_g: number | null;
  carb_g: number | null;
  gordura_g: number | null;
  fibra_g: number | null;
}

interface DietFood {
  id: string;
  name: string;
  portion: string | null;
  order_index: number;
  quantidade: number | null;
  unidade: string | null;
  alimento_id: string | null;
  alimentos: AlimentoData | null;
  substitution_group_id: string | null;
  parent_food_id: string | null;
  lista_subst_grupo_id: string | null;
  lista_subst_porcoes: number | null;
}

interface ListaSubstItem {
  id: string;
  nome: string;
  porcao: string | null;
  ordem: number;
}

interface DietMeal {
  id: string;
  name: string;
  time_suggestion: string | null;
  notes: string | null;
  observacoes_receita: string | null;
  modo_preparo: string | null;
  order_index: number;
  diet_meal_foods: DietFood[];
}

interface Diet {
  id: string;
  title: string;
  calories: number | null;
  observacoes: string | null;
  refeicao_livre: string | null;
  diet_meals: DietMeal[];
}

interface Macros { kcal: number; prot: number; carb: number; gord: number }

interface SubstitutionOption {
  id: string;
  nome: string;
  quantidade: number | null;
  unidade: string | null;
  alimentos: AlimentoData | null;
}

interface MealAltFood {
  id: string;
  alternative_id: string;
  nome_display: string;
  quantidade: number;
  unidade: string;
  ordem: number;
  alimento_id: string | null;
  alimentos: AlimentoData | null;
}

interface MealAlt {
  id: string;
  meal_id: string;
  nome: string;
  ordem: number;
  foods: MealAltFood[] | null;
}

// ─────────────────────────────────────────────────────────────
// Macro helpers
// ─────────────────────────────────────────────────────────────

const calcFoodMacros = (food: DietFood): Macros | null => {
  const alim = food.alimentos;
  if (!alim || !alim.porcao_gramas) return null;
  const ratio = (food.quantidade ?? 100) / alim.porcao_gramas;
  return {
    kcal: Math.round((alim.kcal       ?? 0) * ratio),
    prot: Math.round((alim.proteina_g ?? 0) * ratio * 10) / 10,
    carb: Math.round((alim.carb_g     ?? 0) * ratio * 10) / 10,
    gord: Math.round((alim.gordura_g  ?? 0) * ratio * 10) / 10,
  };
};

const calcSubMacros = (opt: SubstitutionOption): Macros | null => {
  const alim = opt.alimentos;
  if (!alim || !alim.porcao_gramas) return null;
  const ratio = (opt.quantidade ?? 100) / alim.porcao_gramas;
  return {
    kcal: Math.round((alim.kcal       ?? 0) * ratio),
    prot: Math.round((alim.proteina_g ?? 0) * ratio * 10) / 10,
    carb: Math.round((alim.carb_g     ?? 0) * ratio * 10) / 10,
    gord: Math.round((alim.gordura_g  ?? 0) * ratio * 10) / 10,
  };
};

const calcAltFoodMacros = (f: MealAltFood): Macros | null => {
  const alim = f.alimentos;
  if (!alim || !alim.porcao_gramas) return null;
  const ratio = f.quantidade / alim.porcao_gramas;
  return {
    kcal: Math.round((alim.kcal       ?? 0) * ratio),
    prot: Math.round((alim.proteina_g ?? 0) * ratio * 10) / 10,
    carb: Math.round((alim.carb_g     ?? 0) * ratio * 10) / 10,
    gord: Math.round((alim.gordura_g  ?? 0) * ratio * 10) / 10,
  };
};

const sumMacros = (foods: DietFood[]): Macros => {
  const s = foods.reduce((acc, f) => {
    const m = calcFoodMacros(f);
    if (!m) return acc;
    return { kcal: acc.kcal + m.kcal, prot: acc.prot + m.prot, carb: acc.carb + m.carb, gord: acc.gord + m.gord };
  }, { kcal: 0, prot: 0, carb: 0, gord: 0 });
  return { kcal: round1(s.kcal), prot: round1(s.prot), carb: round1(s.carb), gord: round1(s.gord) };
};

const sumAltFoodMacros = (foods: MealAltFood[]): Macros => {
  const s = foods.reduce((acc, f) => {
    const m = calcAltFoodMacros(f);
    if (!m) return acc;
    return { kcal: acc.kcal + m.kcal, prot: acc.prot + m.prot, carb: acc.carb + m.carb, gord: acc.gord + m.gord };
  }, { kcal: 0, prot: 0, carb: 0, gord: 0 });
  return { kcal: round1(s.kcal), prot: round1(s.prot), carb: round1(s.carb), gord: round1(s.gord) };
};

// Semantic color shortcuts — adapt to dark/light theme automatically
const FG   = "hsl(var(--foreground))";           // primary text
const MUT  = "hsl(var(--muted-foreground))";      // muted/secondary text

// ─────────────────────────────────────────────────────────────
// RecipeSheet
// ─────────────────────────────────────────────────────────────

interface RecipeSheetProps { meal: DietMeal; onClose: () => void; }

const RecipeSheet = ({ meal, onClose }: RecipeSheetProps) => (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center"
    style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div
      className="w-full max-w-lg rounded-t-3xl overflow-hidden"
      style={{ backgroundColor: "#0f0f10", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-white/50" />
          <p className="text-sm font-semibold text-white">{meal.name}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
          <X className="w-4 h-4 text-white/50" />
        </button>
      </div>
      <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {meal.observacoes_receita && (
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Observações / Receita</p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{meal.observacoes_receita}</p>
          </div>
        )}
        {meal.modo_preparo && (
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Modo de Preparo</p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{meal.modo_preparo}</p>
          </div>
        )}
      </div>
      <div className="h-6" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// InlineSubstitutions
// ─────────────────────────────────────────────────────────────

interface InlineSubstitutionsProps {
  food: DietFood;
  options: SubstitutionOption[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (foodId: string, optionId: string) => void;
  onReset: (foodId: string) => void;
}

const InlineSubstitutions = ({ food, options, loading, selectedId, onSelect, onReset }: InlineSubstitutionsProps) => {
  const originalMacros = calcFoodMacros(food);

  return (
    <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      {/* Indented section — same left accent as ChildSubsList */}
      <div
        className="mx-3 my-3"
        style={{ paddingLeft: "10px", borderLeft: "2px solid rgba(var(--cp-rgb), 0.2)" }}
      >
      <div className="flex items-center gap-1.5 mb-2">
        <RefreshCw className="w-3 h-3 shrink-0" style={{ color: "var(--cp-400)", opacity: 0.65 }} />
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--cp-400)", opacity: 0.65 }}>
          Trocar por
        </span>
      </div>

      <div className="space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 rounded-full border-2 animate-spin border-border border-t-muted-foreground" />
          </div>
        ) : options.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhuma substituição cadastrada</p>
        ) : (
          <>
            {options.map((opt) => {
              const subMacros  = calcSubMacros(opt);
              const isSelected = selectedId === opt.id;
              const optName    = opt.alimentos?.nome ?? opt.nome;
              const optQty     = opt.quantidade != null ? `${opt.quantidade}${opt.unidade ?? "g"}` : "";
              const kcalDiff   = originalMacros && subMacros ? subMacros.kcal - originalMacros.kcal : null;

              return (
                <button
                  key={opt.id}
                  onClick={() => onSelect(food.id, opt.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    backgroundColor: isSelected ? "rgba(var(--cp-rgb), 0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isSelected ? "rgba(var(--cp-rgb), 0.25)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  {/* Radio dot */}
                  <div className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                    style={{
                      borderColor:     isSelected ? "var(--cp-500)" : "rgba(255,255,255,0.2)",
                      backgroundColor: isSelected ? "var(--cp-500)" : "transparent",
                    }}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>

                  {/* Name + qty */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-sm font-medium break-words"
                        style={{ color: isSelected ? "var(--cp-400)" : FG }}>
                        {optName}
                      </span>
                      {optQty && <span className="text-[11px] text-muted-foreground shrink-0">{optQty}</span>}
                    </div>
                    {subMacros && subMacros.kcal > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {subMacros.kcal} kcal · P {subMacros.prot}g · C {subMacros.carb}g · G {subMacros.gord}g
                      </p>
                    )}
                  </div>

                  {/* Kcal diff badge */}
                  {kcalDiff !== null && originalMacros && originalMacros.kcal > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                      style={{
                        backgroundColor:
                          kcalDiff === 0 ? "rgba(255,255,255,0.06)"
                          : kcalDiff > 0  ? "rgba(239,68,68,0.1)"
                                          : "rgba(34,197,94,0.1)",
                        color:
                          kcalDiff === 0 ? MUT
                          : kcalDiff > 0  ? "#f87171"
                                          : "#4ade80",
                      }}
                    >
                      {kcalDiff > 0 ? `+${kcalDiff}` : kcalDiff === 0 ? "=" : kcalDiff} kcal
                    </span>
                  )}
                </button>
              );
            })}

            {selectedId && (
              <button onClick={() => onReset(food.id)}
                className="w-full text-center text-[11px] text-muted-foreground pt-1.5 pb-0.5 transition-colors">
                Usar alimento original
              </button>
            )}
          </>
        )}
      </div>
      </div>  {/* close mx-3 wrapper */}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ChildSubsList — read-only list of parent_food_id-based subs
// These come from diet_meal_foods entries that the trainer added
// directly as substitution options (parent_food_id = original food)
// ─────────────────────────────────────────────────────────────

interface ChildSubsListProps {
  foods: DietFood[];
  onListaRef: (grupoId: string, porcoes: number) => void;
}

const ChildSubsList = ({ foods, onListaRef }: ChildSubsListProps) => {
  if (foods.length === 0) return null;
  return (
    <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      {/* Indented section — left accent line signals "filhos" do alimento */}
      <div
        className="mx-3 my-3"
        style={{ paddingLeft: "10px", borderLeft: "2px solid rgba(var(--cp-rgb), 0.2)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2">
          <Shuffle className="w-3 h-3 shrink-0" style={{ color: "var(--cp-400)", opacity: 0.65 }} />
          <span
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--cp-400)", opacity: 0.65 }}
          >
            Pode substituir por
          </span>
        </div>

        {/* Options */}
        <div className="space-y-1">
          {foods.map((f) => {
            /* ── Lista de substituição reference ── */
            if (f.lista_subst_grupo_id) {
              const porcoes = f.lista_subst_porcoes ?? 1;
              const porcLabel = porcoes === 1 ? "1 porção" : `${porcoes} porções`;
              return (
                <button
                  key={f.id}
                  onClick={() => onListaRef(f.lista_subst_grupo_id!, porcoes)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors active:scale-[0.98]"
                  style={{
                    backgroundColor: "rgba(var(--cp-rgb), 0.06)",
                    border: "1px solid rgba(var(--cp-rgb), 0.18)",
                  }}
                >
                  <ListOrdered
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--cp-400)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium" style={{ color: "var(--cp-300)" }}>
                      {porcLabel} da lista de substituição
                    </span>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--cp-400)", opacity: 0.7 }}>
                      Toque para ver as opções disponíveis
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--cp-400)", opacity: 0.55 }} />
                </button>
              );
            }

            /* ── Regular food substitute ── */
            const macros = calcFoodMacros(f);
            const name   = f.alimentos?.nome ?? f.name;
            const qty    = f.quantidade != null
              ? `${f.quantidade}${f.unidade ?? "g"}`
              : f.portion ?? "";
            return (
              <div
                key={f.id}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {/* Dot */}
                <div
                  className="w-1 h-1 rounded-full mt-[7px] shrink-0"
                  style={{ backgroundColor: "rgba(var(--cp-rgb), 0.55)" }}
                />
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground break-words">{name}</span>
                    {qty && (
                      <span className="text-[11px] text-muted-foreground shrink-0">{qty}</span>
                    )}
                  </div>
                  {macros && macros.kcal > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {macros.kcal} kcal · P {macros.prot}g · C {macros.carb}g · G {macros.gord}g
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// OptionCard — used inside AlternativeSelectionSheet
// ─────────────────────────────────────────────────────────────

interface OptionCardFood { nome: string; qty: string; }

const OptionCard = ({ name, foods, macros, isSelected, onSelect }: {
  name: string;
  foods: OptionCardFood[];
  macros: Macros | null;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    className="w-full rounded-2xl p-4 text-left transition-all"
    style={{
      backgroundColor: isSelected ? "rgba(var(--cp-rgb), 0.1)" : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${isSelected ? "rgba(var(--cp-rgb), 0.3)" : "rgba(255,255,255,0.07)"}`,
    }}
  >
    {/* Name row */}
    <div className="flex items-center gap-3 mb-3">
      <div className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
        style={{
          borderColor:     isSelected ? "var(--cp-500)" : "rgba(255,255,255,0.2)",
          backgroundColor: isSelected ? "var(--cp-500)" : "transparent",
        }}
      >
        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <span className="font-semibold text-sm flex-1"
        style={{ color: isSelected ? "var(--cp-400)" : FG }}>
        {name}
      </span>
      {macros && macros.kcal > 0 && (
        <span className="text-xs font-medium"
          style={{ color: isSelected ? "var(--cp-500)" : MUT }}>
          {macros.kcal} kcal
        </span>
      )}
    </div>

    {/* Food list */}
    {foods.length > 0 && (
      <div className="ml-7 space-y-1 mb-2">
        {foods.map((f, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="w-1 h-1 rounded-full shrink-0 self-center"
              style={{ backgroundColor: isSelected ? "rgba(var(--cp-rgb),0.4)" : "rgba(255,255,255,0.2)" }} />
            <span className="text-xs text-foreground flex-1 break-words">{f.nome}</span>
            {f.qty && <span className="text-[10px] text-muted-foreground shrink-0">{f.qty}</span>}
          </div>
        ))}
      </div>
    )}

    {/* Macros footer */}
    {macros && (macros.prot > 0 || macros.carb > 0 || macros.gord > 0) && (
      <div className="ml-7 flex gap-3">
        <span className="text-[10px] text-muted-foreground">P {macros.prot}g</span>
        <span className="text-[10px] text-muted-foreground">C {macros.carb}g</span>
        <span className="text-[10px] text-muted-foreground">G {macros.gord}g</span>
      </div>
    )}
  </button>
);

// ─────────────────────────────────────────────────────────────
// AlternativeSelectionSheet
// ─────────────────────────────────────────────────────────────

interface AltSheetProps {
  meal: DietMeal;
  alternatives: MealAlt[];
  loading: boolean;
  selectedAltId: string | null | undefined;
  onSelect: (mealId: string, altId: string | null) => void;
  onClose: () => void;
}

const AlternativeSelectionSheet = ({ meal, alternatives, loading, selectedAltId, onSelect, onClose }: AltSheetProps) => {
  const mainFoods  = [...meal.diet_meal_foods].filter((f) => !f.parent_food_id).sort((a, b) => a.order_index - b.order_index);
  const mainMacros = sumMacros(mainFoods);
  const isMainSelected = !selectedAltId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{
          backgroundColor: "#0f0f10",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          maxHeight: "82vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Versão da refeição</p>
            <p className="text-sm font-semibold text-white">{meal.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Options */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-2.5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 rounded-full border-2 animate-spin"
                style={{ borderColor: "rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.5)" }} />
            </div>
          ) : (
            <>
              <OptionCard
                name="Refeição principal"
                foods={mainFoods.map((f) => ({
                  nome: f.alimentos?.nome ?? f.name,
                  qty:  f.quantidade != null ? `${f.quantidade}${f.unidade ?? "g"}` : f.portion ?? "",
                }))}
                macros={mainMacros.kcal > 0 ? mainMacros : null}
                isSelected={isMainSelected}
                onSelect={() => onSelect(meal.id, null)}
              />
              {alternatives.map((alt) => {
                const foods     = (alt.foods ?? []).sort((a, b) => a.ordem - b.ordem);
                const altMacros = alt.foods !== null ? sumAltFoodMacros(foods) : null;
                return (
                  <OptionCard
                    key={alt.id}
                    name={alt.nome}
                    foods={foods.map((f) => ({ nome: f.alimentos?.nome ?? f.nome_display, qty: `${f.quantidade}${f.unidade}` }))}
                    macros={altMacros && altMacros.kcal > 0 ? altMacros : null}
                    isSelected={selectedAltId === alt.id}
                    onSelect={() => onSelect(meal.id, alt.id)}
                  />
                );
              })}
            </>
          )}
        </div>
        <div style={{ height: "env(safe-area-inset-bottom, 12px)" }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ListaSubstSheet
// ─────────────────────────────────────────────────────────────

interface ListaSubstSheetProps {
  porcoes: number;
  loading: boolean;
  data: { numero: number; nome: string; itens: ListaSubstItem[] } | null;
  onClose: () => void;
}

/**
 * Multiplica a string de porção por um fator.
 * "50g" × 4 → "200g" | "150ml" × 2 → "300ml" | "1 fatia" × 3 → "3 fatias"
 * Se não conseguir parsear, exibe "N× original".
 */
const multiplyPorcao = (porcao: string, fator: number): string => {
  if (fator <= 1) return porcao;
  const match = porcao.trim().match(/^(\d+(?:[,.]?\d+)?)(.*)/);
  if (!match) return `${fator}× ${porcao}`;
  const num    = parseFloat(match[1].replace(',', '.'));
  const unit   = match[2].trim();
  const result = Number((num * fator).toFixed(1)).toString().replace('.', ',');
  return unit ? `${result}${unit}` : result;
};

const ListaSubstSheet = ({ porcoes, loading, data, onClose }: ListaSubstSheetProps) => {
  const isVegetais = data ? data.numero >= 13 : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{
          backgroundColor: "#0f0f10",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          maxHeight: "82vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">
              {porcoes === 1 ? "1 porção" : `${porcoes} porções`} · Lista de Substituição
            </p>
            {data && (
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: "var(--cp-gradient)", color: "#fff" }}
                >
                  {data.numero}
                </div>
                <p className="text-sm font-semibold text-white">{data.nome}</p>
                {isVegetais && <Leaf className="w-3.5 h-3.5 text-green-500/60" />}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div
                className="w-5 h-5 rounded-full border-2 animate-spin"
                style={{ borderColor: "rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.5)" }}
              />
            </div>
          ) : !data || data.itens.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-8">
              Nenhum item cadastrado neste grupo.
            </p>
          ) : (
            <>
              {isVegetais && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
                  style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}
                >
                  <Leaf className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <p className="text-xs text-green-400">À vontade — sem restrição de porção</p>
                </div>
              )}

              <div className="space-y-1.5">
                {data.itens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "rgba(var(--cp-rgb),0.5)" }}
                    />
                    <span className="flex-1 text-sm text-white/85 break-words">{item.nome}</span>
                    {item.porcao ? (
                      <span
                        className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-lg"
                        style={{
                          backgroundColor: "rgba(var(--cp-rgb),0.1)",
                          color: "var(--cp-400)",
                        }}
                      >
                        {multiplyPorcao(item.porcao, porcoes)}
                      </span>
                    ) : (
                      <span className="text-xs text-green-500/60 shrink-0">livre</span>
                    )}
                  </div>
                ))}
              </div>

              {!isVegetais && porcoes > 1 && (
                <p className="text-[10px] text-white/25 text-center mt-4">
                  Você pode usar {porcoes} itens diferentes ou repetir o mesmo {porcoes}×
                </p>
              )}
            </>
          )}
        </div>
        <div style={{ height: "env(safe-area-inset-bottom, 12px)" }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Dieta = () => {
  const navigate  = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();

  const [diet, setDiet]         = useState<Diet | null>(null);
  const [loading, setLoading]   = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [treinadorId, setTreinadorId] = useState<string | null>(null);
  const [alunoRecId,  setAlunoRecId]  = useState<string | null>(null);
  const [alunoNomeDieta, setAlunoNomeDieta] = useState<string | null>(null);
  const today = brazilToday();

  const [doneMeals, setDoneMeals]   = useState<Set<string>>(new Set());
  const [toggling, setToggling]     = useState<string | null>(null);
  const [justDone, setJustDone]     = useState<Set<string>>(new Set()); // drives pop-in animation
  const [mealCompletionsEnabled, setMealCompletionsEnabled] = useState(true);

  // Food-level substitutions
  const [expandedFoodId, setExpandedFoodId] = useState<string | null>(null);
  const [subCache, setSubCache]             = useState<Record<string, SubstitutionOption[]>>({});
  const [subLoadingId, setSubLoadingId]     = useState<string | null>(null);
  const [selections, setSelections]         = useState<Record<string, string>>({});

  // Meal-level alternatives
  const [mealAlts, setMealAlts]             = useState<Record<string, MealAlt[]>>({});
  const [altSels, setAltSels]               = useState<Record<string, string | null>>({});
  const [altSheet, setAltSheet]             = useState<DietMeal | null>(null);
  const [altSheetLoading, setAltSheetLoading] = useState(false);

  // Recipe sheet
  const [recipeMeal, setRecipeMeal] = useState<DietMeal | null>(null);

  // Suplementação
  const [suplementos, setSuplementos] = useState<{ id: string; nome: string; dosagem: string | null; instrucao: string | null }[]>([]);

  // Observações sheet
  const [obsOpen, setObsOpen] = useState(false);

  // Lista de Substituição sheet
  const [listaSheet, setListaSheet] = useState<{
    grupoId: string;
    porcoes: number;
  } | null>(null);
  const [listaSheetData, setListaSheetData] = useState<{
    numero: number;
    nome: string;
    itens: ListaSubstItem[];
  } | null>(null);
  const [listaSheetLoading, setListaSheetLoading] = useState(false);

  // ── Load data ───────────────────────────────────────────────

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setStudentId(session.user.id);

      const [dietRes, selectionsRes] = await Promise.all([
        supabase
          .from("diets")
          .select(`
            id, title, calories, observacoes, refeicao_livre,
            diet_meals (
              id, name, time_suggestion, notes, observacoes_receita, modo_preparo, order_index,
              diet_meal_foods (
                id, name, portion, order_index, quantidade, unidade,
                alimento_id, parent_food_id, substitution_group_id,
                lista_subst_grupo_id, lista_subst_porcoes,
                alimentos ( id, nome, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g )
              )
            )
          `)
          .eq("student_id", session.user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("daily_food_selections")
          .select("diet_meal_food_id, substitution_food_id")
          .eq("student_id", session.user.id)
          .eq("date", today),
      ]);

      if (dietRes.error) throw dietRes.error;
      const dietData = dietRes.data as Diet | null;
      setDiet(dietData);

      const selectionsMap: Record<string, string> = {};
      if (!selectionsRes.error && selectionsRes.data) {
        for (const r of selectionsRes.data as any[]) selectionsMap[r.diet_meal_food_id] = r.substitution_food_id;
        setSelections(selectionsMap);
      }
      if (dietData && Object.keys(selectionsMap).length > 0) eagerLoadSubs(selectionsMap, dietData);

      // Meal alternatives
      if (dietData?.diet_meals?.length) {
        const mealIds = dietData.diet_meals.map((m) => m.id);
        const [altListRes, altSelRes] = await Promise.all([
          supabase.from("meal_alternatives").select("id, meal_id, nome, ordem").in("meal_id", mealIds).order("ordem"),
          supabase.from("meal_alternative_selections").select("meal_id, alternative_id").eq("student_id", session.user.id).eq("date", today),
        ]);

        const altsMap: Record<string, MealAlt[]> = {};
        if (!altListRes.error && altListRes.data) {
          for (const a of altListRes.data as any[]) {
            if (!altsMap[a.meal_id]) altsMap[a.meal_id] = [];
            altsMap[a.meal_id].push({ id: a.id, meal_id: a.meal_id, nome: a.nome, ordem: a.ordem, foods: null });
          }
        } else if (altListRes.error && isMissingMealAltsTable(altListRes.error)) { /* table not yet created */ }
        setMealAlts(altsMap);

        const altSelMap: Record<string, string | null> = {};
        if (!altSelRes.error && altSelRes.data) {
          for (const r of altSelRes.data as any[]) altSelMap[r.meal_id] = r.alternative_id ?? null;
        }
        setAltSels(altSelMap);

        const selectedAltIds = Object.values(altSelMap).filter(Boolean) as string[];
        if (selectedAltIds.length > 0) eagerLoadAltFoods(selectedAltIds);
      }

      // Meal completions
      const completionsRes = await supabase
        .from("meal_completions").select("meal_id").eq("student_id", session.user.id).eq("date", today);

      if (completionsRes.error) {
        if (isMissingMealCompletionsTable(completionsRes.error)) { setMealCompletionsEnabled(false); setDoneMeals(new Set()); }
        else throw completionsRes.error;
      } else {
        setMealCompletionsEnabled(true);
        setDoneMeals(new Set((completionsRes.data ?? []).map((r: any) => r.meal_id)));
      }
      // Suplementação
      try {
        const [alunoRes, profileRes] = await Promise.all([
          supabase.from("alunos").select("id, treinador_id").eq("user_id", session.user.id).maybeSingle(),
          supabase.from("profiles").select("nome").eq("id", session.user.id).maybeSingle(),
        ]);
        if (alunoRes.data?.id) {
          setAlunoRecId(alunoRes.data.id);
          if (alunoRes.data.treinador_id) setTreinadorId(alunoRes.data.treinador_id);
          const { data: supls } = await supabase
            .from("suplementos").select("id, nome, dosagem, instrucao").eq("aluno_id", alunoRes.data.id).order("ordem");
          setSuplementos(supls ?? []);
        }
        if (profileRes.data?.nome) setAlunoNomeDieta(profileRes.data.nome);
      } catch {}
    } catch (err: any) {
      toast({ title: "Erro ao carregar dieta", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const eagerLoadSubs = async (selectionsMap: Record<string, string>, dietData: Diet) => {
    const allFoods     = dietData.diet_meals.flatMap((m) => m.diet_meal_foods);
    const groupsToLoad = new Set<string>();
    for (const food of allFoods) {
      if (food.substitution_group_id && selectionsMap[food.id]) groupsToLoad.add(food.substitution_group_id);
    }
    for (const groupId of groupsToLoad) {
      const { data } = await supabase
        .from("substitution_foods")
        .select(`id, nome_custom, quantidade, unidade, order_index, alimentos ( id, nome, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g )`)
        .eq("group_id", groupId).order("order_index");
      if (data) {
        setSubCache((prev) => ({
          ...prev,
          [groupId]: data.map((r: any) => ({ id: r.id, nome: r.nome_custom ?? r.alimentos?.nome ?? "—", quantidade: r.quantidade, unidade: r.unidade, alimentos: r.alimentos ?? null })),
        }));
      }
    }
  };

  const eagerLoadAltFoods = async (altIds: string[]) => {
    const { data, error } = await supabase
      .from("meal_alternative_foods")
      .select(`id, alternative_id, nome_display, quantidade, unidade, ordem, alimentos ( id, nome, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g )`)
      .in("alternative_id", altIds).order("ordem");
    if (error || !data) return;
    const foodsByAlt: Record<string, MealAltFood[]> = {};
    for (const f of data as any[]) {
      if (!foodsByAlt[f.alternative_id]) foodsByAlt[f.alternative_id] = [];
      foodsByAlt[f.alternative_id].push({ id: f.id, alternative_id: f.alternative_id, nome_display: f.nome_display, quantidade: f.quantidade, unidade: f.unidade, ordem: f.ordem, alimento_id: f.alimento_id, alimentos: f.alimentos ?? null });
    }
    setMealAlts((prev) => {
      const next: Record<string, MealAlt[]> = {};
      for (const [mealId, alts] of Object.entries(prev)) {
        next[mealId] = alts.map((a) => altIds.includes(a.id) ? { ...a, foods: foodsByAlt[a.id] ?? [] } : a);
      }
      return next;
    });
  };

  // ── Toggle meal done ─────────────────────────────────────────

  const toggleMeal = useCallback(async (mealId: string) => {
    if (!studentId || toggling || !diet) return;
    setToggling(mealId);
    const isDone   = doneMeals.has(mealId);
    const nextDone = new Set(doneMeals);
    isDone ? nextDone.delete(mealId) : nextDone.add(mealId);
    setDoneMeals(nextDone);

    // Brief pop-in animation on the check icon when marking as done
    if (!isDone) {
      setJustDone((prev) => new Set([...prev, mealId]));
      setTimeout(() => setJustDone((prev) => { const n = new Set(prev); n.delete(mealId); return n; }), 450);
    }

    if (!mealCompletionsEnabled) { setToggling(null); return; }
    try {
      if (isDone) {
        const { error } = await supabase.from("meal_completions").delete().eq("student_id", studentId).eq("meal_id", mealId).eq("date", today);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("meal_completions").upsert({ student_id: studentId, meal_id: mealId, date: today }, { onConflict: "student_id,meal_id,date" });
        if (error) throw error;
        const allNowDone = diet.diet_meals.map((m) => m.id).every((id) => nextDone.has(id));
        if (allNowDone && orgId) await grantXP(studentId, orgId, "diet_day");
        if (allNowDone && treinadorId && alunoRecId && orgId) {
          void (async () => {
            try {
              const { data: existing } = await supabase.from("notificacoes")
                .select("id").eq("user_id", treinadorId).eq("aluno_id", alunoRecId)
                .eq("tipo", "dieta_completa").gte("created_at", today).limit(1);
              if (!existing || existing.length === 0) {
                await supabase.from("notificacoes").insert({
                  user_id: treinadorId, org_id: orgId, aluno_id: alunoRecId, aluno_nome: alunoNomeDieta,
                  titulo: "Dieta concluída",
                  mensagem: `${alunoNomeDieta ?? "Um aluno"} completou todas as refeições de hoje.`,
                  tipo: "dieta_completa",
                });
              }
            } catch {}
          })();
        }
      }
    } catch (err: any) {
      if (isMissingMealCompletionsTable(err)) { setMealCompletionsEnabled(false); setToggling(null); return; }
      setDoneMeals((prev) => { const n = new Set(prev); isDone ? n.add(mealId) : n.delete(mealId); return n; });
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setToggling(null); }
  }, [studentId, doneMeals, toggling, today, diet, orgId, toast, mealCompletionsEnabled, treinadorId, alunoRecId, alunoNomeDieta]);

  // ── Inline food substitutions ────────────────────────────────

  const toggleFoodExpansion = async (food: DietFood) => {
    if (expandedFoodId === food.id) { setExpandedFoodId(null); return; }
    setExpandedFoodId(food.id);
    // Only fetch group-based subs when applicable
    const groupId = food.substitution_group_id;
    if (groupId && !subCache[groupId]) {
      setSubLoadingId(food.id);
      try {
        const { data, error } = await supabase
          .from("substitution_foods")
          .select(`id, nome_custom, quantidade, unidade, order_index, alimentos ( id, nome, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g )`)
          .eq("group_id", groupId).order("order_index");
        if (error) throw error;
        setSubCache((prev) => ({
          ...prev,
          [groupId]: (data ?? []).map((r: any) => ({ id: r.id, nome: r.nome_custom ?? r.alimentos?.nome ?? "—", quantidade: r.quantidade, unidade: r.unidade, alimentos: r.alimentos ?? null })),
        }));
      } catch (err: any) {
        toast({ title: "Erro ao carregar substituições", description: err.message, variant: "destructive" });
      } finally { setSubLoadingId(null); }
    }
  };

  const selectSubstitutionInline = async (foodId: string, optionId: string) => {
    if (!studentId) return;
    setSelections((prev) => ({ ...prev, [foodId]: optionId }));
    setExpandedFoodId(null);
    try {
      const { error } = await supabase.from("daily_food_selections")
        .upsert({ student_id: studentId, diet_meal_food_id: foodId, substitution_food_id: optionId, date: today }, { onConflict: "student_id,diet_meal_food_id,date" });
      if (error) throw error;
    } catch (err: any) {
      setSelections((prev) => { const n = { ...prev }; delete n[foodId]; return n; });
      toast({ title: "Erro ao salvar substituição", description: err.message, variant: "destructive" });
    }
  };

  const resetSubstitutionInline = async (foodId: string) => {
    if (!studentId) return;
    setSelections((prev) => { const n = { ...prev }; delete n[foodId]; return n; });
    setExpandedFoodId(null);
    try { await supabase.from("daily_food_selections").delete().eq("student_id", studentId).eq("diet_meal_food_id", foodId).eq("date", today); }
    catch { /* silent */ }
  };

  // ── Meal-level alternatives ──────────────────────────────────

  const openAltSheet = async (meal: DietMeal) => {
    setAltSheet(meal);
    const unloaded = (mealAlts[meal.id] ?? []).filter((a) => a.foods === null);
    if (unloaded.length === 0) return;
    setAltSheetLoading(true);
    try {
      const altIds = unloaded.map((a) => a.id);
      const { data, error } = await supabase
        .from("meal_alternative_foods")
        .select(`id, alternative_id, nome_display, quantidade, unidade, ordem, alimentos ( id, nome, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g )`)
        .in("alternative_id", altIds).order("ordem");
      if (error) throw error;
      const foodsByAlt: Record<string, MealAltFood[]> = {};
      for (const f of data as any[]) {
        if (!foodsByAlt[f.alternative_id]) foodsByAlt[f.alternative_id] = [];
        foodsByAlt[f.alternative_id].push({ id: f.id, alternative_id: f.alternative_id, nome_display: f.nome_display, quantidade: f.quantidade, unidade: f.unidade, ordem: f.ordem, alimento_id: f.alimento_id, alimentos: f.alimentos ?? null });
      }
      setMealAlts((prev) => ({ ...prev, [meal.id]: (prev[meal.id] ?? []).map((a) => ({ ...a, foods: altIds.includes(a.id) ? (foodsByAlt[a.id] ?? []) : a.foods })) }));
    } catch (err: any) {
      toast({ title: "Erro ao carregar alternativas", description: err.message, variant: "destructive" });
    } finally { setAltSheetLoading(false); }
  };

  const selectAlternative = async (mealId: string, alternativeId: string | null) => {
    if (!studentId) return;
    setAltSels((prev) => ({ ...prev, [mealId]: alternativeId }));
    setAltSheet(null);
    try {
      if (alternativeId === null) {
        await supabase.from("meal_alternative_selections").delete().eq("student_id", studentId).eq("meal_id", mealId).eq("date", today);
      } else {
        const { error } = await supabase.from("meal_alternative_selections")
          .upsert({ student_id: studentId, meal_id: mealId, alternative_id: alternativeId, date: today }, { onConflict: "student_id,meal_id,date" });
        if (error) throw error;
        const alt = (mealAlts[mealId] ?? []).find((a) => a.id === alternativeId);
        if (alt && alt.foods === null) eagerLoadAltFoods([alternativeId]);
      }
    } catch (err: any) {
      setAltSels((prev) => { const n = { ...prev }; delete n[mealId]; return n; });
      toast({ title: "Erro ao salvar preferência", description: err.message, variant: "destructive" });
    }
  };

  // ── Lista de Substituição sheet ──────────────────────────────

  const openListaSheet = async (grupoId: string, porcoes: number) => {
    setListaSheet({ grupoId, porcoes });
    setListaSheetData(null);
    setListaSheetLoading(true);
    try {
      const [grupoRes, itensRes] = await Promise.all([
        supabase.from("lista_subst_grupos").select("numero, nome").eq("id", grupoId).maybeSingle(),
        supabase.from("lista_subst_itens").select("id, nome, porcao, ordem").eq("grupo_id", grupoId).order("ordem"),
      ]);
      if (grupoRes.error) throw grupoRes.error;
      if (!grupoRes.data) throw new Error("Grupo de substituição não encontrado");
      if (itensRes.error) throw itensRes.error;
      setListaSheetData({
        numero: grupoRes.data.numero,
        nome:   grupoRes.data.nome,
        itens:  (itensRes.data ?? []) as ListaSubstItem[],
      });
    } catch (err: any) {
      toast({ title: "Erro ao carregar lista", description: err.message, variant: "destructive" });
    } finally {
      setListaSheetLoading(false);
    }
  };

  // ── Loading / empty states ───────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando sua dieta...</p>
        </div>
      </div>
    );
  }

  if (!diet) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-white/4 flex items-center justify-center mx-auto mb-4 border border-white/6">
            <Utensils className="w-7 h-7 text-white/20" />
          </div>
          <p className="text-foreground font-medium mb-1">Dieta em preparação</p>
          <p className="text-sm text-muted-foreground">
            Seu treinador ainda não enviou sua dieta. Ela aparecerá aqui assim que estiver pronta.
          </p>
        </div>
      </div>
    );
  }

  const sortedMeals = [...diet.diet_meals].sort((a, b) => a.order_index - b.order_index);

  // Build parent → children map for all meals.
  // Child foods (parent_food_id != null) are substitution options added
  // directly by the trainer in the diet editor — they're already fetched
  // but filtered out of mainFoods. We surface them here.
  const childFoodsMap: Record<string, DietFood[]> = {};
  for (const meal of sortedMeals) {
    for (const f of meal.diet_meal_foods) {
      if (f.parent_food_id) {
        if (!childFoodsMap[f.parent_food_id]) childFoodsMap[f.parent_food_id] = [];
        childFoodsMap[f.parent_food_id].push(f);
      }
    }
  }

  // Day total — respects active meal alternatives
  const dayTotal: Macros = sortedMeals.reduce((acc, meal) => {
    const mainFoods = meal.diet_meal_foods.filter((f) => !f.parent_food_id);
    const selAltId  = altSels[meal.id];
    const activeAlt = selAltId ? (mealAlts[meal.id] ?? []).find((a) => a.id === selAltId) : null;
    const mealMacros = activeAlt && activeAlt.foods !== null ? sumAltFoodMacros(activeAlt.foods) : sumMacros(mainFoods);
    return { kcal: round1(acc.kcal + mealMacros.kcal), prot: round1(acc.prot + mealMacros.prot), carb: round1(acc.carb + mealMacros.carb), gord: round1(acc.gord + mealMacros.gord) };
  }, { kcal: 0, prot: 0, carb: 0, gord: 0 });

  const hasAnyMacros   = dayTotal.kcal > 0;
  const totalMeals     = sortedMeals.length;
  const doneMealsCount = sortedMeals.filter((m) => doneMeals.has(m.id)).length;
  const allDone        = totalMeals > 0 && doneMealsCount === totalMeals;

  // ── Render ───────────────────────────────────────────────────

  const hasObs = !!(diet.observacoes || diet.refeicao_livre);

  return (
    <>
      {/* ── Observações sheet ── */}
      {obsOpen && hasObs && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setObsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl overflow-hidden"
            style={{ backgroundColor: "#0f0f10", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-white/50" />
                <p className="text-sm font-semibold text-white">Observações</p>
              </div>
              <button onClick={() => setObsOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {diet.observacoes && (
                <div>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Observações Gerais</p>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{diet.observacoes}</p>
                </div>
              )}
              {diet.refeicao_livre && (
                <div>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Refeição Livre</p>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{diet.refeicao_livre}</p>
                </div>
              )}
            </div>
            <div className="h-6" />
          </div>
        </div>
      )}

      {recipeMeal && <RecipeSheet meal={recipeMeal} onClose={() => setRecipeMeal(null)} />}

      {listaSheet && (
        <ListaSubstSheet
          porcoes={listaSheet.porcoes}
          loading={listaSheetLoading}
          data={listaSheetData}
          onClose={() => { setListaSheet(null); setListaSheetData(null); }}
        />
      )}

      {altSheet && (
        <AlternativeSelectionSheet
          meal={altSheet}
          alternatives={mealAlts[altSheet.id] ?? []}
          loading={altSheetLoading}
          selectedAltId={altSels[altSheet.id]}
          onSelect={selectAlternative}
          onClose={() => setAltSheet(null)}
        />
      )}

      <div className="min-h-screen pb-24">

        {/* ── Page header ── */}
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{diet.title}</h1>

            <div className="flex items-center gap-2 shrink-0">
              {totalMeals > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{
                    backgroundColor: allDone ? "rgba(var(--cp-rgb),0.15)" : "rgba(255,255,255,0.06)",
                    color: allDone ? "var(--cp-400)" : MUT,
                  }}>
                  {allDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Utensils className="w-3.5 h-3.5" />}
                  {doneMealsCount}/{totalMeals}
                </div>
              )}
              {hasObs && (
                <button
                  onClick={() => setObsOpen(true)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  title="Ver observações"
                >
                  <FileText className="w-4 h-4 text-white/40" />
                </button>
              )}
              <button
                onClick={() => navigate(`/${slug}/aluno/dieta/historico`)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                title="Ver histórico"
              >
                <History className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </div>

          {/* Day macros summary */}
          {hasAnyMacros && (
            <div className="mt-3 p-3 rounded-2xl" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>Total do dia</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
                  <Flame className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">{dayTotal.kcal} kcal</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface-1)" }}>
                  <Beef className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">P {dayTotal.prot}g</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface-1)" }}>
                  <Wheat className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">C {dayTotal.carb}g</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface-1)" }}>
                  <Droplet className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">G {dayTotal.gord}g</span>
                </div>
              </div>
            </div>
          )}

          {!hasAnyMacros && diet.calories && (
            <div className="flex items-center gap-1.5 mt-2">
              <Flame className="w-3.5 h-3.5 text-white/40" />
              <span className="text-sm text-muted-foreground">{diet.calories} kcal / dia</span>
            </div>
          )}
        </div>

        {/* ── Meal cards ── */}
        <div className="px-4 space-y-3">
          {sortedMeals.map((meal) => {
            const mainFoods   = [...meal.diet_meal_foods].filter((f) => !f.parent_food_id).sort((a, b) => a.order_index - b.order_index);
            const isDone      = doneMeals.has(meal.id);
            const isToggling  = toggling === meal.id;
            const hasRecipe   = !!(meal.observacoes_receita || meal.modo_preparo);

            // Meal alternatives
            const mealAltList     = mealAlts[meal.id] ?? [];
            const hasAlts         = mealAltList.length > 0;
            const selAltId        = altSels[meal.id];
            const activeAlt       = selAltId ? mealAltList.find((a) => a.id === selAltId) ?? null : null;
            const showAltFoods    = !!activeAlt && activeAlt.foods !== null;
            const altFoodsLoading = !!activeAlt && activeAlt.foods === null;

            // Macros for this meal (main or alternative)
            const mealTotal     = showAltFoods ? sumAltFoodMacros(activeAlt!.foods!) : sumMacros(mainFoods);
            const hasMealMacros = mealTotal.kcal > 0;

            return (
              <div key={meal.id}
                className="rounded-2xl border overflow-hidden transition-colors duration-200"
                style={{
                  backgroundColor: isDone ? "rgba(var(--cp-rgb),0.05)" : "var(--surface-1)",
                  borderColor:     isDone ? "rgba(var(--cp-rgb),0.25)" : "var(--border-subtle)",
                }}
              >
                {/* ── Meal header ── */}
                <div className="border-b" style={{ borderColor: isDone ? "rgba(var(--cp-rgb),0.20)" : "var(--border-subtle)" }}>
                  <div className="flex items-center">
                    {/* Toggle + name row */}
                    <button onClick={() => toggleMeal(meal.id)} disabled={isToggling}
                      className="flex-1 px-4 py-3 flex items-center gap-3 text-left disabled:opacity-70 transition-colors active:bg-white/5">
                      <div className="shrink-0">
                        {isDone
                          ? <CheckCircle2 className={`w-5 h-5 text-green-500${justDone.has(meal.id) ? " animate-pop-in" : ""}`} />
                          : <Circle className="w-5 h-5" style={{ color: "var(--text-dim)" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-semibold text-sm break-words transition-colors"
                              style={{ color: isDone ? "var(--cp-400)" : FG }}>
                              {meal.name}
                            </p>
                            {hasRecipe && <BookOpen className="w-3 h-3 text-white/30 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasMealMacros && <span className="text-xs font-medium text-muted-foreground">{mealTotal.kcal} kcal</span>}
                            {meal.time_suggestion && (
                              <div className="flex items-center gap-1 text-white/30">
                                <Clock className="w-3 h-3" />
                                <span className="text-xs text-muted-foreground">{meal.time_suggestion}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {hasMealMacros && (
                            <div className="flex gap-2.5">
                              <span className="text-[10px] text-muted-foreground">P {mealTotal.prot}g</span>
                              <span className="text-[10px] text-muted-foreground">C {mealTotal.carb}g</span>
                              <span className="text-[10px] text-muted-foreground">G {mealTotal.gord}g</span>
                            </div>
                          )}
                          {activeAlt && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: "rgba(var(--cp-rgb), 0.15)", color: "var(--cp-400)" }}>
                              {activeAlt.nome}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {hasRecipe && (
                      <button onClick={() => setRecipeMeal(meal)}
                        className="px-3 py-3 flex items-center justify-center border-l self-stretch"
                        style={{ borderColor: isDone ? "rgba(var(--cp-rgb),0.15)" : "rgba(255,255,255,0.06)" }}
                        title="Ver receita">
                        <ChefHat className="w-4 h-4 text-white/25 hover:text-white/60 transition-colors" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Food list ── */}
                {altFoodsLoading ? (
                  <div className="py-5 flex justify-center">
                    <div className="w-4 h-4 rounded-full border-2 animate-spin"
                      style={{ borderColor: "rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.4)" }} />
                  </div>

                ) : showAltFoods ? (
                  /* Alternative foods */
                  <div className="py-2">
                    {activeAlt!.foods!.sort((a, b) => a.ordem - b.ordem).map((f, fi, arr) => {
                      const m    = calcAltFoodMacros(f);
                      const name = f.alimentos?.nome ?? f.nome_display;
                      const qty  = `${f.quantidade}${f.unidade}`;
                      return (
                        <div key={f.id} className={fi < arr.length - 1 ? "border-b" : ""} style={{ borderColor: "var(--border-subtle)" }}>
                          <div className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-sm font-medium break-words"
                                  style={{ color: isDone ? MUT : FG }}>
                                  {name}
                                </span>
                                <span className="text-[11px] text-muted-foreground shrink-0">{qty}</span>
                              </div>
                              {m && m.kcal > 0 && (
                                <div className="flex gap-2 mt-0.5">
                                  <span className="text-[10px] text-muted-foreground">{m.kcal} kcal</span>
                                  <span className="text-[10px] text-muted-foreground">P {m.prot}g</span>
                                  <span className="text-[10px] text-muted-foreground">C {m.carb}g</span>
                                  <span className="text-[10px] text-muted-foreground">G {m.gord}g</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                ) : (
                  /* Original foods with inline substitution support */
                  <div className="py-2">
                    {mainFoods.map((food, fi) => {
                      // Parent-food based subs (already in fetched data, just hidden)
                      const childSubs  = (childFoodsMap[food.id] ?? []).sort((a, b) => a.order_index - b.order_index);
                      // Group-based subs require substitution_group_id
                      // Also cover: lista_subst_grupo_id set directly on this food (edge case from DietManager)
                      const hasSubs    = !!food.substitution_group_id || childSubs.length > 0 || !!food.lista_subst_grupo_id;
                      const isExpanded = expandedFoodId === food.id;
                      const isLastFood = fi === mainFoods.length - 1;
                      const selectedSub = selections[food.id];

                      const groupId    = food.substitution_group_id;
                      const cachedSubs = groupId ? (subCache[groupId] ?? []) : [];
                      const selectedOpt = selectedSub ? cachedSubs.find((o) => o.id === selectedSub) ?? null : null;

                      const displayName   = selectedOpt ? (selectedOpt.alimentos?.nome ?? selectedOpt.nome) : (food.alimentos?.nome ?? food.name);
                      const displayQty    = selectedOpt
                        ? (selectedOpt.quantidade != null ? `${selectedOpt.quantidade}${selectedOpt.unidade ?? "g"}` : "")
                        : (food.quantidade != null ? `${food.quantidade}${food.unidade ?? "g"}` : food.portion ?? null);
                      const displayMacros = selectedOpt ? calcSubMacros(selectedOpt) : calcFoodMacros(food);

                      return (
                        <div key={food.id}
                          className={!isLastFood || isExpanded ? "border-b" : ""}
                          style={{ borderColor: "var(--border-subtle)" }}>

                          <button
                            onClick={() => hasSubs ? toggleFoodExpansion(food) : undefined}
                            disabled={!hasSubs}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                       hover:bg-white/5 active:bg-white/[0.07] disabled:cursor-default"
                            style={isExpanded ? { backgroundColor: "rgba(var(--cp-rgb), 0.05)" } : undefined}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-sm font-medium break-words transition-colors"
                                  style={{ color: isDone ? MUT : FG }}>
                                  {displayName}
                                </span>
                                {displayQty && (
                                  <span className="text-[11px] text-muted-foreground shrink-0">{displayQty}</span>
                                )}
                                {selectedSub && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                                    style={{ backgroundColor: "rgba(var(--cp-rgb), 0.12)", color: "var(--cp-400)" }}>
                                    trocado
                                  </span>
                                )}
                              </div>
                              {displayMacros && displayMacros.kcal > 0 && (
                                <div className="flex gap-2 mt-0.5">
                                  <span className="text-[10px] text-muted-foreground">{displayMacros.kcal} kcal</span>
                                  <span className="text-[10px] text-muted-foreground">P {displayMacros.prot}g</span>
                                  <span className="text-[10px] text-muted-foreground">C {displayMacros.carb}g</span>
                                  <span className="text-[10px] text-muted-foreground">G {displayMacros.gord}g</span>
                                </div>
                              )}
                            </div>

                            {hasSubs && (
                              <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform duration-250"
                                style={{
                                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                  color: isExpanded ? "var(--cp-400)" : selectedSub ? "var(--cp-500)" : MUT,
                                }} />
                            )}
                          </button>

                          {/* Inline substitution panel */}
                          <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 200ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
                            <div style={{ overflow: "hidden" }}>
                              {/* 1. Parent-food based subs (read-only list, includes lista refs added as children) */}
                              {childSubs.length > 0 && (
                                <ChildSubsList
                                  foods={childSubs}
                                  onListaRef={openListaSheet}
                                />
                              )}

                              {/* 1b. lista_subst_grupo_id set directly on this food (not covered by childSubs) */}
                              {food.lista_subst_grupo_id && !childSubs.some(c => c.lista_subst_grupo_id) && (
                                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                  <div
                                    className="mx-3 my-3"
                                    style={{ paddingLeft: "10px", borderLeft: "2px solid rgba(var(--cp-rgb), 0.2)" }}
                                  >
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Shuffle className="w-3 h-3 shrink-0" style={{ color: "var(--cp-400)", opacity: 0.65 }} />
                                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--cp-400)", opacity: 0.65 }}>
                                        Pode substituir por
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <button
                                        onClick={() => openListaSheet(food.lista_subst_grupo_id!, food.lista_subst_porcoes ?? 1)}
                                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors active:scale-[0.98]"
                                        style={{ backgroundColor: "rgba(var(--cp-rgb), 0.06)", border: "1px solid rgba(var(--cp-rgb), 0.18)" }}
                                      >
                                        <ListOrdered className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--cp-400)" }} />
                                        <div className="flex-1 min-w-0">
                                          <span className="text-sm font-medium" style={{ color: "var(--cp-300)" }}>
                                            {(food.lista_subst_porcoes ?? 1) === 1 ? "1 porção" : `${food.lista_subst_porcoes} porções`} da lista de substituição
                                          </span>
                                          <p className="text-[10px] mt-0.5" style={{ color: "var(--cp-400)", opacity: 0.7 }}>
                                            Toque para ver as opções disponíveis
                                          </p>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--cp-400)", opacity: 0.55 }} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 2. Group-based subs (interactive — save today's selection) */}
                              {groupId && (
                                <InlineSubstitutions
                                  food={food}
                                  options={subCache[groupId] ?? []}
                                  loading={subLoadingId === food.id}
                                  selectedId={selectedSub ?? null}
                                  onSelect={selectSubstitutionInline}
                                  onReset={resetSubstitutionInline}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Meal notes */}
                {meal.notes && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-muted-foreground italic border-t border-white/5 pt-2">{meal.notes}</p>
                  </div>
                )}

                {/* Alternatives button */}
                {hasAlts && (
                  <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "10px" }}>
                    <button
                      onClick={() => openAltSheet(meal)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
                      style={{
                        backgroundColor: activeAlt ? "rgba(var(--cp-rgb), 0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${activeAlt ? "rgba(var(--cp-rgb), 0.2)" : "rgba(255,255,255,0.07)"}`,
                      }}
                    >
                      <Shuffle className="w-3.5 h-3.5 shrink-0"
                        style={{ color: activeAlt ? "var(--cp-500)" : MUT }} />
                      <span className="flex-1 text-xs font-medium text-left truncate"
                        style={{ color: activeAlt ? "var(--cp-400)" : MUT }}>
                        {activeAlt
                          ? activeAlt.nome
                          : mealAltList.length === 1 ? "1 versão alternativa disponível" : `${mealAltList.length} versões alternativas`}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0"
                        style={{ color: activeAlt ? "var(--cp-500)" : MUT }} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* All meals done */}
        {allDone && totalMeals > 0 && (
          <div className="mx-4 mt-4 rounded-2xl p-4 flex items-center gap-3"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", border: "1px solid rgba(var(--cp-rgb),0.2)" }}>
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-500">Parabéns! 🎉</p>
              <p className="text-xs text-muted-foreground">Você completou todas as refeições de hoje.</p>
            </div>
          </div>
        )}

        {/* Suplementação */}
        {suplementos.length > 0 && (
          <div className="mx-4 mt-5">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Suplementação</p>
            </div>
            <div className="space-y-2">
              {suplementos.map((s) => (
                <div key={s.id} className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: FG }}>{s.nome}</span>
                    {s.dosagem && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" }}>
                        {s.dosagem}
                      </span>
                    )}
                  </div>
                  {s.instrucao && (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: MUT }}>{s.instrucao}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Dieta;
