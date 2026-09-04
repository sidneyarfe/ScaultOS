---
name: carrossel
description: >
  Cria carrosséis e posts visuais pra Instagram, TikTok, LinkedIn com a identidade visual da marca.
  Gera HTML estilizado + renderiza em PNG 1080x1350 via Playwright, com legenda pronta no final.
  Suporta carrossel texto puro, carrossel com foto de banco (Pexels + Unsplash), foto gerada
  por IA (OpenAI), post único e carrossel estilo tweet/thread do X (print de post/conversa).
  Use quando o usuário pedir "carrossel", "post", "conteúdo pro instagram", "criar imagem",
  "gerar foto", "buscar foto", "foto de banco", "banco de imagens", "pexels", "unsplash",
  "imagem grátis", "post educativo", "carrossel estilo tweet", "thread", "print de tweet",
  "carrossel do twitter/X", ou /carrossel.
---

# /carrossel — Carrossel e posts visuais

Skill central de criação de conteúdo visual. Pega um tema → entrega HTMLs estilizados + PNGs prontos pra postar + legenda no padrão da marca.

## Dependências

- **Identidade visual:** `identidade/design-guide.md` — LER ANTES de criar qualquer visual
- **Contexto do negócio:** `_memoria/empresa.md`
- **Tom de voz:** `_memoria/preferencias.md`
- **Playwright:** pra renderizar HTML em PNG (`npx playwright screenshot` ou via `render.js`)
- **Pexels + Unsplash:** fotos de banco reais e gratuitas — `scripts/buscar-fotos.js` busca nos dois de uma vez (requer `PEXELS_API_KEY` e/ou `UNSPLASH_ACCESS_KEY` no `.env`)
- **OpenAI API (opcional):** pra gerar fotos por IA — só se o cliente tiver chave configurada
- **Outputs vão em:** `marketing/conteudo/<tipo>-<tema>-<YYYY-MM-DD>/`

---

## Tipos de conteúdo

Ao receber um pedido, identificar qual tipo se encaixa:

### 1. CARROSSEL TEXTO PURO
- **Quando usar:** posts educacionais, dicas, listas, explicações
- **Formato:** 1080x1350 (4:5) — sempre
- **Estilo:** tipografia clean, cores da marca alternadas, sem fotos

### 2. CARROSSEL COM FOTO
- **Quando usar:** apresentação visual, conteúdo aspiracional, capa com personagem
- **Formato:** 1080x1350 (4:5)
- **Estilo:** foto como capa com gradient overlay + slides internos no padrão alternado
- **Foto:** pode ser IA (gerada por OpenAI) ou real (passada pelo usuário)

### 3. POST ÚNICO
- **Quando usar:** frase de impacto, dado/estatística, depoimento, bastidores
- **Formato:** 1080x1350
- **Estilo:** varia conforme o conteúdo (citação, número grande, foto com overlay)

### 4. CARROSSEL ESTILO TWEET/THREAD
- **Quando usar:** conteúdo que precisa parecer post nativo do X/Twitter, não anúncio — forte pra
  campanhas de Atração/Engajamento onde "parecer anúncio" é o oposto do que se quer
- **Formato:** 1080x1350 (ou 1080x1440 pra casar com outras peças de uma campanha de ads que já
  use essa altura)
- **Estilo:** print de tweet/thread — perfil, texto, imagem (quando fizer sentido), engajamento.
  Guia completo, não resumir aqui: **`tweet-thread/TWEET-THREAD.md`**

Se o tipo não estiver claro, perguntar:
> "Que tipo de conteúdo? (1) carrossel texto, (2) carrossel com foto, (3) post único, (4) estilo tweet/thread"

---

## Modelagem por referência — regra que vence todas as outras

Quando o Sidney trouxer uma peça de referência (print, link, carrossel de terceiro) e pedir
pra **modelar**, a entrega tem que sair **idêntica à referência**. Não "inspirada", não "no
espírito de", não "adaptada pra nossa marca". Idêntica.

O que muda é o **conteúdo**: texto e foto. O que **não muda**:

