# Estilo editorial — vocabulário de layout

Estilo de carrossel da Scault para peça longa e argumentativa: manifesto, ensaio,
tese, apresentação de método. Não é pra dica rápida nem lista numerada — pra isso
os layouts genéricos do `SKILL.md` servem melhor.

**Origem:** a arquitetura de página foi estudada de um carrossel da Eter
(`post exemplo eter/`, 7 slides, agosto/2026). **Só a arquitetura.** Cor, tipografia,
textura, tratamento de foto e componente são todos do sistema Scault
(`identidade/scault-design-system.md`). Primeira aplicação:
`marketing/conteudo/carrossel-manifesto-eter-2026-08-06/`.

O que a referência tinha e a gente **não** copiou: fundo creme, serifada, grão
colorido, foto saturada, tipografia condensada de pôster. Nada disso é a marca.

---

## O que define o estilo

Três coisas, e todas são de composição — nenhuma é de estilo gráfico:

1. **Vazio grande entre blocos.** O slide tem 2 ou 3 blocos ancorados nos extremos e
   o meio fica vazio de propósito. É o oposto de encher o quadro.
2. **Três vozes tipográficas por slide.** Uma pesada, uma média, uma de corpo. Nunca
   dois blocos no mesmo peso competindo.
3. **Eixo centrado no respiro, à esquerda no argumento.** O slide que faz a pausa é
   centrado; o que carrega a tese é alinhado à esquerda. A troca de eixo é o que marca
   a mudança de função — não a cor de fundo.

Consequência prática: **carrossel nesse estilo tem menos texto por slide e mais
slides.** Se um slide precisa de dois parágrafos, ele é dois slides.

---

## A grade

Três medidas, iguais em todos os slides. Nada de `top:` avulso por slide — foi o que
fazia as versões antigas parecerem desalinhadas.

| | |
|---|---|
| margem lateral | **88px** → coluna útil de 904px |
| âncora de topo | **200px** |
| âncora de base | **200px** |

Espaçamento entre blocos só pela escala `.g1` (24px) / `.g2` (44px) / `.g3` (72px).

---

## Os seis layouts

### 1. `t-split` — duas âncoras
Dois grupos: um na âncora de topo, outro na de base. O vazio fica no meio.
Uso: quando o slide tem um bloco de texto e um visual pesado (conversa, interface).

### 2. `t-tri` — três âncoras
Três grupos: topo, meio, base. É o layout mais usado do estilo — 7 de 11 slides na
primeira aplicação.
Uso: rótulo / manchete / corpo, ou manchete / visual / corpo.

### 3. Sanduíche (`t-tri` com visual no meio)
Texto → visual encaixado com margem → texto. O visual pode ser uma ilustração nossa ou uma
faixa de foto (`.band`, 426px de altura).
É o layout que carrega as ilustrações. Sempre com `.tick` nos cantos.

Ilustrações disponíveis no motor:

| Função | O que mostra | Quando usar |
|---|---|---|
| `serp` | Resultado de busca com o bloco "sua empresa não aparece aqui" | Ausência no Google |
| `chat` | Conversa nua, com divisor de tempo sem resposta | **Silêncio** — a mensagem que não foi respondida |
| `mensagens` | Cards de WhatsApp com avatar, hora e tique duplo | **Troca** — chegou e foi respondido na hora |
| `ui_kyreon` | Interface do Kyreon, só a caixa de entrada | Quando o assunto é o atendimento |
| `ui_kyreon_completo` | Inbox **e** funil no mesmo quadro | Slide do produto: a tese é que a conversa vira registro, e só o inbox entrega metade dela |
| `ficha` | Pares rótulo/valor | Diagnóstico, custo, checklist |
| `comparativo` | Duas colunas, uma destacada | A conta lado a lado |
| `perfil_google` | Ficha do Perfil no Google com itens certos e errados | Auditoria de perfil |
| `serie` | Numeral em metal + manchete + corpo | Um item por slide numa lista numerada |
| `fluxo` | Etapas com seta | Caminho do lead |
| `funil` | Kanban em colunas | Estágios, sem detalhe |
| `contagem` | Três batidas em pesos crescentes | Tensão em tempo real |

**Não usar `chat` e `mensagens` na mesma peça sem motivo**: os dois são conversa e o leitor
lê como repetição. Eles existem separados porque dizem o oposto um do outro — um é o
silêncio, o outro é a resposta.

### 4. `.mid` — eixo centrado
Modificador, não layout: joga `t-tri`/`t-split` pro centro. Combina com todos.
Uso: slide de respiro, pico tipográfico, os eixos do método.

### 5. `.vs` — coluna dividida
Coluna de texto de um lado, foto sangrando do outro. Header e rodapé vivem **dentro**
da coluna de texto — a foto nunca recebe texto por cima, que é o ponto do layout.
`.vs.rev` inverte os lados.
Uso: a virada da narrativa, o slide de guinada. Um por carrossel, no máximo.

### 6. Fecho de marca
Último slide: wordmark grande em metal escovado, uma frase, botão de CTA. Malha em
horizonte curvo + luz na base.
Uso: sempre o último. Se o carrossel tiver eixos numerados, o fecho vem **depois** do
último eixo, não junto — senão o eixo divide espaço com o CTA e os dois perdem.

---

## A capa

O caso mais difícil, e o que mais deu trabalho na primeira aplicação. Duas regras
aprendidas na marra:

**1. Texto não encosta no sujeito.** Nem no cabelo, nem no ombro. Se a headline
atravessa a pessoa, a capa está errada — não importa se o trecho é escuro.

