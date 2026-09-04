---
name: aprovar-post
description: >
  Aprova e publica um post da fila — flipa o blog de draft pra published, copia os PNGs do
  carrossel pro public folder do site, faz commit e push (Netlify/Vercel deploya), aguarda
  o deploy, e posta o carrossel no Instagram + Facebook via Meta Graph API. Use quando o
  usuário disser "aprovar post X", "publicar o post do tema Y", "/aprovar-post X", ou quando
  quiser disparar a publicação automática de um conteúdo já criado pela skill /publicar-tema.
---

# /aprovar-post — Pipeline de aprovação e publicação automática

Faz a ponte entre o conteúdo aprovado (blog + carrossel + legendas, criado por `/publicar-tema`)
e a publicação real no feed (site + Instagram + Facebook).

## Quando NÃO usar

- Conteúdo ainda não foi criado → use `/publicar-tema` primeiro
- Usuário ainda está revisando → não rodar até ele dizer "aprovado" / "pode postar"
- Site não está deployado / Meta API não configurada → seguir setup abaixo

## Pré-requisitos (uma vez só)

- `.env` na raiz com, por conta (sem sufixo = conta própria da Scault; com sufixo `_<SLUG>` = conta de cliente, uma por cliente):
  - `META_PAGE_ACCESS_TOKEN[_<SLUG>]` — token de longa duração da Página FB
  - `META_PAGE_ID[_<SLUG>]` — ID da Página FB
  - `META_IG_USER_ID[_<SLUG>]` — ID da conta Insta Business
  - `SITE_URL[_<SLUG>]` — ex: `https://exemplo.com.br`
- Site com deploy automático a partir do `main` do GitHub (Netlify, Vercel, etc.) — só se o
  conteúdo dessa conta passa por blog. Conta de cliente sem blog só precisa das imagens
  hospedadas em alguma URL pública (a Graph API busca por URL, não aceita upload local).
- Conta Insta Business conectada à Página FB
- Página FB com permissões corretas no Meta App
- Scripts `scripts/postar-instagram.js` e `scripts/postar-facebook.js` configurados

Se algo disso faltar: parar e apontar pro guia de setup em `marketing/automacao-meta-setup.md`.

## Contas configuradas

Ver `.env` pra lista atual dos sufixos `_<SLUG>` existentes (cada um é uma Página + conta
Insta de cliente). **Nunca inferir qual conta usar por adivinhação** — se o usuário não disser
explicitamente a conta/cliente, perguntar antes de rodar qualquer coisa. Publicar no feed errado
não tem desfazer.

## Argumento

`/aprovar-post <slug>` — onde `<slug>` é o nome do arquivo do blog (ou da pasta de conteúdo,
pra conta sem blog) **sem `.md`**. Se for conta de cliente, o usuário também precisa indicar
qual (nome do cliente ou o slug da conta, ex: ONOFFICE).

Exemplo: `/aprovar-post como-conservar-produto` (conta própria)
Exemplo: `/aprovar-post post-institucional-08-18 --conta onoffice` (conta de cliente)

Se o usuário não passou slug, listar os posts pendentes (blog em draft, ou pasta de conteúdo
sem post_id registrado) e perguntar qual. Se não deu pra saber a conta com certeza, perguntar
qual antes de seguir — não assumir a conta própria por padrão quando a pasta está dentro de
`clientes/`.

## Workflow

### Passo 1 — Localizar arquivos

- Blog: `site/.../blog/<slug>.md` (caminho depende do stack — Astro, Hugo, etc.)
- Carrossel: procurar `marketing/conteudo/<slug>-*` (a pasta tem sufixo de data)
- Validar que existem PNGs em `<pasta-carrossel>/instagram/slide-XX.png` (2 a 10)
- Validar que existem `legenda.md` e `legenda-linkedin.md`

Se faltar qualquer um, parar e relatar.

### Passo 2 — Mostrar resumo + pedir confirmação final

Mostrar pro usuário, **sempre incluindo a conta destino em destaque** (isso não é opcional —
é o item que mais importa quando existe mais de uma conta configurada):
- **Conta/cliente destino** — nome + @usuário do Instagram (não só o slug interno)
- Título do blog (ou da peça, se não tiver blog)
- Quantos slides do carrossel
- Primeiras 200 chars da legenda
- URL final que vai ser publicada

Perguntar: **"Confirma publicação em @<usuário>? (sim/não)"** — citando a conta explicitamente
na pergunta, não só no resumo acima. Só seguir se ele disser sim, **de novo a cada execução**
(uma confirmação anterior não vale pra próxima chamada, nem pra outra conta).

