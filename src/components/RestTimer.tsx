/**
 * RestTimer — standalone countdown widget.
 * Used as a fallback / legacy component.
 * The full-featured bottom-sheet version is inline in TreinoHoje.tsx.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";

interface RestTimerProps {
  restSeconds: number;
}

const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

export const RestTimer = ({ restSeconds }: RestTimerProps) => {
  const [remaining, setRemaining] = useState(restSeconds);
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef    = useRef<AudioContext | null>(null);

  const playBeep = useCallback(() => {
    try {
      if (!audioRef.current)
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine"; gain.gain.value = 0.3;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch { /* not supported */ }
  }, []);

  const vibrate = useCallback(() => {
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemaining(restSeconds);
    setRunning(false);
    setDone(false);
  }, [restSeconds]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            setDone(true);
            playBeep();
            vibrate();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, playBeep, vibrate]);

  const handleToggle = () => {
    try { audioRef.current?.resume?.(); } catch { /* ignore */ }
    if (done || remaining === 0) {
      setRemaining(restSeconds);
      setDone(false);
      setRunning(true);
    } else {
      setRunning((v) => !v);
    }
  };

  const progress = restSeconds > 0 ? remaining / restSeconds : 0;

  return (
    <div
      className="rounded-2xl border border-white/8 p-4 flex flex-col items-center gap-3"
      style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-center gap-1.5">
        <Timer className="w-3.5 h-3.5 text-green-500" />
        <p className="text-xs text-white/40 uppercase tracking-wider">Descanso</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${(1 - progress) * 100}%`,
            backgroundColor: done ? "var(--cp-500)" : "hsl(var(--primary))",
          }}
        />
      </div>

      <p
        className="text-3xl font-bold tabular-nums"
        style={{ color: done ? "var(--cp-500)" : "#fff" }}
      >
        {done ? "Pronto!" : fmt(remaining)}
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleToggle}
          className="h-9 px-4 rounded-xl text-sm font-semibold flex items-center gap-1.5"
          style={{ background: "var(--cp-gradient)" }}
        >
          {running ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white" />}
          <span className="text-white">{running ? "Pausar" : done ? "Reiniciar" : "Iniciar"}</span>
        </button>
        <button
          onClick={() => { setRunning(false); setRemaining(restSeconds); setDone(false); }}
          className="h-9 px-3 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
        >
          <RotateCcw className="w-3.5 h-3.5 text-white/50" />
        </button>
      </div>
    </div>
  );
};
