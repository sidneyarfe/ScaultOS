# Remove os atalhos do studio.scault e o perfil da janela.
# Não mexe no código nem no acervo.

$ErrorActionPreference = 'SilentlyContinue'
$app = $PSScriptRoot

@(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'studio.scault.lnk'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\studio.scault.lnk')
) | ForEach-Object {
  if (Test-Path $_) { Remove-Item $_ -Force; Write-Host "removido: $_" }
}

Remove-Item (Join-Path $env:LOCALAPPDATA 'studio.scault') -Recurse -Force
Remove-Item (Join-Path $app '_servidor.pid') -Force
Remove-Item (Join-Path $app '_ultima-execucao.log') -Force
Write-Host 'atalhos e perfil da janela removidos.'
