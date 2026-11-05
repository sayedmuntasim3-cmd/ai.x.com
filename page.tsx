import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

/* ==========================================================================
   Zupona AI — landing page
   Edit the settings below, then rebuild the static site (see tools/README.md).
   Brand colors live in tools/input.css; BRAND.md explains the whole system.
   ========================================================================== */

const BRAND = "Zupona AI";
const SHORT_NAME = "Zupona";

// Where "Start creating" and the prompt boxes send people.
// Empty = the studio is not live yet: buttons scroll to the prompt box and a short
// "opening soon" note appears on submit. Set it (e.g. "https://ai.zupona.com/studio")
// and the typed idea is sent there as ?prompt=...&format=...
const APP_URL = "";

// Your logo file inside /public, e.g. "/logo.svg". Empty = an empty logo slot is shown.
const LOGO_SRC = "";

const SITE_URL = "https://ai.zupona.com";
const TITLE = `${BRAND} — Type an idea. Get a finished video.`;
const DESCRIPTION = `Turn one sentence into a ready-to-post video. ${BRAND} does the research, script, voiceover, footage, captions and editing for you — for YouTube, TikTok and Reels.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: { type: "website", url: SITE_URL, siteName: BRAND, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const START_HREF = APP_URL || "#create";
const soonAttr = APP_URL ? {} : { "data-soon": "" };
const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const delay = (seconds: string) => ({ ["--d" as string]: seconds }) as CSSProperties;

/* ------------------------------------------------------------------ content */

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#faq", label: "FAQ" },
];

const examples = [
  { label: "Moon landing documentary", prompt: "A 2-minute documentary about the Moon landing, cinematic and emotional" },
  { label: "History of coffee", prompt: "The history of coffee in 60 seconds, for YouTube Shorts" },
  { label: "Credit scores, explained", prompt: "Explain how a credit score works — simple, friendly, 2 minutes" },
  { label: "Deep-sea facts", prompt: "3 surprising facts about the deep sea, as a 45-second TikTok" },
];

const formats = [
  { value: "16:9", hint: "YouTube", w: 14, h: 8, checked: true },
  { value: "9:16", hint: "Shorts", w: 8, h: 13, checked: false },
  { value: "1:1", hint: "Feed", w: 11, h: 11, checked: false },
];

const platforms = ["YouTube", "TikTok", "Instagram Reels", "YouTube Shorts", "Facebook", "LinkedIn", "X", "Snapchat"];

type SceneKind =
  | "earthrise"
  | "liftoff"
  | "journey"
  | "touchdown"
  | "step"
  | "rome"
  | "deepsea"
  | "credit"
  | "leaf"
  | "news"
  | "bakery"
  | "coffee";

const studioScenes: { kind: SceneKind; title: string; time: string; active?: boolean }[] = [
  { kind: "earthrise", title: "Earthrise", time: "0:00" },
  { kind: "liftoff", title: "Liftoff", time: "0:24" },
  { kind: "touchdown", title: "Touchdown", time: "1:18" },
  { kind: "step", title: "One small step", time: "1:42", active: true },
];

const timeline: { kind: SceneKind; grow: number }[] = [
  { kind: "earthrise", grow: 18 },
  { kind: "liftoff", grow: 20 },
  { kind: "journey", grow: 20 },
  { kind: "touchdown", grow: 18 },
  { kind: "step", grow: 24 },
];

type CrewStatus = "done" | "working" | "waiting";
const crew: { icon: IconName; role: string; detail: string; status: CrewStatus }[] = [
  { icon: "search", role: "Researcher", detail: "14 sources read", status: "done" },
  { icon: "pen", role: "Writer", detail: "Script ready · 312 words", status: "done" },
  { icon: "mic", role: "Narrator", detail: "Voiceover recorded", status: "done" },
  { icon: "film", role: "Editor", detail: "Placing shots · 64%", status: "working" },
  { icon: "shield", role: "Fact-checker", detail: "Up next", status: "waiting" },
];

const oldWay = [
  { text: "Research the topic for hours", tool: "20 browser tabs" },
  { text: "Write and rewrite the script", tool: "Docs" },
  { text: "Record the voice, again and again", tool: "Mic app" },
  { text: "Hunt for clips and check licenses", tool: "Stock sites" },
  { text: "Edit, add captions, export", tool: "Video editor" },
];

const zuponaDoes = ["Research", "Script", "Voiceover", "Footage", "Captions", "Editing", "1080p export"];

const useCases: { title: string; prompt: string; kind: SceneKind; format: "16:9" | "9:16" | "1:1"; length: string }[] = [
  { title: "YouTube documentaries", prompt: "The rise and fall of the Roman Empire, in 10 minutes", kind: "rome", format: "16:9", length: "10:00" },
  { title: "Shorts, Reels & TikTok", prompt: "3 surprising facts about the deep sea", kind: "deepsea", format: "9:16", length: "0:45" },
  { title: "Explainers", prompt: "How does a credit score actually work?", kind: "credit", format: "16:9", length: "2:00" },
  { title: "Lessons & courses", prompt: "Photosynthesis, explained for 8th graders", kind: "leaf", format: "16:9", length: "4:00" },
  { title: "News recaps", prompt: "This week in tech, in 90 seconds", kind: "news", format: "9:16", length: "1:30" },
  { title: "Brand stories", prompt: "The story of our family bakery, for our website", kind: "bakery", format: "1:1", length: "1:00" },
];

const faqs = [
  {
    q: `What is ${BRAND}?`,
    a: `An AI video studio. You describe a video in plain words, and ${SHORT_NAME} researches the topic, writes the script, records a voiceover, finds the footage, adds captions and edits it all together into one finished video.`,
  },
  {
    q: "Do I need any editing skills?",
    a: "No. If you can write a sentence, you can make a video. You can still change any scene, line or clip whenever you want to.",
  },
  {
    q: "What kinds of videos can I make?",
    a: "Documentaries, explainers, YouTube videos, Shorts, Reels, TikToks, lessons, news recaps and brand stories — in 16:9, 9:16 or 1:1.",
  },
  {
    q: "Can I post my videos on YouTube and social media?",
    a: `That's exactly what it's made for. ${SHORT_NAME} saves the license and credit for every clip it uses, so you always know where your footage came from and how to credit it.`,
  },
  {
    q: "How do I know the facts are right?",
    a: `${SHORT_NAME} researches from real sources and links every fact back to where it came from. An AI review team checks the script before you see it — and you can open every source yourself.`,
  },
  {
    q: "Is my work saved?",
    a: "Yes. Projects save automatically as you work, so you can close the tab and continue later, right where you left off.",
  },
  {
    q: "How do I get started?",
    a: `${BRAND} is opening in early access. Tap “Start creating”, type your idea, and you're on your way.`,
  },
];

const placeholderIdeas = examples.map((e) => e.prompt);

/* ------------------------------------------------------------------ icons */

type IconName =
  | "arrowRight"
  | "arrowUpRight"
  | "sparkle"
  | "check"
  | "x"
  | "menu"
  | "play"
  | "search"
  | "pen"
  | "mic"
  | "film"
  | "captions"
  | "shield"
  | "download"
  | "cloud"
  | "clock"
  | "eye"
  | "plus"
  | "frames"
  | "users";

const iconPaths: Record<IconName, ReactNode> = {
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  sparkle: (
    <>
      <path d="M12 2.5c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7Z" />
      <path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" />
    </>
  ),
  captions: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 11h3M12 11h5M7 15h6M15 15h2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.3 3 8.1 7 9.5 4-1.4 7-5.2 7-9.5V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  cloud: (
    <>
      <path d="M7 18.5h10a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.1 10.1 4.2 4.2 0 0 0 7 18.5Z" />
      <path d="m9.5 14 1.8 1.8 3.4-3.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  frames: (
    <>
      <rect x="2.5" y="7" width="12" height="9" rx="1.5" />
      <rect x="16.5" y="4" width="5" height="16" rx="1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M15.6 14.1A4.5 4.5 0 0 1 20.5 19" />
    </>
  ),
};

function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  const filled = name === "play" || name === "sparkle";
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ scene art
   Every "video frame" on the page is drawn with SVG, so the page needs no
   image files and stays sharp on every screen. Gradients are defined once. */

function SceneDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="z-space" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03040A" />
          <stop offset="1" stopColor="#121838" />
        </linearGradient>
        <radialGradient id="z-earth" cx="0.35" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#B9E6FF" />
          <stop offset="0.45" stopColor="#3B8EDB" />
          <stop offset="1" stopColor="#0B2A63" />
        </radialGradient>
        <radialGradient id="z-glow-blue">
          <stop offset="0" stopColor="#7CC4FF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7CC4FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="z-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9A9AA6" />
          <stop offset="0.5" stopColor="#55555F" />
          <stop offset="1" stopColor="#24242B" />
        </linearGradient>
        <radialGradient id="z-moon" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#F3F3F7" />
          <stop offset="0.55" stopColor="#A3A3B1" />
          <stop offset="1" stopColor="#3A3A47" />
        </radialGradient>
        <linearGradient id="z-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B1033" />
          <stop offset="0.45" stopColor="#40205F" />
          <stop offset="0.8" stopColor="#D9653B" />
          <stop offset="1" stopColor="#FFB46B" />
        </linearGradient>
        <linearGradient id="z-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF6C2" />
          <stop offset="0.35" stopColor="#FFB23F" />
          <stop offset="0.75" stopColor="#FF5A1F" />
          <stop offset="1" stopColor="#FF5A1F" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="z-sunset" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24102F" />
          <stop offset="0.45" stopColor="#8A2D5C" />
          <stop offset="0.78" stopColor="#F2733F" />
          <stop offset="1" stopColor="#FFC46B" />
        </linearGradient>
        <radialGradient id="z-sun">
          <stop offset="0" stopColor="#FFF1C1" />
          <stop offset="0.4" stopColor="#FFC15A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="z-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F6A86" />
          <stop offset="0.55" stopColor="#072C47" />
          <stop offset="1" stopColor="#020A16" />
        </linearGradient>
        <linearGradient id="z-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1C1247" />
          <stop offset="0.6" stopColor="#4B32B8" />
          <stop offset="1" stopColor="#8B6CFF" />
        </linearGradient>
        <linearGradient id="z-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0C2E22" />
          <stop offset="0.6" stopColor="#17603F" />
          <stop offset="1" stopColor="#4FB874" />
        </linearGradient>
        <linearGradient id="z-news" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0A0E22" />
          <stop offset="1" stopColor="#17204A" />
        </linearGradient>
        <linearGradient id="z-warm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A140C" />
          <stop offset="0.55" stopColor="#8A4320" />
          <stop offset="1" stopColor="#E89A4C" />
        </linearGradient>
        <linearGradient id="z-gauge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FF6B4A" />
          <stop offset="0.5" stopColor="#FFC54D" />
          <stop offset="1" stopColor="#C8FF3D" />
        </linearGradient>
        <radialGradient id="z-vignette" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <pattern id="z-dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="#fff" fillOpacity="0.14" />
        </pattern>
      </defs>
    </svg>
  );
}

const stars: [number, number, number, number][] = [
  [8, 6, 0.5, 0.8], [22, 14, 0.4, 0.5], [35, 5, 0.6, 0.9], [48, 18, 0.35, 0.6], [60, 8, 0.5, 0.7],
  [74, 22, 0.4, 0.5], [88, 10, 0.6, 0.85], [101, 4, 0.35, 0.6], [140, 12, 0.5, 0.7], [152, 26, 0.4, 0.6],
  [14, 30, 0.35, 0.5], [30, 40, 0.5, 0.6], [66, 34, 0.35, 0.5], [92, 30, 0.4, 0.55], [148, 44, 0.35, 0.5],
  [5, 48, 0.4, 0.6], [52, 46, 0.3, 0.4], [118, 8, 0.4, 0.6], [132, 36, 0.3, 0.45], [80, 44, 0.35, 0.4],
];

function Stars() {
  return (
    <g fill="#fff">
      {stars.map(([x, y, r, o], i) => (
        <circle key={i} cx={x} cy={y} r={r} opacity={o} />
      ))}
    </g>
  );
}

const footprints: [number, number][] = [[118, 84], [111, 80], [104, 77], [98, 73.5], [92, 70.5], [86.5, 67.8], [81, 65.5]];

