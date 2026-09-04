# -*- coding: utf-8 -*-
"""Extrai cores candidatas de um DOCUMENTO de referência de marca (PDF, DOCX
ou texto puro) — complemento do `paleta.py`, que só mede imagem.

Manual de marca costuma trazer a cor de duas formas: escrita ("Azul
principal: #1B3A5C") ou só visual (retângulo colorido na página, sem hex
ao lado). Por isso o script combina as duas fontes:

  1. TEXTO — regex por hex (#RRGGBB/#RGB) e rgb(r,g,b) no texto extraído
     (PDF: PyMuPDF; DOCX: python-docx, parágrafos + tabelas).
  2. IMAGEM (só PDF) — cada página é renderizada e passada pelo mesmo
     quantize por MedianCut do paleta.py, descartando branco/preto quase
     puro (que é fundo de papel/texto, não cor de marca).

Uso: python paleta-documento.py <arquivo.pdf|.docx|.txt> [--n 12]
Saida: JSON no stdout — [{"hex": "#112233", "fonte": "texto"|"imagem", "proporcao": 0.12|null}, ...]
"""
import argparse
import json
import os
import re
import sys

ap = argparse.ArgumentParser()
ap.add_argument('arquivo')
ap.add_argument('--n', type=int, default=12)
args = ap.parse_args()

ext = os.path.splitext(args.arquivo)[1].lower()

RE_HEX = re.compile(r'#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b')
RE_RGB = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[,)]', re.I)


def normalizar_hex(h):
    h = h.upper()
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return '#' + h


def cores_do_texto(texto):
    achados = []
    vistos = set()
    for m in RE_HEX.finditer(texto):
        hx = normalizar_hex(m.group(1))
        if hx in vistos:
            continue
        vistos.add(hx)
        achados.append({'hex': hx, 'fonte': 'texto', 'proporcao': None})
    for m in RE_RGB.finditer(texto):
        r, g, b = (int(m.group(i)) for i in (1, 2, 3))
        if r > 255 or g > 255 or b > 255:
            continue
        hx = '#%02X%02X%02X' % (r, g, b)
        if hx in vistos:
            continue
        vistos.add(hx)
        achados.append({'hex': hx, 'fonte': 'texto', 'proporcao': None})
    return achados


def quase_neutro(r, g, b):
    # branco/preto/cinza de papel, texto e linha de tabela — não é cor de marca
    if max(r, g, b) - min(r, g, b) < 12:  # baixa saturação = cinza puro
        return True
    if r > 240 and g > 240 and b > 240:  # quase branco
        return True
    if r < 18 and g < 18 and b < 18:  # quase preto
        return True
    return False


def cores_dominantes_da_imagem_pil(img, n):
    from PIL import Image
    img = img.convert('RGB')
    img.thumbnail((400, 400))
    quant = img.quantize(colors=max(n * 4, 24), method=Image.MEDIANCUT)
    paleta_raw = quant.getpalette()
    contagem = quant.getcolors()
    contagem.sort(reverse=True)
    total_px = sum(qtd for qtd, _ in contagem)
    saida = []
    for qtd, idx in contagem:
        if len(saida) >= n:
            break
        r, g, b = paleta_raw[idx * 3:idx * 3 + 3]
        if quase_neutro(r, g, b):
            continue
        saida.append({'hex': '#%02X%02X%02X' % (r, g, b), 'fonte': 'imagem', 'proporcao': round(qtd / total_px, 3)})
    return saida


def extrair_pdf(caminho, n):
    import fitz  # pymupdf

    doc = fitz.open(caminho)
    texto_total = []
    candidatos_imagem = []
    MAX_PAGINAS = 8
    for i, pagina in enumerate(doc):
        texto_total.append(pagina.get_text())
        if i >= MAX_PAGINAS:
            continue
        pix = pagina.get_pixmap(dpi=110)
        from PIL import Image
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        candidatos_imagem.extend(cores_dominantes_da_imagem_pil(img, n))
    doc.close()
    return '\n'.join(texto_total), candidatos_imagem


def extrair_docx(caminho):
    import docx

    d = docx.Document(caminho)
    partes = [p.text for p in d.paragraphs]
    for tabela in d.tables:
        for linha in tabela.rows:
            for celula in linha.cells:
                partes.append(celula.text)
    return '\n'.join(partes), []


def extrair_txt(caminho):
    with open(caminho, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read(), []


def detectar_formato(caminho, ext):
    """A extensão do arquivo original é confiável (o servidor já filtrou lá na
    frente), mas o CAMINHO que chega aqui às vezes não tem extensão nenhuma —
    o servidor sobe pra um arquivo temporário sem nome original. Nesse caso,
    fareja pela assinatura do próprio arquivo, o mesmo truque que o Pillow já
    usa pra imagem (nunca confia em extensão): PDF e DOCX têm assinatura
    fixa nos primeiros bytes; o resto tenta como texto puro."""
    if ext == '.pdf':
        return 'pdf'
    if ext == '.docx':
        return 'docx'
    if ext in ('.txt', '.md'):
        return 'txt'
    with open(caminho, 'rb') as f:
        cabecalho = f.read(8)
    if cabecalho.startswith(b'%PDF'):
        return 'pdf'
    if cabecalho.startswith(b'PK\x03\x04'):  # docx é um .zip por baixo
        return 'docx'
    return 'txt'


formato = detectar_formato(args.arquivo, ext)
if formato == 'pdf':
    texto, candidatos_imagem = extrair_pdf(args.arquivo, args.n)
elif formato == 'docx':
    texto, candidatos_imagem = extrair_docx(args.arquivo)
else:
    texto, candidatos_imagem = extrair_txt(args.arquivo)

achados_texto = cores_do_texto(texto)

# dedup entre as duas fontes — texto tem prioridade (é uma cor DECLARADA,
# não estimada), imagem só complementa o que o texto não cobriu
vistos = {a['hex'] for a in achados_texto}
achados_imagem = [c for c in candidatos_imagem if c['hex'] not in vistos]
# entre as imagens, tira duplicata mantendo a de maior proporção
por_hex = {}
for c in achados_imagem:
    atual = por_hex.get(c['hex'])
    if not atual or (c['proporcao'] or 0) > (atual['proporcao'] or 0):
        por_hex[c['hex']] = c
achados_imagem = sorted(por_hex.values(), key=lambda c: -(c['proporcao'] or 0))

saida = (achados_texto + achados_imagem)[: max(args.n, len(achados_texto))]
json.dump(saida, sys.stdout, ensure_ascii=False)
