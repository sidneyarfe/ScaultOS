# ScaultOS — Sistema operacional do negócio

Sua empresa roda em cima desse arquivo. Aqui ficam as regras de operação
do ScaultOS — como o Claude lê o contexto, aprende com correções, mantém
tudo atualizado e cria skills novas conforme a operação evolui.

Esse arquivo é editável. Quando o `/instalar` rodar, ele complementa o
final dessa página com as regras específicas do seu negócio.

---

## Contexto do negócio

No início de toda conversa, ler os seguintes arquivos (quando existirem
e estiverem preenchidos):

1. `_memoria/empresa.md` — quem é o usuário, o que faz, como funciona o negócio
2. `_memoria/preferencias.md` — tom de voz, estilo de escrita, o que evitar
3. `_memoria/estrategia.md` — foco atual, prioridades, prazos

Usar essas informações como base pra qualquer resposta ou decisão. Ao
sugerir prioridades, formatos ou abordagens, considerar o foco atual
descrito em `estrategia.md`.

Pra qualquer tarefa visual (carrossel, post, landing page), consultar
`identidade/design-guide.md` como referência de estilo.

**Exceção — peça de cliente segue a identidade do cliente.** O `design-guide.md`
da raiz é a marca da *Scault* e vale para peça interna (proposta, contrato, site
próprio, conteúdo da agência). Quando a peça for para um cliente, a identidade é a
dele: ler o `CLAUDE.md` da pasta do cliente, que aponta onde está o design system
aplicável. Não misturar as duas marcas na mesma peça.

Não é necessário listar o que foi lido nem confirmar a leitura. Apenas
usar o contexto naturalmente.

---

## Fluxo de trabalho

Antes de executar qualquer tarefa, verificar se existe skill relevante
em `.claude/skills/`. Se encontrar, seguir as instruções da skill. Se
não encontrar, executar a tarefa normalmente.

Ao concluir uma tarefa que não tinha skill mas parece repetível (o
usuário provavelmente vai pedir de novo no futuro), perguntar:

> "Isso pode virar uma skill pra próxima vez. Quer que eu crie?"

Não perguntar pra tarefas pontuais ou perguntas simples. Só quando o
padrão de repetição for claro.

---

## Aprender com correções

