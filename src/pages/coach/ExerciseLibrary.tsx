import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VideoModal } from "@/components/ui/video-modal";
import {
  Plus, MoreVertical, Pencil, Trash2, Play, Search,
  Dumbbell, Loader2, X, Youtube,
} from "lucide-react";

interface Exercise {
  id: string;
  nome: string;
  video_url: string | null;
  descricao: string | null;
  categoria: string | null;
  musculos_principais: string | null;
}

const emptyForm = {
  nome: "",
  video_url: "",
  descricao: "",
  categoria: "",
  musculos_principais: "",
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
        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
        style={{ color: "rgba(255,255,255,0.4)" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-8 z-20 w-44 rounded-xl py-1 border border-white/8"
            style={{ backgroundColor: "#1a1a1d" }}
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
const ExerciseModal = ({
  open,
  onClose,
  editing,
  onSaved,
}: { open: boolean; onClose: () => void; editing: Exercise | null; onSaved: () => void }) => {
  const { toast } = useToast();
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
        musculos_principais: form.musculos_principais || null,
      };

      if (editing) {
        const { error } = await supabase.from("exercicios_base").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Exercício atualizado!" });
      } else {
        const { error } = await supabase.from("exercicios_base").insert({ ...payload, treinador_id: user.id });
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

  const Field = ({
    label, name, placeholder, textarea,
  }: { label: string; name: keyof typeof emptyForm; placeholder?: string; textarea?: boolean }) => (
    <div>
      <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1 block">{label}</label>
      {textarea ? (
        <textarea
          value={form[name]}
          onChange={set(name)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors resize-none"
        />
      ) : (
        <input
          type="text"
          value={form[name]}
          onChange={set(name)}
          placeholder={placeholder}
          className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/50 transition-colors"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "#111113" }}>
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
          <Field label="Nome *" name="nome" placeholder="Ex: Agachamento livre" />
          <Field label="Categoria" name="categoria" placeholder="Ex: Membros inferiores, Core" />
          <Field label="Músculos principais" name="musculos_principais" placeholder="Ex: Quadríceps, Glúteos" />
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
          <Field label="Descrição / instruções" name="descricao" placeholder="Descreva a execução correta..." textarea />

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
      <div className="w-full max-w-sm rounded-2xl border border-white/8 p-6" style={{ backgroundColor: "#111113" }}>
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

  useEffect(() => { loadExercises(); }, []);

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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("exercicios_base")
        .select("*")
        .eq("treinador_id", user.id)
        .order("nome");
      if (error) throw error;
      setExercises(data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar exercícios", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
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
    <div className="px-6 lg:px-8 py-6 lg:py-8 max-w-5xl">

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
        <div className="rounded-2xl border border-white/8 bg-white/2 py-16 flex flex-col items-center gap-4">
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
        <div className="rounded-2xl border border-white/8 bg-white/2 py-12 text-center">
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
                className="rounded-2xl border border-white/8 overflow-hidden group"
                style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
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
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
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
                    style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    <Dumbbell className="w-8 h-8 text-white/10" />
                  </div>
                )}

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-white leading-tight flex-1">{ex.nome}</h3>
                    <ExerciseMenu exercise={ex} onEdit={() => openEdit(ex)} onDelete={() => openDel(ex.id)} />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {ex.categoria && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}>
                        {ex.categoria}
                      </span>
                    )}
                    {ex.musculos_principais && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
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
