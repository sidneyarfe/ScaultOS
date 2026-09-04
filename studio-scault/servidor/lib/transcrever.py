# -*- coding: utf-8 -*-
"""Transcreve audio local com faster-whisper (large-v3-turbo, int8) — nao usar
whisper.cpp (~/.whisper-cpp): medido nesta maquina, um build de abr/2024 sem
otimizacao de CPU levou >5min pra 25s de audio; faster-whisper faz 6min de
audio em ~5min no total (com download do modelo na primeira vez).

Uso: python transcrever.py <audio.wav> [--idioma pt]
Saida: JSON no stdout — {"idioma":..., "duracao":..., "texto":..., "segmentos":[...]}
"""
import argparse
import json
import sys

from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument('audio')
ap.add_argument('--idioma', default='pt')
ap.add_argument('--modelo', default='large-v3-turbo')
args = ap.parse_args()

modelo = WhisperModel(args.modelo, device='cpu', compute_type='int8', cpu_threads=8)
segs, info = modelo.transcribe(
    args.audio, language=args.idioma, vad_filter=True, beam_size=5,
    condition_on_previous_text=False,
)

segmentos = []
partes = []
for s in segs:
    texto = s.text.strip()
    segmentos.append({'inicio': round(s.start, 1), 'fim': round(s.end, 1), 'texto': texto})
    partes.append(texto)

json.dump({
    'idioma': info.language,
    'duracao': round(info.duration, 1),
    'texto': ' '.join(partes),
    'segmentos': segmentos,
}, sys.stdout, ensure_ascii=False)
