# salvar-clipboard.ps1 — salva a imagem que está no clipboard num arquivo.
# Uso: powershell -File scripts/salvar-clipboard.ps1 "caminho/destino.png"
#
# Serve pro fluxo de post/carrossel quando a foto veio colada (print, WhatsApp,
# banco de imagens) e não existe como arquivo no disco.

param(
    [Parameter(Mandatory = $true)]
    [string]$Destino
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$img = [System.Windows.Forms.Clipboard]::GetImage()

if ($null -eq $img) {
    Write-Output "SEM IMAGEM NO CLIPBOARD - copie a imagem e rode de novo"
    exit 1
}

$pasta = Split-Path -Parent $Destino
if ($pasta -and -not (Test-Path $pasta)) {
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null
}

$img.Save($Destino, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "SALVO: $Destino ($($img.Width)x$($img.Height))"
