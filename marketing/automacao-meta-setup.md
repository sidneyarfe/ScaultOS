# Setup — publicação automática no Instagram + Facebook

Guia de uma vez só pra conectar a Meta Graph API no ScaultOS. Depois disso, `/aprovar-post`
publica sozinho.

## 0. Pré-requisito de conta

- A conta do Instagram precisa ser **Business** ou **Creator** (não pessoal).
  App do Instagram → Configurações → Conta → "Mudar para conta profissional".
- Essa conta Instagram precisa estar **conectada a uma Página do Facebook**.
  App do Instagram → Configurações → Contas conectadas → Facebook (ou pelo Meta Business Suite).

Sem isso, nenhum token resolve — a API só publica em conta Business linkada a uma Página.

## 1. Criar o app na Meta for Developers

1. https://developers.facebook.com/apps → **Criar app** → tipo **"Empresa"**
2. Nome qualquer (ex: "ScaultOS Publicação")
3. No painel do app, adicionar o produto **"Instagram"** (ou "Instagram Graph API" —
   o nome muda de vez em quando no painel) e o **"Facebook Login"**

## 2. Gerar o token de longa duração

Caminho mais direto é pelo **Graph API Explorer**, sem escrever nada:

1. https://developers.facebook.com/tools/explorer
2. No seletor "Meta App", escolhe o app criado no passo 1
3. No seletor "User or Page", escolhe **seu usuário**
4. Em "Permissions", adiciona:
   - `pages_show_list`
   - `pages_read_engagement`
   - `instagram_basic`
   - `instagram_content_publish`
   - `business_management`
5. **Generate Access Token** → loga e aceita as permissões
6. Isso dá um **token de usuário de curta duração** (expira em ~1h). Trocar por um de
   longa duração (60 dias, e token de Página gerado a partir dele não expira sozinho):

   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=<APP_ID>
     &client_secret=<APP_SECRET>
     &fb_exchange_token=<TOKEN_CURTO_DO_PASSO_5>
   ```

   `APP_ID` e `APP_SECRET` estão em Configurações do app → Básico. Dá pra rodar essa
   URL direto no navegador (é GET) ou colar no próprio Graph API Explorer.

7. Com o token de usuário de longa duração em mãos, pega o **token da Página**:

   ```
   GET https://graph.facebook.com/v21.0/me/accounts
     ?access_token=<TOKEN_LONGO_DO_PASSO_6>
   ```

   A resposta lista suas Páginas — cada uma já vem com um `access_token` próprio
   (esse é o `access_token` da Página, e **não expira** enquanto o token de usuário
   por trás continuar válido). Guarda:
   - `id` → isso é `META_PAGE_ID`
   - `access_token` → isso é `META_PAGE_ACCESS_TOKEN`

## 3. Achar o ID da conta Instagram

```
GET https://graph.facebook.com/v21.0/<META_PAGE_ID>
  ?fields=instagram_business_account
  &access_token=<META_PAGE_ACCESS_TOKEN>
```

O `id` que volta em `instagram_business_account` é `META_IG_USER_ID`.

## 4. Hospedar as imagens (Cloudinary)

A Graph API busca a imagem por URL pública — não aceita upload de arquivo local. Se a conta
não tiver site com deploy próprio, os scripts sobem cada slide pro Cloudinary automaticamente
no momento de publicar (nunca no dry-run, só depois do `--confirmar`).

1. https://cloudinary.com/users/register/free → cria a conta (grátis, sem cartão)
2. O painel (Dashboard) já mostra os três valores prontos, sem precisar configurar nada:
   **Cloud Name**, **API Key**, **API Secret**
3. Uma conta só serve pra todas as contas de posting — não precisa criar uma por cliente,
   os scripts organizam os uploads em pastas (`scaultos-posts/<conta>/<slug>/`)

## 5. Preencher o `.env`

```bash
META_PAGE_ACCESS_TOKEN=EAAxxxxxxxxxxxxx
META_PAGE_ID=1234567890
META_IG_USER_ID=1789012345
SITE_URL=https://seudominio.com.br   # opcional — só se a conta tiver site com deploy próprio

