import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import {
  AlertCircle, Camera, ChevronLeft, ChevronRight, X, RotateCcw, Check,
  Loader2, CheckCircle2, Calendar, ZoomIn, Info, Timer, Download,
} from "lucide-react";

// ─── Test definitions ─────────────────────────────────────────────────────────

interface TesteSlide {
  key: string;
  label: string;
  photoLabels: string[];          // one entry per photo
  instructions: string[];
  emoji: string;                  // placeholder until real ref images
  imagens?: (string | null)[];    // URL própria da org (upload do treinador) — sobrepõe o fallback estático
  videoUrl?: string | null;       // vídeo de demonstração do teste, se o treinador enviou
}

// Não há mais fallback hardcoded aqui — o protocolo "padrão" (frontal, costas,
// perfil...) vive só em coach/PosturalEvalBuilder.tsx (DEFAULT_TESTES) e só
// chega no aluno se o treinador escolher "usar modelo padrão" lá e salvar,
// virando dado real em avaliacao_postural_config.testes.
// TOTAL_PHOTOS agora é calculado dinamicamente no componente

const BUCKET = "evolution-photos";

// Fotos saíam no tamanho nativo da câmera (podendo passar de 3000px de lado,
// vários MB cada) — só a qualidade JPEG (0.88) era comprimida, nunca a
// resolução. Primeira tentativa (1080px/0.85) cortou detalhe fino demais
// (texto pequeno ficava ilegível, testado ao vivo) — resolução baixa mata
// detalhe de alta frequência (bordas de letra) mais que a qualidade JPEG.
// 1600px/0.92 preserva bem mais nitidez e ainda corta drasticamente o peso
// comparado ao tamanho nativo da câmera (13 fotos por avaliação).
const PHOTO_MAX_DIM = 1600;
const PHOTO_QUALITY = 0.92;

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "intro" | "testing" | "review" | "uploading" | "done" | "history";

// Cada seção vem do construtor do treinador (PosturalEvalBuilder.tsx). Corpo
// com mais de 1 linha renderiza como lista; linha única vira parágrafo.
interface IntroSecaoView {
  id: string;
  titulo: string;
  corpo: string;
  destaque: boolean;
}

interface HistoryEval {
  id: string;
  created_at: string;
  observacoes: string | null;
  fotos: { test_key: string; photo_index: number; url: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Chaves dos testes padrão (espelham PosturalEvalBuilder.tsx DEFAULT_TESTES) —
// só elas têm foto estática bundled em public/postural/*.png. Um teste custom
// (chave aleatória) nunca vai ter fallback estático, então nem vale tentar
// carregar/mostrar a caixa de referência se também não tiver upload próprio.
const HAS_STATIC_REF = new Set([
  "frontal", "costas", "perfil", "perfil_ombros", "unipodal",
  "agachamento_perfil", "agachamento_costas", "ajoelhado",
  "flexao_quadril", "sentar_alcancar", "flexao_coluna",
]);

const captureKey = (testKey: string, photoIndex: number) => `${testKey}_${photoIndex}`;

// Mesmo regex/padrão do VideoModal e ExerciseLibrary — vídeo é sempre URL (YouTube),
// nunca upload de arquivo.
const youtubeEmbedUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([^&?/\s]+)/)?.[1];
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
};

const brazilToday = () => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

// ─── RefImage ─────────────────────────────────────────────────────────────────
// overrideUrl (upload do próprio treinador) tem prioridade; sem ele, tenta
// /postural/{key}_{photoIndex}.jpg → /postural/{key}.jpg → emoji fallback

const RefImage = ({
  testKey,
  photoIndex = 0,
  emoji,
  small,
  contain,
  overrideUrl,
}: {
  testKey: string;
  photoIndex?: number;
  emoji: string;
  small?: boolean;
  contain?: boolean;
  overrideUrl?: string | null;
}) => {
  const srcs = [
    `/postural/${testKey}_${photoIndex}.jpg`,
    `/postural/${testKey}_${photoIndex}.png`,
    `/postural/${testKey}.jpg`,
    `/postural/${testKey}.png`,
  ];
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [testKey, photoIndex]);

  if (overrideUrl) {
    return (
      <img
        key={overrideUrl}
        src={overrideUrl}
        alt=""
        className={contain ? "w-full h-full object-contain" : "w-full h-full object-cover"}
      />
    );
  }

  if (idx >= srcs.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 bg-white/3 w-full h-full">
        <Camera className={small ? "w-6 h-6 text-white/15" : "w-10 h-10 text-white/10"} />
        {!small && <p className="text-[10px] text-white/20 text-center px-2">Foto de referência</p>}
      </div>
    );
  }
  return (
    <img
      key={srcs[idx]}
      src={srcs[idx]}
      alt=""
      className={contain ? "w-full h-full object-contain" : "w-full h-full object-cover"}
      onError={() => setIdx((i) => i + 1)}
    />
  );
};

// ─── CameraOverlay ────────────────────────────────────────────────────────────

interface CameraOverlayProps {
  teste: TesteSlide;
  photoIndex: number;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

const CameraOverlay = ({ teste, photoIndex, onCapture, onClose }: CameraOverlayProps) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [preview,       setPreview]       = useState<string | null>(null);
  const [facingMode,    setFacingMode]    = useState<"user" | "environment">("environment");
  const [aligned,       setAligned]       = useState(false);
  const [miniOpen,      setMiniOpen]      = useState(true);
  const [camBlocked,    setCamBlocked]    = useState(false);
  const [camRequesting, setCamRequesting] = useState(false);

  // ── Timer state ────────────────────────────────────────────────
  const [timerDuration,   setTimerDuration]   = useState(10);
  const [timerCountdown,  setTimerCountdown]  = useState<number | null>(null);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [timerFlash,      setTimerFlash]      = useState(false);
  const captureRef = useRef<() => void>(() => {});