- fonte (família, peso, caixa, kerning, entrelinha), escala e cor
- posição e largura do bloco de texto no quadro
- tratamento de fundo: foto cheia, overlay, gradiente, textura, cor chapada
- **a presença ou a ausência de cada elemento de moldura**

Esse último item é o que estraga peça modelada na prática. Se a referência não tem logo, a
peça não tem logo. Não tem contador de slide, não tem @ no rodapé, não tem régua, não tem
kicker, não tem tag de categoria, não tem "Arraste →". **Nada entra porque "carrossel costuma
ter".** Todo o "Estilo visual base" abaixo — Inter, kicker com kerning aberto, régua fina,
logo top-left, contador top-right — é default pra peça criada do zero e **não vale** em peça
modelada: ali ele é justamente o que faz a peça parecer template genérico de IA em vez da
referência.

**A identidade visual da marca não entra em peça modelada.** A única exceção é quando a
referência tem um **bloco de perfil** (avatar + nome + @, tipo print de tweet ou cabeçalho de
post): aí esses três campos recebem os dados de quem publica, e só eles. Logo solto no canto
não é bloco de perfil.

Antes de aprovar, **renderizar e comparar lado a lado com a referência**, eixo a eixo: família
tipográfica, peso, caixa, escala, entrelinha, âncora, largura, cor, fundo, moldura. Se em
algum eixo der pra dizer "parecido", ainda não está pronto.

No estúdio (`studio-scault/`) isso é automático: **Templates → Modelar referência** extrai a
pele (CSS + esqueleto), renderiza, compara com o print e corrige até bater. O template
gravado fica com `"tipo": "fiel"`, e peça gerada com ele passa por travas no servidor —
o CSS é injetado pelo servidor, classe inventada é recusada e `style` inline fora da
allowlist é removido. Ver `studio-scault/servidor/lib/pele.js`.

---

## Estilo visual base

O ScaultOS tem um estilo próprio — editorial, calmo, premium. Sem clip-art, sem emoji decorativo, sem gradiente arco-íris, sem template genérico de IA. `identidade/design-guide.md` sobrescreve esses padrões; quando o design-guide for vago ou estiver em branco, usar o que tá aqui (não parar pra pedir `/instalar` — o `/carrossel` funciona com defaults bons).

### Tipografia padrão

- **Fonte:** Inter (Google Fonts), pesos 400/500/600/700/800/900
- **Título de capa:** 90-100px, weight 900, line-height 0.98, letter-spacing **-0.04em**
- **H2 (slides internos):** 60-72px, weight 800, line-height 1.04, letter-spacing **-0.035em**
- **Corpo:** 20-24px, weight 500, line-height 1.5
- **Eyebrow/kicker:** 13-16px, weight 700-800, **UPPERCASE**, letter-spacing **0.22-0.32em**, cor de destaque
- **Page counter (canto sup. dir.):** 14-16px, weight 500-600, letter-spacing 0.18em, cor muted
- **Meta/handle (@):** 15-18px, weight 600

Regra do tipo: títulos grandes com kerning **apertado** (-0.035em), eyebrows pequenos com kerning **aberto** (0.22em+). Esse contraste é o coração do estilo.

### Cores padrão (quando design-guide for vago)

Paleta sóbria: fundo dark + off-white + **UMA** cor de destaque. Nunca quatro cores brigando.

- Fundo escuro: `#0E1116` ou `#1A1A1A`
- Fundo claro alternativo: `#F5ECD7` (cream) ou `#FAFAF7`
- Texto sobre escuro: `#FAFAF7`
- Texto sobre claro: `#1A1A1A` (h2) e `#444` (corpo)
- Destaque: cor da marca (uma só)

### Elementos visuais recorrentes

- **Régua fina** (3-4px de altura, 60-80px de largura, cor de destaque) entre kicker e h2 ou como divisor
- **Logo top-left + page counter top-right** em todos os slides
- **Border-top 1px** `rgba(255,255,255,0.12)` separando rodapé do conteúdo (em slides escuros)
- **Stamps circulares** (200x200, border 3px translúcida, rotate -10deg) pra selos/datas/dados
- **Tags/pills** uppercase, padding generoso, kerning 0.2em, pra rotular categoria do slide
- Padding base: 70-100px nas laterais