CLOUDINARY_CLOUD_NAME=xxxxx           # obrigatório se SITE_URL ficar vazio
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
```

## 6. Testar

Roda **sem** `--confirmar` primeiro — mostra a conta destino e a origem da imagem
(site ou Cloudinary) sem publicar nada:

```bash
node --env-file=.env scripts/postar-instagram.js marketing/conteudo/<slug>-<data>
node --env-file=.env scripts/postar-facebook.js marketing/conteudo/<slug>-<data>
```

Confere se bateu, só então roda de novo com `--confirmar` no fim (pra conta de cliente,
soma `--conta <SLUG>` — ver seção "Multi-conta" abaixo).

Ou deixa o `/aprovar-post` chamar isso no fluxo normal (passo 7-8 da skill).

## Erros comuns

| Erro | Causa | Correção |
|---|---|---|
| `código 190` | Token expirado/inválido | Refaz passo 2 (o token de Página não expira sozinho, mas revogação manual ou troca de senha derruba) |
| `código 100` mencionando imagem | API não conseguiu buscar a URL da imagem | Confere se o deploy do site já subiu (SITE_URL) ou se o upload no Cloudinary terminou |
| `Cloudinary: ...` | Faltou `CLOUDINARY_*` no `.env` sem `SITE_URL` configurado, ou credencial errada | Passo 4 |
| `A conta do Instagram não é Business` | Conta pessoal ou não linkada à Página | Passo 0 |
| `permissions error` / `código 10` | Faltou permissão no token | Refaz passo 2 com as 5 permissões listadas |

## Multi-conta (cliente)

O `.env` suporta uma conta própria (chaves sem sufixo) e quantas contas de cliente forem
necessárias (chaves com sufixo `_<SLUG>`, um bloco por cliente), todas geradas a partir do
mesmo token de usuário via `/me/accounts`:

| Slug | Cliente | Instagram | Pasta em `clientes/` |
|---|---|---|---|
| `ACME` | Acme Ltda | @acme | `clientes/Acme/` |

Pra usar: `node scripts/postar-instagram.js <pasta> --conta ACME --confirmar` (mesmo padrão
pro `postar-facebook.js`). Sem `--conta`, os scripts usam as chaves sem sufixo (conta própria).

**Adicionar conta nova:** repetir o passo 2 do zero pra esse cliente (o token de Página de um
cliente não serve pra outro), depois duplicar o bloco no `.env` com o novo sufixo. Ver o molde
em `.env.example`.

**Nunca reusar token entre contas** como prática — cada Página deve ter o seu, gerado
separadamente, é assim que a separação por sufixo evita cruzar cliente com cliente. Mas vale
saber o mecanismo real por trás (ver seção abaixo): tecnicamente um token de Página não é
travado só por ter sido emitido apontando pra ela — ele carrega a autorização do app + a role
da pessoa. Se depois alguém compartilha uma página nova entre Business Managers, um token que
já existia pode passar a alcançá-la sozinho, sem ninguém ter pedido. Não é motivo pra reusar de
propósito, mas explica por que às vezes um token "funciona" em página que não devia.

## Página/IG de um Business Manager diferente do app

Já aconteceu de uma segunda unidade/página de um cliente estar dentro do mesmo Business Manager
que hospeda a página já configurada, com "Acesso total" confirmado nas duas (aba Pessoas), e
mesmo assim o token gerado pra primeira página bater erro `#10` ao tentar ler a segunda.

**Causa:** o Business Manager só empresta a Página pro **app** (e, por tabela, pro token
gerado a partir dele) depois de um **Acesso de Parceiro** — que é diferente de "Página estar
no portfólio" e diferente de "pessoa ter acesso total na Página". São três camadas
independentes: pessoa↔ativo, ativo↔portfólio, e portfólio↔portfólio (parceiro). Faltava só a
terceira.

**Diagnóstico rápido pra próxima vez:**

1. `GET /<PAGE_ID>?fields=id,name&access_token=<token de outra página que já funciona>`
2. Erro `#10 requires pages_read_engagement` = falta Acesso de Parceiro entre os Business
   Managers, não é o token que está errado nem falta role de pessoa
3. No BM dono da página nova → Configurações do negócio → Parceiros → conceder **Acesso de
   parceiro** dessa Página (e da conta do Instagram vinculada) para o Business Manager de onde
   o app roda
4. Depois de propagar (foi quase instantâneo no nosso caso), **retesta o mesmo comando do
   passo 1 com o token que já existe antes de sair gerando um novo** — na prática ele passa a
   alcançar a página nova sozinho
5. Só falta cadastrar `PAGE_ID`/`IG_USER_ID` novos no `.env` com sufixo próprio, reaproveitando
   o token existente — não precisa refazer o passo 2 nem gerar Usuário do Sistema

**Becos sem saída que testamos e não servem pra isso:**

- Configurações do negócio → Contas → **Apps** → Conectar ativos: só conecta **Contas de
  anúncios** (Marketing API). Não existe opção de Página/Instagram por ali — é dead end pra
  publicação orgânica.
- Página → aba "Ativos conectados": é sobre apps ligados àquela Página especificamente (tipo
  integração de inbox), não sobre compartilhamento entre Business Managers.
- Atribuir a pessoa na Página/Instagram (aba "Pessoas"): não resolve sozinho quando a página
  pertence a outro BM — dá pra já ter acesso total ali e o token do app de outro BM ainda
  assim não alcançar, porque falta o Acesso de Parceiro entre os dois negócios.
- Usuário do Sistema (token que não depende de sessão pessoal, com expiração "Nunca"): é uma
  alternativa mais robusta pro futuro, mas não foi necessário nesse caso — o Acesso de Parceiro
  seguido de reteste do token existente já resolveu.

## Renovação

O token de Página gerado a partir de um token de usuário de longa duração **não expira
por tempo** — só se: a senha do Facebook mudar, o app for revogado manualmente em
Configurações → Segurança → Apps conectados, ou o app ficar 60 dias sem nenhuma chamada.
Se `postar-instagram.js` começar a falhar com código 190 do nada, é só refazer o passo 2.
