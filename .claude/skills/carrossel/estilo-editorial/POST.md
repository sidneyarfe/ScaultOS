# post.json — formato do post no estilo editorial

O `build.py` desta pasta é o motor (CSS + primitivas). Ele não guarda mais
conteúdo — quem entra com o post é o `post.json`, na mesma pasta. Vocabulário
de layout (o que cada modo/tratamento *significa*): ver `LAYOUTS.md`.

```
python build.py            # le post.json na pasta atual
python build.py outro.json # ou um caminho especifico
```

## Estrutura

```json
{
  "titulo": "Scault — a origem do Kyreon",
  "formato": "4:5",
  "slides": [ /* ver abaixo */ ]
}
```

`formato` é opcional (default `"4:5"`, feed 1080×1350). Único outro valor suportado hoje:
`"9:16"` (stories/reels, 1080×1920) — escala `--top`/`--bot` proporcionalmente à nova altura.
**`"1:1"` (quadrado) não é suportado ainda:** vários componentes ilustrados (`.band`, `.ui`,
`ui_kyreon`) têm altura fixa em px que estouraria num quadro 20% mais baixo — precisa de
recalibração por componente antes de entrar.

Cada item de `slides` é um objeto com:

| Campo | Tipo | Obrigatório | Corresponde a |
|---|---|---|---|
| `corpo` | nó | sim | 1º argumento posicional de `slide()` |
| `fundo` | string ou nó | não | `fundo=` de `slide()` |
| `classe` | string | não | `classe=` de `slide()` (ex.: `"panel"`, `"on-img"`) |
| `rodape` | string | não | `rodape=` de `slide()` |
| `logo` | bool | não | `logo=` de `slide()` |
| `chrome` | bool | não (default `true`) | `chrome=` de `slide()` — `false` no layout `coluna` |
| `posBlocos` | objeto | não | posição livre de um bloco específico — ver abaixo |

### `posBlocos` — mover um bloco pra fora da grade

Cada `grade()`/`coluna()` dentro de `corpo` numera seus `grupos` em ordem, começando em `0`,
só quando o post vem de `post.json` (posts com `S.append()` escrito à mão nunca ganham esse
índice — comportamento idêntico ao de antes). `posBlocos` referencia esse índice pra tirar um
bloco específico do fluxo normal e travar posição absoluta:

```json
{
  "corpo": {"fn": "grade", "args": {"grupos": ["<h2>Título</h2>", "<p>Corpo</p>"]}},
  "posBlocos": {"0": {"x": 100, "y": 300}}
}
```

Isso move o **primeiro** grupo (`<h2>Título</h2>`, índice `0`) pra `left:100px;top:300px`,
absoluto — o segundo grupo (`<p>Corpo</p>`, índice `1`, sem entrada em `posBlocos`) continua na
posição de grade normal. É o mecanismo por trás do editor visual (arrastar bloco no canvas) —
granularidade de bloco (`.grp` inteiro), não de palavra ou linha isolada dentro dele: tirar só
um filho de um container flex faz os irmãos colapsarem no vão, então o que se move é sempre o
grupo inteiro.

## O que é um "nó"

Um nó é como uma chamada de função do Python vira JSON. Três formas:

**1. String — HTML literal**, passa direto, igual ao motor sempre aceitou:
```json
"<h2>Manchete do slide<br>em duas linhas.</h2>"
```

**2. `{"fn": ..., "args": {...}}` — chama uma primitiva do motor.** `args` usa
exatamente os mesmos nomes de parâmetro da função Python (ver `build.py`,
seção `# ---- primitivas` e `# ---- componentes`). Primitivas disponíveis:
`foto`, `band`, `grade`, `vidro`, `coluna`, `rotulo`, `serp`, `chat`,
`mensagens`, `ui_kyreon_completo`, `ui_kyreon`, `icone`, `ficha`,
`comparativo`, `perfil_google`, `serie`, `fluxo`, `funil`, `contagem`.

```json
{"fn": "foto", "args": {"arquivo": "foto-capa.jpg", "pos": "0% 11%", "full": true, "tam": "156.5% auto"}}
```

Um argumento que é lista de "linhas" (ex.: `resultados` do `serp`, `etapas`
do `fluxo`, `rostos` da `foto`) vai como lista de listas — o interpretador
converte pra tupla sozinho:
```json
{"fn": "fluxo", "args": {"etapas": [["Anúncio", "Meta Ads"], ["WhatsApp", "Atendimento"]]}}
```

**3. `{"texto": ..., "destaque": [...], "tag": "h2", "classe": "s"}` — texto
semântico.** Alternativa a escrever `<span class="acc">` na mão: `destaque`
é uma lista de frases, e a *primeira ocorrência* de cada uma (na ordem da
lista) entra em destaque automaticamente. `tag` é a tag HTML (default `p`),
`classe` é opcional (ex.: `"s"` pra `h1.s`, o título menor).

