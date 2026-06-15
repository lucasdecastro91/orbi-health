import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, ChevronDown, Pencil, Check, X, Loader2,
  ListOrdered, Leaf,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Grupo {
  id: string;
  numero: number;
  nome: string;
}

interface Item {
  id: string;
  grupo_id: string;
  nome: string;
  porcao: string | null;
  ordem: number;
}

// ─── EditableText ─────────────────────────────────────────────────────────────

const EditableText = ({
  value,
  onSave,
  placeholder,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          onBlur={commit}
          className={`flex-1 bg-white/8 border border-white/15 text-white rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[rgba(var(--cp-rgb),0.5)] ${className}`}
          placeholder={placeholder}
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); commit(); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}
        >
          <Check className="w-3.5 h-3.5" style={{ color: "var(--cp-400)" }} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`text-left hover:opacity-75 transition-opacity ${className}`}
    >
      {value || <span className="opacity-30 italic">{placeholder}</span>}
    </button>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ListaSubstituicao = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [itens, setItens]   = useState<Record<string, Item[]>>({}); // grupoId → items
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading]   = useState(true);

  // New group form
  const [newGrupoNome, setNewGrupoNome] = useState("");
  const [addingGrupo, setAddingGrupo]   = useState(false);

  // New item forms: grupoId → { nome, porcao }
  const [newItemForms, setNewItemForms] = useState<
    Record<string, { nome: string; porcao: string }>
  >({});

  // ── Load ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId) return;
    loadGrupos();
  }, [orgId]);

  const loadGrupos = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lista_subst_grupos")
        .select("id, numero, nome")
        .eq("org_id", orgId)
        .order("numero");
      if (error) throw error;
      setGrupos((data ?? []) as Grupo[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar grupos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadItens = async (grupoId: string) => {
    if (itens[grupoId]) return; // already loaded
    try {
      const { data, error } = await supabase
        .from("lista_subst_itens")
        .select("id, grupo_id, nome, porcao, ordem")
        .eq("grupo_id", grupoId)
        .order("ordem");
      if (error) throw error;
      setItens((prev) => ({ ...prev, [grupoId]: (data ?? []) as Item[] }));
    } catch (err: any) {
      toast({ title: "Erro ao carregar itens", description: err.message, variant: "destructive" });
    }
  };

  // ── Toggle accordion ─────────────────────────────────────────

  const toggleGroup = (grupoId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(grupoId)) {
        next.delete(grupoId);
      } else {
        next.add(grupoId);
        loadItens(grupoId);
      }
      return next;
    });
  };

  // ── CRUD Grupos ───────────────────────────────────────────────

  const addGrupo = async () => {
    if (!orgId || !newGrupoNome.trim()) return;
    setAddingGrupo(true);
    try {
      const nextNumero = grupos.length > 0 ? Math.max(...grupos.map((g) => g.numero)) + 1 : 1;
      const { data, error } = await supabase
        .from("lista_subst_grupos")
        .insert({ org_id: orgId, numero: nextNumero, nome: newGrupoNome.trim() })
        .select("id, numero, nome")
        .single();
      if (error) throw error;
      setGrupos((prev) => [...prev, data as Grupo]);
      setNewGrupoNome("");
      toast({ title: "Grupo criado!" });
    } catch (err: any) {
      toast({ title: "Erro ao criar grupo", description: err.message, variant: "destructive" });
    } finally {
      setAddingGrupo(false);
    }
  };

  const renameGrupo = async (id: string, nome: string) => {
    try {
      const { error } = await supabase
        .from("lista_subst_grupos")
        .update({ nome })
        .eq("id", id);
      if (error) throw error;
      setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, nome } : g)));
    } catch (err: any) {
      toast({ title: "Erro ao renomear grupo", description: err.message, variant: "destructive" });
    }
  };

  const deleteGrupo = async (id: string) => {
    if (!confirm("Excluir este grupo e todos os seus itens?")) return;
    try {
      const { error } = await supabase.from("lista_subst_grupos").delete().eq("id", id);
      if (error) throw error;
      setGrupos((prev) => prev.filter((g) => g.id !== id));
      setItens((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast({ title: "Grupo excluído" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir grupo", description: err.message, variant: "destructive" });
    }
  };

  // ── CRUD Itens ────────────────────────────────────────────────

  const addItem = async (grupoId: string) => {
    const form = newItemForms[grupoId];
    if (!form?.nome?.trim()) return;
    const existingItems = itens[grupoId] ?? [];
    const nextOrdem = existingItems.length > 0 ? Math.max(...existingItems.map((i) => i.ordem)) + 1 : 1;
    try {
      const { data, error } = await supabase
        .from("lista_subst_itens")
        .insert({
          grupo_id: grupoId,
          nome:     form.nome.trim(),
          porcao:   form.porcao.trim() || null,
          ordem:    nextOrdem,
        })
        .select("id, grupo_id, nome, porcao, ordem")
        .single();
      if (error) throw error;
      setItens((prev) => ({ ...prev, [grupoId]: [...(prev[grupoId] ?? []), data as Item] }));
      setNewItemForms((prev) => ({ ...prev, [grupoId]: { nome: "", porcao: "" } }));
    } catch (err: any) {
      toast({ title: "Erro ao adicionar item", description: err.message, variant: "destructive" });
    }
  };

  const updateItem = async (item: Item, changes: Partial<Pick<Item, "nome" | "porcao">>) => {
    try {
      const { error } = await supabase
        .from("lista_subst_itens")
        .update(changes)
        .eq("id", item.id);
      if (error) throw error;
      setItens((prev) => ({
        ...prev,
        [item.grupo_id]: (prev[item.grupo_id] ?? []).map((i) =>
          i.id === item.id ? { ...i, ...changes } : i
        ),
      }));
    } catch (err: any) {
      toast({ title: "Erro ao atualizar item", description: err.message, variant: "destructive" });
    }
  };

  const deleteItem = async (item: Item) => {
    try {
      const { error } = await supabase.from("lista_subst_itens").delete().eq("id", item.id);
      if (error) throw error;
      setItens((prev) => ({
        ...prev,
        [item.grupo_id]: (prev[item.grupo_id] ?? []).filter((i) => i.id !== item.id),
      }));
    } catch (err: any) {
      toast({ title: "Erro ao excluir item", description: err.message, variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 lg:p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <ListOrdered className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
          <h1 className="text-xl font-bold text-foreground">Lista de Substituição</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-8">
          Gerencie os grupos de alimentos equivalentes usados na dieta dos alunos.
        </p>
      </div>

      {/* Add group */}
      <div
        className="rounded-2xl border p-4 mb-5"
        style={{ backgroundColor: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Novo Grupo
        </p>
        <div className="flex gap-2">
          <Input
            value={newGrupoNome}
            onChange={(e) => setNewGrupoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGrupo()}
            placeholder="Ex: Carnes e Proteínas Animais"
            className="bg-white/5 border-white/10 text-white rounded-xl h-10 flex-1"
          />
          <Button
            onClick={addGrupo}
            disabled={addingGrupo || !newGrupoNome.trim()}
            className="h-10 px-4 rounded-xl font-semibold text-white shrink-0"
            style={{ background: "var(--cp-gradient)" }}
          >
            {addingGrupo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Groups list */}
      {grupos.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "rgba(255,255,255,0.06)", borderStyle: "dashed" }}
        >
          <ListOrdered className="w-8 h-8 mx-auto mb-3 text-white/15" />
          <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado ainda.</p>
          <p className="text-xs text-white/30 mt-1">
            Adicione um grupo acima para começar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((grupo) => {
            const isOpen   = expanded.has(grupo.id);
            const grupoItens = itens[grupo.id];
            const form     = newItemForms[grupo.id] ?? { nome: "", porcao: "" };
            const isVegetais = grupo.numero >= 13; // groups 13+ have free vegetables (null porcao)

            return (
              <div
                key={grupo.id}
                className="rounded-2xl border overflow-hidden"
                style={{
                  backgroundColor: isOpen ? "var(--surface-2)" : "var(--surface-1)",
                  borderColor: isOpen ? "rgba(var(--cp-rgb),0.2)" : "var(--border-subtle)",
                }}
              >
                {/* Group header */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Numero badge */}
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{
                      background: isOpen ? "var(--cp-gradient)" : "var(--tag-inactive-bg)",
                      color: isOpen ? "var(--cp-text)" : "var(--tag-inactive-color)",
                    }}
                  >
                    {grupo.numero}
                  </div>

                  {/* Name — editable */}
                  <EditableText
                    value={grupo.nome}
                    onSave={(v) => renameGrupo(grupo.id, v)}
                    placeholder="Nome do grupo"
                    className={`flex-1 text-sm font-semibold ${isOpen ? "text-foreground" : "text-white/70"}`}
                  />

                  {isVegetais && (
                    <Leaf className="w-3.5 h-3.5 text-green-500/50 shrink-0" title="Vegetais livres (sem porção)" />
                  )}

                  {/* Item count chip */}
                  {grupoItens && (
                    <span className="text-[10px] text-white/30 shrink-0">
                      {grupoItens.length} {grupoItens.length === 1 ? "item" : "itens"}
                    </span>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => deleteGrupo(grupo.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
                    style={{ color: "rgba(255,255,255,0.2)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Expand toggle */}
                  <button
                    onClick={() => toggleGroup(grupo.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
                    style={{ backgroundColor: "var(--ui-inactive-bg)", color: "var(--ui-inactive-color)" }}
                  >
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform duration-200"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    />
                  </button>
                </div>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border-dim)" }}>

                    {/* Items list */}
                    <div className="mt-3 space-y-1.5">
                      {!grupoItens ? (
                        <div className="py-4 flex justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-white/25" />
                        </div>
                      ) : grupoItens.length === 0 ? (
                        <p className="text-xs text-white/25 text-center py-3">
                          Nenhum item. Adicione abaixo.
                        </p>
                      ) : (
                        grupoItens.map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            showPorcao={!isVegetais}
                            onUpdate={updateItem}
                            onDelete={deleteItem}
                          />
                        ))
                      )}
                    </div>

                    {/* Add item form */}
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-dim)" }}>
                      <div className="flex gap-2 items-center">
                        <Input
                          value={form.nome}
                          onChange={(e) =>
                            setNewItemForms((prev) => ({
                              ...prev,
                              [grupo.id]: { ...form, nome: e.target.value },
                            }))
                          }
                          onKeyDown={(e) => e.key === "Enter" && addItem(grupo.id)}
                          placeholder="Nome do alimento"
                          className="bg-white/5 border-white/10 text-white rounded-xl h-8 text-sm flex-1"
                        />
                        {!isVegetais && (
                          <Input
                            value={form.porcao}
                            onChange={(e) =>
                              setNewItemForms((prev) => ({
                                ...prev,
                                [grupo.id]: { ...form, porcao: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => e.key === "Enter" && addItem(grupo.id)}
                            placeholder="Porção (ex: 100g)"
                            className="bg-white/5 border-white/10 text-white rounded-xl h-8 text-sm w-28 shrink-0"
                          />
                        )}
                        <button
                          onClick={() => addItem(grupo.id)}
                          disabled={!form.nome.trim()}
                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30"
                          style={{ background: "var(--cp-gradient)" }}
                        >
                          <Plus className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── ItemRow ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: Item;
  showPorcao: boolean;
  onUpdate: (item: Item, changes: Partial<Pick<Item, "nome" | "porcao">>) => void;
  onDelete: (item: Item) => void;
}

const ItemRow = ({ item, showPorcao, onUpdate, onDelete }: ItemRowProps) => {
  const [editingNome, setEditingNome]     = useState(false);
  const [editingPorcao, setEditingPorcao] = useState(false);
  const [draftNome, setDraftNome]         = useState(item.nome);
  const [draftPorcao, setDraftPorcao]     = useState(item.porcao ?? "");

  const commitNome = () => {
    const v = draftNome.trim();
    if (v && v !== item.nome) onUpdate(item, { nome: v });
    setEditingNome(false);
  };

  const commitPorcao = () => {
    const v = draftPorcao.trim() || null;
    if (v !== item.porcao) onUpdate(item, { porcao: v });
    setEditingPorcao(false);
  };

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2 rounded-xl group"
      style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-dim)" }}
    >
      {/* Dot */}
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: "rgba(var(--cp-rgb),0.45)" }}
      />

      {/* Nome */}
      <div className="flex-1 min-w-0">
        {editingNome ? (
          <input
            autoFocus
            value={draftNome}
            onChange={(e) => setDraftNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitNome(); if (e.key === "Escape") { setDraftNome(item.nome); setEditingNome(false); } }}
            onBlur={commitNome}
            className="w-full bg-white/8 border border-white/15 text-white rounded-md px-1.5 py-0.5 text-sm outline-none focus:border-[rgba(var(--cp-rgb),0.5)]"
          />
        ) : (
          <button
            onClick={() => { setDraftNome(item.nome); setEditingNome(true); }}
            className="text-sm text-foreground text-left hover:opacity-75 transition-opacity w-full truncate"
          >
            {item.nome}
          </button>
        )}
      </div>

      {/* Porção */}
      {showPorcao && (
        <div className="shrink-0 w-24">
          {editingPorcao ? (
            <input
              autoFocus
              value={draftPorcao}
              onChange={(e) => setDraftPorcao(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitPorcao(); if (e.key === "Escape") { setDraftPorcao(item.porcao ?? ""); setEditingPorcao(false); } }}
              onBlur={commitPorcao}
              className="w-full bg-white/8 border border-white/15 text-white rounded-md px-1.5 py-0.5 text-xs outline-none focus:border-[rgba(var(--cp-rgb),0.5)] text-right"
              placeholder="ex: 100g"
            />
          ) : (
            <button
              onClick={() => { setDraftPorcao(item.porcao ?? ""); setEditingPorcao(true); }}
              className="text-xs text-muted-foreground hover:opacity-75 transition-opacity w-full text-right"
            >
              {item.porcao || <span className="opacity-30 italic">porção</span>}
            </button>
          )}
        </div>
      )}

      {/* Delete — show on hover */}
      <button
        onClick={() => onDelete(item)}
        className="w-6 h-6 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
        style={{ color: "rgba(255,255,255,0.25)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"; }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

export default ListaSubstituicao;
