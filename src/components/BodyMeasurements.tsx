// Lista de medidas de perimetria (com variação vs a avaliação anterior).
// Substituiu um boneco anatômico em SVG (avaliado e descartado em 2026-07-23
// por ficar com aparência amadora mesmo com sombreado/gradiente) — dado é o
// que importa aqui, não ilustração de corpo.
interface MeasurementValue {
  value: number | null;
  previous: number | null;
}

export interface BodyMeasurements {
  biceps_dir: MeasurementValue;
  biceps_esq: MeasurementValue;
  peitoral: MeasurementValue;
  cintura: MeasurementValue;
  quadril: MeasurementValue;
  coxa_dir: MeasurementValue;
  coxa_esq: MeasurementValue;
  panturrilha_dir: MeasurementValue;
  panturrilha_esq: MeasurementValue;
}

interface Props {
  measurements: BodyMeasurements;
  compact?: boolean;
}

const EMPTY: MeasurementValue = { value: null, previous: null };

const ROWS: { key: keyof BodyMeasurements; label: string; wide?: boolean }[] = [
  { key: "peitoral", label: "Peitoral", wide: true },
  { key: "cintura", label: "Cintura/Abdômen", wide: true },
  { key: "quadril", label: "Quadril", wide: true },
  { key: "biceps_dir", label: "Bíceps D" },
  { key: "biceps_esq", label: "Bíceps E" },
  { key: "coxa_dir", label: "Coxa D" },
  { key: "coxa_esq", label: "Coxa E" },
  { key: "panturrilha_dir", label: "Panturrilha D" },
  { key: "panturrilha_esq", label: "Panturrilha E" },
];

const delta = (m: MeasurementValue) => {
  if (m.value == null || m.previous == null) return null;
  const d = Math.round((m.value - m.previous) * 10) / 10;
  if (d === 0) return null;
  return d;
};

const BodyMeasurementsList = ({ measurements, compact = false }: Props) => {
  const filled = ROWS.filter((r) => measurements[r.key].value != null);

  if (filled.length === 0) {
    return <p className="text-xs text-muted-foreground opacity-50 text-center py-4">Nenhuma medida preenchida ainda</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {filled.map(({ key, label, wide }) => {
        const m = measurements[key];
        const d = delta(m);
        return (
          <div
            key={key}
            className={`rounded-xl bg-white/5 border border-white/8 px-3 ${compact ? "py-2" : "py-2.5"} ${wide ? "col-span-2" : ""}`}
          >
            <p className={`text-[10px] uppercase tracking-wider text-muted-foreground ${compact ? "mb-0.5" : "mb-1"}`}>{label}</p>
            <div className="flex items-baseline gap-1.5">
              <span className={`font-bold text-foreground ${compact ? "text-base" : "text-lg"}`}>{m.value}cm</span>
              {d != null && (
                <span className="text-[11px] text-muted-foreground opacity-70">{d > 0 ? "+" : ""}{d}cm</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface AvalFisicaRow {
  medida_biceps_dir?: number | null;
  medida_biceps_esq?: number | null;
  medida_peitoral?: number | null;
  medida_cintura?: number | null;
  medida_quadril?: number | null;
  medida_coxa_dir?: number | null;
  medida_coxa_esq?: number | null;
  medida_panturrilha_dir?: number | null;
  medida_panturrilha_esq?: number | null;
}

// Monta o objeto de medidas a partir da avaliação mais recente que tem pelo
// menos uma medida preenchida (`latest`) e a anterior a ela (`previous`, pra
// calcular a variação) — ambas vindas de `avaliacoes_fisicas`, ordenadas por
// data_avaliacao decrescente.
export const buildBodyMeasurements = (latest: AvalFisicaRow | null, previous: AvalFisicaRow | null): BodyMeasurements => {
  const pair = (key: keyof AvalFisicaRow): MeasurementValue => ({
    value: latest?.[key] ?? null,
    previous: previous?.[key] ?? null,
  });
  return {
    biceps_dir: pair("medida_biceps_dir"),
    biceps_esq: pair("medida_biceps_esq"),
    peitoral: pair("medida_peitoral"),
    cintura: pair("medida_cintura"),
    quadril: pair("medida_quadril"),
    coxa_dir: pair("medida_coxa_dir"),
    coxa_esq: pair("medida_coxa_esq"),
    panturrilha_dir: pair("medida_panturrilha_dir"),
    panturrilha_esq: pair("medida_panturrilha_esq"),
  };
};

export const EMPTY_BODY_MEASUREMENTS: BodyMeasurements = {
  biceps_dir: EMPTY, biceps_esq: EMPTY, peitoral: EMPTY, cintura: EMPTY, quadril: EMPTY,
  coxa_dir: EMPTY, coxa_esq: EMPTY, panturrilha_dir: EMPTY, panturrilha_esq: EMPTY,
};

export const hasAnyMeasurement = (m: BodyMeasurements) => Object.values(m).some((v) => v.value != null);

export default BodyMeasurementsList;
