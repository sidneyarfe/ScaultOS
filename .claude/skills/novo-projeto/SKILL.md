---
name: novo-projeto
description: >
  Cria uma pasta de projeto nova com `CLAUDE.md` dedicado, depois de uma entrevista curta sobre
  o projeto (cliente, objetivo, entregas previstas). Use quando o usuário disser "novo projeto",
  "novo cliente", "/novo-projeto", "começar projeto pra X" ou pedir pra estruturar um trabalho novo.
---

# /novo-projeto — Pasta de projeto novo com contexto dedicado

Quando o usuário começa um projeto novo (cliente, iniciativa, produto), cria uma pasta com `CLAUDE.md` próprio que herda contexto da raiz e adiciona o que é específico do projeto.

## Workflow

### Passo 1 — Entrevista (4 perguntas, +1 condicional)

1. "Qual o nome do projeto ou cliente?"
2. "É um cliente novo, projeto interno ou iniciativa pessoal?"
3. "Qual o objetivo principal? (uma frase)"
4. "Que tipo de entrega vai ter? (ex: ads, site, conteúdo, automação, proposta — pode ser mais de uma)"

Se a resposta 2 foi **"cliente novo"** e a pasta `studio-scault/` existe na raiz do
projeto (nem todo ScaultOS tem — é uma ferramenta específica desta instância, ver
"Integração com o studio.scault" no fim deste arquivo), perguntar mais uma:

5. "As peças visuais desse cliente (carrossel, post) vão seguir uma identidade
   própria dele (cor, fonte, logo — ainda que a gente não tenha isso pronto hoje),
   ou usam o visual editorial da Scault?"

A resposta decide o `motor` no cadastro do Passo 3.5 — não pular essa pergunta
achando que dá pra adivinhar pelo tipo de negócio: a régua real é "a peça sai
com a cara de quem é o cliente" vs. "a peça sai com a cara da Scault", e só o
Sidney sabe qual das duas o contrato prevê.

### Passo 2 — Decidir local

Baseado na resposta 2:

- **Cliente novo:** criar em `clientes/<Nome>/` (ou na pasta equivalente do perfil — ler `CLAUDE.md` da raiz pra confirmar a convenção)
- **Projeto interno:** criar em `projetos/<nome>/` (criar `projetos/` se não existir)
- **Iniciativa pessoal:** perguntar onde o usuário prefere

### Passo 3 — Estrutura básica

Criar a pasta com:

- `CLAUDE.md` do projeto (instruções herdadas + específicas)
- `briefing.md` (com o que foi coletado na entrevista)
- Subpastas conforme as entregas mencionadas (ex: se mencionou "ads e conteúdo", criar `ads/` e `conteudo/`)

### Passo 3.5 — Cadastro no studio.scault (só se "cliente novo" e `studio-scault/` existir)

Se `studio-scault/` não existir na raiz, pular este passo inteiro — sem
mencionar, sem perguntar. Não é um recurso do ScaultOS em geral, é uma
ferramenta desta instância (ver "Integração com o studio.scault" no fim).

Se existir, o cliente só está pronto de verdade quando também aparece no
seletor de marca do painel — sem isso, gerar carrossel pra ele trava com
"marca desconhecida". Criar `studio-scault/marcas/<slug>.json`, onde `<slug>`
é o nome do cliente em minúsculas/sem acento/hífen (mesma regra do slug de
pasta usada em outras skills). Usar este template exato — nome de campo
trocado ou inventado quebra a leitura no servidor (`servidor/lib/marcas.js`
só espera JSON válido, mas o resto do estúdio espera estes campos
específicos):

```json
{
  "slug": "<slug>",
  "nome": "<nome do cliente, como digitado na pergunta 1>",
  "tipo": "cliente",
  "motor": "<estilo-editorial OU carrossel-generico, conforme resposta 5>",
  "paleta": null,
  "fontes": null,
  "instagram": { "handle": null, "sufixo_env": null },
  "identidade_fonte": "clientes/<Nome da pasta>/CLAUDE.md",
  "logo": null,
  "observacoes": "<uma frase: motor escolhido e por quê, mais o que falta configurar (paleta/fontes/logo/conta de Instagram) antes de publicar de verdade>"
}
```

- `motor: "estilo-editorial"` → resposta 5 foi "visual da Scault". `paleta` e
  `fontes` continuam `null` (o motor editorial já tem os tokens dele — só
  preencher se o cliente pedir uma paleta própria dentro do estilo editorial,
  como o Kyreon fez).
