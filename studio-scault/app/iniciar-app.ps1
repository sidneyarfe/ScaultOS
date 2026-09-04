# studio.scault — abre o painel como um app de janela própria.
#
# 1. sobe o servidor local (servidor/index.js) escondido, se ainda não estiver
#    no ar na porta 3000 — quem já abriu pelo iniciar.bat não sobe de novo;
# 2. abre o painel numa janela do Chrome (ou Edge) em modo --app: sem barra de
#    endereço, sem abas, ícone próprio na barra de tarefas;
# 3. se foi este atalho que subiu o servidor, fica de babá (oculto) e derruba
#    ele quando a última janela --app do painel fechar. Servidor que já estava
#    no ar (iniciar.bat, ou outra janela) não é tocado.
#
# Chamado pelo studio.scault.vbs, que roda tudo sem piscar terminal.

$ErrorActionPreference = 'Stop'
$app     = $PSScriptRoot
$estudio = Split-Path $app -Parent
$porta   = 3000
$url     = "http://localhost:$porta"
# perfil do Chrome FORA do OneDrive: é uma pasta de cache que muda o tempo todo,
# sincronizar isso seria só churn.
$perfil  = Join-Path $env:LOCALAPPDATA 'studio.scault\janela'
$pidFile = Join-Path $app '_servidor.pid'
$logFile = Join-Path $app '_ultima-execucao.log'

function Log($m) { "$(Get-Date -Format 'HH:mm:ss')  $m" | Add-Content -Path $logFile -Encoding utf8 }
Set-Content -Path $logFile -Value '' -Encoding utf8

function Porta-No-Ar {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $porta); $c.Close(); return $true
  } catch { return $false }
}

function Avisar($texto) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($texto, 'studio.scault', 'OK', 'Error') | Out-Null
  } catch { Log "AVISO: $texto" }
}

# ---------------------------------------------------------------- servidor
$euSubi = $false
if (Porta-No-Ar) {
  Log 'servidor já estava no ar — reaproveitando'
} else {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    Avisar("Node.js não foi encontrado no PATH.`n`nInstale o Node ou abra o studio.scault pelo iniciar.bat.")
    exit 1
  }
  Log "subindo servidor: $node servidor/index.js"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName         = $node
  $psi.Arguments        = 'servidor/index.js'
  $psi.WorkingDirectory = $estudio
  $psi.UseShellExecute  = $false
  $psi.CreateNoWindow   = $true
  $psi.WindowStyle      = 'Hidden'
  $proc = [System.Diagnostics.Process]::Start($psi)
  Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii
  $euSubi = $true

  $limite = (Get-Date).AddSeconds(45)
  while (-not (Porta-No-Ar)) {
    if ($proc.HasExited) { Avisar("O servidor fechou sozinho ao subir (código $($proc.ExitCode)). Veja _ultima-execucao.log."); exit 1 }
    if ((Get-Date) -gt $limite) { Avisar('O servidor não respondeu em 45s. Veja _ultima-execucao.log.'); exit 1 }
    Start-Sleep -Milliseconds 400
  }
  Log 'servidor no ar'
}

# ---------------------------------------------------------------- janela
$navegador = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $navegador) {
  Log 'sem Chrome/Edge — abrindo no navegador padrão (sem modo app, servidor fica vivo)'
  Start-Process $url
  exit 0
}

Log "janela: $navegador"
# PS 5.1 não quota direito elemento de array com espaço — e o _janela mora sob
# "OneDrive\Área de Trabalho\...". Monta a linha de argumentos na mão, só o
# --user-data-dir precisa de aspas.
$argsNav = "--app=$url --user-data-dir=`"$perfil`" --no-first-run --no-default-browser-check --hide-crash-restore-bubble --window-size=1440,900"
# sem -Wait: o Chrome pode fazer handoff pro processo dono do perfil e sair na
# hora. Em vez de confiar no -Wait, vigio a condição real: existe alguma janela
# --app apontando pro painel?
Start-Process -FilePath $navegador -ArgumentList $argsNav

function Janela-Aberta {
  [bool](Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -like "*--app=$url*" })
}

# Servidor que já estava no ar não é meu pra derrubar — abri a janela e saí.
if (-not $euSubi) { Log 'servidor não é deste atalho — janela aberta, encerrando launcher'; exit 0 }

# espera a janela aparecer (até 20s), depois fica de babá até ela fechar
$apareceu = $false
$limite = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $limite) {
  if (Janela-Aberta) { $apareceu = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $apareceu) { Log 'janela não abriu em 20s — deixo o servidor no ar por segurança'; exit 0 }

Log 'janela aberta — de babá até fechar'
while (Janela-Aberta) { Start-Sleep -Seconds 3 }

# ---------------------------------------------------------------- desligar
if (Test-Path $pidFile) {
  $spid = [int]((Get-Content $pidFile).Trim())
  Log "janela fechada — derrubando servidor pid $spid (e filhos)"
  # mata os filhos diretos primeiro (o subprocesso do claude, se uma geração
  # estava rodando) pra não deixar órfão, depois o próprio node.
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $spid" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $spid -Force -ErrorAction SilentlyContinue
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}
