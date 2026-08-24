import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import {
  DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors,
  PointerSensor, TouchSensor, pointerWithin, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
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
  ListOrdered, Calculator, GripVertical,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";


/** Ajuste do indicador nativo de <input type="time"> — vem escuro no dark */
/** Campo de horário. Só digitação, com máscara.
 *
 *  Digitar `0930` vira `09:30` — não é preciso teclar o `:`, que era o incômodo
 *  original. A máscara também valida: hora acima de 23 e minuto acima de 59 são
 *  cortados, coisa que o campo de texto livre anterior aceitava.
 *
 *  Aqui houve <input type="time"> e depois uma lista de horários; ambos saíram.
 *  O nativo abre um popup branco no dark que NÃO é estilizável (shadow DOM
 *  fechado do Chrome). A lista de 96 opções tapava as refeições de baixo e
 *  exigia rolar até o horário — mais lento que as 4 teclas da digitação. */
const maskTime = (raw: string): string => {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  const h = Math.min(23, parseInt(d.slice(0, 2), 10) || 0);
  // Com 3 dígitos o minuto ainda está incompleto (ex: `093`), então preserva o
  // que foi digitado em vez de completar — senão não dá pra chegar em `09:35`.
  const mm = d.length === 3 ? d.slice(2) : String(Math.min(59, parseInt(d.slice(2), 10) || 0)).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${mm}`;
};

const TimeField = ({
  value, onChange, className, placeholder = "--:--",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) => (
  <Input
    value={value}
    onChange={(e) => onChange(maskTime(e.target.value))}
    placeholder={placeholder}
    inputMode="numeric"
    maxLength={5}
    className={className}
  />
);


/** Bloco arrastável de alimento: o principal MAIS seus substitutos e grupos.
 *
 *  Como o JSX já agrupa pai e filhos no mesmo `<div>`, arrastar esse bloco leva
 *  tudo junto — a hierarquia não é o problema que parecia.
 *
 *  Usa render prop pra entregar o handle: o conteúdo da linha depende de muitas
 *  closures do componente pai (macros, substitutos, grupos), e extrair tudo pra
 *  cá exigiria dezenas de props. Definido no nível do módulo de propósito —
 *  componente declarado inline remonta a cada render e derruba o arraste. */
const FoodBlock = ({
  id, children,
}: {
  id: string;
  children: (handle: {
    attributes: ReturnType<typeof useDraggable>["attributes"];
    listeners: ReturnType<typeof useDraggable>["listeners"];
  }) => ReactNode;
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id, data: { foodKey: id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `fooddrop:${id}`, data: { foodKey: id },
  });
  const setRefs = (n: HTMLElement | null) => { setDragRef(n); setDropRef(n); };

  return (
    <div
      ref={setRefs}
      className="rounded-lg mb-1.5 last:mb-0 overflow-hidden transition-colors"
      style={{
        // Superfície própria + relevo: antes eram linhas separadas só por borda,
        // sem volume. mb-1.5 é o mínimo pra sombra aparecer entre os blocos.
        backgroundColor: "var(--section-card-bg)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "var(--section-card-shadow-2)",
        // Sem transform: quem segue o cursor é o DragOverlay, imune ao scroll
        // interno do dialog. Aqui só marcamos origem e destino.
        opacity: isDragging ? 0.35 : 1,
        borderTop: isOver ? "2px solid var(--cp-500)" : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {children({ attributes, listeners })}
    </div>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alimento {
  id: string;
  nome: string;
  source?: string | null;
  porcao_descricao: string | null;
  porcao_gramas: number | null;
  unidade?: string | null;
  gramas_por_unidade?: number | null;
  kcal: number | null;
  proteina_g: number | null;
  carb_g: number | null;
  gordura_g: number | null;
  fibra_g: number | null;
  sodio_mg: number | null;
}



interface GrupoSubst {
  id: string;
  numero: number;
  nome: string;
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
  lista_subst_grupo_id: string | null; // referência da lista de substituição
  lista_subst_porcoes: string;          // número de porções (como string)
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
  dias_semana: string[];
  observacoes: string;
  refeicao_livre: string;
  info_adicional: string;
  meta_agua_ml: string;
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
  lista_subst_grupo_id: string | null;
  lista_subst_porcoes: number | null;
}

interface ActiveDiet {
  id: string;
  title: string;
  calories: number | null;
  is_active: boolean;
  dias_semana: string[] | null;
  observacoes: string | null;
  refeicao_livre: string | null;
  info_adicional: string | null;
  meta_agua_ml: number | null;
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

// Mapeia a unidade "livre" do alimento (g, ml, unidade, fatia, col. sopa...) pras
// 3 opções do seletor por refeição (g/ml/un) — qualquer coisa que não seja
// literalmente g/ml é tratada como contagem ("un"), já que o cálculo de macros
// (quantidade / porcao_gramas) é neutro em relação à unidade escolhida.
const toMealUnit = (unidade?: string | null): string =>
  unidade === "g" || unidade === "ml" ? unidade : "un";

const emptyFood = (order = 0, parent_key: string | null = null): FoodRow => ({
  _key: uid(), alimento_id: null, alimento: null,
  nome_display: "", quantidade: "100", unidade: "g", order_index: order,
  substitution_group_id: null, parent_key,
  lista_subst_grupo_id: null, lista_subst_porcoes: "1",
});

const emptyMeal = (order = 0): MealRow => ({
  _key: uid(), name: "", time_suggestion: "", notes: "",
  observacoes_receita: "", modo_preparo: "",
  order_index: order, foods: [emptyFood()],
});
const emptyForm = (): DietForm => ({ title: "", meals: [emptyMeal()], dias_semana: [], observacoes: "", refeicao_livre: "", info_adicional: "", meta_agua_ml: "" });

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
  // Only sum main foods (skip substitutes and lista-ref rows which have no macros)
  const s = meal.foods.filter((f) => !f.parent_key && f.lista_subst_grupo_id === null).reduce((a, f) => {
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

const ACTIVE_DIET_SELECT = `id, title, calories, is_active, dias_semana, observacoes, refeicao_livre, info_adicional, meta_agua_ml,
  diet_meals (
    id, name, time_suggestion, order_index, notes, observacoes_receita, modo_preparo,
    diet_meal_foods (
      id, name, portion, order_index, quantidade, unidade, alimento_id, parent_food_id,
      lista_subst_grupo_id, lista_subst_porcoes,
      alimentos ( id, nome, porcao_descricao, porcao_gramas, unidade, gramas_por_unidade, kcal, proteina_g, carb_g, gordura_g, fibra_g )
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
  const [dropPos, setDropPos] = useState<React.CSSProperties>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // Position dropdown via viewport coords — portal escapes any CSS transform ancestor.
  useEffect(() => {
    if (!open || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const dropW = Math.max(rect.width, 380);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const maxH = spaceBelow >= 180 ? Math.min(260, spaceBelow - 8) : Math.min(200, rect.top - 8);
    setDropPos({
      position: "fixed",
      top: spaceBelow >= 180 ? rect.bottom + 4 : rect.top - maxH - 4,
      left: Math.min(rect.left, window.innerWidth - dropW - 8),
      width: dropW,
      maxWidth: "calc(100vw - 1rem)",
      zIndex: 9999,
      maxHeight: maxH,
    });
  }, [open]);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("alimentos")
          .select("id, nome, porcao_descricao, porcao_gramas, unidade, gramas_por_unidade, kcal, proteina_g, carb_g, gordura_g, fibra_g, sodio_mg")
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

  const dropdownContent = (
    <>
      {/* Backdrop — captures clicks outside without blocking interaction below */}
      <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
      <div
        className="bg-zinc-950 border border-white/12 rounded-xl shadow-2xl overflow-hidden"
        style={dropPos}
      >
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
            onClick={() => { onAddNew(food.nome_display); setOpen(false); }}
            className="flex items-center gap-2 text-sm text-green-500 hover:text-green-400 transition-colors font-medium">
            <Plus className="w-4 h-4" />
            Criar "{food.nome_display}" no banco de alimentos
          </button>
        </div>
      )}

      {/* Resultados — overflow-y:auto + max-height:250px for native scroll */}
      {!loading && results.length > 0 && (
        <div
          className="overflow-y-auto"
          style={{ maxHeight: 250, overscrollBehavior: "contain" }}
        >
          {results.map((a) => (
            <button key={a.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(a); setOpen(false); }}
              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group">

              {/* Nome + badge de fonte */}
              <div className="flex items-center gap-2">
                <p className="text-sm text-white font-medium group-hover:text-green-500 transition-colors leading-tight">
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

      {/* Footer */}
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
    </>
  );

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div ref={inputRef} className="relative">
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

      {open && createPortal(dropdownContent, document.body)}
    </div>
  );
};

// ─── NovoAlimentoModal ────────────────────────────────────────────────────────

interface NovoAlimentoModalProps {
  open: boolean; nomeInicial: string; orgId: string | null;
  onClose: () => void; onCreated: (a: Alimento) => void;
}

// Unidades disponíveis para porção
const UNIDADES_PORCAO = ["g", "ml", "unidade", "fatia", "col. sopa", "col. chá", "xícara", "porção", "outro"] as const;

const NovoAlimentoModal = ({ open, nomeInicial, orgId, onClose, onCreated }: NovoAlimentoModalProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: nomeInicial,
    porcao_qty:   "100",   // quantidade numérica da porção
    porcao_unit:  "g",     // unidade da porção
    porcao_outro: "",      // usado quando unit = "outro"
    gramas_por_unidade: "", // opcional, só quando porcao_unit = "unidade"
    kcal: "", proteina_g: "", carb_g: "", gordura_g: "", fibra_g: "", sodio_mg: "",
  });

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, nome: nomeInicial, porcao_qty: "100", porcao_unit: "g", porcao_outro: "" }));
  }, [open, nomeInicial]);

  /** Monta o porcao_descricao final a partir de qty + unit */
  const buildPorcaoDesc = (): string => {
    const qty  = form.porcao_qty.trim() || "100";
    const unit = form.porcao_unit === "outro" ? form.porcao_outro.trim() || "porção" : form.porcao_unit;
    return (unit === "g" || unit === "ml") ? `${qty}${unit}` : `${qty} ${unit}`;
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!orgId) { toast({ title: "Org não encontrada", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const unidadeFinal = form.porcao_unit === "outro" ? (form.porcao_outro.trim() || "porção") : form.porcao_unit;
      const { data, error } = await supabase.from("alimentos").insert({
        nome:             form.nome.trim(),
        porcao_descricao: buildPorcaoDesc(),
        porcao_gramas:    parseFloat(form.porcao_qty) || 100,
        unidade:          unidadeFinal,
        gramas_por_unidade: unidadeFinal === "unidade" && form.gramas_por_unidade
          ? parseFloat(form.gramas_por_unidade) : null,
        kcal:             form.kcal       ? parseFloat(form.kcal)       : null,
        proteina_g:       form.proteina_g ? parseFloat(form.proteina_g) : null,
        carb_g:           form.carb_g     ? parseFloat(form.carb_g)     : null,
        gordura_g:        form.gordura_g  ? parseFloat(form.gordura_g)  : null,
        fibra_g:          form.fibra_g    ? parseFloat(form.fibra_g)    : null,
        sodio_mg:         form.sodio_mg   ? parseFloat(form.sodio_mg)   : null,
        fonte: "org", org_id: orgId, status: "pendente",
      }).select("id, nome, porcao_descricao, porcao_gramas, unidade, gramas_por_unidade, kcal, proteina_g, carb_g, gordura_g, fibra_g, sodio_mg").single();
      if (error) throw error;
      toast({ title: "Alimento criado!", description: "Disponível para sua organização." });
      onCreated(data as Alimento);
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao criar alimento", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  /** Campo numérico genérico */
  const FNum = (label: string, key: "kcal" | "proteina_g" | "carb_g" | "gordura_g" | "fibra_g" | "sodio_mg", unit: string) => (
    <div className="space-y-1">
      <Label className="text-[10px] text-white/60 uppercase tracking-wider">{label}</Label>
      <div className="relative">
        <Input type="number" value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder="0"
          className="bg-white/5 border-white/10 text-white text-sm rounded-md h-9 placeholder:text-white/20 pr-8" />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30">{unit}</span>
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
          {/* Nome */}
          <div className="space-y-1">
            <Label className="text-[10px] text-white/60 uppercase tracking-wider">Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Ovo inteiro"
              className="bg-white/5 border-white/10 text-white text-sm rounded-md h-9 placeholder:text-white/20" />
          </div>

          {/* Porção base — quantidade + unidade */}
          <div className="space-y-1">
            <Label className="text-[10px] text-white/60 uppercase tracking-wider">Porção Base</Label>
            <p className="text-[10px] text-white/30">Os macros abaixo devem ser para esta quantidade</p>
            <div className="flex gap-2">
              <Input
                type="number"
                value={form.porcao_qty}
                onChange={(e) => setForm((f) => ({ ...f, porcao_qty: e.target.value }))}
                placeholder="100"
                className="w-24 shrink-0 bg-white/5 border-white/10 text-white text-sm rounded-md h-9 placeholder:text-white/20"
              />
              <select
                value={form.porcao_unit}
                onChange={(e) => setForm((f) => ({ ...f, porcao_unit: e.target.value }))}
                className="flex-1 h-9 rounded-md bg-white/5 border border-white/10 text-white text-sm px-2 cursor-pointer"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                <option value="g">g (gramas)</option>
                <option value="ml">ml (mililitros)</option>
                <option value="unidade">unidade</option>
                <option value="fatia">fatia</option>
                <option value="col. sopa">col. de sopa</option>
                <option value="col. chá">col. de chá</option>
                <option value="xícara">xícara</option>
                <option value="porção">porção</option>
                <option value="outro">outro...</option>
              </select>
            </div>
            {/* Campo livre quando "outro" selecionado */}
            {form.porcao_unit === "outro" && (
              <Input
                value={form.porcao_outro}
                onChange={(e) => setForm((f) => ({ ...f, porcao_outro: e.target.value }))}
                placeholder="Ex: sachê, scoop, tablete..."
                className="bg-white/5 border-white/10 text-white text-sm rounded-md h-9 placeholder:text-white/20 mt-1.5"
              />
            )}
            {form.porcao_unit === "unidade" && (
              <div className="mt-1.5">
                <Input
                  type="number"
                  value={form.gramas_por_unidade}
                  onChange={(e) => setForm((f) => ({ ...f, gramas_por_unidade: e.target.value }))}
                  placeholder="Ex: 50"
                  className="bg-white/5 border-white/10 text-white text-sm rounded-md h-9 placeholder:text-white/20"
                />
                <p className="text-[10px] text-white/25 mt-1">Quantos gramas equivalem a 1 unidade (opcional, só informativo)</p>
              </div>
            )}
            {/* Preview da descrição */}
            <p className="text-[10px] text-white/25 pt-0.5">
              Exibido como: <span className="text-white/50 font-medium">{buildPorcaoDesc()}</span>
            </p>
          </div>

          {/* Macros */}
          <div className="grid grid-cols-2 gap-2">
            {FNum("Kcal", "kcal", "kcal")}     {FNum("Proteína", "proteina_g", "g")}
            {FNum("Carboidratos", "carb_g", "g")} {FNum("Gorduras", "gordura_g", "g")}
            {FNum("Fibras", "fibra_g", "g")}    {FNum("Sódio", "sodio_mg", "mg")}
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
  const [grupos, setGrupos] = useState<GrupoSubst[]>([]);

  // Sync when meal prop changes
  useEffect(() => {
    if (open) setLocalMeal({ ...meal, foods: meal.foods.map((f) => ({ ...f })) });
  }, [open, meal._key]);

  // ESC key closes the modal (replacing Radix's onEscapeKeyDown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Load grupos de substituição
  useEffect(() => {
    if (!open || !orgId || grupos.length > 0) return;
    supabase
      .from("lista_subst_grupos")
      .select("id, numero, nome")
      .eq("org_id", orgId)
      .order("numero")
      .then(({ data }) => { if (data) setGrupos(data as GrupoSubst[]); });
  }, [open, orgId]);

  const updateFood = (fkey: string, patch: Partial<FoodRow>) =>
    setLocalMeal((m) => ({ ...m, foods: m.foods.map((f) => f._key === fkey ? { ...f, ...patch } : f) }));

  const addFood = () =>
    setLocalMeal((m) => ({ ...m, foods: [...m.foods, emptyFood(m.foods.length, null)] }));

  const addListaRefSub = (parentKey: string) =>
    setLocalMeal((m) => ({ ...m, foods: [...m.foods, {
      _key: uid(), alimento_id: null, alimento: null,
      nome_display: "", quantidade: "0", unidade: "g", order_index: m.foods.length,
      substitution_group_id: null, parent_key: parentKey,
      lista_subst_grupo_id: "", lista_subst_porcoes: "1",
    }] }));

  const addSubstitute = (parentKey: string) =>
    setLocalMeal((m) => ({ ...m, foods: [...m.foods, emptyFood(m.foods.length, parentKey)] }));

  const removeFood = (fkey: string) =>
    // Also remove any substitutes that reference this food
    setLocalMeal((m) => ({ ...m, foods: m.foods.filter((f) => f._key !== fkey && f.parent_key !== fkey) }));

  /** Reordena um alimento principal levando junto seus substitutos e grupos.
   *  Substituiu as setas ↑/↓ (que tinham 10px e sumiam quando desabilitadas). */
  const reorderFoods = (fromKey: string, toKey: string) =>
    setLocalMeal((m) => {
      const principais = m.foods.filter((f) => !f.parent_key);
      // Cada bloco = alimento principal + tudo que pendura nele
      const blocos = principais.map((p) => [p, ...m.foods.filter((f) => f.parent_key === p._key)]);
      const de = blocos.findIndex((b) => b[0]._key === fromKey);
      const para = blocos.findIndex((b) => b[0]._key === toKey);
      if (de === -1 || para === -1 || de === para) return m;
      const next = [...blocos];
      const [movido] = next.splice(de, 1);
      next.splice(para, 0, movido);
      // order_index sequencial sobre a lista achatada, como o resto do arquivo espera
      return { ...m, foods: next.flat().map((f, i) => ({ ...f, order_index: i })) };
    });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
  const [dragFoodKey, setDragFoodKey] = useState<string | null>(null);

  const onFoodDragStart = (e: DragStartEvent) => setDragFoodKey(String(e.active.id));
  const onFoodDragEnd = (e: DragEndEvent) => {
    setDragFoodKey(null); // antes dos returns: o overlay some em qualquer saída
    const { active, over } = e;
    if (!over) return;
    const destino = (over.data.current as { foodKey?: string } | undefined)?.foodKey;
    if (destino) reorderFoods(String(active.id), destino);
  };

  const totals = mealMacros(localMeal);
  const mainFoodsCount = localMeal.foods.filter((f) => !f.parent_key).length;

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80" style={{ zIndex: 40 }} onClick={onClose} />
      {/* Modal container */}
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 41 }}>
        <div
          className="bg-zinc-950 border border-white/10 text-white rounded-xl w-full max-w-[700px] flex flex-col overflow-hidden"
          style={{ maxHeight: "90vh" }}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/8 shrink-0">
            <div className="flex items-center gap-3">
              {/* Nome da refeição */}
              <Input value={localMeal.name}
                onChange={(e) => setLocalMeal((m) => ({ ...m, name: e.target.value }))}
                placeholder="Nome da refeição"
                className="bg-transparent border-0 text-white text-base font-semibold p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-white/30 flex-1" />

              {/* Horário */}
              <div className="flex items-center gap-1.5 text-white/50 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <TimeField
                  value={localMeal.time_suggestion}
                  onChange={(v) => setLocalMeal((m) => ({ ...m, time_suggestion: v }))}
                  className="bg-white/5 border-white/10 text-white/70 text-xs rounded-md h-7 w-20 text-center placeholder:text-white/25 focus:border-green-600/40 cursor-pointer" />
              </div>

              {/* Botão fechar */}
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/8 transition-colors shrink-0 ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={addFood} size="sm"
                className="rounded-md h-8 px-3 font-semibold text-xs shadow-[0_4px_12px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]"
                style={{ background: "var(--cp-gradient)", color: "var(--cp-text)" }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Adicionar Alimento
              </Button>
              {/* Ação secundária: mesmo relevo dos cards, em vez de fundo
                  transparente que sumia contra o fundo do dialog */}
              <Button type="button" size="sm" variant="outline"
                onClick={() => setNewAlimentoModal({ open: true, nome: "", foodKey: "" })}
                className="rounded-md h-8 px-3 text-xs border-white/[0.09] text-white/70 hover:text-white hover:brightness-125 bg-[var(--section-card-bg)] shadow-[var(--section-card-shadow-2)]">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Criar Novo Alimento
              </Button>
            </div>

            {/* Foods list — agrupado por alimento principal + substitutos.
                Container no mesmo padrão da coluna de sessão do kanban: mais
                escuro que os cards que abriga, com borda e sombra. Os blocos de
                alimento (#141417) avançam sobre ele, como os exercícios fazem
                sobre a coluna na aba de Treinos. */}
            <div
              className="rounded-lg overflow-visible p-1.5"
              style={{
                backgroundColor: "var(--sheet-bg)",
                border: "1px solid rgba(255,255,255,0.09)",
                boxShadow: "var(--section-card-shadow)",
              }}
            >

              <DndContext
                sensors={dndSensors}
                collisionDetection={pointerWithin}
                onDragStart={onFoodDragStart}
                onDragEnd={onFoodDragEnd}
                onDragCancel={() => setDragFoodKey(null)}
              >
              {/* Column header */}
              <div className="flex items-center gap-1 px-2 py-1.5 mb-1 text-[10px] text-white/40 uppercase tracking-wider font-medium">
                <span className="w-5 shrink-0" />
                <span className="flex-1">Alimento</span>
                <span className="w-14 text-center shrink-0">QTD</span>
                <span className="w-10 text-center shrink-0">UND</span>
                <span className="w-10 text-center shrink-0 text-orange-400/70">C</span>
                <span className="w-10 text-center shrink-0 text-red-400/70">P</span>
                <span className="w-10 text-center shrink-0 text-blue-400/70">G</span>
                <span className="w-12 text-center shrink-0" style={{ color: "rgba(var(--cp-rgb), 0.7)" }}>KCAL</span>
                <span className="w-5 shrink-0" />
              </div>

              {localMeal.foods.filter((f) => !f.parent_key).map((food, fi) => {
                const mainMacros = calcFoodMacros(food);
                const subs = localMeal.foods.filter((f) => f.parent_key === food._key);
                const mainFoods = localMeal.foods.filter((f) => !f.parent_key && f.lista_subst_grupo_id === null);

                return (
                  <FoodBlock key={food._key} id={food._key}>
                    {({ attributes, listeners }) => (
                    <>
                    {/* ── Main food row ── */}
                    <div className="flex items-center gap-1 px-2 py-1 hover:bg-white/3 transition-colors group">
                      {/* Handle de arraste — dedicado, pra não roubar a seleção
                          de texto dos inputs da própria linha */}
                      <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        title="Arrastar para reordenar"
                        className="shrink-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none text-white/20 hover:text-white/60 transition-colors"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Food search */}
                      <div className="flex-1 min-w-0">
                        <FoodSearchInput food={food} orgId={orgId}
                          onSelect={(a) => updateFood(food._key, { alimento_id: a.id, alimento: a, nome_display: a.nome, quantidade: a.porcao_gramas?.toString() ?? "100", unidade: toMealUnit(a.unidade) })}
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
                      <span className="w-10 text-center text-xs font-semibold text-orange-400/90 tabular-nums shrink-0">{mainMacros.carb > 0 ? `${mainMacros.carb}g` : <span className="text-white/15 font-normal">—</span>}</span>
                      <span className="w-10 text-center text-xs font-semibold text-red-400/90 tabular-nums shrink-0">{mainMacros.prot > 0 ? `${mainMacros.prot}g` : <span className="text-white/15 font-normal">—</span>}</span>
                      <span className="w-10 text-center text-xs font-semibold text-blue-400/90 tabular-nums shrink-0">{mainMacros.gord > 0 ? `${mainMacros.gord}g` : <span className="text-white/15 font-normal">—</span>}</span>
                      <span className="w-12 text-center text-[13px] font-bold tabular-nums shrink-0" style={{ color: "var(--cp-400)" }}>{mainMacros.kcal > 0 ? mainMacros.kcal : <span className="text-white/15 font-normal">—</span>}</span>

                      {/* Delete */}
                      <button type="button" onClick={() => removeFood(food._key)}
                        disabled={mainFoodsCount === 1 && subs.length === 0}
                        className="w-5 text-white/20 hover:text-red-400 disabled:opacity-20 transition-colors shrink-0 flex justify-center">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* ── Substitute rows ── */}
                    {subs.map((sub) => {
                      // ── Lista de substituição como substituto ──
                      if (sub.lista_subst_grupo_id !== null) {
                        return (
                          <div key={sub._key} className="flex items-center gap-2 px-2 py-1.5 bg-white/2 border-t border-white/4 ml-5 border-l-2 border-l-white/8">
                            <div className="w-5 flex items-center justify-center shrink-0">
                              <ListOrdered className="w-3 h-3" style={{ color: "var(--cp-400)", opacity: 0.55 }} />
                            </div>
                            {/* Group selector */}
                            <select
                              value={sub.lista_subst_grupo_id}
                              onChange={(e) => updateFood(sub._key, { lista_subst_grupo_id: e.target.value })}
                              className="flex-1 h-8 text-xs rounded-md px-2 outline-none"
                              style={{
                                backgroundColor: "var(--surface-2)",
                                border: "1px solid var(--border-subtle)",
                                color: sub.lista_subst_grupo_id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                              }}
                            >
                              <option value="">Selecionar grupo…</option>
                              {grupos.map((g) => (
                                <option key={g.id} value={g.id}>
                                  Grupo {g.numero} — {g.nome}
                                </option>
                              ))}
                            </select>
                            {/* Portions */}
                            <Input
                              type="number"
                              value={sub.lista_subst_porcoes}
                              onChange={(e) => updateFood(sub._key, { lista_subst_porcoes: e.target.value })}
                              className="w-14 bg-white/5 border-white/10 text-white text-xs rounded-md h-8 text-center shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="1"
                            />
                            <span className="text-[10px] text-white/30 shrink-0">porç.</span>
                            {/* Spacers for column alignment */}
                            <span className="w-10 shrink-0" />
                            <span className="w-10 shrink-0" />
                            <span className="w-10 shrink-0" />
                            <span className="w-12 shrink-0" />
                            {/* Remove */}
                            <button type="button" onClick={() => removeFood(sub._key)}
                              className="w-5 text-white/20 hover:text-red-400 transition-colors shrink-0 flex justify-center">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      }

                      // ── Normal food substitute ──
                      const subMacros = calcFoodMacros(sub);
                      const diffKcal = mainMacros.kcal > 0 && subMacros.kcal > 0 ? subMacros.kcal - mainMacros.kcal : null;
                      return (
                        <div key={sub._key} className="flex items-center gap-1 px-2 py-1 bg-white/2 border-t border-white/4 ml-5 border-l-2 border-l-white/8">
                          <div className="w-5 flex items-center justify-center shrink-0">
                            <span className="text-[10px] text-white/20 font-bold">↕</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <FoodSearchInput food={sub} orgId={orgId}
                              onSelect={(a) => updateFood(sub._key, { alimento_id: a.id, alimento: a, nome_display: a.nome, quantidade: a.porcao_gramas?.toString() ?? "100", unidade: toMealUnit(a.unidade) })}
                              onNameChange={(n) => updateFood(sub._key, { nome_display: n, alimento_id: null, alimento: null })}
                              onClear={() => updateFood(sub._key, { alimento_id: null, alimento: null })}
                              onAddNew={(nome) => setNewAlimentoModal({ open: true, nome, foodKey: sub._key })}
                            />
                          </div>
                          <Input type="number" value={sub.quantidade}
                            onChange={(e) => updateFood(sub._key, { quantidade: e.target.value })}
                            className="w-14 bg-white/5 border-white/10 text-white text-xs rounded-md h-8 text-center placeholder:text-white/20 focus:border-green-600/40 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <select value={sub.unidade}
                            onChange={(e) => updateFood(sub._key, { unidade: e.target.value })}
                            className="w-10 h-8 bg-zinc-900 border border-white/10 text-white/60 text-xs rounded-md px-1 focus:outline-none focus:border-green-600/40 shrink-0">
                            <option value="g">g</option>
                            <option value="ml">ml</option>
                            <option value="un">un</option>
                          </select>
                          <span className="w-10 text-center text-xs text-orange-400/55 tabular-nums shrink-0">{subMacros.carb > 0 ? `${subMacros.carb}g` : <span className="text-white/15">—</span>}</span>
                          <span className="w-10 text-center text-xs text-red-400/55 tabular-nums shrink-0">{subMacros.prot > 0 ? `${subMacros.prot}g` : <span className="text-white/15">—</span>}</span>
                          <span className="w-10 text-center text-xs text-blue-400/55 tabular-nums shrink-0">{subMacros.gord > 0 ? `${subMacros.gord}g` : <span className="text-white/15">—</span>}</span>
                          {/* kcal + diferença em relação ao alimento principal.
                              Lado a lado, não empilhado: na vertical o diff
                              grudava no número e parecia parte dele. Os
                              parênteses separam os dois papéis — sem eles, o
                              verde do diff se confundiria com o verde do kcal. */}
                          <div className="w-12 flex items-baseline justify-center gap-0.5 shrink-0">
                            <span className="text-xs font-semibold tabular-nums" style={{ color: "rgba(var(--cp-rgb), 0.6)" }}>{subMacros.kcal > 0 ? subMacros.kcal : <span className="text-white/15">—</span>}</span>
                            {diffKcal !== null && (
                              <span
                                className={`text-[9px] font-bold tabular-nums leading-none ${diffKcal < 0 ? "text-emerald-400" : diffKcal > 0 ? "text-red-400" : "text-white/30"}`}
                                title={`${Math.abs(diffKcal)} kcal ${diffKcal < 0 ? "a menos" : "a mais"} que o alimento principal`}
                              >
                                ({diffKcal > 0 ? "+" : "−"}{Math.abs(diffKcal)})
                              </span>
                            )}
                          </div>
                          <button type="button" onClick={() => removeFood(sub._key)}
                            className="w-5 text-white/20 hover:text-red-400 transition-colors shrink-0 flex justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}

                    {/* ── Add substitute buttons ── */}
                    <div className="border-t border-white/[0.07] flex items-center divide-x divide-white/[0.07] bg-white/[0.02]">
                      <button type="button" onClick={() => addSubstitute(food._key)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] text-white/45 hover:text-white/80 hover:bg-white/[0.04] transition-colors">
                        <Plus className="w-3 h-3" />
                        Alimento substituto
                      </button>
                      {grupos.length > 0 && (
                        <button type="button" onClick={() => addListaRefSub(food._key)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] text-white/45 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                          style={{ color: grupos.length > 0 ? undefined : "transparent" }}>
                          <ListOrdered className="w-3 h-3" />
                          Grupo da Lista
                        </button>
                      )}
                    </div>
                    </>
                    )}
                  </FoodBlock>
                );
              })}

              {/* Totals row */}
              <div className="flex items-center gap-1 px-2 py-2 mt-1.5 rounded-lg" style={{ backgroundColor: "var(--section-card-bg-2)", border: "1px solid hsl(var(--border))", boxShadow: "var(--section-card-shadow-2)" }}>
                <span className="w-5 shrink-0" />
                <span className="flex-1 text-xs text-white/40 font-medium">Totais da refeição</span>
                <span className="w-14 shrink-0" />
                <span className="w-10 shrink-0" />
                <span className="w-10 text-center text-xs font-bold text-orange-400 tabular-nums shrink-0">{totals.carb > 0 ? `${totals.carb}g` : "—"}</span>
                <span className="w-10 text-center text-xs font-bold text-red-400 tabular-nums shrink-0">{totals.prot > 0 ? `${totals.prot}g` : "—"}</span>
                <span className="w-10 text-center text-xs font-bold text-blue-400 tabular-nums shrink-0">{totals.gord > 0 ? `${totals.gord}g` : "—"}</span>
                <span className="w-12 text-center text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--cp-400)" }}>{totals.kcal > 0 ? totals.kcal : "—"}</span>
                <span className="w-5 shrink-0" />
              </div>
              <DragOverlay dropAnimation={null}>
                {dragFoodKey ? (
                  <div className="px-3 py-2 rounded-lg text-sm text-white pointer-events-none"
                    style={{
                      backgroundColor: "var(--section-card-bg-2)",
                      border: "1px solid var(--cp-500)",
                      boxShadow: "0 14px 34px rgba(0,0,0,0.6)",
                      cursor: "grabbing",
                    }}>
                    {localMeal.foods.find((f) => f._key === dragFoodKey)?.nome_display || "Alimento"}
                  </div>
                ) : null}
              </DragOverlay>
              </DndContext>
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
          <div className="px-5 py-3 border-t border-white/8 flex justify-end gap-2 shrink-0">
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
        </div>
      </div>

      <NovoAlimentoModal
        open={newAlimentoModal.open}
        nomeInicial={newAlimentoModal.nome}
        orgId={orgId}
        onClose={() => setNewAlimentoModal((m) => ({ ...m, open: false }))}
        onCreated={(alimento) => {
          if (newAlimentoModal.foodKey) {
            // Substituir food existente pelo alimento recém-criado
            updateFood(newAlimentoModal.foodKey, {
              alimento_id: alimento.id, alimento,
              nome_display: alimento.nome,
              quantidade: alimento.porcao_gramas?.toString() ?? "100",
              unidade: "g",
            });
          } else {
            // Criado pelo botão do header: adicionar como nova linha na refeição atual
            setLocalMeal((m) => ({
              ...m,
              foods: [...m.foods, {
                ...emptyFood(m.foods.length, null),
                alimento_id: alimento.id,
                alimento,
                nome_display: alimento.nome,
                quantidade: alimento.porcao_gramas?.toString() ?? "100",
              }],
            }));
          }
        }}
      />
    </>,
    document.body
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 bg-zinc-950 border border-white/10 text-white rounded-xl max-w-[720px] w-full p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-amber-500" />
              Refeições Alternativas
            </h2>
            <p className="text-xs text-white/40 mt-0.5">Para: {mealName}</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/8 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="px-5 py-4 space-y-4 max-h-[72vh] overflow-y-auto"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
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
                              quantidade: a.porcao_gramas?.toString() ?? "100", unidade: toMealUnit(a.unidade),
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
      </div>
    </div>,
    document.body
  );
};

// ─── MacroCard ────────────────────────────────────────────────────────────────

interface MacroCardProps {
  label: string; value: number; unit: string;
  color: string; perKg?: number | null;
}
const MacroCard = ({ label, value, unit, color, perKg }: MacroCardProps) => (
  <div className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-3 text-center dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
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
        <div className="rounded-lg border border-border bg-card px-4 py-4 dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
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
                    contentStyle={{ background: "var(--section-card-bg-2)", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                    labelStyle={{ color: "hsl(var(--foreground) / 0.7)" }}
                    itemStyle={{ color: "hsl(var(--foreground) / 0.7)" }}
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
        <div className="rounded-lg border border-border bg-card px-4 py-4 dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
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

// ─── Dias da semana ───────────────────────────────────────────────────────────

const DIAS_SEMANA = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
];

// ─── TMB/GET calculator ───────────────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { value: '1.2',   label: 'Sedentário',             desc: 'Pouco ou nenhum exercício' },
  { value: '1.375', label: 'Levemente ativo',         desc: 'Exercício leve 1–3 dias/semana' },
  { value: '1.55',  label: 'Moderadamente ativo',     desc: 'Exercício moderado 3–5 dias/semana' },
  { value: '1.725', label: 'Muito ativo',              desc: 'Exercício pesado 6–7 dias/semana' },
  { value: '1.9',   label: 'Extremamente ativo',       desc: 'Exercício muito intenso + trabalho físico' },
];

interface TmbProtocol {
  label: string;
  desc: string;
  needsHeight: boolean;
  calc: (sex: 'M' | 'F', pesoKg: number, altCm: number, idadeAnos: number) => number;
}

const TMB_PROTOCOLS: Record<string, TmbProtocol> = {
  'mifflin': {
    label: 'Mifflin-St Jeor (1990)',
    desc: 'Considerada a mais precisa para a população geral. Recomendada pela American Dietetic Association.',
    needsHeight: true,
    calc: (sex, P, A, I) => sex === 'M' ? (10*P)+(6.25*A)-(5*I)+5 : (10*P)+(6.25*A)-(5*I)-161,
  },
  'harris-benedict': {
    label: 'Harris & Benedict (1919)',
    desc: 'Equação clássica, amplamente utilizada por décadas. Pode superestimar em obesos e subestimar em atletas.',
    needsHeight: true,
    calc: (sex, P, A, I) => sex === 'M' ? 66.5+(13.75*P)+(5.003*A)-(6.775*I) : 655.1+(9.563*P)+(1.85*A)-(4.676*I),
  },
  'fao-oms-1985': {
    label: 'FAO/OMS (1985)',
    desc: 'Baseada em peso corporal e faixa etária. Amplamente utilizada em estudos populacionais e políticas de saúde.',
    needsHeight: false,
    calc: (sex, P, _A, I) => {
      if (sex === 'M') { if (I<30) return 15.3*P+679; if (I<60) return 11.6*P+879; return 13.5*P+487; }
      else { if (I<30) return 14.7*P+496; if (I<60) return 8.7*P+829; return 10.5*P+596; }
    },
  },
  'fao-oms-2001': {
    label: 'FAO/OMS (2001)',
    desc: 'Revisão das equações OMS com dados de países tropicais. Recomendada para populações de clima quente.',
    needsHeight: false,
    calc: (sex, P, _A, I) => {
      if (sex === 'M') { if (I<30) return 15.4*P+690; if (I<60) return 11.3*P+900; return 11.9*P+700; }
      else { if (I<30) return 13.3*P+334; if (I<60) return 8.7*P+865; return 9.2*P+637; }
    },
  },
  'henry-rees': {
    label: 'Henry & Rees (1991)',
    desc: 'Desenvolvida para populações tropicais como o Brasil. Tende a ser mais precisa em climas quentes.',
    needsHeight: false,
    calc: (sex, P, _A, I) => {
      if (sex === 'M') { if (I<30) return 14.4*P+313; if (I<60) return 11.4*P+541; return 11.4*P+541; }
      else { if (I<30) return 13.3*P+334; if (I<60) return 8.7*P+581; return 8.7*P+581; }
    },
  },
  'schofield': {
    label: 'Schofield (1985)',
    desc: 'Referência da FAO. Baseia-se em peso e faixa etária, mas pode superestimar em populações de países quentes.',
    needsHeight: false,
    calc: (sex, P, _A, I) => {
      if (sex === 'M') { if (I<30) return 15.057*P+692.2; if (I<60) return 11.472*P+873.1; return 11.711*P+587.7; }
      else { if (I<30) return 14.818*P+486.6; if (I<60) return 8.126*P+845.6; return 9.082*P+658.5; }
    },
  },
  'tinsley': {
    label: 'Tinsley (2019)',
    desc: 'Desenvolvida para praticantes de musculação. Utiliza o peso corporal total como estimativa da composição magra de atletas.',
    needsHeight: false,
    calc: (sex, P, _A, _I) =>
      sex === 'M' ? (1.082 * P * 2.2046) + 577.1 : (0.823 * P * 2.2046) + 569.3,
  },
};

// ─── DietDropdown ─────────────────────────────────────────────────────────────

interface DietDropdownProps {
  diets: { id: string; title: string; is_active: boolean; created_at: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const DietDropdown = ({ diets, selectedId, onSelect }: DietDropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = diets.find((d) => d.id === selectedId);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 px-3 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:text-white hover:border-white/20 transition-colors"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <span className="max-w-[180px] truncate">{selected?.title ?? "Selecionar dieta"}</span>
        {selected?.is_active && <span className="text-[9px] bg-green-600/20 text-green-500 px-1.5 py-0.5 rounded-full font-medium shrink-0">ativa</span>}
        <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-10 z-50 min-w-[260px] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ backgroundColor: "var(--sheet-bg)" }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
          {diets.map((d) => (
            <button
              key={d.id}
              onClick={() => { onSelect(d.id); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors border-b border-white/5 last:border-0 ${
                d.id === selectedId ? "bg-white/6" : "hover:bg-white/4"
              }`}
            >
              <div className="min-w-0">
                <p className={`text-xs font-medium truncate ${d.id === selectedId ? "text-white" : "text-white/65"}`}>{d.title}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{fmtDate(d.created_at)}</p>
              </div>
              {d.is_active && <span className="text-[9px] bg-green-600/20 text-green-500 px-1.5 py-0.5 rounded-full font-medium shrink-0">ativa</span>}
            </button>
          ))}
          </div>
        </div>
      )}
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

  // All diets selector
  const [allDiets, setAllDiets] = useState<{ id: string; title: string; is_active: boolean; created_at: string }[]>([]);
  const [selectedDietId, setSelectedDietId] = useState<string | null>(null);
  const [viewingDiet, setViewingDiet] = useState<ActiveDiet | null>(null);
  const [loadingViewing, setLoadingViewing] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [deletingDietId, setDeletingDietId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // TMB/GET calculator
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcProtocol, setCalcProtocol] = useState('mifflin');
  const [calcSex, setCalcSex] = useState<'M' | 'F'>('M');
  const [calcAge, setCalcAge] = useState('');
  const [calcHeight, setCalcHeight] = useState('');
  const [calcWeight, setCalcWeight] = useState('');
  const [calcActivity, setCalcActivity] = useState('1.55');
  const [calcResult, setCalcResult] = useState<{ tmb: number; get: number } | null>(null);

  useEffect(() => { loadActiveDiet(); loadAllDiets(); loadStudentWeight(); }, [studentId]);

  const loadAllDiets = async () => {
    try {
      const { data } = await supabase
        .from("diets")
        .select("id, title, is_active, created_at")
        .eq("student_id", studentUserId)
        .order("created_at", { ascending: false });
      setAllDiets(data ?? []);
    } catch {}
  };

  const handleSelectDiet = async (dietId: string) => {
    setSelectedDietId(dietId);
    const active = allDiets.find((d) => d.id === dietId);
    if (active?.is_active) {
      setViewingDiet(null);
      return;
    }
    setLoadingViewing(true);
    try {
      const diet = await loadDietById(dietId);
      setViewingDiet(diet);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dieta", description: err.message, variant: "destructive" });
    } finally { setLoadingViewing(false); }
  };

  const handleReactivate = async (dietId: string) => {
    setReactivating(true);
    try {
      await supabase.from("diets").update({ is_active: false }).eq("student_id", studentUserId);
      await supabase.from("diets").update({ is_active: true }).eq("id", dietId);
      await loadActiveDiet();
      await loadAllDiets();
      setSelectedDietId(dietId);
      setViewingDiet(null);
      toast({ title: "Dieta reativada!" });
    } catch (err: any) {
      toast({ title: "Erro ao reativar", description: err.message, variant: "destructive" });
    } finally { setReactivating(false); }
  };

  const handleDeleteDiet = async (dietId: string) => {
    setDeletingDietId(dietId);
    try {
      const { error } = await supabase.from("diets").delete().eq("id", dietId);
      if (error) throw error;
      const wasActive = allDiets.find((d) => d.id === dietId)?.is_active;
      await loadAllDiets();
      if (wasActive) await loadActiveDiet();
      setConfirmDeleteId(null);
      setSelectedDietId(null);
      setViewingDiet(null);
      toast({ title: "Dieta excluída." });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally { setDeletingDietId(null); }
  };

  const duplicateDietById = (diet: ActiveDiet) => {
    const base = dietToForm(diet);
    setForm({
      ...base,
      title: `${base.title} (cópia)`,
      meals: base.meals.map((m) => ({
        ...m,
        _key: crypto.randomUUID(),
        dbId: undefined,
        foods: m.foods.map((f) => ({ ...f, _key: crypto.randomUUID() })),
      })),
    });
    setView("form");
  };

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
        setCalcWeight(String(data.weight));
      }
    } catch {}
  };

  const duplicateDiet = () => {
    if (!activeDiet) return;
    duplicateDietById(activeDiet);
  };

  const calcGet = () => {
    const protocol = TMB_PROTOCOLS[calcProtocol];
    if (!protocol) return;
    const P = parseFloat(calcWeight);
    const A = parseFloat(calcHeight);
    const I = parseFloat(calcAge);
    const af = parseFloat(calcActivity);
    if (!P || !I || (protocol.needsHeight && !A)) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    const tmb = Math.round(protocol.calc(calcSex, P, A, I));
    const get = Math.round(tmb * af);
    setCalcResult({ tmb, get });
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
    dias_semana: diet.dias_semana ?? [],
    observacoes: diet.observacoes ?? "",
    refeicao_livre: diet.refeicao_livre ?? "",
    info_adicional: diet.info_adicional ?? "",
    meta_agua_ml: diet.meta_agua_ml != null ? String(diet.meta_agua_ml) : "",
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
          const listaGrupoId = f.lista_subst_grupo_id ?? null;
          const resolvedParentKey = parentId ? (dbIdToKey[parentId] ?? null) : null;
          return {
            _key,
            alimento_id: listaGrupoId ? null : (f.alimento_id ?? null),
            alimento:    listaGrupoId ? null : (f.alimentos ?? null),
            nome_display: listaGrupoId ? "" : (f.alimentos?.nome ?? f.name ?? ""),
            quantidade:  listaGrupoId ? "0" : (f.quantidade?.toString() ?? "100"),
            unidade:     f.unidade ?? "g",
            order_index: f.order_index,
            substitution_group_id: null,
            parent_key: resolvedParentKey,
            lista_subst_grupo_id: listaGrupoId,
            lista_subst_porcoes: f.lista_subst_porcoes?.toString() ?? "1",
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
    const files = Array.from(e.target.files ?? []);
    const allValid = files.length > 0 && files.every((f) => f.type === "application/pdf" || f.type.startsWith("image/"));
    if (!allValid) { toast({ title: "Selecione um ou mais PDFs ou imagens/prints", variant: "destructive" }); return; }
    setPdfLoading(true);
    try {
      // Convert each file to base64 in chunks to avoid stack overflow on large files
      const toBase64 = async (file: File): Promise<string> => {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
        }
        return btoa(binary);
      };
      const encodedFiles = await Promise.all(files.map(async (f) => ({ base64: await toBase64(f), mediaType: f.type })));

      const { data, error } = await supabase.functions.invoke("parse-diet-pdf", {
        body: { files: encodedFiles },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "Erro no parse");
      const d = data.diet;

      // Interpreta a porção extraída do PDF (ex: "200g", "1 unidade", "2 fatias")
      // em gramas/ml. Peso explícito (g/ml/kg/l) é usado direto; quantidade sem
      // peso (unidade/fatia/etc.) é multiplicada pelo peso de 1 unidade do
      // alimento vinculado — se soubermos (depende do cadastro ter essa info,
      // como já acontece em "Ovo cozido inteiro" = 50g/unidade).
      const parsePortionGrams = (portion: string | null | undefined, gramsPerUnit: number | null): number | null => {
        if (!portion) return null;
        const s = portion.toLowerCase().replace(",", ".");
        const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)?/);
        if (!m) return null;
        const num = parseFloat(m[1]);
        if (isNaN(num)) return null;
        const unit = m[2];
        if (unit === "kg" || unit === "l") return num * 1000;
        if (unit === "g" || unit === "ml") return num;
        return gramsPerUnit != null ? num * gramsPerUnit : null;
      };

      // Constrói uma linha de alimento (principal ou substituto nomeado) já
      // tentando vincular ao cadastro por similaridade (pg_trgm) e aplicando
      // a quantidade real do PDF — é só uma sugestão pra poupar trabalho
      // manual na revisão; se falhar por qualquer motivo, segue sem vínculo.
      const buildFoodRow = async (name: string, portion: string | null | undefined, orderIndex: number, parentKey: string | null) => {
        const food = {
          _key: uid(), alimento_id: null as string | null, alimento: null as Alimento | null,
          nome_display: name ?? "", quantidade: "100", unidade: "g", order_index: orderIndex,
          parent_key: parentKey, lista_subst_grupo_id: null as string | null, lista_subst_porcoes: "1",
        };
        try {
          const { data: matches } = await supabase.rpc("match_alimento", { termo: food.nome_display });
          const best = matches?.[0];
          if (best) {
            food.alimento_id = best.id;
            food.alimento = best;
            food.nome_display = best.nome;
          }
          const grams = parsePortionGrams(portion, best?.porcao_gramas ?? null);
          food.quantidade = grams != null ? String(grams)
            : (best?.porcao_gramas != null ? String(best.porcao_gramas) : food.quantidade);
        } catch { /* sem vínculo automático — segue com o alimento como extraído */ }
        return food;
      };

      // Busca o id do grupo da lista de substituição pelo número, dentro da
      // própria org (RLS já garante isso) — cacheado pra não repetir a mesma
      // consulta quando o mesmo grupo é citado várias vezes na dieta.
      const groupCache = new Map<number, string | null>();
      const findGroupId = async (numero: number): Promise<string | null> => {
        if (groupCache.has(numero)) return groupCache.get(numero)!;
        let id: string | null = null;
        try {
          const { data: grupo } = await supabase.from("lista_subst_grupos")
            .select("id").eq("org_id", orgId).eq("numero", numero).maybeSingle();
          id = grupo?.id ?? null;
        } catch { /* sem grupo encontrado — segue sem vincular */ }
        groupCache.set(numero, id);
        return id;
      };

      const parsedMeals = await Promise.all((d.meals ?? []).map(async (m: any) => {
        const foods: any[] = [];
        let orderIndex = 0;
        for (const f of (m.foods ?? [])) {
          const mainFood = await buildFoodRow(f.name, f.portion, orderIndex++, null);
          foods.push(mainFood);
          for (const sub of (f.substitutions ?? [])) {
            try {
              if (sub.type === "group" && sub.numero != null) {
                const groupId = await findGroupId(Number(sub.numero));
                if (groupId) {
                  foods.push({
                    _key: uid(), alimento_id: null, alimento: null,
                    nome_display: "", quantidade: "0", unidade: "g", order_index: orderIndex++,
                    parent_key: mainFood._key, lista_subst_grupo_id: groupId,
                    lista_subst_porcoes: sub.porcoes != null ? String(sub.porcoes) : "1",
                  });
                }
              } else if (sub.type === "food" && sub.name) {
                foods.push(await buildFoodRow(sub.name, sub.portion, orderIndex++, mainFood._key));
              }
            } catch { /* substituição individual falhou — segue sem ela */ }
          }
        }
        return {
          _key: uid(), name: m.name ?? "",
          time_suggestion: m.time_suggestion ?? "", notes: m.notes ?? "",
          order_index: m.order_index ?? 0,
          foods,
        };
      }));

      setForm({
        ...emptyForm(),
        title: d.title ?? "",
        meals: parsedMeals,
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
        .insert({
          student_id: studentUserId,
          org_id: orgId,
          title: form.title.trim(),
          calories: total.kcal > 0 ? total.kcal : null,
          is_active: true,
          dias_semana: form.dias_semana.length > 0 ? form.dias_semana : null,
          observacoes: form.observacoes.trim() || null,
          refeicao_livre: form.refeicao_livre.trim() || null,
          info_adicional: form.info_adicional.trim() || null,
          meta_agua_ml: form.meta_agua_ml ? Number(form.meta_agua_ml) : null,
        })
        .select("id, is_active").single();
      if (dietErr) throw dietErr;
      if (!newDiet?.is_active) throw new Error("A dieta foi criada, mas não ficou ativa.");

      for (const [mi, meal] of form.meals.entries()) {
        const { data: newMeal, error: mealErr } = await supabase.from("diet_meals")
          .insert({ diet_id: newDiet.id, name: meal.name || `Refeição ${mi + 1}`, time_suggestion: meal.time_suggestion || null, notes: meal.notes || null, observacoes_receita: meal.observacoes_receita || null, modo_preparo: meal.modo_preparo || null, order_index: mi })
          .select("id").single();
        if (mealErr) throw mealErr;

        // Migra refeições alternativas da versão anterior desta refeição — todo save
        // recria diet_meals com IDs novos, então sem isso as alternativas (presas no
        // meal_id antigo) ficavam órfãs na versão desativada e "sumiam" da dieta ativa.
        if (meal.dbId) {
          const { data: oldAlts, error: oldAltsErr } = await supabase
            .from("meal_alternatives")
            .select("nome, ordem, meal_alternative_foods (alimento_id, nome_display, ordem, quantidade, unidade)")
            .eq("meal_id", meal.dbId)
            .order("ordem");
          if (oldAltsErr) throw oldAltsErr;
          for (const alt of oldAlts ?? []) {
            const { data: newAlt, error: newAltErr } = await supabase.from("meal_alternatives")
              .insert({ meal_id: newMeal.id, nome: alt.nome, ordem: alt.ordem })
              .select("id").single();
            if (newAltErr) throw newAltErr;
            const altFoods = (alt.meal_alternative_foods ?? []) as { alimento_id: string | null; nome_display: string | null; ordem: number; quantidade: number | null; unidade: string | null }[];
            if (altFoods.length > 0) {
              const { error: newFoodsErr } = await supabase.from("meal_alternative_foods").insert(
                altFoods.map((f) => ({
                  alternative_id: newAlt.id,
                  alimento_id: f.alimento_id,
                  nome_display: f.nome_display,
                  ordem: f.ordem,
                  quantidade: f.quantidade,
                  unidade: f.unidade,
                }))
              );
              if (newFoodsErr) throw newFoodsErr;
            }
          }
        }

        // Save main foods first (parent_key === null), get their DB IDs
        const mainFoods = meal.foods.filter((f) => !f.parent_key && (
          f.lista_subst_grupo_id !== null
            ? !!f.lista_subst_grupo_id // lista ref: must have a group selected
            : (f.nome_display.trim() || !!f.alimento_id) // normal food: must have name or alimento
        ));
        const keyToDbId: Record<string, string> = {};
        for (const [fi, f] of mainFoods.entries()) {
          const isListaRef = f.lista_subst_grupo_id !== null && !!f.lista_subst_grupo_id;
          const { data: savedFood, error: fErr } = await supabase.from("diet_meal_foods")
            .insert({
              meal_id: newMeal.id,
              name: isListaRef
                ? (f.nome_display.trim() || "Lista de Substituição")
                : (f.alimento?.nome ?? f.nome_display.trim()),
              portion: isListaRef ? null : (f.quantidade ? `${f.quantidade}${f.unidade}` : null),
              alimento_id: isListaRef ? null : (f.alimento_id ?? null),
              quantidade: isListaRef ? null : (f.quantidade ? parseFloat(f.quantidade) : null),
              unidade: isListaRef ? null : f.unidade,
              order_index: fi,
              parent_food_id: null,
              lista_subst_grupo_id: isListaRef ? f.lista_subst_grupo_id : null,
              lista_subst_porcoes: isListaRef ? (parseFloat(f.lista_subst_porcoes) || 1) : null,
            }).select("id").single();
          if (fErr) throw fErr;
          keyToDbId[f._key] = savedFood.id;
        }

        // Save substitutes referencing their parent's DB ID
        const subFoods = meal.foods.filter((f) => f.parent_key && (
          f.lista_subst_grupo_id !== null
            ? !!f.lista_subst_grupo_id
            : (f.nome_display.trim() || !!f.alimento_id)
        ));
        if (subFoods.length > 0) {
          const subRows = subFoods
            .filter((f) => keyToDbId[f.parent_key!])
            .map((f, fi) => {
              const isListaRef = f.lista_subst_grupo_id !== null && !!f.lista_subst_grupo_id;
              return {
                meal_id: newMeal.id,
                name: isListaRef ? "Lista de Substituição" : (f.alimento?.nome ?? f.nome_display.trim()),
                portion: isListaRef ? null : (f.quantidade ? `${f.quantidade}${f.unidade}` : null),
                alimento_id: isListaRef ? null : (f.alimento_id ?? null),
                quantidade: isListaRef ? null : (f.quantidade ? parseFloat(f.quantidade) : null),
                unidade: isListaRef ? null : f.unidade,
                order_index: fi,
                parent_food_id: keyToDbId[f.parent_key!],
                lista_subst_grupo_id: isListaRef ? f.lista_subst_grupo_id : null,
                lista_subst_porcoes: isListaRef ? (parseFloat(f.lista_subst_porcoes) || 1) : null,
              };
            });
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

      void (async () => {
        try {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabase.from("notificacoes")
            .select("id").eq("user_id", studentUserId)
            .eq("tipo", "dieta_atualizada").gte("created_at", oneHourAgo).limit(1);
          if (!existing || existing.length === 0) {
            await supabase.from("notificacoes").insert({
              user_id: studentUserId,
              org_id: orgId,
              titulo: "Dieta atualizada",
              mensagem: "Seu plano alimentar foi atualizado. Clique em \"Ver dieta\" e confira.",
              tipo: "dieta_atualizada",
            });
          }
        } catch {}
      })();

      await loadActiveDiet();
      await loadAllDiets();
      setSelectedDietId(null);
      setViewingDiet(null);
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
            nome_display: f.lista_subst_grupo_id ? "" : (f.alimentos?.nome ?? f.name ?? ""),
            quantidade: f.quantidade?.toString() ?? "100",
            unidade: f.unidade ?? "g", order_index: f.order_index,
            substitution_group_id: null,
            parent_key: (f as any).parent_food_id ?? null,
            lista_subst_grupo_id: f.lista_subst_grupo_id ?? null,
            lista_subst_porcoes: f.lista_subst_porcoes?.toString() ?? "1",
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
          {activeDiet && (
            <Button size="sm" variant="ghost" onClick={duplicateDiet}
              className="rounded-md h-8 px-3 border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs bg-transparent dark:border-white/10 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5">
              <Copy className="w-3.5 h-3.5 mr-1.5" />Duplicar plano
            </Button>
          )}
          <label>
            <input ref={fileInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={handlePdfUpload} />
            <Button size="sm" type="button" variant="ghost" disabled={pdfLoading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md h-8 px-3 border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs bg-transparent dark:border-white/10 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5">
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 mr-1.5" />}
              {pdfLoading ? "Processando..." : "Importar PDF/print"}
            </Button>
          </label>
          {allDiets.length > 1 && (() => {
            const currentDiet = selectedDietId
              ? allDiets.find((d) => d.id === selectedDietId)
              : allDiets.find((d) => d.is_active) ?? allDiets[0];
            return (
              <DietDropdown
                diets={allDiets}
                selectedId={currentDiet?.id ?? null}
                onSelect={handleSelectDiet}
              />
            );
          })()}
        </div>

        {/* Viewing an inactive diet (readonly) */}
        {(() => {
          const isViewingInactive = selectedDietId && !allDiets.find((d) => d.id === selectedDietId)?.is_active;
          if (!isViewingInactive) return null;
          if (loadingViewing) return (
            <div className="flex items-center justify-center py-10 gap-2 text-white/25">
              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
            </div>
          );
          if (!viewingDiet) return null;
          const vMacros = viewingDiet.diet_meals.length > 0
            ? totalMacros(viewingDiet.diet_meals.map((m) => ({
                _key: m.id, name: m.name, time_suggestion: m.time_suggestion ?? "",
                notes: m.notes ?? "", observacoes_receita: m.observacoes_receita ?? "",
                modo_preparo: m.modo_preparo ?? "", order_index: m.order_index,
                foods: m.diet_meal_foods.map((f) => ({
                  _key: f.id, alimento_id: f.alimento_id ?? null, alimento: f.alimentos ?? null,
                  nome_display: f.lista_subst_grupo_id ? "" : (f.alimentos?.nome ?? f.name ?? ""),
                  quantidade: f.quantidade?.toString() ?? "100", unidade: f.unidade ?? "g",
                  order_index: f.order_index, substitution_group_id: null,
                  parent_key: f.parent_food_id ?? null,
                  lista_subst_grupo_id: f.lista_subst_grupo_id ?? null,
                  lista_subst_porcoes: f.lista_subst_porcoes?.toString() ?? "1",
                })),
              })))
            : ZERO;
          return (
            <div className="space-y-3">
              {/* Header readonly */}
              <div className="rounded-lg border border-white/8 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white/80 text-sm truncate">{viewingDiet.title}</p>
                      <span className="text-[10px] bg-white/8 text-white/40 px-2 py-0.5 rounded-full font-medium shrink-0">inativa</span>
                    </div>
                  </div>
                  {vMacros.kcal > 0 && (
                    <div className="flex items-center gap-3 text-[11px] shrink-0">
                      <span className="text-white/60 font-semibold">{vMacros.kcal} kcal</span>
                      <span className="text-white/35">C {vMacros.carb}g</span>
                      <span className="text-white/35">P {vMacros.prot}g</span>
                      <span className="text-white/35">G {vMacros.gord}g</span>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-white/5">
                  {[...viewingDiet.diet_meals].sort((a, b) => a.order_index - b.order_index).map((meal) => {
                    const visibleFoods = meal.diet_meal_foods
                      .filter((f) => !f.parent_food_id && !f.lista_subst_grupo_id)
                      .sort((a, b) => a.order_index - b.order_index);
                    return (
                      <div key={meal.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {meal.time_suggestion && <span className="text-xs text-white/35 font-mono">{meal.time_suggestion}</span>}
                          <p className="text-sm text-white/75 font-medium">{meal.name}</p>
                        </div>
                        <div className="space-y-0.5">
                          {visibleFoods.map((f) => (
                            <div key={f.id} className="flex items-baseline gap-2 text-xs">
                              <span className="text-white/20">•</span>
                              <span className="text-white/50">{f.alimentos?.nome ?? f.name}</span>
                              {f.quantidade && <span className="text-white/25">{f.quantidade}{f.unidade ?? "g"}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Actions for inactive diet */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleReactivate(viewingDiet.id)}
                  disabled={reactivating}
                  className="flex items-center gap-1.5 text-xs font-semibold h-8 px-3 rounded-lg transition-colors disabled:opacity-40"
                  style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#4ade80" }}
                >
                  {reactivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Reativar esta dieta
                </button>
                <button
                  onClick={() => duplicateDietById(viewingDiet)}
                  className="flex items-center gap-1.5 text-xs font-semibold h-8 px-3 rounded-lg transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                >
                  <Copy className="w-3.5 h-3.5" />Duplicar como base
                </button>
                {confirmDeleteId === viewingDiet.id ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-white/40">Excluir?</span>
                    <button
                      onClick={() => handleDeleteDiet(viewingDiet.id)}
                      disabled={deletingDietId === viewingDiet.id}
                      className="text-xs px-2 h-7 rounded-lg font-semibold disabled:opacity-40"
                      style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
                    >
                      {deletingDietId === viewingDiet.id ? "..." : "Sim"}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 h-7 rounded-lg font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>Não</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(viewingDiet.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold h-8 px-3 rounded-lg transition-colors ml-auto"
                    style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "rgba(248,113,113,0.7)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />Apagar dieta
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Show active diet only when not viewing an inactive one */}
        {(selectedDietId === null || allDiets.find((d) => d.id === selectedDietId)?.is_active) && activeDiet ? (
          <>
            {/* Delete active diet */}
            <div className="flex justify-end">
              {confirmDeleteId === activeDiet.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/40">Excluir dieta ativa?</span>
                  <button onClick={() => handleDeleteDiet(activeDiet.id)} disabled={deletingDietId === activeDiet.id} className="text-xs px-2 h-7 rounded-lg font-semibold disabled:opacity-40" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                    {deletingDietId === activeDiet.id ? "..." : "Sim"}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 h-7 rounded-lg font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>Não</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(activeDiet.id)} className="flex items-center gap-1.5 text-xs h-7 px-2 rounded-lg transition-colors" style={{ color: "rgba(248,113,113,0.5)" }}>
                  <Trash2 className="w-3 h-3" />Apagar dieta
                </button>
              )}
            </div>

            {/* Diet header */}
            <div className="rounded-lg border border-border bg-card overflow-hidden dark:bg-[#121216] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 dark:border-white/6">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground text-sm truncate dark:text-white">{activeDiet.title}</p>
                    <span className="text-[10px] bg-green-600/20 text-green-500 px-2 py-0.5 rounded-full font-medium shrink-0">ativa</span>
                  </div>
                  {activeDiet.dias_semana && activeDiet.dias_semana.length > 0 && (
                    <div className="flex gap-1">
                      {DIAS_SEMANA.map((d) => (
                        <span key={d.key} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${activeDiet.dias_semana!.includes(d.key) ? 'bg-green-600/20 text-green-400' : 'text-foreground/20 dark:text-white/15'}`}>{d.label}</span>
                      ))}
                    </div>
                  )}
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

              {/* Meal rows — and optional extra info at bottom */}
              <div className="divide-y divide-border dark:divide-white/5">
                {[...activeDiet.diet_meals]
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((meal) => {
                    const mFoods = meal.diet_meal_foods.map((f) => ({
                      _key: f.id, alimento_id: f.alimento_id ?? null, alimento: f.alimentos ?? null,
                      nome_display: f.lista_subst_grupo_id ? "" : (f.alimentos?.nome ?? f.name ?? ""),
                      quantidade: f.quantidade?.toString() ?? "100",
                      unidade: f.unidade ?? "g", order_index: f.order_index,
                      substitution_group_id: null,
                      parent_key: f.parent_food_id ?? null,
                      lista_subst_grupo_id: f.lista_subst_grupo_id ?? null,
                      lista_subst_porcoes: f.lista_subst_porcoes?.toString() ?? "1",
                    }));
                    const mRow: MealRow = { _key: meal.id, name: meal.name, time_suggestion: meal.time_suggestion ?? "", notes: meal.notes ?? "", observacoes_receita: meal.observacoes_receita ?? "", modo_preparo: meal.modo_preparo ?? "", order_index: meal.order_index, foods: mFoods };
                    const mm = mealMacros(mRow);
                    const visibleFoods = mFoods
                      .filter((f) => !f.parent_key)
                      .sort((a, b) => a.order_index - b.order_index);
                    return (
                      <div key={meal.id} className="px-4 py-3 transition-colors group hover:bg-muted/60 dark:bg-[#141417] dark:hover:bg-[#17181c]">
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
                                  if (food.lista_subst_grupo_id) {
                                    const porcoes = parseFloat(food.lista_subst_porcoes) || 1;
                                    return (
                                      <div key={food._key} className="flex items-baseline gap-2 text-xs">
                                        <ListOrdered className="w-3 h-3 shrink-0 opacity-50" style={{ color: "var(--cp-400)" }} />
                                        <span className="text-foreground/55 italic">
                                          {porcoes === 1 ? "1 porção" : `${porcoes} porções`} da Lista
                                        </span>
                                      </div>
                                    );
                                  }
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

            {activeDiet.meta_agua_ml != null && (
              <div className="rounded-lg border border-border bg-card p-3 dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 dark:text-white/40">Meta de água diária</p>
                <p className="text-sm text-foreground/80 dark:text-white/70">{(activeDiet.meta_agua_ml / 1000).toFixed(1)}L ({activeDiet.meta_agua_ml}ml)</p>
              </div>
            )}

            {/* Observações / refeição livre */}
            {(activeDiet.observacoes || activeDiet.refeicao_livre || activeDiet.info_adicional) && (
              <div className="space-y-2">
                {activeDiet.observacoes && (
                  <div className="rounded-lg border border-border bg-card p-3 dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 dark:text-white/40">Observações gerais</p>
                    <p className="text-sm text-foreground/80 dark:text-white/70 whitespace-pre-wrap">{activeDiet.observacoes}</p>
                  </div>
                )}
                {activeDiet.refeicao_livre && (
                  <div className="rounded-lg border border-border bg-card p-3 dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 dark:text-white/40">Refeição livre</p>
                    <p className="text-sm text-foreground/80 dark:text-white/70">{activeDiet.refeicao_livre}</p>
                  </div>
                )}
                {activeDiet.info_adicional && (
                  <div className="rounded-lg border border-border bg-card p-3 dark:bg-[#141417] dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 dark:text-white/40">Informações adicionais</p>
                    <p className="text-sm text-foreground/80 dark:text-white/70 whitespace-pre-wrap">{activeDiet.info_adicional}</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (selectedDietId === null || allDiets.find((d) => d.id === selectedDietId)?.is_active) ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center dark:border-white/10">
            <p className="text-muted-foreground text-sm mb-1 dark:text-white/30">Nenhuma dieta ativa</p>
            <p className="text-muted-foreground/80 text-xs dark:text-white/20">Crie uma nova dieta ou importe via PDF</p>
          </div>
        ) : null}

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

        {/* Dias da semana */}
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Dias da semana</Label>
          <div className="flex gap-1.5">
            {DIAS_SEMANA.map((d) => {
              const active = form.dias_semana.includes(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    dias_semana: active
                      ? f.dias_semana.filter((k) => k !== d.key)
                      : [...f.dias_semana, d.key],
                  }))}
                  className="flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? "rgba(var(--cp-rgb),0.18)" : "var(--ui-inactive-bg)",
                    color: active ? "var(--cp-400)" : "var(--ui-inactive-color)",
                    border: active ? "1px solid rgba(var(--cp-rgb),0.3)" : "1px solid var(--ui-inactive-border)",
                  }}>
                  {d.label}
                </button>
              );
            })}
          </div>
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

          {/* Container recuado: as refeições agora são cards próprios, então o
              divide-y saiu (redundante) e o fundo escurece pra elas avançarem. */}
          <div className="rounded-lg border border-border bg-card p-2 space-y-2 dark:border-white/8 dark:bg-[#0f0f12]">
            {form.meals.map((meal, mi) => {
              const mm = mealMacros(meal);
              const foodCount = meal.foods.filter((f) => f.nome_display.trim() || f.alimento_id).length;
              return (
                <div key={meal._key} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card transition-colors group hover:bg-muted/60 dark:border-white/10 dark:bg-[#141417] dark:hover:bg-[#17181c] shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Time input */}
                    <TimeField
                      value={meal.time_suggestion}
                      onChange={(v) => updateMeal(meal._key, { ...meal, time_suggestion: v })}
                      className="bg-transparent border-0 border-b border-border text-muted-foreground text-xs rounded-none h-7 w-14 px-0 text-center focus-visible:ring-0 focus:border-green-600/50 placeholder:text-muted-foreground/50 dark:border-white/10 dark:text-white/60 cursor-pointer" />

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

        {/* ── TMB/GET Calculator ──────────────────────────────────── */}
        {/* Antes era uma barra apagada com um "Calcular" em texto cinza à
            direita — não se lia como algo clicável que expande. Agora: card com
            relevo, ícone, subtítulo dizendo o que a ferramenta faz, chevron que
            gira ao abrir e o "Calcular" como pílula na cor primária da org. */}
        <div className="rounded-lg border border-border overflow-hidden dark:border-white/10 shadow-sm dark:shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] dark:bg-[#141417]">
          <button
            type="button"
            onClick={() => { setCalcOpen((o) => !o); setCalcResult(null); }}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors dark:hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(var(--cp-rgb), 0.12)" }}
              >
                <Calculator className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground dark:text-white">
                  Análise de Gasto Energético (TMB/GET)
                </p>
                <p className="text-[11px] text-muted-foreground dark:text-white/45 truncate">
                  Estime as calorias que o aluno gasta por dia para ajustar a meta da dieta
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!calcOpen && (
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: "rgba(var(--cp-rgb), 0.15)", color: "var(--cp-400)" }}
                >
                  Calcular
                </span>
              )}
              <ChevronDown
                className="w-4 h-4 text-muted-foreground dark:text-white/40 transition-transform duration-200"
                style={{ transform: calcOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </div>
          </button>

          {calcOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-border dark:border-white/6">
              {/* Protocol selector */}
              <div className="space-y-1 pt-3">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/50">Protocolo</Label>
                <select
                  value={calcProtocol}
                  onChange={(e) => { setCalcProtocol(e.target.value); setCalcResult(null); }}
                  className="w-full h-9 px-3 text-sm rounded-md"
                  style={{ backgroundColor: "var(--surface-2)", color: "hsl(var(--foreground))", border: "1px solid var(--border-subtle)" }}
                >
                  {Object.entries(TMB_PROTOCOLS).map(([key, p]) => (
                    <option key={key} value={key}>{p.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground dark:text-white/35 leading-relaxed mt-1">
                  {TMB_PROTOCOLS[calcProtocol]?.desc}
                </p>
              </div>

              {/* Sex toggle */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/50">Sexo biológico</Label>
                <div className="flex gap-2">
                  {(['M', 'F'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setCalcSex(s); setCalcResult(null); }}
                      className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: calcSex === s ? "rgba(var(--cp-rgb),0.18)" : "var(--ui-inactive-bg)",
                        color: calcSex === s ? "var(--cp-400)" : "var(--ui-inactive-color)",
                        border: calcSex === s ? "1px solid rgba(var(--cp-rgb),0.3)" : "1px solid var(--ui-inactive-border)",
                      }}>
                      {s === 'M' ? 'Masculino' : 'Feminino'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inputs grid */}
              <div className={`grid gap-3 ${TMB_PROTOCOLS[calcProtocol]?.needsHeight ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/50">Peso (kg)</Label>
                  <Input value={calcWeight} onChange={(e) => { setCalcWeight(e.target.value); setCalcResult(null); }} placeholder="75" type="number"
                    className="bg-background border-border text-foreground h-9 rounded-md dark:bg-white/5 dark:border-white/10 dark:text-white" />
                </div>
                {TMB_PROTOCOLS[calcProtocol]?.needsHeight && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/50">Altura (cm)</Label>
                    <Input value={calcHeight} onChange={(e) => { setCalcHeight(e.target.value); setCalcResult(null); }} placeholder="175" type="number"
                      className="bg-background border-border text-foreground h-9 rounded-md dark:bg-white/5 dark:border-white/10 dark:text-white" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/50">Idade (anos)</Label>
                  <Input value={calcAge} onChange={(e) => { setCalcAge(e.target.value); setCalcResult(null); }} placeholder="30" type="number"
                    className="bg-background border-border text-foreground h-9 rounded-md dark:bg-white/5 dark:border-white/10 dark:text-white" />
                </div>
              </div>

              {/* Activity level */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/50">Nível de atividade física</Label>
                <select
                  value={calcActivity}
                  onChange={(e) => { setCalcActivity(e.target.value); setCalcResult(null); }}
                  className="w-full h-9 px-3 text-sm rounded-md"
                  style={{ backgroundColor: "var(--surface-2)", color: "hsl(var(--foreground))", border: "1px solid var(--border-subtle)" }}
                >
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label} — {a.desc}</option>
                  ))}
                </select>
              </div>

              {/* Calc button */}
              <button
                type="button"
                onClick={calcGet}
                className="w-full h-9 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--cp-gradient)" }}>
                Calcular GET
              </button>

              {/* Result */}
              {calcResult && (
                <div className="rounded-md p-3 space-y-2" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", border: "1px solid rgba(var(--cp-rgb),0.15)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/40">TMB</p>
                      <p className="text-lg font-bold" style={{ color: "var(--cp-400)" }}>{calcResult.tmb} kcal</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/40">GET (com atividade)</p>
                      <p className="text-2xl font-bold text-foreground dark:text-white">{calcResult.get} kcal</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const obs = (form.observacoes ? form.observacoes + "\n" : "") +
                        `GET calculado (${TMB_PROTOCOLS[calcProtocol]?.label}): ${calcResult!.get} kcal/dia (TMB: ${calcResult!.tmb} kcal)`;
                      setForm((f) => ({ ...f, observacoes: obs }));
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground dark:text-white/40 dark:hover:text-white/70 underline underline-offset-2 transition-colors">
                    Copiar resultado para Observações
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Meta de água ──────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Meta de água diária (ml)</Label>
          <Input
            type="number"
            value={form.meta_agua_ml}
            onChange={(e) => setForm((f) => ({ ...f, meta_agua_ml: e.target.value }))}
            placeholder="Ex: 2500"
            className="bg-background border-border text-foreground rounded-md h-9 placeholder:text-muted-foreground/60 focus:border-green-600/40 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/20" />
        </div>

        {/* ── Observações / Refeição livre ──────────────────────── */}
        <div className="space-y-3">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Observações gerais</Label>
          <Textarea
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            placeholder="Orientações gerais sobre a dieta, dicas de hidratação, suplementação, etc."
            rows={4}
            className="bg-background border-border text-foreground rounded-md placeholder:text-muted-foreground/60 focus:border-green-600/40 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/20 resize-none" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Refeição livre</Label>
          <Input
            value={form.refeicao_livre}
            onChange={(e) => setForm((f) => ({ ...f, refeicao_livre: e.target.value }))}
            placeholder="Ex: Uma refeição livre por semana, sem excessos"
            className="bg-background border-border text-foreground rounded-md h-9 placeholder:text-muted-foreground/60 focus:border-green-600/40 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/20" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider dark:text-white/60">Informações adicionais</Label>
          <Textarea
            value={form.info_adicional}
            onChange={(e) => setForm((f) => ({ ...f, info_adicional: e.target.value }))}
            placeholder="Outras informações relevantes..."
            rows={2}
            className="bg-background border-border text-foreground rounded-md placeholder:text-muted-foreground/60 focus:border-green-600/40 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/20 resize-none" />
        </div>

        {/* Lembrete de alternativas para dietas novas */}
        {view !== "pdf-preview" && form.meals.every((m) => !m.dbId) && (
          <p className="text-[11px] text-muted-foreground text-center dark:text-white/25">
            Após salvar, você pode adicionar refeições alternativas pelo resumo da dieta.
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
