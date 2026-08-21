const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto("http://localhost:5501", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // deixa animações/reveal terminarem

  const hero = await page.$(".hero-mockup-container");
  const heroBox = await hero.boundingBox();
  const padL = 150, padT = 20, padR = 110, padB = 40;
  // remove qualquer background pintado (seção, body) pra sobrar só o celular + badges, com transparência real
  await page.addStyleTag({ content: `
    html, body, .hero-section, .hero-inner, .hero-mockup-container, .hero-phone-left, .hero-phone-left img {
      background: transparent !important; box-shadow: none !important;
    }
  ` });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "cap_hero_transparent.png", omitBackground: true, clip: { x: Math.max(0, heroBox.x - padL), y: Math.max(0, heroBox.y - padT), width: heroBox.width + padL + padR, height: heroBox.height + padT + padB } });

  // neutraliza fundo pintado das seções/wrappers ao redor das 4 capturas —
  // mantém o fundo PRÓPRIO de cada painel (ex: financeiro-panel #050f07),
  // que é a "casca" do app, só tira o papel de parede da landing atrás dele
  await page.addStyleTag({ content: `
    html, body,
    .whitelabel-section, .wl-carousel-viewport, .wl-scaler,
    .financeiro-section, .why-block-full,
    .painel-treinador,
    .colaboradores-section, .colaboradores-section::before, .macbook-wrap,
    .dashboard-float {
      background: transparent !important; box-shadow: none !important;
    }
    .dashboard-strip { display: none !important; }
  ` });
  await page.waitForTimeout(200);

  const wl = await page.$(".wl-phones-row");
  await wl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await wl.screenshot({ path: "cap_whitelabel_transparent.png", omitBackground: true });

  const macbook = await page.$(".macbook-device");
  await macbook.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -160); // afasta do header fixo, que sobrepõe o topo do elemento
  await page.waitForTimeout(1000);
  await macbook.screenshot({ path: "cap_colaboradores_transparent.png", omitBackground: true });

  const financeiro = await page.$(".financeiro-panel");
  await financeiro.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await financeiro.screenshot({ path: "cap_financeiro_transparent.png", omitBackground: true });

  const dashboard = await page.$(".dashboard-float");
  await dashboard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const box = await dashboard.boundingBox();
  const pad = 60;
  await page.screenshot({ path: "cap_paineltreinador_transparent.png", omitBackground: true, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } });

  await browser.close();
  console.log("captured");
})();
