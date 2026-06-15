import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Search, Plus, Trash2, ChevronLeft, ChevronRight,
  Loader2, X, Pencil, Info,
} from "lucide-react";

// ── ADMIN e-mail ────────────────────────────────────────────────
const ADMIN_EMAIL = "lucas.melo1991@gmail.com";

// ── Types ──────────────────────────────────────────────────────
interface Alimento {
  id: string;
  nome: string;
  porcao_descricao: string | null;
  porcao_gramas: number | null;
  kcal: number | null;
  proteina_g: number | null;
  carb_g: number | null;
  gordura_g: number | null;
  fibra_g: number | null;
  fonte: string;
  org_id: string | null;
  status: string;
}

interface AlimentoDetail extends Alimento {
  gordura_saturada_g: number | null;
  gordura_poli_g: number | null;
  gordura_mono_g: number | null;
  gordura_trans_g: number | null;
  colesterol_mg: number | null;
  sodio_mg: number | null;
  potassio_mg: number | null;
  acucar_g: number | null;
  vitamina_a_ug: number | null;
  vitamina_c_mg: number | null;
  calcio_mg: number | null;
  ferro_mg: number | null;
}

type Fonte = "todos" | "global" | "org";

const PAGE_SIZE = 25;

// ── Helpers ────────────────────────────────────────────────────
const fonteBadge = (a: Alimento) => {
  if (a.status === "pendente") return { label: "Revisão", bg: "rgba(234,179,8,0.12)",  color: "#fbbf24" };
  if (a.fonte === "taco")      return { label: "TACO",    bg: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" };
  if (a.org_id)                return { label: "Minha",   bg: "rgba(99,102,241,0.12)", color: "#a5b4fc" };
  return                              { label: "Global",  bg: "rgba(34,197,94,0.12)",  color: "#86efac" };
};

const fmt = (v: number | null, suffix = "g") =>
  v != null ? `${v}${suffix}` : "—";

// ── FNum — campo numérico reutilizável (fora do modal para não remontar) ──
const FNum = ({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) => (
  <div>
    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">{label}</label>
    <input
      type="number"
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? "0"}
      step="0.1"
      className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
    />
  </div>
);

// ── NutritionDetailModal ───────────────────────────────────────
const NutritionDetailModal = ({
  alimentoId, onClose,
}: { alimentoId: string; onClose: () => void }) => {
  const [data, setData] = useState<AlimentoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: row, error } = await (supabase as any)
        .from("alimentos")
        .select(
          "id,nome,porcao_descricao,porcao_gramas,kcal,proteina_g,carb_g,gordura_g,fibra_g," +
          "gordura_saturada_g,gordura_poli_g,gordura_mono_g,gordura_trans_g," +
          "colesterol_mg,sodio_mg,potassio_mg,acucar_g," +
          "vitamina_a_ug,vitamina_c_mg,calcio_mg,ferro_mg,fonte,org_id,status"
        )
        .eq("id", alimentoId)
        .maybeSingle();
      if (error) console.error("[NutritionDetailModal] erro ao carregar alimento:", error);
      setData(row ?? null);
      setLoading(false);
    })();
  }, [alimentoId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/8 overflow-hidden"
        style={{ backgroundColor: "var(--modal-bg)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white truncate pr-4">
            {loading ? "Carregando..." : (data?.nome ?? "Alimento")}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-white/30">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : !data ? (
          <p className="text-center text-white/30 text-sm py-8">Dados não encontrados.</p>
        ) : (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Porção */}
            <div className="text-[11px] text-white/40 uppercase tracking-wider">
              Porção: <span className="text-white/65 normal-case">{data.porcao_descricao ?? (data.porcao_gramas ? `${data.porcao_gramas}g` : "100g")}</span>
            </div>

            {/* Calorias destacadas */}
            <div className="flex items-center justify-between pb-2 border-b border-white/8">
              <span className="text-sm font-bold text-white">Calorias</span>
              <span className="text-sm font-bold text-green-400">{fmt(data.kcal, " kcal")}</span>
            </div>

            {/* Gorduras */}
            <div className="space-y-1.5">
              <NutRow label="Gordura total"        value={fmt(data.gordura_g)} bold />
              <NutRow label="  Saturada"           value={fmt(data.gordura_saturada_g)} indent />
              <NutRow label="  Poliinsaturada"     value={fmt(data.gordura_poli_g)} indent />
              <NutRow label="  Monoinsaturada"     value={fmt(data.gordura_mono_g)} indent />
              <NutRow label="  Trans"              value={fmt(data.gordura_trans_g)} indent />
              <NutRow label="Colesterol"           value={fmt(data.colesterol_mg, " mg")} />
            </div>

            <div className="border-t border-white/6 pt-1 space-y-1.5">
              <NutRow label="Sódio"               value={fmt(data.sodio_mg, " mg")} />
              <NutRow label="Potássio"            value={fmt(data.potassio_mg, " mg")} />
              <NutRow label="Carboidratos totais" value={fmt(data.carb_g)} bold />
              <NutRow label="  Fibras alimentares" value={fmt(data.fibra_g)} indent />
              <NutRow label="  Açúcares"          value={fmt(data.acucar_g)} indent />
              <NutRow label="Proteína"            value={fmt(data.proteina_g)} bold />
            </div>

            {/* Vitaminas & Minerais */}
            {(data.vitamina_a_ug != null || data.vitamina_c_mg != null || data.calcio_mg != null || data.ferro_mg != null) && (
              <div className="border-t border-white/6 pt-2 space-y-1.5">
                {data.vitamina_a_ug != null && <NutRow label="Vitamina A" value={`${data.vitamina_a_ug} μg`} />}
                {data.vitamina_c_mg != null && <NutRow label="Vitamina C" value={`${data.vitamina_c_mg} mg`} />}
                {data.calcio_mg     != null && <NutRow label="Cálcio"     value={`${data.calcio_mg} mg`} />}
                {data.ferro_mg      != null && <NutRow label="Ferro"      value={`${data.ferro_mg} mg`} />}
              </div>
            )}

            {data.fonte === "taco" && (
              <p className="text-[10px] text-white/25 text-center pt-1">Fonte: Tabela TACO — UNICAMP</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const NutRow = ({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) => (
  <div className={`flex items-center justify-between ${indent ? "pl-3" : ""}`}>
    <span className={`text-sm ${bold ? "font-semibold text-white/85" : "text-white/55"}`}>{label}</span>
    <span className={`text-sm ${bold ? "font-semibold text-white" : "text-white/65"}`}>{value}</span>
  </div>
);

// ── Modal Adicionar / Editar Alimento ──────────────────────────
const emptyForm = {
  nome: "", porcao_qty: "100", porcao_unit: "g", porcao_outro: "",
  kcal: "", proteina_g: "", carb_g: "", gordura_g: "", fibra_g: "",
};

type FormShape = typeof emptyForm;

const alimentoToForm = (a: Alimento): FormShape => {
  const desc = a.porcao_descricao ?? "";
  // Try to parse "100g" → qty=100, unit=g
  const m = desc.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Záàãâéêíóôõúç. ]+)$/);
  const qty  = m ? m[1] : String(a.porcao_gramas ?? 100);
  const unit = m ? m[2].trim() : "g";
  const knownUnits = ["g","ml","unidade","fatia","col. sopa","col. chá","xícara","porção"];
  return {
    nome:        a.nome,
    porcao_qty:  qty,
    porcao_unit: knownUnits.includes(unit) ? unit : "outro",
    porcao_outro: knownUnits.includes(unit) ? "" : unit,
    kcal:        a.kcal        != null ? String(a.kcal)        : "",
    proteina_g:  a.proteina_g  != null ? String(a.proteina_g)  : "",
    carb_g:      a.carb_g      != null ? String(a.carb_g)      : "",
    gordura_g:   a.gordura_g   != null ? String(a.gordura_g)   : "",
    fibra_g:     a.fibra_g     != null ? String(a.fibra_g)     : "",
  };
};

interface FoodModalProps {
  open: boolean;
  mode: "add" | "edit";
  initial?: Alimento | null;
  onClose: () => void;
  orgId: string | null;
  onSaved: () => void;
}

const FoodModal = ({ open, mode, initial, onClose, orgId, onSaved }: FoodModalProps) => {
  const { toast } = useToast();
  const [form, setForm] = useState<FormShape>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(mode === "edit" && initial ? alimentoToForm(initial) : emptyForm);
  }, [open, mode, initial]);

  const set = (k: keyof FormShape) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const buildPorcaoDesc = (): string => {
    const qty  = form.porcao_qty.trim() || "100";
    const unit = form.porcao_unit === "outro" ? form.porcao_outro.trim() || "porção" : form.porcao_unit;
    return (unit === "g" || unit === "ml") ? `${qty}${unit}` : `${qty} ${unit}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        nome:             form.nome.trim(),
        porcao_descricao: buildPorcaoDesc(),
        porcao_gramas:    form.porcao_qty ? Number(form.porcao_qty) : null,
        kcal:             form.kcal       ? Number(form.kcal)       : null,
        proteina_g:       form.proteina_g ? Number(form.proteina_g) : null,
        carb_g:           form.carb_g     ? Number(form.carb_g)     : null,
        gordura_g:        form.gordura_g  ? Number(form.gordura_g)  : null,
        fibra_g:          form.fibra_g    ? Number(form.fibra_g)    : null,
      };

      let error: any;
      if (mode === "add") {
        const res = await supabase.from("alimentos").insert({
          ...payload, fonte: "org", org_id: orgId, status: "pendente",
        });
        error = res.error;
      } else {
        const res = await supabase.from("alimentos").update(payload).eq("id", initial!.id);
        error = res.error;
      }
      if (error) throw error;

      toast({
        title: mode === "add" ? "Alimento enviado para revisão!" : "Alimento atualizado!",
        description: mode === "add" ? "Ficará disponível na sua org até ser aprovado para o banco global." : undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.65)" }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--modal-bg)", border: "1px solid var(--modal-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">
            {mode === "add" ? "Novo Alimento" : "Editar Alimento"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Nome */}
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">Nome *</label>
            <input type="text" value={form.nome} onChange={set("nome")} placeholder="Ex: Arroz cozido"
              className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
          </div>

          {/* Porção base */}
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">Porção Base</label>
            <p className="text-[10px] text-white/30 mb-1.5">Os valores nutricionais abaixo são para esta quantidade</p>
            <div className="flex gap-2">
              <input type="number" value={form.porcao_qty} onChange={set("porcao_qty")} placeholder="100"
                className="w-24 shrink-0 h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors" />
              <select value={form.porcao_unit} onChange={set("porcao_unit")}
                className="flex-1 h-9 rounded-xl bg-white/5 border border-white/10 px-2 text-sm text-white cursor-pointer focus:outline-none focus:border-amber-500/40 transition-colors">
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
            {form.porcao_unit === "outro" && (
              <input type="text" value={form.porcao_outro} onChange={set("porcao_outro")}
                placeholder="Ex: sachê, scoop, tablete..."
                className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors mt-2" />
            )}
            <p className="text-[10px] text-white/25 mt-1">
              Exibido como: <span className="text-white/50 font-medium">{buildPorcaoDesc()}</span>
            </p>
          </div>

          {/* Macros */}
          <div className="border-t border-white/6 pt-3">
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Informação Nutricional</p>
            <div className="grid grid-cols-2 gap-3">
              <FNum label="Calorias (kcal)" value={form.kcal}       onChange={set("kcal")} />
              <FNum label="Proteína (g)"    value={form.proteina_g} onChange={set("proteina_g")} />
              <FNum label="Carboidrato (g)" value={form.carb_g}     onChange={set("carb_g")} />
              <FNum label="Gordura (g)"     value={form.gordura_g}  onChange={set("gordura_g")} />
              <FNum label="Fibra (g)"       value={form.fibra_g}    onChange={set("fibra_g")} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !form.nome.trim()}
              className="flex-1 h-10 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
              style={{ background: "var(--cp-gradient)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────
const BancoAlimentos = () => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();

  const [isAdmin, setIsAdmin] = useState(false);
  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fonte, setFonte]         = useState<Fonte>("todos");

  // Modals
  const [addOpen, setAddOpen]         = useState(false);
  const [editTarget, setEditTarget]   = useState<Alimento | null>(null);
  const [detailId, setDetailId]       = useState<string | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // Detect admin
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === ADMIN_EMAIL) setIsAdmin(true);
    });
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadAlimentos = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("alimentos")
        .select("id,nome,porcao_descricao,porcao_gramas,kcal,proteina_g,carb_g,gordura_g,fibra_g,fonte,org_id,status", { count: "exact" })
        .order("nome")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (debouncedSearch.trim()) q = q.ilike("nome", `%${debouncedSearch.trim()}%`);

      if (fonte === "org" && orgId) {
        // Minha org: aprovados E pendentes da própria org
        q = q.eq("org_id", orgId).in("status", ["aprovado", "pendente"]);
      } else if (fonte === "global") {
        // Global: apenas aprovados sem org
        q = q.eq("status", "aprovado").is("org_id", null);
      } else {
        // Todos: aprovados globais + aprovados/pendentes da própria org
        if (orgId) {
          q = q.or(`status.eq.aprovado,and(status.eq.pendente,org_id.eq.${orgId})`);
        } else {
          q = q.eq("status", "aprovado");
        }
      }

      const { data, count, error } = await q;
      if (error) throw error;
      setAlimentos(data as Alimento[]);
      setTotal(count ?? 0);
    } catch (err: any) {
      toast({ title: "Erro ao carregar alimentos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, fonte, orgId]);

  useEffect(() => { loadAlimentos(); }, [loadAlimentos]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este alimento?")) return;
    setDeletingId(id);
    try {
      // Soft-delete: marca status = 'removido' em vez de apagar a linha.
      // Hard DELETE violaria a FK diet_meal_foods_alimento_id_fkey caso
      // o alimento já esteja referenciado em planos alimentares.
      // A query de listagem filtra status = 'aprovado', então o alimento
      // desaparece da UI sem quebrar dados de dietas existentes.
      const { data: updated, error } = await supabase
        .from("alimentos")
        .update({ status: "removido" })
        .eq("id", id)
        .select("id");

      if (error) throw error;

      // Se RLS bloqueou silenciosamente, updated será array vazio
      if (!updated || updated.length === 0) {
        throw new Error("Sem permissão para remover este alimento.");
      }

      // Remove do estado local imediatamente
      setAlimentos(prev => prev.filter(a => a.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
      toast({ title: "Alimento removido." });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
      loadAlimentos();
    } finally {
      setDeletingId(null);
    }
  };

  // Determina se o usuário pode editar/excluir um alimento
  const canEdit   = (a: Alimento) => isAdmin || (!!a.org_id && a.org_id === orgId);
  const canDelete = (a: Alimento) => isAdmin || (!!a.org_id && a.org_id === orgId);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const FonteBtn = ({ value, label }: { value: Fonte; label: string }) => {
    const active = fonte === value;
    return (
      <button onClick={() => { setFonte(value); setPage(0); }}
        className={`px-3 h-8 rounded-xl text-xs font-medium transition-colors ${!active ? "bg-white/5 text-foreground/50 hover:bg-white/8 hover:text-foreground/70" : ""}`}
        style={active ? { background: "var(--cp-gradient)", color: "#fff" } : undefined}>
        {label}
      </button>
    );
  };

  return (
    <div className="px-6 lg:px-8 py-6 lg:py-8 max-w-5xl">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Banco de Alimentos</h1>
        <p className="text-foreground/40 text-sm mt-1">
          {total.toLocaleString()} alimento{total !== 1 ? "s" : ""} disponível{total !== 1 ? "is" : ""}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors" />
        </div>
        <div className="flex gap-1.5 items-center">
          <FonteBtn value="todos"  label="Todos" />
          <FonteBtn value="global" label="Global" />
          <FonteBtn value="org"    label="Minha org" />
        </div>
        <button onClick={() => setAddOpen(true)}
          className="h-10 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-2 shrink-0"
          style={{ background: "var(--cp-gradient)" }}>
          <Plus className="w-4 h-4" />
          Novo alimento
        </button>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        <div className="flex items-center px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/30"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}>
          <span className="flex-1">Nome</span>
          <span className="mr-20">Kcal</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-foreground/30">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : alimentos.length === 0 ? (
          <div className="py-16 text-center text-foreground/30 text-sm">
            {debouncedSearch ? `Nenhum alimento encontrado para "${debouncedSearch}"` : "Nenhum alimento encontrado."}
          </div>
        ) : (
          alimentos.map((a, idx) => {
            const badge   = fonteBadge(a);
            const portion = a.porcao_descricao ?? (a.porcao_gramas ? `${a.porcao_gramas}g` : null);
            return (
              <div key={a.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/3 cursor-pointer"
                style={{ borderBottom: idx < alimentos.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                onClick={() => setDetailId(a.id)}
              >
                {/* Nome + macros */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-foreground font-medium text-sm leading-snug">{a.nome}</span>
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {portion         && <span className="text-foreground/35 text-[11px]">{portion}</span>}
                    {a.proteina_g != null && <span className="text-red-400 text-[11px]">P {a.proteina_g}g</span>}
                    {a.carb_g     != null && <span className="text-yellow-500 text-[11px]">C {a.carb_g}g</span>}
                    {a.gordura_g  != null && <span className="text-blue-400 text-[11px]">G {a.gordura_g}g</span>}
                    {a.fibra_g    != null && <span className="text-green-400 text-[11px]">F {a.fibra_g}g</span>}
                  </div>
                </div>

                {/* Kcal */}
                <span className="text-green-500 text-sm font-semibold shrink-0 w-14 text-right">
                  {a.kcal != null ? `${a.kcal}` : "—"}
                </span>

                {/* Info icon — sempre visível */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDetailId(a.id); }}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-foreground/20 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Ver informações nutricionais"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>

                {/* Editar — apenas para quem pode */}
                {canEdit(a) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditTarget(a); }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-foreground/20 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title="Editar alimento"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Excluir — apenas para quem pode */}
                {canDelete(a) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                    disabled={deletingId === a.id}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-foreground/20 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    title="Excluir alimento"
                  >
                    {deletingId === a.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-white/30">
            Página {page + 1} de {totalPages} · {total.toLocaleString()} resultados
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/8 text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i;
              if (totalPages > 5) {
                const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                p = start + i;
              }
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-medium transition-colors ${p !== page ? "text-foreground/50 hover:text-foreground/80 hover:bg-white/5" : ""}`}
                  style={p === page ? { background: "var(--cp-gradient)", color: "#fff" } : undefined}>
                  {p + 1}
                </button>
              );
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/8 text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <FoodModal
        open={addOpen}
        mode="add"
        onClose={() => setAddOpen(false)}
        orgId={orgId}
        onSaved={loadAlimentos}
      />
      <FoodModal
        open={!!editTarget}
        mode="edit"
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        orgId={orgId}
        onSaved={loadAlimentos}
      />
      {detailId && (
        <NutritionDetailModal
          alimentoId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
};

export default BancoAlimentos;