Quando o usuário corrigir algo, melhorar uma resposta ou dar uma
instrução que parece permanente (frases como "na verdade é assim", "não
faça mais isso", "prefiro assim", "sempre que...", "evita...", "da
próxima vez..."), perguntar:

> "Quer que eu salve isso pra não precisar repetir?"

Se sim, identificar onde faz mais sentido salvar:

- **Sobre o negócio** (clientes, serviços, mercado) → `_memoria/empresa.md`
- **Sobre preferências e estilo** (tom de voz, formato, o que evitar) → `_memoria/preferencias.md`
- **Sobre prioridades e foco** (projetos, metas, prazos) → `_memoria/estrategia.md`
- **Regra de comportamento nessa pasta** → próprio `CLAUDE.md`

Salvar com uma linha nova clara, sem reformatar o arquivo inteiro.
Confirmar mostrando a linha adicionada.

Não perguntar se a correção for óbvia de contexto imediato (ex: "na
verdade o arquivo se chama X"). Só perguntar quando a informação tiver
valor duradouro.

---

## Manter contexto atualizado

Ao terminar uma tarefa que mudou algo relevante (cliente novo, skill
nova, mudança de foco, processo novo, ferramenta instalada, estrutura
alterada), perguntar:

> "Isso mudou algo no teu contexto. Quer que eu atualize a memória?"

Se sim, identificar o que atualizar:

- **Cliente, serviço, ferramenta, equipe** → `_memoria/empresa.md`
- **Mudança de prioridade ou foco** → `_memoria/estrategia.md`
- **Tom ou estilo** → `_memoria/preferencias.md`
- **Pasta, regra de organização, skill criada** → `CLAUDE.md`
- **Visual (cores, fontes, logo)** → `identidade/design-guide.md`

Mostrar o que vai mudar antes de salvar. Não reformatar o arquivo
inteiro, só adicionar ou editar a linha relevante.

**Quando NÃO perguntar:**
- Tarefas pontuais sem impacto no contexto (escrever um email avulso, criar um post)
- Perguntas simples ou conversas sem ação
- Mudanças já salvas pelo bloco "Aprender com correções"

**Dica:** rode `/atualizar` pra uma varredura completa quando houver dúvida.

---

## Log de eventos e wikilinks

`_memoria/empresa.md` e `_memoria/estrategia.md` guardam a síntese — o que é
verdade *agora*. Isso significa que editar essas duas linhas de novo depois
(proposta que venceu, cliente que saiu) é reescrever por cima, e o histórico se
perde. Pra não perder, existe `_memoria/log.md`: registro cronológico
**append-only** — só cresce, nunca reformata.

Toda vez que acontecer um evento datado e permanente (cliente novo, proposta
enviada, proposta com desfecho — vencida/ganha/perdida, contrato emitido/
assinado/encerrado), duas ações, não uma:

1. Atualizar a síntese (`empresa.md` ou `estrategia.md`) — o que já é feito
   pelo bloco "Manter contexto atualizado" acima
2. Adicionar uma linha em `_memoria/log.md`, formato `- **[AAAA-MM-DD]** tipo —
   descrição`. Isso não precisa de confirmação do usuário (é só soma, não
   reinterpreta nada) — pode ser feito direto

Proposta que passa da validade sem resposta **sai** da tabela ativa em
`estrategia.md` e a linha de desfecho entra no log — a tabela mostra só o que
está aberto agora, o histórico completo fica no log.

**Wikilinks:** ao citar cliente, proposta ou outro doc de contexto dentro de
`_memoria/*.md` ou `clientes/<Nome>/CLAUDE.md`, preferir `[[caminho/arquivo.md|Nome
de exibição]]` a texto solto — deixa o grafo navegável se a pasta for aberta no
Obsidian (ou qualquer app que leia wikilink), sem exigir nada além de markdown
puro; sem Obsidian, o link some, o resto do texto continua legível. **Não usar
wikilink dentro de tabela** — o `|` quebra a célula; nesse caso, manter a
tabela em texto simples e colocar o link na frase ao lado, se fizer sentido.
Reservar backtick (`` `caminho` ``) pra artefato/entrega (proposta em HTML,
contrato, subpasta de peça) — wikilink é só entre notas de contexto.

---

## Criação de skills

Quando o usuário pedir skill nova:

1. Verificar se existe template relevante em `templates/skills/`. Se
   existir, usar como base e adaptar pro contexto
2. Perguntar se é específica desse projeto ou útil em qualquer:
   - Específica → `.claude/skills/nome-da-skill/SKILL.md` (local)
   - Universal → `~/.claude/skills/nome-da-skill/SKILL.md` (global)
3. Ler `_memoria/empresa.md` e `_memoria/preferencias.md` pra calibrar
   o conteúdo da skill ao contexto do negócio
4. Se a skill precisar de arquivos de apoio (templates, exemplos),
   criar dentro da pasta da skill
5. Seguir o fluxo da skill-creator nativa do Claude Code

---

# Scault

> Operação da agência. Aqui ficam todos os clientes, propostas, conteúdo e entregas.

**Estrutura de pastas:**
- `_memoria/` — quem é a Scault, como falamos, foco atual
- `identidade/` — marca da Scault (aplicada nas peças internas)
- `clientes/` — uma subpasta por cliente, autossuficiente (criada pelo `/novo-projeto`)
- `propostas/` — propostas em andamento
- `contratos/` — contratos emitidos e assinados
- `marketing/` — conteúdo institucional da Scault
- `motion/` — projeto Remotion (vídeo motion programático — Reels, legenda animada)
- `studio-scault/` — **studio.scault**: painel local (localhost:3000) pra criar, editar
  e publicar carrossel — modo de edição fica salvo entre slides (só renderiza no "Salvar"),
  barra de IA flutuante (escopo slide ou carrossel inteiro), 3 fontes de foto (Pexels/Unsplash,
  Google Imagens, e as que já estão em `clientes/<Nome>/` — ver `pastaDaMarca` em
  `servidor/lib/imagens.js`), post de imagem única. Abre como app de desktop
  (atalho + ícone via `studio-scault/app/instalar.ps1` — janela `--app`, sem terminal,
  sobe e desliga o servidor sozinho) ou `cd studio-scault && npm start`. Não é Electron:
  é o mesmo servidor local numa janela do Chrome. Usa o mesmo motor de render da skill `/carrossel` e os
  mesmos scripts de publicação — não duplica nada. Cada cliente cadastrado em `clientes/`
  precisa de um `studio-scault/marcas/<slug>.json` correspondente — o `/novo-projeto` já
  cria os dois juntos (ver seção "Integração com o studio.scault" na skill). Documentação
  completa em `studio-scault/README.md`
- `site/` — site próprio da Scault, repositório separado (não faz parte deste
  pacote — clonar à parte se for reconectar a referência visual abaixo)
- `templates/` — modelos base de skills, perfis, identidade e ferramentas
- `scripts/` — utilitários da operação
- `saidas/` — documentos pontuais, análises
- `dados/` — arquivos a analisar (relatórios de cliente, exports)

## Sobre a agência

Agência de marketing digital sediada em Belém-PA, tocada sozinho pelo Sidney.
Atende negócios locais e instituições da região. Serviços principais:

- Sites institucionais
- Conteúdo para redes sociais
- Anúncios online (Google Ads / Meta Ads)

Time: 1 pessoa (Sidney, fundador — atendimento, produção e prospecção).

## O que mais produzimos aqui

- Conteúdo e presença digital própria da Scault (prioridade atual — ver `_memoria/estrategia.md`)
- Propostas comerciais pra novos clientes
- Conteúdo e anúncios pros clientes da carteira

## Tom de voz

Ver `_memoria/preferencias.md` — narrativa pessoal, direta, com referências reais
e concretas. Evitar chavão de IA, travessão em excesso e emoji forçado.

## Regras do sistema

- Cliente novo → criar pasta `clientes/<Nome>/` via `/novo-projeto`, que também cadastra
  a marca em `studio-scault/marcas/<slug>.json` (sem isso, gerar carrossel pra esse cliente
  no painel trava com "marca desconhecida"); registrar `cliente-novo` em `_memoria/log.md`
- Proposta nova → `propostas/<cliente>-<assunto>-<data>.html` antes de fechar.
  O `<assunto>` é obrigatório: o mesmo prospect costuma receber mais de uma proposta
  (ex: `acme-trafego-2026-08-05` e `acme-site-2026-08-05`).
  Gerar o PDF ao lado, mesmo nome, via Playwright em mídia `print`; registrar
  `proposta-enviada` em `_memoria/log.md`
- Toda proposta em aberto entra na tabela de `_memoria/estrategia.md`, com validade.
  Quando vencer ou tiver desfecho (ganha/perdida), sai da tabela e o desfecho vira
  linha em `_memoria/log.md` — ver "Log de eventos e wikilinks" acima
- Contrato emitido/assinado → registrar `contrato-assinado` (ou `contrato-emitido`
  se ainda não tiver assinatura confirmada) em `_memoria/log.md`
- **Referência trazida pra modelar → entrega IDÊNTICA, nunca "semelhante".** Quando o Sidney
  traz uma peça (print, carrossel de terceiro, link) e pede pra modelar, o que muda é só o
  conteúdo: texto e foto. Fonte, peso, caixa, escala, cor, âncora, tratamento de foto e a
  presença **ou ausência** de cada elemento de moldura vêm da referência. Se a referência não
  tem logo, contador, @ no rodapé, régua ou kicker, a peça não tem — nada entra "porque
  carrossel costuma ter". A identidade visual da marca **não** entra: a única exceção é bloco
  de perfil (avatar + nome + @, tipo print de tweet), que recebe os dados de quem publica.
  Conferir renderizado, lado a lado com a referência, antes de aprovar. Regra pedida em
  31/08/2026, depois de o estúdio devolver uma peça de cliente em Inter com kicker,
  régua, logo e @ que não existiam na referência. Implementação em
  `studio-scault/servidor/lib/pele.js` e na seção "Modelagem por referência" da skill
  `/carrossel`
- **Identidade visual:** `identidade/scault-design-system.md` é a fonte de verdade
  de tokens (cor, tipografia, componentes). Peça visual nova herda os componentes do
  site em `site/index.html` — é a implementação de referência
- Gargalo atual é aquisição de clientes — ao sugerir prioridades, favorecer o que
  ataca isso direto (prospecção, conteúdo recorrente)
- Operação é de uma pessoa só. Antes de sugerir assumir volume novo, checar a
  restrição de capacidade em `_memoria/estrategia.md`
- **Foto pra peça visual:** buscar em banco via `scripts/buscar-fotos.js` antes de
  cogitar gerar por IA — o script varre Pexels e Unsplash de uma vez. Sempre olhar os
  previews e descartar o que tem cara de banco de imagem genérico. O crédito vai na
  legenda e não é opcional: usar a linha que o script gerou (`creditos.md`), literal —
  o Pexels aceita só a marca, o Unsplash exige o nome do fotógrafo
- **Chaves de API** vivem só no `.env` (que está no `.gitignore`). `.env.example` é o
  modelo versionado. Nunca escrever chave em skill, script ou peça
- Copy, anúncio ou headline → consultar a skill `schwartz-breakthrough-advertising`
  (`.claude/skills/`) — framework do livro *Breakthrough Advertising* (Eugene Schwartz):
  mass desire, estágios de consciência e sofisticação de mercado, as 7 técnicas de
  breakthrough copy. Gerada via `/book-to-skill` em 2026-08-26
- **Antes de escrever qualquer copy (headline, anúncio, landing, VSL, legenda), PERGUNTAR
  ao Sidney — não presumir a partir do framework:**
  1. **Sofisticação do mercado:** quantos concorrentes já anunciam isso? Oceano azul /
     pioneiro = ser direto, vender a promessa. Oceano vermelho = vender o mecanismo.
  2. **Promessa ou mecanismo:** vender o resultado direto, ou construir o "como funciona"?
  3. **Estágio de consciência do público** e quão direto ir na headline.
  4. **Restrições de estrutura/formato:** badge, seções, tamanho, o que NÃO usar.
  5. **Ângulo ou abertura de headline** que o Sidney já tem em mente.
  Regra pedida pelo Sidney em 28/08/2026, depois de corrigir o rascunho da LP de
  distrato de multipropriedade (eu tinha presumido mercado sofisticado e copy de
  mecanismo; era oceano azul e copy de promessa direta).
- Precificação, proposta comercial ou desenho de oferta/pacote de serviço → consultar
  a skill `hormozi-offers` (`.claude/skills/`) — framework do livro *$100M Offers*
  (Alex Hormozi): Value Equation, seleção de mercado/nicho, Trim & Stack, e os
  5 realces de oferta (escassez, urgência, bônus, garantia, naming). Gerada via
  `/book-to-skill` em 2026-08-26

## Ferramentas conectadas

- [x] Pexels (fotos de banco — `PEXELS_API_KEY` no `.env`)
- [x] Unsplash (fotos de banco — `UNSPLASH_ACCESS_KEY` no `.env`; app em Demo, 50 buscas/hora)
- [x] Higgsfield (geração de imagem por IA — MCP HTTP em `.mcp.json`, autenticação via OAuth)
- [x] Meta Ads (MCP oficial da Meta — HTTP em `.mcp.json`, autenticação via OAuth contra o Business Manager)
- [x] Meta Graph API — publicação orgânica (Instagram + Facebook, multi-conta por cliente com
  sufixo `_<SLUG>` no `.env`, skill `/aprovar-post`. Setup completo em `marketing/automacao-meta-setup.md`)
- [x] Cloudinary (hospedagem de imagem pro post quando a conta não tem site publicado —
  `CLOUDINARY_*` no `.env`, fallback automático dos scripts `postar-instagram.js`/`postar-facebook.js`)
- [x] Claude Ads (skill `ads`/`ads-*` — linkada como read-adapter à MCP do Meta Ads; setup profile em
  `.claude-ads/setup-profile.json`, gitignored por listar contas de cliente — mapear
  as contas em `account_refs` conforme forem entrando; `mutation_authority: none` —
  só leitura/auditoria por enquanto)
- [ ] OpenAI (geração de imagem)
- [ ] Notion
- [ ] Gmail
- [ ] Google Calendar
- [ ] Google Ads

*(Marcar conforme for instalando os MCPs)*
