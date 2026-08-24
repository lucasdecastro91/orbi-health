import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Weight, Plus, Activity, TrendingDown, Minus, Loader2, Trash2,
  Camera, ImagePlus, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import BodyMeasurementsList, { EMPTY_BODY_MEASUREMENTS, buildBodyMeasurements, hasAnyMeasurement, type BodyMeasurements } from "@/components/BodyMeasurements";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Registro {
  id: string;
  data_registro: string;
  peso_kg: number | null;
  created_at: string;
}

type Slot = string; // pode ser valor fixo ou chave customizada

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

const DEFAULT_SLOTS: { key: Slot; label: string }[] = [
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
    <div className="rounded-xl border border-white/10 px-3 py-2" style={{ backgroundColor: "var(--sheet-bg-2)" }}>
      <p className="text-[11px] text-white/40 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-green-500">{payload[0].value} kg</p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Photo lightbox
// ─────────────────────────────────────────────────────────────

const Lightbox = ({
  photos, index, onClose, onNav, slots,
}: { photos: EvoPhoto[]; index: number; onClose: () => void; onNav: (delta: number) => void; slots: { key: string; label: string }[] }) => {
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
          <p className="text-sm text-white/50">{slots.find((s) => s.key === photo.slot)?.label} — {format(parseISO(photo.taken_at), "dd/MM/yyyy")}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "hsl(var(--foreground) / 0.1)" }}>
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
// Before/after photo comparator
// ─────────────────────────────────────────────────────────────

