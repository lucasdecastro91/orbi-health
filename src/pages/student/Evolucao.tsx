import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Weight, Plus, TrendingUp, TrendingDown, Minus, Loader2, Trash2,
  Camera, ImagePlus, X, ChevronLeft, ChevronRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Registro {
  id: string;
  data_registro: string;
  peso_kg: number | null;
  created_at: string;
}

type Slot = "front" | "side_left" | "side_right" | "back" | "free";

interface EvoPhoto {
  id: string;
  slot: Slot;
  storage_path: string;
  taken_at: string;
  url: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SLOTS: { key: Slot; label: string }[] = [
  { key: "front",      label: "Frente"    },
  { key: "side_left",  label: "Lado E."   },
  { key: "side_right", label: "Lado D."   },
  { key: "back",       label: "Costas"    },
  { key: "free",       label: "Livre"     },
];

const BUCKET = "evolution-photos";

// ─────────────────────────────────────────────────────────────
// Custom chart tooltip
// ─────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2" style={{ backgroundColor: "#1a1a1d" }}>
      <p className="text-[11px] text-white/40 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-green-500">{payload[0].value} kg</p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Photo lightbox
// ─────────────────────────────────────────────────────────────

const Lightbox = ({
  photos, index, onClose, onNav,
}: { photos: EvoPhoto[]; index: number; onClose: () => void; onNav: (delta: number) => void }) => {
  const photo = photos[index];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      <div className="relative w-full max-w-md px-4" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.url}
          alt={photo.slot}
          className="w-full rounded-2xl object-contain max-h-[75vh]"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-sm text-white/50">{SLOTS.find((s) => s.key === photo.slot)?.label} — {format(parseISO(photo.taken_at), "dd/MM/yyyy")}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>
        {/* Nav arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={() => onNav(-1)}
              disabled={index === 0}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
              style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => onNav(1)}
              disabled={index === photos.length - 1}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
              style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Evolucao = () => {
  const { toast }   = useToast();
  const { orgId }   = useTenantContext();

  // Weight state
  const [registros,  setRegistros]  = useState<Registro[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [peso,       setPeso]       = useState("");
  const [data,       setData]       = useState(format(new Date(), "yyyy-MM-dd"));

  // Photo state
  const [photos,      setPhotos]      = useState<EvoPhoto[]>([]);
  const [uploading,   setUploading]   = useState<Slot | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [studentId,   setStudentId]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingSlot = useRef<Slot | null>(null);

  useEffect(() => { loadAll(); }, []);

  // ── Data loaders ─────────────────────────────────────────

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setStudentId(session.user.id);

      const [weightRes, photoRes] = await Promise.all([
        supabase
          .from("registros_evolucao")
          .select("*")
          .eq("student_id", session.user.id)
          .order("data_registro", { ascending: false }),
        supabase
          .from("evolution_photos")
          .select("id, slot, storage_path, taken_at")
          .eq("student_id", session.user.id)
          .order("taken_at", { ascending: false }),
      ]);

      if (weightRes.error) throw weightRes.error;
      setRegistros(weightRes.data as Registro[]);

      if (!photoRes.error && photoRes.data) {
        const withUrls: EvoPhoto[] = (photoRes.data as any[]).map((p) => ({
          ...p,
          url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
        }));
        setPhotos(withUrls);
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Weight handlers ───────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peso || isNaN(Number(peso))) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase.from("registros_evolucao").upsert({
        student_id:    session.user.id,
        org_id:        orgId,
        data_registro: data,
        peso_kg:       Number(peso),
      }, { onConflict: "student_id,data_registro" });
      if (error) throw error;
      toast({ title: "Peso registrado!" });
      setPeso("");
      await loadAll();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("registros_evolucao").delete().eq("id", id);
      if (error) throw error;
      setRegistros((r) => r.filter((x) => x.id !== id));
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ── Photo upload ──────────────────────────────────────────

  const triggerUpload = (slot: Slot) => {
    uploadingSlot.current = slot;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = uploadingSlot.current;
    if (!file || !slot || !studentId || !orgId) return;

    // Reset input so same file can be re-selected
    e.target.value = "";

    setUploading(slot);
    try {
      const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const date = format(new Date(), "yyyy-MM-dd");
      const path = `${orgId}/${studentId}/${date}_${slot}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Upsert DB row
      const { data: row, error: dbErr } = await supabase
        .from("evolution_photos")
        .upsert({
          student_id:   studentId,
          org_id:       orgId,
          slot,
          storage_path: path,
          taken_at:     date,
        }, { onConflict: "student_id,org_id,slot,taken_at" })
        .select("id, slot, storage_path, taken_at")
        .single();
      if (dbErr) throw dbErr;

      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      setPhotos((prev) => {
        const filtered = prev.filter(
          (p) => !(p.slot === slot && p.taken_at === date)
        );
        return [{ ...(row as any), url }, ...filtered];
      });
      toast({ title: "Foto salva!" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  // ── Delete photo ──────────────────────────────────────────

  const deletePhoto = async (photo: EvoPhoto) => {
    try {
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
      await supabase.from("evolution_photos").delete().eq("id", photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (lightboxIdx !== null) setLightboxIdx(null);
      toast({ title: "Foto removida" });
    } catch (err: any) {
      toast({ title: "Erro ao remover foto", description: err.message, variant: "destructive" });
    }
  };

  // ── Derived ───────────────────────────────────────────────

  const withWeight  = registros.filter((r) => r.peso_kg != null);
  const sorted      = [...withWeight].sort((a, b) => a.data_registro.localeCompare(b.data_registro));
  const pesoInicial = sorted[0]?.peso_kg ?? null;
  const pesoAtual   = sorted[sorted.length - 1]?.peso_kg ?? null;
  const variacao    = pesoInicial != null && pesoAtual != null ? pesoAtual - pesoInicial : null;

  const chartData = sorted.slice(-30).map((r) => ({
    date: format(parseISO(r.data_registro), "dd/MM", { locale: ptBR }),
    peso: r.peso_kg,
  }));

  /** Latest photo per slot */
  const latestBySlot: Partial<Record<Slot, EvoPhoto>> = {};
  for (const p of photos) {
    if (!latestBySlot[p.slot]) latestBySlot[p.slot] = p;
  }

  // Group all photos by date for gallery
  const byDate: Record<string, EvoPhoto[]> = {};
  for (const p of photos) {
    if (!byDate[p.taken_at]) byDate[p.taken_at] = [];
    byDate[p.taken_at].push(p);
  }
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const allPhotosFlat = sortedDates.flatMap((d) => byDate[d]);

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={allPhotosFlat}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNav={(delta) => setLightboxIdx((i) => Math.min(Math.max(0, (i ?? 0) + delta), allPhotosFlat.length - 1))}
        />
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ── Weight header ─────────────────────────────── */}
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-green-500" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Evolução</h1>
            <p className="text-muted-foreground text-sm">Peso e fotos de progresso</p>
          </div>
        </div>

