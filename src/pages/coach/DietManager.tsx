import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, Check, Pencil, FileUp,
  Search, X, Clock, Copy, ChevronUp, ChevronDown, RefreshCw, Shuffle,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alimento {
  id: string;
  nome: string;
  source?: string | null;
  porcao_descricao: string | null;
  porcao_gramas: number | null;
  kcal: number | null;
  proteina_g: number | null;
  carb_g: number | null;
  gordura_g: number | null;
  fibra_g: number | null;
  sodio_mg: number | null;
}



interface FoodRow {
  _key: string;
  alimento_id: string | null;
  alimento: Alimento | null;
  nome_display: string;
  quantidade: string;
  unidade: string;
  order_index: number;
  substitution_group_id: string | null;
  parent_key: string | null; // null = alimento principal; string = _key do pai (é substituto)
}

interface MealRow {
  _key: string;
  dbId?: string; // DB id once saved (diet_meals.id)
  name: string;
  time_suggestion: string;
  notes: string;
  observacoes_receita: string;
  modo_preparo: string;
  order_index: number;
  foods: FoodRow[];
}

interface DietForm {
  title: string;
  meals: MealRow[];
}

// ─── Alternative types ────────────────────────────────────────────────────────

interface AltFoodData {
  _key: string;
  alimento_id: string | null;
  alimento: Alimento | null;
  nome_display: string;
  quantidade: string;
  unidade: string;
  order_index: number;
  substitution_group_id: null;
  parent_key: null;
}

interface AltEntry {
  _key: string;
  dbId?: string;
  nome: string;
  foods: AltFoodData[];
}

interface ActiveDietFood {
  id: string;
  name: string;
  portion: string | null;
  order_index: number;
  quantidade: number | null;
  unidade: string | null;
  alimento_id: string | null;
  alimentos: Alimento | null;
  substitution_group_id: string | null;
  parent_food_id: string | null;
}

interface ActiveDiet {
  id: string;
  title: string;
  calories: number | null;
  is_active: boolean;
  diet_meals: {
    id: string;
    name: string;
    time_suggestion: string | null;
    order_index: number;
    notes: string | null;
    observacoes_receita: string | null;
    modo_preparo: string | null;
    diet_meal_foods: ActiveDietFood[];
  }[];
}

interface DietManagerProps {
  studentId: string;
  studentUserId: string;
  orgId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();

const emptyFood = (order = 0, parent_key: string | null = null): FoodRow => ({
  _key: uid(), alimento_id: null, alimento: null,
  nome_display: "", quantidade: "100", unidade: "g", order_index: order,
  substitution_group_id: null, parent_key,
});
const emptyMeal = (order = 0): MealRow => ({
  _key: uid(), name: "", time_suggestion: "", notes: "",
  observacoes_receita: "", modo_preparo: "",
  order_index: order, foods: [emptyFood()],
});
const emptyForm = (): DietForm => ({ title: "", meals: [emptyMeal()] });

interface Macros { kcal: number; prot: number; carb: number; gord: number; fibra: number }
const ZERO: Macros = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0 };

const calcFoodMacros = (food: FoodRow): Macros => {
  if (!food.alimento || !food.alimento.porcao_gramas) return ZERO;
  const r = (parseFloat(food.quantidade) || 0) / food.alimento.porcao_gramas;
  return {
    kcal:  Math.round((food.alimento.kcal ?? 0) * r),
    prot:  Math.round((food.alimento.proteina_g ?? 0) * r * 10) / 10,
    carb:  Math.round((food.alimento.carb_g ?? 0) * r * 10) / 10,
    gord:  Math.round((food.alimento.gordura_g ?? 0) * r * 10) / 10,
    fibra: Math.round((food.alimento.fibra_g ?? 0) * r * 10) / 10,
  };
};

// Avoid floating-point display issues when summing e.g. 7.1 + 7.1 = 14.199999…
const round1 = (v: number) => Math.round(v * 10) / 10;

const mealMacros = (meal: MealRow): Macros => {
  // Only sum main foods (substitutes are alternatives, not additive)
  const s = meal.foods.filter((f) => !f.parent_key).reduce((a, f) => {
    const m = calcFoodMacros(f);
    return { kcal: a.kcal+m.kcal, prot: a.prot+m.prot, carb: a.carb+m.carb, gord: a.gord+m.gord, fibra: a.fibra+m.fibra };
  }, ZERO);
  return { kcal: s.kcal, prot: round1(s.prot), carb: round1(s.carb), gord: round1(s.gord), fibra: round1(s.fibra) };
};

const totalMacros = (meals: MealRow[]): Macros => {
  const s = meals.reduce((a, m) => {
    const mm = mealMacros(m);
    return { kcal: a.kcal+mm.kcal, prot: a.prot+mm.prot, carb: a.carb+mm.carb, gord: a.gord+mm.gord, fibra: a.fibra+mm.fibra };
  }, ZERO);
  return { kcal: s.kcal, prot: round1(s.prot), carb: round1(s.carb), gord: round1(s.gord), fibra: round1(s.fibra) };
};

const getFoodName = (food: Pick<FoodRow, "alimento" | "nome_display">) =>
  food.alimento?.nome ?? food.nome_display;

const getFoodAmount = (food: Pick<FoodRow, "quantidade" | "unidade">) =>
  food.quantidade ? `${food.quantidade}${food.unidade || "g"}` : "";

const ACTIVE_DIET_SELECT = `id, title, calories, is_active,
  diet_meals (
    id, name, time_suggestion, order_index, notes, observacoes_receita, modo_preparo,
    diet_meal_foods (
      id, name, portion, order_index, quantidade, unidade, alimento_id, parent_food_id,
      alimentos ( id, nome, porcao_descricao, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g )
    )
  )`;

const emptyAltFood = (order = 0): AltFoodData => ({
  _key: uid(), alimento_id: null, alimento: null,
  nome_display: "", quantidade: "100", unidade: "g",
  order_index: order, substitution_group_id: null, parent_key: null,
});

const calcAltFoodMacros = (food: AltFoodData): Macros => {
  if (!food.alimento || !food.alimento.porcao_gramas) return ZERO;
  const r = (parseFloat(food.quantidade) || 0) / food.alimento.porcao_gramas;
  return {
    kcal:  Math.round((food.alimento.kcal ?? 0) * r),
    prot:  Math.round((food.alimento.proteina_g ?? 0) * r * 10) / 10,
    carb:  Math.round((food.alimento.carb_g ?? 0) * r * 10) / 10,
    gord:  Math.round((food.alimento.gordura_g ?? 0) * r * 10) / 10,
    fibra: Math.round((food.alimento.fibra_g ?? 0) * r * 10) / 10,
  };
};

const sumAltMacros = (foods: AltFoodData[]): Macros =>
  foods.reduce((acc, f) => {
    const m = calcAltFoodMacros(f);
    return { kcal: acc.kcal + m.kcal, prot: round1(acc.prot + m.prot), carb: round1(acc.carb + m.carb), gord: round1(acc.gord + m.gord), fibra: round1(acc.fibra + m.fibra) };
  }, ZERO);

// ─── FoodSearchInput ──────────────────────────────────────────────────────────

interface FoodSearchInputProps {
  food: FoodRow;
  orgId: string | null;
  onSelect: (a: Alimento) => void;
  onNameChange: (n: string) => void;
  onClear: () => void;
  onAddNew: (n: string) => void;
}

