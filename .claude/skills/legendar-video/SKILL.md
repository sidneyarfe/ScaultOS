---
name: legendar-video
description: >
  Coloca legenda animada (estilo TikTok/Reels, palavra em destaque sincronizada) em vídeo cru,
  usando Remotion — sempre Remotion, nunca o caminho ffmpeg simples. Transcreve o áudio local
  (Whisper, sem API paga), gera a legenda no padrão visual da marca e renderiza o vídeo final.
  Use quando o usuário pedir "legenda", "legendar vídeo", "coloca legenda", "vídeo com legenda",
  "subtitle", "caption", "edita esse vídeo" (pro escopo de legenda — não corte/trim), ou /legendar-video.
---

# /legendar-video — Legenda animada com Remotion

Pega um vídeo cru (sem legenda) e devolve o mesmo vídeo com legenda animada queimada,
no padrão visual da marca. Decisão fixada com o Sidney: **sempre via Remotion**, mesmo
quando o ffmpeg com Whisper embutido resolveria mais rápido — o motivo é a legenda
estilo TikTok/Reels com destaque de palavra e fonte/cor de marca, que o ffmpeg sozinho
não faz.

## Dependências

- **Skills Remotion** (`remotion-*`, já instaladas): `remotion-create` (scaffold do projeto),
  `remotion-captions` (transcrever, exibir, importar legenda), `remotion-render` (exportar),
  `remotion-studio` (preview antes de renderizar), `remotion-markup` e `remotion-best-practices`
  como apoio geral, `remotion-docs` se precisar consultar API específica
- **Whisper.cpp** (`@remotion/install-whisper-cpp`) — transcrição local, primeira vez baixa o
  binário + modelo (`medium.en`, ~1.5GB) — é único, não repete a cada vídeo
- **Identidade visual:** `identidade/design-guide.md` (peça própria da Scault) ou o
  `CLAUDE.md`/design system do cliente (peça de cliente — ver regra no `CLAUDE.md` raiz)
- **Node/npm:** já disponíveis no ambiente
- **Vídeo de entrada:** `dados/` — é a drop zone do ScaultOS. Se o usuário não apontar um
  arquivo específico, procurar vídeo (`.mp4`, `.mov`, `.webm`) solto em `dados/`
- **Output:** `marketing/conteudo/video-<tema>-<YYYY-MM-DD>/` (mesmo padrão de pasta do `/carrossel`)

## Projeto Remotion reutilizável

Não criar um projeto Remotion novo a cada vídeo — reutilizar um único projeto em `motion/`
na raiz (paralelo a `marketing/`, `identidade/`), do mesmo jeito que o `/carrossel` reaproveita
`node_modules` em vez de rodar `npm install` toda vez. Cada vídeo novo é uma **composition**
nova dentro desse projeto, não um projeto novo.

- Primeira vez: `npx remotion@latest init motion` (ou via `remotion-create`) na raiz do ScaultOS
- Vídeos seguintes: só adicionar a composition e a legenda, sem reinstalar nada

## Workflow

### Passo 1 — Localizar o vídeo e entender o pedido

1. Confirmar qual vídeo em `dados/` é o alvo (ou caminho que o usuário passou)
2. Perguntar se é peça própria da Scault ou de cliente específico — define de qual
   design system puxar cor de destaque e fonte da legenda
3. Se o projeto `motion/` ainda não existir, criar (ver acima) antes de seguir

### Passo 2 — Transcrever

Seguir `remotion-captions` → `transcribe-captions.md`:
1. Extrair áudio do vídeo (ffmpeg, se precisar de wav 16kHz)
2. Rodar Whisper.cpp local (`transcribe()`), gerar `captions.json`
3. Guardar o JSON dentro da pasta da composition (não em `public/` do projeto raiz, senão
   um vídeo pisa no outro)

### Passo 3 — Estilizar a legenda

Seguir `remotion-captions` → `display-captions.md`:
- `createTikTokStyleCaptions()` pra paginar (quantas palavras por vez — usar um valor que
  não lote a tela, testar 1000-1400ms de troca como ponto de partida)
- Cor de destaque da palavra ativa = cor de destaque do design system aplicável (Scault ou
  cliente) — nunca cor genérica solta
- Fonte = a mesma da identidade (se for Inter, por exemplo, carregar Inter no projeto Remotion)
- Posição: geralmente centro-baixo, fora da área de rosto/produto do vídeo — mesma lógica da
  "regra de alinhamento" do `/carrossel` (não cobrir o que importa na imagem/vídeo)

### Passo 4 — Preview antes de renderizar

Abrir `remotion-studio` (ou renderizar um trecho curto) e mostrar pro usuário como a legenda
ficou antes de rodar o render completo. **CHECKPOINT: esperar aprovação.** Vídeo é caro de
re-renderizar — não vale a pena descobrir erro de timing ou cor só no final.

### Passo 5 — Renderizar e salvar

1. `remotion-render` pra exportar o vídeo final com legenda queimada
2. Salvar em `marketing/conteudo/video-<tema>-<YYYY-MM-DD>/`:
   ```
   marketing/conteudo/video-<tema>-<data>/
     video-legendado.mp4
     captions.json          ← reaproveitável se precisar reprocessar
   ```
3. Se fizer sentido, oferecer legenda de post (Instagram/TikTok) junto, mesmo padrão do
   `/carrossel` — mas só se o usuário pedir, não é automático aqui (o automático do
   `/carrossel` é pra carrossel, não pra vídeo)

## Regras

- **Sempre Remotion**, nunca o atalho ffmpeg+Whisper puro — decisão do Sidney, é sobre ter
  legenda animada com destaque de palavra e fidelidade à marca, não só "ter legenda"
- Reutilizar o projeto `motion/` — nunca criar projeto Remotion novo por vídeo
- Legenda de peça de cliente usa a identidade do cliente, nunca a da Scault (mesma regra do
  `CLAUDE.md` raiz pra qualquer peça visual)
- Preview antes de renderizar — nunca renderizar o vídeo final sem checkpoint de aprovação
- Se o vídeo de entrada não estiver claro (mais de um arquivo em `dados/`, ou nenhum), perguntar
  qual é, não assumir