const EvolucaoCompareModal = ({
  photos, slots, onClose,
}: {
  photos: EvoPhoto[];
  slots: { key: string; label: string }[];
  onClose: () => void;
}) => {
  const availableSlots = slots.filter(s => photos.some(p => p.slot === s.key));
  const [selectedSlot, setSelectedSlot] = useState(availableSlots[0]?.key ?? "");
  const [dateA, setDateA] = useState("");
  const [dateB, setDateB] = useState("");
  const [sliderPos, setSliderPos] = useState(50);

  const slotPhotos = photos.filter(p => p.slot === selectedSlot);
  const availDates = [...new Set(slotPhotos.map(p => p.taken_at))].sort((a, b) => b.localeCompare(a));

  useEffect(() => {
    if (availDates.length >= 2) {
      setDateA(availDates[availDates.length - 1]);
      setDateB(availDates[0]);
    } else {
      setDateA(availDates[0] ?? "");
      setDateB("");
    }
    setSliderPos(50);
  }, [selectedSlot]);

  const photoA = slotPhotos.find(p => p.taken_at === dateA);
  const photoB = slotPhotos.find(p => p.taken_at === dateB);
  const canCompare = !!photoA && !!photoB && dateA !== dateB;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.88)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl flex flex-col" style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))", maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        {/* Cabeçalho fixo */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b shrink-0" style={{ borderColor: "hsl(var(--foreground) / 0.07)" }}>
          <p className="text-sm font-semibold text-white/80">Comparar Fotos</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "hsl(var(--foreground) / 0.06)" }}>
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>
        {/* Conteúdo */}
        <div className="p-4 space-y-4">
          {/* Seletor de ângulo */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Ângulo</p>
            <div className="flex flex-wrap gap-1.5">
              {availableSlots.map(s => (
                <button key={s.key} onClick={() => setSelectedSlot(s.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: selectedSlot === s.key ? "rgba(var(--cp-rgb),0.18)" : "hsl(var(--foreground) / 0.06)",
                    color: selectedSlot === s.key ? "var(--cp-400)" : "hsl(var(--foreground) / 0.5)",
                    border: `1px solid ${selectedSlot === s.key ? "rgba(var(--cp-rgb),0.35)" : "transparent"}`,
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* Seletores de data */}
          {availDates.length < 2 ? (
            <p className="text-xs text-white/30 text-center py-2">Apenas 1 data disponível para este ângulo.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {([["Antes", dateA, setDateA, dateB], ["Depois", dateB, setDateB, dateA]] as const).map(([label, val, set, other]) => (
                <div key={String(label)}>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
                  <select value={val} onChange={e => { (set as (v: string) => void)(e.target.value); setSliderPos(50); }}
                    className="w-full h-9 rounded-xl text-xs px-2 outline-none"
                    style={{ backgroundColor: "hsl(var(--foreground) / 0.07)", border: "1px solid hsl(var(--foreground) / 0.1)", color: "hsl(var(--foreground) / 0.8)" }}>
                    {availDates.map(d => (
                      <option key={d} value={d} disabled={d === other} style={{ backgroundColor: "var(--sheet-bg-2)" }}>
                        {format(parseISO(d), "dd/MM/yyyy")}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          {/* Slider — altura = espaço restante da viewport após header + controles */}
          {canCompare && (
            <div>
              <div className="relative overflow-hidden rounded-xl select-none" style={{ height: "calc(92vh - 260px)", backgroundColor: "#0a0a0b" }}>
                <img src={photoB!.url} className="absolute inset-0 w-full h-full object-cover" alt="depois" draggable={false} />
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
                  <img src={photoA!.url} className="w-full h-full object-cover" alt="antes" draggable={false} />
                </div>
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white pointer-events-none" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>ANTES</div>
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white pointer-events-none" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>DEPOIS</div>
                <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}>
                  <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2" style={{ backgroundColor: "hsl(var(--foreground) / 0.85)" }} />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: "white" }}>
                    <ChevronLeft className="w-3 h-3 text-black" />
                    <ChevronRight className="w-3 h-3 text-black" />
                  </div>
                </div>
                <input type="range" min="0" max="100" value={sliderPos}
                  onChange={e => setSliderPos(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
                  style={{ margin: 0, padding: 0 }} />
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">Arraste para comparar</p>
            </div>
          )}
        </div>
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
  const [photos,        setPhotos]        = useState<EvoPhoto[]>([]);
  const [uploading,     setUploading]     = useState<Slot | null>(null);
  const [lightboxIdx,   setLightboxIdx]   = useState<number | null>(null);
  const [studentId,     setStudentId]     = useState<string | null>(null);
  const [slots,         setSlots]         = useState<{ key: Slot; label: string }[]>(DEFAULT_SLOTS);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [compareOpen,   setCompareOpen]   = useState(false);
  const fileInputRef        = useRef<HTMLInputElement>(null);
  const fileInputGalleryRef = useRef<HTMLInputElement>(null);
  const uploadingSlot       = useRef<Slot | null>(null);
  const [photoPickerSlot,   setPhotoPickerSlot] = useState<Slot | null>(null);

  // Medidas corporais — última avaliação física com alguma medida
  // preenchida, comparada com a anterior a ela.
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurements>(EMPTY_BODY_MEASUREMENTS);

  useEffect(() => { loadAll(); }, []);

  // ── Data loaders ─────────────────────────────────────────

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setStudentId(session.user.id);

      // Carrega slots configurados pela org (ou usa padrão)
      const { data: slotsData } = await supabase
        .from("evolution_photo_slots")
        .select("slot_key, label, ordem")
        .eq("org_id", orgId ?? "")
        .order("ordem", { ascending: true });
      if (slotsData && slotsData.length > 0) {
        setSlots(slotsData.map(s => ({ key: s.slot_key, label: s.label })));
      }

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

      // Medidas corporais — precisa do aluno_id (diferente do user_id usado
      // acima) pra buscar as avaliações físicas com medidas.
      try {
        const { data: alunoRow } = await supabase.from("alunos").select("id").eq("user_id", session.user.id).maybeSingle();
        if (alunoRow) {
          const { data: avaliacoes } = await supabase
            .from("avaliacoes_fisicas")
            .select("data_avaliacao, medida_biceps_dir, medida_biceps_esq, medida_peitoral, medida_cintura, medida_quadril, medida_coxa_dir, medida_coxa_esq, medida_panturrilha_dir, medida_panturrilha_esq")
            .eq("aluno_id", alunoRow.id)
            .order("data_avaliacao", { ascending: false });
          const comMedida = (avaliacoes ?? []).filter((a: any) =>
            a.medida_biceps_dir != null || a.medida_biceps_esq != null || a.medida_peitoral != null ||
            a.medida_cintura != null || a.medida_quadril != null || a.medida_coxa_dir != null ||
            a.medida_coxa_esq != null || a.medida_panturrilha_dir != null || a.medida_panturrilha_esq != null);
          setBodyMeasurements(buildBodyMeasurements(comMedida[0] ?? null, comMedida[1] ?? null));
        }
      } catch { /* medidas ficam vazias se falhar — não bloqueia o resto da tela */ }

      // Fotos do bucket público (evolution_photos) — fonte primária
      const primaryPhotos: EvoPhoto[] = photoRes.error ? [] : (photoRes.data as any[]).map((p) => ({
        ...p,
        url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
      }));

      // Chaves já cobertas pelas fotos primárias (date_slot)
      const primaryKeys = new Set(primaryPhotos.map(p => `${p.taken_at}_${p.slot}`));

      // Fotos legadas via JOIN + batch createSignedUrls (evita rate limit)
      const legacyPhotos: EvoPhoto[] = [];
      try {
        const { data: respostas } = await supabase
          .from("atualizacao_respostas")
          .select(`
            id, submitted_at,
            atualizacao_resposta_arquivos (id, storage_path, mime_type)
          `)
          .eq("student_id", session.user.id)
          .order("submitted_at", { ascending: false });

        if (respostas) {
          const toBRDate = (iso: string) =>
            new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

          const candidates: { id: string; storage_path: string; slotKey: string; date: string }[] = [];
          for (const resp of respostas as any[]) {
            const submittedAt: string = resp.submitted_at;
            if (!submittedAt) continue;
            const date = toBRDate(submittedAt);
            const arquivos: any[] = resp.atualizacao_resposta_arquivos ?? [];
            for (const arq of arquivos) {
              if (!arq.storage_path || !arq.mime_type?.startsWith("image/")) continue;
              const parts    = arq.storage_path.split("/");
              const filename = parts[parts.length - 1];
              const slotKey  = filename.replace(/_\d+\.\w+$/, "");
              if (slotKey === filename) continue;
              const key = `${date}_${slotKey}`;
              if (primaryKeys.has(key)) continue;
              candidates.push({ id: arq.id, storage_path: arq.storage_path, slotKey, date });
            }
          }

          if (candidates.length > 0) {
            const { data: signedList } = await supabase.storage
              .from("atualizacoes")
              .createSignedUrls(candidates.map(c => c.storage_path), 86400);

            if (signedList) {
              for (let i = 0; i < candidates.length; i++) {
                const signed = signedList[i];
                if (!signed?.signedUrl) continue;
                const c = candidates[i];
                legacyPhotos.push({
                  id:           `legacy_${c.id}`,
                  slot:         c.slotKey,
                  storage_path: c.storage_path,
                  taken_at:     c.date,
                  url:          signed.signedUrl,
                });
              }
            }
          }
        }
      } catch { /* falha silenciosa no fallback */ }

      const allPhotos = [...primaryPhotos, ...legacyPhotos];
      setPhotos(allPhotos);
      // Expande automaticamente a data mais recente
      if (allPhotos.length > 0) {
        const latestDate = allPhotos.reduce((acc, p) => p.taken_at > acc ? p.taken_at : acc, allPhotos[0].taken_at);
        setExpandedDates(new Set([latestDate]));
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
    setPhotoPickerSlot(slot);
  };

  const pickSource = (source: "camera" | "gallery") => {
    const slot = photoPickerSlot;
    if (!slot) return;
    uploadingSlot.current = slot;
    setPhotoPickerSlot(null);
    if (source === "camera") {
      fileInputRef.current?.click();
    } else {
      fileInputGalleryRef.current?.click();
    }
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
      {/* Hidden file inputs: câmera forçada e galeria livre */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={fileInputGalleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Bottom-sheet de escolha de fonte de foto */}
      {photoPickerSlot !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={() => setPhotoPickerSlot(null)}
        >
          <div
            className="w-full max-w-[390px] rounded-t-2xl"
            style={{ backgroundColor: "var(--sheet-bg)", border: "1px solid hsl(var(--border))", borderBottom: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full" style={{ backgroundColor: "hsl(var(--foreground) / 0.15)" }} />
            </div>
            <p className="text-xs text-white/40 uppercase tracking-wider text-center py-2">
              {slots.find(s => s.key === photoPickerSlot)?.label}
            </p>
            <div className="px-4 space-y-2" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
              <button
                onClick={() => pickSource("camera")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-white/85 transition-colors"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.06)" }}
              >
                <Camera className="w-5 h-5 text-white/50" />
                Tirar foto com câmera
              </button>
              <button
                onClick={() => pickSource("gallery")}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-white/85 transition-colors"
                style={{ backgroundColor: "hsl(var(--foreground) / 0.06)" }}
              >
                <ImagePlus className="w-5 h-5 text-white/50" />
                Escolher da galeria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={allPhotosFlat}
          index={lightboxIdx}
          slots={slots}
          onClose={() => setLightboxIdx(null)}
          onNav={(delta) => setLightboxIdx((i) => Math.min(Math.max(0, (i ?? 0) + delta), allPhotosFlat.length - 1))}
        />
      )}

      {/* Compare modal */}
      {compareOpen && (
        <EvolucaoCompareModal
          photos={allPhotosFlat}
          slots={slots}
          onClose={() => setCompareOpen(false)}
        />
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ── Weight header ─────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5" style={{ color: "var(--cp-500)" }} />
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
                style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}
              >
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.colorClass}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 && (
          <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Gráfico de peso</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="pesoAreaFillFull" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cp-500)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--cp-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="date" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="peso" stroke="var(--cp-500)" strokeWidth={2.5}
                  fill="url(#pesoAreaFillFull)"
                  dot={{ r: 3, fill: "var(--cp-500)", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "var(--cp-500)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Medidas corporais */}
        {hasAnyMeasurement(bodyMeasurements) && (
          <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Medidas corporais</p>
            <p className="text-[11px] text-muted-foreground opacity-70 mb-3">Da última avaliação física feita pelo seu treinador</p>
            <BodyMeasurementsList measurements={bodyMeasurements} />
          </div>
        )}

        {/* Register weight */}
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Registrar peso</p>
          <form onSubmit={handleSave} className="flex gap-3 items-end">
            <div className="flex-1 min-w-0">
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
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Data</label>
              <input
                type="date" value={data} onChange={(e) => setData(e.target.value)}
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-green-600/50 transition-colors"
              />
            </div>
            <button
              type="submit" disabled={saving || !peso}
              className="h-11 w-11 rounded-xl text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50"
              style={{ background: "var(--cp-gradient)" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* ── Photos section ─────────────────────────────── */}
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fotos de progresso</p>
            <Camera className="w-4 h-4 text-muted-foreground opacity-40" />
          </div>

          {/* Slot grid — quantidade dinâmica conforme configuração da org */}
          <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(slots.length, 5)}, 1fr)` }}>
            {slots.map(({ key, label }) => {
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
                      backgroundColor: latest ? undefined : "hsl(var(--foreground) / 0.05)",
                      border: `1px solid ${latest ? "hsl(var(--foreground) / 0.1)" : "hsl(var(--foreground) / 0.08)"}`,
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

        {/* Photo gallery by date — collapsible */}
        {sortedDates.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico de fotos</p>
              {sortedDates.length >= 2 && (
                <button
                  onClick={() => setCompareOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}>
                  <Camera className="w-3 h-3" /> Comparar
                </button>
              )}
            </div>
            {sortedDates.map((date) => {
              const isExpanded = expandedDates.has(date);
              return (
                <div key={date} className="rounded-xl overflow-hidden border border-white/8">
                  <button
                    onClick={() => setExpandedDates(prev => {
                      const next = new Set(prev);
                      if (next.has(date)) next.delete(date); else next.add(date);
                      return next;
                    })}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/3 transition-colors"
                    style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                      {format(parseISO(date), "dd 'de' MMMM yyyy", { locale: ptBR })}
                    </p>
                    {isExpanded
                      ? <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground rotate-90 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground -rotate-90 shrink-0" />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2" style={{ backgroundColor: "hsl(var(--foreground) / 0.01)" }}>
                      <div className="grid grid-cols-3 gap-2">
                        {byDate[date].map((photo) => {
                          const flatIdx = allPhotosFlat.indexOf(photo);
                          return (
                            <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-square group">
                              <button onClick={() => setLightboxIdx(flatIdx)} className="w-full h-full">
                                <img src={photo.url} alt={photo.slot} className="w-full h-full object-cover" />
                                <div
                                  className="absolute bottom-0 left-0 right-0 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                                  <p className="text-[10px] text-white/80 font-medium">
                                    {slots.find((s) => s.key === photo.slot)?.label}
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={() => deletePhoto(photo)}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                                <X className="w-3 h-3 text-white/70" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
            <div className="rounded-2xl border border-white/8 py-10 text-center" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
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
                  style={{ borderBottom: idx < registros.length - 1 ? "1px solid hsl(var(--foreground) / 0.04)" : "none" }}
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
