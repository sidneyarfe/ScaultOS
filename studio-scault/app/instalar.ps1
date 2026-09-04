# Cria o atalho do studio.scault na área de trabalho e no menu Iniciar,
# com o ícone próprio. Rode uma vez (clique direito > "Executar com o
# PowerShell", ou pelo terminal). Rodar de novo só atualiza os atalhos.

$ErrorActionPreference = 'Stop'
$app = $PSScriptRoot
$vbs = Join-Path $app 'studio.scault.vbs'
$ico = Join-Path $app 'studio.ico'

if (-not (Test-Path $ico)) {
  Write-Warning "studio.ico não existe ainda — gere com: bash app/_icone/gerar.sh"
}

$ws = New-Object -ComObject WScript.Shell
$alvos = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'studio.scault.lnk'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\studio.scault.lnk')
)

foreach ($alvo in $alvos) {
  $dir = Split-Path $alvo -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $lnk = $ws.CreateShortcut($alvo)
  $lnk.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
  $lnk.Arguments        = '"' + $vbs + '"'
  $lnk.WorkingDirectory = $app
  $lnk.IconLocation     = "$ico,0"
  $lnk.Description       = 'studio.scault — painel de carrossel'
  $lnk.WindowStyle      = 7
  $lnk.Save()
  Write-Host "atalho criado: $alvo"
}

Write-Host ''
Write-Host 'Pronto. Abra pelo atalho "studio.scault" na área de trabalho.'
Write-Host 'Pra fixar na barra de tarefas: clique direito no atalho > Fixar na barra de tarefas.'
