#!/bin/bash
# Regressão visual do motor estilo-editorial.
#
# Roda o build.py ATUAL da skill contra um post.json fixo (16 slides do
# carrossel de origem do Kyreon, que cobre quase todo o vocabulário de
# primitivas) e compara com a linha de base congelada em _fixtures/esperado/.
#
# DUAS COISAS QUE ESTE TESTE APRENDEU NA MARRA (2026-08-31):
#
# 1. Toda entrada é CONGELADA aqui dentro (post.json, fotos, _logo.svg). A
#    versão anterior lia de marketing/conteudo/, que é pasta viva — o Sidney
#    abre aquele post no studio.scault, ajusta e re-renderiza. A linha de base
#    andava sozinha e o teste acusava regressão num motor que não tinha
#    mudado nada.
#
# 2. A comparação tem TOLERÂNCIA (ver comparar.py). O Chrome não rasteriza
#    gradiente de forma determinística entre processos: com tudo congelado,
#    duas rodadas seguidas dão ~1% dos pixels com 1-2 níveis de diferença em
#    área de gradiente. Comparação exata acusava falso positivo numa rodada a
#    cada três.
#
# Quando o motor MUDAR de propósito, conferir o resultado a olho e regerar:
#   bash studio-scault/_fixtures/testar-regressao.sh --congelar
#
# Uso: bash studio-scault/_fixtures/testar-regressao.sh
set -e
cd "$(dirname "$0")/../.."
RAIZ="$(pwd -W 2>/dev/null || pwd)"
FIX="$RAIZ/studio-scault/_fixtures"
TMP="$RAIZ/_regressao-tmp"
BASE="$FIX/esperado"

rm -rf "$TMP"
mkdir -p "$TMP"
cp "$RAIZ/.claude/skills/carrossel/estilo-editorial/build.py" "$TMP/"
cp "$RAIZ/.claude/skills/carrossel/estilo-editorial/render.js" "$TMP/"
cp "$FIX/_logo.svg" "$TMP/"
cp "$FIX/fotos/"* "$TMP/"
cp "$FIX/kyreon-origem-post.json" "$TMP/post.json"

cd "$TMP"
python build.py
NODE_PATH="C:/Users/sidne/node_modules" node render.js

cd "$RAIZ"
if [ "$1" == "--congelar" ]; then
  rm -rf "$BASE"
  mkdir -p "$BASE"
  cp "$TMP/instagram/"*.png "$BASE/"
  echo "linha de base congelada em $BASE ($(ls "$BASE" | wc -l) slides)"
  rm -rf "$TMP"
  exit 0
fi

if [ ! -d "$BASE" ]; then
  echo "sem linha de base. Confira o resultado a olho e rode:"
  echo "  bash studio-scault/_fixtures/testar-regressao.sh --congelar"
  echo "os PNGs desta rodada ficaram em $TMP/instagram/"
  exit 1
fi

if python "$FIX/comparar.py" "$BASE" "$TMP/instagram"; then
  rm -rf "$TMP"
else
  echo "  esperado: $BASE"
  echo "  gerado:   $TMP/instagram/  (mantido pra inspecao)"
  exit 1
fi
