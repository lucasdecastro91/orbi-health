// ── Paleta (extraída da landing page real) ──────────────────────────────
const BG = "0A0A0A";
const BG_DEEP_GREEN = "07130C"; // fundo da seção "problema" na landing (radial-gradient #0d2818→#020d05)
const CARD = "141417";
const CARD_BORDER = "232326";
const GREEN = "16A34A";
const GREEN_L = "4ADE80";
const AMBER = "F59E0B";
const RED = "EF4444";
const WHITE = "FFFFFF";
const MUTED = "A3A3AA";
const MUTED2 = "6B7280";
const FONT = "Arial";

const IMG_BASE = "C:/Users/gabri/OneDrive/Documentos/PROJETOS/getshapetraining/landing-page/screenshots";
const CAP_BASE = "C:/Users/gabri/OneDrive/Documentos/PROJETOS/getshapetraining/materiais/apresentacao-parceria/assets";
const LOGO = "C:/Users/gabri/OneDrive/Documentos/PROJETOS/getshapetraining/public/logos/orbi-logo-horizontal-dark-hd.png";
const LOGO_AR = 864 / 256;
const IMG = {
  // capturas reais da landing ao vivo (Playwright headless), pixel-a-pixel
  hero: `${CAP_BASE}/cap_hero_transparent.png`,
  whitelabel: `${CAP_BASE}/cap_whitelabel_transparent.png`,
  colaboradores: `${CAP_BASE}/cap_colaboradores_transparent.png`,
  financeiro: `${CAP_BASE}/cap_financeiro_transparent.png`,
  paineltreinador: `${CAP_BASE}/cap_paineltreinador_transparent.png`,
  // prints estáticos (landing-page/screenshots) recapturados dentro do mockup
  // .iphone-frame real (mesmo bezel do hero) — ver capture_phones.js
  treinoVideo: `${CAP_BASE}/cap_treino_mockup.png`,
  dashboardAluno: `${CAP_BASE}/cap_dashboardaluno_mockup.png`,
  dieta: `${CAP_BASE}/cap_dieta_mockup.png`,
  cardio: `${CAP_BASE}/cap_cardio_mockup.png`,
  evolucao: `${CAP_BASE}/cap_evolucao_mockup.png`,
};
const AR = {
  hero: 1362 / 1440,
  whitelabel: 1928 / 1150,
  colaboradores: 1920 / 1236,
  financeiro: 1928 / 1060,
  paineltreinador: 1960 / 680,
  phoneMockup: 1020 / 1920,
};

function bg(slide, color = BG) { slide.background = { color }; }

// Glow radial suave (a landing usa radial-gradient(rgba(22,163,74,.07-.12)) em quase toda seção —
// pptxgenjs não suporta gradient fill, então simula com elipses empilhadas e transparência crescente)
function glow(slide, cx, cy, r, color = GREEN, intensity = 1) {
  // mais camadas, degraus de transparência menores — evita a "linha" visível de anel duro
  const layers = [
    { mult: 2.00, base: 97.5 }, { mult: 1.75, base: 96.3 }, { mult: 1.50, base: 95.0 },
    { mult: 1.25, base: 93.2 }, { mult: 1.00, base: 91.0 }, { mult: 0.75, base: 88.0 },
    { mult: 0.50, base: 83.5 }, { mult: 0.28, base: 77.0 },
  ];
  layers.forEach((l) => {
    const size = r * l.mult;
    const transp = Math.max(55, l.base - intensity * 3);
    slide.addShape("ellipse", { x: cx - size / 2, y: cy - size / 2, w: size, h: size, fill: { color, transparency: transp }, line: { type: "none" } });
  });
}

