import { useId, type CSSProperties, type ReactElement } from "react";
import type { CategoryId } from "./data";

/** Deterministic pseudo-random numbers, so server and browser draw identical scenes. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

const SPECTRUM = [
  ["0", "#2B63F6"],
  ["0.42", "#7A3BEE"],
  ["0.72", "#EA3A8C"],
  ["1", "#FF7A1E"],
] as const;

/** The Zupona fox: a geometric head drawn as one spectrum-coloured outline. */
export function FoxMark({ className = "", glow = false }: { className?: string; glow?: boolean }) {
  const id = useSvgId("fox");
  const paint = `url(#${id}-g)`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          {SPECTRUM.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
        {glow && (
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? `url(#${id}-glow)` : undefined} fill="none" stroke={paint} strokeWidth="3.4" strokeLinejoin="miter" strokeMiterlimit="8">
        {/* Head: ears, cheek points, chin */}
        <path d="M7 4 L23 21 L32 19 L41 21 L57 4 L54 28 L61 35 L49 44 L32 60 L15 44 L3 35 L10 28 Z" />
        {/* Inner ear lines */}
        <path d="M13 13 L21 25 M51 13 L43 25" strokeWidth="2" />
      </g>
      <g fill={paint} filter={glow ? `url(#${id}-glow)` : undefined}>
        <path d="M16 35 L27 38.5 L26 41.5 L17 38 Z M48 35 L37 38.5 L38 41.5 L47 38 Z" />
        <path d="M27 46 L37 46 L32 52 Z" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Hero backdrop                                                       */
/* ------------------------------------------------------------------ */

export function HeroMountains({ className = "" }: { className?: string }) {
  const id = useSvgId("hm");
  return (
    <svg viewBox="0 0 900 460" preserveAspectRatio="xMaxYMin slice" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-a1`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#2B63F6" stopOpacity="0.32" />
          <stop offset="1" stopColor="#2B63F6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-a2`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#B43CC8" stopOpacity="0.3" />
          <stop offset="1" stopColor="#B43CC8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-a3`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FF7A1E" stopOpacity="0.28" />
          <stop offset="1" stopColor="#FF7A1E" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--canvas))" stopOpacity="0" />
          <stop offset="1" stopColor="rgb(var(--canvas))" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* Aurora: the spectrum, softened, behind the peaks */}
      <g style={{ opacity: "var(--aurora)" } as CSSProperties}>
        <ellipse cx="470" cy="150" rx="230" ry="150" fill={`url(#${id}-a1)`} />
        <ellipse cx="680" cy="110" rx="240" ry="150" fill={`url(#${id}-a2)`} />
        <ellipse cx="860" cy="190" rx="200" ry="130" fill={`url(#${id}-a3)`} />
      </g>
      <path
        d="M120 300 L250 210 L310 240 L420 130 L480 175 L560 95 L640 160 L700 120 L790 190 L860 150 L900 170 L900 460 L120 460Z"
        fill="rgb(var(--ridge-1))"
      />
      <path
        d="M560 95 L538 117 L546 110 L554 122 L562 112 L572 120 L580 111Z M420 130 L404 146 L410 141 L416 150 L423 140 L432 148 L439 144Z M700 120 L679 134 L686 129 L693 138 L701 130 L710 137 L717 133Z M860 150 L844 165 L851 160 L857 169 L864 159 L872 166 L878 161Z"
        fill="rgb(var(--ridge-snow))"
      />
      <path
        d="M60 360 L210 280 L290 310 L380 240 L470 290 L560 230 L660 285 L740 250 L830 300 L900 280 L900 460 L60 460Z"
        fill="rgb(var(--ridge-2))"
      />
      <path
        d="M0 410 C120 360 220 350 330 372 C440 394 520 330 640 340 C760 350 820 380 900 370 L900 460 L0 460Z"
        fill="rgb(var(--ridge-3))"
      />
      <rect y="300" width="900" height="160" fill={`url(#${id}-mist)`} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Poster scenes                                                       */
/* ------------------------------------------------------------------ */

type SceneProps = { id: string };

function NatureScene({ id }: SceneProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2150" />
          <stop offset="0.5" stopColor="#5B3E86" />
          <stop offset="0.78" stopColor="#D9708F" />
          <stop offset="1" stopColor="#F7B98A" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFE2C4" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFB184" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3C2C7" stopOpacity="0" />
          <stop offset="1" stopColor="#F3C2C7" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${id}-sky)`} />
      <g className="scene-rise">
        <circle cx="282" cy="150" r="76" fill={`url(#${id}-glow)`} />
        <circle cx="282" cy="150" r="24" fill="#FFF1DE" opacity="0.95" />
      </g>
      <g fill="#FFF8F0" opacity="0.8">
        <circle cx="48" cy="34" r="1.4" /><circle cx="96" cy="22" r="1" /><circle cx="140" cy="48" r="1.2" /><circle cx="210" cy="28" r="1" /><circle cx="330" cy="40" r="1.3" /><circle cx="372" cy="18" r="1" /><circle cx="250" cy="60" r="0.9" />
      </g>
      <path d="M0 150 L40 128 L78 140 L120 102 L150 122 L190 88 L232 126 L270 110 L310 132 L350 98 L400 124 L400 250 L0 250Z" fill="#8D7BB5" opacity="0.9" />
      <path d="M190 88 L176 102 L183 98 L189 108 L195 99 L203 106 L209 101Z M120 102 L108 114 L114 111 L119 119 L125 110 L131 116 L136 112Z M350 98 L338 110 L344 107 L349 116 L355 107 L362 113 L367 109Z" fill="#FFF4F4" />
      <rect y="118" width="400" height="72" fill={`url(#${id}-mist)`} />
      <path d="M0 178 L30 160 L64 170 L104 140 L140 162 L176 150 L214 170 L252 144 L292 168 L336 150 L372 166 L400 156 L400 250 L0 250Z" fill="#4A3D7C" />
      <path d="M0 200 C40 188 70 184 110 192 C150 200 180 178 220 182 C260 186 300 204 340 196 C370 190 390 186 400 188 L400 250 L0 250Z" fill="#2B2756" />
      <path d="M0 226 C60 214 120 218 170 224 C230 232 290 214 340 218 C370 220 390 226 400 228 L400 250 L0 250Z" fill="#171637" />
      <path d="M24 226 l6 -20 l6 20z M36 228 l7 -26 l7 26z M50 227 l5 -16 l5 16z M352 222 l6 -22 l6 22z M366 224 l5 -15 l5 15z" fill="#0F0F28" />
    </>
  );
}

function OceanScene({ id }: SceneProps) {
  const rand = seeded(7);
  const motes = Array.from({ length: 34 }, () => ({ x: r1(rand() * 400), y: r1(rand() * 250), r: r1(0.4 + rand() * 1.3), o: r1(0.15 + rand() * 0.45) }));
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3F7F9A" />
          <stop offset="0.45" stopColor="#1C4A61" />
          <stop offset="1" stopColor="#0A1C28" />
        </linearGradient>
        <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8F4F8" stopOpacity="0.38" />
          <stop offset="1" stopColor="#E8F4F8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-whale`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4F7F96" />
          <stop offset="0.6" stopColor="#24485B" />
          <stop offset="1" stopColor="#173444" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${id}-sea)`} />
      <g className="scene-shimmer" fill={`url(#${id}-ray)`}>
        <path d="M118 0 L152 0 L226 250 L160 250Z" />
        <path d="M196 0 L214 0 L296 250 L254 250Z" opacity="0.8" />
        <path d="M58 0 L76 0 L112 250 L72 250Z" opacity="0.6" />
        <path d="M262 0 L300 0 L400 210 L400 250 L372 250Z" opacity="0.7" />
      </g>
      <path d="M0 9 C40 4 80 13 120 8 S200 3 240 9 S320 14 400 7" stroke="#DDEFF5" strokeOpacity="0.25" strokeWidth="1.2" fill="none" />
      <g fill="#E3F1F6">
        {motes.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} opacity={m.o} />
        ))}
      </g>
      <g className="scene-drift">
        <g transform="translate(58 92)">
          <path
            d="M286 44 C278 26 246 16 196 17 C150 18 112 28 82 42 C66 49 52 54 40 56 C30 50 18 36 2 30 C10 42 18 52 24 60 C14 70 6 82 0 98 C14 86 28 76 40 68 C56 72 70 75 92 78 C142 84 214 84 256 72 C274 66 290 56 286 44Z"
            fill={`url(#${id}-whale)`}
          />
          <path d="M222 77 C222 96 210 116 186 130 C192 114 198 98 200 80Z" fill="#1C3D4E" />
          <path d="M118 74 C160 82 216 82 252 70" stroke="#9CC3D3" strokeOpacity="0.35" strokeWidth="1.1" fill="none" />
          <path d="M150 79 C190 84 230 80 262 64" stroke="#9CC3D3" strokeOpacity="0.25" strokeWidth="1" fill="none" />
          <path d="M120 22 C170 14 230 16 270 30" stroke="#B9DCE8" strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
          <circle cx="262" cy="52" r="1.8" fill="#0C1F29" />
        </g>
      </g>
      <g fill="#BFDDE8" opacity="0.5" className="scene-drift-slow">
        <path d="M330 182 l8 -3 l-1 3 l1 3z M344 190 l7 -2.5 l-1 2.5 l1 2.5z M322 196 l8 -3 l-1 3 l1 3z M352 176 l6 -2 l-1 2 l1 2z" />
      </g>
    </>
  );
}

