# -*- coding: utf-8 -*-
u"""Motor do carrossel no estilo editorial da Scault.

Copiar pra pasta do post junto com render.js e o logo:

    cp .claude/skills/carrossel/estilo-editorial/{build.py,render.js} "marketing/conteudo/<pasta>/"
    cp "identidade/LOGO SCAULT.svg" "marketing/conteudo/<pasta>/_logo.svg"
    cd "marketing/conteudo/<pasta>"
    python build.py && NODE_PATH="C:/Users/sidne/node_modules" node render.js

O post fica em `post.json`, na mesma pasta — formato documentado em POST.md.
Tudo ate "DAQUI PRA BAIXO E O INTERPRETADOR" e motor (CSS + primitivas):
mexer so pra mudar o sistema, nao um post especifico. Dai pra baixo e o
interpretador que le o post.json e chama essas primitivas — muda bem menos
que o motor, mas tambem nao e conteudo de post nenhum.

Vocabulario de layout, regra da capa e tratamento de foto: ver LAYOUTS.md.
Tokens da marca: identidade/scault-design-system.md.
Formato do post.json e lista completa de primitivas: ver POST.md, nesta pasta.

GRADE
  margem lateral  88px  ->  coluna util de 904px
  ancora de topo  200px
  ancora de base  200px
  espacamento entre blocos so pela escala .g1 (24) / .g2 (44) / .g3 (72)
"""
import inspect
import io
import json
import os
import re
import sys

# `--contrato` so imprime a assinatura das primitivas (ver contrato(), la
# embaixo) — nao renderiza nada, entao nao exige a pasta montada. Sem esta
# excecao, quem quisesse ler o contrato tinha que ter um _logo.svg do lado.
if not os.path.exists('_logo.svg') and u'--contrato' not in sys.argv[1:]:
    raise SystemExit(u'Falta _logo.svg na pasta. Copiar de "identidade/LOGO SCAULT.svg".')


def _normaliza_logo(svg):
    u"""O arquivo de marca vem de identidade/ com width/height fixos e sem class.
    Sem isso o logo sai em tamanho natural (559px) no lugar dos 132px do header."""
    tag = re.match(r'<svg\b[^>]*>', svg)
    if not tag:
        raise SystemExit(u'_logo.svg nao comeca com <svg>.')
    novo = re.sub(r'\s(?:width|height)="[^"]*"', u'', tag.group(0))
    if 'class=' in novo:
        novo = re.sub(r'class="[^"]*"', u'class="logo"', novo, count=1)
    else:
        novo = novo.replace(u'<svg', u'<svg class="logo"', 1)
    return novo + svg[tag.end():]


LOGO = (_normaliza_logo(io.open('_logo.svg', encoding='utf-8').read())
        if os.path.exists('_logo.svg') else u'')  # vazio so no modo --contrato

