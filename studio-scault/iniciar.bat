@echo off
cd /d "%~dp0"
title studio.scault
echo studio.scault - subindo em http://localhost:3000
echo (fecha esta janela pra desligar o servidor)
echo.
node servidor\index.js
pause
