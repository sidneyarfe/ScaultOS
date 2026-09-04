# Carrossel estilo tweet/thread

Formato dentro do `/carrossel`: cards que imitam print de tweet/post do X (Twitter), soltos ou em
sequência. Bom pra conteúdo que precisa parecer nativo/orgânico — sem cara de anúncio —
especialmente em campanhas de Atração/Engajamento, onde "parecer um anúncio" é o oposto do que se
quer.

Adaptado de uma skill genérica de terceiros (`twitter-carousel.skill`, pensada pro ambiente
claude.ai com upload manual e Python) pro pipeline do ScaultOS — HTML + Playwright local, fotos do
projeto ou dos bancos via `scripts/buscar-fotos.js`, sem passo de upload manual. Fora essa troca
de pipeline, **a estrutura visual segue a skill original de perto** — card simples: perfil, texto
em parágrafos, imagem quando fizer sentido. Nada além disso.

**Também disponível como template no studio.scault** (`Templates` → `tweet-thread` para
sequência de 4 cards no arco de funil, `tweet-solo` para card único) — `tipo: "fiel"`, perfil
(avatar/nome/@) preenchido automaticamente pelo servidor a partir do cadastro da marca (ver
`studio-scault/servidor/lib/pele.js`). Bom ponto de partida pra gerar direto no painel; pra
sequência de tamanho diferente de 4 cards, ou pra escrever fora do estúdio, seguir este guia.

---

## Antes de montar — 3 decisões

Perguntar (ou inferir do contexto — se já tiver identidade de marca definida, pular a pergunta):

1. **Autor do card** — nome, @handle, avatar (foto de perfil real, ou ícone/logo da marca se for
   conta institucional), selo de verificação (sim/não)
2. **Modo de cor** — escuro (padrão X, fundo `#000000`), claro (fundo branco), ou cor
   personalizada. Ver tokens abaixo.
3. **Solto ou em sequência** — uma peça única, ou uma sequência de 2-6 cards que se lê em ordem

## Escrever o conteúdo

- Um insight/ideia por card, linguagem direta de rede social — primeira pessoa, sem jargão de
  marketing, sem corporativês
- Cerca de 80 palavras por card é uma boa referência de teto — se o card ultrapassar isso
  visualmente no PNG renderizado, dividir em dois cards em vez de espremer a fonte
- Pesquisar o conteúdo antes de escrever se o tema for técnico/factual (dado, lei, processo,
  preço) — não inventar número ou citação legal, nem inventar frequência/estatística sem fonte
  ("um dos motivos mais comuns", "a maioria das pessoas" etc. só entram se vierem de pesquisa real)
- Texto em `<p>` dentro de `.content`, um parágrafo por ideia — não usar `<br>` solto pra separar
  blocos
- **Sem travessão (—).** Reescrever com ponto final, vírgula ou dois-pontos no lugar. Regra sem
  exceção nesse formato — mesmo o `no-ai-slop` (abaixo) permite 1-2 num texto longo; aqui é card
  curto, então zero
- **Todo texto passa pela skill `no-ai-slop`** antes de finalizar — chamar via `Skill` tool, não
  aplicar de memória. Ela pega intensificador vazio ("de verdade", "simplesmente"), alegação sem
  fonte, gancho genérico demais ("o detalhe que ninguém conta") e sobra de comentário que só
  descreve a própria frase em vez de dizer algo. Rodar depois de escrever o rascunho de cada
  card, não só no fim da peça inteira — texto curto tem menos margem pra erro passar despercebido

### Arco de funil, não lista de fatos soltos

Quando a peça é uma sequência (não card solto), ela não é uma lista de curiosidades — é um funil
de consciência de verdade: os cards do meio entregam valor real e crescente, o penúltimo faz
ponte pro produto, e o **último apresenta a marca e convida a agir**. Pensar a sequência assim
antes de escrever, não card a card isolado:

1. **Gancho (card 1)** — desperta curiosidade, não entrega nada ainda
2. **Cards de valor (meio)** — cada um entrega um fato, mecanismo ou consequência concreta e real
   (não definição solta e genérica). Se o cliente vende algo relacionado a um desses tópicos,
   pode puxar a conversa pra proposta dele num desses cards, sem citar preço/CTA ainda — só
   plantando a ideia
3. **Card de ponte** — o último tópico de conteúdo, escolhido de propósito pra abrir caminho
   direto pro card seguinte (se o produto do cliente resolve um dos tópicos do funil, esse tópico
   vem por último, não no meio)
4. **CTA (último card)** — apresenta a marca **do zero**, como se o leitor nunca tivesse ouvido
   falar dela (a peça roda pra público frio) — o que ela é, o que resolve — e convida a agir
   (mensagem, perfil). Ainda sem preço: preço é papel de campanha de Mensagens, não de Atração

