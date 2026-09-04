# scripts/ — utilitários do ScaultOS

Scripts Node.js e Python que as skills chamam quando precisam fazer coisas fora do alcance da IA pura (gerar imagem, postar em rede social, renderizar HTML em PNG).

Cada skill que precisa de script tem instrução de como criar (e geralmente é um único setup por integração que você vai ativar).

## Scripts comuns

Conforme você for ativando skills, isso aqui vai sendo populado. Lista do que cada skill espera encontrar:

| Skill | Script esperado | O que faz |
|---|---|---|
| `/carrossel` (foto de banco) | `buscar-fotos.js` ✅ | Busca e baixa foto grátis via API do Pexels + Unsplash |
| `/carrossel` (com foto IA) | `gerar-imagem.js` | Gera foto realista via OpenAI API (DALL-E 3) |
| `/carrossel` (render PNG) | `render.js` (gerado por carrossel, fica na pasta do conteúdo) | Playwright tira screenshot 1080x1350 de cada slide |
| `/aprovar-post` | `postar-instagram.js` ✅ | Publica carrossel no Instagram via Meta Graph API |
| `/aprovar-post` | `postar-facebook.js` ✅ | Publica carrossel no Facebook via Meta Graph API |
| `/anuncio-google` | (nenhum — gera CSV direto) | — |
| `/relatorio-ads` | (lê CSV exportado das plataformas) | — |

## Pré-requisitos comuns

A maioria dos scripts depende de:

**Node.js 20+** instalado na máquina

**.env** na raiz do projeto com as chaves de API (parte de `.env.example` — `cp .env.example .env`):
```bash
PEXELS_API_KEY=...                  # pra buscar-fotos.js
UNSPLASH_ACCESS_KEY=...             # pra buscar-fotos.js (basta uma das duas)
OPENAI_API_KEY=sk-...               # pra gerar-imagem.js
META_PAGE_ACCESS_TOKEN=...          # pra postar-instagram.js + postar-facebook.js
META_PAGE_ID=...
META_IG_USER_ID=...
SITE_URL=https://seudominio.com.br  # opcional — sem isso, sobe a imagem pro Cloudinary
CLOUDINARY_CLOUD_NAME=...           # obrigatório se SITE_URL ficar vazio
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

O `.env` está no `.gitignore` — as chaves não vão pro repositório. Se alguma chave
vazar em commit, revoga na plataforma antes de qualquer outra coisa.

**Playwright** (pra renderizar HTML em PNG):
```bash
npm install playwright
npx playwright install chromium
```

## buscar-fotos.js — fotos de banco (Pexels + Unsplash)

Já vem pronto. Busca nos **dois bancos de uma vez** e intercala os resultados, então
a mesma busca devolve dois acervos diferentes pro mesmo termo. Basta ter uma das
chaves configurada — com as duas, o leque é bem maior.

| Banco | Chave grátis em | `.env` | Cota |
|---|---|---|---|
| Pexels | https://www.pexels.com/api/ (login → "Your API Key") | `PEXELS_API_KEY` | 200 buscas/hora, 20.000/mês |
| Unsplash | https://unsplash.com/oauth/applications (nova app → "Access Key") | `UNSPLASH_ACCESS_KEY` | 50/hora em Demo, 5.000/hora em Production |

A app do Unsplash nasce em **Demo** (50 req/hora). Pra subir pra 5.000, é preciso
pedir aprovação pra Production no painel da app. Baixar foto não consome cota nos
dois bancos — só as chamadas à API contam.

```bash
# 1. buscar: lista candidatos dos dois bancos e baixa previews pequenos
node scripts/buscar-fotos.js buscar "advogada escritório" --orientacao portrait --n 8

# só um banco, quando quiser economizar cota ou o outro estourou o limite
node scripts/buscar-fotos.js buscar "belém do pará" --fonte unsplash

# 2. baixar: pega em alta só a escolhida, já com os créditos
node scripts/buscar-fotos.js baixar 3184291 --out marketing/conteudo/post-x --nome capa
node scripts/buscar-fotos.js baixar Dwu85P9SOIk --out marketing/conteudo/post-x --nome capa

node scripts/buscar-fotos.js --help    # todas as opções
```

**O ID diz a fonte:** numérico é Pexels (`3184291`), alfanumérico é Unsplash
(`Dwu85P9SOIk`). Pra forçar, usa prefixo — `px:3184291` ou `un:Dwu85P9SOIk`.

Diferenças que valem lembrar:

- `--cor` aceita hex no Pexels; o Unsplash só aceita nome de uma lista fechada
  (`black`, `white`, `teal`, `blue`…) e ignora hex silenciosamente
- `--locale` só vale pro Pexels. O acervo do Unsplash é indexado **só em inglês** —
  busca em português traz resultado fraco, então **repetir o termo em inglês** rende
  muito mais lá
- `--n` é o total dividido entre os bancos (`--n 8` = 4 de cada)

O `baixar` escreve `creditos.md` e `creditos.json` na pasta de destino, e para fotos
do Unsplash chama o endpoint de contagem de download — **exigido pelas API Guidelines**,
é o que credita o download ao fotógrafo.

**Atribuição é obrigatória nos dois.** O `creditos.md` já traz a linha pronta pra
legenda (`Fotos: ...`) — o Pexels se satisfaz com a marca, o Unsplash exige o nome do
fotógrafo. Usar a linha que o script gerou, não inventar outra.

## Como o ScaultOS lida com isso

Quando você roda uma skill que precisa de script ausente, o Claude vai:

1. Detectar que falta o script
2. Te perguntar se quer configurar agora
3. Te guiar no setup das chaves de API (Meta, OpenAI, etc.)
4. Criar o script já configurado
5. Rodar a skill

Você não precisa decorar nada. Roda a skill, segue o fluxo.
