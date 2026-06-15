/**
 * export-logos-png.js
 * Converts every SVG in public/logos to PNG:
 *   *-icon.svg        → 400 × 400 px
 *   *-horizontal-*.svg → 600 × 200 px
 *   *-vertical-*.svg   → 300 × 500 px
 *
 * Run: node scripts/export-logos-png.js
 */

const { Resvg } = require("@resvg/resvg-js");
const fs   = require("fs");
const path = require("path");

const LOGOS_DIR = path.join(__dirname, "../public/logos");

// Determine target dimensions from filename
function dims(filename) {
  if (filename.includes("-icon"))       return { width: 400, height: 400 };
  if (filename.includes("-horizontal")) return { width: 600, height: 200 };
  if (filename.includes("-vertical"))   return { width: 300, height: 500 };
  return { width: 400, height: 400 }; // sensible fallback
}

const svgs = fs
  .readdirSync(LOGOS_DIR)
  .filter((f) => f.endsWith(".svg"));

if (svgs.length === 0) {
  console.error("No SVG files found in", LOGOS_DIR);
  process.exit(1);
}

let ok = 0;
let fail = 0;

for (const svg of svgs) {
  const svgPath  = path.join(LOGOS_DIR, svg);
  const pngName  = svg.replace(/\.svg$/i, ".png");
  const pngPath  = path.join(LOGOS_DIR, pngName);
  const { width, height } = dims(svg);

  try {
    const svgData = fs.readFileSync(svgPath, "utf8");

    const resvg = new Resvg(svgData, {
      fitTo: { mode: "size", width, height },
      background: undefined, // keep transparency
    });

    const png = resvg.render().asPng();
    fs.writeFileSync(pngPath, png);

    console.log(`✓  ${pngName}  (${width}×${height})`);
    ok++;
  } catch (err) {
    console.error(`✗  ${svg}:`, err.message);
    fail++;
  }
}

console.log(`\nDone — ${ok} exported${fail ? `, ${fail} failed` : ""}.`);
