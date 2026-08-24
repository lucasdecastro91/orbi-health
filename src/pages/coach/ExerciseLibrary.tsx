import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { VideoModal } from "@/components/ui/video-modal";
import { Switch } from "@/components/ui/switch";
import {
  Plus, MoreVertical, Pencil, Trash2, Play, Search,
  Dumbbell, Loader2, X, Youtube, ChevronDown, ChevronUp, Globe,
} from "lucide-react";

// Mesmo e-mail/lógica de isSuperAdmin já usada em CoachLayout.tsx — decide
// quem vê o toggle de "liberar pra outras orgs" (a escrita em si já é
// protegida pela RLS normal de exercicios_base, isso aqui é só UI).
const SUPERADMIN_EMAIL = "lucas.melo1991@gmail.com";

// Grupos "gerais" sempre visíveis + "específicos" (porções de um grupo maior)
// ocultos por padrão — mesmo padrão já usado pras técnicas de série avançadas
// em TrainingPlanManager.tsx (PRESET_TIPOS_STANDARD/PRESET_TIPOS_ADVANCED),
// pra não empilhar 17 chips de cara nesse seletor.
const GRUPOS_MUSCULARES_GERAIS = [
  'Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps',
  'Abdômen', 'Glúteos', 'Quadríceps', 'Posteriores', 'Panturrilha',
] as const;
const GRUPOS_MUSCULARES_ESPECIFICOS = [
  'Deltoide Anterior', 'Deltoide Medial', 'Deltoide Posterior',
  'Latíssimo do Dorso', 'Trapézio Superior', 'Trapézio Médio', 'Trapézio Inferior',
] as const;
const GRUPOS_MUSCULARES = [...GRUPOS_MUSCULARES_GERAIS, ...GRUPOS_MUSCULARES_ESPECIFICOS] as const;
type GrupoMuscular = typeof GRUPOS_MUSCULARES[number];

interface Exercise {
  id: string;
  nome: string;
  video_url: string | null;
  descricao: string | null;
  categoria: string | null;
  musculos_principais: string | null;
  grupo_muscular_principal: string | null;
  grupo_muscular_secundario: string | null;
  org_id: string | null;
  liberado_outras_orgs: boolean;
}

const emptyForm = {
  nome: "",
  video_url: "",
  descricao: "",
  categoria: "",
  musculos_principais: "",
  grupo_muscular_principal: "",
  grupo_muscular_secundario: "",
};

// ── YouTube thumbnail helper ───────────────────────────────────────
const getYouTubeThumbnail = (url: string | null) => {
  if (!url) return null;
  const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1];
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
};

