#!/usr/bin/env bash
# Regenera o ícone a partir de app/studio.svg.
# Rode sempre que mudar o SVG.
set -e
cd "$(dirname "$0")"
NODE_PATH="C:/Users/sidne/node_modules" node gerar.js
python gerar.py
rm -rf png
echo "ok — studio.ico e painel/icone-*.png atualizados"