function tag(slide, text, x, y, color = GREEN_L) {
  slide.addText(text.toUpperCase(), { x, y, w: 8, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color, charSpacing: 2, align: "left", margin: 0 });
}
function title(slide, text, x, y, w, size = 34) {
  slide.addText(text, { x, y, w, h: 1.5, fontFace: FONT, fontSize: size, bold: true, color: WHITE, align: "left", margin: 0, lineSpacingMultiple: 1.05 });
}
function sub(slide, text, x, y, w, size = 15) {
  slide.addText(text, { x, y, w, h: 1.2, fontFace: FONT, fontSize: size, color: MUTED, align: "left", margin: 0, lineSpacingMultiple: 1.3 });
}
function checkRow(slide, x, y, w, text, color = GREEN_L) {
  slide.addShape("ellipse", { x, y: y + 0.03, w: 0.22, h: 0.22, fill: { color, transparency: 85 }, line: { type: "none" } });
  slide.addText("\u2713", { x, y: y - 0.03, w: 0.22, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color, align: "center", valign: "middle", margin: 0 });
  slide.addText(text, { x: x + 0.35, y: y - 0.06, w: w - 0.35, h: 0.4, fontFace: FONT, fontSize: 14, color: "E5E5E8", align: "left", margin: 0, valign: "middle" });
}
function frameImage(slide, path, x, y, w, h) {
  const pad = 0.16;
  slide.addShape("roundRect", {
    x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2, rectRadius: 0.14,
    fill: { color: CARD }, line: { color: WHITE, transparency: 84, width: 1.25 },
    shadow: { type: "outer", color: "000000", opacity: 0.7, blur: 30, offset: 12, angle: 90 },
  });
  slide.addImage({ path, x, y, w, h, sizing: { type: "contain", w, h } });
}
function whatsappChaosCard(slide, x, y, w, h) {
  const WA_BG = "0B141A", WA_SENT = "005C4B", WA_RECV = "1F2C34", WA_TEXT = "E9EDEF", WA_MUTED = "8696A0";
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.14, fill: { color: WA_BG }, line: { color: "2A3942", width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.6, blur: 24, offset: 10, angle: 90 },
  });
  // header
  const pad = 0.2;
  slide.addShape("ellipse", { x: x + pad, y: y + pad, w: 0.34, h: 0.34, fill: { color: "3A4A54" }, line: { type: "none" } });
  slide.addText("PT", { x: x + pad, y: y + pad, w: 0.34, h: 0.34, fontFace: FONT, fontSize: 10, bold: true, color: WA_TEXT, align: "center", valign: "middle", margin: 0 });
  slide.addText("Personal Trainer", { x: x + pad + 0.44, y: y + pad - 0.02, w: w - pad * 2 - 0.44, h: 0.24, fontFace: FONT, fontSize: 11.5, bold: true, color: WA_TEXT, margin: 0 });
  slide.addText("visto por último hoje às 21:40", { x: x + pad + 0.44, y: y + pad + 0.19, w: w - pad * 2 - 0.44, h: 0.2, fontFace: FONT, fontSize: 8, color: WA_MUTED, margin: 0 });
  slide.addShape("line", { x: x + pad, y: y + pad + 0.5, w: w - pad * 2, h: 0, line: { color: "2A3942", width: 0.75 } });

  // bolhas de chat — recebida (esquerda, cinza) / enviada (direita, verde WhatsApp)
  const bubY0 = y + pad + 0.68;
  let by = bubY0;
  const bubble = (text, sent, bw, bh) => {
    const bx = sent ? x + w - pad - bw : x + pad;
    slide.addShape("roundRect", { x: bx, y: by, w: bw, h: bh, rectRadius: 0.08, fill: { color: sent ? WA_SENT : WA_RECV }, line: { type: "none" } });
    slide.addText(text, { x: bx + 0.12, y: by + 0.06, w: bw - 0.24, h: bh - 0.12, fontFace: FONT, fontSize: 10.5, color: WA_TEXT, margin: 0, valign: "middle", lineSpacingMultiple: 1.15 });
    by += bh + 0.16;
  };
  bubble("Chegou meu treino?", false, 1.95, 0.42);

  // bolha "enviada" com anexo de PDF (ícone desenhado, sem emoji)
  {
    const bw = 2.55, bh = 0.62, bx = x + w - pad - bw;
    slide.addShape("roundRect", { x: bx, y: by, w: bw, h: bh, rectRadius: 0.08, fill: { color: WA_SENT }, line: { type: "none" } });
    slide.addText("Chegou! Segue o treino:", { x: bx + 0.12, y: by + 0.05, w: bw - 0.24, h: 0.2, fontFace: FONT, fontSize: 9.5, color: WA_TEXT, margin: 0 });
    slide.addShape("roundRect", { x: bx + 0.12, y: by + 0.29, w: 0.26, h: 0.26, rectRadius: 0.03, fill: { color: "8B1A1A" }, line: { type: "none" } });
    slide.addText("PDF", { x: bx + 0.12, y: by + 0.29, w: 0.26, h: 0.26, fontFace: FONT, fontSize: 6, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
    slide.addText("mesociclo3.pdf", { x: bx + 0.44, y: by + 0.31, w: bw - 0.56, h: 0.22, fontFace: FONT, fontSize: 8.5, color: WA_TEXT, margin: 0, valign: "middle" });
    by += bh + 0.16;
  }

  bubble("E o pagamento desse mês, como faço?", false, 2.35, 0.6);
  slide.addText("digitando...", { x: x + pad, y: by + 0.02, w: w - pad * 2, h: 0.2, fontFace: FONT, fontSize: 8.5, italic: true, color: WA_MUTED, margin: 0 });
}
function dashboardMockCard(slide, x, y, w, h) {
  // recriação do card "Boa tarde" + Financeiro + operacional + Planos Vencendo do
  // Dashboard.tsx real — sem foto/dado real de treinador, valores fictícios
  // (ver seção 16 do CLAUDE.md: nunca captura de conta logada)
  const DB_CARD = "17191A", DB_BORDER = "27292B", DB_MUTED = "8A8D93", DB_GREEN = "4ADE80";
  const headerH = 0.5, g = 0.16;
  // grid de 3 colunas — a coluna 3 (statW) é a mesma largura usada pra "Anamneses
  // Pendentes" na fileira operacional, pra alinhar exatamente com "Clientes
  // Ativos"/"Mensagens" acima, igual no dashboard real
  const colW = (w - g * 2) / 3, finW = colW * 2 + g, statW = colW, statX = x + finW + g;
  const row1H = h * 0.36, row2H = h * 0.19, row3H = h - headerH - row1H - row2H - g * 3;

  slide.addText("Boa tarde, Diego!", { x, y, w, h: 0.3, fontFace: FONT, fontSize: 15, bold: true, color: WHITE, margin: 0 });
  slide.addText("Visão geral de hoje", { x, y: y + 0.28, w, h: 0.2, fontFace: FONT, fontSize: 9.5, color: DB_MUTED, margin: 0 });

  // card financeiro
  const finY = y + headerH, finH = row1H;
  slide.addShape("roundRect", {
    x, y: finY, w: finW, h: finH, rectRadius: 0.12, fill: { color: DB_CARD }, line: { color: DB_BORDER, width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.55, blur: 20, offset: 8, angle: 90 },
  });
  const p = 0.2;
  slide.addText("FINANCEIRO", { x: x + p, y: finY + p, w: finW - p * 2, h: 0.2, fontFace: FONT, fontSize: 8.5, bold: true, color: DB_MUTED, charSpacing: 1.5, margin: 0 });
  slide.addText([
    { text: "R$ 23.650,00", options: { color: DB_GREEN, fontSize: 19, bold: true } },
    { text: "  recebido", options: { color: DB_MUTED, fontSize: 10 } },
  ], { x: x + p, y: finY + p + 0.22, w: finW - p * 2, h: 0.32, fontFace: FONT, margin: 0 });
  slide.addText([
    { text: "R$ 480", options: { color: "FB923C", fontSize: 11.5, bold: true } },
    { text: "  pendente   ", options: { color: DB_MUTED, fontSize: 8.5 } },
    { text: "R$ 0", options: { color: "F87171", fontSize: 11.5, bold: true } },
    { text: "  vencido", options: { color: DB_MUTED, fontSize: 8.5 } },
  ], { x: x + p, y: finY + p + 0.22 + 0.32, w: finW - p * 2, h: 0.26, fontFace: FONT, margin: 0, align: "left" });
  slide.addText("Taxa de recebimento", { x: x + p, y: finY + finH - 0.5, w: finW - p * 2 - 0.6, h: 0.2, fontFace: FONT, fontSize: 8.5, color: DB_MUTED, margin: 0 });
  slide.addText("98%", { x: x + finW - p - 0.6, y: finY + finH - 0.5, w: 0.6, h: 0.2, fontFace: FONT, fontSize: 8.5, bold: true, color: DB_GREEN, align: "right", margin: 0 });
  slide.addShape("roundRect", { x: x + p, y: finY + finH - 0.28, w: finW - p * 2, h: 0.07, rectRadius: 0.035, fill: { color: "23262A" }, line: { type: "none" } });
  slide.addShape("roundRect", { x: x + p, y: finY + finH - 0.28, w: (finW - p * 2) * 0.98, h: 0.07, rectRadius: 0.035, fill: { color: DB_GREEN }, line: { type: "none" } });

  // coluna lateral — 2 stat tiles (mesma coluna 3 do grid)
  const tileH = (row1H - g) / 2;
  statCard(slide, statX, finY, statW, tileH, "32", "Clientes Ativos", GREEN_L);
  statCard(slide, statX, finY + tileH + g, statW, tileH, "3", "Mensagens", GREEN_L);

  // fileira operacional — mesmas 3 colunas do grid acima, "Anamneses Pendentes"
  // cai exatamente sob "Mensagens", igual no dashboard real
  const row2Y = finY + row1H + g;
  const ops = [
    { v: "4", l: "Atualizações", c: "FBBF24" },
    { v: "2", l: "Calls hoje", c: "C084FC" },
    { v: "1", l: "Anamneses", c: "818CF8" },
  ];
  let ox = x;
  ops.forEach((o) => { statCard(slide, ox, row2Y, colW, row2H, o.v, o.l, o.c); ox += colW + g; });

  // Planos Vencendo — card largo, mesmo padrão do "Atualizações Pendentes" real,
  // mas sem duplicar esse card aqui embaixo (já aparece na fileira operacional)
  const row3Y = row2Y + row2H + g;
  slide.addShape("roundRect", {
    x, y: row3Y, w, h: row3H, rectRadius: 0.12, fill: { color: DB_CARD }, line: { color: DB_BORDER, width: 1 },
  });
  slide.addText([
    { text: "Planos Vencendo  ", options: { color: WHITE, fontSize: 11, bold: true } },
    { text: "2", options: { color: "FB923C", fontSize: 9, bold: true } },
  ], { x: x + p, y: row3Y + 0.14, w: w - p * 2, h: 0.24, fontFace: FONT, margin: 0 });
  const students = ["Juliana Prado — vence em 3 dias", "Thiago Nunes — vence em 6 dias"];
  let sy = row3Y + 0.46;
  students.forEach((t) => {
    slide.addText(t, { x: x + p, y: sy, w: w - p * 2, h: 0.24, fontFace: FONT, fontSize: 10, color: "C4C7CC", margin: 0 });
    sy += 0.28;
  });
}
function statBlock(slide, x, y, w, value, label, color = GREEN_L) {
  slide.addText(value, { x, y, w, h: 0.95, fontFace: FONT, fontSize: 48, bold: true, color, align: "center", margin: 0 });
  slide.addText(label, { x, y: y + 0.9, w, h: 0.7, fontFace: FONT, fontSize: 13, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.15 });
}
function orbiWordmark(slide, x, y, h = 0.5) {
  slide.addImage({ path: LOGO, x, y, w: h * LOGO_AR, h });
}
function statCard(slide, x, y, w, h, value, label, color = GREEN_L) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: CARD }, line: { color: CARD_BORDER, width: 1 } });
  slide.addText(value, { x: x + 0.15, y: y + 0.14, w: w - 0.3, h: h * 0.5, fontFace: FONT, fontSize: 22, bold: true, color, align: "left", margin: 0, valign: "top" });
  slide.addText(label, { x: x + 0.15, y: y + h * 0.58, w: w - 0.3, h: h * 0.34, fontFace: FONT, fontSize: 11, color: MUTED, align: "left", margin: 0, valign: "top", lineSpacingMultiple: 1.1 });
}
function stepCircle(slide, x, y, size, num, color = GREEN) {
  slide.addShape("ellipse", { x, y, w: size, h: size, fill: { color, transparency: 85 }, line: { color, width: 1.5 } });
  slide.addText(String(num), { x, y, w: size, h: size, fontFace: FONT, fontSize: size * 30, bold: true, color, align: "center", valign: "middle", margin: 0 });
}