CSS = u"""
:root{
  --base:#050506; --panel:#0B0B0E; --accent:#8DCCFF;
  --text:#EEF2F7; --muted:#A2ACBD; --dim:#7F899B;
  --hair:rgba(255,255,255,.085);
  --slide-w:1080px; --slide-h:1350px;
  --pad:88px; --top:200px; --bot:200px; --col:904px;
  --metal:linear-gradient(130deg,#C3D0D8 0%,#93A9B4 24%,#D5E1E8 47%,#8FA6B2 68%,#AEC0C9 100%);
  --metal-line:linear-gradient(118deg,rgba(206,220,229,.75),rgba(140,162,174,.3) 26%,rgba(226,238,245,.95) 50%,rgba(136,158,170,.28) 74%,rgba(190,206,216,.7));
  --lg-fill:linear-gradient(168deg,rgba(160,178,200,.10),rgba(12,12,15,.6) 55%,rgba(7,7,9,.66));
  --lg-edge:linear-gradient(168deg,rgba(255,255,255,.26),rgba(255,255,255,.05) 30%,rgba(255,255,255,.03) 66%,rgba(180,215,255,.15));
  --lg-blur:blur(26px) saturate(170%);
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px}
.slide{position:relative;width:var(--slide-w);height:var(--slide-h);overflow:hidden;background:var(--base);
  font-family:'Inter',sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
.slide.panel{background:var(--panel)}

/* FOTO: sujeito, nao textura. Sem veu — o tratamento faz a legibilidade. */
.img{position:absolute;inset:0;overflow:hidden;background:#08080A}
.img i{position:absolute;inset:0;background-size:cover;background-position:center;font-style:normal;
  filter:grayscale(.55) contrast(1.16) brightness(.74) saturate(1.1)}
.img u{position:absolute;inset:0;mix-blend-mode:color;opacity:.55;text-decoration:none;
  background:linear-gradient(150deg,#5FB0D8 0%,#276A8E 55%,#0E2836 100%)}
.img.full i{filter:grayscale(1) contrast(1.2) brightness(.72)}
.img.full u{opacity:.9}
/* RETRATO: headshot de estudio, com fundo claro chapado. Os dois tratamentos acima
   assumem foto de ambiente ja escura — num fundo de estudio eles devolvem um cinza
   azulado morto. Aqui o brightness esmaga mais e a mascara radial dissolve a borda no
   --base, que e o "integrado ao fundo escuro sem moldura" do design system. */
.img.retrato i{filter:grayscale(1) contrast(1.34) brightness(.46) saturate(1.1)}
.img.retrato u{opacity:.92}
.img.retrato{-webkit-mask-image:radial-gradient(ellipse 74% 70% at 52% 40%,#000 0%,rgba(0,0,0,.72) 52%,transparent 88%);
  mask-image:radial-gradient(ellipse 74% 70% at 52% 40%,#000 0%,rgba(0,0,0,.72) 52%,transparent 88%)}
/* CRU: foto como ela e, sem filtro e sem tinta. Pra bastidor e foto propria, onde o
   duotone mataria a prova (tela do notebook, cor real da cena). A legibilidade passa a
   depender so do text-shadow do .on-img — conferir no PNG, nao no HTML. */
.img.cru i{filter:none}
.img.cru u{display:none}
/* ROSTO: mancha de blur sobre o rosto de gente em foto de banco. Modelo de banco assinou
   liberacao de imagem, mas peca de marca fica melhor sem rosto identificavel competindo
   com o texto — e evita que a pessoa vire "a cara da Scault" sem ter combinado isso.
   Nao usar em foto propria: ali o rosto e o ponto. */
/* A mascara radial e o que separa desfoque de tarja: sem ela a borda do backdrop-filter
   fica dura e o rosto vira uma bolha colada por cima da foto. */
.img .rosto{position:absolute;z-index:3;
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  -webkit-mask-image:radial-gradient(ellipse at 50% 50%,#000 38%,rgba(0,0,0,.6) 62%,transparent 82%);
  mask-image:radial-gradient(ellipse at 50% 50%,#000 38%,rgba(0,0,0,.6) 62%,transparent 82%)}

.grain{position:absolute;inset:0;pointer-events:none;z-index:6;opacity:.30;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:300px 300px}

.mesh{position:absolute;inset:0;opacity:.5;
  background-image:radial-gradient(circle,rgba(163,197,206,.6) 1.6px,transparent 1.7px);background-size:27px 27px;
  -webkit-mask-image:radial-gradient(ellipse 62% 46% at 76% 30%,#000 0%,rgba(0,0,0,.35) 48%,transparent 76%);
  mask-image:radial-gradient(ellipse 62% 46% at 76% 30%,#000 0%,rgba(0,0,0,.35) 48%,transparent 76%)}
.mesh.lo{-webkit-mask-image:radial-gradient(ellipse 58% 42% at 22% 72%,#000 0%,rgba(0,0,0,.35) 46%,transparent 74%);
  mask-image:radial-gradient(ellipse 58% 42% at 22% 72%,#000 0%,rgba(0,0,0,.35) 46%,transparent 74%)}
/* horizonte curvo: elemento de abertura da v2 da marca, reservado ao fecho */
.mesh.wave{opacity:.62;
  -webkit-mask-image:radial-gradient(ellipse 104% 30% at 50% 82%,#000 0%,rgba(0,0,0,.42) 44%,transparent 74%);
  mask-image:radial-gradient(ellipse 104% 30% at 50% 82%,#000 0%,rgba(0,0,0,.42) 44%,transparent 74%)}
.glow{position:absolute;inset:0;pointer-events:none}
.glow.tl{background:radial-gradient(760px 560px at 12% 6%,rgba(141,204,255,.12),transparent 68%)}
.glow.c{background:radial-gradient(900px 720px at 50% 46%,rgba(141,204,255,.16),transparent 68%)}
.glow.b{background:radial-gradient(1000px 560px at 50% 88%,rgba(141,204,255,.16),transparent 70%)}

/* header e rodape na mesma margem lateral do texto */
.head{position:absolute;top:74px;left:var(--pad);right:var(--pad);height:38px;
  display:flex;align-items:center;z-index:7}
.logo{width:132px;height:auto;display:block}
.foot{position:absolute;left:var(--pad);right:var(--pad);bottom:74px;padding-top:22px;
  border-top:1px solid rgba(255,255,255,.14);display:flex;justify-content:space-between;
  font-size:17px;line-height:24px;font-weight:500;color:rgba(238,242,247,.6);z-index:7}

/* ---------- GRADE DE TEXTO ---------- */
.txt{position:absolute;left:var(--pad);right:var(--pad);z-index:5;
  display:flex;flex-direction:column;align-items:flex-start}
.t-top{top:var(--top)}
.t-bot{bottom:var(--bot)}
.t-split{top:var(--top);bottom:var(--bot);justify-content:space-between}
.t-tri{top:var(--top);bottom:var(--bot);justify-content:space-between}
.grp{display:flex;flex-direction:column;align-items:flex-start;width:100%}
.g1{margin-top:24px}
.g2{margin-top:44px}
.g3{margin-top:72px}

h1{font-family:'Inter Tight',sans-serif;font-weight:800;font-size:72px;line-height:1.02;
  letter-spacing:-.034em;text-transform:uppercase;max-width:780px}
h1.s{font-size:60px;max-width:760px}
h2{font-family:'Inter Tight',sans-serif;font-weight:600;font-size:52px;line-height:1.1;
  letter-spacing:-.028em;max-width:720px}
.lead{font-family:'Inter Tight',sans-serif;font-weight:500;font-size:38px;line-height:1.28;
  letter-spacing:-.024em;max-width:680px;color:rgba(238,242,247,.94)}
p{font-size:26px;font-weight:400;line-height:1.5;letter-spacing:-.01em;
  color:rgba(238,242,247,.82);max-width:620px}
p b{font-weight:600;color:var(--text)}
p.kicker{font-size:24px;color:var(--dim);max-width:520px}
.acc{color:var(--accent)}
.on-img h1,.on-img h2,.on-img .lead,.on-img p{text-shadow:0 2px 34px rgba(0,0,0,.62)}
/* texto sobre foto CRUA: sem o duotone escurecendo a cena, a sombra de .on-img nao
   segura. Aqui a sombra e dupla (halo curto + halo largo) e o corpo vai a branco cheio.
   E efeito no texto, nao na foto — a foto continua intacta. */
.on-cru h1,.on-cru h2,.on-cru .lead,.on-cru p{
  text-shadow:0 2px 9px rgba(0,0,0,.92),0 2px 46px rgba(0,0,0,.72)}
.on-cru p{color:var(--text)}
.on-cru .foot{color:rgba(238,242,247,.92);border-top-color:rgba(255,255,255,.3);
  text-shadow:0 2px 9px rgba(0,0,0,.92)}
.peak{font-family:'Inter Tight',sans-serif;font-weight:800;font-size:112px;line-height:.98;
  letter-spacing:-.042em;text-transform:uppercase;max-width:860px}

/* ---------- EIXO CENTRADO (slides de respiro) ---------- */
.mid{align-items:center;text-align:center}
.mid .grp{align-items:center}
.mid h1,.mid h2,.mid .lead,.mid p,.mid .peak{margin-left:auto;margin-right:auto}
.mid h1{max-width:900px}
.mid h2{max-width:840px}
.mid .lead{max-width:740px}
.mid p{max-width:720px}
.mid p.kicker{max-width:620px;letter-spacing:.16em;text-transform:uppercase;font-size:20px;
  font-weight:600}
.mid .peak{max-width:940px}
.rule{width:64px;height:1px;background:rgba(255,255,255,.22)}

/* ---------- COLUNA DIVIDIDA: texto de um lado, foto sangrando do outro ---------- */
.vs{position:absolute;inset:0;display:flex;z-index:4}
.vs .tc{position:relative;flex:0 0 632px;background:var(--base);
  padding:var(--top) 52px var(--bot) var(--pad);
  display:flex;flex-direction:column;justify-content:space-between}
.vs .pc{position:relative;flex:1;overflow:hidden;border-left:1px solid var(--hair)}
.vs.rev{flex-direction:row-reverse}
.vs.rev .tc{padding:var(--top) var(--pad) var(--bot) 52px}
.vs.rev .pc{border-left:0;border-right:1px solid var(--hair)}
.tc h1.s{font-size:54px;max-width:none}
.tc h1.xl{font-size:48px;line-height:1.06;max-width:none}
.tc h2{max-width:none}
.tc p,.tc .lead{max-width:none}
.tc .lead{font-size:32px}
.tc p{font-size:24px}
.vshead{position:absolute;top:74px;left:var(--pad);height:38px;display:flex;align-items:center}
.vs.rev .vshead{left:52px}
.vsfoot{position:absolute;left:var(--pad);right:52px;bottom:74px;padding-top:22px;
  border-top:1px solid rgba(255,255,255,.14);display:flex;justify-content:space-between;
  font-size:17px;line-height:24px;font-weight:500;color:rgba(238,242,247,.6)}
.vs.rev .vsfoot{left:52px;right:var(--pad)}
/* capa em coluna dividida: coluna mais larga, pra headline aguentar 48px */
.vs.capa .tc{flex:0 0 660px}

/* ---------- CAPA EM FULL-BLEED COM ZOOM ---------- */
/* O zoom ancorado na borda joga o sujeito pra metade direita e abre a faixa escura
   onde o texto flutua. A medida travada e o que impede a linha de encostar nele. */
.capa h1{font-size:64px;line-height:1.06;max-width:512px}
.capa p{max-width:460px}
.capa .foot{right:auto;width:460px}

/* marca de canto: motivo do sistema, no que e "encaixado" */
.tick{position:relative}
.tick::before,.tick::after{content:"";position:absolute;width:9px;height:9px;
  border:0 solid var(--accent);opacity:.55;pointer-events:none}
.tick::before{top:-1px;left:-1px;border-top-width:1px;border-left-width:1px;border-top-left-radius:8px}
.tick::after{bottom:-1px;right:-1px;border-bottom-width:1px;border-right-width:1px;border-bottom-right-radius:8px}

/* faixa de foto encaixada — o miolo do sanduiche */
.band{position:relative;width:100%;height:426px;overflow:hidden;border-radius:8px;
  border:1px solid var(--hair)}

.btn{display:inline-flex;align-items:center;gap:14px;padding:22px 36px;border-radius:3px;
  border:1px solid transparent;
  background:linear-gradient(rgba(16,17,21,.92),rgba(11,12,15,.92)) padding-box,var(--metal-line) border-box;
  color:var(--text);font-family:'Inter Tight',sans-serif;font-weight:700;font-size:21px;
  letter-spacing:.06em;text-transform:uppercase}
.btn s{width:6px;height:6px;background:var(--accent);text-decoration:none;box-shadow:0 0 9px rgba(141,204,255,.9)}

/* ---------- COMPONENTES ILUSTRADOS ---------- */
.serp{border:1px solid var(--hair);border-radius:8px;background:var(--panel);padding:22px 24px;width:100%}
.serp .q{display:flex;align-items:center;gap:12px;padding:14px 18px;border:1px solid var(--hair);
  border-radius:24px;font-size:21px;color:var(--muted);margin-bottom:20px}
.serp .q s{width:15px;height:15px;border:1.6px solid var(--dim);border-radius:50%;text-decoration:none;display:block}
.serp .r{padding:15px 0;border-bottom:1px solid var(--hair)}
.serp .u{font-size:15px;letter-spacing:.06em;color:var(--dim);margin-bottom:7px}
.serp .t{font-family:'Inter Tight',sans-serif;font-size:27px;font-weight:600;letter-spacing:-.02em;color:#9CC6E8}
.serp .miss{margin-top:18px;padding:20px 22px;border:1px dashed rgba(141,204,255,.45);border-radius:8px;
  font-family:'Inter Tight',sans-serif;font-size:25px;font-weight:600;letter-spacing:-.02em;color:var(--accent)}
.mid .serp,.mid .serp .q,.mid .serp .miss{text-align:left}

.chat{display:flex;flex-direction:column;gap:14px;width:100%}
.msg{max-width:74%;padding:20px 24px;border-radius:8px;font-size:24px;line-height:1.42;color:var(--text);
  text-align:left}
.msg .t{display:block;margin-top:10px;font-size:15px;font-weight:500;letter-spacing:.14em;color:var(--dim)}
.msg.in{align-self:flex-start;background:var(--panel);border:1px solid var(--hair);border-bottom-left-radius:3px}
.msg.out{align-self:flex-end;border-bottom-right-radius:3px;border:1px solid transparent;
  background:linear-gradient(rgba(20,22,28,.96),rgba(14,15,19,.96)) padding-box,var(--metal-line) border-box}
.gapline{display:flex;align-items:center;gap:20px;margin:6px 0;width:100%}
.gapline i{flex:1;height:1px;font-style:normal;
  background:repeating-linear-gradient(90deg,rgba(141,204,255,.45) 0 9px,transparent 9px 18px)}
.gapline b{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:21px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--accent);white-space:nowrap}

/* ---------- MENSAGENS: cards flutuantes de WhatsApp ----------
   Mesma linguagem dos cards que aparecem na foto composta da capa do post do Kyreon —
   avatar de canal, nome + hora, corpo, tique duplo. Serve pra mostrar uma TROCA (chegou,
   respondeu, na hora). Diferente do .chat, que e a conversa nua e serve pra mostrar
   silencio. Nao confundir os dois na mesma peca. */
.msgs{display:flex;flex-direction:column;gap:13px;width:100%;text-align:left}
.msgs .m{display:flex;gap:14px;align-items:flex-start;width:86%;
  padding:17px 19px;border-radius:11px;border:1px solid var(--hair);
  background:rgba(11,11,14,.94)}
.msgs .m.ia{align-self:flex-end;border-color:rgba(141,204,255,.42);
  background:linear-gradient(140deg,rgba(141,204,255,.13),rgba(11,11,14,.95) 62%)}
.msgs .m s{width:31px;height:31px;border-radius:50%;flex-shrink:0;display:block;
  text-decoration:none;background:#1E8E4F;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.msgs .m.ia s{background:var(--metal);box-shadow:none}
.msgs .tx{flex:1;min-width:0}
.msgs .who{font-size:14px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;
  color:var(--dim);margin-bottom:7px}
.msgs .m.ia .who{color:var(--accent)}
.msgs .bd{font-size:22px;line-height:1.4;color:var(--text)}
.msgs .ck{flex-shrink:0;align-self:flex-end;font-size:17px;line-height:1;
  color:rgba(141,204,255,.75);letter-spacing:-.28em}
.mid .msgs{align-items:stretch}

.icon{width:64px;height:64px;stroke:var(--accent);stroke-width:1.4;fill:none;
  stroke-linecap:round;stroke-linejoin:round;display:block}

.ui{display:flex;height:372px;width:100%;border:1px solid var(--hair);border-radius:8px;
  overflow:hidden;background:#09090C;box-shadow:0 26px 64px -30px #000;text-align:left}
.ui s{text-decoration:none}
.ui .sb{width:162px;flex-shrink:0;background:#070708;border-right:1px solid var(--hair);padding:13px 10px}
.ui .brand{display:flex;align-items:center;gap:7px;font-family:'Inter Tight',sans-serif;font-weight:700;
  font-size:11px;letter-spacing:.18em;color:var(--text);margin-bottom:11px}
.ui .brand s{width:16px;height:16px;border-radius:5px;background:var(--metal);display:block}
.ui .org{display:flex;align-items:center;gap:6px;padding:7px 8px;border:1px solid var(--hair);
  border-radius:6px;font-size:10px;font-weight:600;color:var(--muted);margin-bottom:4px}
.ui .org s{width:12px;height:12px;border-radius:4px;background:rgba(163,197,206,.25);display:block}
.ui .sec{font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin:12px 0 6px 5px}
.ui .it{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:5px;font-size:10.5px;
  color:var(--muted);margin-bottom:2px}
.ui .it.on{background:rgba(141,204,255,.13);color:var(--text);font-weight:600}
.ui .it s{width:10px;height:10px;border:1px solid currentColor;border-radius:3px;opacity:.55;display:block}
.ui .it b{margin-left:auto;font-size:9px;font-weight:700;color:var(--accent)}
.ui .list{width:192px;flex-shrink:0;border-right:1px solid var(--hair);padding:11px 8px}
.ui .fld{height:23px;border:1px solid var(--hair);border-radius:6px;margin-bottom:6px}
.ui .row{display:flex;gap:8px;padding:8px 7px;border-radius:6px;margin-bottom:1px;border:1px solid transparent}
.ui .row.on{background:rgba(141,204,255,.10);border-color:rgba(141,204,255,.28)}
.ui .av{width:24px;height:24px;border-radius:50%;flex-shrink:0;border:1px solid var(--hair);
  background:linear-gradient(140deg,#2A333E,#14181E);display:block}
.ui .row .n{font-size:10.5px;font-weight:600;color:var(--text)}
.ui .row .p{font-size:9.5px;color:var(--dim);margin-top:2px}
.ui .conv{flex:1;display:flex;flex-direction:column;min-width:0}
.ui .top{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid var(--hair)}
.ui .top .n{font-size:11.5px;font-weight:700;color:var(--text)}
.ui .top .p{font-size:9.5px;color:var(--dim);margin-top:2px}
.ui .chip{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 8px;
  border-radius:5px;border:1px solid rgba(141,204,255,.45);color:var(--accent)}
.ui .chip.n{border-color:var(--hair);color:var(--muted)}
.ui .stream{flex:1;padding:12px;display:flex;flex-direction:column;gap:7px}
.ui .day{align-self:center;font-size:9px;padding:4px 10px;border-radius:20px;
  background:rgba(255,255,255,.05);color:var(--dim)}
.ui .bb{max-width:68%;padding:8px 11px;border-radius:8px;font-size:10.5px;line-height:1.36}
.ui .bb.i{align-self:flex-start;background:#13171E;border:1px solid var(--hair);color:var(--text)}
.ui .bb.o{align-self:flex-end;background:#2C63B0;color:#F2F7FF}

/* ---------- FICHA: pares rotulo/valor em linhas ---------- */
.card{width:100%;border:1px solid var(--hair);border-radius:8px;background:var(--panel);padding:12px 32px;
  text-align:left}
.card .row{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:19px 0;
  border-bottom:1px solid var(--hair)}
.card .row:last-child{border-bottom:0}
.card .k{font-size:16px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.card .v{font-family:'Inter Tight',sans-serif;font-size:27px;font-weight:600;letter-spacing:-.02em;
  color:var(--text);text-align:right}
.card .v.hi{color:var(--accent)}

/* ---------- COMPARATIVO: duas colunas, uma destacada ---------- */
.compare{display:flex;gap:16px;width:100%;text-align:left}
.compare .col{flex:1;border:1px solid var(--hair);border-radius:8px;background:var(--panel);overflow:hidden}
.compare .col.hi{border-color:rgba(141,204,255,.38);
  background:linear-gradient(180deg,rgba(141,204,255,.07),var(--panel) 60%)}
.compare .ch{padding:19px 22px;border-bottom:1px solid var(--hair);
  font-family:'Inter Tight',sans-serif;font-weight:700;font-size:25px;letter-spacing:-.02em}
.compare .col.hi .ch{color:var(--accent)}
.compare .cr{padding:16px 22px;border-bottom:1px solid var(--hair)}
.compare .cr:last-child{border-bottom:0}
.compare .cr b{display:block;font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
  color:var(--dim);margin-bottom:7px}
.compare .cr span{font-family:'Inter Tight',sans-serif;font-weight:600;font-size:24px;
  color:var(--text);letter-spacing:-.02em}

/* ---------- PERFIL DO GOOGLE: itens certos e errados ---------- */
.gmb{width:100%;border:1px solid var(--hair);border-radius:8px;background:var(--panel);overflow:hidden;
  text-align:left}
.gmb .gh{padding:20px 24px;border-bottom:1px solid var(--hair);display:flex;align-items:center;gap:14px}
.gmb .gh s{width:34px;height:34px;border-radius:8px;background:linear-gradient(140deg,#2A333E,#14181E);
  border:1px solid var(--hair);display:block;text-decoration:none}
.gmb .gh .nm{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:25px;letter-spacing:-.02em}
.gmb .gh .st{margin-left:auto;font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  color:var(--dim)}
.gmb .gr{display:flex;align-items:center;gap:16px;padding:17px 24px;border-bottom:1px solid var(--hair);
  font-size:23px}
.gmb .gr:last-child{border-bottom:0}
.gmb .gr s{width:19px;height:19px;border-radius:50%;border:1.6px solid;display:block;flex-shrink:0;
  text-decoration:none}
.gmb .gr.bad{color:var(--text)}
.gmb .gr.bad s{border-color:var(--accent)}
.gmb .gr.ok{color:var(--dim)}
.gmb .gr.ok s{border-color:rgba(255,255,255,.16)}
.gmb .gr b{margin-left:auto;font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.gmb .gr.bad b{color:var(--accent)}
.gmb .gr.ok b{color:var(--dim)}

/* ---------- SERIE NUMERADA: um item por slide, numeral em metal ---------- */
.serie{display:flex;gap:28px;align-items:flex-start;width:100%;text-align:left}
.serie .n{font-family:'Inter Tight',sans-serif;font-weight:800;font-size:96px;line-height:.86;
  letter-spacing:-.04em;min-width:132px;background:var(--metal);-webkit-background-clip:text;
  background-clip:text;-webkit-text-fill-color:transparent}
.serie .tx h3{font-family:'Inter Tight',sans-serif;font-weight:600;font-size:44px;line-height:1.1;
  letter-spacing:-.026em;color:var(--text);margin-bottom:18px;max-width:600px}
.serie .tx p{max-width:600px}
.mid .serie{justify-content:center}

/* ---------- FLUXO: etapas com seta ---------- */
.flow{display:flex;align-items:stretch;gap:16px;width:100%}
.flow .n{flex:1;padding:26px 16px;text-align:center;background:var(--panel);
  border:1px solid var(--hair);border-radius:8px;
  font-family:'Inter Tight',sans-serif;font-weight:600;font-size:23px;letter-spacing:-.02em;color:var(--text)}
.flow .n small{display:block;margin-top:9px;font-family:'Inter',sans-serif;font-weight:500;
  font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.flow .a{display:flex;align-items:center;color:var(--accent);font-size:30px;font-weight:600}

/* ---------- FUNIL EM COLUNAS ---------- */
.kanban{display:flex;gap:14px;width:100%}
.kanban .col{flex:1;border:1px solid var(--hair);border-radius:8px;background:var(--panel);padding:18px 13px}
.kanban .h{font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);
  margin-bottom:15px;text-align:center}
.kanban .c{height:40px;border-radius:5px;background:rgba(255,255,255,.045);border:1px solid var(--hair);
  margin-bottom:9px}
.kanban .c:last-child{margin-bottom:0}
.kanban .c.on{background:linear-gradient(120deg,rgba(141,204,255,.20),rgba(141,204,255,.06));
  border-color:rgba(141,204,255,.4)}

/* ---------- CONTAGEM: tensao em tempo real, cada batida mais forte ---------- */
.beats{display:flex;flex-direction:column;gap:34px;width:100%}
.beats div{font-family:'Inter Tight',sans-serif;font-weight:600;letter-spacing:-.03em;line-height:1}
.beats .b1{font-size:64px;color:var(--dim)}
.beats .b2{font-size:96px;color:var(--muted)}
.beats .b3{font-size:72px;color:var(--text);margin-top:14px}
.mid .beats{align-items:center;text-align:center}

/* ---------- VIDRO: painel de legibilidade sobre foto crua ----------
   O mesmo vidro do site. Existe pra um caso so: quando a foto tem que ficar viva (sem
   duotone, sem veu) e o texto precisa pousar em cima assim mesmo. O blur borra a cena
   atras do bloco e devolve contraste sem tocar no resto da imagem.
   So funciona sobre foto ou sobre a malha — em fundo chapado nao ha o que borrar. */
.lg{position:relative;
  background:var(--lg-fill) padding-box,var(--lg-edge) border-box;
  border:1px solid transparent;border-radius:8px;
  backdrop-filter:var(--lg-blur);-webkit-backdrop-filter:var(--lg-blur);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(180,215,255,.08),
    0 24px 60px -28px #000;
  padding:38px 44px}
.lg::before{content:"";position:absolute;top:0;left:14%;right:14%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(210,235,255,.55),transparent)}
.lg h1,.lg h2,.lg .lead,.lg p{max-width:none;text-shadow:none}
/* dentro do vidro a headline cai um degrau: o painel tem que sobrar espaco pro que a
   foto mostra em volta. Vidro encostando no assunto e pior que vidro pequeno. */
.lg h1.s{font-size:52px}
.lg p{color:rgba(238,242,247,.9);margin-top:18px;font-size:24px}
/* capa em vidro: o painel ancora no canto e nao ocupa a largura toda da coluna.
   680px e a medida que deixa a headline quebrar em 3 linhas — com menos, ela vira 5 e o
   painel cresce pra baixo ate invadir o que a foto tem pra mostrar. */
.txt.canto{right:auto;width:680px}
.txt.canto .grp{width:100%}

/* ---------- KYREON COMPLETO: inbox em cima, funil embaixo ----------
   A versao do .ui mostra so a caixa de entrada, e caixa de entrada todo chatbot tem. O
   argumento do produto e que a conversa VIRA registro — entao o inbox e o kanban precisam
   aparecer no mesmo quadro, um alimentando o outro. Dados inventados: o print real tem
   nome, telefone e funil de cliente. */
.kui{width:100%;border:1px solid var(--hair);border-radius:9px;overflow:hidden;
  background:#09090C;box-shadow:0 26px 64px -30px #000;text-align:left;display:flex}
.kui s{text-decoration:none}
.kui .nav{width:150px;flex-shrink:0;background:#070708;border-right:1px solid var(--hair);
  padding:13px 11px}
.kui .brand{display:flex;align-items:center;gap:7px;font-family:'Inter Tight',sans-serif;
  font-weight:700;font-size:11px;letter-spacing:.18em;color:var(--text);margin-bottom:13px}
.kui .brand s{width:15px;height:15px;border-radius:5px;background:var(--metal);display:block}
.kui .sec{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);
  margin:11px 0 6px 4px}
.kui .it{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:5px;
  font-size:10.5px;color:var(--muted);margin-bottom:2px}
.kui .it.on{background:rgba(141,204,255,.13);color:var(--text);font-weight:600}
.kui .it s{width:10px;height:10px;border:1px solid currentColor;border-radius:3px;
  opacity:.55;display:block}
.kui .it b{margin-left:auto;font-size:9px;font-weight:700;color:var(--accent)}
.kui .main{flex:1;display:flex;flex-direction:column;min-width:0}
/* topo: inbox */
.kui .inbox{display:flex;border-bottom:1px solid var(--hair);height:210px}
.kui .lst{width:186px;flex-shrink:0;border-right:1px solid var(--hair);padding:10px 8px}
.kui .fld{height:21px;border:1px solid var(--hair);border-radius:6px;margin-bottom:7px}
.kui .row{display:flex;gap:8px;padding:7px;border-radius:6px;margin-bottom:1px;
  border:1px solid transparent}
.kui .row.on{background:rgba(141,204,255,.10);border-color:rgba(141,204,255,.28)}
.kui .av{width:22px;height:22px;border-radius:50%;flex-shrink:0;border:1px solid var(--hair);
  background:linear-gradient(140deg,#2A333E,#14181E);display:block}
.kui .row .n{font-size:10px;font-weight:600;color:var(--text)}
.kui .row .p{font-size:9px;color:var(--dim);margin-top:2px}
.kui .conv{flex:1;display:flex;flex-direction:column;min-width:0}
.kui .top{display:flex;align-items:center;gap:8px;padding:9px 11px;
  border-bottom:1px solid var(--hair)}
.kui .top .n{font-size:11px;font-weight:700;color:var(--text)}
.kui .top .p{font-size:9px;color:var(--dim);margin-top:2px}
.kui .chip{font-size:8px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  padding:4px 7px;border-radius:5px;border:1px solid rgba(141,204,255,.45);color:var(--accent)}
.kui .chip.n{border-color:var(--hair);color:var(--muted)}
.kui .stream{flex:1;padding:10px 11px;display:flex;flex-direction:column;gap:6px}
.kui .bb{max-width:66%;padding:7px 10px;border-radius:8px;font-size:10px;line-height:1.36}
.kui .bb.i{align-self:flex-start;background:#13171E;border:1px solid var(--hair);color:var(--text)}
.kui .bb.o{align-self:flex-end;background:#2C63B0;color:#F2F7FF}
/* base: funil */
.kui .board{padding:11px;display:flex;gap:9px}
.kui .kcol{flex:1;border:1px solid var(--hair);border-radius:7px;background:#0B0B0E;
  padding:9px 8px;min-width:0}
.kui .kh{display:flex;align-items:center;gap:5px;font-size:8px;font-weight:700;
  letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
.kui .kh b{margin-left:auto;font-size:8px;color:var(--muted)}
.kui .kc{border:1px solid var(--hair);border-radius:5px;background:rgba(255,255,255,.03);
  padding:7px;margin-bottom:5px}
.kui .kc:last-child{margin-bottom:0}
.kui .kc.on{background:linear-gradient(130deg,rgba(141,204,255,.17),rgba(141,204,255,.04));
  border-color:rgba(141,204,255,.4)}
.kui .kc .nm{font-size:9px;font-weight:600;color:var(--text)}
.kui .kc .vl{font-size:8.5px;color:var(--dim);margin-top:3px}
.kui .kc.on .vl{color:var(--accent)}

.wordmark{width:704px;height:auto;display:block}
"""