const art: Record<SceneKind, ReactNode> = {
  earthrise: (
    <>
      <rect width="160" height="90" fill="url(#z-space)" />
      <Stars />
      <circle cx="108" cy="56" r="28" fill="url(#z-glow-blue)" />
      <circle cx="108" cy="56" r="16" fill="url(#z-earth)" />
      <path d="M97 50c4-3 8-2 11 0s7 3 11-1M99 59c3 2 7 2 10 0" stroke="#fff" strokeOpacity=".6" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M0 66Q80 50 160 64V90H0Z" fill="url(#z-ground)" />
      <ellipse cx="34" cy="76" rx="11" ry="2.4" fill="#000" fillOpacity=".25" />
      <ellipse cx="122" cy="82" rx="15" ry="3" fill="#000" fillOpacity=".22" />
      <ellipse cx="78" cy="70" rx="6" ry="1.4" fill="#000" fillOpacity=".2" />
    </>
  ),
  liftoff: (
    <>
      <rect width="160" height="90" fill="url(#z-dusk)" />
      <g fill="#fff">
        <circle cx="30" cy="10" r=".5" opacity=".7" />
        <circle cx="128" cy="14" r=".45" opacity=".6" />
        <circle cx="104" cy="6" r=".4" opacity=".5" />
      </g>
      <g fill="#150D27">
        <rect x="58" y="28" width="3" height="56" />
        <rect x="58" y="34" width="14" height="1.5" />
        <rect x="58" y="48" width="14" height="1.5" />
        <rect x="58" y="62" width="14" height="1.5" />
      </g>
      <path d="M80 14c3 4 4 9 4 14v26h-8V28c0-5 1-10 4-14Z" fill="#F2F2F7" />
      <rect x="76" y="40" width="8" height="2" fill="#C8C8D4" />
      <path d="M76 46l-5 9 5-2ZM84 46l5 9-5-2Z" fill="#C8C8D4" />
      <circle cx="80" cy="30" r="1.6" fill="#3B8EDB" />
      <path d="M76.5 54C77 63 78.5 70 80 78c1.5-8 3-15 3.5-24Z" fill="url(#z-flame)" />
      <g fill="#EDE6F2">
        <circle cx="62" cy="82" r="11" opacity=".9" />
        <circle cx="80" cy="86" r="13" />
        <circle cx="98" cy="83" r="11" opacity=".9" />
        <circle cx="48" cy="86" r="9" opacity=".75" />
        <circle cx="113" cy="87" r="9" opacity=".75" />
        <circle cx="71" cy="76" r="7" opacity=".8" />
        <circle cx="90" cy="77" r="7" opacity=".8" />
      </g>
    </>
  ),
  journey: (
    <>
      <rect width="160" height="90" fill="url(#z-space)" />
      <Stars />
      <circle cx="26" cy="68" r="16" fill="url(#z-glow-blue)" />
      <circle cx="26" cy="68" r="9" fill="url(#z-earth)" />
      <circle cx="128" cy="30" r="19" fill="url(#z-moon)" />
      <circle cx="122" cy="26" r="3" fill="#000" fillOpacity=".12" />
      <circle cx="134" cy="36" r="4" fill="#000" fillOpacity=".1" />
      <circle cx="126" cy="38" r="2" fill="#000" fillOpacity=".12" />
      <path d="M34 62Q70 18 108 34" stroke="#C8FF3D" strokeWidth=".9" strokeDasharray="2 2.5" fill="none" strokeLinecap="round" />
      <circle cx="84" cy="30" r="5" fill="#C8FF3D" fillOpacity=".18" />
      <circle cx="84" cy="30" r="1.6" fill="#fff" />
    </>
  ),
  touchdown: (
    <>
      <rect width="160" height="90" fill="url(#z-space)" />
      <Stars />
      <circle cx="132" cy="20" r="13" fill="url(#z-glow-blue)" />
      <circle cx="132" cy="20" r="7" fill="url(#z-earth)" />
      <path d="M0 62Q80 54 160 64V90H0Z" fill="url(#z-ground)" />
      <ellipse cx="80" cy="74" rx="30" ry="3.2" fill="#000" fillOpacity=".35" />
      <path d="M68 58 58 73M92 58l10 15M72 60l-4 13M88 60l4 13" stroke="#B9B9C6" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="58" cy="73" rx="3" ry="1" fill="#B9B9C6" />
      <ellipse cx="102" cy="73" rx="3" ry="1" fill="#B9B9C6" />
      <path d="M66 50h28l-3 10H69Z" fill="#D9A93A" />
      <path d="M66 50h28l-1 3H67Z" fill="#F2C75C" />
      <path d="M70 37h20l3 13H67Z" fill="#CFCFDA" />
      <path d="M75 40h7l-1 5h-6Z" fill="#23232E" />
      <rect x="84" y="31" width="1" height="6" fill="#CFCFDA" />
    </>
  ),
  step: (
    <>
      <rect width="160" height="90" fill="url(#z-space)" />
      <Stars />
      <circle cx="124" cy="22" r="20" fill="url(#z-glow-blue)" />
      <circle cx="124" cy="22" r="10" fill="url(#z-earth)" />
      <path d="M117 19c3-2 6-1 8 0s5 2 7-1M119 26c2 1 5 1 7-.5" stroke="#fff" strokeOpacity=".6" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M0 58Q70 48 160 55V90H0Z" fill="url(#z-ground)" />
      <ellipse cx="22" cy="72" rx="12" ry="2.6" fill="#000" fillOpacity=".22" />
      <ellipse cx="140" cy="68" rx="9" ry="2" fill="#000" fillOpacity=".2" />
      <ellipse cx="100" cy="85" rx="16" ry="3" fill="#000" fillOpacity=".18" />
      <g fill="#1E1E26" fillOpacity=".75">
        {footprints.map(([x, y], i) => (
          <ellipse key={i} cx={x + (i % 2 ? 1.8 : -1.8)} cy={y} rx="2.4" ry="1.05" transform={`rotate(-24 ${x} ${y})`} />
        ))}
      </g>
      <rect x="47.5" y="27" width=".9" height="36" fill="#E6E6EE" />
      <rect x="48.4" y="28" width="19.6" height="11.2" fill="#EEEEF3" />
      <g fill="#C63A44">
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <rect key={k} x="48.4" y={28 + k * 1.6} width="19.6" height=".8" />
        ))}
      </g>
      <rect x="48.4" y="28" width="8" height="6" fill="#2C3D8F" />
      <rect x="47.9" y="27" width="20.1" height="1" fill="#E6E6EE" />
      <ellipse cx="70" cy="65.6" rx="7" ry="1.4" fill="#000" fillOpacity=".35" />
      <rect x="62.2" y="47.5" width="3.4" height="7.5" rx="1" fill="#D3D3DD" />
      <rect x="65" y="56" width="2.6" height="9" rx="1.2" fill="#E7E7EF" />
      <rect x="68.6" y="56" width="2.6" height="9" rx="1.2" fill="#E7E7EF" transform="rotate(-12 69.9 56)" />
      <rect x="64.5" y="47" width="7" height="10" rx="2.6" fill="#F3F3F8" />
      <rect x="70.5" y="48.5" width="2.2" height="7" rx="1.1" fill="#E7E7EF" transform="rotate(-25 71.6 48.5)" />
      <circle cx="68" cy="44.2" r="3.6" fill="#F3F3F8" />
      <ellipse cx="69.3" cy="44.4" rx="2.1" ry="1.9" fill="#D8A73A" />
      <ellipse cx="68.8" cy="43.7" rx=".7" ry=".5" fill="#fff" fillOpacity=".7" />
      <rect width="160" height="90" fill="url(#z-vignette)" />
    </>
  ),
  rome: (
    <>
      <rect width="160" height="90" fill="url(#z-sunset)" />
      <circle cx="80" cy="60" r="26" fill="url(#z-sun)" />
      <g fill="#1B0C20">
        <path d="M28 38 80 22l52 16Z" />
        <rect x="30" y="38" width="100" height="4" />
        {[34, 46.5, 59, 71.5, 84, 96.5, 109, 121.5].map((x) => (
          <rect key={x} x={x} y="42" width="5" height="26" />
        ))}
        <rect x="26" y="68" width="108" height="3" />
        <rect x="22" y="71" width="116" height="3" />
        <rect x="0" y="74" width="160" height="16" />
      </g>
      <path d="M40 18q2-2 4 0q2-2 4 0M52 12q1.5-1.5 3 0q1.5-1.5 3 0M112 16q1.5-1.5 3 0q1.5-1.5 3 0" stroke="#1B0C20" strokeWidth=".7" fill="none" />
    </>
  ),
  deepsea: (
    <>
      <rect width="90" height="160" fill="url(#z-sea)" />
      <path d="M18 0h12l26 160H30Z" fill="#fff" fillOpacity=".05" />
      <path d="M52 0h8l20 160H64Z" fill="#fff" fillOpacity=".04" />
      <circle cx="45" cy="70" r="26" fill="#5CF2E0" fillOpacity=".12" />
      <path d="M30 72c0-11 7-18 15-18s15 7 15 18c-4 2-26 2-30 0Z" fill="#5CF2E0" fillOpacity=".85" />
      <g stroke="#5CF2E0" strokeOpacity=".55" strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M34 74c-2 7 2 12 0 19s2 12 0 18" />
        <path d="M40 75c-1 8 2 13 0 21s1 11 0 16" />
        <path d="M46 75c1 7-2 13 0 20s-1 12 0 17" />
        <path d="M52 75c2 7-1 12 1 19s-1 11 1 15" />
        <path d="M57 74c2 6 0 11 2 17" />
      </g>
      <g fill="none" stroke="#fff" strokeOpacity=".35">
        <circle cx="20" cy="40" r="2" />
        <circle cx="24" cy="30" r="1.2" />
        <circle cx="68" cy="52" r="1.6" />
        <circle cx="72" cy="38" r="1" />
        <circle cx="64" cy="110" r="1.4" />
      </g>
      <path d="M0 148Q45 136 90 150V160H0Z" fill="#03101D" />
    </>
  ),
  credit: (
    <>
      <rect width="160" height="90" fill="url(#z-violet)" />
      <rect width="160" height="90" fill="url(#z-dots)" />
      <path d="M50 64a30 30 0 0 1 60 0" stroke="#fff" strokeOpacity=".15" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M50 64a30 30 0 0 1 60 0" stroke="url(#z-gauge)" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray="72 200" />
      <path d="M80 64 99 47" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="80" cy="64" r="3.2" fill="#fff" />
      <text x="80" y="82" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">742 · Good</text>
    </>
  ),
  leaf: (
    <>
      <rect width="160" height="90" fill="url(#z-leaf)" />
      <circle cx="128" cy="20" r="22" fill="url(#z-sun)" />
      <circle cx="128" cy="20" r="7" fill="#FFE79A" />
      <path d="M38 72C38 44 64 26 104 26c0 32-22 50-58 50-3 0-6-1-8-4Z" fill="#8EE08A" />
      <path d="M42 72C62 58 80 44 102 28" stroke="#1F6B43" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M58 61l-2-12M70 52l-1-13M82 43l1-10M64 57l12 3M77 47l12 2" stroke="#1F6B43" strokeWidth="1" strokeLinecap="round" />
      <text x="16" y="24" fontSize="8" fontWeight="700" fill="#fff" fillOpacity=".85">CO₂</text>
      <text x="126" y="76" fontSize="8" fontWeight="700" fill="#fff" fillOpacity=".85">O₂</text>
    </>
  ),
  news: (
    <>
      <rect width="90" height="160" fill="url(#z-news)" />
      <rect width="90" height="160" fill="url(#z-dots)" />
      <circle cx="45" cy="66" r="30" fill="#5CF2E0" fillOpacity=".1" />
      <path
        d="M36 45v5M42 45v5M48 45v5M54 45v5M36 82v5M42 82v5M48 82v5M54 82v5M24 57h5M24 63h5M24 69h5M24 75h5M61 57h5M61 63h5M61 69h5M61 75h5"
        stroke="#5CF2E0"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="29" y="50" width="32" height="32" rx="5" fill="#0D1330" stroke="#5CF2E0" strokeWidth="1.2" />
      <rect x="37" y="58" width="16" height="16" rx="2" fill="#5CF2E0" fillOpacity=".25" stroke="#5CF2E0" strokeWidth=".8" />
      <rect x="6" y="104" width="22" height="9" rx="2" fill="#FF6B4A" />
      <text x="17" y="110.6" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#fff">LIVE</text>
      <rect x="0" y="116" width="90" height="20" fill="#C8FF3D" />
      <text x="6" y="128.5" fontSize="6.6" fontWeight="800" fill="#07070B">THIS WEEK IN TECH</text>
      <rect x="0" y="136" width="90" height="10" fill="#07070B" fillOpacity=".8" />
      <text x="6" y="143" fontSize="4.6" fill="#fff" fillOpacity=".8">5 stories · 90 seconds</text>
    </>
  ),
  bakery: (
    <>
      <rect width="90" height="90" fill="url(#z-warm)" />
      <circle cx="64" cy="26" r="30" fill="url(#z-sun)" opacity=".7" />
      <text x="45" y="22" textAnchor="middle" fontSize="5" letterSpacing="1.2" fontWeight="600" fill="#FFF3DF" fillOpacity=".8">OUR STORY</text>
      <path d="M20 62c0-12 11-20 25-20s25 8 25 20c0 3-2 5-5 5H25c-3 0-5-2-5-5Z" fill="#F2C27B" />
      <path d="M32 52l6-6M42 50l6-6M52 52l6-6" stroke="#B8732F" strokeWidth="1.6" strokeLinecap="round" />
      <text x="45" y="81" textAnchor="middle" fontSize="10" fill="#FFF3DF" fontStyle="italic" fontFamily="'Instrument Serif', Georgia, serif">
        Since 1987
      </text>
    </>
  ),
  coffee: (
    <>
      <rect width="90" height="160" fill="url(#z-warm)" />
      <circle cx="45" cy="70" r="34" fill="url(#z-sun)" opacity=".5" />
      <path d="M38 74c-3-4 3-7 0-11M45 72c-3-4 3-7 0-11M52 74c-3-4 3-7 0-11" stroke="#FFF3DF" strokeOpacity=".7" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M60 86h4a6 6 0 0 1 0 12h-4" stroke="#F6EBDD" strokeWidth="2.4" fill="none" />
      <path d="M30 82h30v14a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12Z" fill="#F6EBDD" />
      <ellipse cx="45" cy="82" rx="15" ry="2.6" fill="#5A2E14" />
      <ellipse cx="45" cy="110" rx="24" ry="3" fill="#000" fillOpacity=".25" />
      <text x="45" y="134" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">THE HISTORY</text>
      <text x="45" y="144" textAnchor="middle" fontSize="8" fontWeight="800" fill="#C8FF3D">OF COFFEE</text>
    </>
  ),
};

