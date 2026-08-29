from PIL import Image, ImageDraw, ImageFont
import os

BASE = r"C:\Users\gabri\OneDrive\Documentos\PROJETOS\getshapetraining\landing-page\screenshots"
OUT  = r"C:\Users\gabri\OneDrive\Documentos\PROJETOS\getshapetraining\landing-page\screenshots\processed"
os.makedirs(OUT, exist_ok=True)

# --- IMAGENS MOBILE DO ALUNO ---
# Manter topo exatamente como esta (status bar nativa intacta).
# Cortar apenas 100px do rodape (barra URL do Chrome).
mobile_files = [
    "WhatsApp Image 2026-06-05 at 23.38.37 (1).jpeg",
    "WhatsApp Image 2026-06-05 at 23.38.37 (2).jpeg",
    "WhatsApp Image 2026-06-05 at 23.38.37 (3).jpeg",
    "WhatsApp Image 2026-06-05 at 23.38.37.jpeg",
    "WhatsApp Image 2026-06-05 at 23.38.38 (1).jpeg",
    "WhatsApp Image 2026-06-05 at 23.38.38 (2).jpeg",
    "WhatsApp Image 2026-06-05 at 23.38.38.jpeg",
    "WhatsApp Image 2026-06-05 at 23.41.36.jpeg",
    "WhatsApp Image 2026-06-05 at 23.46.26.jpeg",
]
for fname in mobile_files:
    path = os.path.join(BASE, "PAINEL DO ALUNO", fname)
    if not os.path.exists(path):
        print(f"NAO ENCONTRADO: {path}")
        continue
    img = Image.open(path)
    w, h = img.size
    # top=0: preserva status bar nativa intacta
    cropped = img.crop((0, 0, w, h - 155))
    cropped.save(os.path.join(OUT, fname))
    print(f"OK: {fname} -> {cropped.size}")

# --- FINANCEIRO MOBILE ---
# Imagem de desktop simulando mobile - nao tem status bar nativa.
# Adicionar status bar preta no topo (50px) com hora e icones.
# Cortar 3px da borda direita (linha branca).
fin_mobile_path = os.path.join(BASE, "PAINEL DO TREINADOR", "Captura de tela 2026-06-06 002741.png")
if os.path.exists(fin_mobile_path):
    img = Image.open(fin_mobile_path).convert("RGB")
    w, h = img.size
    img = img.crop((0, 0, w - 3, h))
    w, h = img.size
    STATUS_H = 50
    new_img = Image.new("RGB", (w, h + STATUS_H), color="#0a0a0a")
    new_img.paste(img, (0, STATUS_H))
    draw = ImageDraw.Draw(new_img)
    draw.rectangle([0, 0, w, STATUS_H], fill="#0a0a0a")
    try:
        font = ImageFont.truetype("arial.ttf", 16)
        font_small = ImageFont.truetype("arial.ttf", 13)
    except:
        font = ImageFont.load_default()
        font_small = font
    draw.text((18, 16), "09:30", fill="white", font=font)
    draw.text((w - 90, 17), "|||", fill="white", font=font_small)
    draw.text((w - 55, 17), "WiFi", fill="white", font=font_small)
    draw.text((w - 28, 17), "[|]", fill="white", font=font_small)
    new_img.save(os.path.join(OUT, "financeiro-mobile.png"))
    print(f"OK: financeiro-mobile.png -> {new_img.size}")
else:
    print("NAO ENCONTRADO: financeiro mobile")

# --- COPIAR IMAGENS DO TREINADOR ---
treinador_files = [
    "Captura de tela 2026-06-04 221002.png",
    "Captura de tela 2026-06-04 221535.png",
    "Captura de tela 2026-06-04 221940.png",
]
for fname in treinador_files:
    path = os.path.join(BASE, "PAINEL DO TREINADOR", fname)
    if os.path.exists(path):
        img = Image.open(path)
        img.save(os.path.join(OUT, fname))
        print(f"OK (copia): {fname}")
    else:
        print(f"NAO ENCONTRADO: {fname}")

print("\nProcessamento concluido.")
