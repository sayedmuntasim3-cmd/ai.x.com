// Zupona motion-graphics templates: each is one HTML page whose look is the house brand (brand/brand.mjs)
// and whose every frame is a pure function of time. The page exposes window.__seek(t); the renderer
// (render-graphic.mjs) calls it for each frame and photographs the page, so timing is frame-exact and
// two renders of the same data are identical. No CSS animations or transitions are used for that reason.
import { brandCss, EASE } from "./brand/brand.mjs";

/** @typedef {{ width: number, height: number, fps: number, seconds: number }} Frame */

const esc = (/** @type {unknown} */ s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// Shared in-page helpers: the same bezier as brand.mjs, a 0..1 progress between two times, film grain.
const RUNTIME = `
const B={out:${JSON.stringify(EASE.out)},inOut:${JSON.stringify(EASE.inOut)}};
function ease(k,p){const[x1,y1,x2,y2]=B[k];const t0=Math.min(1,Math.max(0,p));const z=(a,b,t)=>3*a*(1-t)**2*t+3*b*(1-t)*t*t+t**3;let t=t0;for(let i=0;i<8;i++){const x=z(x1,x2,t)-t0;const d=3*x1*(1-t)**2+6*(x2-x1)*(1-t)*t+3*(1-x2)*t*t;if(Math.abs(x)<1e-6||!d)break;t=Math.min(1,Math.max(0,t-x/d));}return z(y1,y2,t);}
const seg=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/Math.max(1e-6,b-a)));
const $=(s)=>document.querySelector(s);const $$=(s)=>[...document.querySelectorAll(s)];
function grain(t){const g=document.getElementById('grain-seed');if(g)g.setAttribute('seed',String(Math.floor(t*24)%97));}
`;

const GRAIN = `<svg class="grain" width="100%" height="100%"><filter id="gr"><feTurbulence id="grain-seed" type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="1"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#gr)"/></svg>`;

/**
 * One page: brand CSS, the template's CSS and markup, and its seek function.
 * @param {{ css: string, body: string, seek: string, data: unknown, frame: Frame, alpha?: boolean, ground?: "night" | "paper" }} p
 */
function page(p) {
  const bg = p.alpha ? "transparent" : p.ground === "paper" ? "var(--paper)" : "var(--night)";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${brandCss()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${p.frame.width}px;height:${p.frame.height}px;overflow:hidden;background:${bg};}
body{font-family:var(--text);color:var(--ink);font-size:${p.frame.height / 100}px;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.stage{position:absolute;inset:0;overflow:hidden}
.grain{position:absolute;inset:0;mix-blend-mode:overlay;opacity:.16;pointer-events:none}
.vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.55) 100%)}
.glow{position:absolute;width:90em;height:90em;border-radius:50%;background:radial-gradient(circle,rgba(242,169,59,.16),transparent 62%)}
${p.css}</style></head><body><div class="stage">${p.body}</div>
<script>${RUNTIME}const D=${JSON.stringify(p.data).replace(/</g, "\\u003c")};const T=${p.frame.seconds};
window.__seek=function(t){grain(t);${p.seek}};window.__seek(0);</script></body></html>`;
}

/** Split words into spans (data-i in order); words in `accent` get the accent class. */
function words(/** @type {string} */ text, /** @type {string} */ accent = "") {
  const hot = new Set(accent.toLowerCase().split(/\s+/).filter(Boolean));
  return text.split(/\s+/).filter(Boolean).map((w, i) => `<span class="w${hot.has(w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")) ? " hot" : ""}" data-i="${i}"><span>${esc(w)}</span></span>`).join(" ");
}

/** The word to set in the accent colour when none is given: the longest, which is usually the noun. */
export function accentWord(/** @type {string} */ text) {
  return text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}']/gu, "")).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] ?? "";
}

