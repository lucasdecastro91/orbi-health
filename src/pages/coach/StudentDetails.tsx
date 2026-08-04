import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Utensils, Dumbbell, MessageSquare, Weight, ClipboardList, Star, ChevronDown, ChevronUp, Image as ImageIcon, TrendingUp, TrendingDown, Minus, Plus, Loader2 as Spinner, Sparkles, RefreshCw, ClipboardCheck, AlertCircle, Camera, X as XIcon, ChevronLeft as ChevLeft, ChevronRight as ChevRight, Download, Calendar, Play, ChevronRight, ScanLine, NotebookPen, Trash2, BarChart2, CreditCard, CheckCircle2, Pencil, Save, Search } from "lucide-react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import TrainingPlanManager from "./TrainingPlanManager";
import DietManager from "./DietManager";
import BodyMeasurementsList, { EMPTY_BODY_MEASUREMENTS, buildBodyMeasurements, hasAnyMeasurement, type BodyMeasurements } from "@/components/BodyMeasurements";
import UpdateFormManager from "./UpdateFormManager";
import FeedbackManager from "@/components/coach/FeedbackManager";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useCollaboratorPermissions } from "@/hooks/useCollaboratorPermissions";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface StudentData {
  id: string;
  user_id: string;
  observacoes: string | null;
  profiles: { nome: string };
}

type TabKey = "treinos" | "dieta" | "checkins" | "evolucao" | "anamnese" | "atualizacao" | "feedbacks" | "cardio" | "postural" | "plano" | "anotacoes" | "aval_fisica";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "treinos",      label: "Treinos",      icon: Dumbbell       },
  { key: "dieta",        label: "Dieta",        icon: Utensils       },
  { key: "plano",        label: "Plano",        icon: CreditCard     },
  { key: "cardio",       label: "Cardio",       icon: Calendar       },
  { key: "postural",     label: "Aval. Postural", icon: ScanLine       },
  { key: "aval_fisica",  label: "Aval. Física", icon: BarChart2      },
  { key: "checkins",     label: "Check-ins",    icon: ClipboardList  },
  { key: "evolucao",     label: "Evolução",     icon: TrendingUp     },
  { key: "anamnese",     label: "Anamnese",     icon: ClipboardCheck },
  { key: "atualizacao",  label: "Atualização",  icon: ClipboardList  },
  { key: "feedbacks",    label: "Feedbacks",    icon: MessageSquare  },
  { key: "anotacoes",    label: "Anotações",    icon: NotebookPen    },
];

// ── Photo slot constants ───────────────────────────────────────────
const DEFAULT_PHOTO_SLOTS = [
  { key: "front",      label: "Frente"  },
  { key: "side_left",  label: "Lado E." },
  { key: "side_right", label: "Lado D." },
  { key: "back",       label: "Costas"  },
  { key: "free",       label: "Livre"   },
];
const BUCKET = "evolution-photos";

// ── Before/after photo comparator ─────────────────────────────────
const EvolucaoCompareModal = ({
  photos, slots, onClose, studentName,
}: {
  photos: { slot: string; taken_at: string; url: string }[];
  slots: { key: string; label: string }[];
  onClose: () => void;
  studentName: string;
}) => {
  const availableSlots = slots.filter(s => photos.some(p => p.slot === s.key));
  const [selectedSlot, setSelectedSlot] = useState(availableSlots[0]?.key ?? "");
  const [dateA, setDateA] = useState("");
  const [dateB, setDateB] = useState("");
  const [exporting, setExporting] = useState(false);
  const photoRowRef = useRef<HTMLDivElement>(null);
  const [photoRowWidth, setPhotoRowWidth] = useState<number | null>(null);
  const loadedCountRef = useRef(0);
  const measurePhotoRow = () => {
    loadedCountRef.current += 1;
    if (loadedCountRef.current >= 2 && photoRowRef.current) {
      setPhotoRowWidth(photoRowRef.current.offsetWidth);
    }
  };
  useEffect(() => {
    loadedCountRef.current = 0;
    setPhotoRowWidth(null);
  }, [dateA, dateB]);

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
  }, [selectedSlot]);

  const photoA = slotPhotos.find(p => p.taken_at === dateA);
  const photoB = slotPhotos.find(p => p.taken_at === dateB);
  const canCompare = !!photoA && !!photoB && dateA !== dateB;


  const handleSaveImage = async () => {
    if (!photoA || !photoB || exporting) return;
    setExporting(true);
    try {
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      const [imgA, imgB] = await Promise.all([loadImg(photoA.url), loadImg(photoB.url)]);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      // Normaliza alturas: ambas com a mesma altura máxima
      const H = Math.max(imgA.naturalHeight, imgB.naturalHeight);
      const scaleA = H / imgA.naturalHeight;
      const scaleB = H / imgB.naturalHeight;
      const wA = Math.round(imgA.naturalWidth * scaleA);
      const wB = Math.round(imgB.naturalWidth * scaleB);
      const GAP = 4;
      canvas.width = wA + GAP + wB;
      canvas.height = H;
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, canvas.width, H);
      ctx.drawImage(imgA, 0, 0, wA, H);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(wA, 0, GAP, H);
      ctx.drawImage(imgB, wA + GAP, 0, wB, H);
      // Labels
      const addLabel = (text: string, x: number, y: number) => {
        ctx.font = "bold 20px sans-serif";
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.beginPath();
        ctx.roundRect(x, y, tw + 16, 28, 6);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.fillText(text, x + 8, y + 20);
      };
      addLabel("ANTES", 10, 10);
      addLabel("DEPOIS", wA + GAP + 10, 10);

      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = studentName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_").toLowerCase();
        a.download = `comparativo_${safeName}_${dateA}_vs_${dateB}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("Erro ao exportar imagem:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.85)" }} onClick={onClose}>
      <div className="rounded-2xl flex flex-col transition-all duration-300" style={{ backgroundColor: "#111113", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85vh", overflow: "hidden", width: photoRowWidth ? photoRowWidth + 32 : "fit-content", minWidth: photoRowWidth ? undefined : 400, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        {/* Cabeçalho fixo */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <p className="text-sm font-semibold text-white/80">Comparar Fotos</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/8 transition-colors">
            <XIcon className="w-4 h-4 text-white/50" />
          </button>
        </div>
        {/* Conteúdo */}
        <div className="p-4 space-y-3 overflow-y-auto">
          {/* Seletor de ângulo */}
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Ângulo</p>
            <div className="flex flex-wrap gap-1.5">
              {availableSlots.map(s => (
                <button key={s.key} onClick={() => setSelectedSlot(s.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: selectedSlot === s.key ? "rgba(var(--cp-rgb),0.18)" : "rgba(255,255,255,0.06)",
                    color: selectedSlot === s.key ? "var(--cp-400)" : "rgba(255,255,255,0.5)",
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
                  <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5">{label}</p>
                  <select value={val} onChange={e => { (set as (v: string) => void)(e.target.value); }}
                    className="w-full h-9 rounded-xl text-xs px-2 outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}>
                    {availDates.map(d => (
                      <option key={d} value={d} disabled={d === other} style={{ backgroundColor: "#1a1a1d" }}>
                        {format(parseISO(d), "dd/MM/yyyy")}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {canCompare && (
            /* ── Lado a lado: cada foto em sua proporção natural, sem barras ── */
            <div ref={photoRowRef} className="flex gap-0 rounded-xl overflow-hidden mx-auto" style={{ backgroundColor: "#0a0a0b", width: "fit-content" }}>
              <div className="relative flex-none">
                <img src={photoA!.url} style={{ height: "55vh", width: "auto", display: "block" }} onLoad={measurePhotoRow} alt="antes" draggable={false} />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white pointer-events-none" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>ANTES</div>
              </div>
              <div className="shrink-0 self-stretch" style={{ width: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
              <div className="relative flex-none">
                <img src={photoB!.url} style={{ height: "55vh", width: "auto", display: "block" }} onLoad={measurePhotoRow} alt="depois" draggable={false} />
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white pointer-events-none" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>DEPOIS</div>
              </div>
            </div>
          )}
        </div>
        {/* Botão salvar imagem — fora do conteúdo, sempre visível */}
        {canCompare && (
          <div className="px-4 pb-4 shrink-0">
            <button onClick={handleSaveImage} disabled={exporting}
              className="w-full h-9 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Gerando..." : "Salvar imagem"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Evolução de peso viewer ────────────────────────────────────────
const EvolucaoViewer = ({ studentUserId, studentName, alunoId }: { studentUserId: string; studentName: string; alunoId: string }) => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [peso,      setPeso]      = useState("");
  const [data,      setData]      = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving,    setSaving]    = useState(false);

  // Medidas corporais — as 2 avaliações físicas mais recentes que têm alguma
  // medida preenchida (a mais nova pro valor atual, a anterior pra calcular
  // a variação).
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurements>(EMPTY_BODY_MEASUREMENTS);

  // Photos
  const [photos,       setPhotos]       = useState<any[]>([]);
  const [lightboxIdx,  setLightboxIdx]  = useState<number | null>(null);
  const [slots,        setSlots]        = useState(DEFAULT_PHOTO_SLOTS);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [compareOpen,   setCompareOpen]   = useState(false);

  useEffect(() => { load(); }, [studentUserId]);

  const load = async () => {
    setLoading(true);
    try {
      // Busca slots configurados pela org (fallback: padrão)
      if (orgId) {
        const { data: slotsData } = await supabase
          .from("evolution_photo_slots")
          .select("slot_key, label, ordem")
          .eq("org_id", orgId)
          .order("ordem", { ascending: true });
        if (slotsData && slotsData.length > 0) {
          setSlots(slotsData.map((s: any) => ({ key: s.slot_key, label: s.label })));
        }
      }

      const [weightRes, photoRes] = await Promise.all([
        supabase
          .from("registros_evolucao")
          .select("*")
          .eq("student_id", studentUserId)
          .order("data_registro", { ascending: false }),
        supabase
          .from("evolution_photos")
          .select("id, slot, storage_path, taken_at")
          .eq("student_id", studentUserId)
          .order("taken_at", { ascending: false }),
      ]);
      if (weightRes.error) throw weightRes.error;
      setRegistros(weightRes.data ?? []);

      // Medidas corporais — última avaliação física com alguma medida
      // preenchida, comparada com a anterior a ela.
      try {
        const { data: avaliacoes } = await supabase
          .from("avaliacoes_fisicas")
          .select("data_avaliacao, medida_biceps_dir, medida_biceps_esq, medida_peitoral, medida_cintura, medida_quadril, medida_coxa_dir, medida_coxa_esq, medida_panturrilha_dir, medida_panturrilha_esq")
          .eq("aluno_id", alunoId)
          .order("data_avaliacao", { ascending: false });
        const comMedida = (avaliacoes ?? []).filter((a: any) =>
          a.medida_biceps_dir != null || a.medida_biceps_esq != null || a.medida_peitoral != null ||
          a.medida_cintura != null || a.medida_quadril != null || a.medida_coxa_dir != null ||
          a.medida_coxa_esq != null || a.medida_panturrilha_dir != null || a.medida_panturrilha_esq != null);
        setBodyMeasurements(buildBodyMeasurements(comMedida[0] ?? null, comMedida[1] ?? null));
      } catch { /* medidas ficam vazias se falhar — não bloqueia o resto da tela */ }
      // Fotos primárias (evolution_photos, bucket público)
      const primaryPhotos = photoRes.error ? [] : (photoRes.data ?? []).map((p: any) => ({
        ...p,
        url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
      }));
      const primaryKeys = new Set(primaryPhotos.map((p: any) => `${p.taken_at}_${p.slot}`));

      // Fotos legadas: JOIN + batch createSignedUrls (evita rate limit)
      const legacyPhotos: any[] = [];
      try {
        const { data: respostas } = await supabase
          .from("atualizacao_respostas")
          .select(`
            id, submitted_at,
            atualizacao_resposta_arquivos (id, storage_path, mime_type)
          `)
          .eq("student_id", studentUserId)
          .order("submitted_at", { ascending: false });

        if (respostas) {
          // Converte timestamp UTC para data no fuso horário do Brasil
          const toBRDate = (iso: string) =>
            new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

          // Coleta candidatos (sem criar URL ainda)
          const candidates: { id: string; storage_path: string; slotKey: string; date: string }[] = [];
          for (const resp of respostas as any[]) {
            const submittedAt: string = resp.submitted_at;
            if (!submittedAt) continue;
            const date = toBRDate(submittedAt);
            const arquivos: any[] = resp.atualizacao_resposta_arquivos ?? [];
            for (const arq of arquivos) {
              if (!arq.storage_path || !arq.mime_type?.startsWith("image/")) continue;
              const parts   = arq.storage_path.split("/");
              const fname   = parts[parts.length - 1];
              const slotKey = fname.replace(/_\d+\.\w+$/, "");
              if (slotKey === fname) continue;
              const key = `${date}_${slotKey}`;
              if (primaryKeys.has(key)) continue; // já em evolution_photos
              candidates.push({ id: arq.id, storage_path: arq.storage_path, slotKey, date });
            }
          }

          // Uma única chamada batch para todas as URLs assinadas
          if (candidates.length > 0) {
            const { data: signedList } = await supabase.storage
              .from("atualizacoes")
              .createSignedUrls(candidates.map(c => c.storage_path), 3600);

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
      } catch { /* fallback silencioso — não impede fotos primárias */ }

      const allPhotos = [...primaryPhotos, ...legacyPhotos];
      setPhotos(allPhotos);
      if (allPhotos.length > 0) {
        const latestDate = allPhotos.reduce((acc: string, p: any) => p.taken_at > acc ? p.taken_at : acc, allPhotos[0].taken_at);
        setExpandedDates(new Set([latestDate]));
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar evolução", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peso) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("registros_evolucao").upsert({
        student_id: studentUserId,
        org_id: orgId,
        data_registro: data,
        peso_kg: Number(peso),
      }, { onConflict: "student_id,data_registro" });
      if (error) throw error;
      toast({ title: "Registro adicionado!" });
      setPeso("");
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const sorted = [...registros].filter(r => r.peso_kg != null).sort((a, b) => a.data_registro.localeCompare(b.data_registro));
  const pesoInicial = sorted[0]?.peso_kg ?? null;
  const pesoAtual   = sorted[sorted.length - 1]?.peso_kg ?? null;
  const variacao    = pesoInicial != null && pesoAtual != null ? pesoAtual - pesoInicial : null;
  const chartData   = sorted.slice(-30).map(r => ({ date: format(parseISO(r.data_registro), "dd/MM", { locale: ptBR }), peso: r.peso_kg }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border px-3 py-2" style={{ backgroundColor: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</p>
        <p className="text-sm font-bold text-green-500">{payload[0].value} kg</p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      {sorted.length >= 2 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Peso inicial", value: pesoInicial != null ? `${pesoInicial} kg` : "—" },
            { label: "Peso atual",   value: pesoAtual   != null ? `${pesoAtual} kg`   : "—" },
            {
              label: "Variação",
              value: variacao != null ? `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)} kg` : "—",
              color: variacao == null ? undefined : variacao < 0 ? "var(--cp-400)" : variacao > 0 ? "hsl(0 70% 55%)" : undefined,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border px-4 py-3" style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>{s.label}</p>
              <p className="text-base font-bold" style={{ color: s.color ?? "var(--text-high)" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length >= 2 && (
        <div className="rounded-2xl border p-4" style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Gráfico de evolução</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="peso" stroke="var(--cp-500)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--cp-500)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Medidas corporais — compacto aqui, versão maior fica na tela do aluno */}
      {hasAnyMeasurement(bodyMeasurements) && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Medidas corporais</p>
          <p className="text-[11px] mb-2" style={{ color: "var(--text-dim)", opacity: 0.7 }}>Última avaliação física com medidas registradas</p>
          <BodyMeasurementsList measurements={bodyMeasurements} compact />
        </div>
      )}

      {/* Manual add */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
        <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-3">Adicionar registro</p>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-foreground/40 uppercase tracking-wider mb-1.5 block">Peso (kg)</label>
              <input type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} placeholder="72.5" className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-green-600/50 transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-foreground/40 uppercase tracking-wider mb-1.5 block">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-green-600/50 transition-colors" />
            </div>
          </div>
          <button type="submit" disabled={saving || !peso} className="h-10 px-5 rounded-xl text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--cp-gradient)" }}>
            {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </form>
      </div>

      {/* History list */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-white/30 justify-center"><Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span></div>
      ) : registros.length === 0 ? (
        <div className="rounded-2xl py-10 text-center" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <p className="text-white/30 text-sm">Nenhum registro de peso ainda.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          {registros.slice(0, 20).map((r, idx) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: idx < Math.min(registros.length, 20) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <span className="text-sm text-white/60">{format(parseISO(r.data_registro), "dd 'de' MMMM yyyy", { locale: ptBR })}</span>
              <span className="text-base font-bold text-green-500">{r.peso_kg} kg</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Photo gallery ── */}
      {(() => {
        if (photos.length === 0) {
          return (
            <div className="rounded-2xl py-8 text-center" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
              <Camera className="w-7 h-7 text-white/10 mx-auto mb-2" />
              <p className="text-white/25 text-sm">Nenhuma foto de evolução ainda</p>
            </div>
          );
        }

        // Group by date
        const byDate: Record<string, any[]> = {};
        for (const p of photos) {
          if (!byDate[p.taken_at]) byDate[p.taken_at] = [];
          byDate[p.taken_at].push(p);
        }
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        const flat  = dates.flatMap((d) => byDate[d]);

        return (
          <>
            {/* Lightbox */}
            {lightboxIdx !== null && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
                onClick={() => setLightboxIdx(null)}
              >
                <div className="relative w-full max-w-md px-4" onClick={(e) => e.stopPropagation()}>
                  <img src={flat[lightboxIdx].url} alt="" className="w-full rounded-2xl object-contain max-h-[75vh]" />
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-sm text-white/50">
                      {slots.find((s) => s.key === flat[lightboxIdx].slot)?.label} — {format(parseISO(flat[lightboxIdx].taken_at), "dd/MM/yyyy")}
                    </p>
                    <button onClick={() => setLightboxIdx(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                      <XIcon className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                  {flat.length > 1 && (
                    <>
                      <button onClick={() => setLightboxIdx((i) => Math.max(0, (i ?? 0) - 1))} disabled={lightboxIdx === 0} className="absolute left-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <ChevLeft className="w-5 h-5 text-white" />
                      </button>
                      <button onClick={() => setLightboxIdx((i) => Math.min(flat.length - 1, (i ?? 0) + 1))} disabled={lightboxIdx === flat.length - 1} className="absolute right-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <ChevRight className="w-5 h-5 text-white" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Fotos de evolução</p>
                {dates.length >= 2 && (
                  <button
                    onClick={() => setCompareOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}>
                    <Camera className="w-3 h-3" /> Comparar
                  </button>
                )}
              </div>
              {dates.map((date) => {
                const isExpanded = expandedDates.has(date);
                return (
                  <div key={date} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    <button
                      onClick={() => setExpandedDates(prev => {
                        const next = new Set(prev);
                        if (next.has(date)) next.delete(date); else next.add(date);
                        return next;
                      })}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/3"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                      <p className="text-[11px] text-white/50 uppercase tracking-wider font-medium">
                        {format(parseISO(date), "dd 'de' MMMM yyyy", { locale: ptBR })}
                      </p>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-white/25 shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-white/25 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2" style={{ backgroundColor: "rgba(255,255,255,0.01)" }}>
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(slots.length, 5)}, 1fr)` }}>
                          {slots.map(({ key, label }) => {
                            const photo = byDate[date]?.find((p) => p.slot === key);
                            if (!photo) {
                              return (
                                <div key={key} className="flex flex-col items-center gap-1">
                                  <div className="w-full aspect-square rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.07)" }} />
                                  <span className="text-[9px] text-white/20">{label}</span>
                                </div>
                              );
                            }
                            const flatIdx = flat.indexOf(photo);
                            return (
                              <div key={key} className="flex flex-col items-center gap-1">
                                <button onClick={() => setLightboxIdx(flatIdx)} className="w-full aspect-square rounded-xl overflow-hidden">
                                  <img src={photo.url} alt={label} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                                </button>
                                <span className="text-[9px] text-white/35">{label}</span>
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
            {compareOpen && (
              <EvolucaoCompareModal photos={flat} slots={slots} onClose={() => setCompareOpen(false)} studentName={studentName} />
            )}
          </>
        );
      })()}
    </div>
  );
};