### Layouts nomeados

Vocabulário de layout — cada slide tem um nome. Variar entre eles pra criar ritmo:

- **CAPA** — eyebrow + título grande + subtítulo + @handle. Fundo: foto com gradient overlay (`rgba(12,10,9,0.55)` → `rgba(12,10,9,0.85)`) OU sólido (escuro/claro/destaque). Ver regra de alinhamento com foto logo abaixo
- **SOLO** — split horizontal: foto à esquerda 50% + texto à direita 50% (kicker + h2 + régua + parágrafo)
- **DUO** — texto em cima (kicker + h2 + régua + p) + 2 fotos lado a lado embaixo (ou 1 foto larga)
- **NÚMERO** — numeral gigante (200-320px, weight 800, cor de destaque) como elemento gráfico + h2 + parágrafo de apoio
- **CITAÇÃO** — aspas grandes em watermark + frase em h2 + atribuição
- **CTA FINAL** — fundo na cor de destaque, logo centralizado, headline curta, botão/CTA, telefone/@handle

**Ritmo de slide a slide:** alternar fundo escuro ↔ claro ↔ destaque. Nunca dois slides seguidos com o mesmo fundo.

### Regra de alinhamento — texto nunca sobrepõe o que importa na foto

Sempre que um slide tiver foto de fundo (capa ou qualquer layout com imagem), o texto não pode cobrir o elemento importante da composição — rosto, mãos, produto, dinheiro, objeto central, o que for o "assunto" da foto. Vale pra qualquer camada de texto: headline, subtítulo, kicker, número.

Como aplicar:
1. **Olhar a foto antes de posicionar o texto.** Identificar onde está o elemento importante e onde está o espaço vazio/neutro (parede, céu, chão, fundo desfocado) — é ali que o texto pousa.
2. **Ajustar o alinhamento pro espaço vazio**, não o contrário. Não existe posição fixa "padrão" (esquerda, direita, topo, base) — muda conforme a composição de cada foto. Se o espaço vazio é a metade esquerda, texto alinha à esquerda com largura limitada (não estica pro lado ocupado); se é embaixo, o texto desce; se é em cima, sobe.
3. **Limitar a largura da caixa de texto** (`max-width` ou `right` fechando antes do elemento) — não deixar o bloco de texto atravessar o slide inteiro só porque o container permite. Largura estica até a borda do espaço vazio, não além.
4. **Escurecer só onde precisa.** Se o espaço vazio já é claro/iluminado, aplicar um scrim/gradiente localizado ali (não a foto inteira) pra garantir contraste — sem esconder o elemento importante do resto da foto.
5. **Renderizar e olhar o PNG final antes de aprovar.** Este é o checkpoint que pega o erro: se o texto encostar ou cortar em cima do rosto/objeto, ajustar posição, largura ou tamanho de fonte e renderizar de novo. Não aprovar de olho só no HTML.

Isso vale pra qualquer foto de banco, gerada por IA ou enviada pelo usuário — a regra é sobre harmonia da composição, não sobre a origem da imagem.

---

## Estilo editorial (peça longa da Scault)

Os layouts genéricos acima são o default do ScaultOS. **Para peça longa e argumentativa da Scault — manifesto, ensaio, tese, apresentação de método — usar o estilo editorial**, que é a versão do sistema Scault aplicada a esse formato.

Vocabulário completo, regra da capa e tratamento de foto: **`estilo-editorial/LAYOUTS.md`**. Ler antes de começar.

Em uma linha: vazio grande entre blocos, três vozes tipográficas por slide, eixo centrado no respiro e à esquerda no argumento. Menos texto por slide, mais slides.

Layouts: `t-split` (2 âncoras) · `t-tri` (3 âncoras) · sanduíche (texto/visual/texto) · `.mid` (eixo centrado) · `.vs` (coluna dividida) · fecho de marca.

**Não escrever o HTML à mão.** O motor está em `estilo-editorial/build.py` — CSS completo, helpers de layout e componentes ilustrados (SERP, conversa de WhatsApp, interface do Kyreon, ícones lineares). Ele lê o post de um `post.json` na mesma pasta — formato e vocabulário de primitivas (`grade`, `coluna`, `vidro`, `ficha`, `chat`, `fluxo`, `comparativo`, `serie`, campo `destaque` pra palavra em ênfase, etc.) em **`estilo-editorial/POST.md`**. Ler antes de montar o primeiro post nesse estilo.