function SpaceScene({ id }: SceneProps) {
  const rand = seeded(42);
  const stars = Array.from({ length: 80 }, () => ({ x: r1(rand() * 400), y: r1(rand() * 250), r: r1(0.3 + rand() * 1.1), o: r1(0.25 + rand() * 0.7) }));
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#100E1C" />
          <stop offset="0.6" stopColor="#221A33" />
          <stop offset="1" stopColor="#3A2240" />
        </linearGradient>
        <radialGradient id={`${id}-planet`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#F2B596" />
          <stop offset="0.45" stopColor="#C8643F" />
          <stop offset="1" stopColor="#4E2220" />
        </radialGradient>
        <radialGradient id={`${id}-neb`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#D97757" stopOpacity="0.35" />
          <stop offset="1" stopColor="#D97757" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-neb2`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6A9BCC" stopOpacity="0.25" />
          <stop offset="1" stopColor="#6A9BCC" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${id}-sky)`} />
      <ellipse cx="110" cy="190" rx="170" ry="80" fill={`url(#${id}-neb)`} />
      <ellipse cx="80" cy="60" rx="120" ry="60" fill={`url(#${id}-neb2)`} />
      <g fill="#FFF8EE" className="scene-twinkle">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
        ))}
      </g>
      <g className="scene-rise">
        <g transform="rotate(-14 282 140)">
          <path d="M172 140 A110 22 0 0 1 392 140" stroke="#F1D3B8" strokeOpacity="0.55" strokeWidth="3" fill="none" />
        </g>
        <circle cx="282" cy="140" r="60" fill={`url(#${id}-planet)`} />
        <path d="M232 112 C260 118 300 116 336 110 M226 136 C262 142 304 140 340 134 M234 162 C262 166 300 166 330 158" stroke="#FFE3CF" strokeOpacity="0.16" strokeWidth="4" fill="none" />
        <g transform="rotate(-14 282 140)">
          <path d="M172 140 A110 22 0 0 0 392 140" stroke="#F1D3B8" strokeOpacity="0.8" strokeWidth="3" fill="none" />
        </g>
      </g>
      <circle cx="96" cy="74" r="9" fill="#D8CEC4" />
      <circle cx="99" cy="71" r="9" fill="#100E1C" opacity="0.55" />
    </>
  );
}