### Gancho em cada card, sem revelar antes da hora

**Todo card, menos o último, termina puxando pro próximo** — não só o primeiro. Duas regras:

- **O gancho do card 1 nunca revela o conteúdo que vem depois.** Se a peça vai falar de 3 etapas,
  o card 1 diz que existem 3 etapas (ou nem isso) mas não lista quais — a lista se revela uma por
  card, na sequência. Gancho que entrega a resposta de cara mata a curiosidade de continuar.
- **Varie a construção do gancho a cada card.** Reaproveitar a mesma palavra ou estrutura
  ("só que tem...", "isso muda se...") em cards seguidos soa robótico e chama atenção pro
  mecanismo em vez do conteúdo. Cada transição pode usar um mecanismo diferente: uma pergunta
  implícita, uma consequência, uma comparação, um número.
- **Não precisa de seta (→) nem de indicador visual de "mais conteúdo"** (círculo com seta,
  botão de navegação) — testado e descartado nos dois casos. O puxão vem da própria frase, não de
  um elemento gráfico. Card final (CTA) não precisa de gancho, é o fim da linha.

Negrito (`<b>`) pontual dentro do parágrafo pra destacar o termo-chave da frase — não o card
inteiro, só a palavra que carrega o ponto principal.

## Imagem em cada card

Card com imagem lê muito melhor que card só de texto nesse formato — texto curto sozinho sobra
espaço em branco no card (1080×1350/1440 é alto). Regra prática: **toda peça de mais de 1 card
leva imagem em praticamente todos os cards**, escolhida pelo que aquele card específico diz, não
genérica de marca repetida.

**Fonte da imagem — reservar a foto real pro momento certo:**
- **Guardar a foto mais autêntica/de marca (fachada recente, produto, equipe) pro card de ponte**
  (o penúltimo, que antecede o CTA) — é o momento em que a imagem real reforça "isso existe de
  verdade", logo antes de apresentar quem resolve. Repetir a mesma foto de marca em todo card
  dilui esse efeito
- **Capa (card 1):** se o cliente já tem fotos reais do lugar/cidade num acervo do projeto
  (já usadas em outras peças), reaproveitar uma delas é válido e até preferível — reuso entre
  peças é normal nesse formato. Prioridade sobre banco quando existir opção real relevante
- **Demais cards:** banco de imagem via `scripts/buscar-fotos.js` (mesmo fluxo da seção 3A do
  `SKILL.md` da pasta pai), escolhida pelo tema específico daquele card (ex: card sobre
  assinatura de contrato leva foto de assinatura, não foto genérica de escritório)
- IA só como último recurso, mesma regra do `/carrossel` principal (nunca rosto identificável)

**Descartar imagem de banco com cara de clichê corporativo** — aperto de mão de gente de terno é
o exemplo clássico que a auditoria pegou nesse formato (parece banco de imagem genérico demais,
quebra a sensação de conteúdo nativo). Preferir mãos em ação, close de objeto/documento relevante,
gente trabalhando em contexto real — não pose.

Regra de composição herdada do `/carrossel` principal: a imagem nunca expande o card — altura
fixa (`max-height`, não `aspect-ratio` livre) + `flex: 0 1 auto`, `object-fit: cover`. O texto não
muda de tamanho por causa da imagem — fonte idêntica em todos os cards da mesma peça.

## Tokens de cor

| Token | Escuro (padrão X) | Claro |
|---|---|---|
| Fundo do card | `#000000` | `#FFFFFF` |
| Texto principal | `#E7E9EA` | `#0F1419` |
| @handle | `#71767B` | `#536471` |
| Borda da imagem | `#2F3E4E` | `#CFD9DE` |

Cor personalizada de marca: usar só em detalhe pontual (avatar, selo) — nunca fundo do card
inteiro, quebra a ilusão de tweet real.

Tipografia: seguir a fonte do `design-guide.md` do projeto se houver; sem isso, Inter (mesma
família do `/carrossel` principal).

## Template técnico

Card único, 1080×1350 (mesmo padrão de altura do `/carrossel` — trocar pra 1080×1440 só se a peça
precisar casar com outras de uma campanha de ads que já use essa altura).