  // Start/stop camera
  const startCam = useCallback(async (facing: "user" | "environment") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCamBlocked(false);
    setCamRequesting(true);
    try {
      // Sem width/height, o WebKit escolhia uma resolução padrão bem modesta
      // pra câmera (provavelmente bem abaixo de PHOTO_MAX_DIM) — o downscale
      // em capture() nunca tinha o que fazer, porque a imagem já chegava
      // pequena da própria câmera. "ideal" pede a maior resolução que a
      // câmera suportar, sem travar se ela não existir exatamente.
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width:  { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
    } catch (err: any) {
      const isBlocked = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      if (isBlocked) setCamBlocked(true);
    } finally {
      setCamRequesting(false);
    }
  }, []);

  useEffect(() => {
    startCam(facingMode);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Device orientation for tilt guide
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const g = e.gamma ?? 0; // -90 to 90; 0 = phone perfectly level left/right
      setAligned(Math.abs(g) < 10);
    };

    const requestPerm = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
        try { await (DeviceOrientationEvent as any).requestPermission(); } catch {}
      }
      window.addEventListener("deviceorientation", handler);
    };
    requestPerm();
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  const flip = async () => {
    const next: "user" | "environment" = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    setPreview(null);
    await startCam(next);
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v   = videoRef.current;
    const c   = canvasRef.current;
    const ctx = c.getContext("2d")!;

    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return;

    // iOS Safari bug: ctx.drawImage(video) with active transforms can silently produce
    // a blank or untransformed frame. Workaround: capture raw pixels to a temp canvas
    // first (no transforms), then rotate the temp canvas onto the output canvas.
    const tmp = document.createElement("canvas");
    tmp.width  = vw;
    tmp.height = vh;
    const tmpCtx = tmp.getContext("2d")!;
    tmpCtx.drawImage(v, 0, 0);

    // iOS Safari delivers landscape pixels (e.g. 1920×1280) even when phone is portrait.
    // The live preview uses CSS object-cover which auto-crops the center strip to portrait.
    // Capture must replicate that same center crop — never rotate.
    const dispW = window.innerWidth;
    const dispH = window.innerHeight;
    const targetAspect = dispW / dispH; // portrait phone ~0.558
    const frameAspect  = vw / vh;

    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (frameAspect > targetAspect) {
      // Frame wider than screen — crop sides (typical iOS landscape→portrait case)
      sw = Math.round(vh * targetAspect);
      sx = Math.round((vw - sw) / 2);
    } else if (frameAspect < targetAspect) {
      // Frame taller than screen — crop top/bottom
      sh = Math.round(vw / targetAspect);
      sy = Math.round((vh - sh) / 2);
    }
    sw = Math.min(sw, vw); sh = Math.min(sh, vh);
    sx = Math.max(0, Math.min(sx, vw - sw));
    sy = Math.max(0, Math.min(sy, vh - sh));

    // Downscale pro tamanho final direto no draw (evita um segundo encode) —
    // câmera nativa entrega bem mais que isso, não precisa desse tanto de pixel.
    let outW = sw, outH = sh;
    if (Math.max(sw, sh) > PHOTO_MAX_DIM) {
      const scale = PHOTO_MAX_DIM / Math.max(sw, sh);
      outW = Math.round(sw * scale);
      outH = Math.round(sh * scale);
    }
    c.width  = outW;
    c.height = outH;
    ctx.drawImage(tmp, sx, sy, sw, sh, 0, 0, outW, outH);

    const url = c.toDataURL("image/jpeg", PHOTO_QUALITY);
    setPreview(url);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  // Mantém captureRef apontando para a versão mais recente de capture
  captureRef.current = capture;

  // Efeito de contagem regressiva — decrementa 1s por vez
  useEffect(() => {
    if (timerCountdown === null) return;
    if (timerCountdown === 0) {
      // Tenta disparar a captura programaticamente
      const v = videoRef.current;
      if (v && v.videoWidth > 0 && v.videoHeight > 0) {
        captureRef.current();
      } else {
        // Fallback visual: flash branco sinalizando o momento
        setTimerFlash(true);
        setTimeout(() => setTimerFlash(false), 400);
      }
      setTimerCountdown(null);
      return;
    }
    const id = setTimeout(() => setTimerCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [timerCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const TIMER_OPTIONS = [3, 5, 10, 15, 20, 30] as const;

  const startTimer = () => {
    setShowTimerPicker(false);
    setTimerCountdown(timerDuration);
  };

  const cancelTimer = () => {
    setTimerCountdown(null);
    setShowTimerPicker(false);
  };

  const retake = () => {
    setPreview(null);
    startCam(facingMode);
  };

  const confirm = () => {
    if (preview) onCapture(preview);
  };

  const photoLabel = teste.photoLabels[photoIndex];
  const slideTitle = photoLabel ? `${teste.label} — ${photoLabel}` : teste.label;

  return (
    <div className="fixed inset-0 z-[200] bg-black">

      {/* Video / preview — true fullscreen background */}
      {!preview ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}


      <canvas ref={canvasRef} className="hidden" />

      {/* ── Timer countdown overlay ── */}
      {timerCountdown !== null && timerCountdown > 0 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 160,
              height: 160,
              backgroundColor: "rgba(0,0,0,0.55)",
              border: "3px solid hsl(var(--foreground) / 0.75)",
            }}
          >
            <span className="text-7xl font-bold text-white leading-none">{timerCountdown}</span>
          </div>
        </div>
      )}

      {/* ── Flash visual no 0 (fallback) ── */}
      {timerFlash && (
        <div className="absolute inset-0 z-30 pointer-events-none" style={{ backgroundColor: "hsl(var(--foreground) / 0.85)" }} />
      )}

      {/* Camera blocked overlay */}
      {camBlocked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-8 text-center bg-black">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "hsl(var(--foreground) / 0.08)" }}>
            <Camera className="w-8 h-8 text-white/40" />
          </div>
          <div>
            <p className="text-white font-semibold text-base mb-2">Acesso à câmera bloqueado</p>
            <p className="text-white/50 text-sm leading-relaxed">
              Para habilitar, acesse as <span className="text-white/80 font-medium">Configurações</span> do seu
              celular → <span className="text-white/80 font-medium">Safari</span> → <span className="text-white/80 font-medium">Câmera</span> → selecione <span className="text-white/80 font-medium">Permitir</span>.
            </p>
            <p className="text-white/30 text-xs mt-3">
              No iPhone, você também pode tocar em "aA" na barra de endereços do Safari e selecionar "Configurações do site".
            </p>
          </div>
          <button
            onClick={() => startCam(facingMode)}
            disabled={camRequesting}
            className="h-11 px-6 rounded-2xl text-sm font-semibold text-white transition-colors"
            style={{ background: "var(--cp-gradient)" }}>
            {camRequesting ? "Solicitando acesso..." : "Tentar novamente"}
          </button>
        </div>
      )}

      {/* ── Floating top bar — pt-12 fixo (48px) era só uma estimativa pra
          limpar a status bar, sem usar o safe-area real (Dynamic Island é
          mais alto que isso em alguns modelos). Troca por um respiro
          pequeno + o safe-area de verdade. */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pb-3"
        style={{
          paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
        }}>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <X className="w-5 h-5 text-white" />
        </button>
        <p className="text-sm font-semibold text-white text-center flex-1 mx-3 truncate drop-shadow">{slideTitle}</p>
        <div className="w-9" />
      </div>

      {/* ── Camera controls (live) ── */}
      {!preview && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* Horizontal alignment guide */}
          <div className="absolute left-0 right-0 h-0.5 transition-colors duration-300"
            style={{
              top: "50%",
              backgroundColor: aligned ? "rgba(74,222,128,0.85)" : "hsl(var(--foreground) / 0.55)",
              boxShadow: aligned ? "0 0 8px rgba(74,222,128,0.5)" : "none",
            }}
          />
          {/* Alignment status */}
          <div className="absolute bottom-40 left-0 right-0 flex justify-center pointer-events-none">
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{
                backgroundColor: aligned ? "rgba(74,222,128,0.2)" : "rgba(0,0,0,0.5)",
                color: aligned ? "#4ade80" : "hsl(var(--foreground) / 0.5)",
                border: `1px solid ${aligned ? "rgba(74,222,128,0.3)" : "hsl(var(--foreground) / 0.1)"}`,
              }}>
              {aligned ? "✓ Câmera nivelada" : "Nivele a câmera"}
            </span>
          </div>

          {/* Mini reference — top-right (só se tiver foto de verdade pra mostrar) */}
          {miniOpen && (teste.imagens?.[photoIndex] || HAS_STATIC_REF.has(teste.key)) && (
            <div className="absolute top-20 right-3 pointer-events-auto">
              <div className="rounded-xl overflow-hidden bg-black"
                style={{ width: 72, border: "1.5px solid hsl(var(--foreground) / 0.25)" }}>
                <RefImage testKey={teste.key} photoIndex={photoIndex} emoji={teste.emoji} small contain overrideUrl={teste.imagens?.[photoIndex]} />
              </div>
              <button onClick={() => setMiniOpen(false)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                <X className="w-3 h-3 text-white/60" />
              </button>
            </div>
          )}
          {!miniOpen && (teste.imagens?.[photoIndex] || HAS_STATIC_REF.has(teste.key)) && (
            <button onClick={() => setMiniOpen(true)}
              className="absolute top-20 right-3 w-9 h-9 rounded-xl flex items-center justify-center pointer-events-auto"
              style={{ backgroundColor: "rgba(0,0,0,0.6)", border: "1px solid hsl(var(--foreground) / 0.15)" }}>
              <Info className="w-4 h-4 text-white/60" />
            </button>
          )}
        </div>
      )}

      {/* ── Floating bottom controls ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
          paddingBottom: "max(40px, env(safe-area-inset-bottom, 0px) + 24px)",
        }}>

        {/* Timer picker — visível apenas quando aberto e câmera ativa */}
        {showTimerPicker && timerCountdown === null && !preview && (
          <div className="flex flex-col items-center gap-3 px-5 pt-4 pb-2">
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "hsl(var(--foreground) / 0.45)" }}>
              Selecionar tempo
            </p>
            <div className="flex gap-2 flex-nowrap justify-center">
              {TIMER_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTimerDuration(s)}
                  className="px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: timerDuration === s ? "hsl(var(--foreground) / 0.9)" : "hsl(var(--foreground) / 0.1)",
                    color:           timerDuration === s ? "#000" : "hsl(var(--foreground) / 0.65)",
                    border:          `1px solid ${timerDuration === s ? "transparent" : "hsl(var(--foreground) / 0.15)"}`,
                  }}
                >
                  {s}s
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={startTimer}
              className="h-10 px-8 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--cp-gradient)" }}
            >
              Iniciar Timer
            </button>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center justify-center gap-10 pt-6">
          {!preview ? (
            <>
              {/* Botão de timer — adicional, não substitui nem altera o botão de captura */}
              <button
                type="button"
                onClick={() => timerCountdown !== null ? cancelTimer() : setShowTimerPicker((v) => !v)}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: timerCountdown !== null
                      ? "rgba(220,60,60,0.3)"
                      : showTimerPicker
                        ? "hsl(var(--foreground) / 0.2)"
                        : "rgba(0,0,0,0.5)",
                    border: timerCountdown !== null
                      ? "1px solid rgba(220,60,60,0.7)"
                      : "1px solid hsl(var(--foreground) / 0.2)",
                  }}
                >
                  {timerCountdown !== null ? (
                    <span className="text-base font-bold text-white leading-none">{timerCountdown}</span>
                  ) : (
                    <Timer style={{ width: 18, height: 18, color: "hsl(var(--foreground) / 0.7)" }} />
                  )}
                </div>
                <span className="text-[10px]" style={{ color: "hsl(var(--foreground) / 0.4)" }}>
                  {timerCountdown !== null ? "Cancelar" : `${timerDuration}s`}
                </span>
              </button>

              {/* Botão de captura original — sem alteração */}
              <button onClick={capture}
                className="flex items-center justify-center rounded-full border-4 border-white"
                style={{ width: 80, height: 80 }}>
                <div className="w-[62px] h-[62px] rounded-full bg-white" />
              </button>

              {/* Virar câmera — ao lado do botão de captura (antes ficava no
                  topo, perto demais do "x" e da miniatura de referência) */}
              <button onClick={flip} className="flex flex-col items-center gap-1">
                <div className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.5)", border: "1px solid hsl(var(--foreground) / 0.2)" }}>
                  <RotateCcw style={{ width: 18, height: 18, color: "hsl(var(--foreground) / 0.7)" }} />
                </div>
                <span className="text-[10px]" style={{ color: "hsl(var(--foreground) / 0.4)" }}>Virar</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={retake}
                className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors">
                <div className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.5)", border: "1px solid hsl(var(--foreground) / 0.2)" }}>
                  <RotateCcw className="w-5 h-5" />
                </div>
                <span className="text-[11px]">Repetir</span>
              </button>
              <button onClick={confirm} className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "var(--cp-gradient)" }}>
                  <Check className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] text-white/70">Usar foto</span>
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const AvaliacaoPostural = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const { hasAvaliacaoPostural } = usePlanFeatures();

  // Feature reservada por org — bloqueia acesso direto por URL se a org não tiver.
  useEffect(() => {
    if (orgId && !hasAvaliacaoPostural) navigate(`/${slug}/aluno`);
  }, [orgId, hasAvaliacaoPostural, slug, navigate]);

  // Config dinâmica (carregada do banco). Começa vazia — só usa TESTES_DEFAULT
  // se a própria org escolher "usar modelo padrão" no builder do treinador;
  // se a org nunca configurou nada, o aluno vê um estado "não configurado"
  // em vez de herdar silenciosamente um protocolo que o treinador nunca escolheu.
  const [testes,       setTestes]       = useState<TesteSlide[]>([]);
  const [secoes,       setSecoes]       = useState<IntroSecaoView[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Derivado (total de fotos dos testes ativos)
  const totalPhotos = testes.reduce((sum, t) => sum + t.photoLabels.length, 0);

  const [phase,       setPhase]       = useState<Phase>("intro");
  const [slideIndex,  setSlideIndex]  = useState(0);
  const [photoIndex,  setPhotoIndex]  = useState(0);
  const [captures,    setCaptures]    = useState<Record<string, string>>({}); // key→dataURL
  const [cameraOpen,  setCameraOpen]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadProg,  setUploadProg]  = useState(0);
  const [evalId,      setEvalId]      = useState<string | null>(null);
  const [studentId,        setStudentId]        = useState<string | null>(null);
  const [alunoId,          setAlunoId]          = useState<string | null>(null);
  const [treinadorId,      setTreinadorId]      = useState<string | null>(null);
  const [alunoNome,        setAlunoNome]        = useState<string | null>(null);
  const [avaliacaoPendente, setAvaliacaoPendente] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [history,     setHistory]     = useState<HistoryEval[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [viewPhoto,   setViewPhoto]   = useState<string | null>(null);
  const [galleryTargetPi, setGalleryTargetPi] = useState<number | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const currentTeste = testes[slideIndex];

  // Reset scroll + instructions panel when moving to a different test or entering testing phase
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setShowInstructions(false);
  }, [slideIndex, phase]);

  // ── Auth / load ────────────────────────────────────────────────

  // Auth + aluno — roda uma vez no mount (comportamento original preservado)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setStudentId(session.user.id);
      const [alunoRes, profileRes] = await Promise.all([
        supabase.from("alunos").select("id, avaliacao_postural_pendente, treinador_id").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("profiles").select("nome").eq("id", session.user.id).maybeSingle(),
      ]);
      const a = alunoRes.data;
      if (a?.id) {
        setAlunoId(a.id);
        setAvaliacaoPendente(!!a.avaliacao_postural_pendente);
        if (a.treinador_id) setTreinadorId(a.treinador_id);
      }
      if (profileRes.data?.nome) setAlunoNome(profileRes.data.nome);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Config da avaliação — roda quando orgId fica disponível (TenantContext async)
  const configLoadedRef = useRef(false);
  useEffect(() => {
    if (!orgId || configLoadedRef.current) return;
    configLoadedRef.current = true;
    (async () => {
      const { data: cfg } = await (supabase as any)
        .from("avaliacao_postural_config")
        .select("introducao_secoes, testes")
        .eq("org_id", orgId)
        .maybeSingle();
      if (cfg?.introducao_secoes && Array.isArray(cfg.introducao_secoes) && cfg.introducao_secoes.length > 0) {
        setSecoes(cfg.introducao_secoes.map((s: any): IntroSecaoView => ({
          id:       s.id ?? crypto.randomUUID(),
          titulo:   s.titulo ?? "",
          corpo:    s.corpo  ?? "",
          destaque: !!s.destaque,
        })));
      }
      if (cfg?.testes && Array.isArray(cfg.testes) && cfg.testes.length > 0) {
        setTestes(cfg.testes.map((t: any): TesteSlide => ({
          key:          t.id          ?? t.key ?? crypto.randomUUID(),
          label:        t.label       ?? "",
          emoji:        t.emoji       ?? "",
          photoLabels:  t.photoLabels ?? [""],
          instructions: t.instrucoes  ?? [],
          imagens:      t.imagens     ?? [],
          videoUrl:     t.videoUrl    ?? null,
        })));
      }
      setConfigLoaded(true);
    })();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation helpers ─────────────────────────────────────────

  const capturedForCurrent = currentTeste?.photoLabels
    .map((_, pi) => captures[captureKey(currentTeste.key, pi)])
    .filter(Boolean) ?? [];

  const allCapturedForSlide = capturedForCurrent.length === (currentTeste?.photoLabels.length ?? 0);

  const totalCaptured = Object.keys(captures).length;

  const handleCapture = (dataUrl: string) => {
    const key = captureKey(currentTeste.key, photoIndex);
    setCaptures((prev) => ({ ...prev, [key]: dataUrl }));
    setCameraOpen(false);
    // Auto-advance photo index if more photos needed for this test
    const nextPi = photoIndex + 1;
    if (nextPi < currentTeste.photoLabels.length) {
      setPhotoIndex(nextPi);
    }
  };

  const nextSlide = () => {
    if (slideIndex < testes.length - 1) {
      setSlideIndex((i) => i + 1);
      setPhotoIndex(0);
    } else {
      setPhase("review");
    }
  };

  const prevSlide = () => {
    if (slideIndex > 0) {
      setSlideIndex((i) => i - 1);
      setPhotoIndex(0);
    } else {
      setPhase("intro");
    }
  };

  // Alternativa à câmera ao vivo — escolher uma foto já existente do celular
  // (galeria/arquivos). Útil quando a foto já foi tirada antes (ex: numa
  // tentativa de envio anterior que falhou) e não faz sentido tirar de novo.
  const openGalleryFor = (pi: number) => {
    setGalleryTargetPi(pi);
    galleryInputRef.current?.click();
  };

  const handleGalleryChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file || galleryTargetPi == null) return;
    const pi = galleryTargetPi;
    const reader = new FileReader();
    reader.onload = () => {
      // Foto da galeria vem sem nenhum tratamento (podia ser 12MP+ do rolo
      // de câmera do aparelho) — redimensiona igual à captura ao vivo, pro
      // peso final não depender de qual caminho o aluno escolheu.
      const img = new Image();
      img.onload = () => {
        let outW = img.naturalWidth, outH = img.naturalHeight;
        if (Math.max(outW, outH) > PHOTO_MAX_DIM) {
          const scale = PHOTO_MAX_DIM / Math.max(outW, outH);
          outW = Math.round(outW * scale);
          outH = Math.round(outH * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width  = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, outW, outH);
        const url = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
        const key = captureKey(currentTeste.key, pi);
        setCaptures((prev) => ({ ...prev, [key]: url }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    setGalleryTargetPi(null);
  };

  const openCameraFor = (pi: number) => {
    setPhotoIndex(pi);
    setCameraOpen(true);
  };

  // ── Upload ─────────────────────────────────────────────────────

  const uploadAll = async () => {
    if (!studentId || !orgId) return;
    setPhase("uploading");
    setUploading(true);
    setUploadProg(0);
    try {
      // Renova a sessão antes de qualquer escrita — o fluxo tem várias fotos
      // com pausas reais entre elas (trocar de app pra câmera, interrupções),
      // tempo suficiente pro token de acesso precisar de renovação. Sem isso,
      // um token vencido no meio do processo derruba o insert com erro de RLS
      // (a política já é `student_user_id = auth.uid()`, mas isso só vale se
      // o `auth.uid()` da requisição for reconhecido).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sua sessão expirou. Toque em \"Confirmar e enviar avaliação\" novamente para tentar de novo.");
      }

      // 1. Create evaluation record
      const today = brazilToday();
      const { data: evalRow, error: evalErr } = await supabase
        .from("avaliacoes_posturais")
        .insert({ student_user_id: studentId, aluno_id: alunoId, org_id: orgId, status: "pendente", created_at: new Date().toISOString() })
        .select("id").single();
      if (evalErr) throw evalErr;
      const eid = evalRow.id as string;
      setEvalId(eid);

      // 2. Upload each photo
      const entries = Object.entries(captures);
      for (let i = 0; i < entries.length; i++) {
        const [key, dataUrl] = entries[i];
        const [testKey, piStr] = key.split("_").reduce<[string, string]>((acc, part, idx) => {
          // Split on last underscore: testKey may contain underscores
          return idx === key.split("_").length - 1 ? [acc[0], part] : [`${acc[0]}${acc[0] ? "_" : ""}${part}`, acc[1]];
        }, ["", ""]);
        const pi = parseInt(piStr) || 0;
        const path = `postural/${orgId}/${studentId}/${eid}/${testKey}_${pi}.jpg`;

        // Convert dataURL to Blob
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        // blob.type reflete o mime real do dataURL — importante agora que a foto
        // pode vir da galeria (nem sempre jpeg, ex: PNG ou HEIC de iPhone),
        // não só da câmera ao vivo (sempre jpeg via canvas.toDataURL).
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
        if (upErr) throw upErr;

        // Insert foto record
        await supabase.from("avaliacao_fotos").insert({ avaliacao_id: eid, test_key: testKey, photo_index: pi, storage_path: path });

        setUploadProg(Math.round(((i + 1) / entries.length) * 100));
      }

      // 3. Mark evaluation complete
      await supabase.from("avaliacoes_posturais").update({ status: "concluida" }).eq("id", eid);

      // 4. Clear pending flag on aluno record
      if (alunoId) {
        await supabase.from("alunos").update({ avaliacao_postural_pendente: false }).eq("id", alunoId);
        setAvaliacaoPendente(false);
      }

      // 5. Notify coach (best-effort)
      if (treinadorId && orgId) {
        void (async () => {
          try {
            await supabase.from("notificacoes").insert({
              user_id:    treinadorId,
              org_id:     orgId,
              aluno_id:   alunoId,
              aluno_nome: alunoNome,
              titulo:     "Avaliação postural concluída",
              mensagem:   `${alunoNome ?? "Um aluno"} concluiu a avaliação postural. Acesse o perfil para visualizar.`,
              tipo:       "avaliacao",
            });
          } catch { /* silencioso */ }
        })();
      }

      setPhase("done");
    } catch (err: any) {
      const isSessionIssue = /row-level security|jwt|session/i.test(err.message ?? "");
      toast({
        title: "Erro ao enviar fotos",
        description: isSessionIssue
          ? "Sua sessão pode ter expirado. Toque em \"Confirmar e enviar avaliação\" novamente — as fotos continuam salvas."
          : err.message,
        variant: "destructive",
      });
      setPhase("review");
    } finally {
      setUploading(false);
    }
  };

  // ── History ────────────────────────────────────────────────────

  const loadHistory = async () => {
    if (!studentId) return;
    setHistLoading(true);
    try {
      const { data: evals } = await supabase
        .from("avaliacoes_posturais")
        .select("id, created_at, observacoes")
        .eq("student_user_id", studentId)
        .eq("status", "concluida")
        .order("created_at", { ascending: false });

      const rows: HistoryEval[] = [];
      for (const ev of evals ?? []) {
        const { data: fotos } = await supabase.from("avaliacao_fotos").select("test_key, photo_index, storage_path").eq("avaliacao_id", ev.id).order("test_key");
        const fotosWithUrl = await Promise.all(
          (fotos ?? []).map(async (f: any) => {
            const { data: u } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 3600);
            return { test_key: f.test_key, photo_index: f.photo_index, url: u?.signedUrl ?? "" };
          })
        );
        rows.push({ id: ev.id, created_at: ev.created_at, observacoes: ev.observacoes, fotos: fotosWithUrl });
      }
      setHistory(rows);
    } catch {}
    finally { setHistLoading(false); }
  };

  const goHistory = () => { setPhase("history"); loadHistory(); };

  // ── Reset ──────────────────────────────────────────────────────

  const restart = () => {
    setCaptures({});
    setSlideIndex(0);
    setPhotoIndex(0);
    setEvalId(null);
    setPhase("intro");
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}
      className="w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-white/80 transition-colors shrink-0 bg-white/5">
      <ChevronLeft className="w-5 h-5" />
    </button>
  );

  // ── Fullscreen photo viewer ──────────────────────────────────
  const PhotoViewer = viewPhoto ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black"
      onClick={() => setViewPhoto(null)}>
      <img src={viewPhoto} alt="" className="max-w-full max-h-full object-contain" />
      <button className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/70 text-white"
        style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
        onClick={() => setViewPhoto(null)}>
        <X className="w-5 h-5" />
      </button>
    </div>
  ) : null;

  // ── Camera overlay ──────────────────────────────────────────
  const CameraEl = cameraOpen && currentTeste ? (
    <CameraOverlay
      teste={currentTeste}
      photoIndex={photoIndex}
      onCapture={handleCapture}
      onClose={() => setCameraOpen(false)}
    />
  ) : null;

  // ── Config ainda carregando ───────────────────────────────────
  if (!configLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  // ── Treinador ainda não configurou nenhum teste ──────────────
  if (testes.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <BackBtn onClick={() => navigate(`/${slug}/aluno`)} />
          <h1 className="text-lg font-bold text-white">Avaliação Postural e Funcional</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3 pb-24">
          <div className="w-14 h-14 rounded-2xl bg-white/4 flex items-center justify-center border border-white/8">
            <AlertCircle className="w-6 h-6 text-white/35" />
          </div>
          <p className="text-white/60 text-sm">Avaliação postural ainda não configurada</p>
          <p className="text-white/35 text-xs max-w-xs">Seu treinador ainda não configurou os testes dessa avaliação. Fale com ele se tiver dúvidas.</p>
        </div>
      </div>
    );
  }

  // ── INTRO ───────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <>
        {PhotoViewer}
        <div className="min-h-screen pb-24">
          <div className="flex items-center gap-3 px-4 pt-5 pb-4">
            <BackBtn onClick={() => navigate(`/${slug}/aluno/perfil`)} />
            <div>
              <h1 className="text-lg font-bold text-white">Avaliação Postural e Funcional</h1>
              <p className="text-xs text-white/40">{testes.length} testes • {totalPhotos} fotos</p>
            </div>
          </div>

          <div className="px-4 space-y-4">
            {/* Pending banner */}
            {avaliacaoPendente && (
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", border: "1px solid rgba(var(--cp-rgb),0.25)" }}>
                <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--cp-300)" }}>
                  Seu treinador solicitou esta avaliação. Realize os testes e envie as fotos.
                </p>
              </div>
            )}

            {/* Instruções — uma seção do construtor do treinador = um card aqui */}
            {secoes.map((s) => {
              const linhas = s.corpo.split("\n").map((l) => l.trim()).filter(Boolean);
              const isLista = linhas.length > 1;
              return (
                <div key={s.id} className="rounded-2xl p-4"
                  style={s.destaque
                    ? { backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }
                    : { backgroundColor: "hsl(var(--foreground) / 0.03)", border: "1px solid hsl(var(--foreground) / 0.08)" }}>
                  {s.titulo && (
                    <p className={s.destaque
                      ? "text-xs text-yellow-400/90 font-semibold mb-1.5"
                      : "text-[10px] text-white/40 uppercase tracking-wider mb-2.5 font-semibold"}>
                      {s.titulo}
                    </p>
                  )}
                  {linhas.map((linha, i) => (
                    <p key={i}
                      className={`text-xs leading-relaxed ${isLista ? "mb-1.5 last:mb-0" : ""} ${s.destaque ? "text-yellow-400/80" : "text-white/65"}`}>
                      {isLista ? `• ${linha}` : linha}
                    </p>
                  ))}
                </div>
              );
            })}

            {/* Test overview pills */}
            <div className="rounded-2xl p-4 bg-white/3 border border-white/8">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3 font-semibold">Testes do protocolo</p>
              <div className="flex flex-wrap gap-1.5">
                {testes.map((t, i) => (
                  <span key={t.key} className="text-[11px] px-2 py-1 rounded-lg text-white/50 bg-white/5">
                    {i + 1}. {t.label}
                  </span>
                ))}
              </div>
            </div>

            {/* History shortcut */}
            <button onClick={goHistory}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-colors bg-white/3 border border-white/8">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white/30" />
                <span className="text-sm text-white/60">Ver avaliações anteriores</span>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20" />
            </button>

            {/* Start button */}
            <button
              onClick={() => setPhase("testing")}
              className="w-full h-12 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 mt-2"
              style={{ background: "var(--cp-gradient)" }}>
              <Camera className="w-5 h-5" />
              Iniciar Avaliação
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── TESTING ─────────────────────────────────────────────────
  if (phase === "testing") {
    const teste = currentTeste;
    const progress = ((slideIndex) / testes.length) * 100;
    return (
      <>
        {CameraEl}
        {PhotoViewer}
        <div className="min-h-screen pb-44">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-5 pb-3 sticky top-0 z-10"
            style={{ backgroundColor: "rgba(9,9,11,0.95)", backdropFilter: "blur(12px)" }}>
            <BackBtn onClick={prevSlide} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-white/40">Teste {slideIndex + 1} de {testes.length}</p>
                <p className="text-xs text-white/40">{totalCaptured}/{totalPhotos} fotos</p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-white/8">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: "var(--cp-gradient)" }} />
              </div>
            </div>
          </div>

          <div className="px-4 space-y-4">
            {/* Test title */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
                style={{ background: "var(--cp-gradient)" }}>
                {slideIndex + 1}
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">{teste.label}</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  {teste.photoLabels.length === 1 ? "1 foto" : `${teste.photoLabels.length} fotos`}
                </p>
              </div>
            </div>

            {/* Reference image — full, uncropped, height-capped. Só mostra a caixa
                se existir foto de verdade (upload da org ou uma das padrão) —
                teste custom sem upload não tem nada pra exibir aqui. */}
            {(teste.imagens?.[photoIndex] || HAS_STATIC_REF.has(teste.key)) && (
              <div className="rounded-2xl overflow-hidden bg-black" style={{ height: 320 }}>
                <RefImage testKey={teste.key} photoIndex={photoIndex} emoji={teste.emoji} contain overrideUrl={teste.imagens?.[photoIndex]} />
              </div>
            )}

            {/* Vídeo de demonstração — só se o treinador cadastrou um pra este teste */}
            {youtubeEmbedUrl(teste.videoUrl) && (
              <div className="rounded-2xl overflow-hidden bg-black aspect-video">
                <iframe
                  className="w-full h-full"
                  src={youtubeEmbedUrl(teste.videoUrl)!}
                  title={`Vídeo de demonstração — ${teste.label}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {/* Instructions toggle */}
            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/3 border border-white/8">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-white/30" />
                <span className="text-sm text-white/60">Como executar</span>
              </div>
              <ChevronRight
                className="w-4 h-4 text-white/30 transition-transform duration-200"
                style={{ transform: showInstructions ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            </button>
            {showInstructions && (
              <div className="rounded-2xl p-4 space-y-2 bg-white/3 border border-white/8 -mt-2">
                {teste.instructions.map((inst, i) => (
                  <p key={i} className="text-sm text-white/70 leading-relaxed flex items-start gap-2">
                    <span className="text-white/25 shrink-0 mt-0.5">{i + 1}.</span>
                    {inst}
                  </p>
                ))}
              </div>
            )}

            {/* Photo capture slots */}
            <div className="space-y-2">
              {teste.photoLabels.map((label, pi) => {
                const key = captureKey(teste.key, pi);
                const url = captures[key];
                return (
                  <div key={pi}
                    className={`rounded-2xl overflow-hidden flex items-center gap-3 p-3 ${url ? "border" : "bg-white/3 border border-white/8"}`}
                    style={url ? { backgroundColor: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)" } : undefined}>
                    {/* Thumbnail or placeholder */}
                    <div className="w-16 h-20 rounded-xl overflow-hidden shrink-0 relative bg-white/5">
                      {url ? (
                        <>
                          <img src={url} alt="" className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setViewPhoto(url)} />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/30">
                            <ZoomIn className="w-4 h-4 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white/20" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/80">
                        {label || `Foto ${pi + 1}`}
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {url ? "Capturada ✓" : "Aguardando foto"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {url && (
                        <button
                          onClick={() => openCameraFor(pi)}
                          title="Tirar outra foto"
                          className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/8 text-white/50">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openGalleryFor(pi)}
                        title="Escolher da galeria"
                        className="flex items-center justify-center rounded-xl bg-white/8 text-white/50"
                        style={{ height: 42, width: 42 }}>
                        <Download style={{ width: 18, height: 18 }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input escondido reaproveitado por todos os slots — qual foto
                recebe o arquivo é decidido por galleryTargetPi */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleGalleryChange}
              className="hidden"
            />
          </div>

          {/* Bottom navigation — sits above the 64px student nav bar. bottom
              fixo em 64px não bastava: a nav real soma env(safe-area-inset-
              bottom) à própria altura (home indicator do iPhone), então esse
              bloco ficava parcialmente atrás dela no app nativo — mesma
              causa já corrigida em StudentLayout.tsx. */}
          <div className="fixed left-0 right-0 px-4 pt-4 pb-4"
            style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))", backgroundColor: "rgba(9,9,11,0.95)", backdropFilter: "blur(12px)", borderTop: "1px solid hsl(var(--foreground) / 0.06)" }}>
            <div className="flex gap-3">
              {slideIndex > 0 && (
                <button onClick={prevSlide}
                  className="h-12 px-5 rounded-2xl text-sm font-medium text-white/50 transition-colors bg-white/8">
                  Anterior
                </button>
              )}
              <button
                onClick={allCapturedForSlide ? nextSlide : () => openCameraFor(capturedForCurrent.length)}
                className={`h-12 flex-1 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all ${!allCapturedForSlide ? "bg-white/10" : ""}`}
                style={allCapturedForSlide ? { background: "var(--cp-gradient)" } : undefined}>
                {allCapturedForSlide ? (
                  <>
                    {slideIndex < testes.length - 1 ? (
                      <><ChevronRight className="w-4 h-4" />Próximo teste</>
                    ) : (
                      <><Check className="w-4 h-4" />Revisar e enviar</>
                    )}
                  </>
                ) : (
                  <><Camera className="w-4 h-4" />Tirar foto {capturedForCurrent.length + 1}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── REVIEW ──────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <>
        {PhotoViewer}
        <div className="min-h-screen pb-28">
          <div className="flex items-center gap-3 px-4 pt-5 pb-4">
            <BackBtn onClick={() => setPhase("testing")} />
            <div>
              <h1 className="text-lg font-bold text-white">Revisão Final</h1>
              <p className="text-xs text-white/40">{totalCaptured} fotos capturadas — revise antes de enviar</p>
            </div>
          </div>

          <div className="px-4 space-y-4">
            {testes.map((teste, si) => {
              const hasFotos = teste.photoLabels.some((_, pi) => captures[captureKey(teste.key, pi)]);
              return (
                <div key={teste.key} className="rounded-2xl overflow-hidden border"
                  style={{ backgroundColor: "var(--surface-1)", borderColor: hasFotos ? "rgba(74,222,128,0.15)" : "rgba(255,100,100,0.2)" }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                    <span className="text-[11px] font-bold text-white/30">{si + 1}</span>
                    <p className="text-sm font-medium text-white/80 flex-1">{teste.label}</p>
                    {hasFotos
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      : <span className="text-[10px] text-red-400">Sem foto</span>}
                  </div>
                  <div className="flex gap-2 p-3">
                    {teste.photoLabels.map((label, pi) => {
                      const url = captures[captureKey(teste.key, pi)];
                      return (
                        <div key={pi} className="flex-1">
                          <div className="rounded-xl overflow-hidden aspect-[3/4] relative"
                            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
                            {url ? (
                              <img src={url} alt="" className="w-full h-full object-cover cursor-pointer"
                                onClick={() => setViewPhoto(url)} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Camera className="w-5 h-5 text-white/15" />
                              </div>
                            )}
                          </div>
                          {label && <p className="text-[10px] text-white/30 text-center mt-1">{label}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom actions — pb-8 fixo não cobre o home indicator do iPhone
              no app nativo (mesma causa do bloco "Tirar foto" acima), soma
              o safe-area real por cima do padding de sempre. */}
          <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 space-y-2"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))", backgroundColor: "rgba(9,9,11,0.97)", backdropFilter: "blur(12px)", borderTop: "1px solid hsl(var(--foreground) / 0.06)" }}>
            <button onClick={uploadAll}
              className="w-full h-12 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: "var(--cp-gradient)" }}>
              <Check className="w-5 h-5" />
              Confirmar e enviar avaliação
            </button>
            <button onClick={() => setPhase("testing")}
              className="w-full h-10 rounded-2xl text-sm font-medium text-white/40 transition-colors bg-white/4">
              Voltar e editar fotos
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── UPLOADING ────────────────────────────────────────────────
  if (phase === "uploading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "var(--cp-gradient)" }}>
          <Loader2 className="w-9 h-9 text-white animate-spin" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-bold text-white">Enviando avaliação...</p>
          <p className="text-sm text-white/50">{uploadProg}% concluído</p>
        </div>
        <div className="w-full max-w-xs h-2 rounded-full overflow-hidden bg-white/8">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${uploadProg}%`, background: "var(--cp-gradient)" }} />
        </div>
      </div>
    );
  }

  // ── DONE ────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="w-24 h-24 rounded-full flex items-center justify-center"
          style={{ background: "rgba(74,222,128,0.15)", border: "2px solid rgba(74,222,128,0.3)" }}>
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        <div className="space-y-2">
          <p className="text-2xl font-bold text-white">Avaliação enviada!</p>
          <p className="text-sm text-white/50">Todas as {totalCaptured} fotos foram enviadas com sucesso.<br />Seu treinador irá analisar em breve.</p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
          <button onClick={goHistory}
            className="h-12 rounded-2xl text-sm font-semibold text-white"
            style={{ background: "var(--cp-gradient)" }}>
            Ver histórico de avaliações
          </button>
          <button onClick={() => navigate(`/${slug}/aluno`)}
            className="h-10 rounded-2xl text-sm font-medium text-white/50 bg-white/5">
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // ── HISTORY ─────────────────────────────────────────────────
  return (
    <>
      {PhotoViewer}
      <div className="min-h-screen pb-24">
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <BackBtn onClick={() => setPhase("intro")} />
          <div>
            <h1 className="text-lg font-bold text-white">Histórico</h1>
            <p className="text-xs text-white/40">Avaliações posturais anteriores</p>
          </div>
        </div>

        {/* New evaluation CTA */}
        <div className="px-4 mb-4">
          <button onClick={restart}
            className="w-full h-11 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: "var(--cp-gradient)" }}>
            <Camera className="w-4 h-4" />
            Nova avaliação
          </button>
        </div>

        <div className="px-4 space-y-3">
          {histLoading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-white/30">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/8 py-12 text-center">
              <p className="text-white/25 text-sm">Nenhuma avaliação concluída</p>
            </div>
          ) : (
            history.map((ev) => {
              const date = new Date(ev.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
              const expanded = expandedId === ev.id;
              return (
                <div key={ev.id} className="rounded-2xl overflow-hidden bg-white/3 border border-white/8">
                  <button
                    onClick={() => setExpandedId(expanded ? null : ev.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-white/30 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-white/85">{date}</p>
                        <p className="text-xs text-white/35">{ev.fotos.length} fotos</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/25 shrink-0 transition-transform duration-200"
                      style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }} />
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                      {testes.map((teste) => {
                        const fotos = ev.fotos.filter((f) => f.test_key === teste.key);
                        if (fotos.length === 0) return null;
                        return (
                          <div key={teste.key} className="mb-4 last:mb-0">
                            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2 font-semibold">{teste.label}</p>
                            <div className="flex gap-2 flex-wrap">
                              {fotos.sort((a, b) => a.photo_index - b.photo_index).map((f) => (
                                <div key={f.photo_index}
                                  className="rounded-xl overflow-hidden cursor-pointer"
                                  style={{ width: 72, height: 96 }}
                                  onClick={() => setViewPhoto(f.url)}>
                                  <img src={f.url} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

export default AvaliacaoPostural;
