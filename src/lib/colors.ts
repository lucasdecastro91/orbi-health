/**
 * Primary color palette for ORBI Pro.
 * Each entry includes all pre-computed variants needed by TenantContext
 * to set CSS custom properties, so the entire UI updates automatically.
 *
 * CSS variables set by TenantContext:
 *   --primary        : HSL string  "h s% l%"            (for Tailwind bg-primary / shadcn)
 *   --ring           : same HSL string                   (focus rings)
 *   --accent         : same HSL string
 *   --cp-gradient    : full gradient string
 *   --cp-rgb         : "r, g, b"                         (for rgba(var(--cp-rgb), 0.1))
 *   --cp-400         : hsl string – lighter text shade   (icons, active text)
 *   --cp-500         : hsl string – mid shade            (gradient start)
 *   --cp-600         : hsl string – base shade           (= hsl(var(--primary)))
 *   --cp-text        : "#ffffff" or "#000000"            (contrast color for text on solid bg)
 */

export interface ColorEntry {
  hex:      string;
  label:    string;
  /** Space-separated HSL for --primary: "h s% l%" */
  hsl:      string;
  /** "r, g, b" for rgba(var(--cp-rgb), opacity) */
  rgb:      string;
  /** Lighter shade HSL string for icons/text — var(--cp-400) */
  light:    string;
  /** Medium shade HSL string for gradient start — var(--cp-500) */
  mid:      string;
  /** Pre-built gradient for buttons/badges */
  gradient: string;
  /** Text color on solid primary bg */
  textOn:   string;
}

export const COLOR_PALETTE: ColorEntry[] = [
  {
    hex:      "#16a34a",
    label:    "Verde Esmeralda",
    hsl:      "142 76% 36%",
    rgb:      "22, 163, 74",
    light:    "hsl(142 69% 52%)",
    mid:      "hsl(142 69% 45%)",
    gradient: "linear-gradient(135deg, hsl(142 69% 45%), hsl(142 76% 36%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#2563eb",
    label:    "Azul Royal",
    hsl:      "221 83% 53%",
    rgb:      "37, 99, 235",
    light:    "hsl(221 83% 68%)",
    mid:      "hsl(221 83% 62%)",
    gradient: "linear-gradient(135deg, hsl(221 83% 62%), hsl(221 83% 48%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#ea580c",
    label:    "Laranja",
    hsl:      "21 90% 48%",
    rgb:      "234, 88, 12",
    light:    "hsl(21 90% 64%)",
    mid:      "hsl(21 90% 57%)",
    gradient: "linear-gradient(135deg, hsl(21 90% 57%), hsl(21 90% 44%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#d97706",
    label:    "Âmbar",
    hsl:      "38 93% 44%",
    rgb:      "217, 119, 6",
    light:    "hsl(38 95% 60%)",
    mid:      "hsl(38 95% 54%)",
    gradient: "linear-gradient(135deg, hsl(38 95% 54%), hsl(38 93% 40%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#7c3aed",
    label:    "Roxo",
    hsl:      "263 70% 57%",
    rgb:      "124, 58, 237",
    light:    "hsl(263 70% 72%)",
    mid:      "hsl(263 70% 65%)",
    gradient: "linear-gradient(135deg, hsl(263 70% 65%), hsl(263 70% 52%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#db2777",
    label:    "Rosa",
    hsl:      "333 71% 51%",
    rgb:      "219, 39, 119",
    light:    "hsl(333 71% 66%)",
    mid:      "hsl(333 71% 60%)",
    gradient: "linear-gradient(135deg, hsl(333 71% 60%), hsl(333 71% 46%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#dc2626",
    label:    "Vermelho",
    hsl:      "0 72% 51%",
    rgb:      "220, 38, 38",
    light:    "hsl(0 72% 66%)",
    mid:      "hsl(0 72% 60%)",
    gradient: "linear-gradient(135deg, hsl(0 72% 60%), hsl(0 72% 46%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#0891b2",
    label:    "Ciano",
    hsl:      "192 91% 36%",
    rgb:      "8, 145, 178",
    light:    "hsl(192 91% 52%)",
    mid:      "hsl(192 91% 45%)",
    gradient: "linear-gradient(135deg, hsl(192 91% 45%), hsl(192 91% 32%))",
    textOn:   "#ffffff",
  },
  {
    hex:      "#4b5563",
    label:    "Grafite",
    hsl:      "215 14% 34%",
    rgb:      "75, 85, 99",
    light:    "hsl(215 14% 55%)",
    mid:      "hsl(215 14% 44%)",
    gradient: "linear-gradient(135deg, hsl(215 14% 44%), hsl(215 14% 30%))",
    textOn:   "#ffffff",
  },
];

/** Returns the palette entry for a hex color, or the default (green) */
export const getColorEntry = (hex: string | null | undefined): ColorEntry =>
  COLOR_PALETTE.find(
    (c) => c.hex.toLowerCase() === (hex ?? "").toLowerCase()
  ) ?? COLOR_PALETTE[0];