const FoodSearchInput = ({ food, orgId, onSelect, onNameChange, onClear, onAddNew }: FoodSearchInputProps) => {
  const [results, setResults] = useState<Alimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("alimentos")
          .select("id, nome, porcao_descricao, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g, sodio_mg")
          .ilike("nome", `%${query.trim()}%`)
          .eq("status", "aprovado")
          .limit(10);
        if (orgId) q = q.or(`org_id.is.null,org_id.eq.${orgId}`);
        else q = q.is("org_id", null);
        const { data } = await q;
        setResults((data as Alimento[]) ?? []);
        setOpen(true);
      } finally { setLoading(false); }
    }, 250);
  }, [orgId]);

  const isSelected = !!food.alimento_id;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div className="relative">
        {!isSelected && (
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
        )}
        <Input
          value={food.nome_display}
          onChange={(e) => { onNameChange(e.target.value); search(e.target.value); }}
          onFocus={() => { if (food.nome_display.trim().length >= 2) search(food.nome_display); }}
          placeholder="Buscar alimento..."
          className={`bg-white/5 border-white/10 text-white text-xs rounded-md h-8 placeholder:text-white/20 focus:border-green-600/40 ${isSelected ? "pl-2.5 pr-6" : "pl-7 pr-6"}`}
        />
        {isSelected && (
          <button type="button" onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-[200] top-full mt-1 left-0 bg-zinc-950 border border-white/12 rounded-xl shadow-2xl overflow-hidden"
          style={{ width: "420px", maxWidth: "calc(100vw - 2rem)" }}>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-white/40 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Buscando...
            </div>
          )}

          {/* Sem resultados */}
          {!loading && results.length === 0 && (
            <div className="px-4 py-4">
              <p className="text-sm text-white/50 mb-3">
                Nenhum resultado para <span className="text-white/70 font-medium">"{food.nome_display}"</span>
              </p>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); onAddNew(food.nome_display); setOpen(false); }}
                className="flex items-center gap-2 text-sm text-green-500 hover:text-green-400 transition-colors font-medium">
                <Plus className="w-4 h-4" />
                Criar "{food.nome_display}" no banco de alimentos
              </button>
            </div>
          )}

          {/* Resultados */}
          {!loading && results.length > 0 && (
            <div className="overflow-y-auto" style={{ minHeight: "250px", maxHeight: "400px", scrollBehavior: "smooth" }}>
              {results.map((a) => (
                <button key={a.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onSelect(a); setOpen(false); }}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group">

                  {/* Nome + badge de fonte */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium group-hover:text-green-300 transition-colors leading-tight">
                      {a.nome}
                    </p>
                    {a.source && (
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider"
                        style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "rgb(251,191,36)", border: "1px solid rgba(251,191,36,0.25)" }}>
                        {a.source}
                      </span>
                    )}
                  </div>

                  {/* Macros + porção */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-white/35">{a.porcao_descricao ?? "100g"}</span>
                    <span className="w-px h-3 bg-white/10 shrink-0" />
                    {a.kcal != null && (
                      <span className="text-[11px] font-semibold text-green-500">{Math.round(a.kcal)} kcal</span>
                    )}
                    {a.carb_g != null && (
                      <span className="text-[11px] font-medium">
                        <span className="text-white/35">C </span>
                        <span className="text-orange-400">{a.carb_g}g</span>
                      </span>
                    )}
                    {a.proteina_g != null && (
                      <span className="text-[11px] font-medium">
                        <span className="text-white/35">P </span>
                        <span className="text-red-400">{a.proteina_g}g</span>
                      </span>
                    )}
                    {a.gordura_g != null && (
                      <span className="text-[11px] font-medium">
                        <span className="text-white/35">G </span>
                        <span className="text-blue-400">{a.gordura_g}g</span>
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Footer — criar novo */}
          {!loading && results.length > 0 && (
            <div className="px-4 py-2.5 border-t border-white/6">
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); onAddNew(food.nome_display); setOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-green-500 transition-colors">
                <Plus className="w-3 h-3" />
                Não encontrou? Criar alimento personalizado
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── NovoAlimentoModal ────────────────────────────────────────────────────────

interface NovoAlimentoModalProps {
  open: boolean; nomeInicial: string; orgId: string | null;
  onClose: () => void; onCreated: (a: Alimento) => void;
}

const NovoAlimentoModal = ({ open, nomeInicial, orgId, onClose, onCreated }: NovoAlimentoModalProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: nomeInicial, porcao_gramas: "100", kcal: "", proteina_g: "", carb_g: "", gordura_g: "", fibra_g: "", sodio_mg: "" });

  useEffect(() => { if (open) setForm((f) => ({ ...f, nome: nomeInicial })); }, [open, nomeInicial]);

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!orgId) { toast({ title: "Org não encontrada", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("alimentos").insert({
        nome: form.nome.trim(), porcao_descricao: `${form.porcao_gramas || 100}g`,
        porcao_gramas: parseFloat(form.porcao_gramas) || 100,
        kcal: form.kcal ? parseFloat(form.kcal) : null,
        proteina_g: form.proteina_g ? parseFloat(form.proteina_g) : null,
        carb_g: form.carb_g ? parseFloat(form.carb_g) : null,
        gordura_g: form.gordura_g ? parseFloat(form.gordura_g) : null,
        fibra_g: form.fibra_g ? parseFloat(form.fibra_g) : null,
        sodio_mg: form.sodio_mg ? parseFloat(form.sodio_mg) : null,
        fonte: "org", org_id: orgId, status: "pendente",
      }).select("id, nome, porcao_descricao, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g, sodio_mg").single();
      if (error) throw error;
      toast({ title: "Alimento criado!", description: "Disponível para sua organização." });
      onCreated(data as Alimento);
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao criar alimento", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const F = (label: string, key: keyof typeof form, unit?: string) => (
    <div className="space-y-1">
      <Label className="text-[10px] text-white/60 uppercase tracking-wider">{label}</Label>
      <div className="relative">
        <Input type={key === "nome" ? "text" : "number"} value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={key === "nome" ? "Nome" : "0"}
          className="bg-white/5 border-white/10 text-white text-sm rounded-md h-9 placeholder:text-white/20" />
        {unit && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30">{unit}</span>}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white rounded-xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-sm font-semibold">Novo Alimento</DialogTitle>
          <p className="text-xs text-white/40">Ficará disponível para sua organização (pendente revisão global).</p>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          {F("Nome", "nome")}
          {F("Porção base", "porcao_gramas", "g")}
          <div className="grid grid-cols-2 gap-2">
            {F("Kcal", "kcal", "kcal")} {F("Proteína", "proteina_g", "g")}
            {F("Carboidratos", "carb_g", "g")} {F("Gorduras", "gordura_g", "g")}
            {F("Fibras", "fibra_g", "g")} {F("Sódio", "sodio_mg", "mg")}
          </div>
          <Button onClick={handleSave} disabled={saving}
            className="w-full h-9 rounded-md text-white font-semibold"
            style={{ background: "var(--cp-gradient)" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar alimento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── MealEditModal ────────────────────────────────────────────────────────────

interface MealEditModalProps {
  open: boolean;
  meal: MealRow;
  orgId: string | null;
  onClose: () => void;
  onSave: (updated: MealRow) => void;
  onAlternatives?: () => void;
}

const MealEditModal = ({ open, meal, orgId, onClose, onSave, onAlternatives }: MealEditModalProps) => {
  const [localMeal, setLocalMeal] = useState<MealRow>({ ...meal, foods: meal.foods.map((f) => ({ ...f })), observacoes_receita: meal.observacoes_receita ?? "", modo_preparo: meal.modo_preparo ?? "" });
  const [newAlimentoModal, setNewAlimentoModal] = useState<{ open: boolean; nome: string; foodKey: string }>({ open: false, nome: "", foodKey: "" });

  // Sync when meal prop changes
  useEffect(() => {
    if (open) setLocalMeal({ ...meal, foods: meal.foods.map((f) => ({ ...f })) });
  }, [open, meal._key]);

  const updateFood = (fkey: string, patch: Partial<FoodRow>) =>
    setLocalMeal((m) => ({ ...m, foods: m.foods.map((f) => f._key === fkey ? { ...f, ...patch } : f) }));

  const addFood = () =>
    setLocalMeal((m) => ({ ...m, foods: [...m.foods, emptyFood(m.foods.length, null)] }));

  const addSubstitute = (parentKey: string) =>
    setLocalMeal((m) => ({ ...m, foods: [...m.foods, emptyFood(m.foods.length, parentKey)] }));

  const removeFood = (fkey: string) =>
    // Also remove any substitutes that reference this food
    setLocalMeal((m) => ({ ...m, foods: m.foods.filter((f) => f._key !== fkey && f.parent_key !== fkey) }));

  const moveFoodUp = (fkey: string) =>
    setLocalMeal((m) => {
      const mainFoods = m.foods.filter((f) => !f.parent_key);
      const idx = mainFoods.findIndex((f) => f._key === fkey);
      if (idx <= 0) return m;
      // Swap the two main foods (and their subs) in the foods array
      const aKey = mainFoods[idx - 1]._key;
      const bKey = mainFoods[idx]._key;
      const aGroup = m.foods.filter((f) => f._key === aKey || f.parent_key === aKey);
      const bGroup = m.foods.filter((f) => f._key === bKey || f.parent_key === bKey);
      const rest   = m.foods.filter((f) => f._key !== aKey && f.parent_key !== aKey && f._key !== bKey && f.parent_key !== bKey);
      // Find insertion point
      const aIdx = m.foods.findIndex((f) => f._key === aKey);
      const foods = [...m.foods];
      // Rebuild: before a, then b group, then a group, then rest after b
      const newFoods: FoodRow[] = [];
      let i = 0;
      while (i < foods.length && foods[i]._key !== aKey && foods[i].parent_key !== aKey) { newFoods.push(foods[i]); i++; }
      newFoods.push(...bGroup, ...aGroup);
      i += aGroup.length + bGroup.length;
      while (i < foods.length) { newFoods.push(foods[i]); i++; }
      return { ...m, foods: newFoods };
    });

  const moveFoodDown = (fkey: string) =>
    setLocalMeal((m) => {
      const mainFoods = m.foods.filter((f) => !f.parent_key);
      const idx = mainFoods.findIndex((f) => f._key === fkey);
      if (idx >= mainFoods.length - 1) return m;
      const aKey = mainFoods[idx]._key;
      const bKey = mainFoods[idx + 1]._key;
      const aGroup = m.foods.filter((f) => f._key === aKey || f.parent_key === aKey);
      const bGroup = m.foods.filter((f) => f._key === bKey || f.parent_key === bKey);
      const foods = [...m.foods];
      const newFoods: FoodRow[] = [];
      let i = 0;
      while (i < foods.length && foods[i]._key !== aKey && foods[i].parent_key !== aKey) { newFoods.push(foods[i]); i++; }
      newFoods.push(...bGroup, ...aGroup);
      i += aGroup.length + bGroup.length;
      while (i < foods.length) { newFoods.push(foods[i]); i++; }
      return { ...m, foods: newFoods };
    });

  const totals = mealMacros(localMeal);
  const mainFoodsCount = localMeal.foods.filter((f) => !f.parent_key).length;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        {/* [&>button]:hidden esconde o X padrão do DialogContent para não colidir com nosso header */}
        <DialogContent className="bg-zinc-950 border-white/10 text-white rounded-xl max-w-[700px] w-full p-0 overflow-hidden [&>button]:hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-3">
              {/* Nome da refeição */}
              <Input value={localMeal.name}
                onChange={(e) => setLocalMeal((m) => ({ ...m, name: e.target.value }))}
                placeholder="Nome da refeição"
                className="bg-transparent border-0 text-white text-base font-semibold p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-white/30 flex-1" />

              {/* Horário */}
              <div className="flex items-center gap-1.5 text-white/50 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <Input value={localMeal.time_suggestion}
                  onChange={(e) => setLocalMeal((m) => ({ ...m, time_suggestion: e.target.value }))}
                  placeholder="00:00"
                  className="bg-white/5 border-white/10 text-white/70 text-xs rounded-md h-7 w-16 text-center placeholder:text-white/25 focus:border-green-600/40" />
              </div>

              {/* Botão fechar explícito */}
              <DialogClose asChild>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/8 transition-colors shrink-0 ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogClose>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Action buttons */}
            <div className="flex gap-2">
              <Button type="button" onClick={addFood} size="sm"
                className="rounded-md h-8 px-3 text-white font-semibold text-xs"
                style={{ background: "var(--cp-gradient)" }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Adicionar Alimento
              </Button>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setNewAlimentoModal({ open: true, nome: "", foodKey: "" })}
                className="rounded-md h-8 px-3 text-xs border-white/15 text-white/60 hover:text-white hover:bg-white/5 bg-transparent">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Criar Novo Alimento
              </Button>
            </div>

            {/* Foods list — agrupado por alimento principal + substitutos */}
            <div className="rounded-lg border border-white/8 overflow-visible">

              {/* Column header */}
              <div className="flex items-center gap-1 bg-white/4 border-b border-white/8 px-2 py-1.5 text-[10px] text-white/50 uppercase tracking-wider font-medium">
                <span className="w-5 shrink-0" />
                <span className="flex-1">Alimento</span>
                <span className="w-14 text-center shrink-0">QTD</span>
                <span className="w-10 text-center shrink-0">UND</span>
                <span className="w-10 text-center shrink-0">C</span>
                <span className="w-10 text-center shrink-0">P</span>
                <span className="w-10 text-center shrink-0">G</span>
                <span className="w-12 text-center shrink-0">KCAL</span>
                <span className="w-5 shrink-0" />
              </div>

              {localMeal.foods.filter((f) => !f.parent_key).map((food, fi) => {
                const mainMacros = calcFoodMacros(food);
                const subs = localMeal.foods.filter((f) => f.parent_key === food._key);
                const mainFoods = localMeal.foods.filter((f) => !f.parent_key);

                return (
                  <div key={food._key} className="border-b border-white/5 last:border-0">
                    {/* ── Main food row ── */}
                    <div className="flex items-center gap-1 px-2 py-1 hover:bg-white/3 transition-colors group">
                      {/* Reorder arrows */}
                      <div className="flex flex-col items-center shrink-0 w-5">
                        <button type="button" onClick={() => moveFoodUp(food._key)}
                          disabled={fi === 0}
                          className="text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors p-px">
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button type="button" onClick={() => moveFoodDown(food._key)}
                          disabled={fi === mainFoods.length - 1}
                          className="text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors p-px">
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* Food search */}
                      <div className="flex-1 min-w-0">
                        <FoodSearchInput food={food} orgId={orgId}
                          onSelect={(a) => updateFood(food._key, { alimento_id: a.id, alimento: a, nome_display: a.nome, quantidade: a.porcao_gramas?.toString() ?? "100", unidade: "g" })}
                          onNameChange={(n) => updateFood(food._key, { nome_display: n, alimento_id: null, alimento: null })}
                          onClear={() => updateFood(food._key, { alimento_id: null, alimento: null })}
                          onAddNew={(nome) => setNewAlimentoModal({ open: true, nome, foodKey: food._key })}
                        />
                      </div>

                      {/* Quantity */}
                      <Input type="number" value={food.quantidade}
                        onChange={(e) => updateFood(food._key, { quantidade: e.target.value })}
                        className="w-14 bg-white/5 border-white/10 text-white text-xs rounded-md h-8 text-center placeholder:text-white/20 focus:border-green-600/40 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />

                      {/* Unit */}
                      <select value={food.unidade}
                        onChange={(e) => updateFood(food._key, { unidade: e.target.value })}
                        className="w-10 h-8 bg-zinc-900 border border-white/10 text-white/60 text-xs rounded-md px-1 focus:outline-none focus:border-green-600/40 shrink-0">
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="un">un</option>
                      </select>

                      {/* Macros */}
                      <span className="w-10 text-center text-xs text-white/50 shrink-0">{mainMacros.carb > 0 ? `${mainMacros.carb}g` : <span className="text-white/20">—</span>}</span>
                      <span className="w-10 text-center text-xs text-white/50 shrink-0">{mainMacros.prot > 0 ? `${mainMacros.prot}g` : <span className="text-white/20">—</span>}</span>
                      <span className="w-10 text-center text-xs text-white/50 shrink-0">{mainMacros.gord > 0 ? `${mainMacros.gord}g` : <span className="text-white/20">—</span>}</span>
                      <span className="w-12 text-center text-xs font-medium text-white/65 shrink-0">{mainMacros.kcal > 0 ? mainMacros.kcal : <span className="text-white/20 font-normal">—</span>}</span>

                      {/* Delete */}
                      <button type="button" onClick={() => removeFood(food._key)}
                        disabled={mainFoodsCount === 1 && subs.length === 0}
                        className="w-5 text-white/20 hover:text-red-400 disabled:opacity-20 transition-colors shrink-0 flex justify-center">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* ── Substitute rows ── */}
                    {subs.map((sub) => {
                      const subMacros = calcFoodMacros(sub);
                      const diffKcal = mainMacros.kcal > 0 && subMacros.kcal > 0 ? subMacros.kcal - mainMacros.kcal : null;
                      const diffProt = mainMacros.prot > 0 && subMacros.prot > 0 ? Math.round((subMacros.prot - mainMacros.prot) * 10) / 10 : null;
                      return (
                        <div key={sub._key} className="flex items-center gap-1 px-2 py-1 bg-white/2 border-t border-white/4 ml-5 border-l-2 border-l-white/8">
                          {/* Sub indicator */}
                          <div className="w-5 flex items-center justify-center shrink-0">
                            <span className="text-[10px] text-white/20 font-bold">↕</span>
                          </div>

                          {/* Food search */}
                          <div className="flex-1 min-w-0">
                            <FoodSearchInput food={sub} orgId={orgId}
                              onSelect={(a) => updateFood(sub._key, { alimento_id: a.id, alimento: a, nome_display: a.nome, quantidade: a.porcao_gramas?.toString() ?? "100", unidade: "g" })}
                              onNameChange={(n) => updateFood(sub._key, { nome_display: n, alimento_id: null, alimento: null })}
                              onClear={() => updateFood(sub._key, { alimento_id: null, alimento: null })}
                              onAddNew={(nome) => setNewAlimentoModal({ open: true, nome, foodKey: sub._key })}
                            />
                          </div>

                          {/* Quantity */}
                          <Input type="number" value={sub.quantidade}
                            onChange={(e) => updateFood(sub._key, { quantidade: e.target.value })}
                            className="w-14 bg-white/5 border-white/10 text-white text-xs rounded-md h-8 text-center placeholder:text-white/20 focus:border-green-600/40 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />

                          {/* Unit */}
                          <select value={sub.unidade}
                            onChange={(e) => updateFood(sub._key, { unidade: e.target.value })}
                            className="w-10 h-8 bg-zinc-900 border border-white/10 text-white/60 text-xs rounded-md px-1 focus:outline-none focus:border-green-600/40 shrink-0">
                            <option value="g">g</option>
                            <option value="ml">ml</option>
                            <option value="un">un</option>
                          </select>

                          {/* Macros */}
                          <span className="w-10 text-center text-xs text-white/40 shrink-0">{subMacros.carb > 0 ? `${subMacros.carb}g` : <span className="text-white/15">—</span>}</span>
                          <span className="w-10 text-center text-xs text-white/40 shrink-0">{subMacros.prot > 0 ? `${subMacros.prot}g` : <span className="text-white/15">—</span>}</span>
                          <span className="w-10 text-center text-xs text-white/40 shrink-0">{subMacros.gord > 0 ? `${subMacros.gord}g` : <span className="text-white/15">—</span>}</span>

                          {/* Kcal + diff badge */}
                          <div className="w-12 flex flex-col items-center shrink-0">
                            <span className="text-xs font-medium text-white/55">{subMacros.kcal > 0 ? subMacros.kcal : <span className="text-white/15">—</span>}</span>
                            {diffKcal !== null && (
                              <span className={`text-[9px] font-bold leading-tight ${diffKcal < 0 ? "text-green-500" : diffKcal > 0 ? "text-red-400" : "text-white/30"}`}>
                                {diffKcal > 0 ? "+" : ""}{diffKcal}
                              </span>
                            )}
                          </div>

                          {/* Remove sub */}
                          <button type="button" onClick={() => removeFood(sub._key)}
                            className="w-5 text-white/20 hover:text-red-400 transition-colors shrink-0 flex justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}

                    {/* ── Add substitute button ── */}
                    <button type="button" onClick={() => addSubstitute(food._key)}
                      className="w-full flex items-center gap-1 pl-7 py-1 text-[11px] text-white/20 hover:text-white/50 transition-colors border-t border-white/4">
                      <Plus className="w-3 h-3" />
                      Adicionar substituto
                    </button>
                  </div>
                );
              })}

              {/* Totals row */}
              <div className="flex items-center gap-1 bg-white/4 border-t border-white/8 px-2 py-2">
                <span className="w-5 shrink-0" />
                <span className="flex-1 text-xs text-white/40 font-medium">Totais da refeição</span>
                <span className="w-14 shrink-0" />
                <span className="w-10 shrink-0" />
                <span className="w-10 text-center text-xs font-semibold text-white/55 shrink-0">{totals.carb > 0 ? `${totals.carb}g` : "—"}</span>
                <span className="w-10 text-center text-xs font-semibold text-white/55 shrink-0">{totals.prot > 0 ? `${totals.prot}g` : "—"}</span>
                <span className="w-10 text-center text-xs font-semibold text-white/55 shrink-0">{totals.gord > 0 ? `${totals.gord}g` : "—"}</span>
                <span className="w-12 text-center text-xs font-bold text-white/75 shrink-0">{totals.kcal > 0 ? totals.kcal : "—"}</span>
                <span className="w-5 shrink-0" />
              </div>
            </div>

            {/* ── Refeições Alternativas (só aparece quando a dieta já existe no banco) ── */}
            {meal.dbId && (
              <button type="button"
                onClick={() => { onSave(localMeal); onClose(); onAlternatives?.(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-amber-500/25 text-amber-500/60 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors text-sm font-medium">
                <Shuffle className="w-4 h-4" />
                + Adicionar refeição alternativa
              </button>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-white/60 uppercase tracking-wider">Observações da Refeição</Label>
              <Textarea value={localMeal.notes}
                onChange={(e) => setLocalMeal((m) => ({ ...m, notes: e.target.value }))}
                placeholder="Dicas rápidas para o aluno (ex: preferir grelhado)..."
                rows={2}
                className="bg-white/5 border-white/10 text-white text-sm rounded-md placeholder:text-white/20 resize-none focus:border-green-600/40" />
            </div>

            {/* Receita */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-white/60 uppercase tracking-wider">Observações da Receita</Label>
                <Textarea value={localMeal.observacoes_receita}
                  onChange={(e) => setLocalMeal((m) => ({ ...m, observacoes_receita: e.target.value }))}
                  placeholder="Ingredientes extras, dicas de preparo, substituições sugeridas..."
                  rows={4}
                  className="bg-white/5 border-white/10 text-white text-sm rounded-md placeholder:text-white/20 resize-none focus:border-green-600/40" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-white/60 uppercase tracking-wider">Modo de Preparo</Label>
                <Textarea value={localMeal.modo_preparo}
                  onChange={(e) => setLocalMeal((m) => ({ ...m, modo_preparo: e.target.value }))}
                  placeholder="Passo a passo do preparo..."
                  rows={4}
                  className="bg-white/5 border-white/10 text-white text-sm rounded-md placeholder:text-white/20 resize-none focus:border-green-600/40" />
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="px-5 py-3 border-t border-white/8 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}
              className="h-9 px-4 rounded-md text-white/50 hover:text-white hover:bg-white/5 text-sm">
              Cancelar
            </Button>
            <Button onClick={() => { onSave(localMeal); onClose(); }}
              className="h-9 px-5 rounded-md text-white font-semibold text-sm"
              style={{ background: "var(--cp-gradient)" }}>
              <Check className="w-4 h-4 mr-1.5" />Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NovoAlimentoModal
        open={newAlimentoModal.open}
        nomeInicial={newAlimentoModal.nome}
        orgId={orgId}
        onClose={() => setNewAlimentoModal((m) => ({ ...m, open: false }))}
        onCreated={(alimento) => {
          if (newAlimentoModal.foodKey) {
            updateFood(newAlimentoModal.foodKey, {
              alimento_id: alimento.id, alimento,
              nome_display: alimento.nome,
              quantidade: alimento.porcao_gramas?.toString() ?? "100",
              unidade: "g",
            });
          }
        }}
      />
    </>
  );
};

// ─── AlternativesModal ────────────────────────────────────────────────────────

const MAX_ALTS = 3;

interface AlternativesModalProps {
  open: boolean;
  mealDbId: string;
  mealName: string;
  mainMacros: Macros;
  orgId: string | null;
  onClose: () => void;
}

const AlternativesModal = ({ open, mealDbId, mealName, mainMacros, orgId, onClose }: AlternativesModalProps) => {
  const { toast } = useToast();
  const [alts, setAlts] = useState<AltEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Carrega alternativas existentes ao abrir
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("meal_alternatives")
          .select(`id, nome, ordem,
            meal_alternative_foods (
              id, alimento_id, nome_display, quantidade, unidade, ordem,
              alimentos:alimento_id ( id, nome, porcao_descricao, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g, sodio_mg )
            )`)
          .eq("meal_id", mealDbId)
          .order("ordem");
        if (error) throw error;
        const loaded: AltEntry[] = (data ?? []).map((alt: any) => ({
          _key: uid(),
          dbId: alt.id,
          nome: alt.nome,
          foods: [...(alt.meal_alternative_foods ?? [])]
            .sort((a: any, b: any) => a.ordem - b.ordem)
            .map((f: any) => ({
              _key: uid(),
              alimento_id: f.alimento_id ?? null,
              alimento: f.alimentos ?? null,
              nome_display: f.alimentos?.nome ?? f.nome_display ?? "",
              quantidade: f.quantidade?.toString() ?? "100",
              unidade: f.unidade ?? "g",
              order_index: f.ordem ?? 0,
              substitution_group_id: null,
              parent_key: null,
            })),
        }));
        setAlts(loaded);
      } catch (err: any) {
        toast({ title: "Erro ao carregar alternativas", description: err.message, variant: "destructive" });
      } finally { setLoading(false); }
    })();
  }, [open, mealDbId]);

  const addAlt = () => {
    if (alts.length >= MAX_ALTS) return;
    setAlts((prev) => [...prev, {
      _key: uid(), dbId: undefined,
      nome: `Alternativa ${prev.length + 1}`,
      foods: [emptyAltFood()],
    }]);
  };

  const removeAlt = (key: string) => setAlts((prev) => prev.filter((a) => a._key !== key));

  const updateAltName = (key: string, nome: string) =>
    setAlts((prev) => prev.map((a) => a._key === key ? { ...a, nome } : a));

  const updateAltFood = (altKey: string, fkey: string, patch: Partial<AltFoodData>) =>
    setAlts((prev) => prev.map((a) => a._key !== altKey ? a : {
      ...a, foods: a.foods.map((f) => f._key === fkey ? { ...f, ...patch } : f),
    }));

  const addAltFood = (altKey: string) =>
    setAlts((prev) => prev.map((a) => a._key !== altKey ? a : {
      ...a, foods: [...a.foods, emptyAltFood(a.foods.length)],
    }));

  const removeAltFood = (altKey: string, fkey: string) =>
    setAlts((prev) => prev.map((a) => a._key !== altKey ? a : {
      ...a, foods: a.foods.length > 1 ? a.foods.filter((f) => f._key !== fkey) : a.foods,
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Apaga todas as alternativas existentes (cascade deletes foods)
      await supabase.from("meal_alternatives").delete().eq("meal_id", mealDbId);

      // Re-insere tudo
      for (const [i, alt] of alts.entries()) {
        const { data: newAlt, error: altErr } = await supabase
          .from("meal_alternatives")
          .insert({ meal_id: mealDbId, nome: alt.nome.trim() || `Alternativa ${i + 1}`, ordem: i })
          .select("id").single();
        if (altErr) throw altErr;

        const validFoods = alt.foods.filter((f) => f.nome_display.trim() || f.alimento_id);
        if (validFoods.length > 0) {
          const { error: foodErr } = await supabase.from("meal_alternative_foods").insert(
            validFoods.map((f, fi) => ({
              alternative_id: newAlt.id,
              alimento_id: f.alimento_id ?? null,
              nome_display: f.alimento?.nome ?? f.nome_display.trim(),
              quantidade: parseFloat(f.quantidade) || 100,
              unidade: f.unidade,
              ordem: fi,
            }))
          );
          if (foodErr) throw foodErr;
        }
      }
      toast({ title: "Alternativas salvas!", description: `${alts.length} alternativa${alts.length !== 1 ? "s" : ""} para "${mealName}".` });
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao salvar alternativas", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white rounded-xl max-w-[720px] w-full p-0 overflow-hidden [&>button]:hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-amber-500" />
              Refeições Alternativas
            </h2>
            <p className="text-xs text-white/40 mt-0.5">Para: {mealName}</p>
          </div>
          <DialogClose asChild>
            <button type="button" onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/8 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </DialogClose>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Refeição principal — macros de referência */}
          {mainMacros.kcal > 0 && (
            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 flex items-center gap-4 flex-wrap">
              <p className="text-[10px] text-white/40 uppercase tracking-wider shrink-0">Principal</p>
              <span className="text-xs text-orange-400">C {mainMacros.carb}g</span>
              <span className="text-xs text-red-400">P {mainMacros.prot}g</span>
              <span className="text-xs text-blue-400">G {mainMacros.gord}g</span>
              <span className="text-xs text-green-500 font-semibold">{mainMacros.kcal} kcal</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-6 text-white/30">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando alternativas...</span>
            </div>
          )}

          {/* Lista de alternativas */}
          {!loading && alts.map((alt, ai) => {
            const altMacros = sumAltMacros(alt.foods);
            const dKcal = mainMacros.kcal > 0 && altMacros.kcal > 0 ? altMacros.kcal - mainMacros.kcal : null;

            return (
              <div key={alt._key} className="rounded-lg border border-white/10 overflow-hidden">
                {/* Cabeçalho da alternativa */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-white/4 border-b border-white/8">
                  <span className="text-[11px] text-amber-500/70 font-bold shrink-0 w-5 text-center">{ai + 1}</span>
                  <Input value={alt.nome}
                    onChange={(e) => updateAltName(alt._key, e.target.value)}
                    placeholder="Nome da alternativa (ex: Crepioca de frango)"
                    className="bg-transparent border-0 text-white text-sm font-medium p-0 h-auto focus-visible:ring-0 flex-1 placeholder:text-white/25" />
                  {/* Macros desta alternativa */}
                  {altMacros.kcal > 0 && (
                    <div className="flex items-center gap-2 text-[11px] shrink-0">
                      <span className="text-orange-400">C {altMacros.carb}g</span>
                      <span className="text-red-400">P {altMacros.prot}g</span>
                      <span className="text-blue-400">G {altMacros.gord}g</span>
                      <span className="text-green-500 font-semibold">{altMacros.kcal} kcal</span>
                      {dKcal !== null && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          dKcal < 0 ? "text-green-400 bg-green-500/10" :
                          dKcal > 0 ? "text-red-400 bg-red-500/10" : "text-white/30"
                        }`}>
                          {dKcal > 0 ? "+" : ""}{dKcal}
                        </span>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => removeAlt(alt._key)}
                    className="text-white/20 hover:text-red-400 transition-colors shrink-0 ml-1 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Alimentos da alternativa */}
                <div className="divide-y divide-white/4">
                  {alt.foods.map((food) => {
                    const fm = calcAltFoodMacros(food);
                    return (
                      <div key={food._key} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/2 transition-colors">
                        <div className="flex-1 min-w-0">
                          <FoodSearchInput
                            food={food as FoodRow}
                            orgId={orgId}
                            onSelect={(a) => updateAltFood(alt._key, food._key, {
                              alimento_id: a.id, alimento: a, nome_display: a.nome,
                              quantidade: a.porcao_gramas?.toString() ?? "100", unidade: "g",
                            })}
                            onNameChange={(n) => updateAltFood(alt._key, food._key, { nome_display: n, alimento_id: null, alimento: null })}
                            onClear={() => updateAltFood(alt._key, food._key, { alimento_id: null, alimento: null })}
                            onAddNew={() => {}}
                          />
                        </div>
                        <Input type="number" value={food.quantidade}
                          onChange={(e) => updateAltFood(alt._key, food._key, { quantidade: e.target.value })}
                          className="w-14 bg-white/5 border-white/10 text-white text-xs rounded-md h-8 text-center shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        <select value={food.unidade}
                          onChange={(e) => updateAltFood(alt._key, food._key, { unidade: e.target.value })}
                          className="w-10 h-8 bg-zinc-900 border border-white/10 text-white/60 text-xs rounded-md px-1 focus:outline-none shrink-0">
                          <option value="g">g</option>
                          <option value="ml">ml</option>
                          <option value="un">un</option>
                        </select>
                        <span className="text-[11px] w-16 text-right shrink-0">
                          {fm.kcal > 0
                            ? <span className="text-green-600 font-medium">{fm.kcal}</span>
                            : <span className="text-white/20">—</span>}
                        </span>
                        <button type="button" onClick={() => removeAltFood(alt._key, food._key)}
                          disabled={alt.foods.length === 1}
                          className="text-white/20 hover:text-red-400 disabled:opacity-20 transition-colors shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Adicionar alimento */}
                <button type="button" onClick={() => addAltFood(alt._key)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] text-white/25 hover:text-green-500 transition-colors border-t border-white/5">
                  <Plus className="w-3 h-3" />Adicionar alimento
                </button>
              </div>
            );
          })}

          {/* Botão adicionar nova alternativa */}
          {!loading && alts.length < MAX_ALTS && (
            <button type="button" onClick={addAlt}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg border border-dashed border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 transition-colors text-sm">
              <Plus className="w-4 h-4" />
              Adicionar refeição alternativa
              {alts.length > 0 && <span className="text-[11px] text-white/20">({alts.length}/{MAX_ALTS})</span>}
            </button>
          )}
          {!loading && alts.length >= MAX_ALTS && (
            <p className="text-xs text-white/25 text-center py-1">Máximo de {MAX_ALTS} alternativas por refeição</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/8 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}
            className="h-9 px-4 rounded-md text-white/50 hover:text-white hover:bg-white/5 text-sm">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}
            className="h-9 px-5 rounded-md text-white font-semibold text-sm"
            style={{ background: "var(--cp-gradient)" }}>
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Salvando...</>
              : <><Check className="w-4 h-4 mr-1.5" />Salvar Alternativas</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── MacroCard ────────────────────────────────────────────────────────────────

interface MacroCardProps {
  label: string; value: number; unit: string;
  color: string; perKg?: number | null;
}
const MacroCard = ({ label, value, unit, color, perKg }: MacroCardProps) => (
  <div className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-3 text-center dark:border-white/10 dark:bg-white/4">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-[11px] text-muted-foreground mt-0.5 dark:text-white/60">{label}</p>
    <p className={`text-[11px] ${color} mt-0.5 opacity-80`}>{value} {unit}</p>
    {perKg != null && (
      <p className="text-[10px] text-muted-foreground/80 mt-0.5 dark:text-white/40">{perKg.toFixed(1)} {unit}/kg</p>
    )}
  </div>
);

// ─── NutritionalAnalysis ──────────────────────────────────────────────────────

interface NutritionalAnalysisProps {
  macros: Macros;
  studentWeight: number | null;
  weightDate: string | null;
}

const MACRO_COLORS = ["#fb923c", "#f87171", "#60a5fa"];

const NutritionalAnalysis = ({ macros, studentWeight, weightDate }: NutritionalAnalysisProps) => {
  const hasData = macros.kcal > 0;

  const chartData = [
    { name: "Carboidratos", value: Math.round(macros.carb * 4), raw: macros.carb },
    { name: "Proteína", value: Math.round(macros.prot * 4), raw: macros.prot },
    { name: "Gorduras", value: Math.round(macros.gord * 9), raw: macros.gord },
  ].filter((d) => d.value > 0);

  const pw = studentWeight ?? null;

  return (
    <div className="space-y-4 mt-6 pt-5 border-t border-border dark:border-white/8">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground dark:text-white">Análise Nutricional</h3>
      </div>

      {/* Macro cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <MacroCard label="Calorias" value={macros.kcal} unit="kcal" color="text-green-500"
          perKg={pw && macros.kcal > 0 ? macros.kcal / pw : null} />
        <MacroCard label="Carboid." value={macros.carb} unit="g" color="text-orange-400"
          perKg={pw && macros.carb > 0 ? macros.carb / pw : null} />
        <MacroCard label="Proteína" value={macros.prot} unit="g" color="text-red-400"
          perKg={pw && macros.prot > 0 ? macros.prot / pw : null} />
        <MacroCard label="Gorduras" value={macros.gord} unit="g" color="text-blue-400"
          perKg={pw && macros.gord > 0 ? macros.gord / pw : null} />
        <MacroCard label="Fibras" value={macros.fibra} unit="g" color="text-green-400" />
      </div>

      {/* Chart + patient info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Donut chart */}
        <div className="rounded-lg border border-border bg-card px-4 py-4 dark:border-white/8 dark:bg-white/3">
          <p className="text-xs text-foreground font-medium mb-3 dark:text-white/65">Distribuição de Macronutrientes</p>
          {hasData ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={90} height={90}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={25} outerRadius={42}
                    paddingAngle={2} dataKey="value">
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={MACRO_COLORS[i % MACRO_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} kcal`, name]}
                    contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
                    labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                    itemStyle={{ color: "rgba(255,255,255,0.7)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1">
                {[
                  { label: "Carboidratos", color: "bg-orange-400", pct: macros.kcal > 0 ? Math.round((macros.carb * 4 / macros.kcal) * 100) : 0 },
                  { label: "Proteína", color: "bg-red-400", pct: macros.kcal > 0 ? Math.round((macros.prot * 4 / macros.kcal) * 100) : 0 },
                  { label: "Gorduras", color: "bg-blue-400", pct: macros.kcal > 0 ? Math.round((macros.gord * 9 / macros.kcal) * 100) : 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-sm ${item.color} shrink-0`} />
                    <span className="text-[11px] text-muted-foreground dark:text-white/65">{item.label}</span>
                    <span className="text-[11px] text-foreground ml-auto font-semibold dark:text-white/85">{item.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-20 text-muted-foreground text-xs dark:text-white/20">
              Adicione alimentos para ver a distribuição
            </div>
          )}
        </div>

        {/* Patient info */}
        <div className="rounded-lg border border-border bg-card px-4 py-4 dark:border-white/8 dark:bg-white/3">
          <p className="text-xs text-foreground font-medium mb-3 dark:text-white/65">Informações do Paciente</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground dark:text-white/55">Peso atual</span>
              <span className="text-sm font-semibold text-foreground dark:text-white">{pw ? `${pw} kg` : "—"}</span>
            </div>
            {weightDate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground dark:text-white/55">Última atualização</span>
                <span className="text-xs text-foreground/80 dark:text-white/70">{weightDate}</span>
              </div>
            )}
            {pw && macros.prot > 0 && (
              <div className="mt-3 pt-3 border-t border-border dark:border-white/8">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground dark:text-white/55">Proteína / kg</span>
                  <span className="text-xs font-semibold text-red-400">{(macros.prot / pw).toFixed(2)} g/kg</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground dark:text-white/55">Kcal / kg</span>
                  <span className="text-xs font-semibold text-green-500">{(macros.kcal / pw).toFixed(1)} kcal/kg</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const DietManager = ({ studentId, studentUserId, orgId }: DietManagerProps) => {
  const { toast } = useToast();

  const [view, setView] = useState<"summary" | "form" | "pdf-preview">("summary");
  const [activeDiet, setActiveDiet] = useState<ActiveDiet | null>(null);
  const [loadingDiet, setLoadingDiet] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<DietForm>(emptyForm());

  // Meal edit modal
  const [editingMealKey, setEditingMealKey] = useState<string | null>(null);

  // Alternatives modal
  const [altModal, setAltModal] = useState<{
    mealDbId: string;
    mealName: string;
    mainMacros: Macros;
  } | null>(null);

  // Student weight (from latest check-in)
  const [studentWeight, setStudentWeight] = useState<number | null>(null);
  const [weightDate, setWeightDate] = useState<string | null>(null);

  // PDF import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => { loadActiveDiet(); loadStudentWeight(); }, [studentId]);

  const loadStudentWeight = async () => {
    try {
      const { data } = await supabase
        .from("check_ins")
        .select("weight, created_at")
        .eq("student_id", studentUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.weight) {
        setStudentWeight(data.weight);
        setWeightDate(new Date(data.created_at).toLocaleDateString("pt-BR"));
      }
    } catch {}
  };

  const loadActiveDiet = async () => {
    setLoadingDiet(true);
    try {
      const { data: activeRow, error: activeErr } = await supabase
        .from("diets")
        .select("id")
        .eq("student_id", studentUserId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeErr) throw activeErr;

      if (!activeRow?.id) {
        setActiveDiet(null);
        return;
      }

      const { data, error } = await supabase
        .from("diets")
        .select(ACTIVE_DIET_SELECT)
        .eq("id", activeRow.id)
        .maybeSingle();
      if (error) throw error;
      setActiveDiet(data as ActiveDiet | null);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dieta", description: err.message, variant: "destructive" });
    } finally { setLoadingDiet(false); }
  };

  const loadDietById = async (dietId: string) => {
    const { data, error } = await supabase
      .from("diets")
      .select(ACTIVE_DIET_SELECT)
      .eq("id", dietId)
      .maybeSingle();
    if (error) throw error;
    return data as ActiveDiet | null;
  };

  const dietToForm = (diet: ActiveDiet): DietForm => ({
    title: diet.title,
    meals: [...diet.diet_meals]
      .sort((a, b) => a.order_index - b.order_index)
      .map((m) => {
        // Build a map: db_id → generated _key (for main foods)
        const dbIdToKey: Record<string, string> = {};
        const sortedFoods = [...m.diet_meal_foods].sort((a, b) => a.order_index - b.order_index);
        // First pass: assign keys to main foods
        sortedFoods.forEach((f) => {
          if (!(f as any).parent_food_id) dbIdToKey[f.id] = uid();
        });
        // Second pass: build FoodRow array
        const foods: FoodRow[] = sortedFoods.map((f) => {
          const parentId = (f as any).parent_food_id as string | null;
          const _key = parentId ? uid() : dbIdToKey[f.id];
          return {
            _key,
            alimento_id: f.alimento_id ?? null,
            alimento:    f.alimentos ?? null,
            nome_display: f.alimentos?.nome ?? f.name ?? "",
            quantidade:  f.quantidade?.toString() ?? "100",
            unidade:     f.unidade ?? "g",
            order_index: f.order_index,
            substitution_group_id: null,
            parent_key: parentId ? (dbIdToKey[parentId] ?? null) : null,
          };
        });
        return {
          _key: uid(), dbId: m.id, name: m.name,
          time_suggestion: m.time_suggestion ?? "", notes: m.notes ?? "",
          observacoes_receita: m.observacoes_receita ?? "", modo_preparo: m.modo_preparo ?? "",
          order_index: m.order_index,
          foods,
        };
      }),
  });

  const openNewForm  = () => { setForm(emptyForm()); setView("form"); };
  const openEditForm = () => { if (!activeDiet) return; setForm(dietToForm(activeDiet)); setView("form"); };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") { toast({ title: "Selecione um PDF", variant: "destructive" }); return; }
    setPdfLoading(true);
    try {
      // Convert to base64 in chunks to avoid stack overflow on large files
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
      }
      const base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("parse-diet-pdf", {
        body: { base64, mediaType: "application/pdf" },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "Erro no parse");
      const d = data.diet;
      setForm({
        title: d.title ?? "",
        meals: (d.meals ?? []).map((m: any) => ({
          _key: uid(), name: m.name ?? "",
          time_suggestion: m.time_suggestion ?? "", notes: m.notes ?? "",
          order_index: m.order_index ?? 0,
          foods: (m.foods ?? []).map((f: any, fi: number) => ({
            _key: uid(), alimento_id: null, alimento: null,
            nome_display: f.name ?? "", quantidade: "100", unidade: "g", order_index: fi,
          })),
        })),
      });
      setView("pdf-preview");
    } catch (err: any) {
      toast({ title: "Erro ao processar PDF", description: err.message, variant: "destructive" });
    } finally { setPdfLoading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Título obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { error: deactivateErr } = await supabase
        .from("diets")
        .update({ is_active: false })
        .eq("student_id", studentUserId)
        .eq("is_active", true);
      if (deactivateErr) throw deactivateErr;

      const total = totalMacros(form.meals);
      const { data: newDiet, error: dietErr } = await supabase.from("diets")
        .insert({ student_id: studentUserId, org_id: orgId, title: form.title.trim(), calories: total.kcal > 0 ? total.kcal : null, is_active: true })
        .select("id, is_active").single();
      if (dietErr) throw dietErr;
      if (!newDiet?.is_active) throw new Error("A dieta foi criada, mas não ficou ativa.");

      for (const [mi, meal] of form.meals.entries()) {
        const { data: newMeal, error: mealErr } = await supabase.from("diet_meals")
          .insert({ diet_id: newDiet.id, name: meal.name || `Refeição ${mi + 1}`, time_suggestion: meal.time_suggestion || null, notes: meal.notes || null, observacoes_receita: meal.observacoes_receita || null, modo_preparo: meal.modo_preparo || null, order_index: mi })
          .select("id").single();
        if (mealErr) throw mealErr;

        // Save main foods first (parent_key === null), get their DB IDs
        const mainFoods = meal.foods.filter((f) => !f.parent_key && (f.nome_display.trim() || f.alimento_id));
        const keyToDbId: Record<string, string> = {};
        for (const [fi, f] of mainFoods.entries()) {
          const { data: savedFood, error: fErr } = await supabase.from("diet_meal_foods")
            .insert({
              meal_id: newMeal.id, name: f.alimento?.nome ?? f.nome_display.trim(),
              portion: f.quantidade ? `${f.quantidade}${f.unidade}` : null,
              alimento_id: f.alimento_id ?? null,
              quantidade: f.quantidade ? parseFloat(f.quantidade) : null,
              unidade: f.unidade, order_index: fi,
              parent_food_id: null,
            }).select("id").single();
          if (fErr) throw fErr;
          keyToDbId[f._key] = savedFood.id;
        }

        // Save substitutes referencing their parent's DB ID
        const subFoods = meal.foods.filter((f) => f.parent_key && (f.nome_display.trim() || f.alimento_id));
        if (subFoods.length > 0) {
          const subRows = subFoods
            .filter((f) => keyToDbId[f.parent_key!])
            .map((f, fi) => ({
              meal_id: newMeal.id, name: f.alimento?.nome ?? f.nome_display.trim(),
              portion: f.quantidade ? `${f.quantidade}${f.unidade}` : null,
              alimento_id: f.alimento_id ?? null,
              quantidade: f.quantidade ? parseFloat(f.quantidade) : null,
              unidade: f.unidade, order_index: fi,
              parent_food_id: keyToDbId[f.parent_key!],
            }));
          if (subRows.length > 0) {
            const { error: subErr } = await supabase.from("diet_meal_foods").insert(subRows);
            if (subErr) throw subErr;
          }
        }
      }
      const savedDiet = await loadDietById(newDiet.id);
      if (!savedDiet?.is_active) throw new Error("A dieta foi salva, mas não foi encontrada como ativa.");

      setActiveDiet(savedDiet);
      toast({ title: "Dieta salva!", description: "Dieta ativada para o aluno." });
      setView("summary");
    } catch (err: any) {
      toast({ title: "Erro ao salvar dieta", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const updateMeal = (mkey: string, updated: MealRow) =>
    setForm((f) => ({ ...f, meals: f.meals.map((m) => m._key === mkey ? updated : m) }));

  const addMeal = () =>
    setForm((f) => ({ ...f, meals: [...f.meals, emptyMeal(f.meals.length)] }));

  const removeMeal = (mkey: string) =>
    setForm((f) => ({ ...f, meals: f.meals.filter((m) => m._key !== mkey) }));

  const moveMealUp = (mkey: string) =>
    setForm((f) => {
      const idx = f.meals.findIndex((m) => m._key === mkey);
      if (idx <= 0) return f;
      const meals = [...f.meals];
      [meals[idx - 1], meals[idx]] = [meals[idx], meals[idx - 1]];
      return { ...f, meals };
    });

  const moveMealDown = (mkey: string) =>
    setForm((f) => {
      const idx = f.meals.findIndex((m) => m._key === mkey);
      if (idx >= f.meals.length - 1) return f;
      const meals = [...f.meals];
      [meals[idx], meals[idx + 1]] = [meals[idx + 1], meals[idx]];
      return { ...f, meals };
    });

  const duplicateMeal = (mkey: string) =>
    setForm((f) => {
      const orig = f.meals.find((m) => m._key === mkey);
      if (!orig) return f;
      const copy: MealRow = { ...orig, _key: uid(), name: `${orig.name} (cópia)`, foods: orig.foods.map((fd) => ({ ...fd, _key: uid() })) };
      const idx = f.meals.findIndex((m) => m._key === mkey);
      const meals = [...f.meals];
      meals.splice(idx + 1, 0, copy);
      return { ...f, meals };
    });

  // ── Loading ──────────────────────────────────────────────────

  if (loadingDiet) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground dark:text-white/40">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando dieta...</span>
      </div>
    );
  }

  // ── Summary view ─────────────────────────────────────────────

  if (view === "summary") {
    const summaryMacros = activeDiet
      ? totalMacros(activeDiet.diet_meals.map((m) => ({
          _key: m.id, name: m.name, time_suggestion: m.time_suggestion ?? "", notes: m.notes ?? "",
          observacoes_receita: m.observacoes_receita ?? "", modo_preparo: m.modo_preparo ?? "",
          order_index: m.order_index,
          foods: m.diet_meal_foods.map((f) => ({
            _key: f.id, alimento_id: f.alimento_id ?? null, alimento: f.alimentos ?? null,
            nome_display: f.alimentos?.nome ?? f.name ?? "",
            quantidade: f.quantidade?.toString() ?? "100",
            unidade: f.unidade ?? "g", order_index: f.order_index,
            substitution_group_id: null,
            parent_key: (f as any).parent_food_id ?? null,
          })),
        })))
      : ZERO;

    return (
      <div className="space-y-4">
        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={openNewForm}
            className="rounded-md h-8 px-3 text-white font-semibold text-xs"
            style={{ background: "var(--cp-gradient)" }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Nova dieta
          </Button>
          {activeDiet && (
            <Button size="sm" variant="ghost" onClick={openEditForm}
              className="rounded-md h-8 px-3 border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs bg-transparent dark:border-white/10 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5">
              <Pencil className="w-3.5 h-3.5 mr-1.5" />Editar dieta
            </Button>
          )}
          <label>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
            <Button size="sm" type="button" variant="ghost" disabled={pdfLoading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md h-8 px-3 border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs bg-transparent dark:border-white/10 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5">
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 mr-1.5" />}
              {pdfLoading ? "Processando..." : "Importar PDF"}
            </Button>
          </label>
        </div>

        {activeDiet ? (
          <>
            {/* Diet header */}
            <div className="rounded-lg border border-border bg-card overflow-hidden dark:border-white/8 dark:bg-white/3">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 dark:border-white/6">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate dark:text-white">{activeDiet.title}</p>
                  <span className="text-[10px] bg-green-600/20 text-green-500 px-2 py-0.5 rounded-full font-medium shrink-0">ativa</span>
                </div>
                {summaryMacros.kcal > 0 && (
                  <div className="flex items-center gap-3 text-[11px] shrink-0">
                    <span className="text-foreground/80 font-semibold dark:text-white/70">{summaryMacros.kcal} kcal</span>
                    <span className="text-muted-foreground dark:text-white/40">C {summaryMacros.carb}g</span>
                    <span className="text-muted-foreground dark:text-white/40">P {summaryMacros.prot}g</span>
                    <span className="text-muted-foreground dark:text-white/40">G {summaryMacros.gord}g</span>
                  </div>
                )}
              </div>

              {/* Meal rows */}
              <div className="divide-y divide-border dark:divide-white/5">
                {[...activeDiet.diet_meals]
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((meal) => {
                    const mFoods = meal.diet_meal_foods.map((f) => ({
                      _key: f.id, alimento_id: f.alimento_id ?? null, alimento: f.alimentos ?? null,
                      nome_display: f.alimentos?.nome ?? f.name ?? "",
                      quantidade: f.quantidade?.toString() ?? "100",
                      unidade: f.unidade ?? "g", order_index: f.order_index,
                      substitution_group_id: null,
                      parent_key: f.parent_food_id ?? null,
                    }));
                    const mRow: MealRow = { _key: meal.id, name: meal.name, time_suggestion: meal.time_suggestion ?? "", notes: meal.notes ?? "", observacoes_receita: meal.observacoes_receita ?? "", modo_preparo: meal.modo_preparo ?? "", order_index: meal.order_index, foods: mFoods };
                    const mm = mealMacros(mRow);
                    const visibleFoods = mFoods
                      .filter((f) => !f.parent_key)
                      .sort((a, b) => a.order_index - b.order_index);
                    return (
                      <div key={meal.id} className="px-4 py-3 hover:bg-muted/60 transition-colors group dark:hover:bg-white/3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {meal.time_suggestion && (
                                <span className="text-xs text-foreground/40 font-mono shrink-0">{meal.time_suggestion}</span>
                              )}
                              <p className="text-sm text-foreground/85 font-medium break-words">{meal.name}</p>
                            </div>
                            {visibleFoods.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {visibleFoods.map((food) => {
                                  const name = getFoodName(food);
                                  const amount = getFoodAmount(food);
                                  return (
                                    <div key={food._key} className="flex items-baseline gap-2 text-xs">
                                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35 shrink-0 translate-y-[-1px] dark:bg-white/20" />
                                      <span className="text-foreground/65 break-words min-w-0">{name}</span>
                                      {amount && <span className="text-foreground/35 shrink-0">{amount}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground dark:text-white/25">Nenhum alimento cadastrado nesta refeição.</p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:shrink-0">
                            {mm.kcal > 0 && (
                              <div className="flex items-center gap-2.5 text-[11px]">
                                <span className="text-muted-foreground dark:text-white/35">C {mm.carb}g</span>
                                <span className="text-muted-foreground dark:text-white/35">P {mm.prot}g</span>
                                <span className="text-muted-foreground dark:text-white/35">G {mm.gord}g</span>
                                <span className="text-foreground/75 font-semibold dark:text-white/65">{mm.kcal} kcal</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setAltModal({ mealDbId: meal.id, mealName: meal.name, mainMacros: mm })}
                              className="shrink-0 flex items-center gap-1 text-[11px] text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/8 px-2 py-1 rounded-md border border-amber-500/20 transition-colors"
                              title="Gerenciar alternativas desta refeição">
                              <Shuffle className="w-3 h-3" />
                              <span className="hidden sm:inline">Alternativas</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <NutritionalAnalysis macros={summaryMacros} studentWeight={studentWeight} weightDate={weightDate} />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-10 text-center dark:border-white/10">
            <p className="text-muted-foreground text-sm mb-1 dark:text-white/30">Nenhuma dieta ativa</p>
            <p className="text-muted-foreground/80 text-xs dark:text-white/20">Crie uma nova dieta ou importe via PDF</p>
          </div>
        )}

        {/* Substituições são gerenciadas direto na edição de cada refeição */}

        {/* Alternatives modal */}
        {altModal && (
          <AlternativesModal
            open={!!altModal}
            mealDbId={altModal.mealDbId}
            mealName={altModal.mealName}
            mainMacros={altModal.mainMacros}
            orgId={orgId}
            onClose={() => setAltModal(null)}
          />
        )}
      </div>
    );
  }

  // ── Form view (new / edit / pdf-preview) ─────────────────────

  const isPreview = view === "pdf-preview";
  const totals = totalMacros(form.meals);
  const editingMeal = editingMealKey ? form.meals.find((m) => m._key === editingMealKey) ?? null : null;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground dark:text-white">
              {isPreview ? "Dieta importada — revise e salve" : "Nova dieta"}
            </h3>
            {isPreview && (
              <p className="text-xs text-muted-foreground mt-0.5 dark:text-white/40">Clique em "Editar alimentos" para vincular ao banco de dados</p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setView("summary")}
            className="rounded-md h-8 px-3 text-muted-foreground hover:text-foreground text-xs dark:text-white/40 dark:hover:text-white/70">
            Cancelar
          </Button>
        </div>

        {/* Diet title */}
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Nome da dieta</Label>
          <Input value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Dieta de cutting — semana 1"
            className="bg-background border-border text-foreground rounded-md h-9 placeholder:text-muted-foreground/60 focus:border-green-600/40 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/20" />
        </div>

        {/* Cardápio section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Cardápio</Label>
            <button type="button" onClick={addMeal}
              className="flex items-center gap-1 text-xs text-green-500/70 hover:text-green-500 transition-colors">
              <Plus className="w-3.5 h-3.5" />Adicionar refeição
            </button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border dark:border-white/8 dark:bg-white/3 dark:divide-white/5">
            {form.meals.map((meal, mi) => {
              const mm = mealMacros(meal);
              const foodCount = meal.foods.filter((f) => f.nome_display.trim() || f.alimento_id).length;
              return (
                <div key={meal._key} className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/60 transition-colors group dark:hover:bg-white/3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Time input */}
                    <Input value={meal.time_suggestion}
                      onChange={(e) => updateMeal(meal._key, { ...meal, time_suggestion: e.target.value })}
                      placeholder="00:00"
                      className="bg-transparent border-0 border-b border-border text-muted-foreground text-xs rounded-none h-7 w-12 p-0 text-center focus-visible:ring-0 placeholder:text-muted-foreground/60 focus:border-green-600/50 dark:border-white/10 dark:text-white/50 dark:placeholder:text-white/20" />

                    {/* Name input */}
                    <Input value={meal.name}
                      onChange={(e) => updateMeal(meal._key, { ...meal, name: e.target.value })}
                      placeholder={`Refeição ${mi + 1}`}
                      className="bg-transparent border-0 text-foreground text-sm font-medium p-0 h-auto focus-visible:ring-0 flex-1 placeholder:text-muted-foreground/70 dark:text-white dark:placeholder:text-white/25" />
                  </div>

                  {/* Macros + food count */}
                  <div className="flex items-center gap-3 shrink-0">
                    {mm.kcal > 0 ? (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground dark:text-white/35">C {mm.carb}g</span>
                        <span className="text-muted-foreground dark:text-white/35">P {mm.prot}g</span>
                        <span className="text-muted-foreground dark:text-white/35">G {mm.gord}g</span>
                        <span className="text-foreground/75 font-semibold dark:text-white/65">{mm.kcal} kcal</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground dark:text-white/20">{foodCount} alimento{foodCount !== 1 ? "s" : ""}</span>
                    )}

                    {/* Action icons */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => moveMealUp(meal._key)}
                        disabled={mi === 0}
                        className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-0 transition-colors dark:text-white/20 dark:hover:text-white/60" title="Mover para cima">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveMealDown(meal._key)}
                        disabled={mi === form.meals.length - 1}
                        className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-0 transition-colors dark:text-white/20 dark:hover:text-white/60" title="Mover para baixo">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingMealKey(meal._key)}
                        className="p-1 text-muted-foreground hover:text-green-500 transition-colors dark:text-white/30" title="Editar alimentos">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => duplicateMeal(meal._key)}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors dark:text-white/30 dark:hover:text-white/70" title="Duplicar">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => removeMeal(meal._key)}
                        disabled={form.meals.length === 1}
                        className="p-1 text-muted-foreground/60 hover:text-red-400 disabled:opacity-20 transition-colors dark:text-white/20" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Always visible edit button */}
                    <Button size="sm" type="button" variant="ghost"
                      onClick={() => setEditingMealKey(meal._key)}
                      className="rounded-md h-7 px-2.5 text-[11px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted bg-transparent ml-1 dark:border-white/10 dark:text-white/40 dark:hover:text-white dark:hover:bg-white/5">
                      <Pencil className="w-3 h-3 mr-1" />Editar
                    </Button>
                    {/* Alternativas — só quando a refeição já existe no DB */}
                    {meal.dbId && (
                      <Button size="sm" type="button" variant="ghost"
                        onClick={() => setAltModal({ mealDbId: meal.dbId!, mealName: meal.name || `Refeição ${mi + 1}`, mainMacros: mm })}
                        className="rounded-md h-7 px-2.5 text-[11px] border border-amber-500/20 text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/8 bg-transparent">
                        <Shuffle className="w-3 h-3 mr-1" />Alt.
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live nutritional analysis */}
        <NutritionalAnalysis macros={totals} studentWeight={studentWeight} weightDate={weightDate} />

        {/* Lembrete de alternativas para dietas novas */}
        {view !== "pdf-preview" && form.meals.every((m) => !m.dbId) && (
          <p className="text-[11px] text-muted-foreground text-center dark:text-white/25">
            💡 Após salvar, você pode adicionar refeições alternativas pelo resumo da dieta
          </p>
        )}

        {/* Save button */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}
            className="flex-1 h-9 rounded-md text-white font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: "var(--cp-gradient)" }}>
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              : <><Check className="w-4 h-4" />Salvar e ativar dieta</>
            }
          </Button>
        </div>
      </div>

      {/* Meal edit modal */}
      {editingMeal && (
        <MealEditModal
          open={!!editingMealKey}
          meal={editingMeal}
          orgId={orgId}
          onClose={() => setEditingMealKey(null)}
          onSave={(updated) => updateMeal(updated._key, updated)}
          onAlternatives={editingMeal.dbId ? () => {
            const mm = mealMacros(editingMeal);
            setAltModal({ mealDbId: editingMeal.dbId!, mealName: editingMeal.name, mainMacros: mm });
          } : undefined}
        />
      )}

      {/* Alternatives modal (form view) */}
      {altModal && (
        <AlternativesModal
          open={!!altModal}
          mealDbId={altModal.mealDbId}
          mealName={altModal.mealName}
          mainMacros={altModal.mainMacros}
          orgId={orgId}
          onClose={() => setAltModal(null)}
        />
      )}
    </>
  );
};

export default DietManager;