function HistoryScene({ id }: SceneProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3D7B1" />
          <stop offset="0.6" stopColor="#E6A676" />
          <stop offset="1" stopColor="#C86B4A" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFF0D9" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFF0D9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${id}-sky)`} />
      <g className="scene-rise">
        <circle cx="236" cy="148" r="88" fill={`url(#${id}-glow)`} />
        <circle cx="236" cy="148" r="40" fill="#FBE6C8" opacity="0.95" />
      </g>
      <path d="M0 174 C80 150 150 166 210 160 C280 154 340 140 400 158 L400 250 L0 250Z" fill="#D58E63" />
      <path d="M0 206 C90 186 170 200 240 196 C310 192 360 184 400 190 L400 250 L0 250Z" fill="#9D5638" />
      <g fill="#5C3223">
        <rect x="88" y="190" width="132" height="8" rx="1" />
        <rect x="96" y="124" width="58" height="9" rx="1" />
        <rect x="100" y="133" width="10" height="57" />
        <rect x="124" y="133" width="10" height="57" />
        <rect x="148" y="146" width="10" height="44" />
        <path d="M146 146 h14 v-6 l-4 -3 l-3 4 l-3 -2 l-4 3z" />
        <rect x="172" y="160" width="10" height="30" />
        <path d="M170 160 h14 l-2 -6 l-4 2 l-3 -3 l-5 4z" />
        <rect x="196" y="176" width="10" height="14" />
        <rect x="140" y="118" width="18" height="6" rx="1" transform="rotate(4 140 118)" />
      </g>
      <path d="M300 92 q4 -4 8 0 q4 -4 8 0 M322 82 q3 -3 6 0 q3 -3 6 0" stroke="#7A3F2A" strokeWidth="1.3" fill="none" strokeLinecap="round" className="scene-drift-slow" />
      <g fill="#4E2A1E" className="scene-drift-slow">
        <path d="M300 186 c2 -6 6 -8 9 -6 c2 -4 6 -4 7 0 l3 -2 l1 3 l-3 2 v8 h-2 v-6 h-10 v6 h-2 v-6 c-2 0 -3 2 -3 1z" />
        <path d="M330 184 c2 -6 6 -8 9 -6 c2 -4 6 -4 7 0 l3 -2 l1 3 l-3 2 v8 h-2 v-6 h-10 v6 h-2 v-6 c-2 0 -3 2 -3 1z" />
      </g>
    </>
  );
}