// ── Exercise card menu ─────────────────────────────────────────────
const ExerciseMenu = ({
  exercise,
  onEdit,
  onDelete,
}: { exercise: Exercise; onEdit: () => void; onDelete: () => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-white/40 hover:bg-white/8"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-8 z-20 w-44 rounded-xl py-1 border border-white/8"
            style={{ backgroundColor: "var(--sheet-bg-2)" }}
          >
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </button>
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Add/Edit Modal ─────────────────────────────────────────────────
/** Definido fora do ExerciseModal de propósito: um componente declarado dentro do
 *  corpo de outro é recriado (novo "tipo") a cada render — o React desmonta e
 *  remonta o <input> a cada tecla digitada, perdendo o foco a cada caractere.
 *  Já aconteceu antes em outros formulários do painel; ver memória do projeto
 *  sobre esse padrão antes de reintroduzi-lo em componente novo. */
const ModalField = ({
  label, placeholder, textarea, value, onChange,
}: {
  label: string;
  placeholder?: string;
  textarea?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) => (
  <div>
    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">{label}</label>
    {textarea ? (
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors resize-none"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors"
      />
    )}
  </div>
);

/** Multi-select via chips — armazena como "Glúteos,Quadríceps". Também precisa
 *  ficar fora do ExerciseModal pelo mesmo motivo do ModalField acima. */
const ModalChipSelect = ({
  label, hint, selectedValue, onChange,
}: { label: string; hint?: string; selectedValue: string; onChange: (next: string) => void }) => {
  const selected = (selectedValue || '').split(',').map(s => s.trim()).filter(Boolean);
  // Já começa expandido se algum específico já estiver selecionado — nunca
  // esconde um dado que já existe, só evita mostrar tudo de cara.
  const [showEspecificos, setShowEspecificos] = useState(
    () => selected.some(g => (GRUPOS_MUSCULARES_ESPECIFICOS as readonly string[]).includes(g))
  );
  const toggle = (g: string) => {
    const next = selected.includes(g) ? selected.filter(x => x !== g) : [...selected, g];
    onChange(next.join(','));
  };
  const chip = (g: string) => {
    const active = selected.includes(g);
    return (
      <button key={g} type="button" onClick={() => toggle(g)}
        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
        style={{
          backgroundColor: active ? "rgba(245,158,11,0.2)" : "var(--tag-neutral-bg)",
          color: active ? "hsl(42 95% 58%)" : "var(--tag-neutral-color)",
          border: `1px solid ${active ? "rgba(245,158,11,0.35)" : "hsl(var(--border))"}`,
        }}>
        {g}
      </button>
    );
  };
  return (
    <div>
      <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">
        {label}
        {hint && <span className="ml-1 normal-case" style={{ color: "hsl(var(--foreground) / 0.25)" }}>{hint}</span>}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {GRUPOS_MUSCULARES_GERAIS.map(chip)}
      </div>
      {showEspecificos && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {GRUPOS_MUSCULARES_ESPECIFICOS.map(chip)}
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowEspecificos(v => !v)}
        className="flex items-center gap-1 mt-1.5 text-[11px] text-white/35 hover:text-white/55 transition-colors"
      >
        {showEspecificos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showEspecificos ? "Mostrar menos" : "Mostrar mais específicos"}
      </button>
    </div>
  );
};

const ExerciseModal = ({
  open,
  onClose,
  editing,
  onSaved,
}: { open: boolean; onClose: () => void; editing: Exercise | null; onSaved: () => void }) => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              nome:               editing.nome,
              video_url:          editing.video_url || "",
              descricao:          editing.descricao || "",
              categoria:          editing.categoria || "",
              musculos_principais: editing.musculos_principais || "",
              grupo_muscular_principal: editing.grupo_muscular_principal || "",
              grupo_muscular_secundario: editing.grupo_muscular_secundario || "",
            }
          : emptyForm,
      );
    }
  }, [open, editing]);

  const set = (k: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        nome:               form.nome.trim(),
        video_url:          form.video_url || null,
        descricao:          form.descricao || null,
        categoria:          form.categoria || null,
        grupo_muscular_principal: form.grupo_muscular_principal || null,
        grupo_muscular_secundario: form.grupo_muscular_secundario || null,
      };

      if (editing) {
        const { error } = await supabase.from("exercicios_base").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Exercício atualizado!" });
      } else {
        const { error } = await supabase.from("exercicios_base").insert({ ...payload, treinador_id: user.id, org_id: orgId });
        if (error) throw error;
        toast({ title: "Exercício adicionado!" });
      }

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "var(--sheet-bg)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">
            {editing ? "Editar Exercício" : "Novo Exercício"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-colors">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <ModalField label="Nome *" placeholder="Ex: Agachamento livre" value={form.nome} onChange={set("nome")} />
          <ModalField label="Categoria" placeholder="Ex: Membros inferiores, Core" value={form.categoria} onChange={set("categoria")} />
          <ModalChipSelect
            label="Músculos Principais" hint="(1× volume)"
            selectedValue={form.grupo_muscular_principal}
            onChange={(v) => setForm(f => ({ ...f, grupo_muscular_principal: v }))}
          />
          <ModalChipSelect
            label="Músculos Secundários" hint="(0.5× volume)"
            selectedValue={form.grupo_muscular_secundario}
            onChange={(v) => setForm(f => ({ ...f, grupo_muscular_secundario: v }))}
          />
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">URL do Vídeo (YouTube / Vimeo)</label>
            <div className="relative">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="url"
                value={form.video_url}
                onChange={set("video_url")}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors"
              />
            </div>
          </div>
          <ModalField label="Descrição / instruções" placeholder="Descreva a execução correta..." value={form.descricao} onChange={set("descricao")} textarea />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !form.nome.trim()}
              className="flex-1 h-10 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "var(--cp-gradient)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Salvando..." : editing ? "Atualizar" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Delete confirmation ────────────────────────────────────────────