```bash
cp .claude/skills/carrossel/estilo-editorial/{build.py,render.js} "marketing/conteudo/<pasta>/"
cp "identidade/LOGO SCAULT.svg" "marketing/conteudo/<pasta>/_logo.svg"
cd "marketing/conteudo/<pasta>"
# escrever post.json (ver POST.md) na mesma pasta antes do passo abaixo
python build.py && NODE_PATH="C:/Users/sidne/node_modules" node render.js
```

`post.json` é o mesmo contrato que o Estúdio de Carrossel usa — o que essa skill gera pelo terminal abre direto no painel, e o que o painel salva volta pra cá sem conversão.

Duas armadilhas que já custaram retrabalho:

- **Nesse estilo o ritmo NÃO vem de alternar claro ↔ escuro** — a marca é escura e ponto (`identidade/design-guide.md`: fundo claro como base é proibido, e azul luminoso em área sólida grande também). O ritmo vem de alternar eixo, densidade e tipo de fundo
- **Capa com retrato quase nunca abre espaço sozinha.** Se a headline encosta na pessoa, a capa está errada. Ver a seção "A capa" do `LAYOUTS.md` — e baixar a foto em `--tamanho original`, porque o preview do Pexels pixela em qualquer zoom

Referência viva: `marketing/conteudo/carrossel-manifesto-eter-2026-08-06/`.

---

## Carrossel estilo tweet/thread

Formato à parte dos layouts genéricos acima — cards que imitam print de tweet/post do X, soltos
ou em sequência. Guia completo, checklist e template técnico: **`tweet-thread/TWEET-THREAD.md`**.
Ler antes de montar — a estrutura segue a skill original de perto, card simples: perfil, texto em
parágrafos, imagem quando fizer sentido. Nada além disso.

Duas coisas que fazem diferença nesse formato: **sequência é funil, não lista de fatos** (valor
real crescendo nos cards do meio, ponte, CTA final que apresenta a marca do zero pro público
frio) — e **todo card puxa pro próximo com uma construção de frase diferente**, sem seta, sem
revelar o conteúdo antes da hora no gancho de abertura. Ver `TWEET-THREAD.md` pra tudo isso, mais
a regra de onde reservar foto real de marca vs. banco de imagem.

Render reutilizável em `tweet-thread/render.js` (copiar pra pasta da peça antes de rodar). Se o
pedido tiver mais de uma peça (várias threads, card único, notícia), organizar **uma subpasta por
peça** dentro da pasta da campanha — ver seção de organização em `TWEET-THREAD.md`.

---

## Padrão do carrossel

**Estrutura base (5 a 10 slides):**
- **Slide 1:** layout `CAPA`
- **Slides internos:** usar 2-3 layouts diferentes entre `SOLO` / `DUO` / `NÚMERO` / `CITAÇÃO`
- **Slide final:** layout `CTA FINAL`

Antes de criar HTML: ler `identidade/design-guide.md`. Se estiver em branco, usar o "Estilo visual base" acima como default.

### Sequência de capas no feed (planejamento de grade)

Antes de definir a capa, considerar a **última capa publicada** pra alternar:
- claro → próxima é foto/escuro
- foto/escuro → próxima é cor da marca
- cor da marca → próxima é claro
- nunca duas capas iguais em sequência

Se o usuário não souber qual foi a última, perguntar.

### Linguagem (regra crítica)

Seguir `_memoria/preferencias.md`. Em geral: frases naturais, sem jargão de marketing, sem corporativês. O público real raramente fala "ticket médio", "performance", "B2B". Falar como ele fala.

### Legenda — sempre gerar junto

Ao terminar de renderizar os PNGs, gerar **automaticamente** a legenda do post e salvar em `legenda.md` na mesma pasta. **Não esperar o usuário pedir.** Estrutura padrão:

1. Hook (pergunta ou afirmação)
2. Contexto (1-2 frases sobre o conteúdo)
3. CTA pra arrastar ("Arraste pro lado e confere")
4. Bloco de oferta (diferenciais da empresa, contato)
5. Crédito de foto — a linha exata que o `buscar-fotos.js` imprimiu / gravou em `creditos.md` (**só se usou foto de banco**; obrigatório pela API dos dois bancos)
6. Hashtags (10-15 — público + nicho + local se aplicável)

---

## Workflow

### Passo 1 — Entender e planejar

1. Ler `_memoria/preferencias.md` e `_memoria/empresa.md`
2. Ler `identidade/design-guide.md` pra cores, fontes e logo
3. Identificar o tipo de conteúdo (1, 2, 3 ou 4)
4. Definir o tema e o ângulo

### Passo 2 — Texto

Escrever o conteúdo seguindo as regras de tom:

**Pra carrossel (5-10 slides):**
- Slide 1 (Capa): título impactante, máx 8 palavras. Oferecer 3 opções
- Slides internos: um insight por slide, frases naturais, sem bullet points
- Slide final: CTA + logo

**Pra post único:**
- Frase principal em destaque
- Contexto de apoio (se necessário)
- CTA sutil

**CHECKPOINT:** Mostrar o texto completo. Esperar aprovação antes do visual.

### Passo 3 — Fotos (se tipo 2)

Duas fontes possíveis. **Banco de imagem é o padrão** — é grátis, instantâneo e entrega gente real, que é o que sustenta o tom editorial da marca. IA só quando o banco não resolve.

| Usar **banco** quando | Usar **IA** quando |
|---|---|
| Precisa de pessoa real (cliente, equipe, público) | A cena não existe em banco (produto específico, situação muito nichada) |
| Cena comum: escritório, obra, sala de aula, rua, comida | Precisa de composição exata que você controla |
| Textura/fundo abstrato pra capa | O banco só devolve foto com cara de stock genérico |
| Quer velocidade e custo zero | — |

#### 3A — Foto de banco (Pexels + Unsplash)

O script busca **nos dois bancos de uma vez** e intercala os resultados. Os acervos são bem diferentes: o Pexels tem mais gente trabalhando e cena de negócio brasileira; o Unsplash tem mais textura, arquitetura, luz e enquadramento autoral. Pra capa editorial vale olhar os dois antes de decidir.

**1. Buscar.** O script baixa previews pequenos e lista os candidatos:

```bash
node scripts/buscar-fotos.js buscar "advogada mesa escritório" --orientacao portrait --n 8
```

- `--orientacao portrait` pra **CAPA** full-bleed (o slide é 4:5, foto em pé preenche sem cortar cabeça)
- `--orientacao landscape` pra layouts **SOLO** / **DUO** (a foto ocupa metade do slide)
- `--cor "#0E1116"` pra puxar fotos que já conversam com a paleta do design-guide (hex só funciona no Pexels; o Unsplash aceita nome — `black`, `teal`, `blue`…)
- `--n 8` é o total, dividido entre os bancos (4 de cada)
- `--fonte pexels` ou `--fonte unsplash` quando quiser só um — útil se um estourar a cota (o Unsplash em Demo dá 50 buscas/hora)
- **Rodar duas vezes: uma em português, outra com o termo em inglês.** O Pexels indexa em pt-BR, o Unsplash só em inglês — busca em português rende pouco lá. Termo em inglês costuma dobrar o resultado bom

**2. Olhar os previews.** O script salva os previews em `.fotos/<termo>/` e imprime o caminho. Ler as imagens (`Read`) e avaliar de verdade antes de mostrar ao usuário. Descartar na hora:

- Foto com cara de stock genérico: sorriso forçado, aperto de mão corporativo, gráfico falso na tela, gente de terno apontando pra lousa
- Composição sem respiro — o texto precisa de área limpa (céu, parede, mesa vazia) pra pousar em cima
- Foto com texto/marca/logo embutido
- Fotos com pouca resolução pro uso (ver aviso do passo 3)

Apresentar ao usuário as **2-3 melhores**, dizendo em que slide cada uma entraria e de qual banco veio.

**3. Baixar em alta** só a(s) escolhida(s). O ID já diz a fonte — numérico é Pexels, alfanumérico é Unsplash:

```bash
node scripts/buscar-fotos.js baixar 3184291 --out "marketing/conteudo/<pasta>" --nome capa
node scripts/buscar-fotos.js baixar Dwu85P9SOIk --out "marketing/conteudo/<pasta>" --nome capa
```

Gera `foto-capa.jpg` na pasta do conteúdo e escreve/atualiza `creditos.md` + `creditos.json` ali mesmo. Se o script avisar `⚠ menor que 2160px`, a foto vai pixelar em full-bleed — usar só em layout pequeno (DUO) ou escolher outra.

**Crédito é obrigatório nos dois bancos.** O script já monta a linha certa e imprime no final (`Lembra de pôr "Fotos: ..."`), também gravada em `creditos.md`. **Copiar essa linha**, não inventar outra — o Pexels se satisfaz com a marca (`Fotos: Pexels`), mas o Unsplash exige o nome do fotógrafo (`Fotos: Jawad Shaikh / Unsplash`). Entra no final da `legenda.md` (Passo 4), antes das hashtags.

Se o post for parar no blog do site, o `creditos.md` traz também o formato longo que o Unsplash pede (`Photo by X on Unsplash`, com link) — usar esse lá.

Se faltar chave, o script diz exatamente o que fazer — oferecer ao usuário configurar na hora (as duas são grátis, ~1 min cada) ou seguir sem foto/com IA. Uma chave só já basta pra rodar.

#### 3B — Foto por IA (OpenAI)

1. Montar prompt em inglês (a API funciona melhor em inglês)
2. Padrão genérico de prompt:

```
Professional [TIPO] photography of [ASSUNTO],
[DETALHES], [AMBIENTE/CONTEXTO],
[ESTILO DE LUZ] lighting, shallow depth of field,
shot from [ÂNGULO], [ESTILO/ESTÉTICA],
editorial quality
```

3. Gerar via script (se `scripts/gerar-imagem.js` existir):
```bash
node scripts/gerar-imagem.js "PROMPT" "marketing/conteudo/<pasta>/foto-<nome>.png"
```

Se não tiver o script ainda, instruir o usuário a configurar `OPENAI_API_KEY` no `.env` e criar o script (ou usar outra ferramenta de geração de imagem).

4. Mostrar a foto pro usuário antes de continuar.

**CHECKPOINT:** Foto aprovada → seguir. Se não, buscar outra (banco) ou ajustar prompt e regenerar (IA).

### Passo 4 — Criar visuais (HTML + PNG)

1. Criar **um único `carrossel.html`** com TODOS os slides como `<div class="slide">` dentro do mesmo arquivo. Inline CSS, Google Fonts como única dependência externa. Aplicar:
   - Cores e tipografia de `identidade/design-guide.md`
   - Mínimo 2 layouts diferentes (não repetir o mesmo em todos os slides)
   - Logo top-left + slide-counter top-right em todos os slides
   - Slide final: logo + CTA, fundo na cor principal

   **Pra incluir foto IA no HTML:**
   ```html
   <div class="slide" style="
     background-image: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.7)), url('foto-xxx.png');
     background-size: cover;
     background-position: center;
   ">
     <div class="content">
       <h2>Texto sobre a foto</h2>
     </div>
   </div>
   ```

2. Criar `render.js` na mesma pasta — script Node com Playwright que abre o HTML e tira screenshot de cada `.slide` em 1080x1350. Pode reutilizar `node_modules` de uma pasta anterior (não precisa rodar `npm install` toda vez):
```bash
NODE_PATH="<pasta-com-node_modules>/node_modules" node render.js
```

3. Em todo slide com foto de fundo, checar no PNG renderizado (não no HTML) se o texto sobrepõe algum elemento importante da imagem (rosto, mãos, produto, dinheiro, objeto central). Se sobrepuser, reposicionar/redimensionar o texto pro espaço vazio da composição e renderizar de novo antes de seguir — ver "Regra de alinhamento" acima.

4. Mostrar slide 1, 2 e o CTA final renderizados. Se aprovado, mostrar os intermediários.

### Passo 5 — Salvar e organizar