```html
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  .card {
    width:1080px; height:1350px;
    background:#FFFFFF; /* token de fundo do modo escolhido */
    font-family:'Inter', sans-serif;
    overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:0 76px;
    position:relative;
  }
  .header { display:flex; align-items:center; gap:27px; margin-bottom:52px; flex-shrink:0; }
  .avatar { width:110px; height:110px; border-radius:50%; flex-shrink:0; overflow:hidden; background:#2a3a4a; }
  .avatar img { width:100%; height:100%; object-fit:cover; display:block; }
  .user-info { display:flex; flex-direction:column; gap:4px; }
  .name-row { display:flex; align-items:center; gap:10px; }
  .name { font-size:36px; font-weight:700; color:#0F1419; line-height:1.2; } /* token de texto */
  .verified svg { width:31px; height:31px; display:block; flex-shrink:0; }
  .handle { font-size:31px; color:#536471; line-height:1.2; font-weight:400; } /* token de handle */
  .content { font-size:46px; line-height:1.45; color:#0F1419; font-weight:400; letter-spacing:-0.01em; flex-shrink:0; }
  .content p { margin-bottom:36px; }
  .content p:last-child { margin-bottom:0; }
  .content b { font-weight:700; }
  .post-image {
    margin-top:44px; width:100%; flex:0 1 auto; min-height:0; max-height:520px;
    border-radius:22px; overflow:hidden; border:1px solid #CFD9DE; background:#000;
  }
  .post-image img { width:100%; height:100%; display:block; object-fit:cover; object-position:center; }
  .vpath { fill:#1D9BF0; }
</style>

<div class="slide card" data-name="nome-do-card">
  <div class="header">
    <div class="avatar"><img src="avatar.jpg" alt="Nome"></div>
    <div class="user-info">
      <div class="name-row">
        <span class="name">Nome do autor</span>
        <!-- se tiver selo: -->
        <span class="verified"><svg viewBox="0 0 22 22"><path class="vpath" d="M20.396 11c-.018-.646..."/></svg></span>
      </div>
      <span class="handle">@handle</span>
    </div>
  </div>

  <div class="content">
    <p>Primeiro parágrafo — o fato ou contexto.</p>
    <p>Segundo parágrafo — a consequência, o mecanismo, ou (no card de abertura) o gancho, sem
    seta, sem revelar o que vem depois.</p>
  </div>

  <!-- se houver imagem: -->
  <div class="post-image"><img src="foto-relevante.jpg" alt="..."></div>
</div>
```

## Render

Um único `.html` com todos os cards como `<div class="slide card">`, igual ao padrão do
`/carrossel` principal. Copiar `render.js` dessa pasta pra pasta da peça (não rodar direto daqui —
ele escreve em `meta/` relativo ao diretório de trabalho):

```bash
cp .claude/skills/carrossel/tweet-thread/render.js "<pasta-da-peça>/"
cd "<pasta-da-peça>" && NODE_PATH="C:/Users/sidne/node_modules" node render.js
```

## Organização de pasta — uma peça, uma subpasta

Quando o pedido envolver várias peças desse formato pro mesmo cliente/campanha (várias threads,
card único, notícia), **cada peça ganha sua própria subpasta**, não tudo solto na raiz — a raiz
vira um lixão de `foto-t1-3.jpg` sem contexto assim que a segunda peça entra. Padrão:

```
<pasta-da-campanha>/
  logo.png, icon-on.png          ← avatar/logo da marca, compartilhado
  <slug-da-thread-1>/
    anuncio.html                 ← <img src="../icon-on.png"> (sobe um nível pro avatar)
    render.js
    foto-*.jpg                   ← só as fotos dessa peça
    meta/                        ← PNGs renderizados dessa peça
  <slug-da-thread-2>/
    ...
  card-<nome>/                   ← card solto (não-thread) segue o mesmo padrão
    ...
```

## Checklist antes de aprovar

- [ ] Card simples: perfil → texto em `<p>` → imagem — nada além disso
- [ ] Sequência lida como funil: valor real crescendo, ponte, CTA final que apresenta a marca do
      zero (público frio)
- [ ] Gancho do card 1 não revela o que as próximas etapas/pontos vão ser
- [ ] Todo card (menos o último) puxa pro próximo, cada um com uma construção de frase diferente
      — não repetir a mesma palavra/estrutura de transição
- [ ] Sem seta (→), sem indicador de "mais conteúdo"
- [ ] Fonte idêntica em todos os cards da peça — a imagem se adapta ao espaço, nunca o texto
- [ ] Cada imagem faz sentido com o card específico onde está; nenhuma tem cara de banco
      genérico (aperto de mão de terno etc.)
- [ ] Foto real de marca reservada pro card de ponte (penúltimo), não espalhada em todo card
- [ ] Fundo consistente (todo escuro ou todo claro, não misturado dentro da mesma peça)
- [ ] Números pesquisados, não inventados; nenhuma alegação de frequência ("a maioria", "muita
      gente") sem fonte real
- [ ] Peça organizada na própria subpasta, não solta na raiz da campanha (se houver mais de uma
      peça no mesmo pedido)