export const TEMPLATES = {
  /** FX-KINETIC: a line set word by word, each rising out of a mask; the key word in the accent. */
  kinetic: {
    seconds: 4,
    html(/** @type {{ text: string, accent?: string }} */ d, /** @type {Frame} */ f, alpha = false) {
      const size = d.text.length > 70 ? 6.2 : d.text.length > 40 ? 7.6 : 9.4;
      return page({ frame: f, alpha, data: d, body: `${alpha ? "" : '<div class="glow"></div><div class="vignette"></div>'}<div class="line">${words(d.text, d.accent ?? accentWord(d.text))}</div>${alpha ? "" : GRAIN}`,
        css: `.line{position:absolute;left:10%;right:10%;top:50%;transform:translateY(-50%);font-family:var(--display);font-weight:700;font-size:${size}em;line-height:1.08;letter-spacing:-.015em;text-align:center;${alpha ? "text-shadow:0 .08em .4em rgba(0,0,0,.55);" : ""}}
.w{display:inline-block;overflow:hidden;vertical-align:bottom;padding:0 .04em .08em}.w>span{display:inline-block}.hot>span{color:var(--accent);font-style:normal}
.glow{left:50%;top:50%;margin:-45em 0 0 -45em}`,
        seek: `const n=$$('.w').length;const step=Math.min(.16,1.6/Math.max(1,n));$$('.w').forEach((w,i)=>{const p=ease('out',seg(t,.15+i*step,.15+i*step+.7));const s=w.firstChild;s.style.transform='translateY('+(1-p)*110+'%)';s.style.opacity=String(Math.min(1,p*1.6));s.style.filter='blur('+(1-p)*6+'px)';});
const out=ease('inOut',seg(t,T-.45,T));$('.line').style.opacity=String(1-out);$('.line').style.transform='translateY(-50%) scale('+(1+.04*seg(t,0,T))+')';const g=$('.glow');if(g)g.style.transform='translate('+Math.sin(t*.5)*6+'em,'+Math.cos(t*.4)*4+'em)';`,
      });
    },
  },

  /** FX-COUNTER: a number that runs up with the house ease and settles; the words around it stay calm. */
  counter: {
    seconds: 4,
    html(/** @type {{ before?: string, value: number, after?: string, label?: string }} */ d, /** @type {Frame} */ f, alpha = false) {
      return page({ frame: f, alpha, data: d, body: `${alpha ? "" : '<div class="glow"></div><div class="vignette"></div>'}<div class="box"><div class="before">${esc(d.before ?? "")}</div><div class="num">0</div><div class="bar"></div><div class="after">${esc(d.after ?? "")}</div>${d.label ? `<div class="label">${esc(d.label)}</div>` : ""}</div>${alpha ? "" : GRAIN}`,
        css: `.box{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center}
.num{font-family:var(--display);font-weight:800;font-size:26em;line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums lining-nums;color:var(--ink)}
.before,.after{font-family:var(--text);font-weight:700;font-size:4.2em;letter-spacing:.02em;color:var(--ink)}.before{margin-bottom:.6em;color:var(--muted)}
.bar{height:.7em;background:var(--accent);margin:2.6em auto 2.4em;width:0}.label{margin-top:2em;font-size:2.2em;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}
.glow{left:50%;top:50%;margin:-45em 0 0 -45em}`,
        seek: `const p=ease('out',seg(t,.25,Math.min(T-.6,2.6)));const v=Math.round(D.value*p);$('.num').textContent=v.toLocaleString('en-US');$('.num').style.transform='scale('+(.94+.06*ease('out',seg(t,0,.6)))+')';$('.num').style.opacity=String(seg(t,0,.25));
$('.bar').style.width=(36*ease('out',seg(t,1.2,2.4)))+'em';const a=ease('out',seg(t,.05,.6));$('.before').style.opacity=String(a);$('.before').style.transform='translateY('+(1-a)*1.2+'em)';const b=ease('out',seg(t,1.6,2.3));$('.after').style.opacity=String(b);$('.after').style.transform='translateY('+(1-b)*-1+'em)';const l=$('.label');if(l)l.style.opacity=String(b*.9);
const out=ease('inOut',seg(t,T-.4,T));$('.box').style.opacity=String(1-out);`,
      });
    },
  },

  /** Lower third (over footage, rendered with alpha): an accent bar wipes, the name slides out of it. */
  lowerThird: {
    seconds: 5,
    html(/** @type {{ name: string, role?: string }} */ d, /** @type {Frame} */ f, alpha = true) {
      return page({ frame: f, alpha, data: d, body: `<div class="lt"><div class="bar"></div><div class="txt"><div class="name">${esc(d.name)}</div>${d.role ? `<div class="role">${esc(d.role)}</div>` : ""}</div></div>`,
        css: `.lt{position:absolute;left:7%;bottom:12%;display:flex;align-items:stretch;gap:1.6em}
.bar{width:.55em;background:var(--accent);transform-origin:bottom}
.txt{overflow:hidden;padding:.6em 2.4em .8em 1.6em;background:linear-gradient(90deg,rgba(12,17,19,.82),rgba(12,17,19,.55) 75%,rgba(12,17,19,0))}
.name{font-family:var(--display);font-weight:700;font-size:5.4em;line-height:1.05;color:var(--ink);white-space:nowrap}
.role{font-family:var(--text);font-weight:700;font-size:2em;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);margin-top:.55em;white-space:nowrap}`,
        seek: `const inn=ease('out',seg(t,0,.55));const out=ease('inOut',seg(t,T-.55,T));$('.bar').style.transform='scaleY('+inn*(1-out)+')';const s=ease('out',seg(t,.18,.9));const x=$('.txt');x.style.clipPath='inset(0 '+(100-100*s*(1-out))+'% 0 0)';$('.name').style.transform='translateX('+(1-s)*-3+'em)';const r=$('.role');if(r){const q=ease('out',seg(t,.45,1.1));r.style.opacity=String(q*(1-out));r.style.transform='translateX('+(1-q)*-2+'em)';}`,
      });
    },
  },

  /** Quote card: a large accent quotation mark lands, the words come in line by line, the speaker after. */
  quote: {
    seconds: 6,
    html(/** @type {{ quote: string, by?: string, paper?: boolean }} */ d, /** @type {Frame} */ f, alpha = false) {
      const size = d.quote.length > 160 ? 4.2 : d.quote.length > 90 ? 5 : 6.2;
      return page({ frame: f, alpha, ground: d.paper ? "paper" : "night", data: d, body: `${d.paper || alpha ? "" : '<div class="glow"></div><div class="vignette"></div>'}<div class="q"><div class="mark">“</div><blockquote>${words(d.quote)}</blockquote>${d.by ? `<div class="by"><span class="rule"></span>${esc(d.by)}</div>` : ""}</div>${alpha ? "" : GRAIN}`,
        css: `.q{position:absolute;left:14%;right:14%;top:50%;transform:translateY(-50%)}
.mark{font-family:var(--display);font-weight:800;font-size:30em;line-height:.6;height:.42em;color:var(--accent);transform-origin:left bottom}
blockquote{font-family:var(--display);font-weight:400;font-size:${size}em;line-height:1.28;color:${d.paper ? "var(--paper-ink)" : "var(--ink)"}}
.w{display:inline-block}.by{margin-top:2.2em;display:flex;align-items:center;gap:1.4em;font-family:var(--text);font-weight:700;font-size:2.3em;letter-spacing:.24em;text-transform:uppercase;color:${d.paper ? "var(--accent-deep)" : "var(--muted)"}}
.rule{display:inline-block;height:.14em;width:4em;background:var(--accent)}.glow{left:20%;top:30%;margin:-45em 0 0 -45em}`,
        seek: `const m=ease('out',seg(t,0,.7));$('.mark').style.opacity=String(m);$('.mark').style.transform='scale('+(.6+.4*m)+') translateY('+(1-m)*.1+'em)';const ws=$$('.w');const span=Math.min(2.6,T-2.2);ws.forEach((w,i)=>{const p=ease('out',seg(t,.45+span*i/Math.max(1,ws.length),.45+span*i/Math.max(1,ws.length)+.5));w.style.opacity=String(p);w.style.transform='translateY('+(1-p)*.35+'em)';});
const b=$('.by');if(b){const p=ease('out',seg(t,.6+span,1.3+span));b.style.opacity=String(p);$('.rule').style.width=4*p+'em';}const out=ease('inOut',seg(t,T-.5,T));$('.q').style.opacity=String(1-out);$('.q').style.transform='translateY(-50%) scale('+(1+.03*seg(t,0,T))+')';`,
      });
    },
  },

  /** Chapter title: the signature card. Number in tracked caps, title revealed from behind a moving accent rule. */
  chapter: {
    seconds: 4.5,
    html(/** @type {{ title: string, number?: number | string, kicker?: string }} */ d, /** @type {Frame} */ f, alpha = false) {
      const kicker = d.kicker ?? (d.number != null ? `Chapter ${String(d.number).padStart(2, "0")}` : "");
      return page({ frame: f, alpha, data: d, body: `${alpha ? "" : '<div class="glow"></div><div class="vignette"></div>'}<div class="ch">${kicker ? `<div class="kick">${esc(kicker)}</div>` : ""}<div class="tw"><h1>${esc(d.title)}</h1></div><div class="rule"></div></div>${alpha ? "" : GRAIN}`,
        css: `.ch{position:absolute;left:9%;right:9%;top:50%;transform:translateY(-50%)}
.kick{font-family:var(--text);font-weight:700;font-size:2.4em;text-transform:uppercase;color:var(--accent);margin-bottom:1.6em}
.tw{overflow:hidden;padding-bottom:.12em}h1{font-family:var(--display);font-weight:800;font-size:${d.title.length > 28 ? 9 : 12.5}em;line-height:1;letter-spacing:-.02em;color:var(--ink)}
.rule{height:.5em;background:var(--accent);margin-top:2.4em;width:0}.glow{left:15%;top:50%;margin:-45em 0 0 -45em}`,
        seek: `const k=$('.kick');if(k){const p=ease('out',seg(t,.1,1.2));k.style.opacity=String(p);k.style.letterSpacing=(.6-.24*p)+'em';}const p=ease('out',seg(t,.35,1.25));$('h1').style.transform='translateY('+(1-p)*105+'%)';$('.rule').style.width=(30*ease('out',seg(t,.7,1.7)))+'em';
const out=ease('inOut',seg(t,T-.5,T));$('.ch').style.opacity=String(1-out);$('.ch').style.transform='translateY(-50%) scale('+(1+.035*ease('inOut',seg(t,0,T)))+')';const g=$('.glow');if(g)g.style.transform='translateX('+t*3+'em)';`,
      });
    },
  },

  /** Timeline: a rule draws across, the years arrive in turn and the camera travels to the one this beat is about. */
  timeline: {
    seconds: 6,
    html(/** @type {{ items: { year: string | number, label: string }[], active?: number, title?: string }} */ d, /** @type {Frame} */ f, alpha = false) {
      const items = d.items.slice(0, 8);
      const gap = 34; // em between nodes
      return page({ frame: f, alpha, data: { ...d, items, gap }, body: `${alpha ? "" : '<div class="vignette"></div>'}${d.title ? `<div class="title">${esc(d.title)}</div>` : ""}<div class="track"><div class="line"></div>${items.map((it, i) => `<div class="node" style="left:${i * gap}em"><div class="dot"></div><div class="year">${esc(it.year)}</div><div class="lab">${esc(it.label)}</div></div>`).join("")}</div>${alpha ? "" : GRAIN}`,
        css: `.title{position:absolute;left:8%;top:12%;font-family:var(--text);font-weight:700;font-size:2.4em;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.track{position:absolute;top:56%;left:50%}.line{position:absolute;left:-200em;top:0;height:.3em;background:var(--rule);width:0}
.node{position:absolute;top:0;width:0}.dot{position:absolute;left:-1.1em;top:-.95em;width:2.2em;height:2.2em;border-radius:50%;background:var(--night);border:.35em solid var(--muted)}
.year{position:absolute;font-family:var(--display);font-weight:800;text-align:center;font-size:7em;left:-2.14em;width:4.28em;bottom:.42em;color:var(--muted)}
.lab{position:absolute;left:-14em;width:28em;top:3.2em;text-align:center;font-size:2.8em;line-height:1.3;color:var(--muted)}
.node.on .dot{background:var(--accent);border-color:var(--accent)}.node.on .year{color:var(--ink)}.node.on .lab{color:var(--ink)}`,
        seek: `const n=D.items.length;const act=Math.min(n-1,Math.max(0,D.active??n-1));const draw=ease('inOut',seg(t,0,1.4));$('.line').style.width=(200+(n-1)*D.gap*draw+200*draw)+'em';
$$('.node').forEach((el,i)=>{const p=ease('out',seg(t,.3+i*.22,.9+i*.22));el.style.opacity=String(p);el.style.transform='translateY('+(1-p)*2+'em)';el.classList.toggle('on',i===act&&t>1.2+act*.22);});
const pan=ease('inOut',seg(t,.6,Math.min(T-.8,2.6+act*.2)));const from=0, to=act*D.gap;const x=from+(to-from)*pan;const z=1+.12*ease('inOut',seg(t,2,T));$('.track').style.transform='scale('+z+') translateX('+(-x)+'em)';const out=ease('inOut',seg(t,T-.45,T));document.querySelector('.stage').style.opacity=String(1-out);`,
      });
    },
  },

  /** Document or newspaper reveal: a paper page under a raking light; the camera settles on the line that matters as a highlighter sweeps it. */
  document: {
    seconds: 6,
    html(/** @type {{ text: string, highlight?: string, headline?: string, masthead?: string, date?: string, kind?: "newspaper" | "document" }} */ d, /** @type {Frame} */ f) {
      const news = d.kind !== "document";
      const hl = d.highlight && d.text.includes(d.highlight) ? d.highlight : "";
      const [pre, post] = hl ? [d.text.slice(0, d.text.indexOf(hl)), d.text.slice(d.text.indexOf(hl) + hl.length)] : [d.text, ""];
      // Grey bars stand for the rest of the page: no invented words are ever printed.
      const filler = (/** @type {number} */ k, /** @type {number} */ n) => Array.from({ length: n }, (_, i) => `<i style="width:${70 + ((i * 37 + k * 13) % 30)}%"></i>`).join("");
      return page({ frame: f, ground: "night", data: d, body: `<div class="desk"></div><div class="sheet"><div class="paper">${news ? `${d.masthead ? `<div class="mast">${esc(d.masthead)}</div>` : ""}<div class="dateline">${esc(d.date ?? "")}</div>` : `<div class="docno">${esc(d.masthead ?? "")}</div>`}${d.headline ? `<h2>${esc(d.headline)}</h2>` : ""}<div class="cols"><div class="col">${filler(1, 9)}</div><div class="col main"><p>${esc(pre)}<mark>${esc(hl)}</mark>${esc(post)}</p></div><div class="col">${filler(2, 11)}</div></div></div><div class="light"></div></div>${GRAIN}<div class="vignette"></div>`,
        css: `.desk{position:absolute;inset:0;background:radial-gradient(ellipse at 40% 30%,#2a2420,#0e0c0b 70%)}
.sheet{position:absolute;left:50%;top:50%;width:150em;height:96em;margin:-48em 0 0 -75em;transform-origin:50% 50%;box-shadow:0 3em 8em rgba(0,0,0,.6)}
.paper{position:absolute;inset:0;padding:6em 8em;background:var(--paper);color:var(--paper-ink);background-image:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.35),transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(120,90,50,.18),transparent 55%)}
.mast{font-family:var(--display);font-weight:800;font-size:9em;text-align:center;letter-spacing:-.01em;border-bottom:.06em solid var(--paper-ink);padding-bottom:.1em}
.dateline{font-size:2em;letter-spacing:.3em;text-transform:uppercase;text-align:center;padding:.6em 0;border-bottom:.15em double var(--paper-ink);margin-bottom:1.6em;min-height:2.4em}
.docno{font-size:2.2em;letter-spacing:.3em;text-transform:uppercase;margin-bottom:2em;color:#6b5f50}
h2{font-family:var(--display);font-weight:700;font-size:7.2em;line-height:1.02;margin-bottom:.5em}
.cols{display:grid;grid-template-columns:1fr 1.6fr 1fr;gap:4em}.col i{display:block;height:1.2em;background:rgba(29,26,22,.16);margin:0 0 1.5em}
.main p{font-family:var(--display);font-size:4.4em;line-height:1.38}mark{color:inherit;background:linear-gradient(rgba(242,169,59,.78),rgba(242,169,59,.78)) no-repeat 0 85%/0% 72%;-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 .08em}
.light{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,240,210,.0) 30%,rgba(255,240,210,.22) 50%,rgba(0,0,0,.18) 80%);mix-blend-mode:soft-light}`,
        seek: `const cam=ease('inOut',seg(t,0,T-.6));const mk=$('mark').getBoundingClientRect();const sh=$('.sheet');
if(!window.__target){sh.style.transform='none';const r=$('mark').getBoundingClientRect();const W=innerWidth,H=innerHeight;window.__target={x:W/2-(r.left+r.width/2),y:H/2-(r.top+r.height/2)};}
const g=window.__target;const z=.62+.9*cam;const rot=-4+4*cam;sh.style.transform='translate('+g.x*cam*z+'px,'+g.y*cam*z+'px) scale('+z+') rotate('+rot+'deg)';
const h=ease('out',seg(t,T*.55,T*.55+1));$('mark').style.backgroundSize=(100*h)+'% 72%';$('.light').style.transform='translateX('+(-10+20*cam)+'%)';const fin=seg(t,0,.4);document.querySelector('.stage').style.opacity=String(fin*(1-ease('inOut',seg(t,T-.4,T))));`,
      });
    },
  },
};

/** @typedef {keyof typeof TEMPLATES} TemplateName */