```
marketing/conteudo/<tipo>-<tema>-<YYYY-MM-DD>/
  texto.md              ← texto aprovado + legenda
  foto-<nome>.jpg       ← fotos de banco (Pexels/Unsplash) — .png se geradas por IA
  creditos.md           ← atribuição das fotos de banco (gerado pelo script)
  creditos.json         ← mesma info, pra reprocessar sem duplicar
  carrossel.html
  render.js
  instagram/
    slide-01.png → slide-NN.png
  tiktok/ (se pedido — formato 9:16)
    slide-01.png → ...
  legenda.md            ← legenda Insta+FB
  legenda-linkedin.md   ← (se pedido, mais formal)
```

### Passo 6 — Conexão com blog (opcional)

Depois de criar o conteúdo visual, perguntar:

> "Esse conteúdo dá pra virar artigo no blog também. Quer que eu crie a versão blog pra SEO?"

Se sim, chamar `/publicar-tema` com o mesmo tema.

---

## Regras

- **Peça modelada a partir de referência sai IDÊNTICA à referência** — muda só texto e foto.
  Nada de moldura que a referência não tem (logo, contador, @, régua, kicker, "arraste").
  A identidade da marca só entra em bloco de perfil (avatar/nome/@), se a referência tiver um.
  Conferir renderizado, lado a lado com o print, antes de aprovar. Ver "Modelagem por
  referência" acima — essa seção vence o "Estilo visual base" e o design-guide da marca
- Sempre ler `identidade/design-guide.md` antes de criar qualquer visual
- Peça longa e argumentativa da Scault (manifesto, ensaio, tese, método): usar o **estilo editorial** — ler `estilo-editorial/LAYOUTS.md` e gerar pelo `estilo-editorial/build.py`, nunca escrever o HTML à mão
- Carrossel estilo tweet/thread: ler `tweet-thread/TWEET-THREAD.md` antes de montar — sequência é funil (valor real → ponte → CTA que apresenta a marca do zero), todo card puxa pro próximo sem repetir a mesma construção de frase e sem seta, foto real de marca reservada pro card de ponte. Uma subpasta por peça se houver mais de uma no pedido
- Carrossel: 1080x1350 (4:5 retrato) — sempre, exceto tweet/thread casando com campanha de ads em 1080x1440 (ver `tweet-thread/TWEET-THREAD.md`). TikTok/Reels: 1080x1920 (9:16) — só quando pedido explicitamente
- Linguagem segue `_memoria/preferencias.md` estritamente
- Sempre considerar a sequência de capa no feed antes de definir capa nova
- Sempre gerar legenda automaticamente ao final, salvando em `legenda.md`
- Foto de banco é o padrão; IA só quando o banco não resolve
- Fotos de banco: sempre olhar os previews antes de mostrar ao usuário — descartar o que tem cara de stock genérico
- Fotos de banco: baixar em alta só depois de escolhida (não baixar as 8)
- Fotos de banco: buscar nos dois bancos (padrão do script) e, se o resultado vier fraco, repetir o termo em inglês — o Unsplash só indexa em inglês
- Fotos de banco: o crédito na legenda é a linha que o script gerou, copiada literal — nunca omitir, nunca reescrever (o Unsplash exige o nome do fotógrafo)
- Fotos de banco: nunca commitar `PEXELS_API_KEY` nem `UNSPLASH_ACCESS_KEY` — vivem só no `.env`
- Fotos IA e de banco: sempre pedir aprovação antes de usar no carrossel
- Fotos IA: prompts em inglês
- Fotos IA: nunca gerar fotos de pessoas/rostos identificáveis
- HTMLs: um único arquivo `carrossel.html` com todos os slides + `render.js` na mesma pasta. Inline CSS
- Render: reutilizar `node_modules` quando possível (não rodar `npm install` em cada pasta)
- Não repetir layout entre slides — usar variação visual
- **Foto de fundo em qualquer slide: texto nunca sobrepõe elemento importante da imagem** (rosto, mãos, produto, dinheiro, objeto central) — alinhamento do texto se ajusta ao espaço vazio da composição, não o contrário. Conferir no PNG renderizado antes de aprovar (ver "Regra de alinhamento" na seção de layouts)