function ScienceScene({ id }: SceneProps) {
  const rand = seeded(19);
  const cells = Array.from({ length: 9 }, () => ({
    x: r1(30 + rand() * 340),
    y: r1(30 + rand() * 190),
    rx: r1(14 + rand() * 22),
    ry: r1(10 + rand() * 14),
    a: Math.round(rand() * 180),
  }));
  const rods = Array.from({ length: 12 }, () => ({ x: r1(rand() * 400), y: r1(rand() * 250), w: r1(12 + rand() * 12), a: Math.round(rand() * 180) }));
  const dots = Array.from({ length: 40 }, () => ({ x: r1(rand() * 400), y: r1(rand() * 250), r: r1(0.6 + rand() * 1.6) }));
  return (
    <>
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#24564F" />
          <stop offset="0.6" stopColor="#123634" />
          <stop offset="1" stopColor="#0A1E21" />
        </radialGradient>
        <radialGradient id={`${id}-cell`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#A9D3BE" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3B7D6B" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${id}-bg)`} />
      <g stroke="#CFE7DC" strokeOpacity="0.06">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={`v${i}`} d={`M${i * 50} 0 V250`} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <path key={`h${i}`} d={`M0 ${i * 50} H400`} />
        ))}
      </g>
      <g fill="#CFE7DC" opacity="0.35">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} />
        ))}
      </g>
      <g className="scene-drift-slow">
        {rods.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height="5" rx="2.5" fill="#D4A86A" opacity="0.55" transform={`rotate(${r.a} ${r.x} ${r.y})`} />
        ))}
      </g>
      <g className="scene-drift">
        {cells.map((c, i) => (
          <g key={i} transform={`rotate(${c.a} ${c.x} ${c.y})`}>
            <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} fill={`url(#${id}-cell)`} stroke="#BFE0D0" strokeOpacity="0.45" strokeWidth="1.2" />
            <circle cx={r1(c.x + c.rx * 0.2)} cy={c.y} r={r1(c.ry * 0.32)} fill="#E1A178" opacity="0.7" />
          </g>
        ))}
      </g>
      <path d="M40 210 c10 -10 20 10 30 0 s20 10 30 0 s20 10 30 0" stroke="#E8C48C" strokeOpacity="0.5" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="200" cy="125" r="190" fill="none" stroke="#071315" strokeOpacity="0.55" strokeWidth="80" />
    </>
  );
}