function Scene({ kind, className = "" }: { kind: SceneKind; className?: string }) {
  const viewBox = kind === "deepsea" || kind === "news" || kind === "coffee" ? "0 0 90 160" : kind === "bakery" ? "0 0 90 90" : "0 0 160 90";
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      {art[kind]}
    </svg>
  );
}

/* ------------------------------------------------------------------ small parts */

function Logo({ className = "size-9" }: { className?: string }) {
  if (LOGO_SRC) return <img src={LOGO_SRC} alt="" className={`${className} shrink-0 rounded-xl object-contain`} />;
  // Empty logo slot. Set LOGO_SRC at the top of this file to show your logo here.
  return <span aria-hidden="true" className={`${className} block shrink-0 rounded-xl border border-dashed border-white/25 bg-white/[0.03]`} />;
}

function BrandMark({ big = false }: { big?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo className={big ? "size-10" : "size-9"} />
      <span className="flex items-center gap-1.5">
        <span className="text-[17px] font-semibold tracking-tight text-cloud">{SHORT_NAME}</span>
        <span className="rounded-md bg-volt/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-volt ring-1 ring-inset ring-volt/25">AI</span>
      </span>
    </span>
  );
}

function Accent({ children }: { children: ReactNode }) {
  return <em className="text-aurora pr-[0.08em] font-serif text-[1.06em] font-normal italic tracking-[-0.01em]">{children}</em>;
}

