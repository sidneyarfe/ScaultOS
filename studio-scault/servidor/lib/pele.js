// Pele fiel — o caminho de MODELAGEM POR REFERÊNCIA.
//
// Existe por causa de um erro real: o Sidney trouxe um carrossel de terceiro
// pra modelar (foto cheia + headline em serif condensada, caixa alta, sem
// logo, sem contador, sem rodapé) e o estúdio devolveu "semelhante": Inter,
// kicker com kerning aberto, régua, logo no topo, @handle no rodapé. Nada
// disso estava na referência.
//
// A causa era de projeto, não de sorte: o extrator antigo capturava só a
// GRAMÁTICA de layout ("não a marca, não a cor final") e traduzia tudo pro
// vocabulário da Scault; no motor genérico, o template ainda era degradado a
// uma linha de prompt ("use como referência de arco narrativo, não de
// HTML/CSS"). Modelar significava copiar o esqueleto e repintar com a marca.
//
// Aqui a regra é a inversa, e ela é a razão do módulo existir:
//
//   MODELAR = REPRODUZIR O SISTEMA VISUAL DA REFERÊNCIA. O que muda é o
//   CONTEÚDO (texto e foto). O que NÃO muda: fonte, peso, caixa, kerning,
//   escala, cor, posição da âncora, tratamento de foto e a presença OU
//   AUSÊNCIA de cada elemento de moldura (logo, contador, rodapé, régua).
//   Se a referência não tem logo, a peça modelada não tem logo.
//
// A fidelidade não é pedida ao agente — é imposta no código. O agente escreve
// SÓ o corpo dos slides (`_slides.html`); quem monta o carrossel.html é este
// módulo, injetando o CSS canônico da pele. O agente não tem por onde
// restilizar:
//
//   1. O <style> nunca passa pela mão do agente — vem do template, verbatim.
//   2. Classe que não existe no CSS da pele é erro, não "sai sem estilo".
//   3. style="" inline é filtrado por allowlist — só o que aponta arquivo de
//      foto sobrevive (é a única coisa que legitimamente muda por peça).
'use strict';

const fs = require('fs');
const path = require('path');

// Únicas propriedades que um style="" inline pode carregar numa peça modelada:
// tudo que existe pra apontar QUAL foto entra naquele slide. Qualquer outra
// coisa (font-size, color, letter-spacing, padding…) é restilização disfarçada
// e é removida antes de virar HTML.
const PROPS_INLINE_PERMITIDAS = new Set([
  'background-image',
  'background-position',
  'background-size',
  'background-repeat',
  'object-position',
]);

const RE_SLIDE = /<div[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi;

function ehFiel(template) {
  return !!(
    template &&
    template.tipo === 'fiel' &&
    typeof template.css === 'string' &&
    Array.isArray(template.slides)
  );
}

// Todo `.classe` que aparece no CSS. Deliberadamente generoso (pega também
// ocorrência dentro de comentário): errar pro lado de aceitar uma classe a
// mais custa nada, errar pro lado de recusar trava o trabalho do usuário.
function classesDoCss(css) {
  const fora = new Set();
  const re = /\.(-?[A-Za-z_][\w-]*)/g;
  let m;
  while ((m = re.exec(css || ''))) fora.add(m[1]);
  return fora;
}

function classesUsadas(html) {
  const fora = new Set();
  const re = /\bclass\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(html || ''))) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => fora.add(c));
  }
  return fora;
}

// Classe usada no HTML e ausente do CSS da pele. Sem esta checagem o elemento
// renderiza sem estilo nenhum e ninguém percebe até olhar o PNG.
function conferirVocabulario(slidesHtml, css) {
  const doCss = classesDoCss(css);
  const desconhecidas = [...classesUsadas(slidesHtml)].filter((c) => !doCss.has(c));
  return { ok: desconhecidas.length === 0, desconhecidas };
}

