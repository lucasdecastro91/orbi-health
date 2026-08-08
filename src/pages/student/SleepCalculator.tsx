import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenantContext } from "@/contexts/TenantContext";
import { ArrowLeft, Moon, Clock } from "lucide-react";

const CARD_BG     = "#141417";
const CARD_BG_2   = "#1b1c21";
const CARD_BORDER = "rgba(255,255,255,0.09)";
const CARD_SHADOW = "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)";

// ── Ciclo de sono médio ≈ 90min, tempo médio pra pegar no sono ≈ 15min ──────
const CYCLE_MIN       = 90;
const FALL_ASLEEP_MIN = 15;
const CYCLE_OPTIONS   = [6, 5, 4, 3] as const; // 9h, 7h30, 6h, 4h30 de sono

type Mode = "acordar" | "dormir";

interface Suggestion {
  cycles: number;
  hours: number;
  time: string;
}

const timeToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const suggestBedtimes = (wakeTime: string): Suggestion[] =>
  CYCLE_OPTIONS.map((cycles) => {
    const sleepMin = cycles * CYCLE_MIN;
    return {
      cycles,
      hours: sleepMin / 60,
      time: minutesToTime(timeToMinutes(wakeTime) - sleepMin - FALL_ASLEEP_MIN),
    };
  });

const suggestWakeTimes = (bedTime: string): Suggestion[] =>
  CYCLE_OPTIONS.map((cycles) => {
    const sleepMin = cycles * CYCLE_MIN;
    return {
      cycles,
      hours: sleepMin / 60,
      time: minutesToTime(timeToMinutes(bedTime) + FALL_ASLEEP_MIN + sleepMin),
    };
  });

const SleepCalculator = () => {
  const navigate = useNavigate();
  const { slug } = useTenantContext();

  const [mode, setMode] = useState<Mode>("acordar");
  const [inputTime, setInputTime] = useState("07:00");
  const [results, setResults] = useState<Suggestion[] | null>(null);

  const handleCalculate = () => {
    if (!inputTime) return;
    setResults(mode === "acordar" ? suggestBedtimes(inputTime) : suggestWakeTimes(inputTime));
  };

  return (
    <div className="min-h-screen pb-10">
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate(`/${slug}/aluno/perfil`)} className="w-8 h-8 flex items-center justify-center -ml-1">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <Moon className="w-5 h-5 shrink-0" style={{ color: "var(--cp-500)" }} />
        <h1 className="text-xl font-bold text-foreground">ORBI Sleep</h1>
      </div>

      <div className="px-4 space-y-5">

        {/* ── Modo: quero acordar às / vou dormir às ── */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: "var(--toggle-bg)" }}>
          {([
            { key: "acordar", label: "Quero acordar às" },
            { key: "dormir",  label: "Vou dormir às" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setResults(null); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: mode === key ? "var(--surface-1)" : "transparent",
                color: mode === key ? "hsl(35 92% 44%)" : "var(--ui-inactive-color)",
                border: mode === key ? "1px solid rgba(var(--cp-rgb),0.35)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Input de horário ── */}
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: `linear-gradient(135deg, ${CARD_BG}, ${CARD_BG_2})`, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}>
          <label className="block text-xs font-semibold text-muted-foreground">
            {mode === "acordar" ? "Horário que quer acordar" : "Horário que vai dormir"}
          </label>
          <div className="relative">
            <Clock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--cp-500)" }} />
            <input
              type="time"
              value={inputTime}
              onChange={(e) => setInputTime(e.target.value)}
              className="w-full h-12 rounded-xl pl-10 pr-3 text-base font-semibold text-center bg-white/5 border border-white/10 text-foreground transition-colors focus-visible:outline-none focus-visible:border-primary/40"
              style={{ boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }}
            />
          </div>
          <button
            onClick={handleCalculate}
            className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-[0.98]"
            style={{ background: "var(--cp-gradient)", boxShadow: "0 0 24px rgba(var(--cp-rgb), 0.28), 0 4px 12px rgba(var(--cp-rgb), 0.15)" }}
          >
            Calcular
          </button>
        </div>

        {/* ── Resultados ── */}
        {results && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}>
            <div className="px-5 py-3 border-b border-white/8">
              <p className="text-xs font-semibold text-muted-foreground">
                {mode === "acordar" ? "Melhores horários pra dormir" : "Melhores horários pra acordar"}
              </p>
            </div>
            {results.map((r, i) => {
              const ideal = r.cycles >= 5;
              return (
                <div key={r.time} className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: i === results.length - 1 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <p className="text-base font-bold" style={{ color: ideal ? "var(--cp-400)" : "var(--text-dim, rgba(255,255,255,0.4))" }}>
                      {r.time}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {r.cycles} ciclos · {r.hours}h de sono
                    </p>
                  </div>
                  {ideal && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-500)" }}>
                      Recomendado
                    </span>
                  )}
                </div>
              );
            })}
            <p className="px-5 py-3 text-[11px] text-muted-foreground" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              Considera ~15min pra pegar no sono e ciclos de ~90min. Acordar ao final de um
              ciclo (durante o sono leve) costuma dar mais disposição do que acordar no meio dele.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default SleepCalculator;
