# studio.scault como app de desktop

Deixa o painel abrir como um programa: ícone próprio na área de trabalho e no
menu Iniciar, janela sem barra de navegador, sem terminal aberto atrás.

Por baixo continua sendo o mesmo servidor local (`servidor/index.js`) + o painel
no Chrome — nada de Electron, nada duplicado. O que este pacote adiciona é só a
casca de "abrir/fechar".

## Instalar

```powershell
powershell -ExecutionPolicy Bypass -File app\instalar.ps1
```

Ou clique direito em `instalar.ps1` → **Executar com o PowerShell**. Cria os dois
atalhos apontando pro `studio.scault.vbs`. Rodar de novo só atualiza os atalhos.

Pra fixar na barra de tarefas: clique direito no atalho → **Fixar na barra de
tarefas**.

## Como funciona ao abrir

`studio.scault.vbs` → `iniciar-app.ps1`, sem piscar terminal:

1. porta 3000 já no ar → reaproveita o servidor (quem abriu pelo `iniciar.bat`
   continua dono dele);
2. porta livre → sobe `node servidor/index.js` escondido e espera responder;
3. abre o painel numa janela do Chrome (ou Edge) em modo `--app`, com perfil
   dedicado em `%LOCALAPPDATA%\studio.scault\janela` (fora do OneDrive);
4. ao fechar a janela: se foi este atalho que subiu o servidor **e** não há outra
   janela do app aberta, derruba o servidor. Senão, deixa vivo.

Log da última abertura em `app/_ultima-execucao.log`.

## Ícone

Fonte única: `app/studio.svg` (mesmo desenho do favicon do painel). Pra
regenerar `studio.ico` e os `painel/icone-*.png` depois de mexer no SVG:

```bash
bash app/_icone/gerar.sh
```

Precisa de `playwright-core` (em `C:/Users/sidne/node_modules`) e Pillow (já é
dependência do projeto).

## Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File app\desinstalar.ps1
```

Remove os atalhos e o perfil da janela (`%LOCALAPPDATA%\studio.scault`). Não
toca no código nem no acervo. O `iniciar.bat` continua funcionando como sempre.