// Filtra style="" pela allowlist. Devolve o HTML limpo e o que foi removido —
// o removido vira aviso, porque é sinal de que o agente tentou restilizar.
function limparEstilosInline(slidesHtml) {
  const removidos = [];
  const html = String(slidesHtml).replace(/\bstyle\s*=\s*"([^"]*)"/gi, (inteiro, corpo) => {
    const mantidas = [];
    corpo.split(';').forEach((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return;
      const prop = decl.slice(0, i).trim().toLowerCase();
      if (!prop) return;
      if (PROPS_INLINE_PERMITIDAS.has(prop)) mantidas.push(decl.trim());
      else removidos.push(prop);
    });
    return mantidas.length ? `style="${mantidas.join('; ')}"` : '';
  });
  return { html, removidos: [...new Set(removidos)] };
}

function contarSlides(html) {
  const m = String(html).match(RE_SLIDE);
  return m ? m.length : 0;
}

// Monta o carrossel.html final: cabeça da pele (fontes + CSS canônico) +
// corpo escrito pelo agente. É aqui que a fidelidade fica garantida — o CSS
// não passa pela mão de quem escreve o conteúdo.
function montarCarrossel(template, slidesHtml, opcoes = {}) {
  const titulo = opcoes.titulo || template.titulo || 'carrossel';
  const fontes = (template.fontes || '').trim();
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${titulo}</title>
${fontes}
<style id="pele-fiel">
${template.css}
</style>
</head>
<body>
${slidesHtml}
</body>
</html>
`;
}

// Aplica as três travas e grava o carrossel.html. Lança com mensagem
// acionável (a lista de classes inventadas) pra quem chamou poder devolver
// isso ao agente e pedir correção — mesmo padrão do renderizarComCorrecao.
function escreverCarrossel(pastaAbs, template, slidesHtmlBruto, opcoes = {}) {
  const nEsperado = (template.slides || []).length;
  const nRecebido = contarSlides(slidesHtmlBruto);
  if (nEsperado && nRecebido !== nEsperado) {
    throw new Error(
      `a peça saiu com ${nRecebido} slide(s) e a referência tem ${nEsperado}. ` +
      'Modelagem é fiel: um slide pra cada slide da referência, nem mais nem menos.'
    );
  }

  const { html: semInline, removidos } = limparEstilosInline(slidesHtmlBruto);
  const voc = conferirVocabulario(semInline, template.css);
  if (!voc.ok) {
    throw new Error(
      'classe(s) que não existem no CSS da referência: ' + voc.desconhecidas.join(', ') +
      '. Numa peça modelada só entram as classes da pele — reescreva usando as que existem.'
    );
  }

  // única entrada da marca na peça — e ela é feita aqui, não pelo agente
  let comPerfil = semInline;
  let preenchidos = [];
  if (opcoes.marca) {
    const avatar = copiarAvatar(pastaAbs, opcoes.avatarAbs);
    const r = aplicarPerfil(semInline, dadosDePerfil(opcoes.marca, avatar));
    comPerfil = r.html;
    preenchidos = r.preenchidos;
  }

  const final = montarCarrossel(template, comPerfil, opcoes);
  fs.writeFileSync(path.join(pastaAbs, 'carrossel.html'), final, 'utf-8');

  const avisos = [];
  if (removidos.length) avisos.push(`style inline removido (tentativa de restilizar): ${removidos.join(', ')}`);
  return { avisos, perfilPreenchido: preenchidos };
}

// ---------------------------------------------------------------- perfil
//
// A ÚNICA porta por onde a identidade da marca entra numa peça modelada.
//
// Regra do Sidney, 31/08/2026: "a id visual da marca só entra se tiver algo
// como as infos de um perfil (foto, nome e @), como naqueles posts de
// twitter". Fora disso, a peça é a referência — não a marca. Nada de trocar
// a fonte pela do design-guide, nada de repintar com a paleta do cliente,
// nada de enfiar logo num canto que a referência deixou vazio.
//
// Por isso o preenchimento é feito AQUI, no servidor, e não pelo agente: o
// que o extrator marcou como `data-perfil="nome|handle|avatar"` é substituído
// deterministicamente pelo cadastro da marca. O agente nem precisa saber o
// nome do cliente — e assim não tem como inventar um @.

// Copia o avatar da marca pra pasta do post (o HTML referencia por nome de
// arquivo local, como qualquer outra foto). Devolve o nome do arquivo ou null.
// Quem RESOLVE qual é o avatar é o servidor (index.js#caminhoAvatarLocal, que
// já cobre arquivo local, logo da identidade e foto do perfil do Instagram
// baixada da Graph API) — aqui só se copia o que ele apontou.
function copiarAvatar(pastaAbs, avatarAbs) {
  if (!avatarAbs || !fs.existsSync(avatarAbs)) return null;
  const destino = `_avatar${path.extname(avatarAbs) || '.jpg'}`;
  try {
    fs.copyFileSync(avatarAbs, path.join(pastaAbs, destino));
    return destino;
  } catch {
    return null;
  }
}

function dadosDePerfil(marca, arquivoAvatar) {
  const handle = ((marca && marca.instagram && marca.instagram.handle) || '').trim();
  return {
    nome: (marca && marca.nome) || '',
    handle: handle && !handle.startsWith('@') ? `@${handle}` : handle,
    avatar: arquivoAvatar || '',
  };
}

function escaparHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Preenche os nós data-perfil. Sem nó nenhum marcado, não faz nada — e é esse
// o caso comum: referência sem bloco de perfil sai sem marca nenhuma, de
// propósito.
function aplicarPerfil(html, dados) {
  let saida = String(html);
  const preenchidos = [];

  // avatar em <img data-perfil="avatar" src="...">
  saida = saida.replace(
    /(<img\b[^>]*\bdata-perfil\s*=\s*["']avatar["'][^>]*>)/gi,
    (tag) => {
      if (!dados.avatar) return tag;
      preenchidos.push('avatar');
      return tag.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${dados.avatar}"`);
    }
  );

  // avatar como background-image de qualquer elemento marcado
  saida = saida.replace(
    /(<[a-z0-9]+\b[^>]*\bdata-perfil\s*=\s*["']avatar["'][^>]*>)/gi,
    (tag) => {
      if (!dados.avatar || /^<img/i.test(tag)) return tag;
      if (!/background-image/i.test(tag)) return tag;
      preenchidos.push('avatar');
      return tag.replace(/url\(\s*['"]?[^'")]*['"]?\s*\)/i, `url('${dados.avatar}')`);
    }
  );

  // texto de nome e @
  saida = saida.replace(
    /(<([a-z0-9]+)\b[^>]*\bdata-perfil\s*=\s*["'](nome|handle)["'][^>]*>)([\s\S]*?)(<\/\2\s*>)/gi,
    (inteiro, abre, tag, campo, dentro, fecha) => {
      const valor = dados[campo];
      if (!valor) return inteiro;
      preenchidos.push(campo);
      return `${abre}${escaparHtml(valor)}${fecha}`;
    }
  );

  return { html: saida, preenchidos: [...new Set(preenchidos)] };
}

function temPerfil(template) {
  return (template.slides || []).some((s) => /\bdata-perfil\s*=/.test(s.html || ''));
}

// Bloco de prompt que apresenta a pele pro agente. Mostra o CSS INTEIRO (ele
// precisa saber quais classes existem e quanto texto cabe) e o esqueleto de
// cada slide com o texto da referência como gabarito de volume.
function paraPrompt(template) {
  const p = [];
  p.push('## A pele da referência (CSS canônico — LEITURA, você não escreve isto)');
  p.push('');
  p.push('Este CSS já vai no arquivo final, injetado pelo servidor. Você NÃO copia, NÃO reescreve');
  p.push('e NÃO acrescenta CSS nenhum. Ele está aqui só pra você saber quais classes existem e');
  p.push('quanto texto cabe em cada uma.');
  p.push('');
  p.push('```css');
  p.push(template.css);
  p.push('```');
  p.push('');
  if (template.ficha_visual) {
    p.push('## Ficha visual medida na referência');
    p.push('');
    p.push('```json');
    p.push(JSON.stringify(template.ficha_visual, null, 2));
    p.push('```');
    p.push('');
  }
  p.push(`## Os ${template.slides.length} slides da referência (gabarito)`);
  p.push('');
  p.push('Cada bloco abaixo é a estrutura EXATA de um slide, com o texto da referência dentro.');
  p.push('Esse texto é gabarito de VOLUME (quantos caracteres cabem ali sem estourar o quadro) —');
  p.push('ele é substituído pelo conteúdo novo, nunca reaproveitado.');
  p.push('');
  template.slides.forEach((s, i) => {
    p.push(`### slide ${i + 1}${s.papel ? ` — ${s.papel}` : ''}`);
    if (s.notas) p.push(`_${s.notas}_`);
    p.push('');
    p.push('```html');
    p.push(s.html);
    p.push('```');
    p.push('');
  });
  return p.join('\n');
}

// As regras que não podem faltar em nenhum prompt que gera peça modelada.
// Ficam aqui (e não copiadas em cada função do agente.js) porque são a
// definição do que "modelar" significa neste estúdio.
function regrasDeFidelidade(template) {
  const n = (template.slides || []).length;
  const comPerfil = temPerfil(template);
  return `## Modelagem fiel — o que pode e o que não pode mudar

MUDA (é só pra isso que você existe nesta chamada):
- o TEXTO de cada slide, reescrito pro tema novo
- o ARQUIVO de foto de cada slide (entre os que existem na pasta)

A MARCA NÃO ENTRA nesta peça. Esta é a regra, não uma preferência: a peça é a referência,
não o cliente. Não use a fonte da marca, não use a paleta da marca, não ponha o logo da
marca, não escreva o nome nem o @ do cliente em lugar nenhum.
${comPerfil
    ? `A única exceção é o bloco de perfil que o template já tem: os elementos com
\`data-perfil="avatar"\`, \`data-perfil="nome"\` e \`data-perfil="handle"\`. NÃO preencha esses
nós — deixe exatamente como estão no gabarito. O servidor substitui o conteúdo deles pelo
cadastro da marca depois que você terminar.`
    : `Este template NÃO tem bloco de perfil — então esta peça sai sem nome, sem @, sem avatar
e sem logo. Não crie um "porque falta assinatura".`}

NÃO MUDA, em hipótese nenhuma:
- fonte, peso, caixa (maiúscula/minúscula), kerning, entrelinha, tamanho
- cor de texto, cor de fundo, overlay, filtro, textura
- posição e alinhamento do bloco de texto no quadro
- a ESTRUTURA de cada slide: mesmas tags, mesmas classes, mesma ordem, mesmo aninhamento
- a quantidade de slides: exatamente ${n}
- a presença OU AUSÊNCIA de moldura. Se a referência não tem logo, a peça não tem logo.
  Não tem contador de slide, não tem @ no rodapé, não tem régua, não tem tag de categoria,
  não tem "Arraste →". Nada entra "porque carrossel costuma ter".

Você escreve APENAS o corpo: os ${n} <div class="slide"> na ordem, um colado no outro.
Sem <html>, sem <head>, sem <style>, sem <link>, sem comentário, sem explicação.
Só as classes que aparecem no CSS acima — classe inventada é recusada pelo servidor e a
geração falha. style="" inline só é aceito pra apontar arquivo de foto
(background-image / background-position / background-size); qualquer outra propriedade
é removida antes de virar HTML.

Volume de texto: cada campo aceita a MESMA ordem de grandeza de caracteres do gabarito
(±15%). Texto mais longo que isso estoura o quadro no render — corte o texto, nunca
diminua a fonte.`;
}

module.exports = {
  ehFiel,
  classesDoCss,
  classesUsadas,
  conferirVocabulario,
  limparEstilosInline,
  contarSlides,
  montarCarrossel,
  escreverCarrossel,
  paraPrompt,
  regrasDeFidelidade,
  copiarAvatar,
  dadosDePerfil,
  aplicarPerfil,
  temPerfil,
  PROPS_INLINE_PERMITIDAS,
};