```json
{"texto": "A prospecção B2B mudou: cadência fria não funciona mais", "destaque": ["mudou"], "tag": "h2"}
```
vira
```html
<h2>A prospecção B2B <span class="acc">mudou</span>: cadência fria não funciona mais</h2>
```

Frase que não aparece no texto não quebra o build — só entra um aviso no
stderr. Conteúdo legado com `<span class="acc">` escrito à mão continua
funcionando normal como HTML literal (forma 1); `destaque` é opcional, não
obrigatório.

**Fecho de marca:** `{"wordmark": true}` — usa a wordmark em metal escovado
(`WORDMARK`, montada a partir do `_logo.svg` da pasta), sempre no lugar de um
item de `grupos`.

## grupos, dentro de grade/coluna/vidro

`grade` e `coluna` recebem `grupos`: uma lista onde **cada item é um nó**
(string, chamada de primitiva, ou texto semântico) — exatamente como o motor
já aceitava strings soltas misturadas com chamadas de função na mesma lista
Python. `vidro` recebe `conteudo`: um nó só (geralmente ele mesmo contém uma
string com vários blocos, ou vem dentro de um `grupos` de outro `grade`).

## Exemplo — um slide de cada layout comum

```json
{
  "titulo": "Scault — carrossel",
  "slides": [
    {
      "corpo": {
        "fn": "grade",
        "args": {
          "grupos": [
            {"texto": "Manchete em linhas curtas ao lado do rosto", "destaque": ["ao lado"], "tag": "h1"},
            {"texto": "Uma frase de apoio que fecha a pergunta da capa.", "tag": "p"}
          ]
        }
      },
      "fundo": {"fn": "foto", "args": {"arquivo": "foto-capa.jpg", "pos": "0% 11%", "full": true, "tam": "156.5% auto"}},
      "classe": "on-img capa",
      "rodape": "Arraste →",
      "logo": true
    },
    {
      "corpo": {
        "fn": "grade",
        "args": {
          "modo": "t-tri",
          "mid": true,
          "grupos": [
            {"texto": "Manchete do slide em duas linhas.", "tag": "h2"},
            {"fn": "serp", "args": {
              "consulta": "melhor [serviço] em Belém",
              "resultados": [["concorrente-1.com.br", "Orçamento na hora"], ["concorrente-2.com.br", "Nota 4,9 no Google"]],
              "ausente": "A sua empresa não aparece aqui."
            }},
            {"texto": "O parágrafo que fecha o raciocínio do slide.", "tag": "p"}
          ]
        }
      },
      "fundo": "<div class=\"mesh\"></div>",
      "classe": "panel"
    },
    {
      "corpo": {
        "fn": "coluna",
        "args": {
          "grupos": [
            {"texto": "A virada em três linhas.", "destaque": ["três"], "tag": "h1", "classe": "s"},
            {"texto": "O que muda a partir daqui.", "tag": "p"},
            {"texto": "E o que isso significa na prática.", "tag": "div", "classe": "lead"}
          ],
          "foto_html": {"fn": "foto", "args": {"arquivo": "foto-vertical.jpg", "pos": "64% 34%"}}
        }
      },
      "classe": "on-img",
      "chrome": false
    },
    {
      "corpo": {
        "fn": "grade",
        "args": {
          "modo": "t-tri",
          "mid": true,
          "grupos": [
            {"fn": "rotulo", "args": {"texto": "O sistema · 01 de 03"}},
            "<svg class=\"icon\" ...></svg><h1 class=\"s g2\">Atrair.</h1><div class=\"lead g2\">A promessa em<br>uma linha.</div>",
            {"texto": "O detalhamento do que entra nesse eixo.", "tag": "p"}
          ]
        }
      },
      "fundo": "<div class=\"mesh\"></div>",
      "classe": "panel"
    },
    {
      "corpo": {
        "fn": "grade",
        "args": {
          "modo": "t-tri",
          "mid": true,
          "grupos": [
            {"wordmark": true},
            {"texto": "A frase que resume a tese. Em duas linhas.", "destaque": ["Em duas linhas."], "tag": "div", "classe": "lead"},
            "<div class=\"btn\"><s></s>Saiba mais no link da bio</div>"
          ]
        }
      },
      "fundo": "<div class=\"mesh wave\"></div><div class=\"glow b\"></div>",
      "rodape": "Belém-PA e todo o Brasil"
    }
  ]
}
```

## Por que não um schema mais "semântico" (título/subtítulo/foto fixos)

Porque o motor tem 19 primitivas diferentes (`ficha`, `chat`, `mensagens`,
`comparativo`, `perfil_google`, `serie`, `fluxo`, `funil`, `contagem`,
interfaces do Kyreon...), não só capa-com-texto-e-foto. Um schema fixo do
tipo `{titulo, subtexto, foto}` não tem onde guardar um `ficha()` ou um
`chat()`. O formato de nó (`fn`+`args`) é genérico o bastante pra cobrir
qualquer primitiva atual — e qualquer primitiva nova que entrar em `build.py`
fica disponível em `post.json` só de entrar no `REGISTRY`, sem tocar no
interpretador.
