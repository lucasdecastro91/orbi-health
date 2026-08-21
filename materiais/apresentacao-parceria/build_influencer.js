const pptxgen = require("pptxgenjs");
const C = require("./common");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
C.buildCorpo(pres);

// 12. A PROPOSTA
{
  const s = pres.addSlide(); C.bg(s);
  // resíduo verde do slide de transição anterior (compartilhado com o outro
  // deck), pra não cortar seco pro âmbar — some rápido pro lado esquerdo
  C.glow(s, 0, 6.5, 3.5, C.GREEN, 0.5);
  C.glow(s, 10.6, 4, 5, C.AMBER, 1.2);
  C.tag(s, "Proposta exclusiva", 0.9, 0.75, C.AMBER);
  s.addText([{ text: "Seu próprio app.\n" }, { text: "Sua marca. 100% seu.", options: { color: C.GREEN_L } }],
    { x: 0.85, y: 1.3, w: 11, h: 2, fontFace: C.FONT, fontSize: 44, bold: true, color: C.WHITE, margin: 0, lineSpacingMultiple: 1.05 });
  s.addText("Você tem uma comunidade que confia em você. A gente constrói o app com a sua cara — publicado na App Store e na Google Play — pra você levar isso pra esse público.",
    { x: 0.9, y: 3.15, w: 9.5, h: 1, fontFace: C.FONT, fontSize: 16, color: C.MUTED, margin: 0, lineSpacingMultiple: 1.3 });
}

// 13. COMO FUNCIONA
{
  const s = pres.addSlide(); C.bg(s);
  C.glow(s, 2, 6.5, 4.6, C.AMBER, 1.1);
  C.tag(s, "Como funciona", 0.9, 0.75, C.AMBER);
  C.title(s, "Do convite ao seu app publicado", 0.9, 1.25, 10.5, 32);
  const steps = [
    { n: 1, t: "Você indica", d: "Seus seguidores treinadores entram na ORBI pelo seu link, com 14 dias de teste grátis" },
    { n: 2, t: "Eles assinam", d: "Ao final do teste grátis, pagam R$5 no 1º mês — depois seguem no valor cheio" },
    { n: 3, t: "Você bate a meta", d: "100 assinantes pagantes (valor cheio, não o mês de degustação) em 90 dias" },
    { n: 4, t: "Seu app nasce", d: "App próprio, com sua marca, publicado na App Store e Google Play — uso vitalício 100% grátis" },
  ];
  let x = 0.9;
  steps.forEach((st) => {
    C.stepCircle(s, x, 2.95, 0.55, st.n, C.AMBER);
    s.addText(st.t, { x, y: 3.7, w: 2.75, h: 0.5, fontFace: C.FONT, fontSize: 16, bold: true, color: C.WHITE, margin: 0 });
    s.addText(st.d, { x, y: 4.2, w: 2.75, h: 1.4, fontFace: C.FONT, fontSize: 12, color: C.MUTED, margin: 0, lineSpacingMultiple: 1.3 });
    x += 3.0;
  });
}

// 14. NÚMEROS
{
  const s = pres.addSlide(); C.bg(s);
  C.glow(s, 6.6, 4, 5, C.AMBER, 1.1);
  C.tag(s, "A meta", 0.9, 0.75, C.AMBER);
  C.title(s, "Simples de entender, simples de acompanhar", 0.9, 1.25, 10.5, 30);
  const stats = [
    { v: "100", l: "assinantes pagantes\n(valor cheio) em 90 dias" },
    { v: "0%", l: "de custo pra você —\nvitalício 100% grátis" },
    { v: "2", l: "lojas — App Store\ne Google Play" },
  ];
  let x = 0.9, w = 3.7;
  stats.forEach((st) => { C.statBlock(s, x, 3.0, w, st.v, st.l, C.WHITE); x += 4.0; });
}

// 15. CTA FINAL
{
  const s = pres.addSlide(); C.bg(s);
  s.addShape("ellipse", { x: 9.5, y: -2.5, w: 7, h: 7, fill: { color: C.AMBER, transparency: 93 }, line: { type: "none" } });
  C.orbiWordmark(s, 0.9, 0.75, 0.48);
  s.addText("Vamos construir isso juntos?", { x: 0.9, y: 2.9, w: 10.5, h: 1.2, fontFace: C.FONT, fontSize: 42, bold: true, color: C.WHITE, margin: 0 });
  s.addText("Seu app. Sua marca. Sua comunidade.", { x: 0.9, y: 3.85, w: 10, h: 0.6, fontFace: C.FONT, fontSize: 18, color: C.GREEN_L, margin: 0 });
}

pres.writeFile({ fileName: "ORBI_Proposta_Parceria_Influenciadora_v2.pptx" }).then(() => console.log("influencer OK"));
