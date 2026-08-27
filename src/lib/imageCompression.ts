// Comprime fotos no navegador antes do upload — fotos de câmera de celular
// saem em 3-8 MB sem nenhum redimensionamento, e isso é a maior causa do
// storage do Supabase (plano free = 1 GB) enchendo rápido. Reduz pra um
// tamanho máximo de lado + qualidade JPEG que não perde qualidade visível
// pra visualização em tela, sem mexer no que já funciona pra arquivos
// não-imagem (ex: PDF de exame anexado na Anamnese).

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.78;

interface CompressOptions {
  maxDimension?: number;
  quality?: number;
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  // GIF/SVG não passam por canvas sem perder animação/vetor — e qualquer
  // coisa que não seja imagem (PDF, etc.) segue intocada.
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.round(bitmap.width * scale);
    const targetH = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // não compensou, mantém o original

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    console.error("[compressImage] falhou, usando arquivo original:", e instanceof Error ? e.message : e);
    return file;
  }
}
