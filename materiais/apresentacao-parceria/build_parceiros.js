const pptxgen = require("pptxgenjs");
const C = require("./common");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
C.buildCorpo(pres);

// 12. A PROPOSTA
{
  const s = pres.addSlide(); C.bg(s);
  C.glow(s, 10.6, 4, 5, C.GREEN, 1.1);
  C.tag(s, "Proposta de parceria", 0.9, 0.75);
  s.addText([{ text: "Comece grátis.\n" }, { text: "Fique pra sempre, se quiser.", options: { color: C.GREEN_L } }],
    { x: 0.85, y: 1.3, w: 11, h: 2, fontFace: C.FONT, fontSize: 40, bold: true, color: C.WHITE, margin: 0, lineSpacingMultiple: 1.05 });
  s.addText("Você é um dos primeiros parceiros da ORBI. Como reconhecimento, a condição de entrada é diferente da tabela pública.",
    { x: 0.9, y: 3.1, w: 9.5, h: 1, fontFace: C.FONT, fontSize: 16, color: C.MUTED, margin: 0, lineSpacingMultiple: 1.3 });
}

// 13. COMO FUNCIONA
{
  const s = pres.addSlide(); C.bg(s);
  C.glow(s, 2, 6.5, 4.6, C.GREEN, 1.1);
  C.tag(s, "Como funciona", 0.9, 0.75);
  C.title(s, "2 meses pra testar. Uma meta simples pra ficar de graça.", 0.9, 1.25, 10.5, 30);
  const steps = [
    { n: 1, t: "60 dias de teste", d: "Trial estendido, sem custo, pra você usar a ferramenta de verdade com sua base" },
    { n: 2, t: "50% de desconto", d: "Depois do trial, você paga metade do valor da tabela — recorrente" },
    { n: 3, t: "Indique 15 treinadores", d: "Se você trouxer 15 outros treinadores pagantes pra ORBI nesses 60 dias..." },
    { n: 4, t: "Fica grátis pra sempre", d: "Sua conta vira vitalícia, 100% grátis — sem prazo pra acabar" },
  ];
  let x = 0.9;
  steps.forEach((st) => {
    C.stepCircle(s, x, 2.95, 0.55, st.n, C.GREEN);
    s.addText(st.t, { x, y: 3.7, w: 2.75, h: 0.5, fontFace: C.FONT, fontSize: 15, bold: true, color: C.WHITE, margin: 0 });
    s.addText(st.d, { x, y: 4.2, w: 2.75, h: 1.4, fontFace: C.FONT, fontSize: 12, color: C.MUTED, margin: 0, lineSpacingMultiple: 1.3 });
    x += 3.0;
  });
}

// 14. NÚMEROS
{
  const s = pres.addSlide(); C.bg(s);
  C.glow(s, 6.6, 4, 5, C.GREEN, 1.1);
  C.tag(s, "A meta", 0.9, 0.75);
  C.title(s, "Simples de entender, simples de acompanhar", 0.9, 1.25, 10.5, 30);
  const stats = [
    { v: "60", l: "dias de trial\nestendido" },
    { v: "50%", l: "off no plano,\nrecorrente" },
    { v: "15", l: "treinadores indicados\n= grátis pra sempre" },
  ];
  let x = 0.9, w = 3.7;
  stats.forEach((st) => { C.statBlock(s, x, 3.0, w, st.v, st.l, C.WHITE); x += 4.0; });
  s.addText("Não bateu os 15? Sem problema — você continua com 50% off normalmente.", { x: 0.9, y: 5.6, w: 11, h: 0.5, fontFace: C.FONT, fontSize: 13, italic: true, color: C.MUTED2, margin: 0 });
}

// 15. CTA FINAL
{
  const s = pres.addSlide(); C.bg(s);
  s.addShape("ellipse", { x: 9.5, y: -2.5, w: 7, h: 7, fill: { color: C.GREEN, transparency: 93 }, line: { type: "none" } });
  C.orbiWordmark(s, 0.9, 0.75, 0.48);
  s.addText("Vamos começar?", { x: 0.9, y: 2.9, w: 10.5, h: 1.2, fontFace: C.FONT, fontSize: 42, bold: true, color: C.WHITE, margin: 0 });
  s.addText("Seu app, com sua marca, rodando em 1 dia.", { x: 0.9, y: 3.85, w: 10, h: 0.6, fontFace: C.FONT, fontSize: 18, color: C.GREEN_L, margin: 0 });
}

pres.writeFile({ fileName: "ORBI_Proposta_Parceria_Parceiros_v2.pptx" }).then(() => console.log("parceiros OK"));
