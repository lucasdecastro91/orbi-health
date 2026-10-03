"""Recorta os prints do app do aluno (2026-10-03) na proporção exata de cada
mockup da landing page. Fontes: prints originais (924x2000) em ./src/.

Mockups (style.css):
  - .iphone-frame (celular central do hero): 230x490 / 245x490 / 265x524 /
    295x566 conforme a largura -> recorte na razão mais alta (0,5) e o CSS
    usa object-fit:cover + object-position:top pra preencher qualquer uma.
  - .hero-phone-left/right img (laterais do hero): largura fixa, altura
    livre -> mesma razão do frame central no desktop (295/566 = 0,521).
  - .app-aluno__phone (janela do carrossel): 300x505 fixo -> razão 0,594.

Rodar: python crop.py  (gera os .jpg nesta pasta)
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")

CENTER_RATIO = 0.5          # 245/490 (o mais alto entre os breakpoints)
SIDE_RATIO = 295 / 566      # frame central no desktop
CAROUSEL_RATIO = 300 / 505  # janela do carrossel

# (arquivo fonte, arquivo de saída, razão largura/altura, y inicial no original)
JOBS = [
    ("inicio.webp",          "hero-centro-inicio.jpg",           CENTER_RATIO,   0),
    ("treinos.webp",         "hero-esquerda-treinos.jpg",        SIDE_RATIO,     200),
    ("dieta-lanche.webp",    "hero-direita-dieta.jpg",           SIDE_RATIO,     130),
    ("inicio.webp",          "carrossel-1-inicio.jpg",           CAROUSEL_RATIO, 120),
    ("exercicio-video.webp", "carrossel-2-treino-video.jpg",     CAROUSEL_RATIO, 110),
    ("dieta-substituicao.webp", "carrossel-3-dieta.jpg",         CAROUSEL_RATIO, 110),
    ("cardio.webp",          "carrossel-4-cardio.jpg",           CAROUSEL_RATIO, 110),
    ("exercicio-grafico.webp", "carrossel-5-evolucao-carga.jpg", CAROUSEL_RATIO, 345),
]

for src, out, ratio, y0 in JOBS:
    img = Image.open(os.path.join(SRC, src)).convert("RGB")
    w, h = img.size
    ch = round(w / ratio)
    if y0 + ch > h:
        raise SystemExit(f"{src}: recorte {y0}+{ch} passa da altura {h}")
    img.crop((0, y0, w, y0 + ch)).save(os.path.join(HERE, out), "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{out}: {w}x{ch} (y {y0}-{y0 + ch}), {os.path.getsize(os.path.join(HERE, out)) // 1024} KB")