function CultureScene({ id }: SceneProps) {
  const lanterns: { x: number; y: number; c: string }[] = [];
  const strings = [
    { y0: 34, y1: 70, y2: 40, colors: ["#F2B36D", "#E0784C", "#F6CF8A"] },
    { y0: 78, y1: 120, y2: 84, colors: ["#E0784C", "#F6CF8A", "#F2B36D"] },
  ];
  strings.forEach((s, si) => {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const x = 400 * t;
      const y = (1 - t) * (1 - t) * s.y0 + 2 * (1 - t) * t * s.y1 + t * t * s.y2;
      lanterns.push({ x: r1(x + (si ? 18 : 0)), y: r1(y + 9), c: s.colors[i % 3] });
    }
  });
  const rand = seeded(5);
  const buildings = Array.from({ length: 11 }, (_, i) => ({ x: i * 38 - 6, w: 34 + Math.round(rand() * 8), h: Math.round(60 + rand() * 70) }));
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C1829" />
          <stop offset="0.55" stopColor="#3A2236" />
          <stop offset="1" stopColor="#7A3A36" />
        </linearGradient>
        <radialGradient id={`${id}-lamp`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFD9A0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFD9A0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-street`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2A15E" stopOpacity="0" />
          <stop offset="1" stopColor="#F2A15E" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${id}-sky)`} />
      <g fill="#191321">
        {buildings.map((b, i) => (
          <rect key={i} x={b.x} y={250 - b.h} width={b.w} height={b.h} />
        ))}
      </g>
      <g fill="#F3B36A">
        {buildings.map((b, i) =>
          [0, 1, 2].map((row) =>
            (i + row) % 3 === 0 ? null : (
              <rect key={`${i}-${row}`} x={b.x + 8 + ((row * 7) % 14)} y={250 - b.h + 14 + row * 16} width="5" height="7" rx="1" opacity={0.35 + ((i * row) % 4) * 0.12} />
            ),
          ),
        )}
      </g>
      <rect y="170" width="400" height="80" fill={`url(#${id}-street)`} />
      <g stroke="#0E0B14" strokeOpacity="0.7" strokeWidth="1" fill="none">
        <path d="M0 34 Q200 106 400 40" />
        <path d="M18 78 Q218 162 418 84" />
      </g>
      <g className="scene-sway">
        {lanterns.map((l, i) => (
          <g key={i}>
            <circle cx={l.x} cy={l.y} r="18" fill={`url(#${id}-lamp)`} />
            <rect x={l.x - 6} y={l.y - 7} width="12" height="14" rx="5" fill={l.c} />
            <rect x={l.x - 3} y={l.y - 9} width="6" height="2.5" rx="1" fill="#2A1A1A" />
          </g>
        ))}
      </g>
      <path d="M0 236 H400 V250 H0Z" fill="#120D18" />
    </>
  );
}

const SCENES: Record<CategoryId, (p: SceneProps) => ReactElement> = {
  nature: NatureScene,
  ocean: OceanScene,
  space: SpaceScene,
  history: HistoryScene,
  science: ScienceScene,
  culture: CultureScene,
};

export function PosterArt({ category, className = "" }: { category: CategoryId; className?: string }) {
  const id = useSvgId("p");
  const Scene = SCENES[category];
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <Scene id={id} />
    </svg>
  );
}
