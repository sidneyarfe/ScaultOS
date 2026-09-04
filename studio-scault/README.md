# studio.scault

Painel local pra criar, editar e publicar carrossel de Instagram. O motor de IA
é a tua assinatura do Claude Code (Agent SDK, sessão logada — nunca API key
paga), o render é o mesmo `build.py` + Playwright que a skill `/carrossel` usa
pelo terminal, e a publicação reaproveita `scripts/postar-instagram.js` /
`postar-facebook.js` sem reescrever nada da Graph API.

## Como abrir

**Como app** (janela própria, ícone no menu Iniciar, sem terminal): rode uma vez
`powershell -ExecutionPolicy Bypass -File app\instalar.ps1` e depois é só o atalho
**studio.scault** na área de trabalho. Detalhes e desinstalação em `app/README.md`.

**Pelo terminal** (janela do terminal fica aberta segurando o servidor):

```bash
cd studio-scault
npm start
```

Nos dois casos abre em [http://localhost:3000](http://localhost:3000) — é o mesmo
servidor. Pelo `.bat`, fechar o terminal desliga; pelo app, fechar a janela
desliga (se foi o app que subiu o servidor).

---

## Onde fica cada coisa

Tudo que é da ferramenta mora nesta pasta. Só três coisas ficam fora, de
propósito, porque são **compartilhadas com as skills do terminal** — duplicar
seria criar duas versões que divergem no dia seguinte:

| Fora daqui | Por quê |
|---|---|
| `.claude/skills/carrossel/estilo-editorial/build.py` e `render.js` | motor de render, também usado pelo `/carrossel` no terminal |
| `scripts/buscar-fotos.js`, `google-imagens.js` | banco de imagens, também usado por outras skills |
| `scripts/postar-instagram.js`, `postar-facebook.js` | publicação, também usada pelo `/aprovar-post` |
| `.env` da raiz | chaves de API — nunca duplicar |

```
studio-scault/
  iniciar.bat          abrir pelo terminal (segura o servidor na janela)
  app/                 casca de desktop: atalho + ícone + janela --app (ver app/README.md)
    studio.svg           fonte do ícone (= favicon do painel)
    studio.ico           ícone dos atalhos (gerado)
    iniciar-app.ps1      sobe o servidor escondido + abre a janela + desliga ao fechar
    studio.scault.vbs    roda o .ps1 sem piscar terminal (alvo do atalho)
    instalar.ps1 / desinstalar.ps1
  package.json         express + multer + claude-agent-sdk
  servidor/
    index.js           Express — todas as rotas /api/*
    lib/
      marcas.js          registro de marca (studio-scault/marcas/*.json)
      motor.js            build.py + render.js + sidecar de design + ponte DOM<->post.json
      editor-html.js       marca o DOM (data-sl/data-editid/data-blk) e aplica edições
      agente.js             Claude Agent SDK — settingSources:[], tools restritas, sem API key
      imagens.js             Pexels/Unsplash + Google Imagens
      publicar.js             postar-instagram/facebook + conta de destino + guardrails
      exportar.js              abrir a pasta no Explorer + copiar a peça pra fora do projeto
      acervo.js                lista posts do estúdio + marketing/conteudo/
      templates.js              salvar/listar/aplicar/apagar modelo
      contrato.js                assinatura real das primitivas (build.py --contrato)
      ingest.js                  link/áudio/youtube/print -> referencias/*.md
      extrator.js                 prints -> pele fiel (paleta medida + visão + conferência)
      pele.js                      travas de fidelidade da peça modelada + bloco de perfil
      arquivos.js                  apagar arquivo/pasta (ver "fs.rmSync" abaixo)
      jobs.js                       jobs em memória + SSE de progresso
      transcrever.py                 faster-whisper
      paleta.py                       PIL — paleta dominante medida (imagem)
      paleta-documento.py             hex do texto + swatch de página — manual de marca em PDF/DOCX/TXT
  painel/
    index.html         estrutura + biblioteca de ícones SVG (<symbol>)
    app.js             estado, canvas editável, arraste, overrides ao vivo
    styles.css         tokens da Scault; canvas em grafite neutro
  marcas/
    *.json             7 marcas cadastradas
    avatares/          foto de perfil em cache (puxada da Graph API 1x)
  templates/           modelos salvos (.json + .png de capa)
  acervo/              posts criados aqui, por marca/slug
  _fixtures/           regressão pixel-a-pixel do motor de render
```

---

## O que dá pra fazer

**Criar** — briefing por texto, link, áudio (transcrição local) ou print;
objetivo, prompt específico do post, nº de slides (inclusive **1**, pra post de
imagem única — ver "post de imagem única" abaixo), formato (feed 4:5 ou stories
9:16), template opcional, CTA e assinatura de rodapé. O progresso é real (SSE
em cima do stream do Agent SDK), não um timer fake. Antes de chamar o agente o
servidor já baixa 2-3 fotos licenciadas do tema. O briefing inteiro (tema,
objetivo, prompt, opções) fica salvo na pasta do post (`estudio-briefing.json`)
e volta pro formulário sempre que o post é reaberto — mesmo depois de fechar a
aba ou recarregar a página.

**Editar** — a prévia é o slide de verdade num iframe (CSS, fontes e fotos da
peça), não uma captura de tela. É **modo de edição de verdade**: trocar de
slide, ajustar design, mover bloco — nada disso renderiza sozinho. As
alterações ficam guardadas (em todos os slides ao mesmo tempo) até você clicar
**Salvar alterações** (ou Ctrl+S), que é quando o post é re-renderizado de
fato. **Desfazer alterações** reverte tudo que ainda não foi salvo pro último
estado gravado; **Fechar post** (× ao lado do nome) sai do post e limpa o
formulário de criação, sem precisar recarregar a página pra começar outro do
zero:

- clicar no texto edita no lugar; selecionar um trecho abre a barra flutuante
  com **destaque** (cor de post inteiro, com fallback automático pra uma cor
  padrão se nenhuma tiver sido escolhida ainda — sem isso o destaque saía só
  em negrito, sem cor, no motor genérico), tamanho, alinhamento, cor, **sombra**
  (stepper de intensidade, ajuda a ler texto sobre foto) e reescrita por IA;
- arrastar um bloco move ele, com **área segura**: enquanto o cadeado no topo
  está fechado, nada passa da margem; encaixa nas bordas e no centro; as setas
  do teclado ajustam de 1 em 1px (10 com shift);
- aba **Design**: cor de fundo e de texto do slide, filtros da foto (brilho,
  contraste, saturação, P&B, desfoque), enquadramento, cor de destaque do post,
  fonte de título e de corpo, margem da área segura;
- aba **Camadas**: esconder/mostrar elemento;
- aba **Legenda**: editar e reescrever com IA;
- trilha embaixo: reordenar arrastando, duplicar, apagar slide;
- **barra de IA flutuante**, entre o canvas e a trilha — um campo só, com
  toggle "Este slide / Carrossel inteiro" decidindo o escopo do pedido (texto,
  design e layout, não só texto). Substituiu dois campos separados que existiam
  antes (um fixo em cima, outro dentro da aba Editar) — mesma pergunta, um
  elemento só;
- banco de fotos com **3 fontes**: Pexels/Unsplash (licenciado), Google Imagens
  (não licenciado, só referência) e **"Da marca"** — fotos que já existem no
  sistema, varrendo a pasta do próprio cliente (`clientes/<Nome>/`, recursivo,
  ignora `node_modules`/build), sem precisar sair do estúdio pra ir buscar no
  Explorer. Ver `pastaDaMarca`/`buscarMarca` em `servidor/lib/imagens.js`.

**Publicar** — mostra a conta de destino de verdade (@, nome e seguidores,
puxados da Graph API) antes de qualquer clique, e publica sempre em duas
etapas.

**Exportar** — a saída pra quando o post *não* vai direto pro ar: aprovação do
cliente, WhatsApp, deck, agendamento na mão pelo Business Suite. O rodapé do
editor mostra o caminho da pasta dos PNGs (clicar copia), com dois botões:

- **Abrir a pasta** — abre a `instagram/` do post no Explorer;
- **Exportar…** — copia pra qualquer pasta do computador. O destino sai do
  seletor nativo do Windows ou de um caminho colado; dá pra criar uma subpasta
  com o nome do post e renomear os slides (`<slug>-01.png`), e a prévia mostra
  o caminho final antes de gravar. Arquivo com o mesmo nome no destino é
  pergunta, não sobrescrita silenciosa.

Os mesmos dois botões estão em cada card do Acervo, pra pegar os arquivos sem
abrir o post no editor.

**Templates** — modelar uma referência soltando os prints (um por slide, na
ordem), ou salvar um post seu como modelo. São dois tipos diferentes, e a
galeria marca qual é qual:

- **fiel** (referência importada) — carrega o CSS e o esqueleto de slide da
  referência. Peça gerada com ele sai visualmente IDÊNTICA: muda o texto e a
  foto, e mais nada. A identidade da marca só entra se a referência tiver bloco
  de perfil (avatar/nome/@). Ver "Modelar é reproduzir" abaixo.
- **casca** (post seu salvo como modelo) — só a estrutura, vestida com a
  identidade de quem publica. Faz sentido aqui porque o visual já é o da Scault.

A modelagem é **fiel** também na contagem: o template
sai com exatamente um slide por imagem enviada. Uma imagem só vira um template
de **um slide** — post de imagem única, que é formato legítimo e publica igual
(o `postar-instagram.js` já trata `urls.length === 1`), não um carrossel a
completar. Um slide de post único costuma carregar texto grande e âncora
centrada justamente porque não há slide seguinte pra combinar — inventar
desenvolvimento e fecho em cima dele produz um carrossel que não fecha.

Post de imagem única também dá pra pedir direto, sem passar por template:
escolher **"1"** no seletor de Slides na tela de Criar. O prompt que vai pro
agente muda pra valer — nos dois motores (`gerarPostJson` e
`gerarCarrosselGenerico`, em `servidor/lib/agente.js`) — pra "a mensagem
inteira cabe neste quadro, sem abertura e fechamento separados", em vez de só
mandar "1 slides" num prompt escrito pra carrossel. Sem essa distinção o
agente tentava encaixar um "capa + fecho" que não cabe num quadro só.

---

## Decisões que não são óbvias

**O contrato das primitivas vem do `build.py`, medido — não copiado.** O
`POST.md` lista os NOMES das primitivas e manda "ver build.py" pros argumentos,
mas quem escreve o `post.json` (o agente, no extrator e no readaptar) nunca
recebia o `build.py`. Sem a assinatura na mão ele escreve um nome plausível, e
o motor só reclama lá na frente, com um `TypeError` de Python no meio do
render. Foi assim que o template `decisao` entrou na galeria com
`ficha(itens=...)` e `comparativo(itens_a=...)` no lugar de `linhas` /
`linhas_a`: o erro aparecia minutos depois, dentro do "aplicar template", e
como a requisição ficava aberta o tempo todo (agente + 2 rodadas de
self-healing) o navegador desistia antes, com um `Failed to fetch` que não
dizia nada. Agora `python build.py --contrato` imprime a assinatura de verdade,
lida com `inspect.signature` do próprio `REGISTRY`: ela vai no prompt do agente
(pra ele não chutar) e o `contrato.js` confere todo template contra ela antes
de gravar e antes de aplicar. Nome de argumento trocado com alvo inequívoco é
remapeado na hora (`itens` → `linhas`); qualquer outra coisa vira erro imediato
e legível, em vez de uma espera de minutos.

**Modelar é reproduzir, não se inspirar.** O extrator nasceu extraindo só a
"gramática de layout" — de propósito: *"não a marca, não a cor final… cor e
fonte finais vêm da marca de quem publica"*. Ele traduzia a referência pro
vocabulário do estilo-editorial da Scault, e no motor genérico o template ainda
era degradado a uma frase de prompt (*"use como referência de arco narrativo,
não de HTML/CSS"*). O agente recebia contagem de slides e nome de classe, e
preenchia o resto com o default da skill: Inter, kicker, régua, logo no topo,
@ no rodapé.

Foi assim que uma peça de cliente saiu "parecida" com uma
referência que era foto cheia + serifada condensada em caixa alta, sem moldura
nenhuma. A conferência que teria pego isso existia (`convergir`), mas aceitava
"bateu razoavelmente" e o painel nunca chamava a rota — código morto na hora
exata em que serviria.

Hoje a modelagem extrai a PELE: CSS de verdade (tipografia medida em px sobre o
quadro, cor medida por `paleta.py` em todos os slides, âncora, tratamento de
foto) + um esqueleto de slide por imagem. Depois renderiza, compara com o print
eixo a eixo (família, peso, caixa, escala, entrelinha, âncora, cor, fundo,
moldura) e corrige em loop até bater.

Na hora de gerar peça, a fidelidade não é pedida ao agente — é imposta em
`pele.js`. O agente escreve só o corpo dos slides; o servidor injeta o CSS
canônico, recusa classe que não existe na pele, filtra `style` inline por
allowlist (só o que aponta arquivo de foto passa) e preenche os nós
`data-perfil` com o cadastro da marca. Moldura que a referência não tem não
aparece, porque não há CSS pra ela.

**Importar template é copiar, não completar.** O extrator montava um "arco" de
4 a 6 slides a partir de UM print — inventava capa, desenvolvimento e fecho que
não estavam na referência. Os slides inventados eram exatamente onde moravam os
argumentos errados acima, e não é coincidência: o agente inventando estrutura
inventa também o vocabulário dela. Hoje a regra está no prompt *e* travada no
código (`extrator.js`): N imagens → N slides. Uma imagem só vira template de um
slide, porque post de imagem única é um formato de verdade — e um quadro desses
carrega texto grande e âncora centrada justamente porque não tem slide seguinte
pra combinar.

**O sidecar `estudio-edicoes.json`.** No motor editorial o `build.py` reescreve
o `carrossel.html` inteiro a cada render. Ajuste de design escrito no HTML
morreria no render seguinte. Então tamanho de fonte, cor, filtro e afins ficam
num sidecar dentro da pasta do post e são reaplicados como um único
`<style id="est-overrides">` *depois* do build e *antes* do screenshot. Efeito
colateral bom: todo ajuste é reversível — tirar do sidecar some com a regra,
sem sujeira inline no HTML da peça.

**Texto vai pro post.json, não pro HTML.** No motor editorial o conteúdo mora
no `post.json`. Quem casa "elemento do DOM" com "nó do post.json" é o servidor
(`motor.js`), pelo `data-txt` que o `build.py` emite, com casamento por texto
como reserva pros argumentos de primitiva (`rotulo(texto=...)`). A versão
anterior tentava correlacionar contando elementos do DOM — errava sempre que o
slide tinha rodapé, e como ela conferia as contagens antes de gravar, desistia
calada: digitar na prévia não fazia nada.

**`fs.rmSync` não funciona nesta pasta.** Medido: dentro do OneDrive,
`fs.rmSync(caminho, {force:true})` retorna sem erro e o arquivo continua lá
(`fs.unlinkSync` funciona). Quatro coisas dependiam disso e estavam quebradas
em silêncio — inclusive a limpeza de PNGs antigos, que deixava slides
fantasmas na pasta e mandava eles pro Instagram. Toda remoção passa por
`lib/arquivos.js`.

**O canvas é grafite, não branco nem preto Scault.** A peça em edição é do
cliente: um chrome colorido tinge a percepção da cor dela. Mas branco também
não serve — destoa do resto e cega ao lado de um painel escuro. Grafite neutro,
dessaturado, com anel claro em volta do slide pra separar peça de fundo.

**A prévia zera o `<body>` da peça.** O `carrossel.html` é feito pra ser aberto
inteiro no navegador, com os slides empilhados: o motor editorial usa
`body{background:#000;display:flex;gap:28px;padding:28px}` e o genérico costuma
pôr `.slide{margin:0 auto 48px}`. Isso é respiro ENTRE slides e não entra no
PNG (o `render.js` captura por elemento). Na prévia, que mostra um slide só num
iframe do tamanho exato dele, esse respiro virava sobra — o padding de 28px
empurrava o slide pra baixo e aparecia uma faixa branca no topo do card.
`RESET_PREVIA` (em `painel/app.js`) neutraliza html/body, e o iframe é
transparente: qualquer sobra mostra o grafite do canvas, nunca branco.

**O editid é recalculado do zero a cada varredura.** O marcador antes só
numerava quem ainda não tinha `data-editid`, e o contador não avançava nos que
já tinham. Assim que a árvore mudava, os elementos novos recomeçavam do 0 e
colidiam com os antigos — dois campos com o mesmo id, `querySelector` pegando o
primeiro, e editar um gravava por cima do outro.

**Crédito de foto viaja junto na exportação.** `creditos.md` e `fontes.md`
entram na cópia sempre que existem — sem checkbox pra desligar. É a mesma regra
que o guardrail de publicação aplica e que o `CLAUDE.md` da raiz trata como
não-opcional: exportar só os PNGs empurraria o problema pro momento em que
alguém sobe a peça na mão, semanas depois, sem ter como saber de quem era a
imagem.

**O seletor de pasta é do Windows, não do navegador.** O Chrome não tem um que
sirva: `showDirectoryPicker()` devolve um handle, não um caminho, e
`<input webkitdirectory>` entrega os arquivos de dentro sem dizer onde a pasta
fica. Como o servidor roda na máquina, o diálogo nativo resolve — via
PowerShell, com um `Form` topmost como dono (sem dono ele abre ATRÁS do Chrome
e o clique parece não fazer nada) e `[Console]::OutputEncoding` em UTF-8. Sem
esse encoding o caminho volta na codepage do console: `Área de Trabalho` —
justamente a pasta pra onde mais se exporta — voltava corrompida e a validação
dizia que a pasta não existe.

**O servidor escuta só em 127.0.0.1.** Era `0.0.0.0` (padrão do Express). A
exportação criou uma rota que grava arquivo em qualquer pasta do computador;
deixar isso aberto pra rede seria oferecer pro Wi-Fi inteiro o que só o
navegador desta máquina precisa.

**Conta de cliente sem sufixo no `.env` é bloqueio, não fallback.** Os scripts
de publicação caem nas chaves sem sufixo quando não recebem `--conta` — que são
a conta da própria Scault. Publicar um post de cliente assim mandaria o
carrossel pro `@scault.mkt` sem avisar. O painel mostra o motivo e desabilita
o botão.

**Trocar de slide não pode disparar render.** A primeira versão do editor
pedia pra escolher entre "descarta a alteração" ou "salva agora" toda vez que
você clicava noutro slide — porque o editid é recalculado do zero a cada
`build.py` (ver acima), então qualquer edição pendente só é válida contra o
HTML que já está na tela, e um render no meio do caminho a invalidaria. A
solução não foi relaxar essa trava (continua valendo: build.py só roda no
"Salvar alterações"), foi guardar as edições pendentes — texto, posição de
bloco, override de design — na estrutura em memória do painel (por
editid/slide, não por "slide atual"), e reaplicá-las por cima do HTML original
toda vez que um slide é (re)carregado no canvas (`aplicarEdicoesPendentesAoVivo`
em `painel/app.js`). Os overrides de design já funcionavam assim, sem
querer — só texto digitado e posição arrastada é que sumiam ao voltar num
slide, porque eram aplicados direto no DOM ao vivo, não guardados em lugar
nenhum que sobrevivesse a recarregar o `srcdoc` do iframe.

**O briefing também precisa sobreviver a fechar a aba.** Antes, tema, objetivo,
prompt, nº de slides, formato, CTA, rodapé, modelo de IA e template escolhidos
existiam só na memória do navegador enquanto durava UMA geração — o servidor
recebia esses campos no `POST /api/gerar` e não gravava nada com eles depois
de usar. Reabrir o mesmo post no dia seguinte (ou só recarregar a página)
mostrava o formulário de criação em branco, sem jeito de saber com que
instrução aquele post tinha sido gerado. Agora grava num sidecar
(`estudio-briefing.json`, mesma ideia do `estudio-edicoes.json`) na hora que a
pasta do post é criada, e tanto o fim da geração quanto a reabertura do post
(`GET /api/post`) devolvem esse campo — o painel usa pra repor o formulário
(`restaurarBriefing` em `painel/app.js`). "Fechar post" é o único lugar que
LIMPA o formulário de volta pro branco (`limparBriefing`) — abrir um post
existente faz o oposto, mostra o briefing que gerou ele.

**A pasta "da marca" pra busca de foto é a raiz do cliente, não a pasta do
`identidade_fonte`.** `marcas/*.json` aponta o design-guide/CLAUDE.md de cada
marca em `identidade_fonte` (ex: `clientes/Acme/identidade/design-guide.md`),
mas foto de conteúdo de verdade normalmente mora em pastas IRMÃS desse arquivo
— `site/`, `fotos/`, `conteudo/` — não dentro da pasta de identidade. Por isso
`pastaDaMarca` (`servidor/lib/imagens.js`) sobe até `clientes/<Nome>/` inteiro
quando `identidade_fonte` começa com `clientes/`, em vez de usar só o
`path.dirname` do arquivo. A varredura recursiva ignora `node_modules`, `.git`,
`.next`, `dist`, `build` — pasta de cliente que também é o código-fonte de um
site (React/Next) carrega centenas de ícone de biblioteca que não são foto
nenhuma, e um teto de tamanho mínimo (8KB) filtra favicon/logo pequeno pelo
mesmo motivo. Pra Scault (marca própria, `tipo: "agencia"`), `identidade_fonte`
não começa com `clientes/` — cai no fallback (pasta do próprio arquivo de
identidade), que hoje não tem foto nenhuma; se um dia isso importar, o ajuste é
nesta mesma função.

**Destaque sem cor escolhida virava só negrito.** `.acc`/`.est-acc` (a classe
que marca um trecho como destaque) não tem estilo próprio nenhum no motor
genérico — só ganha cor via o override "cor de destaque" do post, que o
usuário configura à parte na aba Design. Clicar em "destaque" antes de nunca
ter mexido nesse campo aplicava a classe, mas sem cor nenhuma pra ela usar, o
CSS caía no fallback `font-weight:700` — parecia que o botão não tinha feito
nada. Agora, aplicar destaque sem cor configurada já define a cor de destaque
do post pra um padrão (`ACENTO_PADRAO` em `painel/app.js`, mesmo valor que já
aparecia — só visualmente — no seletor da aba Design) em vez de deixar
`font-weight` sozinho segurando a barra. É uma mudança de ESTADO de verdade
(`estado.overridesPendentes.acento`), não um CSS-only fallback — por isso o
Design tab e o render final (`montarCssOverrides` no servidor) concordam com o
que a prévia mostrou.

---

## Marcas cadastradas

| Marca | Motor | Por quê |
|---|---|---|
| Scault | `estilo-editorial` | é a marca nativa do motor (dark/metal/mesh) |
| Acme (exemplo) | `carrossel-generico` | identidade própria, documentada no `CLAUDE.md` de cada cliente: **não** é a da Scault |

Publicação: os sufixos de conta do `.env` (`_<SLUG>`) estão referenciados em cada
`marcas/*.json`. Marca sem conta Meta configurada fica com publicação bloqueada
até isso existir.

Cliente novo entra nessa tabela automaticamente: `/novo-projeto` cadastra a
marca junto com a pasta em `clientes/`, não precisa editar `marcas/*.json` na
mão (ver "Integração com o studio.scault" em
`.claude/skills/novo-projeto/SKILL.md`). Não existe rota nem tela no painel
pra CRIAR marca — só listar (`GET /api/marcas`); cadastro continua sendo
escrever o JSON, só que quem escreve normalmente é a skill, não uma pessoa.

**Editar a identidade de uma marca já cadastrada, isso sim tem tela**: o lápis
ao lado de cada marca no seletor (ou o do cabeçalho, pra marca atual) abre
nome, @ do Instagram, avatar e a paleta de cores dos 6 tokens do motor
estilo-editorial (`base/panel/accent/text/muted/dim` — ver `_TOKENS_MARCA` no
`build.py`). Rotas: `PUT /api/marcas/:slug` (campos) e
`POST /api/marcas/:slug/avatar` (foto, sobe na hora, sem esperar Salvar). A
paleta também dá pra importar de uma referência — imagem (mede pixel de
verdade, reaproveitando `paleta.py`) ou manual de marca em PDF/DOCX/TXT
(`servidor/lib/paleta-documento.py`: lê hex escrito no texto e a cor
renderizada da página, descartando branco/preto de fundo de papel) — em
`POST /api/paleta/extrair`. Clicar num campo de cor escolhe o alvo, clicar
numa sugestão preenche; nada é salvo até apertar Salvar. Em marca de cliente
(`carrossel-generico`) a paleta fica só cadastrada como referência — quem
manda no visual continua sendo o `CLAUDE.md`/design-guide de cada um.

---

## O que ficou de fora de propósito

- **Canvas livre de verdade (redimensionar, girar, camadas arbitrárias)** — o
  editor trabalha na estrutura que o layout já tem: texto, destaque, estilo,
  posição de bloco. Um editor vetorial completo é outro projeto.
- **Ícones, molduras e botões avulsos** — precisaria de uma biblioteca de
  componentes com a identidade de cada cliente, não de um clipart genérico.
- **Empacotamento Electron** — localhost primeiro.
- **Comparação pixel a pixel automática** na conferência de fidelidade — hoje
  quem compara referência e render é o agente, lendo as duas imagens. Um
  diff numérico (SSIM por região) daria um critério de parada objetivo.

## Testar

```bash
# regressão visual do motor de render (16 slides do carrossel do Kyreon)
bash studio-scault/_fixtures/testar-regressao.sh

# depois de mudar o motor de propósito: conferir a olho e regravar a base
bash studio-scault/_fixtures/testar-regressao.sh --congelar
```

Duas coisas que este teste aprendeu na marra, e que valem pra qualquer teste
de render que se escreva aqui:

- **Toda entrada é congelada em `_fixtures/`** (post.json, fotos, `_logo.svg`).
  A versão anterior lia de `marketing/conteudo/`, que é pasta viva — o post de
  origem do Kyreon é aberto e re-renderizado pelo painel. A linha de base
  andava sozinha e o teste acusava regressão num motor intacto.
- **A comparação tem tolerância** (`comparar.py`). O Chrome não rasteriza
  gradiente de forma determinística entre processos: com tudo congelado e o
  `carrossel.html` byte a byte idêntico, duas rodadas seguidas dão ~1% dos
  pixels com 1-2 níveis de diferença em área de gradiente escuro. Invisível a
  olho nu, suficiente pra mudar o hash. Comparação exata dava falso positivo em
  uma rodada a cada três — e teste que dá alarme falso é teste que ninguém
  olha. O critério atual ignora ruído de até 6 níveis e pega qualquer mudança
  real de texto, cor, layout ou foto.
