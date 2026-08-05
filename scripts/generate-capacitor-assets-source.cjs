/**
 * generate-capacitor-assets-source.cjs
 * Renders a high-res icon.png (1024x1024, transparent) and splash.png
 * (2732x2732, logo centered on solid background) from the ORBI icon SVG,
 * into resources/ — the default input path @capacitor/assets reads from
 * to generate every native icon/splash size for android/ and ios/.
 *
 * Run: node scripts/generate-capacitor-assets-source.cjs
 */

const { Resvg } = require("@resvg/resvg-js");
const fs   = require("fs");
const path = require("path");

const SVG_PATH  = path.join(__dirname, "../public/logos/orbi-logo-icon.svg");
const OUT_DIR   = path.join(__dirname, "../resources");
const BG_COLOR  = "#000000"; // matches manifest.json background_color/theme_color

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const svgData = fs.readFileSync(SVG_PATH, "utf8");

// icon.png — 1024x1024, transparent background (capacitor-assets adds its
// own background/padding per platform rules)
const icon = new Resvg(svgData, {
  fitTo: { mode: "width", value: 1024 },
  background: undefined,
}).render();
const iconPng = icon.asPng();
const iconCanvasSize = 1024;

// Pad into an exact 1024x1024 transparent canvas if the rendered logo isn't square
const sharp = tryRequireSharp();
if (sharp) {
  sharp(iconPng)
    .resize(iconCanvasSize, iconCanvasSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, "icon.png"))
    .then(() => console.log("✓ resources/icon.png (1024×1024)"));

  // splash.png — logo centered on solid background, 2732x2732
  const logoOnBlack = new Resvg(svgData, {
    fitTo: { mode: "width", value: 800 },
    background: undefined,
  }).render().asPng();

  sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG_COLOR } })
    .composite([{ input: logoOnBlack, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, "splash.png"))
    .then(() => console.log("✓ resources/splash.png (2732×2732)"));
} else {
  fs.writeFileSync(path.join(OUT_DIR, "icon.png"), iconPng);
  console.log("✓ resources/icon.png (sem padding exato — sharp indisponível, dimensão pode não ser 1024×1024 quadrada)");
  console.log("⚠ splash.png não gerado — precisa do pacote 'sharp' pra compor logo + fundo. Rode: npm install -D sharp");
}

function tryRequireSharp() {
  try { return require("sharp"); } catch { return null; }
}