        {/* Weight stats */}
        {withWeight.length >= 2 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Inicial",  value: `${pesoInicial} kg`, colorClass: "text-foreground" },
              { label: "Atual",    value: `${pesoAtual} kg`,   colorClass: "text-foreground" },
              {
                label: "Variação",
                value: variacao == null ? "—" : `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)} kg`,
                colorClass:
                  variacao == null ? "text-muted-foreground" :
                  variacao < 0     ? "text-green-500" :
                  variacao > 0     ? "text-red-400"   : "text-muted-foreground",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/8 px-4 py-3"
                style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
              >
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.colorClass}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 && (
          <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Gráfico de peso</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="peso" stroke="var(--cp-500)" strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--cp-500)", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "var(--cp-500)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Register weight */}
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Registrar peso</p>
          <form onSubmit={handleSave} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Peso (kg)</label>
              <div className="relative">
                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-50 pointer-events-none" />
                <input
                  type="number" step="0.1" value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="72.5"
                  className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 text-base font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Data</label>
              <input
                type="date" value={data} onChange={(e) => setData(e.target.value)}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-green-600/50 transition-colors"
              />
            </div>
            <button
              type="submit" disabled={saving || !peso}
              className="h-11 px-4 rounded-xl text-primary-foreground text-sm font-semibold flex items-center gap-2 shrink-0 disabled:opacity-50"
              style={{ background: "var(--cp-gradient)" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* ── Photos section ─────────────────────────────── */}
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fotos de progresso</p>
            <Camera className="w-4 h-4 text-muted-foreground opacity-40" />
          </div>

          {/* 5 slot grid */}
          <div className="grid grid-cols-5 gap-2">
            {SLOTS.map(({ key, label }) => {
              const latest = latestBySlot[key];
              const isUp   = uploading === key;

              return (
                <button
                  key={key}
                  onClick={() => triggerUpload(key)}
                  disabled={!!uploading}
                  className="flex flex-col items-center gap-1.5 group disabled:opacity-60"
                >
                  <div
                    className="w-full aspect-square rounded-xl overflow-hidden relative"
                    style={{
                      backgroundColor: latest ? undefined : "rgba(255,255,255,0.05)",
                      border: `1px solid ${latest ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    {latest ? (
                      <img src={latest.url} alt={label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImagePlus className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
                      </div>
                    )}
                    {/* Uploading overlay */}
                    {isUp && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
                      </div>
                    )}
                    {/* Green border on hover */}
                    {latest && (
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                      >
                        <Camera className="w-4 h-4 text-white/80" />
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Photo gallery by date */}
        {sortedDates.length > 0 && (
          <div className="space-y-4">
            {sortedDates.map((date) => (
              <div key={date}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
                  {format(parseISO(date), "dd 'de' MMMM yyyy", { locale: ptBR })}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {byDate[date].map((photo) => {
                    const flatIdx = allPhotosFlat.indexOf(photo);
                    return (
                      <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-square group">
                        <button
                          onClick={() => setLightboxIdx(flatIdx)}
                          className="w-full h-full"
                        >
                          <img src={photo.url} alt={photo.slot} className="w-full h-full object-cover" />
                          <div
                            className="absolute bottom-0 left-0 right-0 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
                          >
                            <p className="text-[10px] text-white/80 font-medium">
                              {SLOTS.find((s) => s.key === photo.slot)?.label}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                        >
                          <X className="w-3 h-3 text-white/70" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Weight history */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Histórico de peso</p>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : registros.length === 0 ? (
            <div className="rounded-2xl border border-white/8 py-10 text-center" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
              <Weight className="w-8 h-8 text-muted-foreground opacity-30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nenhum registro ainda.</p>
              <p className="text-muted-foreground opacity-60 text-xs mt-1">Registre seu peso acima para começar.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              {registros.map((r, idx) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
                  style={{ borderBottom: idx < registros.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                >
                  <p className="text-sm font-medium text-foreground">
                    {format(parseISO(r.data_registro), "dd 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-green-500">{r.peso_kg} kg</span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
};

export default Evolucao;