function buildCorpo(pres) {
  // 1. CAPA
  {
    const s = pres.addSlide(); bg(s);
    const ph = 5.5, pw = ph * AR.hero, px = 8.3, py = 0.95;
    glow(s, px + pw * 0.43, py + ph / 2, 8, GREEN, 1.4);
    orbiWordmark(s, 0.9, 0.45, 0.55);
    s.addText("PROPOSTA DE PARCERIA", { x: 0.9, y: 1.475, w: 8, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: GREEN_L, charSpacing: 3, margin: 0 });
    s.addText([
      { text: "Seus clientes.\n" }, { text: "Sua receita.\n" }, { text: "Sua marca.", options: { color: GREEN_L } },
    ], { x: 0.85, y: 1.875, w: 8.2, h: 3.2, fontFace: FONT, fontSize: 50, bold: true, color: WHITE, align: "left", margin: 0, lineSpacingMultiple: 1.02 });
    s.addText("A plataforma white-label pra você ter seu próprio app de treino e dieta — sem precisar de um único desenvolvedor.", { x: 0.9, y: 5.125, w: 7.6, h: 0.9, fontFace: FONT, fontSize: 15, color: MUTED, margin: 0, lineSpacingMultiple: 1.3 });
    s.addImage({ path: IMG.hero, x: px, y: py, w: pw, h: ph });
  }
  // 2. A DOR (fundo verde-escuro, igual à seção "problema" da landing)
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 11.0, 4.2, 5.2, GREEN, 1.4);
    tag(s, "O problema", 0.9, 0.55);
    title(s, "A ferramenta que você usa define o valor que o mercado enxerga em você.", 0.9, 0.95, 8.5, 32);
    const pains = ["Treino mandado em PDF avulso ou print de planilha", "Cobrança manual pelo WhatsApp, sem controle de quem pagou", "Nenhuma identidade visual própria — parece amador pro cliente", "Sem histórico de evolução organizado, sem dado pra reter aluno"];
    let y = 3.25; pains.forEach((p) => { checkRow(s, 0.95, y, 8, p, RED); y += 0.75; });
    whatsappChaosCard(s, 9.35, 2.55, 3.3, 3.35);
    s.addText("Sem ferramenta própria, você compete por preço — não por marca.", { x: 9.35, y: 6.05, w: 3.3, h: 0.7, fontFace: FONT, fontSize: 12, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.3 });
  }
  // 3. SOLUÇÃO
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 9.65, 3.5, 4.8, GREEN, 1.2);
    tag(s, "A solução", 0.9, 0.75);
    title(s, "O que muda com uma ferramenta profissional de verdade", 0.9, 1.25, 10.5, 32);
    const colW = 5.6, colY = 2.85, colH = 3.7;
    s.addShape("roundRect", { x: 0.9, y: colY, w: colW, h: colH, rectRadius: 0.1, fill: { color: CARD }, line: { color: CARD_BORDER, width: 1 } });
    s.addText("ANTES", { x: 1.2, y: colY + 0.3, w: colW - 0.6, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: MUTED2, charSpacing: 2, margin: 0 });
    ["Planilha + PDF + WhatsApp separados", "Cobrança manual, sem previsibilidade", "Sem marca — só mais um “personal”", "Aluno cancela sem você perceber a tempo"].forEach((t, i) => checkRow(s, 1.2, colY + 0.9 + i * 0.62, colW - 0.6, t, RED));
    s.addShape("roundRect", { x: 6.85, y: colY, w: colW, h: colH, rectRadius: 0.1, fill: { color: CARD }, line: { color: GREEN, transparency: 40, width: 1.5 } });
    s.addText("DEPOIS — COM A ORBI", { x: 7.15, y: colY + 0.3, w: colW - 0.6, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: GREEN_L, charSpacing: 2, margin: 0 });
    ["App com a sua identidade visual", "Cobrança recorrente automatizada (PIX/cartão)", "Você parece — e é — uma empresa", "Evolução e engajamento monitorados no painel"].forEach((t, i) => checkRow(s, 7.15, colY + 0.9 + i * 0.62, colW - 0.6, t, GREEN_L));
  }
  // 4. WHITE LABEL
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 6.6, 5.0, 3.2, GREEN, 0.5);
    s.addText("WHITE-LABEL", { x: 0, y: 0.55, w: 13.333, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: GREEN_L, charSpacing: 2, align: "center", margin: 0 });
    s.addText("Seu app. Sua marca. Sua cor.", { x: 0, y: 0.95, w: 13.333, h: 0.65, fontFace: FONT, fontSize: 30, bold: true, color: WHITE, align: "center", margin: 0 });
    s.addText("Cada treinador tem sua própria identidade visual. O aluno nem sabe que é a mesma plataforma.", { x: 1.9, y: 1.6, w: 9.53, h: 0.6, fontFace: FONT, fontSize: 14.5, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.3 });
    const feats = ["Logo, cores e nome próprios", "URL exclusiva pra sua marca", "App na App Store / Google Play"];
    const fw = 3.6; let fx = (13.333 - fw * 3) / 2;
    feats.forEach((t) => { checkRow(s, fx, 2.35, fw, t, GREEN_L); fx += fw; });
    const wlH = 4.1, wlW = wlH * AR.whitelabel, wlX = (13.333 - wlW) / 2, wlY = 2.95;
    // brilho colorido por marca (recriado — a captura transparente não tem mais o box-shadow original)
    glow(s, wlX + wlW * 0.17, wlY + wlH * 0.5, 2.0, RED, 1.4);
    glow(s, wlX + wlW * 0.50, wlY + wlH * 0.5, 2.3, "3B82F6", 1.5);
    glow(s, wlX + wlW * 0.83, wlY + wlH * 0.5, 2.0, AMBER, 1.4);
    s.addImage({ path: IMG.whitelabel, x: wlX, y: wlY, w: wlW, h: wlH });
  }
  // 5. FINANCEIRO
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 9.6, 3.85, 4.8, GREEN, 1.2);
    tag(s, "Financeiro", 0.9, 0.7);
    title(s, "Cobra pelo WhatsApp sem controle financeiro?", 0.9, 1.2, 5.4, 28);
    sub(s, "Receba, controle e cresça. Cobranças, vencimentos e inadimplência direto no painel — automático, profissional, com a sua marca.", 0.9, 2.55, 5.2, 14.5);
    let y = 4.1; ["PIX e cartão tokenizado direto no seu checkout", "Alerta automático de cobrança vencida", "Bloqueio de acesso do aluno por inadimplência"].forEach((t) => { checkRow(s, 0.95, y, 4.8, t, GREEN_L); y += 0.62; });
    s.addImage({ path: IMG.financeiro, x: 6.55, y: 2.15, w: 6.1, h: 6.1 / AR.financeiro });
  }
  // 6. PAINEL DO TREINADOR
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 9.6, 3.73, 4.8, GREEN, 1.2);
    tag(s, "Painel do treinador", 0.9, 0.7);
    title(s, "Comande sua consultoria como uma empresa", 0.9, 1.2, 5.4, 28);
    sub(s, "Visão completa dos seus clientes, cobranças, anamneses e atualizações pendentes — tudo num só lugar, em tempo real.", 0.9, 2.55, 5.2, 14.5);
    let y = 4.1; ["Veja em um único lugar clientes ativos, anamneses e planos vencendo", "Menos tempo operacional, mais tempo treinando", "Escala sem perder controle"].forEach((t) => { checkRow(s, 0.95, y, 4.8, t, GREEN_L); y += 0.62; });
    dashboardMockCard(s, 6.55, 1.3, 6.1, 4.85);
  }
  // 7. TREINO + PROGRESSÃO
  {
    const s = pres.addSlide(); bg(s);
    tag(s, "Por que a ORBI", 0.9, 0.7);
    title(s, "Ainda manda treino por PDF?", 0.9, 1.2, 5.4, 28);
    sub(s, "Treinos personalizados direto no app — com vídeo de execução e séries organizadas por tipo (warm-up, feeder, work set, técnicas avançadas), registradas automaticamente.", 0.9, 2.55, 5.2, 14.5);
    let y = 4.1; ["Progressão de carga registrada sozinha", "Zero PDF, zero print de planilha"].forEach((t) => { checkRow(s, 0.95, y, 4.8, t, GREEN_L); y += 0.62; });
    const ph = 5.35, pw = ph * AR.phoneMockup, px = 8.6, py = 1.0;
    glow(s, px + pw / 2, py + ph / 2, 3.4, GREEN, 1.3);
    s.addImage({ path: IMG.treinoVideo, x: px, y: py, w: pw, h: ph });
  }
  // 8. APP DO ALUNO
  {
    const s = pres.addSlide(); bg(s);
    tag(s, "App do aluno", 0.9, 0.7);
    title(s, "Tudo que seu aluno precisa, num único app", 0.9, 1.2, 5.4, 28);
    sub(s, "Treino com vídeo, dieta com substituição, cardio prescrito e evolução de carga — direto no celular, com a sua marca.", 0.9, 2.55, 5.2, 14.5);
    let y = 4.15; ["Experiência premium retém aluno por mais tempo", "Menos dúvida, menos mensagem, mais autonomia"].forEach((t) => { checkRow(s, 0.95, y, 4.8, t, GREEN_L); y += 0.62; });
    const ph = 4.9, pw = ph * AR.phoneMockup, px1 = 7.1, px2 = px1 + pw + 0.45, py = 1.2;
    glow(s, px1 + pw / 2, py + ph / 2, 2.6, GREEN, 1.2);
    glow(s, px2 + pw / 2, py + ph / 2, 2.6, GREEN, 1.2);
    s.addImage({ path: IMG.dashboardAluno, x: px1, y: py, w: pw, h: ph });
    s.addImage({ path: IMG.dieta, x: px2, y: py, w: pw, h: ph });
  }
  // 9. APP DO ALUNO — continuação (cardio + evolução)
  {
    const s = pres.addSlide(); bg(s);
    tag(s, "App do aluno", 0.9, 0.7);
    title(s, "Cardio prescrito e evolução, sempre à mão", 0.9, 1.2, 5.4, 28);
    sub(s, "Sessão de cardio com intensidade prescrita e histórico de carga por exercício — o aluno vê a própria evolução, sem precisar perguntar pra você.", 0.9, 2.55, 5.2, 14.5);
    let y = 4.15; ["Motivação: progresso visível reduz desistência", "Cardio prescrito, não genérico"].forEach((t) => { checkRow(s, 0.95, y, 4.8, t, GREEN_L); y += 0.62; });
    const ph = 4.9, pw = ph * AR.phoneMockup, px1 = 7.1, px2 = px1 + pw + 0.45, py = 1.2;
    glow(s, px1 + pw / 2, py + ph / 2, 2.6, GREEN, 1.2);
    glow(s, px2 + pw / 2, py + ph / 2, 2.6, GREEN, 1.2);
    s.addImage({ path: IMG.cardio, x: px1, y: py, w: pw, h: ph });
    s.addImage({ path: IMG.evolucao, x: px2, y: py, w: pw, h: ph });
  }
  // 10. COLABORADORES (mockup real do macbook)
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 6.7, 4.6, 4.8, GREEN, 1.2);
    tag(s, "Colaboradores", 0.9, 0.6);
    title(s, "Sua equipe inteira, numa só plataforma", 0.9, 0.95, 10.5, 30);
    sub(s, "Treinadores, nutricionistas e estagiários — cada um com o acesso certo.", 0.9, 1.65, 10, 14.5);
    const macH = 4.1, macW = macH * AR.colaboradores, macX = (13.333 - macW) / 2, macY = 2.55;
    s.addImage({ path: IMG.colaboradores, x: macX, y: macY, w: macW, h: macH });
    const yBelow = macY + macH + 0.25;
    const items = ["Permissões granulares por colaborador", "Multi-profissional no mesmo painel", "Financeiro visível só pra você"];
    let x = 1.3;
    items.forEach((t) => { checkRow(s, x, yBelow, 3.6, t, GREEN_L); x += 3.75; });
  }
  // 11. ZERO RISCO
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 6.6, 3.75, 5.5, GREEN, 1.0);
    s.addShape("roundRect", { x: 1.3, y: 1.3, w: 10.73, h: 4.9, rectRadius: 0.15, fill: { color: CARD }, line: { color: GREEN, transparency: 55, width: 1.5 } });
    s.addText("Teste sem compromisso.", { x: 1.9, y: 1.85, w: 9.6, h: 0.7, fontFace: FONT, fontSize: 30, bold: true, color: WHITE, align: "center", margin: 0 });
    s.addText("14 dias grátis pra usar de verdade, com sua base real. Primeiro mês sai por R$5 no cartão, depois valor cheio — sem fidelidade.", { x: 2.4, y: 2.55, w: 8.6, h: 0.8, fontFace: FONT, fontSize: 15, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.3 });
    const zStats = [{ v: "14", l: "dias grátis\npra testar" }, { v: "R$5", l: "no 1º mês\n(no cartão)" }, { v: "0", l: "multa ou fidelidade\npra cancelar" }];
    let zx = 2.15, zw = 3.0;
    zStats.forEach((st) => { statBlock(s, zx, 3.85, zw, st.v, st.l, GREEN_L); zx += 3.55; });
  }
  // 12. TRANSIÇÃO
  {
    const s = pres.addSlide(); bg(s);
    glow(s, 0, 4.5, 6, GREEN, 1.2);
    s.addText("Você já viu o que a ORBI faz.", { x: 0.9, y: 2.7, w: 11.5, h: 1, fontFace: FONT, fontSize: 30, color: MUTED, margin: 0 });
    s.addText("Agora, a proposta pra você.", { x: 0.9, y: 3.5, w: 11.5, h: 1.2, fontFace: FONT, fontSize: 44, bold: true, color: WHITE, margin: 0 });
  }
}

module.exports = { BG, BG_DEEP_GREEN, CARD, CARD_BORDER, GREEN, GREEN_L, AMBER, RED, WHITE, MUTED, MUTED2, FONT, IMG, AR, bg, glow, tag, title, sub, checkRow, frameImage, statBlock, orbiWordmark, stepCircle, buildCorpo };
