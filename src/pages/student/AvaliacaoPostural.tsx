import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Camera, ChevronLeft, X, RotateCcw, Check,
  ZoomIn, Calendar, Trash2, Loader2,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────

const SLOTS = [
  { id: "front",      label: "Anterior",    icon: "🧍" },
  { id: "back",       label: "Posterior",   icon: "🚶" },
  { id: "side_right", label: "Lat. Direito", icon: "↗️" },
  { id: "side_left",  label: "Lat. Esquerdo", icon: "↙️" },
] as const;

type SlotId = typeof SLOTS[number]["id"];

const BUCKET = "evolution-photos";

const brazilToday = () => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

// ─── Types ────────────────────────────────────────────────────

interface PhotoRow {
  id: string;
  slot: SlotId;
  storage_path: string;
  taken_at: string;
  url?: string;
}

interface SessionGroup {
  taken_at: string;
  photos: Record<SlotId, PhotoRow | null>;
}

// ─── Component ────────────────────────────────────────────────

const AvaliacaoPostural = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();

  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [sessions, setSessions]   = useState<SessionGroup[]>([]);

  // Camera state
  const [cameraSlot, setCameraSlot]   = useState<SlotId | null>(null);
  const [facingMode, setFacingMode]   = useState<"user" | "environment">("environment");
  const [stream, setStream]           = useState<MediaStream | null>(null);
  const [capturing, setCapturing]     = useState(false);
  const [preview, setPreview]         = useState<string | null>(null); // data URL for confirmation
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fullscreen photo viewer
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const today = brazilToday();

  // ── Data loading ─────────────────────────────────────────────

  useEffect(() => {
    loadData();
  }, [orgId]);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setStudentId(session.user.id);

      const { data, error } = await supabase
        .from("evolution_photos")
        .select("id, slot, storage_path, taken_at")
        .eq("student_id", session.user.id)
        .in("slot", ["front", "back", "side_left", "side_right"])
        .order("taken_at", { ascending: false });

      if (error) throw error;

      // Get signed URLs
      const rows = await Promise.all(
        (data ?? []).map(async (r: any) => {
          const { data: u } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(r.storage_path, 3600);
          return { ...r, url: u?.signedUrl } as PhotoRow;
        })
      );

      // Group by date
      const map: Record<string, Record<SlotId, PhotoRow | null>> = {};
      for (const r of rows) {
        if (!map[r.taken_at]) {
          map[r.taken_at] = { front: null, back: null, side_left: null, side_right: null };
        }
        map[r.taken_at][r.slot as SlotId] = r;
      }
      setSessions(
        Object.entries(map)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([taken_at, photos]) => ({ taken_at, photos }))
      );
    } catch (err: any) {
      toast({ title: "Erro ao carregar fotos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Camera ───────────────────────────────────────────────────

  const openCamera = async (slot: SlotId) => {
    setCameraSlot(slot);
    setPreview(null);
    await startCamera();
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1920 }, aspectRatio: { ideal: 3 / 4 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
    } catch {
      toast({ title: "Câmera não disponível", description: "Verifique as permissões do navegador.", variant: "destructive" });
      setCameraSlot(null);
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const closeCamera = () => {
    stopCamera();
    setCameraSlot(null);
    setPreview(null);
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width  = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setPreview(c.toDataURL("image/jpeg", 0.9));
    stopCamera();
  };

  const retake = async () => {
    setPreview(null);
    await startCamera();
  };

  const flipCamera = async () => {
    stopCamera();
    const next: "user" | "environment" = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 1920 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
    } catch {}
  };

  const confirmPhoto = async () => {
    if (!preview || !cameraSlot || !studentId || !orgId) return;
    setCapturing(true);
    try {
      // Convert data URL to blob
      const res   = await fetch(preview);
      const blob  = await res.blob();
      const ext   = "jpg";
      const path  = `${orgId}/${studentId}/${today}_${cameraSlot}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      // Upsert DB record (one per student+slot+date)
      await supabase
        .from("evolution_photos")
        .upsert(
          { student_id: studentId, org_id: orgId, slot: cameraSlot, storage_path: path, taken_at: today },
          { onConflict: "student_id,org_id,slot,taken_at" }
        );

      toast({ title: "Foto salva!", description: `${SLOTS.find((s) => s.id === cameraSlot)?.label} registrada.` });
      closeCamera();
      loadData();
    } catch (err: any) {
      toast({ title: "Erro ao salvar foto", description: err.message, variant: "destructive" });
    } finally {
      setCapturing(false);
    }
  };

  const deletePhoto = async (photo: PhotoRow) => {
    try {
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
      await supabase.from("evolution_photos").delete().eq("id", photo.id);
      toast({ title: "Foto removida" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  };

  // ── Today's session ───────────────────────────────────────────

  const todaySession = sessions.find((s) => s.taken_at === today);

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      {/* ── Fullscreen photo viewer ── */}
      {viewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          onClick={() => setViewPhoto(null)}
        >
          <img src={viewPhoto} alt="" className="max-w-full max-h-full object-contain" />
          <button
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white"
            onClick={() => setViewPhoto(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ── Camera modal ── */}
      {cameraSlot && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <button onClick={closeCamera} className="text-white/70 hover:text-white p-1">
              <X className="w-6 h-6" />
            </button>
            <p className="text-sm font-semibold text-white">
              {SLOTS.find((s) => s.id === cameraSlot)?.label}
            </p>
            {!preview && (
              <button onClick={flipCamera} className="text-white/70 hover:text-white p-1">
                <RotateCcw className="w-5 h-5" />
              </button>
            )}
            {preview && <div className="w-8" />}
          </div>

          {/* Viewfinder */}
          <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
            {!preview ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Alignment guides */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Vertical center line */}
                  <div
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: "50%", backgroundColor: "rgba(255,255,255,0.4)" }}
                  />
                  {/* Horizontal head-height guide (25% from top) */}
                  <div
                    className="absolute left-0 right-0 h-px"
                    style={{ top: "20%", backgroundColor: "rgba(255,255,255,0.2)" }}
                  />
                  {/* Horizontal hip guide (60% from top) */}
                  <div
                    className="absolute left-0 right-0 h-px"
                    style={{ top: "65%", backgroundColor: "rgba(255,255,255,0.2)" }}
                  />
                  {/* Center label */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 text-[10px] text-white/50 font-medium"
                    style={{ top: "50%" }}
                  >
                    ┼
                  </div>
                </div>

                {/* Instruction */}
                <div
                  className="absolute bottom-28 left-0 right-0 flex justify-center"
                >
                  <span className="text-xs text-white/50 bg-black/40 px-3 py-1 rounded-full backdrop-blur">
                    Alinhe o corpo com a linha central
                  </span>
                </div>
              </>
            ) : (
              <img src={preview} alt="" className="w-full h-full object-cover" />
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Bottom controls */}
          <div className="shrink-0 pb-10 pt-5 flex items-center justify-center gap-8">
            {!preview ? (
              <button
                onClick={capture}
                className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center"
                style={{ width: 72, height: 72 }}
              >
                <div className="w-14 h-14 rounded-full bg-white" />
              </button>
            ) : (
              <>
                <button
                  onClick={retake}
                  className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-6 h-6" />
                  <span className="text-xs">Repetir</span>
                </button>
                <button
                  onClick={confirmPhoto}
                  disabled={capturing}
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "var(--cp-gradient)" }}
                >
                  {capturing
                    ? <Loader2 className="w-7 h-7 text-white animate-spin" />
                    : <Check className="w-7 h-7 text-white" />}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <div className="min-h-screen pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 md:px-6">
          <button
            onClick={() => navigate(`/${slug}/aluno/perfil`)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/40 hover:text-white/80 transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Avaliação Postural</h1>
            <p className="text-xs text-white/40">Fotos para acompanhamento posturalalternado</p>
          </div>
        </div>

        <div className="px-4 md:px-6 space-y-6">
          {/* ── Today's session ── */}
          <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white/40" />
                <p className="text-sm font-semibold text-white">Hoje — {new Date(today + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</p>
              </div>
              {todaySession && Object.values(todaySession.photos).filter(Boolean).length === 4 && (
                <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">Completo</span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-0 divide-x divide-white/6">
              {SLOTS.map((slot) => {
                const photo = todaySession?.photos[slot.id] ?? null;
                return (
                  <div key={slot.id} className="flex flex-col">
                    {/* Label */}
                    <div className="px-2 py-2 border-b border-white/6 text-center">
                      <p className="text-[10px] text-white/50 font-medium leading-tight">{slot.label}</p>
                    </div>
                    {/* Thumbnail or camera button */}
                    <div className="aspect-[3/4] relative overflow-hidden bg-black/20">
                      {photo?.url ? (
                        <>
                          <img
                            src={photo.url}
                            alt={slot.label}
                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setViewPhoto(photo.url!)}
                          />
                          <button
                            onClick={() => deletePhoto(photo)}
                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white/70 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => openCamera(slot.id)}
                            className="absolute bottom-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white/70 hover:text-white transition-colors"
                            title="Retirar foto"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => openCamera(slot.id)}
                          className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors"
                        >
                          <Camera className="w-5 h-5" />
                          <span className="text-[9px]">Tirar foto</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── History ── */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white/70">Histórico</h3>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-white/30">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : sessions.filter((s) => s.taken_at !== today).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/8 py-8 text-center">
                <p className="text-white/25 text-sm">Nenhum histórico anterior</p>
                <p className="text-white/15 text-xs mt-1">As sessões passadas aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.filter((s) => s.taken_at !== today).map((session) => {
                  const count = Object.values(session.photos).filter(Boolean).length;
                  return (
                    <div key={session.taken_at} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-white/6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-white/30" />
                          <p className="text-xs text-white/70 font-medium">
                            {new Date(session.taken_at + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                          </p>
                        </div>
                        <span className="text-[10px] text-white/35">{count}/4 fotos</span>
                      </div>

                      <div className="grid grid-cols-4 gap-0 divide-x divide-white/6">
                        {SLOTS.map((slot) => {
                          const photo = session.photos[slot.id];
                          return (
                            <div key={slot.id} className="aspect-[3/4] relative overflow-hidden bg-black/20">
                              {photo?.url ? (
                                <button
                                  onClick={() => setViewPhoto(photo.url!)}
                                  className="w-full h-full"
                                >
                                  <img src={photo.url} alt={slot.label} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                                  <div className="absolute inset-0 flex items-end justify-start p-1 opacity-0 hover:opacity-100 transition-opacity">
                                    <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow" />
                                  </div>
                                </button>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-[10px] text-white/15">—</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AvaliacaoPostural;