const DeleteModal = ({
  open, onClose, onConfirm,
}: { open: boolean; onClose: () => void; onConfirm: () => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-sm rounded-2xl border border-white/8 p-6" style={{ backgroundColor: "var(--sheet-bg)" }}>
        <h2 className="text-base font-semibold text-white mb-2">Excluir exercício?</h2>
        <p className="text-sm text-white/50 mb-5">Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 h-10 rounded-xl bg-red-500/15 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-colors">
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────
export default function ExerciseLibrary() {
  const { toast } = useToast();
  const { orgId, isGetShapeOrg } = useTenantContext();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filtered,  setFiltered]  = useState<Exercise[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [videoOpen,  setVideoOpen]  = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string | null; title: string } | null>(null);
  const [userEmail, setUserEmail] = useState("");

  // Mesma regra de CoachLayout.tsx: dono da Get Shape por e-mail, ou
  // qualquer sessão dentro da própria org da Get Shape (cobre colaboradores
  // futuros). A escrita real é protegida pela RLS de exercicios_base — isso
  // aqui só decide se o toggle aparece na tela.
  const isSuperAdmin = userEmail === SUPERADMIN_EMAIL || isGetShapeOrg;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => { if (orgId) loadExercises(); }, [orgId]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? exercises.filter(
            (ex) =>
              ex.nome.toLowerCase().includes(q) ||
              ex.categoria?.toLowerCase().includes(q) ||
              ex.musculos_principais?.toLowerCase().includes(q),
          )
        : exercises,
    );
  }, [search, exercises]);

  const loadExercises = async () => {
    if (!orgId) return;
    try {
      // Própria org + exercícios liberados de outras orgs (biblioteca global
      // do superadmin) — 2 queries porque são fontes conceitualmente
      // diferentes (própria vs. de terceiros) e a segunda já exclui a
      // própria org pra não duplicar quando o Lucas mesmo estiver olhando.
      const [ownRes, globalRes] = await Promise.all([
        supabase.from("exercicios_base").select("*").eq("org_id", orgId).order("nome"),
        supabase.from("exercicios_base").select("*").eq("liberado_outras_orgs", true).neq("org_id", orgId).order("nome"),
      ]);
      if (ownRes.error) throw ownRes.error;
      if (globalRes.error) throw globalRes.error;
      setExercises([...(ownRes.data || []), ...(globalRes.data || [])]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar exercícios", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleLiberado = async (ex: Exercise) => {
    const next = !ex.liberado_outras_orgs;
    // Otimista — a tela não devia esperar round-trip pra refletir o clique.
    setExercises((prev) => prev.map((e) => (e.id === ex.id ? { ...e, liberado_outras_orgs: next } : e)));
    const { error } = await supabase.from("exercicios_base").update({ liberado_outras_orgs: next }).eq("id", ex.id);
    if (error) {
      setExercises((prev) => prev.map((e) => (e.id === ex.id ? { ...e, liberado_outras_orgs: !next } : e)));
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: next ? "Exercício liberado pra outras orgs" : "Exercício não liberado mais" });
    }
  };

  const openAdd  = () => { setEditingEx(null); setModalOpen(true); };
  const openEdit = (ex: Exercise) => { setEditingEx(ex); setModalOpen(true); };
  const openDel  = (id: string) => { setDeletingId(id); setDeleteOpen(true); };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("exercicios_base").delete().eq("id", deletingId);
      if (error) throw error;
      toast({ title: "Exercício excluído." });
      setDeleteOpen(false);
      setDeletingId(null);
      loadExercises();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  const playVideo = (url: string | null, title: string) => {
    setSelectedVideo({ url, title });
    setVideoOpen(true);
  };

  return (
    <div className="px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Biblioteca de Exercícios</h1>
          <p className="text-white/40 text-sm mt-1">
            {exercises.length} exercício{exercises.length !== 1 ? "s" : ""} cadastrado{exercises.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="h-10 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-2 shrink-0"
          style={{ background: "var(--cp-gradient)" }}
        >
          <Plus className="w-4 h-4" />
          Novo exercício
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, categoria ou músculo..."
          className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-2 text-white/30">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && exercises.length === 0 && (
        <div className="rounded-2xl py-16 flex flex-col items-center gap-4"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)" }}>
            <Dumbbell className="w-7 h-7 text-green-500/60" />
          </div>
          <div className="text-center">
            <p className="text-white/60 font-medium">Nenhum exercício ainda</p>
            <p className="text-white/30 text-sm mt-1">Adicione exercícios para reutilizá-los nos treinos dos alunos.</p>
          </div>
          <button
            onClick={openAdd}
            className="h-10 px-5 rounded-xl text-white text-sm font-semibold mt-1"
            style={{ background: "var(--cp-gradient)" }}
          >
            Adicionar primeiro exercício
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && exercises.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl py-12 text-center"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <p className="text-white/40 text-sm">Nenhum resultado para "{search}"</p>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => {
            const thumb = getYouTubeThumbnail(ex.video_url);
            return (
              <div
                key={ex.id}
                className="rounded-2xl overflow-hidden group"
                style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}
              >
                {/* Thumbnail / placeholder */}
                {ex.video_url ? (
                  <div
                    className="relative aspect-video cursor-pointer overflow-hidden"
                    onClick={() => playVideo(ex.video_url, ex.nome)}
                  >
                    {thumb ? (
                      <img src={thumb} alt={ex.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "hsl(var(--foreground) / 0.03)" }}>
                        <Play className="w-8 h-8 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="aspect-video flex items-center justify-center"
                    style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}
                  >
                    <Dumbbell className="w-8 h-8 text-white/10" />
                  </div>
                )}

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-white leading-tight flex-1">{ex.nome}</h3>
                    {/* Exercício de outra org (liberado pelo superadmin) — só visualização,
                        nem editável nem excluível aqui (RLS já bloquearia mesmo assim). */}
                    {ex.org_id === orgId && (
                      <ExerciseMenu exercise={ex} onEdit={() => openEdit(ex)} onDelete={() => openDel(ex.id)} />
                    )}
                  </div>

                  {ex.org_id !== orgId && (
                    <div className="flex items-center gap-1 mb-2 text-[11px] font-medium" style={{ color: "var(--cp-400)" }}>
                      <Globe className="w-3 h-3" />
                      Biblioteca ORBI
                    </div>
                  )}
                  {isSuperAdmin && ex.org_id === orgId && (
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium"
                      style={{ color: ex.liberado_outras_orgs ? "var(--cp-400)" : "var(--tag-neutral-color)" }}
                    >
                      <Switch checked={ex.liberado_outras_orgs} onCheckedChange={() => toggleLiberado(ex)}
                        className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3" />
                      {ex.liberado_outras_orgs ? "Liberado pra outras orgs" : "Liberar pra outras orgs"}
                    </div>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {ex.grupo_muscular_principal && ex.grupo_muscular_principal.split(',').map(g => g.trim()).filter(Boolean).map(g => (
                      <span key={g} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "var(--tag-amber-bg)", color: "var(--tag-amber-color)" }}>
                        {g}
                      </span>
                    ))}
                    {ex.grupo_muscular_secundario && ex.grupo_muscular_secundario.split(',').map(g => g.trim()).filter(Boolean).map(g => (
                      <span key={`sec-${g}`} className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "var(--tag-neutral-bg)", color: "var(--tag-neutral-color)" }}>
                        {g}
                      </span>
                    ))}
                    {ex.categoria && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                        {ex.categoria}
                      </span>
                    )}
                    {ex.musculos_principais && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--tag-neutral-bg)", color: "var(--tag-neutral-color)" }}>
                        {ex.musculos_principais}
                      </span>
                    )}
                  </div>

                  {ex.descricao && (
                    <p className="text-xs text-white/35 line-clamp-2 leading-relaxed">{ex.descricao}</p>
                  )}

                  {ex.video_url && (
                    <button
                      onClick={() => playVideo(ex.video_url, ex.nome)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors"
                      style={{ color: "var(--cp-500)" }}
                    >
                      <Play className="w-3 h-3" />
                      Ver demonstração
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <ExerciseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingEx}
        onSaved={loadExercises}
      />
      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
      <VideoModal
        open={videoOpen}
        onOpenChange={setVideoOpen}
        videoUrl={selectedVideo?.url || null}
        title={selectedVideo?.title || ""}
      />
    </div>
  );
}