// ── Anamnese viewer ────────────────────────────────────────────────
const AnamneseViewer = ({ studentUserId, studentAlunoId }: { studentUserId: string; studentAlunoId: string }) => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();
  const [data,           setData]           = useState<any | null>(null);
  const [template,       setTemplate]       = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [requesting,     setRequesting]     = useState(false);
  const [dispensing,     setDispensing]     = useState(false);
  const [canceling,      setCanceling]      = useState(false);
  const [deleting,       setDeleting]       = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [expanded,       setExpanded]       = useState(false);

  useEffect(() => { load(); }, [studentUserId]);

  const load = async () => {
    setLoading(true);
    try {
      const [anamneseRes, templateRes] = await Promise.all([
        supabase.from("anamneses").select("*").eq("student_id", studentUserId).maybeSingle(),
        orgId
          ? supabase.from("anamnese_templates").select("perguntas").eq("org_id", orgId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setData(anamneseRes.data ?? null);
      const pergs: any[] = (templateRes as any)?.data?.perguntas ?? [];
      setTemplate(pergs.sort ? pergs.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)) : pergs);
    } catch (err: any) {
      toast({ title: "Erro ao carregar anamnese", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const isSectionMode  = template.length > 0 && template[0]?.titulo !== undefined;
  const isTemplateMode = !isSectionMode && template.length > 0 && template[0]?.tipo !== undefined;

  const requestNew = async () => {
    if (!data) return;
    setRequesting(true);
    try {
      // Update flag on alunos (coach has permission); anamneses.pendente kept in sync but may be blocked by RLS
      await (supabase as any).from("alunos").update({ anamnese_pendente: true, anamnese_dispensada: false }).eq("id", studentAlunoId);
      await supabase.from("anamneses").update({ pendente: true }).eq("id", data.id);
      await supabase.from("notificacoes").insert({
        user_id: studentUserId, org_id: orgId,
        titulo: "Seu treinador solicitou uma nova anamnese",
        mensagem: "Acesse a seção de Anamnese e atualize suas informações.",
        tipo: "anamnese",
      });
      setData((d: any) => ({ ...d, pendente: true }));
      toast({ title: "Solicitação enviada!", description: "O aluno será notificado para atualizar a anamnese." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setRequesting(false); }
  };

  const requestFirst = async () => {
    setRequesting(true);
    try {
      await (supabase as any).from("alunos").update({ anamnese_pendente: true, anamnese_dispensada: false }).eq("id", studentAlunoId);
      await supabase.from("notificacoes").insert({
        user_id: studentUserId, org_id: orgId,
        titulo: "Seu treinador solicitou o preenchimento da anamnese",
        mensagem: "Acesse a seção Anamnese no app para preencher sua ficha.",
        tipo: "anamnese",
      });
      toast({ title: "Solicitação enviada!", description: "O aluno foi notificado para preencher a anamnese." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setRequesting(false); }
  };

  const dispensarAnamnese = async () => {
    setDispensing(true);
    try {
      const { error } = await supabase.from("alunos").update({ anamnese_dispensada: true, anamnese_pendente: false }).eq("id", studentAlunoId);
      if (error) throw error;
      toast({ title: "Anamnese dispensada!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setDispensing(false); }
  };

  const cancelarSolicitacao = async () => {
    if (!data) return;
    setCanceling(true);
    try {
      await (supabase as any).from("alunos").update({ anamnese_pendente: false }).eq("id", studentAlunoId);
      await supabase.from("anamneses").update({ pendente: false }).eq("id", data.id);
      setData((d: any) => ({ ...d, pendente: false }));
      toast({ title: "Solicitação cancelada." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setCanceling(false); }
  };

  const deleteAnamnese = async () => {
    if (!data) return;
    setDeleting(true); setConfirmDelete(false);
    try {
      const { error } = await supabase.from("anamneses").delete().eq("id", data.id);
      if (error) throw error;
      // Reseta o flag de pendência para que o painel do aluno não mostre aviso indevido
      await (supabase as any).from("alunos").update({ anamnese_pendente: false }).eq("id", studentAlunoId);
      setData(null);
      toast({ title: "Anamnese excluída com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────
  const FldText = ({ label, value }: { label: string; value: string | number | null | undefined }) => {
    if (!value && value !== 0) return null;
    return (
      <div>
        <p className="text-[11px] text-white/35 mb-0.5">{label}</p>
        <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{String(value)}</p>
      </div>
    );
  };

  const FldTags = ({ label, value }: { label: string; value: string[] | null | undefined }) => {
    if (!value?.length) return null;
    return (
      <div>
        <p className="text-[11px] text-white/35 mb-1">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {value.map(v => (
            <span key={v} className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)" }}>{v}</span>
          ))}
        </div>
      </div>
    );
  };

  const renderCampo = (campo: any) => {
    if (!data) return null;
    const raw = data.respostas_extras?.[campo.id];
    if (raw == null || raw === "") return null;
    if (campo.tipo === "checkbox") {
      try {
        const vals: string[] = JSON.parse(raw);
        const labels = vals.map((v: string) => campo.opcoes?.find((o: any) => o.value === v)?.label ?? v);
        return <FldTags key={campo.id} label={campo.label} value={labels} />;
      } catch { return <FldText key={campo.id} label={campo.label} value={raw} />; }
    }
    if (campo.tipo === "radio") {
      return <FldText key={campo.id} label={campo.label} value={campo.opcoes?.find((o: any) => o.value === raw)?.label ?? raw} />;
    }
    if (campo.tipo === "file") return null;
    return <FldText key={campo.id} label={campo.label} value={raw} />;
  };

  // Download anamnese as plain text
  const downloadAnamnese = () => {
    if (!data) return;
    let txt = `ANAMNESE\nPreenchida em: ${format(parseISO(data.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n\n`;

    if (isSectionMode) {
      for (const secao of template) {
        const campos = (secao.campos ?? []).filter((c: any) => data.respostas_extras?.[c.id] != null && data.respostas_extras?.[c.id] !== "");
        if (!campos.length) continue;
        txt += `${(secao.titulo as string).toUpperCase()}\n`;
        for (const c of campos) txt += `${c.label}: ${data.respostas_extras?.[c.id]}\n`;
        txt += "\n";
      }
    } else if (isTemplateMode) {
      for (const c of template) {
        const raw = data.respostas_extras?.[c.id];
        if (raw != null && raw !== "") txt += `${c.label}: ${raw}\n`;
      }
    } else {
      // classic
      const pairs: [string, any][] = [
        ["Nome completo", data.nome_completo], ["Idade", data.idade], ["Altura", data.altura],
        ["Peso atual", data.peso_atual], ["WhatsApp", data.whatsapp], ["Sexo", data.sexo],
        ["Objetivo", data.objetivo], ["Pratica atividade física", data.pratica_atividade],
        ["Medicações", data.medicamentos], ["Lesões/cirurgias", data.lesoes_cirurgias],
        ["Restrições alimentares", data.restricoes_alimentares], ["Suplementos", data.suplementos],
        ["Sono", data.sono], ["Observações", data.observacoes],
      ];
      for (const [l, v] of pairs) if (v) txt += `${l}: ${v}\n`;
    }

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `anamnese.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-14 gap-2 text-white/25">
      <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando anamnese...</span>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Ficha de Anamnese</p>
          <p className="text-[11px] text-white/25 mt-0.5">{data ? "1 anamnese registrada" : "Nenhuma anamnese registrada"}</p>
        </div>
        {/* Solicitar anamnese / atualização */}
        {!data?.pendente && (
          <button
            onClick={data ? requestNew : requestFirst}
            disabled={requesting}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
            {requesting ? <Spinner className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {data ? "Solicitar atualização" : "Solicitar anamnese"}
          </button>
        )}
      </div>

      {/* ── Pending banner ── */}
      {data?.pendente && (
        <div className="rounded-2xl border px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", borderColor: "rgba(var(--cp-rgb),0.2)" }}>
          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          <p className="text-sm flex-1" style={{ color: "var(--cp-300)" }}>
            Anamnese solicitada — aguardando resposta do aluno.
          </p>
          <button onClick={cancelarSolicitacao} disabled={canceling}
            className="text-xs font-medium px-2 py-1 rounded-lg shrink-0 transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--btn-ghost-bg)", color: "var(--btn-ghost-color)" }}>
            {canceling ? "..." : "Cancelar"}
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!data && (
        <div className="rounded-2xl py-14 flex flex-col items-center gap-4 text-center"
          style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
            <ClipboardCheck className="w-6 h-6 text-green-500/50" />
          </div>
          <div>
            <p className="text-white/50 font-medium text-sm">Anamnese não preenchida</p>
            <p className="text-white/25 text-xs mt-1 max-w-xs">O aluno ainda não preencheu a ficha de anamnese.</p>
          </div>
          <button onClick={dispensarAnamnese} disabled={dispensing}
            className="flex items-center justify-center gap-2 text-xs font-medium px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>
            {dispensing ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
            Dispensar (já preenchida externamente)
          </button>
        </div>
      )}

      {/* ── Anamnese card ── */}
      {data && (
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>

          {/* Card header */}
          <div className="flex items-center">
            <button onClick={() => setExpanded(e => !e)}
              className="flex-1 flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors text-left min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-white/80">
                    {format(parseISO(data.created_at), "dd 'de' MMMM yyyy", { locale: ptBR })}
                  </span>
                  {data.updated_at && data.updated_at !== data.created_at && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }}>
                      Atualizada em {format(parseISO(data.updated_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
              </div>
              {expanded
                ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
            </button>

            {/* Download + Trash */}
            <div className="flex items-center gap-1 pr-3">
              <button onClick={downloadAnamnese}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/6 shrink-0"
                style={{ color: "var(--cp-400)" }}
                title="Baixar anamnese">
                <Download className="w-3.5 h-3.5" />
              </button>
              {confirmDelete ? (
                <>
                  <span className="text-xs text-white/50 mr-1">Excluir?</span>
                  <button onClick={deleteAnamnese} disabled={deleting}
                    className="text-xs px-2 h-7 rounded-lg font-semibold"
                    style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                    {deleting ? "..." : "Sim"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 h-7 rounded-lg font-semibold"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                    Não
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(true)} disabled={deleting}
                  className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/6 shrink-0"
                  style={{ color: "rgba(255,255,255,0.2)" }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Expanded answers */}
          {expanded && (
            <div className="border-t px-4 py-4 space-y-5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>

              {/* Section mode */}
              {isSectionMode && (
                <div className="space-y-5">
                  {template.map((secao: any) => {
                    const campos = (secao.campos ?? []).filter((c: any) => {
                      const raw = data.respostas_extras?.[c.id];
                      return raw != null && raw !== "";
                    });
                    if (!campos.length) return null;
                    return (
                      <div key={secao.id}>
                        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-3">{secao.titulo}</p>
                        <div className="space-y-3">{campos.map((c: any) => renderCampo(c))}</div>
                      </div>
                    );
                  })}
                  {(!data.respostas_extras || Object.keys(data.respostas_extras).length === 0) && (
                    <p className="text-xs text-white/30 text-center py-4">Nenhuma resposta registrada.</p>
                  )}
                </div>
              )}

              {/* Flat template mode */}
              {isTemplateMode && (
                <div className="space-y-3">
                  {template.map((c: any) => renderCampo(c))}
                  {(!data.respostas_extras || Object.keys(data.respostas_extras).length === 0) && (
                    <p className="text-xs text-white/30">Nenhuma resposta registrada.</p>
                  )}
                </div>
              )}

              {/* Classic mode */}
              {!isSectionMode && !isTemplateMode && (
                <div className="space-y-5">
                  {[
                    { title: "Dados pessoais", fields: [
                      ["Nome completo", data.nome_completo], ["Idade", data.idade ? `${data.idade} anos` : null],
                      ["Altura", data.altura], ["Peso atual", data.peso_atual ? `${data.peso_atual} kg` : null],
                      ["WhatsApp", data.whatsapp], ["Sexo", data.sexo],
                    ]},
                    { title: "Objetivo e atividade física", fields: [
                      ["Objetivo principal", data.objetivo], ["Pratica atividade física", data.pratica_atividade],
                      ["Há quanto tempo", data.tempo_pratica], ["Frequência semanal", data.frequencia_treino_opcao],
                      ["Tempo por sessão", data.tempo_por_sessao],
                    ]},
                    { title: "Saúde", fields: [
                      ["Lesões / cirurgias", data.lesoes_cirurgias], ["Medicações", data.medicamentos],
                      ["Dor ao exercitar", data.desconforto_dor],
                    ]},
                    { title: "Alimentação", fields: [
                      ["Restrições / alergias", data.restricoes_alimentares],
                      ["Qualidade alimentar", data.qualidade_alimentacao],
                      ["Suplementos", data.suplementos], ["Álcool", data.alcool],
                    ]},
                    { title: "Hábitos", fields: [
                      ["Sono", data.sono], ["Nível de estresse", data.estresse], ["Observações", data.observacoes],
                    ]},
                  ].map(({ title, fields }) => {
                    const visible = fields.filter(([, v]) => v);
                    if (!visible.length) return null;
                    return (
                      <div key={title}>
                        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-3">{title}</p>
                        <div className="space-y-3">
                          {visible.map(([l, v]) => <FldText key={String(l)} label={String(l)} value={v as any} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Check-in types ─────────────────────────────────────────────────
interface CheckInRecord {
  id: string;
  weight: number | null;
  fotos: string[] | null;
  treino_avaliacao: number | null;
  treino_obs: string | null;
  dieta_avaliacao: number | null;
  dieta_obs: string | null;
  aderencia: number | null;
  obs_geral: string | null;
  relatorio_ia: string | null;
  relatorio_gerado_em: string | null;
  relatorio_visualizado: boolean | null;
  created_at: string;
}

const ratingLabel = (v: number) =>
  ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"][v] ?? "";

const StarDisplay = ({ value, color }: { value: number | null; color: string }) => {
  if (!value) return <span className="text-xs text-white/25">—</span>;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="w-3.5 h-3.5"
          style={{ color: n <= value ? color : "rgba(255,255,255,0.12)", fill: n <= value ? color : "none" }}
        />
      ))}
      <span className="text-xs ml-1" style={{ color }}>{ratingLabel(value)}</span>
    </div>
  );
};

// ── Atualizações viewer (novo sistema) ────────────────────────────
interface AtualizacaoArquivo { id: string; storage_path: string; nome_original: string | null; mime_type: string | null; }
interface AtualizacaoValor  { id: string; campo_id: string | null; valor_texto: string | null; valor_numero: number | null; valor_opcoes: string[] | null; campo: { label: string; tipo: string; ordem: number } | null; }
interface AtualizacaoResp   { id: string; submitted_at: string; valores: AtualizacaoValor[]; arquivos: AtualizacaoArquivo[]; relatorio_ia: string | null; relatorio_gerado_em: string | null; mensagem_feedback: string | null; }

const StudentAtualizacoesViewer = ({ studentUserId, alunoId }: { studentUserId: string; alunoId: string }) => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();
  const [respostas,      setRespostas]      = useState<AtualizacaoResp[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [expanded,       setExpanded]       = useState<string | null>(null);
  const [previewUrls,    setPreviewUrls]    = useState<Record<string, string>>({});
  const [downloading,    setDownloading]    = useState<string | null>(null);
  const [deleting,       setDeleting]       = useState<string | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [sendingFeedback,  setSendingFeedback]  = useState<string | null>(null);
  const [confirmSend,      setConfirmSend]      = useState<string | null>(null);
  const [feedbackDraft,    setFeedbackDraft]    = useState<Record<string, string>>({});

  useEffect(() => { load(); }, [studentUserId]);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from("atualizacao_respostas")
        .select(`
          id, submitted_at, relatorio_ia, relatorio_gerado_em, mensagem_feedback,
          atualizacao_resposta_valores (
            id, campo_id, valor_texto, valor_numero, valor_opcoes,
            atualizacao_form_campos (label, tipo, ordem)
          ),
          atualizacao_resposta_arquivos (id, storage_path, nome_original, mime_type)
        `)
        .eq("student_id", studentUserId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      setRespostas((data ?? []).map((r: any) => ({
        id: r.id,
        submitted_at: r.submitted_at,
        relatorio_ia: r.relatorio_ia ?? null,
        relatorio_gerado_em: r.relatorio_gerado_em ?? null,
        mensagem_feedback: r.mensagem_feedback ?? null,
        arquivos: r.atualizacao_resposta_arquivos ?? [],
        valores: (r.atualizacao_resposta_valores ?? [])
          .map((v: any) => ({ id: v.id, campo_id: v.campo_id, valor_texto: v.valor_texto, valor_numero: v.valor_numero, valor_opcoes: v.valor_opcoes, campo: v.atualizacao_form_campos ?? null }))
          .sort((a: AtualizacaoValor, b: AtualizacaoValor) => (a.campo?.ordem ?? 0) - (b.campo?.ordem ?? 0)),
      })));
    } catch (e: any) {
      toast({ title: "Erro ao carregar atualizações", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  // Deriva URL pública do bucket evolution-photos para imagens de slot.
  // Formato do path em atualizacoes: {userId}/{respostaId}/{campoId}/{slotKey}_{timestamp}.{ext}
  const getEvoPhotoUrl = (arq: AtualizacaoArquivo, submittedAt: string): string | null => {
    if (!orgId || !arq.mime_type?.startsWith("image/") || !arq.storage_path) return null;
    try {
      const parts    = arq.storage_path.split("/");
      if (parts.length < 4) return null;
      const userId   = parts[0];
      const filename = parts[parts.length - 1];
      const ext      = filename.split(".").pop() ?? "jpg";
      // Remove sufixo _timestamp.ext para obter slotKey
      const slotKey  = filename.replace(/_\d+\.\w+$/, "");
      if (slotKey === filename) return null; // padrão não reconhecido
      const date     = submittedAt.split("T")[0];
      const evoPath  = `${orgId}/${userId}/${date}_${slotKey}.${ext}`;
      return supabase.storage.from("evolution-photos").getPublicUrl(evoPath).data.publicUrl;
    } catch { return null; }
  };

  const loadPreviews = async (arquivos: AtualizacaoArquivo[], submittedAt: string) => {
    const updates: Record<string, string> = {};
    for (const arq of arquivos) {
      if (previewUrls[arq.id] || !arq.mime_type?.startsWith("image/")) continue;
      // Tenta signed URL do bucket atualizacoes (requer SQL policy de leitura para coach)
      const { data: signedData } = await supabase.storage
        .from("atualizacoes")
        .createSignedUrl(arq.storage_path, 3600);
      if (signedData?.signedUrl) {
        updates[arq.id] = signedData.signedUrl;
      } else {
        // Fallback: URL pública do evolution-photos (só existe para uploads após AJUSTE 3)
        const evoUrl = getEvoPhotoUrl(arq, submittedAt);
        if (evoUrl) updates[arq.id] = evoUrl;
      }
    }
    if (Object.keys(updates).length) setPreviewUrls(p => ({ ...p, ...updates }));
  };

  const toggleExpand = (id: string, resp: AtualizacaoResp) => {
    setExpanded(e => { const next = e === id ? null : id; if (next) loadPreviews(resp.arquivos, resp.submitted_at); return next; });
  };

  const downloadFoto = async (arq: AtualizacaoArquivo, submittedAt: string) => {
    setDownloading(arq.id);
    try {
      // Usa signed URL do atualizacoes (requer SQL policy) ou evo-photos como fallback
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("atualizacoes")
        .createSignedUrl(arq.storage_path, 3600);
      let downloadUrl: string;
      if (signedData?.signedUrl) {
        downloadUrl = signedData.signedUrl;
      } else {
        // Fallback: URL pública do evolution-photos (uploads recentes)
        const evoUrl = getEvoPhotoUrl(arq, submittedAt);
        if (!evoUrl) throw signedErr ?? new Error("Não foi possível obter URL da foto");
        downloadUrl = evoUrl;
      }
      const res  = await fetch(downloadUrl);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = arq.nome_original ?? "foto.jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) { toast({ title: "Erro ao baixar", description: e.message, variant: "destructive" }); }
    finally { setDownloading(null); }
  };

  const downloadAll = async (resp: AtualizacaoResp) => {
    for (const arq of resp.arquivos) {
      await downloadFoto(arq, resp.submitted_at);
      await new Promise(r => setTimeout(r, 300));
    }
  };

  const deleteResposta = async (respId: string) => {
    setDeleting(respId); setConfirmDelete(null);
    try {
      const resp = respostas.find(r => r.id === respId);
      if (resp?.arquivos.length) {
        await supabase.storage.from("atualizacoes").remove(resp.arquivos.map(a => a.storage_path));
        await supabase.from("atualizacao_resposta_arquivos").delete().eq("resposta_id", respId);
      }
      await supabase.from("atualizacao_resposta_valores").delete().eq("resposta_id", respId);
      const { error } = await supabase.from("atualizacao_respostas").delete().eq("id", respId);
      if (error) throw error;
      setRespostas(prev => prev.filter(r => r.id !== respId));
      if (expanded === respId) setExpanded(null);
      toast({ title: "Atualização excluída com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    } finally { setDeleting(null); }
  };

  const generateReport = async (respId: string) => {
    setGeneratingReport(respId);
    try {
      const res = await supabase.functions.invoke("analisar-atualizacao", {
        body: { resposta_id: respId },
      });
      if (res.error) throw new Error(res.error.message);
      const { data: updated } = await supabase
        .from("atualizacao_respostas")
        .select("relatorio_ia, relatorio_gerado_em, mensagem_feedback")
        .eq("id", respId)
        .single();
      if (updated) {
        setRespostas(prev => prev.map(r => r.id === respId ? { ...r, ...updated } : r));
      }
      toast({ title: "Análise gerada com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar análise", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingReport(null);
    }
  };

  const openSendFeedback = (resp: AtualizacaoResp) => {
    setFeedbackDraft(d => ({ ...d, [resp.id]: d[resp.id] ?? resp.mensagem_feedback ?? "" }));
    setConfirmSend(resp.id);
  };

  const sendAsFeedback = async (resp: AtualizacaoResp) => {
    const mensagem = (feedbackDraft[resp.id] ?? "").trim();
    if (!mensagem) return;
    setSendingFeedback(resp.id); setConfirmSend(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");
      const dataFormatada = new Date(resp.submitted_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
      const { error } = await supabase.from("feedbacks_alunos").insert({
        aluno_id: alunoId,
        treinador_id: session.user.id,
        titulo: `Atualização de ${dataFormatada}`,
        mensagem,
      });
      if (error) throw error;
      toast({ title: "Feedback enviado!", description: "O aluno receberá a mensagem." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar feedback", description: err.message, variant: "destructive" });
    } finally {
      setSendingFeedback(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner className="w-5 h-5 animate-spin text-white/30" /></div>;

  if (respostas.length === 0) return (
    <div className="rounded-2xl py-14 flex flex-col items-center gap-3 text-center"
      style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
        <ClipboardList className="w-6 h-6" style={{ color: "var(--cp-400)", opacity: 0.4 }} />
      </div>
      <p className="text-white/50 font-medium text-sm">Nenhuma atualização recebida ainda</p>
      <p className="text-white/25 text-xs max-w-xs">Quando o aluno preencher o formulário de atualização, aparecerá aqui.</p>
    </div>
  );

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-3">
      {respostas.map(resp => {
        const isOpen  = expanded === resp.id;
        const nFotos  = resp.arquivos.length;
        return (
          <div key={resp.id} className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
            <div className="flex items-center">
              <button onClick={() => toggleExpand(resp.id, resp)}
                className="flex-1 flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-white/40" />
                    <span className="text-sm font-semibold text-white/80">{fmtDate(resp.submitted_at)}</span>
                    {nFotos > 0 && (
                      <span className="flex items-center gap-1 text-xs ml-2" style={{ color: "var(--cp-400)", opacity: 0.7 }}>
                        <ImageIcon className="w-3 h-3" /> {nFotos} foto{nFotos !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
              </button>
              {/* Trash / inline confirm */}
              <div className="flex items-center gap-1 pr-3">
                {confirmDelete === resp.id ? (
                  <>
                    <span className="text-xs text-white/50 mr-1">Excluir?</span>
                    <button onClick={() => deleteResposta(resp.id)} disabled={deleting === resp.id}
                      className="text-xs px-2 h-7 rounded-lg font-semibold"
                      style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                      {deleting === resp.id ? "..." : "Sim"}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="text-xs px-2 h-7 rounded-lg font-semibold"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                      Não
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(resp.id)} disabled={deleting === resp.id}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/6"
                    style={{ color: "rgba(255,255,255,0.2)" }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="border-t px-4 py-4 space-y-5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                {/* Fotos */}
                {nFotos > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Fotos</p>
                      <button onClick={() => downloadAll(resp)}
                        className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg"
                        style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                        <Download className="w-3 h-3" /> Baixar todas
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {resp.arquivos.map(arq => (
                        <div key={arq.id} className="relative rounded-xl overflow-hidden group" style={{ backgroundColor: "rgba(255,255,255,0.05)", aspectRatio: "1" }}>
                          {previewUrls[arq.id]
                            ? <img
                                src={previewUrls[arq.id]}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={() => setPreviewUrls(p => { const next = { ...p }; delete next[arq.id]; return next; })}
                              />
                            : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-4 h-4 text-white/20" /></div>
                          }
                          <button onClick={() => downloadFoto(arq, resp.submitted_at)} disabled={downloading === arq.id}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            {downloading === arq.id ? <Spinner className="w-4 h-4 text-white animate-spin" /> : <Download className="w-4 h-4 text-white" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Valores */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Respostas</p>
                  {resp.valores.map(v => (
                    <div key={v.id}>
                      <p className="text-xs text-white/40 mb-1 leading-snug">{v.campo?.label ?? "—"}</p>
                      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                        {v.valor_numero != null ? String(v.valor_numero) : v.valor_opcoes?.length ? v.valor_opcoes.join(", ") : v.valor_texto ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Análise IA */}
                <div
                  className="rounded-2xl p-4"
                  style={{
                    backgroundColor: "#141417",
                    border: "1px solid rgba(255,255,255,0.09)",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 font-semibold"
                       style={{ color: resp.relatorio_ia ? "var(--cp-400)" : "rgba(255,255,255,0.35)" }}>
                      <Sparkles className="w-3 h-3" />
                      Análise IA
                    </p>
                    <button
                      onClick={() => generateReport(resp.id)}
                      disabled={generatingReport === resp.id}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                      {generatingReport === resp.id ? (
                        <><Spinner className="w-3 h-3 animate-spin" />Gerando...</>
                      ) : resp.relatorio_ia ? (
                        <><RefreshCw className="w-3 h-3" />Regenerar</>
                      ) : (
                        <><Sparkles className="w-3 h-3" />Gerar análise</>
                      )}
                    </button>
                  </div>

                  {generatingReport === resp.id ? (
                    <div className="flex items-center gap-2 py-3 text-white/30">
                      <Spinner className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Analisando atualização com IA...</span>
                    </div>
                  ) : resp.relatorio_ia ? (
                    <>
                      <p className="text-sm text-white/75 leading-relaxed whitespace-pre-line">{resp.relatorio_ia}</p>
                      {resp.relatorio_gerado_em && (
                        <p className="text-[10px] text-white/20 mt-3">
                          Gerado em {format(parseISO(resp.relatorio_gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-white/25 py-1">
                      Clique em "Gerar análise" para obter um relatório com base nas respostas dessa atualização.
                    </p>
                  )}
                </div>

                {/* Mensagem sugerida pro aluno — card separado de propósito: é o único
                    conteúdo que "Enviar como feedback" manda, nunca o relatório acima. */}
                {resp.mensagem_feedback && (
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      backgroundColor: "#141417",
                      border: "1px solid rgba(255,255,255,0.09)",
                      boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)",
                    }}
                  >
                    <p className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 font-semibold mb-3"
                       style={{ color: "var(--cp-400)" }}>
                      <MessageSquare className="w-3 h-3" />
                      Mensagem sugerida para o aluno
                    </p>

                    {confirmSend === resp.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={4}
                          value={feedbackDraft[resp.id] ?? ""}
                          onChange={(e) => setFeedbackDraft(d => ({ ...d, [resp.id]: e.target.value }))}
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors resize-none"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => sendAsFeedback(resp)} disabled={sendingFeedback === resp.id || !(feedbackDraft[resp.id] ?? "").trim()}
                            className="text-xs px-3 h-7 rounded-lg font-semibold disabled:opacity-40"
                            style={{ backgroundColor: "rgba(var(--cp-rgb),0.18)", color: "var(--cp-400)" }}>
                            {sendingFeedback === resp.id ? "Enviando..." : "Enviar feedback"}
                          </button>
                          <button onClick={() => setConfirmSend(null)}
                            className="text-xs px-3 h-7 rounded-lg font-semibold"
                            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-white/75 leading-relaxed whitespace-pre-line">{resp.mensagem_feedback}</p>
                        <button onClick={() => openSendFeedback(resp)}
                          className="mt-3 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          style={{ backgroundColor: "var(--btn-ghost-bg)", color: "var(--btn-ghost-color)" }}>
                          <MessageSquare className="w-3 h-3" /> Enviar como feedback
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Check-ins viewer (sistema antigo) ────────────────────────────────
const CheckInsViewer = ({ studentUserId }: { studentUserId: string }) => {
  const { toast } = useToast();
  const [checkins,          setCheckins]          = useState<CheckInRecord[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [expanded,          setExpanded]          = useState<string | null>(null);
  const [generatingReport,  setGeneratingReport]  = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("check_ins")
          .select("*")
          .eq("student_id", studentUserId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setCheckins(data as CheckInRecord[]);
      } catch (err: any) {
        toast({ title: "Erro ao carregar check-ins", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentUserId]);

  const generateReport = async (ciId: string) => {
    setGeneratingReport(ciId);
    try {
      const res = await supabase.functions.invoke("analisar-checkin", {
        body: { checkin_id: ciId },
      });
      if (res.error) throw new Error(res.error.message);

      // Re-fetch the updated record to get relatorio_ia
      const { data: updated } = await supabase
        .from("check_ins")
        .select("relatorio_ia, relatorio_gerado_em, relatorio_visualizado")
        .eq("id", ciId)
        .single();

      if (updated) {
        setCheckins((prev) =>
          prev.map((c) => (c.id === ciId ? { ...c, ...updated } : c))
        );
      }
      toast({ title: "Análise gerada com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar análise", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingReport(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-white/30">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        <span className="text-sm">Carregando check-ins...</span>
      </div>
    );
  }

  if (checkins.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/2 py-14 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
          <ClipboardList className="w-6 h-6 text-green-500/50" />
        </div>
        <p className="text-white/50 font-medium text-sm">Nenhum check-in enviado ainda</p>
        <p className="text-white/25 text-xs max-w-xs">Quando o aluno fizer um check-in, ele aparecerá aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checkins.map((ci) => {
        const isOpen = expanded === ci.id;
        const date   = new Date(ci.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
        const hasPhotos = ci.fotos && ci.fotos.length > 0;

        return (
          <div key={ci.id} className="rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            {/* Header row */}
            <button
              onClick={() => setExpanded(isOpen ? null : ci.id)}
              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors"
            >
              {/* Date */}
              <div className="text-left shrink-0">
                <p className="text-xs font-semibold text-white/70">{date}</p>
              </div>

              {/* Quick stats */}
              <div className="flex-1 flex items-center gap-4 flex-wrap">
                {ci.weight && (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cp-400)" }}>
                    <Weight className="w-3 h-3" />
                    {ci.weight} kg
                  </span>
                )}
                {ci.treino_avaliacao && (
                  <span className="text-xs text-white/45 flex items-center gap-1">
                    <Dumbbell className="w-3 h-3" />
                    {ci.treino_avaliacao}/5
                  </span>
                )}
                {ci.dieta_avaliacao && (
                  <span className="text-xs text-white/45 flex items-center gap-1">
                    <Utensils className="w-3 h-3" />
                    {ci.dieta_avaliacao}/5
                  </span>
                )}
                {ci.aderencia && (
                  <span className="text-xs text-white/45 flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {ci.aderencia}/5
                  </span>
                )}
                {hasPhotos && (
                  <span className="text-xs text-white/30 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    {ci.fotos!.length} foto{ci.fotos!.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {isOpen
                ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
              }
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/6 pt-4">
                {/* Fotos */}
                {hasPhotos && (
                  <div>
                    <p className="text-[11px] text-white/35 uppercase tracking-wider mb-2">Fotos</p>
                    <div className="flex flex-wrap gap-2">
                      {ci.fotos!.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={`foto ${i + 1}`} className="w-20 h-20 rounded-xl object-cover border border-white/8 hover:opacity-90 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Treino */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Dumbbell className="w-3 h-3" />Treino
                    </p>
                    <StarDisplay value={ci.treino_avaliacao} color="hsl(217 91% 65%)" />
                    {ci.treino_obs && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{ci.treino_obs}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Utensils className="w-3 h-3" />Alimentação
                    </p>
                    <StarDisplay value={ci.dieta_avaliacao} color="var(--cp-400)" />
                    {ci.dieta_obs && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{ci.dieta_obs}</p>}
                  </div>
                </div>

                {/* Aderência */}
                <div>
                  <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Star className="w-3 h-3" />Aderência geral
                  </p>
                  <StarDisplay value={ci.aderencia} color="hsl(280 65% 65%)" />
                  {ci.obs_geral && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{ci.obs_geral}</p>}
                </div>

                {/* IA Report */}
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    backgroundColor: "rgba(var(--cp-rgb),0.03)",
                    borderColor: ci.relatorio_ia ? "rgba(var(--cp-rgb),0.18)" : "rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 font-semibold"
                       style={{ color: ci.relatorio_ia ? "var(--cp-400)" : "rgba(255,255,255,0.35)" }}>
                      <Sparkles className="w-3 h-3" />
                      Análise IA
                    </p>
                    <button
                      onClick={() => generateReport(ci.id)}
                      disabled={generatingReport === ci.id}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--btn-soft-bg-hover)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--btn-soft-bg)"; }}
                    >
                      {generatingReport === ci.id ? (
                        <><Spinner className="w-3 h-3 animate-spin" />Gerando...</>
                      ) : ci.relatorio_ia ? (
                        <><RefreshCw className="w-3 h-3" />Regenerar</>
                      ) : (
                        <><Sparkles className="w-3 h-3" />Gerar análise</>
                      )}
                    </button>
                  </div>

                  {generatingReport === ci.id ? (
                    <div className="flex items-center gap-2 py-3 text-white/30">
                      <Spinner className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Analisando check-in com IA...</span>
                    </div>
                  ) : ci.relatorio_ia ? (
                    <>
                      <p className="text-sm text-white/75 leading-relaxed whitespace-pre-line">{ci.relatorio_ia}</p>
                      {ci.relatorio_gerado_em && (
                        <p className="text-[10px] text-white/20 mt-3">
                          Gerado em {format(parseISO(ci.relatorio_gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-white/25 py-1">
                      Clique em "Gerar análise" para obter um relatório personalizado com base nos dados deste check-in.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Alongamentos Manager ───────────────────────────────────────────
const AlongamentosManager = ({ alunoId, orgId, treinadorId }: { alunoId: string; orgId: string | null; treinadorId: string | null }) => {
  const { toast } = useToast();
  const [items,    setItems]    = useState<any[]>([]);
  const [library,  setLibrary]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [open,     setOpen]     = useState(false);

  // Popover/combobox state (same pattern as TrainingPlanManager)
  const [comboOpen,    setComboOpen]    = useState(false);
  const [selectedBase, setSelectedBase] = useState<any | null>(null);

  // Form fields
  const [tipoMetrica, setTipoMetrica] = useState<'tempo' | 'reps'>('tempo');
  const [form, setForm] = useState({ series: '3', valor: '30', instrucoes: '' });

  // Aceita nome OU categoria contendo "alongamento" — cobre tanto os exercícios
  // antigos (que só têm a palavra no nome) quanto os novos (categorizados certo,
  // mas sem "alongamento" no nome), sem precisar corrigir cadastros antigos.
  const alongamentoExs = library.filter(ex =>
    ex.nome.toLowerCase().includes('alongamento') ||
    (ex.categoria ?? '').toLowerCase().includes('alongamento')
  );

  useEffect(() => { load(); }, [alunoId]);
  useEffect(() => { if (orgId) loadLibrary(); }, [orgId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('alongamentos')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('created_at', { ascending: true });
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    else setItems(data ?? []);
    setLoading(false);
  };

  const loadLibrary = async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .rpc('get_exercicios_by_org', { p_org_id: orgId });
      if (error) console.error('loadLibrary rpc:', error.message);
      else setLibrary(data ?? []);
    } catch (e: any) { console.error('loadLibrary catch:', e.message); }
  };

  const resetForm = () => {
    setSelectedBase(null);
    setTipoMetrica('tempo');
    setForm({ series: '3', valor: '30', instrucoes: '' });
    setShowForm(false);
  };

  const save = async () => {
    if (!selectedBase) {
      toast({ title: 'Selecione um alongamento da lista', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const duracao_segundos = tipoMetrica === 'tempo'
        ? (parseInt(form.valor) || 30)
        : -(parseInt(form.valor) || 10);

      const { error } = await supabase.from('alongamentos').insert({
        aluno_id: alunoId,
        org_id: orgId,
        nome: selectedBase.nome,
        duracao_segundos,
        series: parseInt(form.series) || 3,
        instrucoes: form.instrucoes.trim() || null,
        video_url: selectedBase.video_url || null,
      });
      if (error) throw error;
      toast({ title: 'Alongamento adicionado!' });
      resetForm();
      await load();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('alongamentos').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' }); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const formatMetrica = (item: any) => {
    if (!item.duracao_segundos) return '—';
    if (item.duracao_segundos < 0) {
      const r = Math.abs(item.duracao_segundos);
      return `${r} rep${r !== 1 ? 's' : ''}`;
    }
    return `${item.duracao_segundos}s`;
  };

  const inp = "w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors";
  const lbl = "text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#141417', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)' }}>

      {/* Header — always visible, toggles the collapsed content */}
      <div className="flex items-center">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-white/3 transition-colors text-left min-w-0"
        >
          <p className="flex-1 min-w-0 text-sm font-semibold text-white">Rotina de Alongamentos</p>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: 'rgba(var(--cp-rgb),0.1)', color: 'var(--cp-400)' }}
          >
            {items.length}
          </span>
          {open
            ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
        </button>
        <div className="pr-3 shrink-0">
          <button
            onClick={() => {
              const next = !showForm;
              setShowForm(next);
              if (next) setOpen(true); else resetForm();
            }}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
            style={{ backgroundColor: 'var(--btn-soft-bg)', color: 'var(--btn-soft-color)' }}>
            <Plus className="w-3.5 h-3.5" /> {showForm ? 'Cancelar' : 'Adicionar'}
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 280ms ease' }}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 space-y-4">

      {/* Inline Add Form */}
      {showForm && (
        <div className="rounded-2xl p-4 space-y-4"
          style={{ backgroundColor: '#1b1c21', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>

          {/* ── Exercise picker (same as TrainingPlanManager) ── */}
          <div className="space-y-1.5">
            <label className={lbl}>Selecionar Alongamento</label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full h-10 rounded-xl border border-white/10 px-3 text-sm flex items-center justify-between transition-colors"
                  style={{
                    backgroundColor: selectedBase ? 'rgba(var(--cp-rgb),0.08)' : 'rgba(255,255,255,0.05)',
                    color: selectedBase ? 'var(--cp-300)' : 'rgba(255,255,255,0.3)',
                    borderColor: comboOpen ? 'rgba(var(--cp-rgb),0.4)' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <span className="truncate">
                    {selectedBase ? selectedBase.nome : 'Selecione um alongamento...'}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 ml-2 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 border border-white/10"
                style={{ width: 'var(--radix-popover-trigger-width)', backgroundColor: '#111113' }}
                align="start"
              >
                <Command>
                  <CommandInput
                    placeholder="Buscar alongamento..."
                    className="text-white border-b border-white/10"
                  />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-sm text-white/40">
                      Nenhum alongamento encontrado.
                    </CommandEmpty>
                    <CommandGroup>
                      {alongamentoExs.map(ex => (
                        <CommandItem
                          key={ex.id}
                          value={ex.nome}
                          onSelect={() => {
                            setSelectedBase(ex);
                            setComboOpen(false);
                          }}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm">{ex.nome}</span>
                            {ex.musculos_principais && (
                              <span className="text-[11px] text-white/35 ml-2">{ex.musculos_principais}</span>
                            )}
                          </div>
                          {ex.video_url && (
                            <Play className="w-3 h-3 ml-2 shrink-0" style={{ color: 'var(--cp-400)' }} />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Video badge when exercise with video is selected */}
            {selectedBase?.video_url && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl mt-1"
                style={{ backgroundColor: 'rgba(var(--cp-rgb),0.07)', border: '1px solid rgba(var(--cp-rgb),0.15)' }}>
                <Play className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cp-400)' }} />
                <span className="text-[11px] flex-1 text-white/50">Vídeo vinculado</span>
                <a href={selectedBase.video_url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-semibold hover:opacity-80" style={{ color: 'var(--cp-400)' }}>
                  Ver →
                </a>
              </div>
            )}
          </div>

          {/* Series + Metric */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Séries</label>
              <input type="number" min="1" max="20"
                value={form.series}
                onChange={e => setForm(f => ({ ...f, series: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                {(['tempo', 'reps'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => {
                      setTipoMetrica(t);
                      setForm(f => ({ ...f, valor: t === 'tempo' ? '30' : '10' }));
                    }}
                    className="flex-1 text-[10px] font-semibold uppercase tracking-wider py-1.5 rounded-lg transition-colors"
                    style={{
                      backgroundColor: tipoMetrica === t ? 'rgba(var(--cp-rgb),0.2)' : 'rgba(255,255,255,0.05)',
                      color: tipoMetrica === t ? 'var(--cp-400)' : 'rgba(255,255,255,0.3)',
                    }}>
                    {t === 'tempo' ? 'Tempo (s)' : 'Reps'}
                  </button>
                ))}
              </div>
              <input type="number" min="1"
                value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                placeholder={tipoMetrica === 'tempo' ? 'Segundos' : 'Repetições'}
                className={inp} />
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className={lbl}>Observações <span className="normal-case text-white/20">(opcional)</span></label>
            <textarea rows={2}
              value={form.instrucoes}
              onChange={e => setForm(f => ({ ...f, instrucoes: e.target.value }))}
              placeholder="Instruções adicionais para o aluno..."
              className={inp + ' h-auto py-2.5 resize-none'} />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={resetForm}
              className="h-10 px-4 rounded-xl text-sm font-medium text-white/50"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !selectedBase}
              className="h-10 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-2 flex-1 justify-center"
              style={{ background: saving || !selectedBase ? 'rgba(255,255,255,0.1)' : 'var(--cp-gradient)', color: saving || !selectedBase ? 'rgba(255,255,255,0.3)' : '#fff' }}>
              {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="w-5 h-5 animate-spin text-white/30" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl py-12 text-center"
          style={{ backgroundColor: '#1b1c21', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <p className="text-white/30 text-sm">Nenhum alongamento cadastrado</p>
          <p className="text-white/15 text-xs mt-1">Clique em "Adicionar" para criar o primeiro</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id}
              className="rounded-2xl px-4 py-3 flex items-start gap-3"
              style={{ backgroundColor: '#1b1c21', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--btn-soft-bg)', color: 'var(--btn-soft-color)' }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/85">{item.nome}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {item.series} {item.series === 1 ? 'série' : 'séries'} · {formatMetrica(item)} por série
                  </p>
                  {item.instrucoes && (
                    <p className="text-[11px] text-white/30 mt-1 leading-relaxed">{item.instrucoes}</p>
                  )}
                </div>
                {item.video_url && (
                  <a href={item.video_url} target="_blank" rel="noopener noreferrer"
                    className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 hover:opacity-80"
                    style={{ backgroundColor: 'rgba(var(--cp-rgb),0.12)' }}>
                    <Play className="w-3.5 h-3.5 ml-0.5" style={{ color: 'var(--cp-500)' }} />
                  </a>
                )}
                <button onClick={() => remove(item.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 mt-0.5">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
            </div>
          ))}
        </div>
      )}

          </div>
        </div>
      </div>
    </div>
  );
};

// ── Pagamentos (histórico, só leitura — aba Plano) ───────────────────
// Sem ações de marcar-pago/cancelar aqui de propósito: essa lógica já existe
// em Financeiro.tsx e duplicá-la aqui arriscaria os dois lugares divergirem.
const PAG_STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  PENDING:   { label: 'Pendente',    bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  RECEIVED:  { label: 'Pago',        bg: 'rgba(34,197,94,0.12)',   text: '#4ade80' },
  CONFIRMED: { label: 'Confirmado',  bg: 'rgba(34,197,94,0.12)',   text: '#4ade80' },
  OVERDUE:   { label: 'Vencido',     bg: 'rgba(239,68,68,0.12)',   text: '#f87171' },
  CANCELLED: { label: 'Cancelado',   bg: 'rgba(107,114,128,0.12)', text: '#9ca3af' },
  REFUNDED:  { label: 'Reembolsado', bg: 'rgba(107,114,128,0.12)', text: '#9ca3af' },
};
const PAG_FORMA_LABEL: Record<string, string> = { PIX: 'PIX', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto' };

const PagamentosHistorico = ({ alunoId, slug }: { alunoId: string; slug?: string }) => {
  const navigate = useNavigate();
  const [items,   setItems]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [alunoId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cobrancas')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error) setItems(data ?? []);
    setLoading(false);
  };

  const fmtDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
  const fmtBRL  = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#141417', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)' }}>
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm font-semibold text-white">Histórico de Pagamentos</p>
        <button
          onClick={() => navigate(`/${slug}/treinador/financeiro`)}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--btn-ghost-bg)', color: 'var(--btn-ghost-color)' }}>
          Ver no Financeiro <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="w-5 h-5 animate-spin text-white/30" /></div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-white/30 text-sm">Nenhuma cobrança registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((c) => {
              const cfg  = PAG_STATUS_CFG[c.status] ?? PAG_STATUS_CFG.PENDING;
              const pago = ['RECEIVED', 'CONFIRMED'].includes(c.status) && c.data_pagamento;
              return (
                <div key={c.id} className="rounded-xl px-3.5 py-3"
                  style={{ backgroundColor: '#1b1c21', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white/85 truncate">{c.descricao}</p>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {pago ? `Pago em ${fmtDate(c.data_pagamento)}` : `Vence ${fmtDate(c.data_vencimento)}`}
                        {' · '}{PAG_FORMA_LABEL[c.forma_pagamento] ?? c.forma_pagamento}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold text-white">{fmtBRL(c.valor)}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Cardio Manager ─────────────────────────────────────────────────
const CARDIO_TIPOS = ['Corrida', 'Caminhada', 'Bike', 'Elíptico', 'Remo', 'Natação', 'HIIT', 'Outro'];

const ESFORCO_LABELS: Record<string, string> = {
  muito_facil: 'Muito fácil', facil: 'Fácil', moderado: 'Moderado',
  dificil: 'Difícil', muito_dificil: 'Muito difícil',
};

const CardioManager = ({ alunoId, orgId }: { alunoId: string; orgId: string | null }) => {
  const { toast } = useToast();
  const [items,    setItems]    = useState<any[]>([]);
  const [sessoes,  setSessoes]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ tipo: 'Corrida', bpm_alvo: '', frequencia_semana: '3', duracao_minutos: '30', observacoes: '' });

  const resetForm = () => setForm({ tipo: 'Corrida', bpm_alvo: '', frequencia_semana: '3', duracao_minutos: '30', observacoes: '' });

  const startEdit = (item: any) => {
    setForm({
      tipo: item.tipo,
      bpm_alvo: item.bpm_alvo ?? '',
      frequencia_semana: item.frequencia_semana?.toString() ?? '3',
      duracao_minutos: item.duracao_minutos?.toString() ?? '30',
      observacoes: item.observacoes ?? '',
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    resetForm();
  };

  useEffect(() => { load(); }, [alunoId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cardio_planos').select('*').eq('aluno_id', alunoId).order('created_at', { ascending: false });
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    else setItems(data ?? []);

    // Sessões realizadas pelo aluno nesses planos — o treinador não via isso antes
    const planoIds = (data ?? []).map((p: any) => p.id);
    if (planoIds.length > 0) {
      const { data: sessData } = await supabase
        .from('cardio_sessoes')
        .select('id, tipo, data_sessao, duracao_minutos, bpm_medio, kcal_estimado, esforco, feedback')
        .in('cardio_plano_id', planoIds)
        .order('data_sessao', { ascending: false })
        .limit(10);
      setSessoes(sessData ?? []);
    } else {
      setSessoes([]);
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo,
        bpm_alvo: form.bpm_alvo.trim() || null,
        frequencia_semana: parseInt(form.frequencia_semana) || null,
        duracao_minutos: parseInt(form.duracao_minutos) || null,
        observacoes: form.observacoes.trim() || null,
      };
      const { error } = editingId
        ? await supabase.from('cardio_planos').update(payload).eq('id', editingId)
        : await supabase.from('cardio_planos').insert({ aluno_id: alunoId, org_id: orgId, ...payload });
      if (error) throw error;
      toast({ title: editingId ? 'Cardio atualizado!' : 'Cardio adicionado!' });
      closeForm();
      await load();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('cardio_planos').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' }); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    if (editingId === id) closeForm();
  };

  const inp = "w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/50 transition-colors";
  const lbl = "text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Plano de cardio</p>
        <button onClick={() => showForm ? closeForm() : setShowForm(true)}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
          style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
          <Plus className="w-3.5 h-3.5" />{showForm ? 'Cancelar' : 'Adicionar'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">{editingId ? 'Editar Cardio' : 'Novo Cardio'}</p>
          <div>
            <label className={lbl}>Tipo de cardio</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className={inp} style={{ appearance: 'none' }}>
              {CARDIO_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Freq./semana</label>
              <input type="number" min="1" max="7" value={form.frequencia_semana} onChange={e => setForm(f => ({ ...f, frequencia_semana: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Duração (min)</label>
              <input type="number" min="5" value={form.duracao_minutos} onChange={e => setForm(f => ({ ...f, duracao_minutos: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>BPM alvo</label>
              <input value={form.bpm_alvo} onChange={e => setForm(f => ({ ...f, bpm_alvo: e.target.value }))} placeholder="120-140" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>Observações</label>
            <textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Instrução para o aluno..." className={inp + " h-auto py-2 resize-none"} />
          </div>
          <button onClick={save} disabled={saving}
            className="h-10 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2"
            style={{ background: "var(--cp-gradient)" }}>
            {saving ? <Spinner className="w-4 h-4 animate-spin" /> : editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingId ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Spinner className="w-5 h-5 animate-spin text-white/30" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl py-12 text-center" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <p className="text-white/30 text-sm">Nenhum plano de cardio cadastrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="rounded-2xl px-4 py-4 flex items-start gap-3" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: "rgba(var(--cp-rgb),0.10)" }}>
                <Dumbbell className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/80">{item.tipo}</p>
                <div className="flex flex-wrap gap-3 mt-1.5">
                  {item.frequencia_semana && (
                    <span className="text-[11px] text-white/40">{item.frequencia_semana}×/semana</span>
                  )}
                  {item.duracao_minutos && (
                    <span className="text-[11px] text-white/40">{item.duracao_minutos} min</span>
                  )}
                  {item.bpm_alvo && (
                    <span className="text-[11px] font-semibold" style={{ color: "var(--cp-400)" }}>
                      {item.bpm_alvo} BPM
                    </span>
                  )}
                </div>
                {item.observacoes && <p className="text-[11px] text-white/25 mt-1.5 leading-relaxed">{item.observacoes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => startEdit(item)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => remove(item.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sessões realizadas pelo aluno — só leitura */}
      {!loading && sessoes.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Sessões realizadas pelo aluno</p>
          <div className="rounded-2xl border border-white/8 overflow-hidden">
            {sessoes.map((s, idx) => (
              <div key={s.id} className="px-4 py-3" style={{ borderBottom: idx < sessoes.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white/80">{s.tipo}</p>
                  {s.kcal_estimado != null && (
                    <span className="text-sm font-bold" style={{ color: 'var(--cp-400)' }}>{s.kcal_estimado} kcal</span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5">
                  {new Date(s.data_sessao).toLocaleDateString('pt-BR')} · {s.duracao_minutos} min
                  {s.bpm_medio ? ` · ${s.bpm_medio} bpm` : ''}
                </p>
                {s.esforco && (
                  <span
                    className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md mt-1.5"
                    style={{ backgroundColor: 'rgba(var(--cp-rgb),0.12)', color: 'var(--cp-400)' }}
                  >
                    {ESFORCO_LABELS[s.esforco] ?? s.esforco}
                  </span>
                )}
                {s.feedback && (
                  <p className="text-xs text-white/50 mt-1.5 leading-relaxed italic">"{s.feedback}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Suplementos Manager ────────────────────────────────────────────
const SuplementosManager = ({ alunoId, orgId }: { alunoId: string; orgId: string | null }) => {
  const { toast } = useToast();
  const [items,    setItems]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [addOpen,  setAddOpen]  = useState(false);
  const [form,     setForm]     = useState({ nome: '', dosagem: '', instrucao: '' });
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', dosagem: '', instrucao: '' });

  useEffect(() => { load(); }, [alunoId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('suplementos').select('*').eq('aluno_id', alunoId).order('ordem', { ascending: true });
    if (error) toast({ title: 'Erro ao carregar suplementos', description: error.message, variant: 'destructive' });
    else setItems(data ?? []);
    setLoading(false);
  };

  const save = async () => {
    if (!form.nome.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('suplementos').insert({
        aluno_id: alunoId, org_id: orgId,
        nome: form.nome.trim(),
        dosagem: form.dosagem.trim() || null,
        instrucao: form.instrucao.trim() || null,
        ordem: items.length,
      });
      if (error) throw error;
      toast({ title: 'Suplemento adicionado!' });
      setForm({ nome: '', dosagem: '', instrucao: '' });
      setAddOpen(false);
      await load();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('suplementos').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' }); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const startEdit = (item: any) => {
    setEditId(item.id);
    setEditForm({ nome: item.nome ?? '', dosagem: item.dosagem ?? '', instrucao: item.instrucao ?? '' });
    setAddOpen(false);
  };

  const cancelEdit = () => setEditId(null);

  const update = async () => {
    if (!editForm.nome.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('suplementos').update({
        nome:      editForm.nome.trim(),
        dosagem:   editForm.dosagem.trim()   || null,
        instrucao: editForm.instrucao.trim() || null,
      }).eq('id', editId!);
      if (error) throw error;
      toast({ title: 'Suplemento atualizado!' });
      setEditId(null);
      await load();
    } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const inp = "w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/40 transition-colors";
  const lbl = "text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block";

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Suplementação e Fitoterápicos</p>
        <button onClick={() => setAddOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
          style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>

      {/* Add form */}
      {addOpen && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <div>
            <label className={lbl}>Nome do suplemento / fitoterápico *</label>
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Creatina, Whey Protein, Ômega 3..."
              className={inp} />
          </div>
          <div>
            <label className={lbl}>Dosagem</label>
            <input value={form.dosagem} onChange={e => setForm(f => ({ ...f, dosagem: e.target.value }))}
              placeholder="Ex: 5g, 1 cápsula, 30ml..."
              className={inp} />
          </div>
          <div>
            <label className={lbl}>Instruções de uso</label>
            <textarea rows={2} value={form.instrucao}
              onChange={e => setForm(f => ({ ...f, instrucao: e.target.value }))}
              placeholder="Ex: Tomar com 300ml de água antes do treino..."
              className={inp + ' h-auto py-2 resize-none'} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setAddOpen(false); setForm({ nome: '', dosagem: '', instrucao: '' }); }}
              className="h-10 px-4 rounded-xl text-sm font-medium transition-colors"
              style={{ backgroundColor: "var(--surface-2)", color: "var(--muted-foreground, rgba(255,255,255,0.5))", border: "1px solid var(--border-subtle)" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving}
              className="h-10 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2 flex-1 justify-center"
              style={{ background: 'linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))' }}>
              {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 py-4" style={{ color: "var(--text-dim)" }}>
          <Spinner className="w-4 h-4 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl py-8 text-center" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nenhum suplemento cadastrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            editId === item.id ? (
              /* ── Edição inline ── */
              <div key={item.id} className="rounded-2xl p-4 space-y-3"
                style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
                <div>
                  <label className={lbl}>Nome do suplemento / fitoterápico *</label>
                  <input value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Creatina, Whey Protein, Ômega 3..."
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>Dosagem</label>
                  <input value={editForm.dosagem} onChange={e => setEditForm(f => ({ ...f, dosagem: e.target.value }))}
                    placeholder="Ex: 5g, 1 cápsula, 30ml..."
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>Instruções de uso</label>
                  <textarea rows={2} value={editForm.instrucao}
                    onChange={e => setEditForm(f => ({ ...f, instrucao: e.target.value }))}
                    placeholder="Ex: Tomar com 300ml de água antes do treino..."
                    className={inp + ' h-auto py-2 resize-none'} />
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelEdit}
                    className="h-10 px-4 rounded-xl text-sm font-medium transition-colors"
                    style={{ backgroundColor: "var(--surface-2)", color: "var(--muted-foreground, rgba(255,255,255,0.5))", border: "1px solid var(--border-subtle)" }}>
                    Cancelar
                  </button>
                  <button onClick={update} disabled={saving}
                    className="h-10 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2 flex-1 justify-center"
                    style={{ background: 'linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))' }}>
                    {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              /* ── Exibição normal ── */
              <div key={item.id} className="rounded-2xl px-4 py-3 flex items-start gap-3"
                style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground/80">{item.nome}</span>
                    {item.dosagem && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: 'rgb(217,119,6)' }}>
                        {item.dosagem}
                      </span>
                    )}
                  </div>
                  {item.instrucao && <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-mid)" }}>{item.instrucao}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(item)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    style={{ color: "var(--text-dim)" }}
                    title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(item.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    style={{ color: "var(--text-dim)" }}
                    title="Remover">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

// ── Postural Viewer ────────────────────────────────────────────────
const POSTURAL_TESTES = [
  { key: "frontal",            label: "Frontal",                            photoLabels: ["Frontal"] },
  { key: "costas",             label: "Costas",                             photoLabels: ["Costas"] },
  { key: "perfil",             label: "Perfil Esq. / Dir.",                 photoLabels: ["Perfil Esquerdo", "Perfil Direito"] },
  { key: "perfil_ombros",      label: "Perfil Ombros em Máx. Flexão",       photoLabels: ["Perfil Esquerdo", "Perfil Direito"] },
  { key: "unipodal",           label: "Apoio Unipodal",                     photoLabels: ["Pé Esquerdo", "Pé Direito"] },
  { key: "agachamento_perfil", label: "Agachamento de Perfil",              photoLabels: ["Agachamento Perfil"] },
  { key: "agachamento_costas", label: "Agachamento de Costas",              photoLabels: ["Agachamento Costas"] },
  { key: "ajoelhado",          label: "Ajoelhado de Perfil",                photoLabels: ["Ajoelhado"] },
  { key: "flexao_quadril",     label: "Flexão de Quadril Unilateral",       photoLabels: ["Lado Direito", "Lado Esquerdo"] },
  { key: "sentar_alcancar",    label: "Sentar e Alcançar Adaptado",         photoLabels: ["Sentar e Alcançar"] },
  { key: "flexao_coluna",      label: "Flexão da Coluna",                   photoLabels: ["Flexão Coluna"] },
] as const;

const POSTURAL_BUCKET = "evolution-photos";

const PosturalViewer = ({ studentUserId, alunoId }: { studentUserId: string; alunoId: string }) => {
  const { toast } = useToast();
  const [avaliacoes,    setAvaliacoes]    = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [photoMap,      setPhotoMap]      = useState<Record<string, any[]>>({});
  const [loadingPhotos, setLoadingPhotos] = useState<string | null>(null);
  const [notes,         setNotes]         = useState<Record<string, string>>({});
  const [savingNotes,   setSavingNotes]   = useState<string | null>(null);
  const [downloading,   setDownloading]   = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [lightbox,      setLightbox]      = useState<{ url: string; label: string; evalDate: string } | null>(null);
  const [compareMode,   setCompareMode]   = useState(false);
  const [compareIds,    setCompareIds]    = useState<[string, string] | [string]>([]);
  const [pendente,      setPendente]      = useState(false);
  const [requesting,    setRequesting]    = useState(false);

  useEffect(() => { load(); }, [studentUserId]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: alunoRow }] = await Promise.all([
        supabase
          .from("avaliacoes_posturais")
          .select("*")
          .eq("student_user_id", studentUserId)
          .order("created_at", { ascending: false }),
        supabase
          .from("alunos")
          .select("avaliacao_postural_pendente")
          .eq("id", alunoId)
          .maybeSingle(),
      ]);
      if (error) throw error;
      setAvaliacoes(data ?? []);
      const nm: Record<string, string> = {};
      for (const a of (data ?? [])) nm[a.id] = a.observacoes ?? "";
      setNotes(nm);
      setPendente(!!alunoRow?.avaliacao_postural_pendente);
    } catch (e: any) {
      toast({ title: "Erro ao carregar avaliações posturais", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const requestAvaliacao = async () => {
    setRequesting(true);
    try {
      const { error } = await supabase
        .from("alunos")
        .update({ avaliacao_postural_pendente: true })
        .eq("id", alunoId);
      if (error) throw error;
      setPendente(true);
      toast({ title: "Avaliação solicitada!", description: "O aluno será notificado para realizar a avaliação." });
    } catch (e: any) {
      toast({ title: "Erro ao solicitar", description: e.message, variant: "destructive" });
    } finally { setRequesting(false); }
  };

  const dispensarAvaliacao = async () => {
    setRequesting(true);
    try {
      const { error } = await supabase
        .from("alunos")
        .update({ avaliacao_postural_pendente: false })
        .eq("id", alunoId);
      if (error) throw error;
      setPendente(false);
      toast({ title: "Avaliação dispensada." });
    } catch (e: any) {
      toast({ title: "Erro ao dispensar", description: e.message, variant: "destructive" });
    } finally { setRequesting(false); }
  };

  const loadPhotos = async (evalId: string) => {
    if (photoMap[evalId]) return;
    setLoadingPhotos(evalId);
    try {
      const { data, error } = await supabase
        .from("avaliacao_fotos")
        .select("*")
        .eq("avaliacao_id", evalId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const withUrls = await Promise.all((data ?? []).map(async (foto: any) => {
        const { data: signed } = await supabase.storage
          .from(POSTURAL_BUCKET)
          .createSignedUrl(foto.storage_path, 3600);
        return { ...foto, signedUrl: signed?.signedUrl ?? "" };
      }));
      setPhotoMap(prev => ({ ...prev, [evalId]: withUrls }));
    } catch (e: any) {
      toast({ title: "Erro ao carregar fotos", description: e.message, variant: "destructive" });
    } finally { setLoadingPhotos(null); }
  };

  const toggleExpand = (evalId: string) => {
    if (expanded === evalId) { setExpanded(null); return; }
    setExpanded(evalId);
    loadPhotos(evalId);
  };

  const saveNotes = async (evalId: string) => {
    setSavingNotes(evalId);
    try {
      const { error } = await supabase
        .from("avaliacoes_posturais")
        .update({ observacoes: notes[evalId] || null })
        .eq("id", evalId);
      if (error) throw error;
      toast({ title: "Observações salvas!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSavingNotes(null); }
  };

  const downloadOne = async (storagePath: string, filename: string) => {
    const { data, error } = await supabase.storage
      .from(POSTURAL_BUCKET)
      .createSignedUrl(storagePath, 60, { download: filename });
    if (error || !data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = async (evalId: string, evalDate: string) => {
    setDownloading(evalId);
    const fotos = photoMap[evalId] ?? [];
    for (let i = 0; i < fotos.length; i++) {
      const f = fotos[i];
      const teste = POSTURAL_TESTES.find(t => t.key === f.test_key);
      const pl = (teste?.photoLabels[f.photo_index] || `foto_${i}`).replace(/\s+/g, "_");
      await downloadOne(f.storage_path, `postural_${evalDate}_${pl}.jpg`);
      await new Promise(r => setTimeout(r, 600));
    }
    setDownloading(null);
  };

  const deleteAvaliacao = async (evalId: string) => {
    setDeleting(evalId);
    setConfirmDelete(null);
    try {
      // 1. Get all photo records to know which storage paths to delete
      const { data: fotos } = await supabase
        .from("avaliacao_fotos")
        .select("storage_path")
        .eq("avaliacao_id", evalId);

      // 2. Delete files from Storage
      if (fotos && fotos.length > 0) {
        const paths = fotos.map((f: any) => f.storage_path);
        await supabase.storage.from(POSTURAL_BUCKET).remove(paths);
      }

      // 3. Delete photo records (cascade should handle this, but explicit is safer)
      await supabase.from("avaliacao_fotos").delete().eq("avaliacao_id", evalId);

      // 4. Delete evaluation record
      const { error } = await supabase.from("avaliacoes_posturais").delete().eq("id", evalId);
      if (error) throw error;

      // 5. Update local state
      setAvaliacoes(prev => prev.filter(a => a.id !== evalId));
      setPhotoMap(prev => { const next = { ...prev }; delete next[evalId]; return next; });
      if (expanded === evalId) setExpanded(null);

      toast({ title: "Avaliação excluída com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao excluir avaliação", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const toggleCompare = (evalId: string) => {
    setCompareIds(prev => {
      const arr = Array.from(prev) as string[];
      if (arr.includes(evalId)) return arr.filter(id => id !== evalId) as any;
      if (arr.length >= 2) return [arr[1], evalId] as any;
      return [...arr, evalId] as any;
    });
  };

  const fmtDate = (iso: string) =>
    format(new Date(iso), "dd/MM/yyyy", { locale: ptBR });

  const fmtDateLong = (iso: string) =>
    format(new Date(iso), "dd 'de' MMMM yyyy", { locale: ptBR });

  // ── Render helpers ──────────────────────────────────────────
  const PhotoGrid = ({ evalId, evalDate }: { evalId: string; evalDate: string }) => {
    const fotos = photoMap[evalId] ?? [];
    if (loadingPhotos === evalId) {
      return (
        <div className="flex items-center justify-center py-10 gap-2 text-white/30">
          <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando fotos...</span>
        </div>
      );
    }
    if (fotos.length === 0) {
      return (
        <div className="py-8 text-center text-white/25 text-sm">
          <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhuma foto registrada nesta avaliação.
        </div>
      );
    }

    // Build lookup: testKey_photoIndex -> foto
    const lookup: Record<string, any> = {};
    for (const f of fotos) lookup[`${f.test_key}_${f.photo_index}`] = f;

    return (
      <div className="space-y-4">
        {/* Download all button */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">
            {fotos.length} foto{fotos.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => downloadAll(evalId, fmtDate(evalDate))}
            disabled={downloading === evalId}
            className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
            {downloading === evalId
              ? <Spinner className="w-3 h-3 animate-spin" />
              : <Download className="w-3 h-3" />}
            Baixar todas
          </button>
        </div>

        {/* Organized by test */}
        {POSTURAL_TESTES.map(teste => {
          const testoFotos = teste.photoLabels.map((pl, idx) => ({
            label: pl,
            foto: lookup[`${teste.key}_${idx}`] ?? null,
          }));
          const hasFotos = testoFotos.some(t => t.foto);
          if (!hasFotos) return null;

          return (
            <div key={teste.key}>
              <p className="text-[11px] text-white/40 font-medium mb-2">{teste.label}</p>
              <div className="flex gap-2 flex-wrap">
                {testoFotos.map(({ label, foto }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div
                      className="relative rounded-xl overflow-hidden group"
                      style={{
                        width: 88,
                        height: 118,
                        backgroundColor: "rgba(255,255,255,0.04)",
                        border: foto ? "none" : "1px dashed rgba(255,255,255,0.07)",
                      }}>
                      {foto ? (
                        <>
                          <img
                            src={foto.signedUrl}
                            alt={label}
                            className="w-full h-full object-cover"
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => setLightbox({ url: foto.signedUrl, label, evalDate })}
                              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors">
                              <ImageIcon className="w-3.5 h-3.5 text-white" />
                            </button>
                            <button
                              onClick={() => downloadOne(foto.storage_path, `postural_${foto.test_key}_${label.replace(/\s+/g, "_")}.jpg`)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors">
                              <Download className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white/10" />
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-white/30 text-center max-w-[88px] leading-tight">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Compare view ────────────────────────────────────────────
  const CompareView = () => {
    const [id1, id2] = compareIds as [string, string];
    const av1 = avaliacoes.find(a => a.id === id1);
    const av2 = avaliacoes.find(a => a.id === id2);

    useEffect(() => {
      if (id1) loadPhotos(id1);
      if (id2) loadPhotos(id2);
    }, []);

    if (!av1 || !av2) return null;
    const fotos1 = photoMap[id1] ?? [];
    const fotos2 = photoMap[id2] ?? [];
    const lk1: Record<string, any> = {};
    const lk2: Record<string, any> = {};
    for (const f of fotos1) lk1[`${f.test_key}_${f.photo_index}`] = f;
    for (const f of fotos2) lk2[`${f.test_key}_${f.photo_index}`] = f;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white/80">Comparativo de Avaliações</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                {fmtDate(av1.created_at)}
              </span>
              <span className="text-white/20 text-xs">vs</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: "rgba(99,102,241,0.15)", color: "rgb(129,140,248)" }}>
                {fmtDate(av2.created_at)}
              </span>
            </div>
          </div>
          <button
            onClick={() => { setCompareMode(false); setCompareIds([]); }}
            className="text-xs px-3 h-7 rounded-lg text-white/40 hover:text-white/70 transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
            Fechar
          </button>
        </div>

        {/* Side by side per test */}
        {POSTURAL_TESTES.map(teste => {
          const hasFotos =
            teste.photoLabels.some((_, idx) => lk1[`${teste.key}_${idx}`] || lk2[`${teste.key}_${idx}`]);
          if (!hasFotos) return null;
          return (
            <div key={teste.key}>
              <p className="text-xs font-medium text-white/40 mb-2">{teste.label}</p>
              <div className="space-y-2">
                {teste.photoLabels.map((pl, idx) => {
                  const f1 = lk1[`${teste.key}_${idx}`];
                  const f2 = lk2[`${teste.key}_${idx}`];
                  if (!f1 && !f2) return null;
                  return (
                    <div key={pl} className="grid grid-cols-2 gap-2">
                      {[
                        { foto: f1, date: fmtDate(av1.created_at), color: "var(--cp-400)" },
                        { foto: f2, date: fmtDate(av2.created_at), color: "rgb(129,140,248)" },
                      ].map(({ foto, date, color }) => (
                        <div key={date} className="space-y-1">
                          <p className="text-[10px] font-medium" style={{ color }}>{date}</p>
                          <div
                            className="rounded-xl overflow-hidden w-full"
                            style={{
                              aspectRatio: "3/4",
                              backgroundColor: "rgba(255,255,255,0.04)",
                              border: foto ? "none" : "1px dashed rgba(255,255,255,0.07)",
                            }}>
                            {foto
                              ? <img src={foto.signedUrl} alt={pl} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <Camera className="w-5 h-5 text-white/10" />
                                </div>
                            }
                          </div>
                          <p className="text-[9px] text-white/25">{pl}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-14 gap-2 text-white/25">
      <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando avaliações...</span>
    </div>
  );

  if (compareMode && compareIds.length === 2) return (
    <div className="space-y-4">
      <CompareView />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
          onClick={() => setLightbox(null)}>
          <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt={lightbox.label}
              className="w-full rounded-2xl object-contain max-h-[78vh]"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-sm text-white/50">{lightbox.label} — {lightbox.evalDate}</p>
              <button
                onClick={() => setLightbox(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                <XIcon className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending banner */}
      {pendente && (
        <div className="rounded-2xl border px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", borderColor: "rgba(var(--cp-rgb),0.2)" }}>
          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          <p className="text-sm font-medium flex-1" style={{ color: "var(--cp-300)" }}>
            Avaliação solicitada — aguardando resposta do aluno.
          </p>
          <button
            onClick={dispensarAvaliacao}
            disabled={requesting}
            className="text-xs font-medium px-3 py-1.5 rounded-lg shrink-0 transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-mid)" }}>
            Dispensar
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Avaliação Postural e Funcional</p>
          <p className="text-[11px] text-white/25 mt-0.5">{avaliacoes.length} avaliação{avaliacoes.length !== 1 ? "ões" : ""} registrada{avaliacoes.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {!pendente && (
            <button
              onClick={requestAvaliacao}
              disabled={requesting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
              {requesting ? <Spinner className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Solicitar avaliação
            </button>
          )}
          {avaliacoes.length >= 2 && (
            <button
              onClick={() => {
                setCompareIds([avaliacoes[0].id, avaliacoes[1].id] as any);
                setCompareMode(true);
                loadPhotos(avaliacoes[0].id);
                loadPhotos(avaliacoes[1].id);
              }}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
              style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
              <ScanLine className="w-3.5 h-3.5" /> Comparar últimas 2
            </button>
          )}
        </div>
      </div>

      {avaliacoes.length === 0 ? (
        <div className="rounded-2xl py-12 flex flex-col items-center gap-4 text-center px-6"
          style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
            <ScanLine className="w-7 h-7" style={{ color: "var(--cp-400)", opacity: 0.5 }} />
          </div>
          <div>
            <p className="text-white/50 font-medium text-sm">Nenhuma avaliação postural ainda</p>
            <p className="text-white/25 text-xs mt-1 max-w-xs">
              Solicite ao aluno para realizar a avaliação pelo app.
            </p>
          </div>
          {!pendente && (
            <button
              onClick={requestAvaliacao}
              disabled={requesting}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
              {requesting ? <Spinner className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Solicitar avaliação
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {avaliacoes.map((av, idx) => {
            const isOpen = expanded === av.id;
            const total  = photoMap[av.id]?.length ?? null;
            const isFirst = idx === 0;

            return (
              <div key={av.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: "#141417",
                  border: "1px solid rgba(255,255,255,0.09)",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)",
                }}>

                {/* Row header */}
                <div className="flex items-center">
                  <button
                    onClick={() => toggleExpand(av.id)}
                    className="flex-1 flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors text-left min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {isFirst && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                            Mais recente
                          </span>
                        )}
                        <span className="text-sm font-semibold text-white/80">
                          {fmtDateLong(av.created_at)}
                        </span>
                        {av.status === "concluida" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "rgb(74,222,128)" }}>
                            ✓ Concluída
                          </span>
                        )}
                        {total !== null && (
                          <span className="text-[11px] text-white/35 flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {total} foto{total !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
                  </button>

                  {/* Delete button / confirm */}
                  <div className="px-3 flex items-center gap-2 shrink-0">
                    {confirmDelete === av.id ? (
                      <>
                        <span className="text-xs text-white/40">Excluir?</span>
                        <button
                          onClick={() => deleteAvaliacao(av.id)}
                          disabled={deleting === av.id}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "rgb(252,165,165)" }}>
                          {deleting === av.id ? <Spinner className="w-3 h-3 animate-spin" /> : "Sim"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                          Não
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(av.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t px-4 py-4 space-y-5"
                    style={{ borderColor: "rgba(255,255,255,0.05)" }}>

                    {/* Photos */}
                    <PhotoGrid evalId={av.id} evalDate={av.created_at} />

                    {/* Notes */}
                    <div>
                      <label className="text-[11px] text-white/35 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <NotebookPen className="w-3 h-3" /> Observações do treinador
                      </label>
                      <textarea
                        rows={3}
                        value={notes[av.id] ?? ""}
                        onChange={e => setNotes(prev => ({ ...prev, [av.id]: e.target.value }))}
                        placeholder="Adicione anotações sobre esta avaliação..."
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/30 resize-none transition-colors"
                      />
                      <button
                        onClick={() => saveNotes(av.id)}
                        disabled={savingNotes === av.id}
                        className="mt-2 h-8 px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                        style={{ background: "var(--cp-gradient)" }}>
                        {savingNotes === av.id
                          ? <Spinner className="w-3 h-3 animate-spin" />
                          : null}
                        Salvar observações
                      </button>
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

// ── Volume por grupamento ─────────────────────────────────────────
const GRUPO_COLORS: Record<string, string> = {
  'Peito':       '#ec4899',
  'Costas':      '#3b82f6',
  'Ombros':      '#f97316',
  'Bíceps':      '#a855f7',
  'Tríceps':     '#eab308',
  'Abdômen':     '#06b6d4',
  'Glúteos':     '#10b981',
  'Quadríceps':  '#f59e0b',
  'Posteriores': '#6366f1',
  'Panturrilha': '#84cc16',
};

const VOL_SETTINGS_KEY = 'orbi_volume_settings';

interface VolumeSettings {
  countWarmup:      boolean;
  countFeeder:      boolean;
  dropSetMult:      number;
  restPauseMult:    number;
  muscleRoundMult:  number;
  clusterLoadMult:  number;
  clusterRepsMult:  number;
}

const DEFAULT_VOL_SETTINGS: VolumeSettings = {
  countWarmup:      false,
  countFeeder:      false,
  dropSetMult:      1.5,
  restPauseMult:    1.5,
  muscleRoundMult:  2,
  clusterLoadMult:  1,
  clusterRepsMult:  2,
};

const loadVolSettings = (): VolumeSettings => {
  try {
    const s = localStorage.getItem(VOL_SETTINGS_KEY);
    return s ? { ...DEFAULT_VOL_SETTINGS, ...JSON.parse(s) } : DEFAULT_VOL_SETTINGS;
  } catch { return DEFAULT_VOL_SETTINGS; }
};

const saveVolSettings = (s: VolumeSettings) => {
  try { localStorage.setItem(VOL_SETTINGS_KEY, JSON.stringify(s)); } catch {}
};

/** Returns effective sets for one serie entry (já multiplica pela quantidade) */
const calcSerieVol = (s: any, cfg: VolumeSettings): number => {
  const qty = Math.max(1, parseInt(s.quantidade) || 1);
  switch (s.tipo) {
    case 'warm-up':      return cfg.countWarmup ? qty : 0;
    case 'feeder':       return cfg.countFeeder  ? qty : 0;
    case 'trabalho':     return qty;
    case 'tecnica':      return qty;
    case 'drop-set':     return qty * cfg.dropSetMult;
    case 'rest-pause':   return qty * cfg.restPauseMult;
    case 'muscle-round': return qty * cfg.muscleRoundMult;
    case 'cluster':
      return qty * ((s.tipo_calculo === 'percentual' || s.tipo_calculo === 'aumento')
        ? cfg.clusterLoadMult
        : cfg.clusterRepsMult);
    default: return qty;
  }
};

/** Returns total effective sets for one exercício row */
const calcExVol = (ex: any, cfg: VolumeSettings): number => {
  const sd = ex.series_detalhadas;
  if (Array.isArray(sd) && sd.length > 0) {
    return sd.reduce((acc: number, s: any) => acc + calcSerieVol(s, cfg), 0);
  }
  return parseInt(ex.series) || 0;
};

/** Splits "Glúteos,Quadríceps" → ['Glúteos', 'Quadríceps'] */
const parseGroups = (s: string | null | undefined): string[] =>
  s ? s.split(',').map(g => g.trim()).filter(Boolean) : [];

// ── Carga progression viewer (coach – Treinos tab) ────────────────
// key: nome normalizado (trim + lowercase) — um mesmo exercício ganha uma
// linha nova em "exercicios" a cada semana/plano em que é prescrito, então
// agrupar por exercicio_id duplicava o mesmo exercício várias vezes na lista.
interface ExercicioOption { key: string; nome: string; ids: string[]; lastDate: string }

const toNumCoach = (s: string): number | null => {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

const CargaTooltipCoach = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2" style={{ backgroundColor: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: "hsl(42 95% 58%)" }}>{payload[0].value} kg</p>
    </div>
  );
};

const ALL_GRUPOS_VOL = [
  'Peito','Costas','Ombros','Bíceps','Tríceps',
  'Abdômen','Glúteos','Quadríceps','Posteriores','Panturrilha',
];

const VolTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 space-y-1" style={{ backgroundColor: "#18181b" }}>
      <p className="text-[11px] font-semibold mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 min-w-[130px]">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-xs flex-1" style={{ color: "rgba(255,255,255,0.7)" }}>{p.dataKey}</span>
          <span className="text-xs font-bold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/** Painel compartilhado: gráfico de linhas + legenda */
const VolumePanel = ({
  chartData, grupos, chartType, emptyMsg, setsLabel,
}: {
  chartData: Record<string, any>[];
  grupos: string[];
  chartType: 'bar' | 'line';
  emptyMsg: string;
  setsLabel?: string;
}) => {
  /* Totais acumulados por músculo (soma de todas as semanas) */
  const totais: Record<string, number> = {};
  for (const row of chartData) {
    for (const [k, v] of Object.entries(row)) {
      if (k === 'week') continue;
      totais[k] = (totais[k] || 0) + (v as number);
    }
  }
  const maxVol = Math.max(...Object.values(totais), 1);

  const axisProps = {
    tick: { fill: "var(--chart-tick)", fontSize: 11 },
    tickLine: false as const,
    axisLine: false as const,
  };

  const hasAnyData = grupos.length > 0 && chartData.length > 0;

  return (
    <div className="space-y-0 rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>

      {/* ── Gráfico de linhas (Volume Realizado) ── */}
      {chartType === 'line' && (
        <div className="p-4" style={{ borderBottom: "1px solid var(--divider-line)" }}>
          {!hasAnyData ? (
            <div className="flex items-center justify-center h-[180px]">
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>{emptyMsg}</p>
            </div>
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
                  <YAxis {...axisProps} allowDecimals={false} width={36} />
                  <Tooltip content={<VolTooltip />} />
                  {grupos.map(g => (
                    <Line key={g} type="monotone" dataKey={g}
                      stroke={GRUPO_COLORS[g] ?? '#6366f1'} strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 0, fill: GRUPO_COLORS[g] ?? '#6366f1' }}
                      activeDot={{ r: 6, strokeWidth: 0 }} connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Cabeçalho da tabela */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--divider-line)" }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--chart-tick)" }}>Músculo</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--chart-tick)" }}>
          {setsLabel ?? (chartType === 'bar' ? 'Sets prescritos' : 'Total sets')}
        </span>
      </div>

      {/* Linhas — todos os 10 músculos sempre visíveis.
          O nome tem largura fixa (não flex-1) pra que todas as barras comecem no
          mesmo x — sem isso a comparação visual entre grupamentos não funciona.
          A barra ocupa o espaço que sobrava vazio entre nome e número em telas
          largas, e é proporcional ao maior volume (maxVol). */}
      {ALL_GRUPOS_VOL.map((g, i) => {
        const val = Math.round((totais[g] || 0) * 10) / 10;
        const color = GRUPO_COLORS[g] ?? '#6366f1';
        const hasData = val > 0;
        const pct = hasData ? Math.max((val / maxVol) * 100, 1.5) : 0;
        return (
          <div key={g} className="flex items-center gap-4 px-5 py-4"
            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--divider-line)' }}>
            {/* Checkbox colorido */}
            <div className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center"
              style={{ backgroundColor: hasData ? color : 'var(--border-subtle)' }}>
              {hasData && (
                <svg viewBox="0 0 10 8" className="w-3 h-3" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            {/* Nome — largura fixa pra alinhar o início das barras */}
            <span className="w-28 shrink-0 text-base truncate" style={{ color: hasData ? "var(--text-high)" : "var(--text-dim)" }}>
              {g}
            </span>
            {/* Barra de proporção — some em telas estreitas, onde não haveria
                espaço vazio pra aproveitar e ela só apertaria nome e número. */}
            <div className="hidden sm:block flex-1 h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--border-subtle)' }}>
              {hasData && (
                <div className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${pct}%`, backgroundColor: color }} />
              )}
            </div>
            {/* Valor — w-12 text-right termina no mesmo x do label do cabeçalho */}
            <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums" style={{ color: hasData ? "var(--text-high)" : "var(--text-dim)" }}>
              {val || 0}
            </span>
          </div>
          );
        })}
      </div>
  );
};

/** Retorna a segunda-feira da semana de uma data ISO */
const getWeekStart = (dateStr: string): string => {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().split('T')[0]; // "YYYY-MM-DD" da segunda-feira
};

const fmtWeekLabel = (iso: string): string => {
  try { return format(parseISO(iso), "dd/MM", { locale: ptBR }); } catch { return iso; }
};

const CargaProgressao = ({ alunoId }: { alunoId: string }) => {
  const { toast } = useToast();
  const [view,        setView]        = useState<'carga' | 'volume'>('carga');
  const [volView,     setVolView]     = useState<'prescrito' | 'realizado'>('prescrito');
  // aba carga
  const [exercicios,  setExercicios]  = useState<ExercicioOption[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [historico,   setHistorico]   = useState<{ carga: string; data_registro: string }[]>([]);
  const [loadingEx,   setLoadingEx]   = useState(true);
  const [loadingHist, setLoadingHist] = useState(false);
  const [comboOpen,   setComboOpen]   = useState(false);
  // Mede a largura do tab switcher (Progressão de Carga / Volume por
  // Grupamento) pra deixar a barra de busca com a mesma largura exata.
  const tabSwitcherRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState<number>();
  useLayoutEffect(() => {
    const el = tabSwitcherRef.current;
    // loadingEx: enquanto os dados carregam, o componente retorna null (sem
    // DOM) — precisa re-tentar quando loadingEx virar false e a tab-switcher
    // realmente existir, senão o ResizeObserver nunca chega a ser anexado.
    if (!el) return;
    setTabWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => setTabWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadingEx]);
  // volume prescrito
  const [prescrData,   setPrescrData]   = useState<Record<string, any>[]>([]);
  const [prescrGrupos, setPrescrGrupos] = useState<string[]>([]);
  const [loadingPresc, setLoadingPresc] = useState(false);
  // volume realizado
  const [volChartData,  setVolChartData]  = useState<Record<string, any>[]>([]);
  const [volGrupos,     setVolGrupos]     = useState<string[]>([]);
  const [loadingVol,    setLoadingVol]    = useState(false);
  const [volSettings,   setVolSettings]   = useState<VolumeSettings>(loadVolSettings);
  const [showSettings,  setShowSettings]  = useState(false);

  useEffect(() => { loadExercicios(); loadVolumePrescrito(); loadVolume(volSettings); }, [alunoId]);
  useEffect(() => { if (selectedId) loadHistorico(selectedId); }, [selectedId]);

  /** Volume Prescrito: séries planejadas pelo treinador, agrupadas por semana/bloco */
  const loadVolumePrescrito = async () => {
    setLoadingPresc(true);
    setPrescrData([]);
    setPrescrGrupos([]);
    try {
      const { data: plano } = await supabase
        .from("planos_treino")
        .select("id, data_inicio")
        .eq("aluno_id", alunoId)
        .eq("ativo", true)
        .maybeSingle();
      if (!plano?.data_inicio) return;

      const planStart = parseISO(plano.data_inicio);

      const { data: todosBlocos } = await supabase
        .from("semanas")
        .select("id, numero_semana, semana_inicio, semana_fim, created_at")
        .eq("plano_id", plano.id)
        .order("semana_inicio", { ascending: true });
      if (!todosBlocos?.length) return;

      // Volume prescrito reflete só o bloco de semanas ATUAL — o aluno segue
      // um bloco por vez (ex: "Semanas 17-20, zona 6-9"), não a soma de todos
      // os blocos já criados no plano. "Atual" = o bloco criado por último.
      const ultimoBloco = [...todosBlocos].sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      const semanas = [ultimoBloco];

      const semanaIds = semanas.map((s: any) => s.id);
      const { data: treinos } = await supabase
        .from("treinos").select("id, semana_id").in("semana_id", semanaIds);
      if (!treinos?.length) return;

      const treinoIds = treinos.map((t: any) => t.id);
      const { data: exercicios } = await supabase
        .from("exercicios")
        .select("id, treino_id, series, series_detalhadas, exercicio_base_id")
        .in("treino_id", treinoIds);
      if (!exercicios?.length) return;

      const baseIds = [...new Set((exercicios ?? []).map((e: any) => e.exercicio_base_id).filter(Boolean))];
      const baseMap: Record<string, any> = {};
      if (baseIds.length) {
        const { data: bases } = await supabase
          .from("exercicios_base")
          .select("id, grupo_muscular_principal, grupo_muscular_secundario")
          .in("id", baseIds);
        for (const b of bases ?? []) baseMap[b.id] = b;
      }

      // Índice: treino_id → semana_id
      const treinoToSem: Record<string, string> = {};
      for (const t of treinos) treinoToSem[(t as any).id] = (t as any).semana_id;

      // Agrega volume por semana
      const semMap: Record<string, Record<string, number>> = {};
      for (const s of semanas) semMap[(s as any).id] = {};
      const allG = new Set<string>();

      for (const ex of exercicios as any[]) {
        const semId = treinoToSem[ex.treino_id];
        if (!semId) continue;
        const base = baseMap[ex.exercicio_base_id];
        if (!base) continue;
        const vol = calcExVol(ex, volSettings);
        for (const g of parseGroups(base.grupo_muscular_principal)) {
          allG.add(g); semMap[semId][g] = (semMap[semId][g] || 0) + vol;
        }
        for (const g of parseGroups(base.grupo_muscular_secundario)) {
          allG.add(g); semMap[semId][g] = (semMap[semId][g] || 0) + vol * 0.5;
        }
      }

      const rows = (semanas as any[])
        .sort((a, b) => (a.semana_inicio ?? a.numero_semana) - (b.semana_inicio ?? b.numero_semana))
        .map(s => {
          const ini = s.semana_inicio ?? s.numero_semana ?? 1;
          const startDate = new Date(planStart.getTime() + (ini - 1) * 7 * 86400_000);
          const label = fmtWeekLabel(startDate.toISOString());
          const row: Record<string, any> = { week: label };
          for (const [g, v] of Object.entries(semMap[s.id] ?? {})) row[g] = Math.round((v as number) * 10) / 10;
          return row;
        });

      setPrescrGrupos([...allG].sort());
      setPrescrData(rows);
    } catch (e: any) {
      console.warn("[loadVolumePrescrito]", e?.message ?? e);
    } finally { setLoadingPresc(false); }
  };

  /**
   * Volume real executado: agrega séries por grupamento muscular semana a semana
   * a partir do historico_carga (execuções reais do aluno, não do plano estático).
   */
  const loadVolume = async (cfg: VolumeSettings) => {
    setLoadingVol(true);
    setVolGrupos([]);
    setVolChartData([]);
    try {
      // 1. Plano ativo — precisa da data_inicio para calcular datas das semanas
      const { data: plano, error: errP } = await supabase
        .from("planos_treino")
        .select("id, data_inicio")
        .eq("aluno_id", alunoId)
        .eq("ativo", true)
        .maybeSingle();
      if (errP) { console.warn("[vol] plano:", errP.message); return; }
      if (!plano?.data_inicio) return;

      const planStart = parseISO(plano.data_inicio); // Date base do plano

      // 2. Semanas do plano (semana_inicio e semana_fim são números de semana, ex: 1 e 8)
      const { data: semanas, error: errSem } = await supabase
        .from("semanas")
        .select("id, numero_semana, semana_inicio, semana_fim")
        .eq("plano_id", plano.id)
        .order("semana_inicio", { ascending: true });
      if (errSem) { console.warn("[vol] semanas:", errSem.message); return; }
      if (!semanas?.length) return;

      // Cada semana/bloco ocupa semana_inicio..semana_fim semanas do plano.
      // Data de início do bloco = planStart + (semana_inicio - 1) * 7 dias
      // Data de fim    do bloco = planStart + semana_fim * 7 dias (exclusivo)
      const semanaRanges = semanas.map((s: any) => {
        const ini = s.semana_inicio ?? s.numero_semana ?? 1;
        const fim = s.semana_fim    ?? ini;
        const startMs = planStart.getTime() + (ini - 1) * 7 * 86400_000;
        const endMs   = planStart.getTime() + fim       * 7 * 86400_000; // exclusivo
        return {
          id:       s.id as string,
          startMs,
          endMs,
          label: fmtWeekLabel(new Date(startMs).toISOString()),
          sortKey: startMs,
        };
      });

      // 3. Todos os treinos → exercícios do plano para montar o mapa exId → grupos
      const semanaIds = semanas.map((s: any) => s.id);
      const { data: treinos } = await supabase
        .from("treinos").select("id, semana_id").in("semana_id", semanaIds);

      const exMap: Record<string, any> = {};
      if (treinos?.length) {
        const treinoIds = treinos.map((t: any) => t.id);
        const { data: exercicios } = await supabase
          .from("exercicios")
          .select("id, series, series_detalhadas, exercicio_base_id")
          .in("treino_id", treinoIds);

        const baseIds = [...new Set((exercicios ?? []).map((e: any) => e.exercicio_base_id).filter(Boolean))];
        const baseMap: Record<string, any> = {};
        if (baseIds.length) {
          const { data: bases } = await supabase
            .from("exercicios_base")
            .select("id, grupo_muscular_principal, grupo_muscular_secundario")
            .in("id", baseIds);
          for (const b of bases ?? []) baseMap[b.id] = b;
        }
        for (const e of exercicios ?? []) exMap[e.id] = { ...e, base: baseMap[e.exercicio_base_id] };
      }

      // 4. Histórico real de execuções do aluno
      const { data: histo, error: errH } = await supabase
        .from("historico_carga")
        .select("exercicio_id, data_registro")
        .eq("aluno_id", alunoId)
        .not("exercicio_id", "is", null)
        .order("data_registro", { ascending: true });
      if (errH) { console.warn("[vol] historico:", errH.message); return; }
      if (!histo?.length) return;

      // 5. Deduplica por (exercicio_id, dia) e mapeia ao bloco correto do plano
      const seen = new Set<string>();
      const allGrupos = new Set<string>();
      // weekVol: semana.startMs → grupo → volume
      const weekVol: Record<number, Record<string, number>> = {};
      for (const sem of semanaRanges) weekVol[sem.startMs] = {};

      for (const h of histo) {
        if (!h.exercicio_id) continue;
        const day = (h.data_registro as string).slice(0, 10);
        const dedupKey = `${h.exercicio_id}__${day}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        // Qual bloco cobre esta data?
        const hMs = new Date(h.data_registro).getTime();
        const sem = semanaRanges.find(s => hMs >= s.startMs && hMs < s.endMs);
        if (!sem) continue; // fora do intervalo do plano

        const ex = exMap[h.exercicio_id];
        if (!ex?.base) continue;
        const vol = calcExVol(ex, cfg);
        for (const g of parseGroups(ex.base.grupo_muscular_principal)) {
          allGrupos.add(g);
          weekVol[sem.startMs][g] = (weekVol[sem.startMs][g] || 0) + vol;
        }
        for (const g of parseGroups(ex.base.grupo_muscular_secundario)) {
          allGrupos.add(g);
          weekVol[sem.startMs][g] = (weekVol[sem.startMs][g] || 0) + vol * 0.5;
        }
      }

      // 6. Monta rows para recharts — ordenados pela data real do bloco
      const chartRows = semanaRanges
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(sem => {
          const row: Record<string, any> = { week: sem.label };
          for (const [g, v] of Object.entries(weekVol[sem.startMs])) {
            row[g] = Math.round(v * 10) / 10;
          }
          return row;
        });

      setVolGrupos([...allGrupos].sort());
      setVolChartData(chartRows);
    } catch (e: any) {
      console.warn("[loadVolume] erro:", e?.message ?? e);
    } finally { setLoadingVol(false); }
  };

  const updateVolSettings = (patch: Partial<VolumeSettings>) => {
    setVolSettings(prev => {
      const next = { ...prev, ...patch };
      saveVolSettings(next);
      loadVolume(next);
      return next;
    });
  };

  const loadExercicios = async () => {
    setLoadingEx(true);
    try {
      // Busca historico_carga e exercicios em queries separadas (não como
      // embed) — um embed do tipo historico_carga->exercicios some com a
      // linha inteira quando a RLS de "exercicios" barra aquela linha
      // específica (ex: exercicio_id órfão de um treino já excluído), mesmo
      // sem gerar nenhum error explícito. Isso fazia a progressão sumir em
      // silêncio pra alunos com exercícios órfãos no histórico.
      const { data, error } = await supabase
        .from("historico_carga")
        .select("exercicio_id, data_registro")
        .eq("aluno_id", alunoId)
        .order("data_registro", { ascending: false });
      if (error) {
        console.error("[CargaProgressao] loadExercicios:", error);
        toast({ title: "Erro ao carregar histórico de carga", description: error.message, variant: "destructive" });
        setExercicios([]);
        return;
      }
      // Linhas com exercicio_id nulo são lixo órfão (ex: exercício excluído
      // do plano depois do registro de carga) — ignoradas, senão quebram o
      // agrupamento inteiro pro aluno.
      const rows = (data ?? []).filter((r) => r.exercicio_id != null);
      const exercicioIds = [...new Set(rows.map((r) => r.exercicio_id))];
      const nomeMap: Record<string, string> = {};
      if (exercicioIds.length) {
        const { data: exs, error: exsError } = await supabase
          .from("exercicios")
          .select("id, nome_exercicio")
          .in("id", exercicioIds);
        if (exsError) console.error("[CargaProgressao] loadExercicios (nomes):", exsError);
        for (const e of exs ?? []) nomeMap[e.id] = e.nome_exercicio;
      }
      // Agrupa por nome (não por exercicio_id) — o mesmo exercício tem uma
      // linha diferente em "exercicios" por semana/plano em que foi prescrito.
      // Como a busca já vem ordenada por data desc, o primeiro registro visto
      // de cada grupo é o mais recente daquele exercício.
      const groups: Record<string, ExercicioOption> = {};
      for (const r of rows) {
        const nome = (nomeMap[r.exercicio_id] ?? r.exercicio_id).trim();
        const key = nome.toLowerCase();
        if (!groups[key]) groups[key] = { key, nome, ids: [], lastDate: r.data_registro };
        if (!groups[key].ids.includes(r.exercicio_id)) groups[key].ids.push(r.exercicio_id);
      }
      const byRecent = Object.values(groups).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
      setExercicios(byRecent.slice().sort((a, b) => a.nome.localeCompare(b.nome)));
      if (byRecent.length > 0) setSelectedId(byRecent[0].key);
    } catch (e) {
      console.error("[CargaProgressao] loadExercicios (exceção):", e);
    } finally { setLoadingEx(false); }
  };

  const loadHistorico = async (key: string) => {
    const group = exercicios.find((e) => e.key === key);
    if (!group) { setHistorico([]); return; }
    setLoadingHist(true);
    const { data, error } = await supabase
      .from("historico_carga")
      .select("carga, data_registro")
      .eq("aluno_id", alunoId)
      .in("exercicio_id", group.ids)
      .order("data_registro", { ascending: true })
      .limit(60);
    if (error) {
      console.error("[CargaProgressao] loadHistorico:", error);
      toast({ title: "Erro ao carregar progressão de carga", description: error.message, variant: "destructive" });
    }
    setHistorico(data ?? []);
    setLoadingHist(false);
  };

  // Acesso rápido: os exercícios com registro mais recente, pra não precisar
  // abrir a busca toda vez pros exercícios que o treinador mais confere.
  const quickAccess = [...exercicios].sort((a, b) => b.lastDate.localeCompare(a.lastDate)).slice(0, 5);
  const selectedExercicio = exercicios.find((e) => e.key === selectedId);

  const chartData = historico
    .map((r) => ({ date: format(parseISO(r.data_registro), "dd/MM", { locale: ptBR }), carga: toNumCoach(r.carga) }))
    .filter((r) => r.carga != null) as { date: string; carga: number }[];

  const cargas = chartData.map((d) => d.carga);
  const cargaMax    = cargas.length ? Math.max(...cargas) : null;
  const cargaAtual  = cargas.length ? cargas[cargas.length - 1] : null;
  const cargaInicial = cargas.length ? cargas[0] : null;
  const variacao = cargaInicial && cargaInicial > 0 && cargaAtual != null
    ? ((cargaAtual - cargaInicial) / cargaInicial) * 100 : null;

  if (loadingEx) return null;

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div ref={tabSwitcherRef} className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: "var(--toggle-bg)" }}>
        {([
          { key: 'carga',  label: 'Progressão de Carga',      icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { key: 'volume', label: 'Volume por Grupamento', icon: <BarChart2 className="w-3.5 h-3.5" /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: view === key ? "var(--surface-1)" : "transparent",
              color: view === key ? "hsl(35 92% 44%)" : "var(--ui-inactive-color)",
              border: view === key ? "1px solid rgba(var(--cp-rgb),0.35)" : "1px solid transparent",
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Aba: Progressão de Carga ── */}
      {view === 'carga' && (exercicios.length === 0 ? (
        <div className="rounded-2xl py-10 text-center" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nenhum histórico de carga ainda.</p>
          <p className="text-xs mt-1" style={{ color: "var(--chart-tick)" }}>O aluno precisa registrar cargas no app para aparecer aqui.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {/* Busca — larga, em cima */}
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-10 rounded-xl px-3 flex items-center gap-2 text-left transition-colors"
                  style={{
                    width: tabWidth,
                    backgroundColor: "var(--filter-inactive-bg)",
                    border: `1px solid ${comboOpen ? "rgba(var(--cp-rgb),0.4)" : "var(--filter-inactive-border)"}`,
                  }}
                >
                  <Search className="w-4 h-4 opacity-50 shrink-0" />
                  <span className="flex-1 text-sm truncate" style={{ color: selectedExercicio ? "var(--text-high)" : "var(--filter-inactive-color)" }}>
                    {selectedExercicio ? selectedExercicio.nome : "Buscar exercício..."}
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 border border-white/10"
                style={{ width: "var(--radix-popover-trigger-width)", backgroundColor: "#111113" }}
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Buscar exercício..." className="text-white border-b border-white/10" />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-sm text-white/40">
                      Nenhum exercício encontrado.
                    </CommandEmpty>
                    <CommandGroup>
                      {exercicios.map((ex) => (
                        <CommandItem
                          key={ex.key}
                          value={ex.nome}
                          onSelect={() => { setSelectedId(ex.key); setComboOpen(false); }}
                          className="text-white/80 aria-selected:text-white aria-selected:bg-white/10"
                        >
                          {ex.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Acesso rápido — sempre em uma única linha, rola se não couber */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {quickAccess.map((ex) => (
                <button key={ex.key} onClick={() => setSelectedId(ex.key)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    backgroundColor: selectedId === ex.key ? "var(--surface-1)" : "var(--filter-inactive-bg)",
                    color: selectedId === ex.key ? "hsl(35 92% 44%)" : "var(--filter-inactive-color)",
                    border: `1px solid ${selectedId === ex.key ? "rgba(var(--cp-rgb),0.35)" : "var(--filter-inactive-border)"}`,
                  }}>
                  {ex.nome}
                </button>
              ))}
            </div>
          </div>

          {loadingHist ? (
            <div className="flex items-center justify-center py-10 gap-2 text-white/30">
              <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
            </div>
          ) : chartData.length < 1 ? (
            <div className="rounded-2xl py-8 text-center" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
              <p className="text-white/30 text-sm">Nenhum registro de carga para este exercício.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Maior carga", value: cargaMax != null ? `${cargaMax} kg` : "—" },
                  { label: "Carga atual", value: cargaAtual != null ? `${cargaAtual} kg` : "—" },
                  { label: "Variação", value: variacao != null ? `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%` : "—",
                    color: variacao == null ? undefined : variacao > 0 ? "hsl(42 95% 58%)" : "hsl(0 70% 55%)" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl px-4 py-3" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--chart-tick)" }}>{s.label}</p>
                    <p className="text-base font-bold" style={{ color: s.color ?? "var(--text-high)" }}>{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--chart-tick)" }}>
                  {selectedExercicio?.nome}
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cargaAreaFillCoach" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(42 95% 58%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(42 95% 58%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--chart-tick)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CargaTooltipCoach />} />
                    <Area type="monotone" dataKey="carga" stroke="hsl(42 95% 58%)" strokeWidth={2.5}
                      fill="url(#cargaAreaFillCoach)"
                      dot={{ r: 3, fill: "hsl(42 95% 58%)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      ))}

      {/* ── Aba: Volume por Grupamento ── */}
      {view === 'volume' && (
        <div className="space-y-4">
          {/* Sub-abas: Prescrito / Realizado */}
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: "var(--toggle-bg)" }}>
            {([
              { key: 'prescrito', label: 'Volume Prescrito' },
              { key: 'realizado', label: 'Volume Realizado' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setVolView(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: volView === key ? "var(--surface-1)" : "transparent",
                  color: volView === key ? "hsl(35 92% 44%)" : "var(--ui-inactive-color)",
                  border: volView === key ? "1px solid rgba(var(--cp-rgb),0.35)" : "1px solid transparent",
                }}
              >{label}</button>
            ))}
          </div>

          {/* ── Sub-aba: Volume Prescrito ── */}
          {volView === 'prescrito' && (loadingPresc ? (
            <div className="flex items-center justify-center py-12 gap-2 text-white/30">
              <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
            </div>
          ) : (
            <VolumePanel
              chartData={prescrData}
              grupos={prescrGrupos}
              chartType="bar"
              setsLabel="Sets prescritos"
              emptyMsg="Nenhum exercício com grupamento definido no plano."
            />
          ))}

          {/* ── Sub-aba: Volume Realizado ── */}
          {volView === 'realizado' && (loadingVol ? (
            <div className="flex items-center justify-center py-12 gap-2 text-white/30">
              <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
            </div>
          ) : (
            <VolumePanel
              chartData={volChartData}
              grupos={volGrupos}
              chartType="line"
              setsLabel="Total sets"
              emptyMsg="Nenhuma sessão registrada ainda."
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Sidebar color — keeps header band consistent with sidebar
const BAND_BG = "#0f0f11";

const StudentDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const { hasDiet, hasTraining, hasAvaliacaoPostural } = usePlanFeatures();
  const { isCollaborator, can: collabCan, loading: collabLoading } = useCollaboratorPermissions();

  // Abas visíveis de acordo com o plano da org e permissões do colaborador
  const visibleTabs = TABS.filter((tab) => {
    // Filtros de plano da org (valem para todos)
    if (tab.key === "dieta"    && !hasDiet)              return false;
    if (tab.key === "treinos"  && !hasTraining)           return false;
    if (tab.key === "postural" && !hasAvaliacaoPostural)  return false;
    // Check-ins substituído pela análise de IA em Atualização (2026-08-02) —
    // aba escondida, mas os dados/relatórios antigos continuam no banco.
    if (tab.key === "checkins") return false;

    // Treinador dono: acesso irrestrito
    if (!isCollaborator) return true;

    // Colaborador: usa a seção abas_aluno das permissões
    return collabCan("abas_aluno", tab.key);
  });

  const [student,       setStudent]       = useState<StudentData | null>(null);
  const [loading,       setLoading]       = useState(true);
  // Persiste a aba ativa na URL (?tab=treinos) para sobreviver ao F5
  const tabFromUrl = (searchParams.get("tab") as TabKey) || "treinos";
  const activeTab: TabKey = visibleTabs.find(t => t.key === tabFromUrl)
    ? tabFromUrl
    : (visibleTabs[0]?.key ?? "treinos");

  const setActiveTab = (tab: TabKey) => {
    setSearchParams(prev => { prev.set("tab", tab); return prev; }, { replace: true });
  };

  // Garante que a aba inicial seja válida para o usuário logado
  useEffect(() => {
    if (collabLoading) return;
    if (!visibleTabs.find((t) => t.key === activeTab) && visibleTabs.length > 0) {
      setSearchParams(prev => { prev.set("tab", visibleTabs[0].key); return prev; }, { replace: true });
    }
  }, [collabLoading]);
  const [studentWeight, setStudentWeight] = useState<number | null>(null);
  const [coachId,       setCoachId]       = useState<string | null>(null);
  const [plano, setPlano] = useState<{
    plano_nome: string;
    plano_inicio: string;
    data_expiracao_plano: string;
    plano_valor_pago: number | null;
  } | null>(null);
  const [planoEdit, setPlanoEdit] = useState(false);
  const [planoForm, setPlanoForm] = useState({
    plano_nome: "", plano_inicio: "", data_expiracao_plano: "", plano_valor_pago: "",
    selected_plan_id: "",
  });
  const [planoSaving, setPlanoSaving] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<{ id: string; name: string; pix_value: number | null }[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (collabLoading || !orgId) return;
    if (id) loadStudentData();
  }, [id, collabLoading, orgId]);

  // Carrega planos do treinador para o select da aba Plano
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("plans")
      .select("id, name, pix_value")
      .eq("org_id", orgId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setAvailablePlans(data ?? []));
  }, [orgId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCoachId(session.user.id);
    const { data: profile } = await supabase
      .from("profiles").select("tipo_usuario").eq("id", session.user.id).single();
    if (profile?.tipo_usuario !== "treinador") navigate(`/${slug}/aluno`);
  };

  const loadStudentData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Verifica colaborador diretamente no banco — evita race condition com o hook
      const { data: collabRow } = await supabase
        .from("collaborators")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("org_id", orgId)
        .eq("status", "active")
        .maybeSingle();

      const isCollab = !!collabRow;

      let query = supabase
        .from("alunos")
        .select("id, user_id, observacoes, profiles!alunos_user_id_fkey(nome), plano_nome, plano_inicio, data_expiracao_plano, plano_valor_pago")
        .eq("id", id);

      if (!isCollab) {
        query = query.eq("treinador_id", session.user.id);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Aluno não encontrado.");
      setStudent(data as StudentData);
      // Carrega plano se existir
      if ((data as any).plano_nome) {
        const p = data as any;
        setPlano({ plano_nome: p.plano_nome, plano_inicio: p.plano_inicio ?? "", data_expiracao_plano: p.data_expiracao_plano ?? "", plano_valor_pago: p.plano_valor_pago ?? null });
        setPlanoForm({ plano_nome: p.plano_nome ?? "", plano_inicio: p.plano_inicio ?? "", data_expiracao_plano: p.data_expiracao_plano ?? "", plano_valor_pago: p.plano_valor_pago != null ? String(p.plano_valor_pago) : "", selected_plan_id: "" });
      }
      // Busca peso do último check-in
      loadWeight((data as StudentData).user_id);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados do aluno", description: err.message, variant: "destructive" });
      navigate(`/${slug}/treinador`);
    } finally {
      setLoading(false);
    }
  };

  const loadWeight = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("check_ins")
        .select("weight")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.weight) setStudentWeight(data.weight);
    } catch {}
  };

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Aluno não encontrado</p>
      </div>
    );
  }

  const initials = student.profiles.nome
    .split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background">

      {/* ══════════════════════════════════════════════════════
          HEADER — dark band (sempre escuro, como a sidebar)
      ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-30" style={{ backgroundColor: BAND_BG }}>

        {/* Identity strip */}
        <div className="px-6 lg:px-8 pt-4 pb-4 flex items-center gap-4">

          {/* Voltar */}
          <button
            onClick={() => navigate(`/${slug}/treinador/clientes`)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base text-white shrink-0"
            style={{ background: "var(--cp-gradient)", boxShadow: "0 0 0 3px rgba(var(--cp-rgb),0.2)" }}
          >
            {initials || <User className="w-5 h-5" />}
          </div>

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight" style={{ color: "#ffffff" }}>
              {student.profiles.nome}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Badge aluno */}
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
              >
                Aluno
              </span>
              {/* Badge peso */}
              {studentWeight && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
                >
                  <Weight className="w-3 h-3" />
                  {studentWeight} kg
                </span>
              )}
              {/* Observações */}
              {student.observacoes && (
                <span
                  className="text-[11px] truncate max-w-[200px]"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {student.observacoes}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar — still on the dark band, underline marks the page break */}
        <div
          className="px-6 lg:px-8 flex gap-0 overflow-x-auto scrollbar-none"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
                style={{
                  color: active ? "#ffffff" : "rgba(255,255,255,0.45)",
                  borderBottomColor: active ? "var(--cp-500)" : "transparent",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)"; }}
              >
                <tab.icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: active ? "var(--cp-500)" : undefined }}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CONTEÚDO DA TAB
      ══════════════════════════════════════════════════════ */}
      {/* Aba "treinos" usa a largura toda — o kanban de sessões precisa do espaço
          horizontal pra caber mais colunas sem scroll. As outras abas mantêm
          max-w-5xl porque são texto corrido/formulários (leitura ruim se esticar). */}
      <div className={`px-6 lg:px-8 py-6 ${activeTab === "treinos" ? "" : "max-w-5xl"}`}>

        {activeTab === "treinos" && (
          <div className="space-y-8">
            <TrainingPlanManager studentId={id!} />

            {/* Alongamentos moraram numa aba própria até 2026-07-30. Vieram pra
                cá porque no app do ALUNO eles já ficam dentro de Treinos — ter
                abas separadas obrigava a conferir dois lugares pra saber o que o
                aluno vê numa tela só.
                A ORDEM, porém, não espelha a do aluno de propósito: lá o
                alongamento vem antes (ordem de execução — aquece, depois treina);
                aqui vem depois, porque o treinador constrói o plano primeiro e o
                kanban é o trabalho principal — colocá-lo no topo empurraria o
                conteúdo mais usado pra baixo da dobra. Fica junto do plano (o que
                se edita) e antes da Progressão de Carga (o que se analisa). */}
            <AlongamentosManager alunoId={student.id} orgId={orgId} treinadorId={coachId} />

            <div className="rounded-2xl border border-white/8 p-5" style={{ backgroundColor: "rgba(255,255,255,0.015)" }}>
              <CargaProgressao alunoId={id!} />
            </div>
          </div>
        )}

        {activeTab === "plano" && (() => {
          // ── Helper: calcula vencimento pelo nome do plano ──────────────────
          const calcExpiry = (nome: string, inicio: string): string => {
            if (!inicio) return "";
            const n = nome.toLowerCase();
            const d = new Date(inicio + "T00:00:00");
            let months = 0;
            if      (n.includes("anual")         || n.includes("12 m") || n.includes("1 ano"))  months = 12;
            else if (n.includes("semestral")     || n.includes("6 m")  || n.includes("6mes"))   months = 6;
            else if (n.includes("quadrimestral") || n.includes("4 m")  || n.includes("4mes"))   months = 4;
            else if (n.includes("trimestral")    || n.includes("3 m")  || n.includes("3mes"))   months = 3;
            else if (n.includes("bimestral")     || n.includes("2 m")  || n.includes("2mes"))   months = 2;
            else if (n.includes("mensal")        || n.includes("1 m")  || n.includes("1mes"))   months = 1;
            if (months === 0) return "";
            d.setMonth(d.getMonth() + months);
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          };

          const savePlano = async () => {
            if (!planoForm.plano_nome.trim()) {
              toast({ title: "Nome do plano obrigatório", variant: "destructive" }); return;
            }
            setPlanoSaving(true);
            try {
              const payload: Record<string, unknown> = {
                plano_nome:           planoForm.plano_nome.trim() || null,
                plano_inicio:         planoForm.plano_inicio      || null,
                data_expiracao_plano: planoForm.data_expiracao_plano || null,
                plano_valor_pago:     planoForm.plano_valor_pago ? parseFloat(planoForm.plano_valor_pago.replace(",", ".")) : null,
              };
              const { error } = await supabase.from("alunos").update(payload).eq("id", id!);
              if (error) throw error;
              setPlano({ plano_nome: payload.plano_nome as string, plano_inicio: payload.plano_inicio as string, data_expiracao_plano: payload.data_expiracao_plano as string, plano_valor_pago: payload.plano_valor_pago as number | null });
              setPlanoEdit(false);
              toast({ title: "Plano atualizado!" });
            } catch (e: any) {
              toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
            } finally { setPlanoSaving(false); }
          };

          const hoje = new Date(); hoje.setHours(0,0,0,0);
          const venc = plano?.data_expiracao_plano ? new Date(plano.data_expiracao_plano + "T00:00:00") : null;
          const dias = venc ? Math.ceil((venc.getTime() - hoje.getTime()) / 86400000) : null;
          const cor  = dias === null ? "rgba(255,255,255,0.4)" : dias < 0 ? "hsl(0 70% 60%)" : dias <= 7 ? "hsl(38 95% 58%)" : "hsl(142 70% 50%)";
          const statusTxt = dias === null ? "Sem vencimento" : dias < 0 ? "Vencido" : dias === 0 ? "Vence hoje" : dias <= 7 ? `Vence em ${dias} dias` : "Ativo";

          const inp = "w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-amber-500/40";
          const lbl = "text-[11px] text-white/40 uppercase tracking-wider mb-1 block";

          // ── handler: seleciona plano do catálogo ──────────────────────────
          const handleSelectPlan = (planId: string) => {
            if (!planId) {
              setPlanoForm(f => ({ ...f, selected_plan_id: "" }));
              return;
            }
            const found = availablePlans.find(p => p.id === planId);
            if (!found) return;
            const expiry = planoForm.plano_inicio ? calcExpiry(found.name, planoForm.plano_inicio) : "";
            setPlanoForm(f => ({
              ...f,
              selected_plan_id:     found.id,
              plano_nome:           found.name,
              plano_valor_pago:     found.pix_value != null ? String(found.pix_value) : f.plano_valor_pago,
              data_expiracao_plano: expiry || f.data_expiracao_plano,
            }));
          };

          // ── handler: muda data de início e recalcula vencimento ───────────
          const handleInicioChange = (val: string) => {
            const expiry = planoForm.plano_nome ? calcExpiry(planoForm.plano_nome, val) : "";
            setPlanoForm(f => ({
              ...f,
              plano_inicio:         val,
              data_expiracao_plano: expiry || f.data_expiracao_plano,
            }));
          };

          return (
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            <div className="max-w-lg space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
                  <h2 className="text-base font-bold text-white">Plano do aluno</h2>
                </div>
                {!planoEdit && (
                  <button onClick={() => { setPlanoEdit(true); if (!plano) setPlanoForm({ plano_nome: "", plano_inicio: "", data_expiracao_plano: "", plano_valor_pago: "", selected_plan_id: "" }); }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                    style={{ backgroundColor: "var(--btn-ghost-bg)", color: "var(--btn-ghost-color)" }}>
                    <Pencil className="w-3 h-3" />{plano ? "Editar" : "Definir plano"}
                  </button>
                )}
              </div>

              {/* Read view */}
              {plano && !planoEdit && (
                <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--modal-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{plano.plano_nome}</p>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: `${cor}20`, color: cor }}>{statusTxt}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {plano.plano_inicio && (
                      <div>
                        <p className="text-[10px] text-white/35 uppercase tracking-wider">Início</p>
                        <p className="text-xs font-medium text-white mt-0.5">{format(new Date(plano.plano_inicio + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                    )}
                    {venc && (
                      <div>
                        <p className="text-[10px] text-white/35 uppercase tracking-wider">Vencimento</p>
                        <p className="text-xs font-medium mt-0.5" style={{ color: cor }}>{format(venc, "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                    )}
                    {plano.plano_valor_pago != null && (
                      <div>
                        <p className="text-[10px] text-white/35 uppercase tracking-wider">Valor pago</p>
                        <p className="text-xs font-semibold text-white mt-0.5">{Number(plano.plano_valor_pago).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!plano && !planoEdit && (
                <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                  <CreditCard className="w-6 h-6 text-white/15 mx-auto mb-2" />
                  <p className="text-sm text-white/30">Nenhum plano definido</p>
                  <p className="text-xs text-white/20 mt-1">Preenchido automaticamente via pagamento ou manualmente aqui.</p>
                </div>
              )}

              {/* Edit form */}
              {planoEdit && (
                <div className="rounded-2xl p-4 space-y-4" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>

                  {/* ── Selecionar plano do catálogo ──────────────────────── */}
                  {availablePlans.length > 0 && (
                    <div className="space-y-1">
                      <label className={lbl}>Selecionar plano cadastrado</label>
                      <select
                        className={`${inp} appearance-none cursor-pointer`}
                        value={planoForm.selected_plan_id}
                        onChange={(e) => handleSelectPlan(e.target.value)}
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                      >
                        <option value="">— selecionar do catálogo —</option>
                        {availablePlans.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.pix_value != null ? ` — ${Number(p.pix_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-white/25 mt-1">Preencherá automaticamente nome, valor e vencimento.</p>
                    </div>
                  )}

                  {/* ── Nome do plano ──────────────────────────────────────── */}
                  <div className="space-y-1">
                    <label className={lbl}>Nome do plano *</label>
                    <input
                      className={inp}
                      value={planoForm.plano_nome}
                      onChange={(e) => {
                        const nome = e.target.value;
                        const expiry = planoForm.plano_inicio ? calcExpiry(nome, planoForm.plano_inicio) : "";
                        setPlanoForm(f => ({ ...f, plano_nome: nome, selected_plan_id: "", data_expiracao_plano: expiry || f.data_expiracao_plano }));
                      }}
                      placeholder="Ex: Consultoria Online Anual"
                    />
                  </div>

                  {/* ── Datas ─────────────────────────────────────────────── */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={lbl}>Data de início</label>
                      <input
                        type="date"
                        className={inp}
                        value={planoForm.plano_inicio}
                        onChange={(e) => handleInicioChange(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>
                        Vencimento
                        {planoForm.plano_nome && planoForm.plano_inicio && calcExpiry(planoForm.plano_nome, planoForm.plano_inicio) && (
                          <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
                            AUTO
                          </span>
                        )}
                      </label>
                      <input
                        type="date"
                        className={inp}
                        value={planoForm.data_expiracao_plano}
                        onChange={(e) => setPlanoForm(f => ({ ...f, data_expiracao_plano: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* ── Valor pago ────────────────────────────────────────── */}
                  <div className="space-y-1">
                    <label className={lbl}>Valor pago (R$)</label>
                    <input
                      className={inp}
                      value={planoForm.plano_valor_pago}
                      onChange={(e) => setPlanoForm(f => ({ ...f, plano_valor_pago: e.target.value }))}
                      placeholder="3.600,00"
                      inputMode="decimal"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setPlanoEdit(false)}
                      className="flex-1 h-10 rounded-xl text-sm font-medium text-white/50 transition-colors"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                      Cancelar
                    </button>
                    <button onClick={savePlano} disabled={planoSaving}
                      className="flex-1 h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: "var(--cp-gradient)" }}>
                      {planoSaving ? <Spinner className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 lg:mt-0">
              <PagamentosHistorico alunoId={student.id} slug={slug} />
            </div>
            </div>
          );
        })()}

        {activeTab === "dieta" && (
          <div className="space-y-6">
            <DietManager
              studentId={id!}
              studentUserId={student.user_id}
              orgId={orgId}
            />
            <SuplementosManager alunoId={student.id} orgId={orgId} />
          </div>
        )}

        {activeTab === "cardio" && (
          <CardioManager alunoId={student.id} orgId={orgId} />
        )}

        {activeTab === "checkins" && <CheckInsViewer studentUserId={student.user_id} />}

        {activeTab === "evolucao" && <EvolucaoViewer studentUserId={student.user_id} studentName={student.profiles.nome} alunoId={student.id} />}

        {activeTab === "anamnese" && (
          <AnamneseViewer studentUserId={student.user_id} studentAlunoId={student.id} />
        )}

        {activeTab === "atualizacao" && (
          <div className="space-y-6">
            <UpdateFormManager studentId={id!} />
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Atualizações enviadas</p>
              <StudentAtualizacoesViewer studentUserId={student.user_id} alunoId={student.id} />
            </div>
          </div>
        )}

        {activeTab === "feedbacks" && <FeedbackManager studentId={id!} />}

        {activeTab === "postural" && <PosturalViewer studentUserId={student.user_id} alunoId={student.id} />}

        {activeTab === "anotacoes" && (
          <AnotacoesViewer alunoId={student.id} orgId={orgId} coachId={coachId} />
        )}

        {activeTab === "aval_fisica" && (
          <AvalFisicaViewer alunoId={student.id} orgId={orgId} studentUserId={student.user_id} />
        )}

      </div>
    </div>
  );
};

// ── Anotações Viewer ──────────────────────────────────────────────
interface Anotacao {
  id: string;
  texto: string;
  created_at: string;
}

const AnotacoesViewer = ({
  alunoId,
  orgId,
  coachId,
}: {
  alunoId: string;
  orgId: string | null;
  coachId: string | null;
}) => {
  const { toast }   = useToast();
  const [items,     setItems]     = useState<Anotacao[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [texto,     setTexto]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId,  setConfirmId]  = useState<string | null>(null);

  useEffect(() => { load(); }, [alunoId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("anotacoes_aluno")
        .select("id, texto, created_at")
        .eq("aluno_id", alunoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems(data ?? []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar anotações", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    const t = texto.trim();
    if (!t || !orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("anotacoes_aluno").insert({
        org_id:       orgId,
        aluno_id:     alunoId,
        treinador_id: coachId,
        texto:        t,
      });
      if (error) throw error;
      setTexto("");
      toast({ title: "Anotação salva!" });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("anotacoes_aluno").delete().eq("id", id);
      if (error) throw error;
      setItems((prev) => prev.filter((a) => a.id !== id));
      setConfirmId(null);
      toast({ title: "Anotação excluída." });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally { setDeletingId(null); }
  };

  const fmtDate = (iso: string) =>
    format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  return (
    <div className="space-y-5">
      {/* Nova anotação */}
      <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Nova anotação</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva uma anotação sobre este aluno..."
          rows={4}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/40 transition-colors resize-none"
        />
        <button
          onClick={handleSave}
          disabled={saving || !texto.trim()}
          className="h-10 px-5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-40 transition-all"
          style={{ background: "var(--cp-gradient)" }}
        >
          {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar anotação
        </button>
      </div>

      {/* Histórico */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Histórico de anotações</p>
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-white/25">
            <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl py-12 text-center" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
            <NotebookPen className="w-8 h-8 text-white/10 mx-auto mb-2" />
            <p className="text-white/30 text-sm">Nenhuma anotação registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <div key={a.id} className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap flex-1">{a.texto}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmId === a.id ? (
                      <>
                        <span className="text-xs text-white/40 mr-1">Excluir?</span>
                        <button
                          onClick={() => handleDelete(a.id)}
                          disabled={deletingId === a.id}
                          className="text-xs px-2 h-7 rounded-lg font-semibold"
                          style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
                        >
                          {deletingId === a.id ? "..." : "Sim"}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs px-2 h-7 rounded-lg font-semibold"
                          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                        >
                          Não
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmId(a.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-white/25 mt-2">{fmtDate(a.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Avaliação Física Viewer ───────────────────────────────────────
interface AvalFisica {
  id: string;
  data_avaliacao: string;
  peso: number | null;
  massa_muscular_kg: number | null;
  percentual_gordura: number | null;
  massa_gordura_kg: number | null;
  imc: number | null;
  taxa_metabolica_basal: number | null;
  gordura_visceral: number | null;
  pontuacao_inbody: number | null;
  dinamometria_dorsal: number | null;
  dinamometria_escapular: number | null;
  dinamometria_manual: number | null;
  dinamometria_manual_esq: number | null;
  dinamometria_manual_dir: number | null;
  medida_biceps_dir: number | null;
  medida_biceps_esq: number | null;
  medida_peitoral: number | null;
  medida_cintura: number | null;
  medida_quadril: number | null;
  medida_coxa_dir: number | null;
  medida_coxa_esq: number | null;
  medida_panturrilha_dir: number | null;
  medida_panturrilha_esq: number | null;
  medidas_extras: Record<string, number> | null;
  foto_url: string | null;
  observacoes: string | null;
  created_at: string;
}

const AVAL_FISICA_BUCKET = "evolution-photos";

// Medidas de perimetria padrão exibidas por padrão pra todo aluno — braço,
// coxa e panturrilha são bilaterais (direito/esquerdo); peitoral, cintura e
// quadril são medida única (circunferência de volta inteira).
const MEDIDAS_PADRAO = [
  ["medida_biceps_dir",       "Bíceps Direito"],
  ["medida_biceps_esq",       "Bíceps Esquerdo"],
  ["medida_peitoral",         "Tórax / Peitoral"],
  ["medida_cintura",          "Cintura / Abdômen"],
  ["medida_quadril",          "Quadril (Glúteo)"],
  ["medida_coxa_dir",         "Coxa Direita"],
  ["medida_coxa_esq",         "Coxa Esquerda"],
  ["medida_panturrilha_dir",  "Panturrilha Direita"],
  ["medida_panturrilha_esq",  "Panturrilha Esquerda"],
] as const;

const emptyAvalForm = () => ({
  data_avaliacao:          format(new Date(), "yyyy-MM-dd"),
  peso:                    "",
  massa_muscular_kg:       "",
  percentual_gordura:      "",
  massa_gordura_kg:        "",
  imc:                     "",
  taxa_metabolica_basal:   "",
  gordura_visceral:        "",
  pontuacao_inbody:        "",
  dinamometria_dorsal:     "",
  dinamometria_escapular:  "",
  dinamometria_manual_esq: "",
  dinamometria_manual_dir: "",
  medida_biceps_dir:       "",
  medida_biceps_esq:       "",
  medida_peitoral:         "",
  medida_cintura:          "",
  medida_quadril:          "",
  medida_coxa_dir:         "",
  medida_coxa_esq:         "",
  medida_panturrilha_dir:  "",
  medida_panturrilha_esq:  "",
  observacoes:             "",
});

const AvalFisicaViewer = ({
  alunoId,
  orgId,
  studentUserId,
}: {
  alunoId: string;
  orgId: string | null;
  studentUserId: string;
}) => {
  const { toast }   = useToast();
  const [items,     setItems]     = useState<AvalFisica[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [form,      setForm]      = useState(emptyAvalForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editingExistingFotoUrl, setEditingExistingFotoUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId,  setConfirmId]  = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [extras, setExtras] = useState<{ nome: string; valor: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [alunoId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("avaliacoes_fisicas")
        .select("*")
        .eq("aluno_id", alunoId)
        .order("data_avaliacao", { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as any);
    } catch (err: any) {
      toast({ title: "Erro ao carregar avaliações", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleEdit = (item: AvalFisica) => {
    setForm({
      data_avaliacao:          item.data_avaliacao,
      peso:                    item.peso?.toString() ?? "",
      massa_muscular_kg:       item.massa_muscular_kg?.toString() ?? "",
      percentual_gordura:      item.percentual_gordura?.toString() ?? "",
      massa_gordura_kg:        item.massa_gordura_kg?.toString() ?? "",
      imc:                     item.imc?.toString() ?? "",
      taxa_metabolica_basal:   item.taxa_metabolica_basal?.toString() ?? "",
      gordura_visceral:        item.gordura_visceral?.toString() ?? "",
      pontuacao_inbody:        item.pontuacao_inbody?.toString() ?? "",
      dinamometria_dorsal:     item.dinamometria_dorsal?.toString() ?? "",
      dinamometria_escapular:  item.dinamometria_escapular?.toString() ?? "",
      dinamometria_manual_esq: item.dinamometria_manual_esq?.toString() ?? "",
      dinamometria_manual_dir: item.dinamometria_manual_dir?.toString() ?? "",
      medida_biceps_dir:       item.medida_biceps_dir?.toString() ?? "",
      medida_biceps_esq:       item.medida_biceps_esq?.toString() ?? "",
      medida_peitoral:         item.medida_peitoral?.toString() ?? "",
      medida_cintura:          item.medida_cintura?.toString() ?? "",
      medida_quadril:          item.medida_quadril?.toString() ?? "",
      medida_coxa_dir:         item.medida_coxa_dir?.toString() ?? "",
      medida_coxa_esq:         item.medida_coxa_esq?.toString() ?? "",
      medida_panturrilha_dir:  item.medida_panturrilha_dir?.toString() ?? "",
      medida_panturrilha_esq:  item.medida_panturrilha_esq?.toString() ?? "",
      observacoes:             item.observacoes ?? "",
    });
    setExtras(Object.entries(item.medidas_extras ?? {}).map(([nome, valor]) => ({ nome, valor: String(valor) })));
    setEditingId(item.id);
    setEditingExistingFotoUrl(item.foto_url);
    setPhotoFile(null);
    setPhotoPreview(item.foto_url);
    setShowForm(true);
    setExpandedId(null);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const numOrNull = (v: string) => v.trim() === "" ? null : Number(v);

      let foto_url: string | null = editingId ? editingExistingFotoUrl : null;

      if (photoFile) {
        const ext  = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${orgId}/${studentUserId}/aval-fisica_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(AVAL_FISICA_BUCKET)
          .upload(path, photoFile, { upsert: false });
        if (upErr) throw upErr;
        foto_url = supabase.storage.from(AVAL_FISICA_BUCKET).getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        data_avaliacao:          form.data_avaliacao,
        peso:                    numOrNull(form.peso),
        massa_muscular_kg:       numOrNull(form.massa_muscular_kg),
        percentual_gordura:      numOrNull(form.percentual_gordura),
        massa_gordura_kg:        numOrNull(form.massa_gordura_kg),
        imc:                     numOrNull(form.imc),
        taxa_metabolica_basal:   numOrNull(form.taxa_metabolica_basal),
        gordura_visceral:        numOrNull(form.gordura_visceral),
        pontuacao_inbody:        numOrNull(form.pontuacao_inbody),
        dinamometria_dorsal:     numOrNull(form.dinamometria_dorsal),
        dinamometria_escapular:  numOrNull(form.dinamometria_escapular),
        dinamometria_manual_esq: numOrNull(form.dinamometria_manual_esq),
        dinamometria_manual_dir: numOrNull(form.dinamometria_manual_dir),
        medida_biceps_dir:       numOrNull(form.medida_biceps_dir),
        medida_biceps_esq:       numOrNull(form.medida_biceps_esq),
        medida_peitoral:         numOrNull(form.medida_peitoral),
        medida_cintura:          numOrNull(form.medida_cintura),
        medida_quadril:          numOrNull(form.medida_quadril),
        medida_coxa_dir:         numOrNull(form.medida_coxa_dir),
        medida_coxa_esq:         numOrNull(form.medida_coxa_esq),
        medida_panturrilha_dir:  numOrNull(form.medida_panturrilha_dir),
        medida_panturrilha_esq:  numOrNull(form.medida_panturrilha_esq),
        medidas_extras: extras.length > 0
          ? Object.fromEntries(extras.filter((e) => e.nome.trim() && e.valor.trim()).map((e) => [e.nome.trim(), Number(e.valor)]))
          : null,
        foto_url,
        observacoes:             form.observacoes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from("avaliacoes_fisicas").update(payload).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Avaliação atualizada!" });
      } else {
        const { error } = await supabase.from("avaliacoes_fisicas").insert({ org_id: orgId, aluno_id: alunoId, ...payload });
        if (error) throw error;
        toast({ title: "Avaliação registrada!" });
      }

      setForm(emptyAvalForm());
      setExtras([]);
      setPhotoFile(null);
      setPhotoPreview(null);
      setEditingId(null);
      setEditingExistingFotoUrl(null);
      setShowForm(false);
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: AvalFisica) => {
    setDeletingId(item.id);
    try {
      if (item.foto_url) {
        const url  = new URL(item.foto_url);
        const path = url.pathname.split(`/${AVAL_FISICA_BUCKET}/`)[1];
        if (path) await supabase.storage.from(AVAL_FISICA_BUCKET).remove([path]);
      }
      const { error } = await supabase.from("avaliacoes_fisicas").delete().eq("id", item.id);
      if (error) throw error;
      setItems((prev) => prev.filter((a) => a.id !== item.id));
      setConfirmId(null);
      if (expandedId === item.id) setExpandedId(null);
      toast({ title: "Avaliação excluída." });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally { setDeletingId(null); }
  };

  const inp  = "w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-600/40 transition-colors";
  const lbl  = "text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block";
  const fmtN = (v: number | null, unit = "") => v != null ? `${v}${unit}` : "—";

  // Preview ao vivo, refletindo o que já foi digitado no formulário (sem
  // salvar) — sem comparação com anterior, é só o valor atual.
  const parseF = (v: string): number | null => v.trim() === "" ? null : Number(v);
  const liveMeasurements: BodyMeasurements = {
    biceps_dir:       { value: parseF(form.medida_biceps_dir),      previous: null },
    biceps_esq:       { value: parseF(form.medida_biceps_esq),      previous: null },
    peitoral:         { value: parseF(form.medida_peitoral),        previous: null },
    cintura:          { value: parseF(form.medida_cintura),         previous: null },
    quadril:          { value: parseF(form.medida_quadril),         previous: null },
    coxa_dir:         { value: parseF(form.medida_coxa_dir),        previous: null },
    coxa_esq:         { value: parseF(form.medida_coxa_esq),        previous: null },
    panturrilha_dir:  { value: parseF(form.medida_panturrilha_dir), previous: null },
    panturrilha_esq:  { value: parseF(form.medida_panturrilha_esq), previous: null },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Avaliações Físicas</p>
        <button
          onClick={() => {
            if (showForm) {
              setForm(emptyAvalForm()); setExtras([]); setPhotoFile(null); setPhotoPreview(null);
              setEditingId(null); setEditingExistingFotoUrl(null);
            }
            setShowForm((v) => !v);
          }}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
          style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
        >
          <Plus className="w-3.5 h-3.5" />{showForm ? "Cancelar" : "Nova avaliação"}
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-6 lg:items-start">
        <div className="space-y-4">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">{editingId ? "Editar Avaliação Física" : "Nova Avaliação Física"}</p>

          {/* Data */}
          <div>
            <label className={lbl}>Data da avaliação *</label>
            <input type="date" value={form.data_avaliacao} onChange={(e) => setForm((f) => ({ ...f, data_avaliacao: e.target.value }))} className={inp} />
          </div>

          {/* Composição corporal */}
          <div>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2 font-semibold">Composição Corporal</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["peso",               "Peso (kg)",           "0.1"],
                ["massa_muscular_kg",  "Massa Muscular (kg)", "0.1"],
                ["percentual_gordura", "% Gordura",           "0.1"],
                ["massa_gordura_kg",   "Massa Gorda (kg)",    "0.1"],
                ["imc",                "IMC",                 "0.1"],
              ] as const).map(([field, label, step]) => (
                <div key={field}>
                  <label className={lbl}>{label}</label>
                  <input
                    type="number" step={step} min="0"
                    value={(form as any)[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className={inp}
                  />
                </div>
              ))}
            </div>
          </div>



          {/* Medidas Corporais (Perimetria) */}
          <div>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2 font-semibold">Medidas Corporais (cm)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MEDIDAS_PADRAO.map(([field, label]) => (
                <div key={field}>
                  <label className={lbl}>{label}</label>
                  <input
                    type="number" step="0.1" min="0"
                    value={(form as any)[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className={inp}
                  />
                </div>
              ))}
            </div>

            {/* Medidas extras (livres) */}
            {extras.length > 0 && (
              <div className="space-y-2 mt-3">
                {extras.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={ex.nome}
                      onChange={(e) => setExtras((prev) => prev.map((p, pi) => pi === i ? { ...p, nome: e.target.value } : p))}
                      placeholder="Nome da medida (ex: Pescoço)"
                      className={inp + " flex-1"}
                    />
                    <input
                      type="number" step="0.1" min="0"
                      value={ex.valor}
                      onChange={(e) => setExtras((prev) => prev.map((p, pi) => pi === i ? { ...p, valor: e.target.value } : p))}
                      placeholder="cm"
                      className={inp + " w-20"}
                    />
                    <button type="button" onClick={() => setExtras((prev) => prev.filter((_, pi) => pi !== i))}
                      className="w-9 h-10 flex items-center justify-center rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setExtras((prev) => [...prev, { nome: "", valor: "" }])}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-colors mt-3"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar outra medida
            </button>
          </div>

          {/* Dinamometria */}
          <div>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2 font-semibold">Dinamometria</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["dinamometria_dorsal",     "Dorsal"],
                ["dinamometria_escapular",  "Escapular"],
                ["dinamometria_manual_esq", "Manual Esquerdo"],
                ["dinamometria_manual_dir", "Manual Direito"],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className={lbl}>{label}</label>
                  <input
                    type="number" min="0"
                    value={(form as any)[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className={inp}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Foto */}
          <div>
            <label className={lbl}>Foto do resultado <span className="normal-case text-white/20">(opcional)</span></label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 cursor-pointer transition-colors hover:border-white/30 py-6"
              style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="" className="max-h-48 rounded-lg object-contain" />
              ) : (
                <>
                  <Camera className="w-6 h-6 text-white/20" />
                  <span className="text-xs text-white/30">Clique para selecionar</span>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </div>

          {/* Observações */}
          <div>
            <label className={lbl}>Observações <span className="normal-case text-white/20">(opcional)</span></label>
            <textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
              placeholder="Observações sobre a avaliação..."
              className={inp + " h-auto py-2.5 resize-none"}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !form.data_avaliacao}
            className="h-10 px-5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-40"
            style={{ background: "var(--cp-gradient)" }}
          >
            {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingId ? "Salvar alterações" : "Salvar avaliação"}
          </button>
        </div>

        {/* Prévia ao vivo — atualiza conforme digita, antes de salvar. Só desktop,
            e só aparece quando já tem alguma medida preenchida. */}
        {hasAnyMeasurement(liveMeasurements) && (
          <div className="hidden lg:block lg:sticky lg:top-4">
            <div className="rounded-2xl p-4" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
              <p className="text-[11px] text-white/35 uppercase tracking-wider mb-2 text-center">Prévia</p>
              <BodyMeasurementsList measurements={liveMeasurements} compact />
            </div>
          </div>
        )}
        </div>
        </div>
      )}

      {/* Histórico */}
      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-white/25">
          <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl py-12 text-center" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
          <BarChart2 className="w-8 h-8 text-white/10 mx-auto mb-2" />
          <p className="text-white/30 text-sm">Nenhuma avaliação física registrada ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isOpen = expandedId === item.id;
            const dateLabel = format(parseISO(item.data_avaliacao), "dd 'de' MMMM yyyy", { locale: ptBR });
            return (
              <div key={item.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
                {/* Card header */}
                <div className="flex items-center">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : item.id)}
                    className="flex-1 flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/80">{dateLabel}</p>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {item.peso            != null && <span className="text-xs text-white/40">{item.peso} kg</span>}
                        {item.percentual_gordura != null && <span className="text-xs text-white/40">{item.percentual_gordura}% gord.</span>}
                        {item.massa_muscular_kg  != null && <span className="text-xs text-white/40">{item.massa_muscular_kg} kg musc.</span>}
                        {item.imc               != null && <span className="text-xs text-white/40">IMC {item.imc}</span>}
                      </div>
                    </div>
                    {isOpen
                      ? <ChevronUp   className="w-4 h-4 text-white/30 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
                  </button>
                  {/* Edit & Delete */}
                  <div className="flex items-center gap-1 pr-3">
                    {confirmId === item.id ? (
                      <>
                        <span className="text-xs text-white/40 mr-1">Excluir?</span>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="text-xs px-2 h-7 rounded-lg font-semibold"
                          style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
                        >
                          {deletingId === item.id ? "..." : "Sim"}
                        </button>
                        <button onClick={() => setConfirmId(null)} className="text-xs px-2 h-7 rounded-lg font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>Não</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleEdit(item)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/6" style={{ color: "rgba(255,255,255,0.2)" }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmId(item.id)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/6" style={{ color: "rgba(255,255,255,0.2)" }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t px-4 py-4 space-y-5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    {/* Foto */}
                    {item.foto_url && (
                      <div>
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-2">Foto do resultado</p>
                        <a href={item.foto_url} target="_blank" rel="noreferrer">
                          <img src={item.foto_url} alt="" className="max-h-64 rounded-xl object-contain border border-white/8 hover:opacity-90 transition-opacity" />
                        </a>
                      </div>
                    )}

                    {/* Métricas */}
                    <div>
                      <p className="text-[11px] text-white/35 uppercase tracking-wider mb-3">Composição corporal</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {([
                          ["Peso",          fmtN(item.peso,              " kg")],
                          ["Massa Muscular",fmtN(item.massa_muscular_kg, " kg")],
                          ["% Gordura",     fmtN(item.percentual_gordura,"%")],
                          ["Massa Gorda",   fmtN(item.massa_gordura_kg,  " kg")],
                          ["IMC",           fmtN(item.imc)],
                        ] as [string, string][]).filter(([, v]) => v !== "—").map(([l, v]) => (
                          <div key={l} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                            <p className="text-[10px] text-white/35 uppercase tracking-wider">{l}</p>
                            <p className="text-sm font-bold text-white/80 mt-0.5">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Medidas corporais */}
                    {(MEDIDAS_PADRAO.some(([f]) => (item as any)[f] != null) || (item.medidas_extras && Object.keys(item.medidas_extras).length > 0)) && (
                      <div>
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-3">Medidas corporais</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {MEDIDAS_PADRAO.filter(([f]) => (item as any)[f] != null).map(([f, l]) => (
                            <div key={f} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                              <p className="text-[10px] text-white/35 uppercase tracking-wider">{l}</p>
                              <p className="text-sm font-bold text-white/80 mt-0.5">{fmtN((item as any)[f], " cm")}</p>
                            </div>
                          ))}
                          {Object.entries(item.medidas_extras ?? {}).map(([nome, valor]) => (
                            <div key={nome} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                              <p className="text-[10px] text-white/35 uppercase tracking-wider">{nome}</p>
                              <p className="text-sm font-bold text-white/80 mt-0.5">{valor} cm</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dinamometria */}
                    {(item.dinamometria_dorsal != null || item.dinamometria_escapular != null || item.dinamometria_manual_esq != null || item.dinamometria_manual_dir != null || item.dinamometria_manual != null) && (
                      <div>
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-3">Dinamometria</p>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            ["Dorsal",           item.dinamometria_dorsal],
                            ["Escapular",        item.dinamometria_escapular],
                            ["Manual Esquerdo",  item.dinamometria_manual_esq ?? item.dinamometria_manual],
                            ["Manual Direito",   item.dinamometria_manual_dir],
                          ] as [string, number | null][]).filter(([, v]) => v != null).map(([l, v]) => (
                            <div key={l} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                              <p className="text-[10px] text-white/35 uppercase tracking-wider">{l}</p>
                              <p className="text-sm font-bold text-white/80 mt-0.5">{fmtN(v)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Observações */}
                    {item.observacoes && (
                      <div>
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5">Observações</p>
                        <p className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap">{item.observacoes}</p>
                      </div>
                    )}
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

export default StudentDetails;