# ---------------------------------------------------------------- primitivas

def foto(arquivo, pos, full=False, tam=u'', retrato=False, cru=False, rostos=()):
    u"""Foto tratada. `tam` so pra capa com zoom (ex: '156.5% auto').
    `full` = sujeito que ja nasce frio (grayscale total, tinta a 90%).
    `retrato` = headshot de estudio com fundo claro (esmaga mais e dissolve a borda).
    `cru` = sem tratamento nenhum, a foto como ela e.
    `rostos` = [(esquerda, topo, largura, altura), ...] em % do slide — mancha de blur
    sobre cada rosto. Medir no PNG renderizado, nao no arquivo original: o crop muda tudo."""
    zoom = u';background-size:%s' % tam if tam else u''
    trat = (u' cru' if cru else
            u' full' if full else
            u' retrato' if retrato else u'')
    # rostos malformado (post.json gerado por IA, linha com numero errado de
    # valores) nao pode derrubar o slide inteiro por causa de um efeito
    # cosmetico — pula so a linha ruim e avisa no stderr.
    manchas = []
    for i, r in enumerate(rostos):
        if len(r) != 4:
            sys.stderr.write(u'aviso: foto() rostos[%d] tem %d valores (esperado 4) — ignorado: %r\n'
                              % (i, len(r), r))
            continue
        manchas.append(u'<b class="rosto" style="left:%s%%;top:%s%%;width:%s%%;height:%s%%"></b>' % r)
    return (u'<div class="img%s"><i style="background-image:url(\'%s\');background-position:%s%s"></i>'
            u'<u></u>%s</div>' % (trat, arquivo, pos, zoom, u''.join(manchas)))


