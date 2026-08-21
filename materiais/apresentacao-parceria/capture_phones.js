const { chromium } = require("playwright");
const path = require("path");

// Recria o mockup .iphone-frame da landing (mesmo bezel/dynamic-island real
// usado no hero) em volta dos prints estáticos de tela (landing-page/screenshots),
// pra ficar visualmente igual a um device mockup de verdade em vez de print cru
// dentro de um card. Fundo transparente, mesma técnica das outras capturas.

// via http (não file://) — setContent() roda em about:blank, que o Chromium
// bloqueia de acessar file:// por segurança; localhost:5501 já serve landing-page/
const SHOTS_BASE = "http://localhost:5501/screenshots";
// cropTop = pixels a remover do topo do print ORIGINAL (resolução natural),
// pra "rolar" o conteúdo mostrado dentro do frame sem precisar de outro arquivo
// — vira margin-top negativo na imagem, escalado pra largura do frame
const targets = [
  { file: `${SHOTS_BASE}/PAINEL%20DO%20ALUNO/treino-video.jpeg`, out: "cap_treino_mockup.png", naturalW: 739 },
  { file: `${SHOTS_BASE}/Novas/dashboard%20final.jpeg`, out: "cap_dashboardaluno_mockup.png", naturalW: 739 },
  { file: `${SHOTS_BASE}/PAINEL%20DO%20ALUNO/dieta-substituicao.jpeg`, out: "cap_dieta_mockup.png", naturalW: 591 },
  { file: `${SHOTS_BASE}/PAINEL%20DO%20ALUNO/cardio-prescrito.jpeg`, out: "cap_cardio_mockup.png", naturalW: 591 },
  { file: `${SHOTS_BASE}/PAINEL%20DO%20ALUNO/evolucao-carga.jpeg`, out: "cap_evolucao_mockup.png", naturalW: 591, cropTop: 175, hideIsland: true },
];

const FRAME_W = 295;
const html = (imgUrl, marginTop, hideIsland) => `
<!doctype html><html><head><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  .wrap { width: 340px; height: 640px; display: flex; align-items: center; justify-content: center; }
  .iphone-frame {
    position: relative; width: ${FRAME_W}px; height: 566px; border-radius: 40px;
    border: 2px solid #2a2a2a; overflow: hidden; background: #000;
  }
  .iphone-frame img { width: 100%; display: block; margin-top: ${marginTop}px; }
  .iphone-dynamic-island {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
    width: 88px; height: 22px; background: #000; border-radius: 12px; z-index: 20;
    ${hideIsland ? "display: none;" : ""}
  }
</style></head><body>
  <div class="wrap">
    <div class="iphone-frame">
      <div class="iphone-dynamic-island"></div>
      <img src="${imgUrl}">
    </div>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 340, height: 640 }, deviceScaleFactor: 3 });
  for (const t of targets) {
    const scale = FRAME_W / t.naturalW;
    const marginTop = -Math.round((t.cropTop || 0) * scale);
    await page.setContent(html(t.file, marginTop, t.hideIsland));
    await page.waitForSelector("img");
    await page.waitForTimeout(250);
    await page.screenshot({ path: t.out, omitBackground: true });
    console.log("captured", t.out, "marginTop", marginTop);
  }
  await browser.close();
})();
