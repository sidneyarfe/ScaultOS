---
name: atualizar
description: >
  Varre o projeto e atualiza os arquivos de contexto (`_memoria/empresa.md`, `preferencias.md`,
  `estrategia.md`, `log.md`, `CLAUDE.md`, `identidade/design-guide.md`) que ficaram desatualizados
  em relação ao estado real do workspace. Use quando o usuário disser "atualiza", "/atualizar",
  "varre o projeto", ou pedir uma reconciliação geral.
---

# /atualizar — Varredura e atualização de contexto

Compara o que está nos arquivos de contexto com o estado real do workspace e propõe atualizações.

## Workflow

### Passo 1 — Levantamento

Listar:
- Pastas na raiz (cada uma representa uma área de trabalho)
- Subpastas em `clientes/` (se existir) — cada uma é um cliente
- Skills em `.claude/skills/` — quais existem hoje
- Arquivos recentes (últimos 30 dias) em pastas como `propostas/`, `conteudo/`, `clientes/<x>/`
- Data da última linha em `_memoria/log.md` (se existir) — até onde já foi registrado
- Se `studio-scault/` existir: os arquivos em `studio-scault/marcas/*.json` (cada um tem
  um campo `slug` e um `nome`) — ver Passo 2 abaixo

### Passo 2 — Comparação

Ler os arquivos de contexto e identificar:

- **Em `_memoria/empresa.md`:** lista de clientes / serviços / ferramentas — bate com a realidade do workspace?
- **Em `_memoria/estrategia.md`:** o foco atual ainda faz sentido (datas, prioridades)? Alguma
  proposta na tabela "Propostas em aberto" já passou da validade sem constar desfecho?
- **Em `_memoria/log.md`:** todo evento datado que aparece em `empresa.md`/`estrategia.md`
  (cliente novo, proposta enviada, contrato) desde a última linha do log tem entrada
  correspondente aqui? Proposta vencida na tabela de `estrategia.md` já devia ter saído de lá
  e virado linha de desfecho no log
- **Em `CLAUDE.md`:** as regras de organização e a estrutura de pastas listada batem com o que existe?
- **Em `identidade/design-guide.md`:** continua coerente com o que foi gerado nas últimas peças (carrosséis, slides)?
- **Se `studio-scault/` existir:** todo cliente em `clientes/<Nome>/` tem um `studio-scault/marcas/<slug>.json`
  correspondente (casar pelo campo `nome` do JSON, não pelo nome do arquivo)? Cliente sem marca
  cadastrada trava com "marca desconhecida" assim que alguém tenta gerar carrossel pra ele no
  painel — normalmente sinal de que o cliente foi criado direto (pasta feita na mão, sem passar
  pelo `/novo-projeto`) em vez de pelo fluxo que já cadastra os dois juntos (ver
  "Integração com o studio.scault" em `.claude/skills/novo-projeto/SKILL.md`)

### Passo 3 — Proposta de mudanças

Apresentar pro usuário uma lista curta no formato:

```
Encontrei [N] coisas pra atualizar:

1. _memoria/empresa.md — falta o cliente "Acme" (vi pasta clientes/Acme/ criada em [data])
2. CLAUDE.md — tem regra "propostas vão em propostas/" mas vejo propostas em clientes/<x>/propostas/
3. _memoria/estrategia.md — fala em "fechar 1º cliente em fevereiro", já é abril e tem 3 clientes ativos
4. studio-scault/marcas/ — "Acme" não tem marca cadastrada, gerar carrossel pra ele vai travar

Quer que eu aplique essas mudanças? Posso aplicar todas, escolher algumas, ou nenhuma.
```

### Passo 4 — Aplicação

Se o usuário aprovar, editar os arquivos com cirurgia — só a linha relevante, sem reformatar o documento todo. Mostrar o diff de cada mudança aplicada.

Cliente sem marca cadastrada no studio.scault não é uma linha pra editar — é
um arquivo novo. Seguir o mesmo template de `studio-scault/marcas/<slug>.json`
descrito no Passo 3.5 de `.claude/skills/novo-projeto/SKILL.md` ("Cadastro no
studio.scault"), incluindo a pergunta sobre `motor` (identidade própria vs.
visual da Scault) se ainda não estiver óbvia pelo `CLAUDE.md` do cliente.

## Regras

- Não inventar fatos — só registrar o que tem evidência no workspace
- Se a evidência for ambígua (ex: pasta vazia chamada "Cliente Novo"), perguntar antes de adicionar
- Não apagar conteúdo dos arquivos de contexto — só atualizar e adicionar.
  **Exceção:** linha de proposta vencida/com desfecho sai da tabela "Propostas em
  aberto" de `estrategia.md` — mas só depois que o desfecho já estiver registrado
  em `_memoria/log.md`, nunca antes
- `_memoria/log.md` é append-only de verdade — nunca editar ou remover linha
  existente, só adicionar linha nova no fim
- Se nenhuma mudança for necessária, responder "Tá tudo coerente, nada pra atualizar"