**2. Retrato de banco quase nunca abre espaço sozinho.** Numa foto 2:3, a cabeça
costuma ocupar metade da largura e cair no miolo. Como `cover` num quadro 4:5 deixa
só ~270px de folga vertical e zero de folga horizontal, **não existe
`background-position` que resolva.** O que resolve é uma das três:

| Saída | Como | Quando |
|---|---|---|
| **Zoom ancorado na borda** | `background-size: 156% auto` + `background-position: 0% 11%` — empurra o perfil pra metade direita e abre uma faixa escura de ~585px à esquerda | Padrão. Mantém a foto sangrando o quadro inteiro |
| **Coluna dividida** (`.vs.capa`) | Texto em coluna preta, foto sangrando ao lado | Quando o zoom pixelaria ou o rosto não aguenta close |
| **Painel de vidro** (`vidro()` + `extra='canto'`) | Bloco de vidro de 600px ancorado num canto; o resto da foto fica livre | Quando a foto tem que ficar **crua** e não existe área escura pro texto |
| **Trocar a foto** | Procurar retrato que já nasce com área morta de um lado | Quando dá tempo |

**O caso da foto própria / bastidor.** Foto de celular numa sala real não se comporta como
foto de banco: é quente, é clara e é bagunçada. Três regras que saíram da capa do post da
origem do Kyreon:

- **Não tratar.** O duotone mataria o que a foto tem de valioso — no caso, a tela do
  notebook com o agente rodando. Usar `cru=True`
- **Sem tratamento, o texto não pousa em lugar nenhum.** A saída é o `vidro()`, que borra
  só o pedaço atrás do bloco. Um por peça: vidro em tudo vira template
- **O crop é enquadramento, não zoom.** Escolher a região pelo que precisa aparecer
  (sujeito + o objeto que é prova), e conferir que o painel não encosta em nenhum dos
  dois. E `.on-cru` no slide, senão o rodapé some no piso claro

**Zoom exige arquivo grande.** Preview do Pexels (~870px) pixela em qualquer zoom
acima de 120%. Baixar `--tamanho original` antes de tentar.

**A medida da headline vira o limite.** Com a faixa em ~585px, a headline trava em
`max-width: 512px` e vira uma pilha de 5-7 linhas curtas ao lado do rosto. O rag
acompanhando o perfil é o efeito, não um defeito. Corpo do texto em 460px.

**O rodapé encurta junto** (`.capa .foot{right:auto;width:460px}`), senão o
`Arraste →` cai em cima do sujeito.

---

## Regras de tratamento

- **Sem véu preto sobre a foto.** A legibilidade vem do tratamento da imagem mais uma
  sombra de texto suave (`.on-img`). Véu é o atalho preguiçoso e achata a foto.
  Em foto crua, quem faz esse trabalho é o `vidro()` — que borra um bloco, não a foto
  inteira, e por isso não é véu
- **A foto é sujeito, não textura.** Arquitetura abstrata e textura genérica já foram
  testadas nesse estilo e saíram mortas. Procurar gente
- **Duotone azul:** `grayscale(.55) contrast(1.16) brightness(.74)` + tinta a 55% em
  `mix-blend-mode:color`. Sujeito que já nasce frio usa `.full` (grayscale total,
  tinta a 90%)
- **Grão** em todos os slides: ruído fractal a 30% em `overlay`
- **`.tick`** — filete de 9px em azul luminoso no canto superior esquerdo e inferior
  direito de tudo que é "encaixado". Motivo do sistema, custo zero
- **Rosto de gente em foto de banco vai borrado** (`rostos=[...]` no `foto()`). O modelo
  assinou liberação, mas peça de marca fica melhor sem rosto identificável competindo com
  a headline — e evita que um desconhecido vire a cara da Scault. A máscara radial é
  obrigatória: sem ela o `backdrop-filter` deixa borda dura e vira tarja. As coordenadas
  são em % **do slide renderizado**, não da foto original — medir no PNG, porque o crop
  muda tudo. Foto própria não leva: ali o rosto é o ponto
- **Sem contador de slide.** O rodapé leva `@handle` e nada mais, fora capa e fecho

---

## Ritmo

Não alternar fundo claro ↔ escuro como nos layouts genéricos — **a marca é escura, e
ponto.** O ritmo aqui vem de outras três alternâncias:

| Alternância | Como |
|---|---|
| Eixo | centrado ↔ esquerda |
| Densidade | slide com visual pesado ↔ slide só de tipografia |
| Fundo | `--base` ↔ `.panel` ↔ malha ↔ luz radial ↔ foto sangrando |

Regra prática: nunca dois slides seguidos com o mesmo layout **e** o mesmo fundo.

---

## Como gerar

Não escrever o HTML à mão. O `build.py` desta pasta é o motor: CSS completo,
helpers de layout e componentes. Ele lê o post de um `post.json` na mesma
pasta — formato completo em `POST.md`. Copiar pra pasta do post junto com o
`render.js` e o logo, escrever `post.json` e rodar:

```bash
cp .claude/skills/carrossel/estilo-editorial/{build.py,render.js} "marketing/conteudo/<pasta>/"
cp "identidade/LOGO SCAULT.svg" "marketing/conteudo/<pasta>/_logo.svg"
cd "marketing/conteudo/<pasta>"
# escrever post.json (ver POST.md) na mesma pasta antes do passo abaixo
python build.py && NODE_PATH="C:/Users/sidne/node_modules" node render.js
```

Mudar a grade, a dosagem do duotone ou um layout é editar uma linha e rodar de novo.
É por isso que o motor existe: na primeira aplicação a peça foi refeita quatro vezes.