def band(arquivo, pos):
    u"""Foto encaixada com margem — o miolo do sanduiche."""
    return u'<div class="band tick">%s</div>' % foto(arquivo, pos)


def slide(corpo, fundo=u"", classe=u"", rodape=u"", logo=False, chrome=True):
    head = u'<div class="head">%s</div>' % (LOGO if logo else u'')
    foot = (u'<div class="foot"><span data-role="handle">%s</span>'
            u'<span data-role="rodape">%s</span></div>'
            % (_HANDLE[0], rodape))
    return (u'<div class="slide%s">%s<div class="grain"></div>%s%s%s</div>'
            % (u' ' + classe if classe else u'', fundo,
               head if chrome else u'', corpo, foot if chrome else u''))


# estado do slide atual (setado por carregar_post antes de montar o corpo) —
# grade()/coluna() leem daqui pra marcar cada .grp com data-blk="{indice}" e
# aplicar override de posicao do post.json (posBlocos), sem precisar threadar
# indice de slide/bloco por todas as chamadas de primitiva na mao. So o
# interpretador (JSON) usa isso; quem chama grade()/coluna() com S.append na
# mao (posts hand-authored) simplesmente nunca populam posBlocos, e o
# comportamento fica identico ao de antes.
_BLOCO_ATUAL = [None]
_POS_BLOCOS_ATUAL = [{}]

