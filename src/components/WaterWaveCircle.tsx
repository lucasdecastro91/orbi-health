import { useId } from "react";

interface WaterWaveCircleProps {
  /** 0-100 */
  pct: number;
  size?: number;
  primaryLabel: string;
  secondaryLabel?: string;
}

/** Círculo com efeito de "líquido subindo" (onda animada) na cor primária do app. */
const WaterWaveCircle = ({ pct, size = 170, primaryLabel, secondaryLabel }: WaterWaveCircleProps) => {
  const uid = useId();
  const clipId = `wwc-clip-${uid}`;
  const glossId = `wwc-gloss-${uid}`;

  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const top = cy - r;
  const bottom = cy + r;
  const clamped = Math.max(0, Math.min(100, pct));
  const waterY = bottom - (clamped / 100) * (bottom - top);

  const period = r * 1.8;
  const amp = Math.max(5, r * 0.13);
  const deep = r * 2.4;
  // Segmentos de meio-período consistentes (M+Q dá o 1º meio-ciclo, cada T seguinte
  // reflete o controle anterior e também cobre meio-período) — se um segmento tivesse
  // largura diferente dos outros, o loop do translateX (que anda exatamente `period`)
  // ficaria costurado errado e apareceria uma "emenda" visível a cada repetição.
  const wavePath = (o: number) =>
    `M${-period},${o} Q${-period * 0.75},${o - amp} ${-period / 2},${o} T0,${o} T${period / 2},${o} T${period},${o} T${period * 1.5},${o} T${period * 2},${o} V${deep} H${-period} Z`;

  const bubbles = [cx - r * 0.35, cx, cx + r * 0.35];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${primaryLabel}${secondaryLabel ? `, ${secondaryLabel}` : ""}`}
    >
      <defs>
        <clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath>
        <radialGradient id={glossId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={r} fill="var(--surface-2)" />

      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(0, ${waterY})`} style={{ transition: "transform 400ms ease" }}>
          <g>
            <path d={wavePath(6)} fill="var(--cp-600)" opacity={0.7}>
              <animateTransform attributeName="transform" type="translate" values={`0 0;${period} 0`} dur="4.5s" repeatCount="indefinite" />
            </path>
          </g>
          <g>
            <path d={wavePath(0)} fill="var(--cp-500)">
              <animateTransform attributeName="transform" type="translate" values={`0 0;${-period} 0`} dur="3.4s" repeatCount="indefinite" />
            </path>
          </g>
          {bubbles.map((bx, i) => (
            <circle key={i} cx={bx} cy={deep - 10} r={2.5 + i} fill="rgba(255,255,255,0.55)">
              <animate attributeName="cy" values={`${deep - 10};-10`} dur={`${3.2 + i * 0.5}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.15;0.7;1" dur={`${3.2 + i * 0.5}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
        <ellipse
          cx={cx - r * 0.35}
          cy={cy - r * 0.45}
          rx={r * 0.4}
          ry={r * 0.24}
          fill={`url(#${glossId})`}
          opacity={0.55}
          transform={`rotate(-18 ${cx - r * 0.35} ${cy - r * 0.45})`}
        />
      </g>

      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={2} />
      <text x={cx} y={cy - size * 0.03} textAnchor="middle" fontSize={size * 0.13} fontWeight={600} fill="hsl(var(--foreground))">
        {primaryLabel}
      </text>
      {secondaryLabel && (
        <text x={cx} y={cy + size * 0.1} textAnchor="middle" fontSize={size * 0.065} fill="var(--text-mid)">
          {secondaryLabel}
        </text>
      )}
    </svg>
  );
};

export default WaterWaveCircle;