- `motor: "carrossel-generico"` → resposta 5 foi "identidade própria". Nesse
  caso `identidade_fonte` (o `CLAUDE.md` criado no Passo 3) é a fonte de
  verdade do visual — o agente lê esse arquivo pra saber cor/fonte/logo.
- `instagram.sufixo_env`: só preencher se o Sidney já souber o sufixo que vai
  usar no `.env` pra esse cliente (ex: `DIASLAW`). Se não souber ainda, deixar
  `null` — publicação fica desativada até isso existir, igual outros clientes
  no mesmo estado (ver `studio-scault/README.md`, seção "Marcas cadastradas").
- Nunca inventar `paleta`, `fontes` ou `logo` — ficam `null` até existir
  informação real.

Depois de escrever o arquivo, confirmar rapidamente:
> "Cadastrei o studio.scault também: `<Nome>` já aparece no seletor de marca
> do painel, motor `<motor>`. [Se sufixo_env ficou null:] Falta só a conta de
> Instagram no `.env` quando for publicar por lá."

### Passo 4 — Conteúdo do `CLAUDE.md` do projeto

Template:

```markdown
# [Nome do projeto]

> Projeto criado em [data]. Pasta dedicada — instruções aqui sobrescrevem as da raiz quando relevantes.

## Sobre

[Objetivo da resposta 3]

## Tipo

[Cliente novo / Projeto interno / Iniciativa pessoal]

## Entregas previstas

- [entrega 1 da resposta 4]
- [entrega 2 da resposta 4]
- ...

## Onde salvar o que

- Briefings e contexto: nessa pasta na raiz
- Entregas: cada subpasta criada (ads/, conteudo/, site/, etc.)

## Contexto que herda da raiz

Esse projeto herda automaticamente o tom de voz, marca e contexto do negócio definidos em `_memoria/` e `identidade/` da raiz. Não duplicar essas informações aqui.

## Específico desse projeto

[Vazio — preencher com regras que valem só pra esse projeto, conforme for descobrindo]
```

### Passo 5 — Registro no log

Se a resposta 2 foi "cliente novo": adicionar uma linha em `_memoria/log.md`
(criar o arquivo se não existir — ver convenção em `CLAUDE.md`, seção "Log de
eventos e wikilinks"):

```
- **[data de hoje em AAAA-MM-DD]** cliente-novo — [[clientes/<Nome>/CLAUDE.md|<Nome>]] entra na carteira, [objetivo da resposta 3 em poucas palavras]
```

Isso é só soma (append-only), não precisa perguntar antes. Atualizar a tabela
de carteira em `_memoria/empresa.md` continua sendo decisão do usuário — perguntar
normalmente, como já previsto em "Manter contexto atualizado" no `CLAUDE.md`.

### Passo 6 — Resumo

Responder pro usuário:

```
Pasta criada: [caminho]
✓ CLAUDE.md do projeto
✓ briefing.md
✓ Subpastas: [lista]
✓ Registrado em _memoria/log.md (se cliente novo)
✓ Cadastrado em studio-scault/marcas/<slug>.json — motor <motor> (se cliente novo e studio-scault/ existir)

Quando for trabalhar nesse projeto, abre o terminal já dentro da pasta — assim eu carrego o CLAUDE.md específico junto com o da raiz.
```

## Regras

- Nome de pasta: usar o nome como o usuário falou, sem normalizar agressivamente (manter acentos, espaços viram hífen, mas o nome reconhecível)
- Não criar subpastas que não foram pedidas ("pra organizar melhor"). Só o que foi mencionado nas entregas
- Se o cliente/projeto já existe (pasta com mesmo nome), avisar e perguntar se é pra adicionar dentro ou criar com sufixo

## Integração com o studio.scault

`studio-scault/` é uma ferramenta desta instância do ScaultOS (painel local pra
criar/editar/publicar carrossel), não algo que todo projeto ScaultOS tem. Por
isso o Passo 3.5 é condicional: só roda quando a pasta existe na raiz. Nesta
instância ela existe, então **todo cliente novo passa por ali** — é o que
mantém `clientes/` (contexto) e `studio-scault/marcas/` (execução) andando
juntos em vez de alguém lembrar de cadastrar a marca na mão depois. Se um dia
o studio.scault for removido ou esta pasta virar outra coisa, o Passo 3.5 só
para de disparar sozinho — nada mais neste arquivo depende dele.
