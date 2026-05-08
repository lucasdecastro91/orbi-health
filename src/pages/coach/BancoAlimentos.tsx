import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Search, Plus, Trash2, ChevronLeft, ChevronRight,
  Loader2, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
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

type Fonte = "todos" | "global" | "org";

const PAGE_SIZE = 25;

// ── Helpers ────────────────────────────────────────────────────────
const fonteBadge = (a: Alimento) => {
  if (a.fonte === "taco")   return { label: "TACO",   bg: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" };
  if (a.org_id)             return { label: "Minha",  bg: "rgba(99,102,241,0.12)", color: "#a5b4fc" };
  return                           { label: "Global", bg: "rgba(34,197,94,0.12)",  color: "#86efac" };
};

// ── Modal Adicionar Alimento ───────────────────────────────────────
const emptyForm = {
  nome: "", porcao_descricao: "", porcao_gramas: "",
  kcal: "", proteina_g: "", carb_g: "", gordura_g: "", fibra_g: "",
};

const AddModal = ({
  open, onClose, orgId, onSaved,
}: { open: boolean; onClose: () => void; orgId: string | null; onSaved: () => void }) => {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(emptyForm); }, [open]);

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("alimentos").insert({
        nome:             form.nome.trim(),
        porcao_descricao: form.porcao_descricao || null,
        porcao_gramas:    form.porcao_gramas  ? Number(form.porcao_gramas)  : null,
        kcal:             form.kcal           ? Number(form.kcal)           : null,
        proteina_g:       form.proteina_g     ? Number(form.proteina_g)     : null,
        carb_g:           form.carb_g         ? Number(form.carb_g)         : null,
        gordura_g:        form.gordura_g      ? Number(form.gordura_g)      : null,
        fibra_g:          form.fibra_g        ? Number(form.fibra_g)        : null,
        fonte:            "org",
        org_id:           orgId,
        status:           "aprovado",
      });
      if (error) throw error;
      toast({ title: "Alimento criado!", description: "Disponível para uso nas dietas." });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const Field = ({ label, name, placeholder, type = "text" }: {
    label: string; name: keyof typeof emptyForm; placeholder?: string; type?: string;
  }) => (
    <div>
      <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">{label}</label>
      <input
        type={type}
        value={form[name]}
        onChange={set(name)}
        placeholder={placeholder}
        step={type === "number" ? "0.1" : undefined}
        className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "#111113" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">Novo Alimento</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Field label="Nome *" name="nome" placeholder="Ex: Arroz cozido" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Porção" name="porcao_descricao" placeholder="100g" />
            <Field label="Peso (g)" name="porcao_gramas" type="number" placeholder="100" />
          </div>

          <div className="border-t border-white/6 pt-3">
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Informação Nutricional</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calorias (kcal)" name="kcal" type="number" placeholder="0" />
              <Field label="Proteína (g)" name="proteina_g" type="number" placeholder="0" />
              <Field label="Carboidrato (g)" name="carb_g" type="number" placeholder="0" />
              <Field label="Gordura (g)" name="gordura_g" type="number" placeholder="0" />
              <Field label="Fibra (g)" name="fibra_g" type="number" placeholder="0" />
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

// ── Main Page ──────────────────────────────────────────────────────
const BancoAlimentos = () => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();

  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fonte, setFonte]         = useState<Fonte>("todos");
  const [addOpen, setAddOpen]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        .eq("status", "aprovado")
        .order("nome")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (debouncedSearch.trim()) {
        q = q.ilike("nome", `%${debouncedSearch.trim()}%`);
      }

      if (fonte === "global") q = q.is("org_id", null);
      else if (fonte === "org" && orgId) q = q.eq("org_id", orgId);

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
    setDeletingId(id);
    try {
      const { error } = await supabase.from("alimentos").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Alimento removido." });
      loadAlimentos();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const FonteBtn = ({ value, label }: { value: Fonte; label: string }) => {
    const active = fonte === value;
    return (
      <button
        onClick={() => { setFonte(value); setPage(0); }}
        className={`px-3 h-8 rounded-xl text-xs font-medium transition-colors ${!active ? "bg-white/5 text-foreground/50 hover:bg-white/8 hover:text-foreground/70" : ""}`}
        style={active ? { background: "var(--cp-gradient)", color: "#fff" } : undefined}
      >
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
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors"
          />
        </div>

        {/* Filtros fonte */}
        <div className="flex gap-1.5 items-center">
          <FonteBtn value="todos" label="Todos" />
          <FonteBtn value="global" label="Global" />
          <FonteBtn value="org" label="Minha org" />
        </div>

        {/* Botão adicionar */}
        <button
          onClick={() => setAddOpen(true)}
          className="h-10 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-2 shrink-0"
          style={{ background: "var(--cp-gradient)" }}
        >
          <Plus className="w-4 h-4" />
          Novo alimento
        </button>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/30"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}
        >
          <span className="flex-1">Nome</span>
          <span className="mr-9">Kcal</span>
        </div>

        {/* Rows */}
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
            const badge = fonteBadge(a);
            const isOrg = !!a.org_id;
            const portion = a.porcao_descricao ?? (a.porcao_gramas ? `${a.porcao_gramas}g` : null);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/3"
                style={{ borderBottom: idx < alimentos.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                {/* Nome + macros */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-foreground font-medium text-sm leading-snug">{a.nome}</span>
                    <span
                      className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {portion && <span className="text-foreground/35 text-[11px]">{portion}</span>}
                    {a.proteina_g != null && <span className="text-red-400 text-[11px]">P {a.proteina_g}g</span>}
                    {a.carb_g != null && <span className="text-yellow-500 text-[11px]">C {a.carb_g}g</span>}
                    {a.gordura_g != null && <span className="text-blue-400 text-[11px]">G {a.gordura_g}g</span>}
                    {a.fibra_g != null && <span className="text-green-400 text-[11px]">F {a.fibra_g}g</span>}
                  </div>
                </div>

                {/* Kcal */}
                <span className="text-green-500 text-sm font-semibold shrink-0 w-14 text-right">
                  {a.kcal != null ? `${a.kcal}` : "—"}
                </span>

                {/* Delete */}
                <div className="shrink-0 w-7 flex justify-end">
                  {isOrg && (
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-foreground/20 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      {deletingId === a.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </button>
                  )}
                </div>
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
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/8 text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i;
              if (totalPages > 5) {
                const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                p = start + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-medium transition-colors ${p !== page ? "text-foreground/50 hover:text-foreground/80 hover:bg-white/5" : ""}`}
                  style={
                    p === page
                      ? { background: "var(--cp-gradient)", color: "#fff" }
                      : undefined
                  }
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-white/8 text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Modal */}
      <AddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orgId={orgId}
        onSaved={loadAlimentos}
      />
    </div>
  );
};

export default BancoAlimentos;