# @ do rodape — vem de post.json ("handle"). Default e a Scault, que era o
# valor fixo antes deste campo existir: post sem "handle" sai identico ao de
# antes. Marca de cliente que usa o motor editorial (Kyreon) troca aqui em vez
# de sair assinada pela agencia.
_HANDLE = [u'@scault.mkt']

# Contador de nos de texto semantico DENTRO do slide atual. Cada no ganha
# data-txt="{n}", na mesma ordem em que uma varredura em profundidade do
# JSON encontra os nos {"texto": ...} — e o que deixa o editor do estudio
# saber, sem adivinhar por indice de DOM, qual no do post.json corresponde ao
# elemento clicado na previa. Sem slide ativo (posts hand-authored, que
# chamam as primitivas direto) o atributo simplesmente nao sai.
_TXT_CONTADOR = [None]


def _grp(conteudo):
    u"""Envolve um grupo em .grp, marcando data-blk quando ha um slide ativo
    (via carregar_post) e aplicando position:absolute se o post.json pediu
    reposicionar esse bloco especifico (posBlocos, editado no canvas)."""
    if _BLOCO_ATUAL[0] is None:
        return u'<div class="grp">%s</div>' % conteudo
    idx = _grp.contador
    _grp.contador += 1
    pos = _POS_BLOCOS_ATUAL[0].get(str(idx))
    estilo = u' style="position:absolute;left:%spx;top:%spx"' % (pos[u'x'], pos[u'y']) if pos else u''
    return u'<div class="grp" data-blk="%d"%s>%s</div>' % (idx, estilo, conteudo)


def _resetar_contador_blocos():
    _grp.contador = 0


_grp.contador = 0


def grade(grupos, modo=u't-split', mid=False, extra=u''):
    u"""Ancora N blocos na coluna util. 2 grupos = topo/base, 3 = topo/meio/base.
    `extra` acrescenta classe na grade — hoje so `canto`, que estreita a coluna pra 600px
    e solta o lado direito (usado pela capa em vidro)."""
    corpo = u''.join(_grp(g) for g in grupos)
    return u'<div class="txt %s%s%s">%s</div>' % (
        modo, u' mid' if mid else u'', u' ' + extra if extra else u'', corpo)


def vidro(conteudo):
    u"""Painel de vidro sobre foto crua. Borra a cena atras do bloco e devolve contraste
    sem tocar no resto da imagem. Um por peca — vidro em tudo vira template."""
    return u'<div class="lg">%s</div>' % conteudo


def coluna(grupos, foto_html, rev=False, classe=u'', logo=False, rodape=u''):
    u"""Coluna dividida. Header e rodape ficam DENTRO da coluna de texto — a foto
    nunca recebe texto por cima, que e o ponto deste layout."""
    corpo = u''.join(_grp(g) for g in grupos)
    topo = u'<div class="vshead">%s</div>' % LOGO if logo else u''
    return (u'<div class="vs%s%s"><div class="tc">%s%s'
            u'<div class="vsfoot"><span>@scault.mkt</span><span>%s</span></div></div>'
            u'<div class="pc">%s</div></div>'
            % (u' rev' if rev else u'', u' ' + classe if classe else u'',
               topo, corpo, rodape, foto_html))