### Passo 3 — Flipar draft pra false

Editar o frontmatter do blog: `draft: true` → `draft: false`.

### Passo 4 — Copiar PNGs pro public folder do site

- Origem: `marketing/conteudo/<slug>-<data>/instagram/slide-*.png`
- Destino: `site/.../public/img/posts/<slug>/slide-*.png`
- Criar pasta de destino se não existir
- Sobrescrever se já existir (caso seja re-publicação)

### Passo 5 — Commit + push

```bash
git add site/<caminho>/blog/<slug>.md site/<caminho>/public/img/posts/<slug>/
git commit -m "publicar: <título do blog>"
git push origin main
```

Esperar push terminar com sucesso.

### Passo 6 — Aguardar deploy

Deploy automático (Netlify/Vercel) leva ~1-2 min. Validar que o post está no ar:

```bash
curl -sf -o /dev/null -w "%{http_code}" "$SITE_URL/blog/$slug/"
```

Aguardar HTTP 200 (com timeout de 5 min). Também checar que pelo menos `slide-01.png` está acessível:

```bash
curl -sf -o /dev/null -w "%{http_code}" "$SITE_URL/img/posts/$slug/slide-01.png"
```

Sem isso, a Meta API vai falhar — ela busca a imagem por URL pública.

### Passo 7 — Postar no Instagram

```bash
node --env-file=.env scripts/postar-instagram.js <pasta-conteudo> [--conta <SLUG>] --confirmar
```

`--conta <SLUG>` só quando for conta de cliente (ex: `--conta onoffice`) — omitir pra conta
própria. **Rodar primeiro sem `--confirmar`** pra ver o echo de "Conta destino: @usuário" e
bater com o que foi confirmado no Passo 2; só depois rodar de novo com `--confirmar`. Isso é a
trava mecânica do script — sem `--confirmar` ele não publica nada, só mostra pra onde iria.

Capturar o post id retornado. Se falhar, **não seguir pra Facebook** — relatar e parar.

### Passo 8 — Postar no Facebook

```bash
node --env-file=.env scripts/postar-facebook.js <pasta-conteudo> [--conta <SLUG>] --confirmar
```

Mesma lógica do Passo 7 — dry-run primeiro, confere a Página destino, só então `--confirmar`.

Capturar o post id retornado.

### Passo 9 — LinkedIn

LinkedIn é manual por enquanto (API de empresa precisa de aprovação demorada). Mostrar pro usuário:

```
LinkedIn: cole esse texto manualmente em https://linkedin.com/in/<seu-perfil>:
<conteúdo de legenda-linkedin.md>
```

### Passo 10 — Resumo

Mostrar:
```
✓ Post publicado: <título>

Site:        <SITE_URL>/blog/<slug>/
Instagram:   <link do post>
Facebook:    <link do post>
LinkedIn:    pendente — texto pronto em legenda-linkedin.md (postar manual)
```

## Tratamento de erro

- Push falhou: rollback do `draft: false` (restaura `draft: true`), relata e para
- Deploy não subiu em 5 min: relata, pergunta se quer continuar mesmo assim ou abortar
- Insta API falhou: para e relata. Site já está no ar, blog publicado — só o post no feed que não foi
- FB falhou mas Insta OK: relata, sugere tentar de novo só o FB depois

## Princípios

1. **Confirmação humana antes de qualquer coisa irreversível.** Nunca pular o passo 2. Com
   conta de cliente, isso é ainda mais crítico: publicar no feed errado (ex: conteúdo da Scault
   saindo na conta de um cliente, ou vice-versa) é o pior tipo de erro dessa skill — não tem
   desfazer, e é confiança de cliente em jogo. Regra explícita do usuário (18/08/2026): **sempre**
   verificação + autorização expressa antes de publicar, sem exceção, mesmo em execuções
   repetidas ou em lote.
2. **Idempotente onde possível.** Re-rodar com mesmo slug deve detectar publicação prévia (blog não-draft, PNGs já no public/) e perguntar se é pra re-postar ou só atualizar.
3. **Falha cedo, falha alto.** Qualquer pré-requisito faltando = abortar e explicar o que falta.
4. **Logar tudo.** Cada passo imprime o que está fazendo e o resultado.
5. **Nunca assumir a conta.** Se o pedido não deixar claro se é a conta própria ou a de qual
   cliente, perguntar antes de tocar em qualquer arquivo ou script.
