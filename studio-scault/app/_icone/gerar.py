# Empacota os PNGs de _icone/png/ num único app/studio.ico multi-resolução.
# Roda depois do gerar.js. PIL (Pillow) já é dependência do projeto (paleta.py).
import os
from PIL import Image

DIR_ICONE = os.path.dirname(os.path.abspath(__file__))
DIR_APP = os.path.dirname(DIR_ICONE)
DIR_PNG = os.path.join(DIR_ICONE, "png")

TAMANHOS = [16, 24, 32, 48, 64, 128, 256]

base = Image.open(os.path.join(DIR_PNG, "256.png")).convert("RGBA")
extras = [Image.open(os.path.join(DIR_PNG, f"{s}.png")).convert("RGBA") for s in TAMANHOS[:-1]]

destino = os.path.join(DIR_APP, "studio.ico")
base.save(destino, format="ICO",
          sizes=[(s, s) for s in TAMANHOS],
          append_images=extras)
print("studio.ico gerado:", destino)