def rotulo(texto):
    u"""Rotulo de secao + filete. Ancora o topo dos slides de serie."""
    return u'<p class="kicker">%s</p><div class="rule g1"></div>' % texto


# ---------------------------------------------------------------- componentes

def serp(consulta=u'', resultados=(), ausente=u''):
    u"""Resultado de busca. `resultados` = [(dominio, titulo), ...].
    `ausente` e o bloco tracejado que mostra a perda em vez de descrever."""
    linhas = u''.join(u'<div class="r"><div class="u">%s</div><div class="t">%s</div></div>' % r
                      for r in resultados)
    return (u'<div class="serp tick"><div class="q"><s></s>%s</div>%s'
            u'<div class="miss">%s</div></div>' % (consulta, linhas, ausente))


def chat(mensagens=(), divisor=None, apos=1):
    u"""Conversa. `mensagens` = [('in'|'out', texto, hora), ...].
    `divisor` entra depois da mensagem de indice `apos` (ex: '14 horas depois')."""
    saida = []
    for i, (lado, texto, hora) in enumerate(mensagens, start=1):
        saida.append(u'<div class="msg %s">%s<span class="t">%s</span></div>' % (lado, texto, hora))
        if divisor and i == apos:
            saida.append(u'<div class="gapline"><i></i><b>%s</b><i></i></div>' % divisor)
    return u'<div class="chat">%s</div>' % u''.join(saida)


def mensagens(cards=()):
    u"""Troca de mensagens em cards flutuantes. `cards` = [(quem, texto, ia_bool), ...].
    Mostra que a resposta veio — o oposto do `chat` com divisor de silencio."""
    saida = []
    for quem, texto, ia in cards:
        saida.append(
            u'<div class="m%s"><s></s><div class="tx"><div class="who">%s</div>'
            u'<div class="bd">%s</div></div><div class="ck">&#10003;&#10003;</div></div>'
            % (u' ia' if ia else u'', quem, texto))
    return u'<div class="msgs">%s</div>' % u''.join(saida)


def ui_kyreon_completo():
    u"""Interface do Kyreon com as duas metades no mesmo quadro: inbox em cima, funil
    embaixo. E a versao pro slide do produto — o argumento e que a conversa vira registro,
    entao mostrar so o inbox entrega metade da tese. Dados inventados."""
    return u"""<div class="kui tick">
  <div class="nav"><div class="brand"><s></s>KYREON</div>
    <div class="sec">Opera&ccedil;&atilde;o</div>
    <div class="it on"><s></s>Inbox<b>7</b></div>
    <div class="it"><s></s>N&atilde;o lidas</div>
    <div class="it"><s></s>Clientes</div>
    <div class="sec">Pipelines</div>
    <div class="it on"><s></s>Comercial<b>12</b></div>
    <div class="sec">IA</div>
    <div class="it"><s></s>Agentes</div>
    <div class="it"><s></s>Indicadores</div></div>
  <div class="main">
    <div class="inbox">
      <div class="lst"><div class="fld"></div>
        <div class="row on"><s class="av"></s><div><div class="n">Ana Ribeiro</div>
          <div class="p">Perfeito, confirmado</div></div></div>
        <div class="row"><s class="av"></s><div><div class="n">Carlos Melo</div>
          <div class="p">Pode passar os valores?</div></div></div>
        <div class="row"><s class="av"></s><div><div class="n">Beatriz Nunes</div>
          <div class="p">Agendado para quinta</div></div></div>
        <div class="row"><s class="av"></s><div><div class="n">Marcos Aguiar</div>
          <div class="p">Recebi o documento</div></div></div></div>
      <div class="conv"><div class="top"><s class="av"></s>
          <div><div class="n">Ana Ribeiro</div><div class="p">WhatsApp &middot; Comercial</div></div>
          <div class="chip" style="margin-left:auto">IA &middot; ativa</div>
          <div class="chip n">Agendado</div></div>
        <div class="stream">
          <div class="bb i">Oi! Vi o an&uacute;ncio e queria entender como funciona.</div>
          <div class="bb o">Oi, Ana! Fa&ccedil;o uma avalia&ccedil;&atilde;o r&aacute;pida e j&aacute; te devolvo o valor. Quer que eu marque?</div>
          <div class="bb i">Quero. Pode ser quinta de manh&atilde;?</div>
          <div class="bb o">Fechado. Quinta, 9h. J&aacute; registrei no funil e te mando o lembrete.</div></div></div></div>
    <div class="board">
      <div class="kcol"><div class="kh">Novo<b>4</b></div>
        <div class="kc on"><div class="nm">Carlos Melo</div><div class="vl">Hoje &middot; 10:31</div></div>
        <div class="kc"><div class="nm">Juliana Sá</div><div class="vl">Hoje &middot; 09:12</div></div></div>
      <div class="kcol"><div class="kh">Conversando<b>5</b></div>
        <div class="kc on"><div class="nm">Marcos Aguiar</div><div class="vl">Documento recebido</div></div>
        <div class="kc"><div class="nm">Renata Lima</div><div class="vl">Aguardando retorno</div></div></div>
      <div class="kcol"><div class="kh">Agendado<b>2</b></div>
        <div class="kc on"><div class="nm">Ana Ribeiro</div><div class="vl">Quinta &middot; 9h</div></div>
        <div class="kc"><div class="nm">Beatriz Nunes</div><div class="vl">Quinta &middot; 14h</div></div></div>
      <div class="kcol"><div class="kh">Cliente<b>1</b></div>
        <div class="kc on"><div class="nm">Paulo Serra</div><div class="vl">Fechado</div></div></div></div>
  </div>
</div>"""


def ui_kyreon():
    u"""Reconstrucao da interface do Kyreon. Dados inventados, funil generico."""
    return u"""<div class="ui tick">
  <div class="sb"><div class="brand"><s></s>KYREON</div><div class="org"><s></s>Sua empresa</div>
    <div class="sec">Opera&ccedil;&atilde;o</div><div class="it on"><s></s>Inbox</div><div class="it"><s></s>N&atilde;o lidas</div>
    <div class="it"><s></s>Clientes</div><div class="sec">Pipelines</div>
    <div class="it"><s></s>Comercial<b>12</b></div><div class="sec">IA</div>
    <div class="it"><s></s>Agentes</div><div class="it"><s></s>Indicadores</div></div>
  <div class="list"><div class="fld"></div>
    <div class="row on"><s class="av"></s><div><div class="n">Ana Ribeiro</div><div class="p">Perfeito, confirmado</div></div></div>
    <div class="row"><s class="av"></s><div><div class="n">Carlos Melo</div><div class="p">Pode passar os valores?</div></div></div>
    <div class="row"><s class="av"></s><div><div class="n">Beatriz Nunes</div><div class="p">Agendado para quinta</div></div></div>
    <div class="row"><s class="av"></s><div><div class="n">Marcos Aguiar</div><div class="p">Recebi o documento</div></div></div></div>
  <div class="conv"><div class="top"><s class="av"></s>
      <div><div class="n">Ana Ribeiro</div><div class="p">WhatsApp &middot; Comercial</div></div>
      <div class="chip" style="margin-left:auto">IA &middot; ativa</div><div class="chip n">Agendado</div></div>
    <div class="stream"><div class="day">Ontem</div>
      <div class="bb i">Oi! Vi o an&uacute;ncio e queria entender como funciona.</div>
      <div class="bb o">Oi, Ana! A gente faz uma avalia&ccedil;&atilde;o r&aacute;pida e j&aacute; te devolve o valor. Quer que eu marque?</div>
      <div class="bb i">Quero. Pode ser quinta de manh&atilde;?</div>
      <div class="bb o">Fechado. Quinta, 9h. J&aacute; registrei e te mando o lembrete.</div></div></div>
</div>"""


