# -*- coding: utf-8 -*-
u"""Compara os PNGs renderizados com a linha de base, COM TOLERANCIA.

Por que tolerancia, e nao igualdade byte a byte (que era o teste anterior):

o Chrome nao rasteriza gradiente de forma 100% deterministica entre processos.
Medido nesta maquina em 2026-08-31, com TODAS as entradas congeladas (mesmo
post.json, mesmo carrossel.html byte a byte, mesmas fotos, mesmo build.py):
duas rodadas seguidas do render.js deram slides diferentes em ~1% dos pixels,
com delta de 1 a 2 niveis de cor, sempre dentro de area de gradiente escuro.
Invisivel a olho nu — mas suficiente pra mudar o hash.

Resultado pratico: o teste acusava "regressao do motor" em uma rodada a cada
~3, sem nada ter mudado. Um teste que da alarme falso vira teste que ninguem
olha.

O criterio abaixo pega o que importa (texto trocado, layout movido, cor
mudada, foto trocada — tudo isso muda dezenas de niveis em milhares de pixels)
e ignora o ruido do rasterizador.
"""
import io
import os
import sys

from PIL import Image, ImageChops

# um pixel so conta como diferente acima disto (ruido de gradiente e 1-2)
DELTA_RUIDO = 6
# e so vira falha se passar desta fatia da imagem
FRACAO_MAX = 0.002  # 0,2% dos pixels
# ou se QUALQUER pixel estourar isto (mudanca localizada e forte: texto, icone)
DELTA_GRAVE = 40
FRACAO_GRAVE = 0.0002  # 0,02% — ~290 pixels num slide 1080x1350


def comparar(caminho_a, caminho_b):
    a = Image.open(caminho_a).convert('RGB')
    b = Image.open(caminho_b).convert('RGB')
    if a.size != b.size:
        return False, u'tamanho diferente: %s x %s' % (a.size, b.size)

    dif = ImageChops.difference(a, b)
    total = a.size[0] * a.size[1]
    # canal com maior diferenca em cada pixel
    maximo = dif.convert('L') if dif.mode == 'L' else max_por_pixel(dif)
    hist = maximo.histogram()

    acima_ruido = sum(hist[DELTA_RUIDO + 1:])
    acima_grave = sum(hist[DELTA_GRAVE + 1:])
    pico = max(i for i, n in enumerate(hist) if n) if any(hist) else 0

    fr_ruido = acima_ruido / float(total)
    fr_grave = acima_grave / float(total)
    resumo = u'pico=%d, %.3f%% acima de %d, %.4f%% acima de %d' % (
        pico, 100 * fr_ruido, DELTA_RUIDO, 100 * fr_grave, DELTA_GRAVE)

    if fr_grave > FRACAO_GRAVE:
        return False, u'mudanca forte e localizada (%s)' % resumo
    if fr_ruido > FRACAO_MAX:
        return False, u'mudanca espalhada (%s)' % resumo
    return True, resumo


def max_por_pixel(img):
    u"""Imagem em L com o maior delta entre os canais de cada pixel."""
    r, g, b = img.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def main():
    esperado, gerado = sys.argv[1], sys.argv[2]
    nomes = sorted(f for f in os.listdir(esperado) if f.lower().endswith('.png'))
    if not nomes:
        print(u'linha de base vazia em %s' % esperado)
        return 1

    falhas = []
    for nome in nomes:
        alvo = os.path.join(gerado, nome)
        if not os.path.exists(alvo):
            falhas.append((nome, u'nao foi gerado'))
            continue
        ok, detalhe = comparar(os.path.join(esperado, nome), alvo)
        if not ok:
            falhas.append((nome, detalhe))

    extras = [f for f in sorted(os.listdir(gerado))
              if f.lower().endswith('.png') and f not in nomes]
    for nome in extras:
        falhas.append((nome, u'sobrou (nao existe na linha de base)'))

    if falhas:
        print(u'HOUVE DIFERENCA — revisar antes de seguir.')
        for nome, detalhe in falhas:
            print(u'  %s: %s' % (nome, detalhe))
        return 1

    print(u'TUDO IGUAL (%d slides) — o motor nao mudou.' % len(nomes))
    return 0


if __name__ == '__main__':
    sys.exit(main())