function SectionHeader({ eyebrow, title, accent, text, center = true }: { eyebrow: string; title: string; accent: string; text?: string; center?: boolean }) {
  return (
    <div className={`reveal ${center ? "mx-auto max-w-4xl text-center" : "max-w-xl"}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-5 text-balance text-[2.3rem] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-5xl lg:text-[3.6rem]">
        {title} <br className="hidden sm:inline" />
        <Accent>{accent}</Accent>
      </h2>
      {text ? <p className={`mt-5 text-pretty text-base leading-relaxed text-mist sm:text-lg ${center ? "mx-auto max-w-2xl" : ""}`}>{text}</p> : null}
    </div>
  );
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-5 place-items-center rounded-full bg-volt/15 text-volt">
        <Icon name="check" className="size-3" />
      </span>
      {children}
    </span>
  );
}

function Waveform({ bars = 36, phoneBars, className = "", color = "bg-volt" }: { bars?: number; phoneBars?: number; className?: string; color?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const height = 18 + Math.round(82 * Math.abs(Math.sin(i * 0.82) * Math.cos(i * 0.29 + 0.6)));
        const phoneHidden = phoneBars !== undefined && i >= phoneBars ? "max-sm:hidden" : "";
        return (
          <span
            key={i}
            className={`wave-bar min-w-[2px] flex-1 rounded-full ${color} ${phoneHidden}`}
            style={{ height: `${height}%`, animationDelay: `${(-((i * 0.17) % 1.3)).toFixed(2)}s` }}
          />
        );
      })}
    </div>
  );
}

function Ratio({ w, h }: { w: number; h: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-[3px] border-[1.5px] border-current" style={{ width: w, height: h }} />;
}

function StatusDot({ status }: { status: CrewStatus }) {
  if (status === "done")
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-volt/15 text-volt">
        <Icon name="check" className="size-3" />
      </span>
    );
  if (status === "working") return <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-aqua/25 border-t-aqua" />;
  return <span className="mx-1.5 size-2 shrink-0 rounded-full bg-white/20" />;
}

/* ------------------------------------------------------------------ studio preview */

function StudioMock() {
  return (
    <div className="relative mx-auto mt-12 w-full max-w-6xl px-3 sm:mt-16 sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[8%] top-[6%] bottom-[10%] -z-10 rounded-full bg-ultra/25 blur-[100px]" />

      <div className="tilt-in relative" role="img" aria-label={`Preview of ${BRAND} making a documentary about the Moon landing: research, script, voiceover and editing done by an AI crew.`}>
        {/* floating: the prompt */}
        <div aria-hidden="true" className="animate-float absolute -left-12 -top-20 z-20 hidden w-64 rounded-2xl border border-white/10 bg-ink/90 p-4 text-left shadow-2xl shadow-black/60 backdrop-blur-xl xl:block">
          <p className="flex items-center gap-2 text-[11px] font-medium text-mist">
            <span className="bg-aurora grid size-5 place-items-center rounded-full text-night">
              <Icon name="sparkle" className="size-3" />
            </span>
            Your prompt
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-cloud">“A 2-minute documentary about the Moon landing — cinematic and emotional.”</p>
          <div className="mt-3 flex gap-1.5">
            <span className="chip px-2 py-0.5 text-[10px]">16:9</span>
            <span className="chip px-2 py-0.5 text-[10px]">2 min</span>
            <span className="chip px-2 py-0.5 text-[10px]">English</span>
          </div>
        </div>

        {/* floating: the voice */}
        <div aria-hidden="true" className="animate-float-late absolute -right-10 bottom-24 z-20 hidden w-60 rounded-2xl border border-white/10 bg-ink/90 p-4 text-left shadow-2xl shadow-black/60 backdrop-blur-xl xl:block">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-volt text-night">
              <Icon name="play" className="size-4 translate-x-px" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-cloud">Voiceover · Ava</p>
              <p className="text-[11px] text-mist">Warm narrator · 2:15</p>
            </div>
          </div>
          <Waveform bars={30} className="mt-3 h-8" />
        </div>

        <div aria-hidden="true" className="overflow-hidden rounded-[20px] border border-white/10 bg-ink/90 text-left shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] backdrop-blur sm:rounded-[28px]">
          {/* title bar */}
          <div className="flex h-11 items-center gap-3 border-b border-white/[0.07] px-4 sm:h-12 sm:px-5">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs text-mist sm:text-[13px]">
              <Icon name="film" className="size-3.5 shrink-0" />
              <span className="truncate">
                <span className="text-cloud">The Moon Landing</span> · Documentary · 2:15
              </span>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-volt px-3 py-1 text-[11px] font-semibold text-night sm:inline-flex">
              <Icon name="download" className="size-3" /> Export
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)] lg:grid-cols-[164px_minmax(0,1fr)_250px]">
            {/* scenes */}
            <div className="hidden border-r border-white/[0.07] p-3 md:block">
              <p className="px-1 pb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-mist/70">Scenes</p>
              <ul className="space-y-2">
                {studioScenes.map((s, i) => (
                  <li key={s.title} className={`rounded-xl p-1.5 ${s.active ? "bg-white/[0.06] ring-1 ring-volt/60" : ""}`}>
                    <div className="aspect-video overflow-hidden rounded-lg">
                      <Scene kind={s.kind} className="size-full" />
                    </div>
                    <p className="mt-1.5 flex items-center justify-between gap-2 px-0.5 text-[10.5px]">
                      <span className={`truncate ${s.active ? "text-cloud" : "text-cloud/70"}`}>
                        {String(i + 1).padStart(2, "0")} {s.title}
                      </span>
                      <span className="text-mist/60">{s.time}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* preview */}
            <div className="p-3 sm:p-5">
              <div className="relative aspect-video overflow-hidden rounded-xl sm:rounded-2xl">
                <Scene kind="step" className="absolute inset-0 size-full" />
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur sm:left-4 sm:top-4 sm:text-[11px]">
                  <span className="size-1.5 animate-pulse rounded-full bg-flare" /> Scene 04 · One small step
                </div>
                <div className="absolute inset-x-0 bottom-3 flex justify-center px-4 sm:bottom-6">
                  <p className="max-w-[92%] text-balance text-center text-[13px] font-bold leading-snug text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.85)] sm:text-xl lg:text-2xl">
                    July 1969. An estimated <span className="rounded-md bg-volt px-1.5 text-night [text-shadow:none]">600 million</span> people watched one small step.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 sm:mt-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-night">
                  <Icon name="play" className="size-3.5 translate-x-px" />
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="bg-aurora absolute inset-y-0 left-0 w-[76%] rounded-full" />
                </div>
                <span className="text-[11px] tabular-nums text-mist">1:42 / 2:15</span>
              </div>
            </div>

            {/* AI crew */}
            <div className="hidden border-l border-white/[0.07] p-4 lg:block">
              <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-mist/70">
                <span>AI crew</span>
                <span className="normal-case tracking-normal text-volt">3 of 5 done</span>
              </p>
              <ul className="mt-3 space-y-2">
                {crew.map((c) => (
                  <li key={c.role} className={`rounded-xl border p-2.5 ${c.status === "working" ? "border-aqua/30 bg-aqua/[0.05]" : "border-white/[0.06] bg-white/[0.02]"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-cloud/80">
                        <Icon name={c.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-cloud">{c.role}</p>
                        <p className="truncate text-[11px] text-mist">{c.detail}</p>
                      </div>
                      <StatusDot status={c.status} />
                    </div>
                    {c.status === "working" ? (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="shimmer h-full w-[64%] rounded-full bg-aqua" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AI crew, compact (phones and tablets) */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-white/[0.07] px-3 py-3 sm:px-5 lg:hidden">
            {crew.map((c) => (
              <span key={c.role} className={`chip shrink-0 gap-2 py-1.5 pl-2 ${c.status === "working" ? "border-aqua/30 text-cloud" : ""}`}>
                <StatusDot status={c.status} />
                {c.role}
              </span>
            ))}
          </div>

          {/* timeline */}
          <div className="border-t border-white/[0.07] px-3 py-3 sm:px-5 sm:py-4">
            <div className="flex gap-3">
              <div className="hidden w-14 shrink-0 flex-col gap-2 text-[10px] text-mist/70 sm:flex">
                <span className="h-7 leading-7">Video</span>
                <span className="h-6 leading-6">Voice</span>
                <span className="h-4 leading-4">Captions</span>
              </div>
              <div className="relative flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex h-7 gap-1">
                  {timeline.map((t, i) => (
                    <div key={i} className="relative overflow-hidden rounded-md ring-1 ring-white/10" style={{ flexGrow: t.grow, flexBasis: 0 }}>
                      <Scene kind={t.kind} className="absolute inset-0 size-full" />
                    </div>
                  ))}
                </div>
                <Waveform bars={90} phoneBars={48} className="h-6" color="bg-aqua/70" />
                <div className="flex h-4 gap-1">
                  {[7, 11, 9, 6, 12, 8, 10, 7, 9, 11].map((g, i) => (
                    <span key={i} className="rounded-sm bg-white/[0.12]" style={{ flexGrow: g, flexBasis: 0 }} />
                  ))}
                </div>
                <div className="absolute -bottom-1 -top-1 left-[76%] w-px bg-volt shadow-[0_0_12px_rgba(200,255,61,0.9)]">
                  <span className="absolute -left-[4px] -top-1 size-[9px] rounded-full bg-volt" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function ZuponaAiLandingPage() {
  return (
    <div className="relative overflow-x-clip">
      <SceneDefs />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-volt focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-night">
        Skip to content
      </a>

      {/* ============================== header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-night/70 backdrop-blur-xl">
        <div className={`${wrap} flex h-16 items-center justify-between gap-4`}>
          <a href="#top" aria-label={`${BRAND} home`} className="shrink-0">
            <BrandMark />
          </a>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="rounded-full px-4 py-2 text-sm text-mist transition hover:bg-white/[0.05] hover:text-cloud">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {APP_URL ? (
              <a href={APP_URL} className="hidden rounded-full px-3 py-2 text-sm text-mist transition hover:text-cloud sm:inline-block">
                Log in
              </a>
            ) : null}
            <a href={START_HREF} className="btn-volt h-10 px-4 text-sm">
              <span>
                Start<span className="hidden min-[385px]:inline"> creating</span>
              </span>
            </a>
            <details data-menu className="group relative lg:hidden">
              <summary aria-label="Menu" className="grid size-10 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cloud transition hover:bg-white/[0.08]">
                <Icon name="menu" className="size-5 group-open:hidden" />
                <Icon name="x" className="hidden size-5 group-open:block" />
              </summary>
              <div className="absolute right-0 top-[calc(100%+12px)] w-[min(86vw,320px)] rounded-2xl border border-white/10 bg-ink/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
                {navLinks.map((l) => (
                  <a key={l.href} href={l.href} className="flex items-center justify-between rounded-xl px-4 py-3 text-[15px] text-cloud transition hover:bg-white/[0.05]">
                    {l.label}
                    <Icon name="arrowRight" className="size-4 text-mist" />
                  </a>
                ))}
                <a href={START_HREF} className="btn-volt mt-2 h-12 w-full text-[15px]">
                  Start creating <Icon name="arrowRight" className="size-4" />
                </a>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ============================== hero */}
        <section id="top" className="relative isolate pb-20 sm:pb-28">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1200px] overflow-hidden">
            <div className="bg-grid absolute inset-0" />
            <div className="absolute left-1/2 top-[-340px] h-[680px] w-[1000px] max-w-none -translate-x-1/2 rounded-full bg-ultra/30 blur-[130px]" />
            <div className="animate-drift absolute left-[4%] top-[180px] size-[340px] rounded-full bg-aqua/[0.13] blur-[110px]" />
            <div className="animate-drift-late absolute right-[2%] top-[300px] size-[300px] rounded-full bg-volt/[0.1] blur-[110px]" />
            <div className="noise absolute inset-0" />
          </div>

          <div className={`${wrap} pt-12 text-center sm:pt-16 lg:pt-20`}>
            <a
              href="#features"
              className="hero-in group inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 text-[13px] text-mist backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <span className="rounded-full bg-volt px-2 py-0.5 text-[11px] font-semibold text-night">New</span>
              <span className="truncate">
                <span className="font-medium text-cloud">Documentary mode</span>
                <span className="hidden sm:inline"> · a researched film from one sentence</span>
              </span>
              <Icon name="arrowRight" className="size-3.5 shrink-0 transition group-hover:translate-x-0.5" />
            </a>

            <h1 className="hero-in mx-auto mt-7 max-w-5xl text-[2.85rem] font-semibold leading-[1] tracking-[-0.045em] sm:text-7xl sm:leading-[0.98] lg:text-[5.6rem]" style={delay(".08s")}>
              Type an idea.
              <br />
              Get a{" "}
              <span className="whitespace-nowrap">
                <Accent>finished video.</Accent>
              </span>
            </h1>

            <p className="hero-in mx-auto mt-6 max-w-[46rem] text-pretty text-[17px] leading-relaxed text-mist sm:text-xl" style={delay(".16s")}>
              Describe your video in one sentence. {BRAND} does the research, script, voiceover, footage and captions — and hands you a video that’s ready to post.
            </p>

            <form id="create" action={APP_URL || "#create"} method="get" {...soonAttr} className="hero-in mx-auto mt-10 w-full max-w-3xl text-left" style={delay(".24s")}>
              <div className="prompt-shell">
                <div className="prompt-inner p-3 sm:p-4">
                  <label htmlFor="prompt" className="sr-only">
                    Describe your video
                  </label>
                  <textarea
                    id="prompt"
                    name="prompt"
                    rows={2}
                    required
                    placeholder={placeholderIdeas[0]}
                    className="block w-full resize-none bg-transparent px-2 pt-1 text-base leading-relaxed text-cloud placeholder:text-mist/60 sm:text-lg"
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <fieldset className="flex flex-wrap gap-1.5">
                      <legend className="sr-only">Video format</legend>
                      {formats.map((f) => (
                        <label key={f.value} className="cursor-pointer">
                          <input type="radio" name="format" value={f.value} defaultChecked={f.checked} className="peer sr-only" />
                          <span className="chip transition hover:text-cloud peer-checked:border-volt/50 peer-checked:bg-volt/10 peer-checked:text-volt peer-focus-visible:ring-2 peer-focus-visible:ring-volt">
                            <Ratio w={f.w} h={f.h} />
                            {f.value}
                            <span className="hidden text-mist/70 sm:inline">· {f.hint}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <button type="submit" className="btn-volt h-12 px-6 text-[15px]">
                      Create video <Icon name="arrowRight" className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
              <p data-note hidden className="mt-4 text-center text-sm text-aqua">
                The studio is opening very soon — we’re adding the final touches. Check back shortly!
              </p>
            </form>

            <div className="hero-in mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2" style={delay(".32s")}>
              <span className="text-xs text-mist/70">Try:</span>
              {examples.map((e) => (
                <button key={e.label} type="button" data-prompt={e.prompt} className="chip transition hover:border-white/25 hover:text-cloud">
                  {e.label}
                </button>
              ))}
            </div>

            <div className="hero-in mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-mist" style={delay(".4s")}>
              <Tick>No editing skills needed</Tick>
              <Tick>Export in 1080p</Tick>
              <Tick>Every source credited</Tick>
            </div>
          </div>

          <StudioMock />
        </section>

        {/* ============================== platforms */}
        <section aria-label="Platforms" className="border-y border-white/[0.06] bg-ink/60 py-9">
          <p className="px-5 text-center text-xs font-medium uppercase tracking-[0.22em] text-mist/70">Ready to post on every platform</p>
          <div className="fade-x mt-6 overflow-hidden">
            <div className="animate-marquee flex w-max items-center gap-14 pr-14">
              {[...platforms, ...platforms].map((p, i) => (
                <span key={i} aria-hidden={i >= platforms.length ? "true" : undefined} className="whitespace-nowrap text-xl font-semibold tracking-tight text-white/35 sm:text-2xl">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ============================== why */}
        <section id="why" className="py-24 sm:py-32">
          <div className={wrap}>
            <SectionHeader
              eyebrow={`Why ${SHORT_NAME}`}
              title="Five apps and a weekend."
              accent="Or one sentence."
              text="Making a good video used to mean doing ten jobs yourself. Now you only do the fun part — the idea."
            />

            <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
              <div className="reveal card p-6 sm:p-8">
                <p className="flex items-center gap-2 text-sm font-medium text-mist">
                  <span className="size-2 rounded-full bg-white/25" /> The old way
                </p>
                <ul className="mt-6 space-y-2.5">
                  {oldWay.map((o) => (
                    <li key={o.text} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[15px] text-mist">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-flare/10 text-flare">
                        <Icon name="x" className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">{o.text}</span>
                      <span className="hidden shrink-0 text-xs text-mist/60 sm:inline">{o.tool}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-5 text-sm">
                  <span className="text-mist">Your effort</span>
                  <span className="font-semibold text-cloud">Days of work · 5+ apps</span>
                </div>
              </div>

              <div className="reveal relative overflow-hidden rounded-3xl border border-volt/30 bg-gradient-to-b from-volt/[0.08] to-surface/60 p-6 shadow-[0_0_80px_-30px_rgba(200,255,61,0.35)] sm:p-8">
                <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-volt/10 blur-3xl" />
                <p className="relative flex items-center gap-2 text-sm font-medium text-volt">
                  <Icon name="sparkle" className="size-4" /> With {BRAND}
                </p>
                <div className="panel relative mt-6 p-4 sm:p-5">
                  <p className="text-xs text-mist">You type</p>
                  <p className="mt-1.5 text-lg font-medium leading-snug text-cloud sm:text-xl">
                    “Make a 2-minute video about the Moon landing.”
                    <span className="animate-caret ml-1 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-volt" />
                  </p>
                </div>
                <p className="relative mt-6 text-xs text-mist">{SHORT_NAME} does</p>
                <div className="relative mt-3 flex flex-wrap gap-2">
                  {zuponaDoes.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-volt/25 bg-volt/[0.08] px-3 py-1.5 text-sm text-cloud">
                      <Icon name="check" className="size-3.5 text-volt" />
                      {t}
                    </span>
                  ))}
                </div>
                <div className="relative mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5 text-sm">
                  <span className="text-mist">Your effort</span>
                  <span className="font-semibold text-volt">One sentence · One place</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================== how it works */}
        <section id="how-it-works" className="border-y border-white/[0.06] bg-ink/50 py-24 sm:py-32">
          <div className={wrap}>
            <SectionHeader eyebrow="How it works" title="From idea to upload in" accent="three steps." text="No timeline to learn. No settings to fight with. Just say what you want." />

            <ol className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
              <li className="reveal card flex flex-col p-5 sm:p-6">
                <div className="panel flex h-[176px] flex-col justify-center p-4">
                  <p className="text-[11px] font-medium text-mist">Your idea</p>
                  <p className="mt-2 text-[15px] leading-snug text-cloud">
                    The history of coffee in 60 seconds
                    <span className="animate-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-volt" />
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <span className="chip border-volt/40 bg-volt/10 py-1 text-volt">
                        <Ratio w={7} h={11} /> 9:16
                      </span>
                      <span className="chip py-1">
                        <Ratio w={12} h={7} /> 16:9
                      </span>
                    </div>
                    <span className="grid size-8 place-items-center rounded-full bg-volt text-night">
                      <Icon name="arrowRight" className="size-4" />
                    </span>
                  </div>
                </div>
                <p className="mt-6 text-sm font-semibold tabular-nums text-volt">01</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">Describe your video</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Type your idea in plain words and pick a format — YouTube, Shorts or square.</p>
              </li>

              <li className="reveal card flex flex-col p-5 sm:p-6">
                <div className="panel flex h-[176px] flex-col justify-center p-4">
                  <div className="flex items-center justify-between text-[11px] text-mist">
                    <span>Building your video</span>
                    <span className="tabular-nums text-cloud">72%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="bg-aurora shimmer h-full w-[72%] rounded-full" />
                  </div>
                  <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
                    {["Research", "Script", "Voiceover"].map((t) => (
                      <li key={t} className="flex items-center gap-2 text-cloud">
                        <span className="grid size-4 place-items-center rounded-full bg-volt text-night">
                          <Icon name="check" className="size-2.5" />
                        </span>
                        {t}
                      </li>
                    ))}
                    <li className="flex items-center gap-2 text-mist">
                      <span className="size-4 animate-spin rounded-full border-2 border-aqua/25 border-t-aqua" />
                      Visuals
                    </li>
                  </ul>
                </div>
                <p className="mt-6 text-sm font-semibold tabular-nums text-volt">02</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{SHORT_NAME} builds it</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Our AI crew researches the topic, writes the script, records the voice and picks every shot.</p>
              </li>

              <li className="reveal card flex flex-col p-5 sm:p-6">
                <div className="panel flex h-[176px] items-center gap-4 p-3">
                  <div className="relative aspect-[9/16] h-full shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                    <Scene kind="coffee" className="size-full" />
                  </div>
                  <div className="flex h-full min-w-0 flex-1 flex-col justify-between py-1">
                    <div>
                      <p className="truncate text-[13px] font-medium text-cloud">history-of-coffee.mp4</p>
                      <p className="mt-0.5 text-[11px] text-mist">1080p · 9:16 · 1:00</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["Shorts", "TikTok", "Reels"].map((p) => (
                        <span key={p} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-mist">
                          {p}
                        </span>
                      ))}
                    </div>
                    <span className="btn-volt h-9 w-full text-xs">
                      <Icon name="download" className="size-3.5" /> Download
                    </span>
                  </div>
                </div>
                <p className="mt-6 text-sm font-semibold tabular-nums text-volt">03</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">Review and post</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Change any scene or line if you like. Then download in 1080p and post it anywhere.</p>
              </li>
            </ol>
          </div>
        </section>

        {/* ============================== features */}
        <section id="features" className="relative isolate py-24 sm:py-32">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-40 -z-10 h-[520px] w-[900px] max-w-none -translate-x-1/2 rounded-full bg-ultra/[0.12] blur-[120px]" />
          <div className={wrap}>
            <SectionHeader
              eyebrow="Features"
              title="Everything a great video needs."
              accent="Done for you."
              text={`${SHORT_NAME} isn’t one AI. It’s a full crew — researcher, writer, narrator, editor and fact-checker — working on your video together.`}
            />

            <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6 lg:gap-5">
              {/* research */}
              <article className="reveal card overflow-hidden p-6 sm:p-8 md:col-span-6 lg:col-span-4">
                <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div>
                    <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                      <Icon name="search" className="size-5" />
                    </span>
                    <h3 className="mt-5 text-2xl font-semibold tracking-tight">Research you can trust</h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-mist">
                      {SHORT_NAME} reads real sources before it writes a single line. Every fact links back to where it came from — so your video is right, not just pretty.
                    </p>
                  </div>
                  <div className="panel p-4 sm:p-5">
                    <div className="flex items-center justify-between text-[11px] text-mist">
                      <span className="flex items-center gap-1.5">
                        <Icon name="pen" className="size-3.5" /> Script · Scene 03
                      </span>
                      <span className="rounded-full bg-volt/10 px-2 py-0.5 text-volt">2 sources</span>
                    </div>
                    <p className="mt-3 text-[15px] leading-7 text-cloud/90">
                      On July 20, 1969, Apollo 11 landed on the Moon.
                      <sup className="ml-0.5 rounded bg-aqua/15 px-1 text-[10px] font-semibold text-aqua">1</sup> About six and a half hours later, Neil Armstrong stepped onto the surface.
                      <sup className="ml-0.5 rounded bg-aqua/15 px-1 text-[10px] font-semibold text-aqua">2</sup>
                    </p>
                    <ul className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-[12px]">
                      {[
                        { n: 1, domain: "nasa.gov", title: "Apollo 11 Mission Overview" },
                        { n: 2, domain: "airandspace.si.edu", title: "Apollo 11 (AS-506)" },
                      ].map((s) => (
                        <li key={s.n} className="flex items-center gap-2.5">
                          <span className="grid size-5 shrink-0 place-items-center rounded bg-aqua/15 text-[10px] font-semibold text-aqua">{s.n}</span>
                          <span className="truncate text-cloud/85">{s.title}</span>
                          <span className="ml-auto shrink-0 text-mist/70">{s.domain}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>

              {/* voice */}
              <article className="reveal card flex flex-col p-6 sm:p-7 md:col-span-3 lg:col-span-2">
                <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                  <Icon name="mic" className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">A voice that sounds human</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Pick a narrator. {SHORT_NAME} reads your script with natural pacing and feeling.</p>
                <div className="panel mt-6 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-volt text-night">
                      <Icon name="play" className="size-4 translate-x-px" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-cloud">Ava</p>
                      <p className="text-xs text-mist">Warm · Storyteller</p>
                    </div>
                    <span className="ml-auto text-xs tabular-nums text-mist">0:42</span>
                  </div>
                  <Waveform bars={28} className="mt-4 h-10" />
                  <div className="mt-4 flex gap-1.5">
                    <span className="chip border-volt/40 bg-volt/10 py-1 text-volt">Ava</span>
                    <span className="chip py-1">Leo</span>
                    <span className="chip py-1">Mia</span>
                    <span className="chip py-1">+ more</span>
                  </div>
                </div>
              </article>

              {/* licenses */}
              <article className="reveal card flex flex-col p-6 sm:p-7 md:col-span-3 lg:col-span-2">
                <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                  <Icon name="shield" className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">Footage with a clear license</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Real clips and images, each with its license and credit saved — so you can post with confidence.</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {(
                    [
                      { kind: "liftoff", tag: "Public domain" },
                      { kind: "earthrise", tag: "CC BY 4.0" },
                      { kind: "touchdown", tag: "CC0" },
                      { kind: "journey", tag: "Licensed" },
                    ] as { kind: SceneKind; tag: string }[]
                  ).map((m) => (
                    <div key={m.tag} className="relative aspect-video overflow-hidden rounded-xl ring-1 ring-white/10">
                      <Scene kind={m.kind} className="absolute inset-0 size-full" />
                      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                        <Icon name="shield" className="size-3 text-volt" />
                        {m.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              {/* captions */}
              <article className="reveal card flex flex-col p-6 sm:p-7 md:col-span-3 lg:col-span-2">
                <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                  <Icon name="captions" className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">Captions that pop</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Auto captions, perfectly timed, in bold styles made for Shorts and Reels.</p>
                <div className="mt-6 flex items-end justify-center gap-4">
                  <div className="relative aspect-[9/16] w-32 overflow-hidden rounded-[18px] ring-1 ring-white/15">
                    <Scene kind="deepsea" className="absolute inset-0 size-full" />
                    <p className="absolute inset-x-2 bottom-9 text-center text-[13px] font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.8)]">
                      Sharks are <span className="rounded bg-volt px-1 text-night [text-shadow:none]">older</span> than trees
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 pb-1">
                    <span className="chip border-volt/40 bg-volt/10 py-1 text-volt">Bold</span>
                    <span className="chip py-1">Karaoke</span>
                    <span className="chip py-1">Minimal</span>
                  </div>
                </div>
              </article>

              {/* formats */}
              <article className="reveal card flex flex-col p-6 sm:p-7 md:col-span-3 lg:col-span-2">
                <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                  <Icon name="frames" className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">Any size, any platform</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">One video, reframed for YouTube, Shorts, Reels, TikTok or your feed.</p>
                <div className="mt-6 flex flex-1 items-center justify-center">
                  <div className="flex items-end gap-2 sm:gap-3">
                    {(
                      [
                        { cls: "w-[96px] sm:w-[120px] aspect-video", label: "16:9" },
                        { cls: "w-[46px] sm:w-[58px] aspect-[9/16]", label: "9:16" },
                        { cls: "w-[68px] sm:w-[84px] aspect-square", label: "1:1" },
                      ] as { cls: string; label: string }[]
                    ).map((f) => (
                      <div key={f.label} className="flex flex-col items-center gap-2">
                        <div className={`${f.cls} overflow-hidden rounded-lg ring-1 ring-white/15`}>
                          <Scene kind="earthrise" className="size-full" />
                        </div>
                        <span className="text-[11px] font-medium text-mist">{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              {/* review team */}
              <article className="reveal card flex flex-col p-6 sm:p-7 md:col-span-3">
                <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                  <Icon name="users" className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">An AI review team checks every scene</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Before you see your video, specialist AI reviewers check facts, pacing and readability. Problems get fixed, not shipped.</p>
                <ul className="mt-6 space-y-2">
                  {(
                    [
                      { icon: "search", role: "Fact-checker", note: "14 of 14 claims match their sources", verdict: "Pass", fixed: false },
                      { icon: "clock", role: "Story editor", note: "Pacing and scene order look right", verdict: "Pass", fixed: false },
                      { icon: "eye", role: "Accessibility", note: "Caption contrast improved in 2 scenes", verdict: "Fixed", fixed: true },
                    ] as { icon: IconName; role: string; note: string; verdict: string; fixed: boolean }[]
                  ).map((r) => (
                    <li key={r.role} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-night/60 p-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-cloud/80">
                        <Icon name={r.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-cloud">{r.role}</p>
                        <p className="text-[12px] leading-snug text-mist sm:truncate">{r.note}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.fixed ? "bg-aqua/15 text-aqua" : "bg-volt/15 text-volt"}`}>{r.verdict}</span>
                    </li>
                  ))}
                </ul>
              </article>

              {/* saved */}
              <article className="reveal card flex flex-col p-6 sm:p-7 md:col-span-6 lg:col-span-3">
                <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-inset ring-volt/20">
                  <Icon name="cloud" className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">Never lose your work</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">Every project saves itself as you go. Close the tab, come back tomorrow, and pick up right where you left off.</p>
                <ul className="panel mt-6 divide-y divide-white/[0.06]">
                  {(
                    [
                      { kind: "step", name: "The Moon Landing", when: "Saved just now", live: true },
                      { kind: "coffee", name: "The History of Coffee", when: "Saved 2 hours ago", live: false },
                      { kind: "credit", name: "Credit Scores, Explained", when: "Saved yesterday", live: false },
                    ] as { kind: SceneKind; name: string; when: string; live: boolean }[]
                  ).map((p) => (
                    <li key={p.name} className="flex items-center gap-3 p-3">
                      <div className="aspect-video w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                        <Scene kind={p.kind} className="size-full" />
                      </div>
                      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-3">
                        <p className="truncate text-[13px] font-medium text-cloud">{p.name}</p>
                        <span className={`mt-0.5 flex items-center gap-1.5 text-[11px] sm:mt-0 sm:shrink-0 ${p.live ? "text-volt" : "text-mist"}`}>
                          <Icon name="cloud" className="size-3.5" />
                          {p.when}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ============================== use cases */}
        <section id="use-cases" className="border-t border-white/[0.06] py-24 sm:py-32">
          <div className={wrap}>
            <SectionHeader eyebrow="Use cases" title="One studio." accent="Every kind of video." text={`Whatever you want to say, ${SHORT_NAME} turns it into something people want to watch.`} />

            <div className="no-scrollbar -mx-5 mt-14 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 lg:gap-5">
              {useCases.map((u) => (
                <article key={u.title} className="reveal card group w-[82%] shrink-0 snap-start overflow-hidden p-2 transition hover:border-white/20 sm:w-auto">
                  <div className="relative aspect-video overflow-hidden rounded-[18px] bg-night">
                    {u.format === "16:9" ? (
                      <Scene kind={u.kind} className="absolute inset-0 size-full transition duration-700 group-hover:scale-105" />
                    ) : (
                      <>
                        <Scene kind={u.kind} className="absolute inset-0 size-full scale-125 opacity-50 blur-xl" />
                        <div
                          className={`absolute inset-y-3 left-1/2 -translate-x-1/2 overflow-hidden rounded-xl shadow-2xl shadow-black/50 ring-1 ring-white/15 ${u.format === "9:16" ? "aspect-[9/16]" : "aspect-square"}`}
                        >
                          <Scene kind={u.kind} className="size-full transition duration-700 group-hover:scale-105" />
                        </div>
                      </>
                    )}
                    <span className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{u.format}</span>
                    <span className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur">{u.length}</span>
                    <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-night opacity-0 shadow-xl transition duration-300 group-hover:opacity-100">
                      <Icon name="play" className="size-5 translate-x-px" />
                    </span>
                  </div>
                  <div className="px-3 pb-3 pt-4 sm:px-4 sm:pb-4">
                    <h3 className="text-lg font-semibold tracking-tight">{u.title}</h3>
                    <p className="mt-2 flex gap-2 text-sm leading-relaxed text-mist">
                      <Icon name="sparkle" className="mt-[3px] size-3.5 shrink-0 text-volt/80" />
                      <span>“{u.prompt}”</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ============================== faq */}
        <section id="faq" className="border-t border-white/[0.06] bg-ink/50 py-24 sm:py-32">
          <div className={`${wrap} grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16`}>
            <div className="lg:sticky lg:top-28 lg:self-start">
              <SectionHeader center={false} eyebrow="FAQ" title="Questions?" accent="Answers." text={`Everything you need to know about making videos with ${BRAND}.`} />
            </div>
            <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {faqs.map((f, i) => (
                <details key={f.q} className="group" open={i === 0}>
                  <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-left text-base font-medium text-cloud sm:py-6 sm:text-lg">
                    {f.q}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 text-mist transition duration-300 group-open:rotate-45 group-open:border-volt/40 group-open:text-volt">
                      <Icon name="plus" className="size-4" />
                    </span>
                  </summary>
                  <p className="-mt-1 pb-6 pr-10 text-[15px] leading-relaxed text-mist sm:pr-14">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============================== final call to action */}
        <section className="px-5 py-24 sm:px-8 sm:py-32">
          <div className="reveal relative isolate mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-ink px-6 py-16 text-center sm:px-12 sm:py-24">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="bg-grid absolute inset-0" />
              <div className="absolute left-1/2 top-[-60%] h-[520px] w-[820px] max-w-none -translate-x-1/2 rounded-full bg-ultra/30 blur-[120px]" />
              <div className="absolute -bottom-40 -left-20 size-80 rounded-full bg-aqua/15 blur-[100px]" />
              <div className="absolute -bottom-40 -right-20 size-80 rounded-full bg-volt/[0.12] blur-[100px]" />
            </div>
            <h2 className="mx-auto max-w-3xl text-balance text-[2.4rem] font-semibold leading-[1.03] tracking-[-0.04em] sm:text-6xl">
              Your next video starts with <Accent>one sentence.</Accent>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-mist">Type it. {BRAND} does the rest.</p>

            <form action={APP_URL || "#create"} method="get" {...soonAttr} className="mx-auto mt-10 w-full max-w-xl">
              <div className="prompt-shell prompt-pill">
                <div className="prompt-inner flex items-center gap-2 p-1.5 pl-5">
                  <label htmlFor="prompt-final" className="sr-only">
                    Describe your video
                  </label>
                  <input
                    id="prompt-final"
                    name="prompt"
                    required
                    autoComplete="off"
                    placeholder="Your video idea…"
                    className="min-w-0 flex-1 bg-transparent py-2 text-base text-cloud placeholder:text-mist/60"
                  />
                  <button type="submit" className="btn-volt h-11 shrink-0 px-5 text-sm">
                    <span className="hidden sm:inline">Create video</span>
                    <span className="sm:hidden">Create</span>
                    <Icon name="arrowRight" className="size-4" />
                  </button>
                </div>
              </div>
              <p data-note hidden className="mt-4 text-sm text-aqua">
                The studio is opening very soon — we’re adding the final touches. Check back shortly!
              </p>
            </form>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-mist">
              <Tick>No editing skills needed</Tick>
              <Tick>Export in 1080p</Tick>
              <Tick>Every source credited</Tick>
            </div>
          </div>
        </section>
      </main>

      {/* ============================== footer */}
      <footer className="relative border-t border-white/[0.06]">
        <div className={`${wrap} py-14`}>
          <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <a href="#top" aria-label={`${BRAND} home`} className="inline-block">
                <BrandMark big />
              </a>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-mist">The AI video studio that turns one sentence into a finished video.</p>
            </div>
            <nav aria-label="Product">
              <p className="text-sm font-semibold text-cloud">Product</p>
              <ul className="mt-4 space-y-3 text-sm text-mist">
                {navLinks.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="transition hover:text-cloud">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Company">
              <p className="text-sm font-semibold text-cloud">Company</p>
              <ul className="mt-4 space-y-3 text-sm text-mist">
                <li>
                  <a href="https://zupona.com" className="inline-flex items-center gap-1 transition hover:text-cloud">
                    zupona.com <Icon name="arrowUpRight" className="size-3.5" />
                  </a>
                </li>
                <li>
                  <a href={START_HREF} className="transition hover:text-cloud">
                    Start creating
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-xs text-mist/70 sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} {BRAND}. All rights reserved.
            </p>
            <p>Made for creators everywhere.</p>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none -mt-[5vw] select-none overflow-hidden px-5 text-center">
          <span className="block translate-y-[18%] bg-gradient-to-b from-white/[0.09] to-transparent bg-clip-text text-[22vw] font-semibold leading-[0.8] tracking-[-0.06em] text-transparent">
            {SHORT_NAME.toLowerCase()}
          </span>
        </div>
      </footer>

      <script dangerouslySetInnerHTML={{ __html: pageScript }} />
    </div>
  );
}

/* ------------------------------------------------------------------ behaviour
   A few lines of plain JavaScript: rotating example ideas in the prompt box,
   example buttons, the mobile menu, and the "opening soon" note. */

const pageScript = `(function () {
  var d = document;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var box = d.getElementById("prompt");
  var typing = true;
  function stop() { typing = false; }

  d.querySelectorAll("[data-menu] a").forEach(function (a) {
    a.addEventListener("click", function () { var m = a.closest("details"); if (m) m.removeAttribute("open"); });
  });
  d.addEventListener("click", function (e) {
    var m = d.querySelector("[data-menu][open]");
    if (m && !m.contains(e.target)) m.removeAttribute("open");
  });

  d.querySelectorAll('a[href="#create"]').forEach(function (a) {
    a.addEventListener("click", function () {
      if (box) setTimeout(function () { box.focus({ preventScroll: true }); }, reduce ? 0 : 550);
    });
  });

  d.querySelectorAll("[data-prompt]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!box) return;
      stop();
      box.value = b.getAttribute("data-prompt");
      box.focus();
    });
  });

  d.querySelectorAll("form[data-soon]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = f.querySelector("[data-note]");
      if (note) note.hidden = false;
    });
  });

  if (box && !reduce) {
    var ideas = ${JSON.stringify(placeholderIdeas)};
    var i = 0, n = 0, back = false;
    box.addEventListener("focus", stop);
    (function tick() {
      if (!typing) { box.placeholder = ideas[i]; return; }
      var t = ideas[i];
      if (!back) {
        n += 1;
        if (n >= t.length) { box.placeholder = t; back = true; return setTimeout(tick, 2400); }
      } else {
        n -= 3;
        if (n <= 0) { n = 0; back = false; i = (i + 1) % ideas.length; }
      }
      box.placeholder = t.slice(0, n) + "|";
      setTimeout(tick, back ? 14 : 38);
    })();
  }
})();`;