# icones lineares — mesmos do <defs> de site/index.html
ICON = {
  'alvo': (u'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>'
           u'<circle cx="12" cy="12" r="1.4"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>'),
  'chat': (u'<path d="M20 12.5a7 7 0 0 1-7 7H8l-4 2.5.9-3.6A7 7 0 0 1 4 12.5a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7z"/>'
           u'<path d="M9 11.5h6M9 14.5h3.5"/>'),
  'funil': u'<path d="M3.5 4.5h17l-6.4 7.6V20l-4.2-2.6v-5.3z"/>',
  'no': (u'<path d="M12 3.2 19.4 7.6v8.8L12 20.8 4.6 16.4V7.6z"/><circle cx="12" cy="12" r="2.2"/>'
         u'<path d="M12 3.2V9.8M19.4 16.4 14 13.2M4.6 16.4 10 13.2"/>'),
  'grafico': (u'<path d="M3 20h18"/><rect x="5" y="12" width="3.4" height="6"/>'
              u'<rect x="10.3" y="8" width="3.4" height="10"/><rect x="15.6" y="4" width="3.4" height="14"/>'),
  'engrenagem': (u'<circle cx="12" cy="12" r="3.2"/>'
                 u'<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 '
                 u'0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 '
                 u'0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 '
                 u'2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 '
                 u'1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 '
                 u'1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v0a1.7 1.7 0 0 0 1.56 '
                 u'1.03H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/>'),
}


def icone(nome):
    return u'<svg class="icon" viewBox="0 0 24 24">%s</svg>' % ICON[nome]


def ficha(linhas=()):
    u"""Pares rotulo/valor. `linhas` = [(rotulo, valor, destaque_bool), ...].
    Serve pra ficha de custo, ficha de contato, qualquer coisa que seja tabela de duas
    colunas. Maximo 5 linhas: acima disso nao cabe na ancora sem espremer."""
    corpo = []
    for linha in linhas:
        rotulo_, valor = linha[0], linha[1]
        hi = u' hi' if len(linha) > 2 and linha[2] else u''
        corpo.append(u'<div class="row"><div class="k">%s</div>'
                     u'<div class="v%s">%s</div></div>' % (rotulo_, hi, valor))
    return u'<div class="card tick">%s</div>' % u''.join(corpo)


def comparativo(titulo_a=u'', linhas_a=(), titulo_b=u'', linhas_b=()):
    u"""Duas colunas lado a lado, a segunda destacada. `linhas_*` = [(rotulo, valor), ...].
    As duas listas precisam ter o mesmo tamanho, senao as linhas desalinham."""
    if len(linhas_a) != len(linhas_b):
        raise SystemExit(u'comparativo: as duas colunas precisam do mesmo numero de linhas.')

    def col(titulo, linhas, hi):
        rows = u''.join(u'<div class="cr"><b>%s</b><span>%s</span></div>' % r for r in linhas)
        return (u'<div class="col%s"><div class="ch">%s</div>%s</div>'
                % (u' hi' if hi else u'', titulo, rows))
    return (u'<div class="compare tick">%s%s</div>'
            % (col(titulo_a, linhas_a, False), col(titulo_b, linhas_b, True)))


def perfil_google(nome=u'', status=u'', itens=()):
    u"""Ficha do Perfil no Google. `itens` = [(texto, marca, ruim_bool), ...] — os ruins
    saem em azul luminoso, os certos em cinza. Mostrar o problema em vez de descrever."""
    linhas = u''.join(
        u'<div class="gr %s"><s></s>%s<b>%s</b></div>'
        % (u'bad' if i[2] else u'ok', i[0], i[1]) for i in itens)
    return (u'<div class="gmb tick"><div class="gh"><s></s><div class="nm">%s</div>'
            u'<div class="st">%s</div></div>%s</div>' % (nome, status, linhas))


def serie(numero, titulo, corpo):
    u"""Um item numerado por slide: numeral em metal escovado + manchete + corpo.
    Empilhar dois desses num slide e o que o estilo editorial existe pra evitar."""
    return (u'<div class="serie"><div class="n">%s</div>'
            u'<div class="tx"><h3>%s</h3><p>%s</p></div></div>' % (numero, titulo, corpo))


def fluxo(etapas=()):
    u"""Etapas com seta entre elas. `etapas` = [(titulo, legenda), ...]. Ate 3 — na
    quarta os paineis ficam estreitos demais pra headline caber em uma linha."""
    paineis = [u'<div class="n">%s<small>%s</small></div>' % e for e in etapas]
    return u'<div class="flow tick">%s</div>' % u'<div class="a">&rarr;</div>'.join(paineis)


def funil(colunas=()):
    u"""Funil em kanban. `colunas` = [(titulo, n_cards, n_acesos), ...]."""
    cols = []
    for titulo, n, on in colunas:
        cards = u''.join(u'<div class="c%s"></div>' % (u' on' if i < on else u'')
                         for i in range(n))
        cols.append(u'<div class="col"><div class="h">%s</div>%s</div>' % (titulo, cards))
    return u'<div class="kanban tick">%s</div>' % u''.join(cols)


def contagem(linhas):
    u"""Tres batidas, cada uma num peso diferente — a tensao em tempo real do estilo do
    Sidney. Exatamente tres: com duas nao vira ritmo, com quatro vira lista."""
    if len(linhas) != 3:
        raise SystemExit(u'contagem: sao tres batidas, nem mais nem menos.')
    return (u'<div class="beats">%s</div>'
            % u''.join(u'<div class="b%d">%s</div>' % (i, t)
                       for i, t in enumerate(linhas, start=1)))


# wordmark do fecho: metal escovado. Id proprio pra nao colidir com o logo do topo.
_GRAD = (u'<defs><linearGradient id="mtbig" x1="0" y1="0" x2="1" y2="1">'
         u'<stop offset="0%" stop-color="#C3D0D8"/><stop offset="24%" stop-color="#93A9B4"/>'
         u'<stop offset="47%" stop-color="#D5E1E8"/><stop offset="68%" stop-color="#8FA6B2"/>'
         u'<stop offset="100%" stop-color="#AEC0C9"/></linearGradient></defs>')
WORDMARK = (LOGO.replace(u'class="logo"', u'class="wordmark"')
                .replace(u'xmlns="http://www.w3.org/2000/svg">',
                         u'xmlns="http://www.w3.org/2000/svg">' + _GRAD)
                .replace(u'fill="#B1E8FF"', u'fill="url(#mtbig)"'))


# tokens de marca que uma paleta pode sobrescrever — os unicos 6 que carregam
# identidade (cor). O resto do :root (grade, metal, vidro) e vocabulario do
# estilo editorial em si, nao da marca, e fica de fora de proposito.
_TOKENS_MARCA = (u'base', u'panel', u'accent', u'text', u'muted', u'dim')

# formatos suportados nesta rodada — so os dois com risco de overflow baixo
# (1:1 fica de fora: varios componentes ilustrados tem altura fixa em px —
# .band 426px, .ui 372px, .kui .inbox 210px — que estourariam num quadro
# 20% mais baixo sem recalcular cada um por formato, e nao vale prometer
# um formato que quebra). --top/--bot escalam proporcionalmente a nova
# altura pra manter a mesma respiracao relativa da grade.
_FORMATOS = {
    u'4:5': {u'w': 1080, u'h': 1350},
    u'9:16': {u'w': 1080, u'h': 1920},
}


def escrever(slides, titulo=u'Scault', paleta=None, formato=None):
    u"""`paleta` e `formato` sao opcionais e aditivos — emitem um <style> extra
    DEPOIS do CSS do motor, sobrescrevendo so custom properties especificas; a
    cascata do CSS resolve o resto. Sem os dois, a saida e byte-a-byte igual a
    antes dos overrides existirem; ninguem que nao pediu marca/formato fica
    sem querer diferente."""
    pares = []
    if paleta:
        pares += [u'--%s:%s' % (k, paleta[k]) for k in _TOKENS_MARCA if paleta.get(k)]
    if formato and formato in _FORMATOS and formato != u'4:5':
        f = _FORMATOS[formato]
        escala = f[u'h'] / 1350.0
        pares += [u'--slide-w:%dpx' % f[u'w'], u'--slide-h:%dpx' % f[u'h'],
                  u'--top:%dpx' % round(200 * escala), u'--bot:%dpx' % round(200 * escala)]
    override = u'<style>:root{%s}</style>' % u';'.join(pares) if pares else u''

    html = (u'<meta charset="utf-8">\n<title>%s</title>\n'
            u'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600'
            u'&family=Inter+Tight:wght@500;600;700;800&display=swap" rel="stylesheet">\n'
            u'<style>%s</style>\n%s\n%s' % (titulo, CSS, override, u"\n".join(slides)))
    io.open('carrossel.html', 'w', encoding='utf-8').write(html)
    print("slides:", len(slides))


