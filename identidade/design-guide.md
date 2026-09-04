# Identidade visual — Scault

> **Este arquivo não é mais a fonte de verdade.**
> A fonte de verdade dos tokens da marca é **`identidade/scault-design-system.md`**.
> A implementação de referência é **`site/index.html`** — o site publicado.
>
> Decidido em 05/08/2026. A versão anterior deste arquivo (paleta carvão + bronze
> champagne, PP Neue Montreal) descrevia uma direção que nunca chegou a ser aplicada
> em peça nenhuma e conflitava com o site. Está preservada no histórico do git.

---

## Por que a mudança

Existiam dois brandbooks divergentes na pasta `identidade/`:

| | Este arquivo (v1) | `scault-design-system.md` |
|---|---|---|
| Base | Carvão `#0B0D10` | Preto `#050506` |
| Cor de sistema | Prata azulado `#C7D0E6` | Azul metálico `#A3C5CE` |
| Destaque | Bronze champagne `#8C6B3F` | Azul luminoso `#8DCCFF` |
| Display | PP Neue Montreal | Inter Tight |

O site foi construído sobre o segundo — o CSS de `site/index.html` declara
`Tokens: identidade/scault-design-system.md` — e as propostas comerciais
seguem o mesmo sistema. O bronze champagne sai da marca.

---

## Resumo operacional dos tokens vigentes

Para qualquer peça visual gerada pelo ScaultOS (carrossel, post, proposta, slide, site).
Detalhamento completo em `scault-design-system.md`.

### Cor

| Token | Hex | Uso |
|---|---|---|
| Base | `#050506` | Fundo de tudo |
| Painel | `#0B0B0E` | Superfície padrão de cards e blocos |
| Elevado | `#0A0A0C` | Seção alternada, cabeçalho de tabela |
| Azul metálico | `#A3C5CE` | Cor de sistema |
| Azul luminoso | `#8DCCFF` | **Só ênfase** — CTA, palavra-chave, ícone ativo, marcador |
| Texto | `#EEF2F7` | Principal |
| Texto secundário | `#A2ACBD` | Corpo |
| Texto terciário | `#7F899B` | Rótulo, legenda, meta |
| Hairline | `rgba(255,255,255,.085)` | Bordas e divisores |

**Metal escovado** — a liga do logo, usada em botão primário e em número de destaque:
`linear-gradient(130deg,#C3D0D8 0%,#93A9B4 24%,#D5E1E8 47%,#8FA6B2 68%,#AEC0C9 100%)`

### Tipografia

- **Display:** Inter Tight, peso 600/700, `letter-spacing: -.026em`
- **Corpo:** Inter, peso 400/500, `letter-spacing: -.01em`, entrelinha 1.55
- Família única de propósito: nunca desalinha entre um tamanho e outro

### Forma

- **Raios:** 3px (botão), 5px, 8px (card). Corte reto — nunca pílula
- **Bordas:** 1px hairline. Sem sombra projetada; profundidade vem de luz difusa
  (`radial-gradient` com azul luminoso a 5-20% de opacidade) e diferença de tom
- **Marca de canto (`.tick`):** filete de 9px no canto superior esquerdo e inferior
  direito dos painéis. Motivo de marca, custo zero — é o "instrumento de precisão"
- **Vidro:** exceção reservada a poucos momentos por peça (menu, destaque, CTA),
  nunca o padrão

### Botões

| Tipo | Estilo |
|---|---|
| Primário | Preenchido com o metal azul, texto `#04121D`, gradiente desliza no hover |
| Secundário | Filete de metal escovado em borda de 1px, fundo escuro quase opaco |
| Texto | Label + seta `→` em azul luminoso |

### Ícones

Lineares, `stroke-width: 1.4`, `viewBox="0 0 24 24"`, cor `currentColor` em azul
luminoso. O conjunto usado no site está em `site/index.html`, dentro do `<defs>` no
topo do `<body>` — reaproveitar de lá em vez de desenhar novos.

---

## Logo

- **Arquivo-fonte:** `identidade/LOGO SCAULT.svg` — wordmark com gradiente metálico
  (`<linearGradient id="metal">`) + tagline "MARKETING & AI" em `#EEF2F7`
- Cópia usada pelo site em `site/assets/logo.svg`
- Proporção original 559×140 — preservar ao redimensionar
- Área de respiro: mínimo igual à altura do "S" em todos os lados
- **Não existe versão para fundo claro.** Se a peça exigir fundo claro, colocar a logo
  sobre bloco escuro — nunca soltar direto no branco
- Tamanho sugerido: 110–150px de largura em HTML
- Ao embutir o SVG inline em mais de um documento, dar `id` único ao gradiente
  (`metal`, `mtrf`, `mkyr`…) — ids repetidos colidem e a logo perde o metal

---

## O que NUNCA fazer

- Fundo claro como base da marca — a identidade é escura
- Gradiente roxo→azul (clichê de IA genérica)
- Neon saturado / cyberpunk — a luz da marca é fria e sóbria
- Emoji como ícone
- `border-radius` acima de 8px
- Sombra projetada
- Azul luminoso em área sólida grande — é cor de ênfase, não de preenchimento
- Bronze champagne, dourado ou qualquer paleta quente
