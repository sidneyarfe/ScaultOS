# -*- coding: utf-8 -*-
"""Mede a paleta dominante de uma imagem — pra entregar hex MEDIDO ao agente
na extracao de template, em vez do agente chutar cor olhando o print (que
degrada mais ainda se o Instagram comprimiu a imagem).

Uso: python paleta.py <imagem> [--n 6]
Saida: JSON no stdout — [{"hex": "#112233", "proporcao": 0.34}, ...]
"""
import argparse
import json
import sys

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('imagem')
ap.add_argument('--n', type=int, default=6)
args = ap.parse_args()

img = Image.open(args.imagem).convert('RGB')
img.thumbnail((300, 300))  # nao precisa da resolucao total pra medir cor dominante

quant = img.quantize(colors=max(args.n * 3, 16), method=Image.MEDIANCUT)
paleta_raw = quant.getpalette()
contagem = quant.getcolors()  # [(qtd_pixels, indice_paleta), ...]
contagem.sort(reverse=True)

total_px = sum(qtd for qtd, _ in contagem)
saida = []
vistos = set()
for qtd, idx in contagem:
    if len(saida) >= args.n:
        break
    r, g, b = paleta_raw[idx * 3:idx * 3 + 3]
    hexcor = '#%02X%02X%02X' % (r, g, b)
    if hexcor in vistos:
        continue
    vistos.add(hexcor)
    saida.append({'hex': hexcor, 'proporcao': round(qtd / total_px, 3)})

json.dump(saida, sys.stdout)
