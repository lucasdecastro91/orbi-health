const pptxgen = require("pptxgenjs");
const C = require("./common");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
C.buildCorpo(pres);
pres.writeFile({ fileName: "PREVIEW_corpo.pptx" }).then(() => console.log("preview OK"));