# ============================================================================
#  DAQUI PRA BAIXO E O INTERPRETADOR. Le post.json e chama as primitivas
#  acima — nao e conteudo de post, mas muda bem menos que o motor. Pra mudar
#  um post, editar post.json; pra mudar o sistema, editar a secao de cima.
# ============================================================================

# Toda primitiva de conteudo fica exposta aqui pelo nome, pra post.json poder
# chamar qualquer uma sem o interpretador precisar saber de cada uma na mao.
# Uma primitiva nova em build.py so precisa entrar nesta lista pra ficar
# disponivel em post.json — nao precisa mexer no resto do interpretador.
REGISTRY = {
    u'foto': foto,
    u'band': band,
    u'grade': grade,
    u'vidro': vidro,
    u'coluna': coluna,
    u'rotulo': rotulo,
    u'serp': serp,
    u'chat': chat,
    u'mensagens': mensagens,
    u'ui_kyreon_completo': ui_kyreon_completo,
    u'ui_kyreon': ui_kyreon,
    u'icone': icone,
    u'ficha': ficha,
    u'comparativo': comparativo,
    u'perfil_google': perfil_google,
    u'serie': serie,
    u'fluxo': fluxo,
    u'funil': funil,
    u'contagem': contagem,
}


def contrato():
    u"""Assinatura REAL de cada primitiva, lida do proprio codigo.

    Existe porque o nome do argumento so vivia dentro do `def` daqui: POST.md
    lista os NOMES das primitivas e manda "ver build.py" pros argumentos, mas
    quem escreve post.json (o agente do studio, no extrator e no readaptar)
    nunca recebe o build.py. Resultado visto na pratica: template extraido de
    print gravado com `ficha(itens=...)` e `comparativo(itens_a=...)` — nomes
    plausiveis que o motor rejeita com TypeError so na hora de renderizar.

    `python build.py --contrato` imprime isto em JSON: e o que o servidor usa
    pra validar template antes de aceitar, e o que vai no prompt do agente pra
    ele nao precisar adivinhar.
    """
    saida = {}
    for nome, fn in sorted(REGISTRY.items()):
        sig = inspect.signature(fn)
        args = []
        for p in sig.parameters.values():
            args.append({
                u'nome': p.name,
                u'obrigatorio': p.default is inspect.Parameter.empty,
            })
        doc = (fn.__doc__ or u'').strip().splitlines()
        doc = doc[0] if doc else u''
        saida[nome] = {u'args': args, u'doc': doc}
    return saida


def resolve(v):
    u"""Resolve um valor vindo de post.json pro que as primitivas do motor
    esperam. dict com "fn"/"texto"/"wordmark" vira HTML (chama a primitiva ou
    monta o texto semantico, recursivamente). Lista resolve item a item; se
    todo item virar escalar (nao sobrar lista/tupla dentro), a lista vira
    tupla — varias primitivas fazem `% linha` com multiplos %s de uma vez, e
    isso so aceita tupla de verdade, list quebra. String/numero/bool/None
    voltam sem alteracao — e assim que HTML literal (com <span class="acc">
    escrito a mao, entidade, o que for) atravessa intacto."""
    if isinstance(v, dict):
        return _no(v)
    if isinstance(v, list):
        itens = [resolve(x) for x in v]
        if itens and all(not isinstance(x, (list, tuple)) for x in itens):
            return tuple(itens)
        return itens
    return v


def _no(node):
    if u'fn' in node:
        nome = node[u'fn']
        if nome not in REGISTRY:
            raise SystemExit(u'post.json: fn desconhecida "%s". Disponiveis: %s'
                              % (nome, u', '.join(sorted(REGISTRY))))
        args = dict((k, resolve(x)) for k, x in node.get(u'args', {}).items())
        return REGISTRY[nome](**args)
    if node.get(u'wordmark'):
        return WORDMARK
    if u'texto' in node:
        return _texto(node)
    raise SystemExit(u'post.json: no sem "fn", "texto" ou "wordmark": %r' % (node,))


def _texto(node):
    u"""Bloco de texto semantico — a alternativa a escrever <span class="acc">
    na mao. `destaque` e uma lista de frases: a primeira ocorrencia de cada
    uma, na ordem da lista, entra em <span class="acc">. Frase que nao
    aparece no texto vira aviso no stderr, sem quebrar o build (destaque
    ausente e bug de conteudo, nao motivo pra empacar o pipeline inteiro)."""
    texto = node.get(u'texto', u'')
    tag = node.get(u'tag', u'p')
    classe = node.get(u'classe', u'')
    for frase in node.get(u'destaque', []):
        if frase in texto:
            texto = texto.replace(frase, u'<span class="acc">%s</span>' % frase, 1)
        else:
            sys.stderr.write(u'aviso: destaque "%s" nao encontrado no texto: %r\n'
                              % (frase, texto))
    marca = u''
    if _TXT_CONTADOR[0] is not None:
        marca = u' data-txt="%d"' % _TXT_CONTADOR[0]
        _TXT_CONTADOR[0] += 1
    attrs = (u' class="%s"' % classe if classe else u'') + marca
    return u'<%s%s>%s</%s>' % (tag, attrs, texto, tag)


def _fundo(v):
    u"""fundo do slide e sempre uma string so — slide() faz um unico %s no
    formato. Se o no resolver pra lista/tupla (mais de uma camada, tipo mesh
    + glow), concatena; e o mesmo resultado de escrever as duas tags juntas
    numa string so, como o motor ja fazia a mao."""
    r = resolve(v) if v is not None else u''
    if isinstance(r, (list, tuple)):
        return u''.join(r)
    return r


def carregar_post(caminho=u'post.json'):
    with io.open(caminho, encoding='utf-8') as f:
        post = json.load(f)

    _HANDLE[0] = post.get(u'handle') or u'@scault.mkt'
    S = []
    fundo_ant = None
    for i, sl in enumerate(post.get(u'slides', []), start=1):
        classe = sl.get(u'classe', u'')
        # aviso, nao erro: a regra "nunca dois fundos iguais seguidos" e do
        # SKILL.md, pra quem escreve o post — nao ha layout que exija quebrar
        # o build por isso.
        if classe and classe == fundo_ant:
            sys.stderr.write(
                u'aviso: slide %d repete a classe de fundo do anterior ("%s") — '
                u'a regra do estilo editorial e nunca dois seguidos iguais.\n'
                % (i, classe))
        if classe:
            fundo_ant = classe

        if u'corpo' not in sl:
            raise SystemExit(u'post.json: slide %d sem "corpo".' % i)

        _BLOCO_ATUAL[0] = i - 1  # indice do slide (0-based) — grade()/coluna() usam pra marcar data-blk
        _POS_BLOCOS_ATUAL[0] = sl.get(u'posBlocos') or {}
        _resetar_contador_blocos()
        _TXT_CONTADOR[0] = 0

        S.append(slide(
            resolve(sl[u'corpo']),
            fundo=_fundo(sl.get(u'fundo')),
            classe=classe,
            rodape=sl.get(u'rodape', u''),
            logo=bool(sl.get(u'logo', False)),
            chrome=bool(sl.get(u'chrome', True)),
        ))
    return S, post.get(u'titulo', u'Scault'), post.get(u'paleta'), post.get(u'formato')


if __name__ == '__main__':
    if u'--contrato' in sys.argv[1:]:
        sys.stdout.write(json.dumps(contrato(), ensure_ascii=False, indent=2))
        raise SystemExit(0)
    _caminho = sys.argv[1] if len(sys.argv) > 1 else u'post.json'
    if not os.path.exists(_caminho):
        raise SystemExit(u'Falta %s na pasta. Formato: ver POST.md.' % _caminho)
    _slides, _titulo, _paleta, _formato = carregar_post(_caminho)
    escrever(_slides, titulo=_titulo, paleta=_paleta, formato=_formato)
