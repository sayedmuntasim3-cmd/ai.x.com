import type { Metadata } from "next";
import type { ReactNode } from "react";
import { estimateRun } from "./engine/src/film-run.mjs";
import { FORMATS } from "./engine/src/formats.mjs";

export const metadata: Metadata = {
  title: "Zupona AI — Fact-checked AI documentaries from one topic",
  description:
    "Give Zupona a topic. It researches it, sources every claim, writes a film built to hold attention, finds real archive photographs and licensed footage, adds narration and music, and renders the video, Shorts and thumbnails. One minute to five hours.",
  alternates: { canonical: "https://ai.zupona.com" },
};

/** Every visible string exists in English and Bangla; the page shows one (see render.tsx). */
function L({ en, bn }: { en: ReactNode; bn: ReactNode }) {
  return (
    <>
      <span data-l="en">{en}</span>
      <span data-l="bn" lang="bn">{bn}</span>
    </>
  );
}

const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`;
const price = (minutes: number) => {
  const e = estimateRun(minutes * 60);
  return { minutes, normal: `${usd(e.usdLow)}–${usd(e.usdHigh)}`, saving: `${usd(e.savingUsdLow)}–${usd(e.savingUsdHigh)}` };
};
const PRICES = [price(10), price(45), price(90)];
const FORTY_FIVE = PRICES[1];

const STEPS: { en: [string, string]; bn: [string, string] }[] = [
  { en: ["Find a topic people want", "The topic radar shows videos that earned many times their channel's usual views: proof the audience wants the subject. Your film is written new, never copied."], bn: ["চাহিদা আছে এমন বিষয়", "টপিক রাডার দেখায় কোন ভিডিও নিজের চ্যানেলের গড়ের বহুগুণ ভিউ পেয়েছে, মানে দর্শক বিষয়টা চায়। আপনার ফিল্ম নতুন করে লেখা হয়, কপি নয়।"] },
  { en: ["Research with a source for every claim", "Web research becomes a claim ledger: each fact with its source and confidence. Where sources disagree, the film says so instead of picking one quietly."], bn: ["প্রতিটা তথ্যের সোর্সসহ রিসার্চ", "ওয়েব রিসার্চ থেকে তৈরি হয় তথ্যের খাতা: প্রতিটা তথ্য, তার সোর্স আর নিশ্চয়তা। সোর্সে মতভেদ থাকলে ফিল্মেও সেটা বলা হয়, চুপচাপ একটা বেছে নেওয়া হয় না।"] },
  { en: ["A story built to hold attention", "A hook inside 30 seconds, a reset about every three minutes, a midpoint turn, a cliffhanger at 80%, and every question that is raised gets paid off."], bn: ["ধরে রাখার মতো গল্প", "৩০ সেকেন্ডের মধ্যে হুক, প্রায় প্রতি ৩ মিনিটে নতুন টান, মাঝপথে মোড়, ৮০% জায়গায় ক্লিফহ্যাঙ্গার, আর যে প্রশ্ন তোলা হয় তার উত্তরও দেওয়া হয়।"] },
  { en: ["Every scene checked in code", "Timing, words per second, sources, banned phrases and open questions are checked line by line. Failures are repaired automatically or listed, never hidden."], bn: ["প্রতিটা দৃশ্য কোডে যাচাই", "সময়, প্রতি সেকেন্ডে শব্দ, সোর্স, নিষিদ্ধ শব্দ আর খোলা প্রশ্ন লাইন ধরে যাচাই হয়। ভুল নিজে থেকে ঠিক হয়, না হলে তালিকায় ওঠে, লুকানো হয় না।"] },
  { en: ["Pictures of the real thing", "Archive photographs and paintings from Wikimedia Commons, NASA, the Library of Congress, the Smithsonian, the Met, the Art Institute of Chicago and Openverse, and free-licence footage from Pexels and Pixabay, each candidate looked at before it is used. Still photos move like footage."], bn: ["আসল জিনিসের ছবি", "Wikimedia Commons, NASA, Library of Congress, Smithsonian, Met, Art Institute of Chicago আর Openverse-এর আর্কাইভ ছবি ও চিত্রকর্ম, Pexels আর Pixabay-র ফ্রি লাইসেন্সের ফুটেজ; প্রতিটা ছবি দেখে তারপর বাছাই। স্থির ছবিও ফুটেজের মতো নড়ে।"] },
  { en: ["Voice, music and sound", "Your own recorded voice, or emotional AI narration directed scene by scene; a score composed for each mood; sound effects; loudness measured at −14 LUFS."], bn: ["কণ্ঠ, মিউজিক আর সাউন্ড", "আপনার নিজের রেকর্ড করা কণ্ঠ, অথবা দৃশ্য ধরে ধরে নির্দেশিত আবেগময় AI ন্যারেশন; প্রতিটা মুডের জন্য বানানো মিউজিক; সাউন্ড ইফেক্ট; লাউডনেস মেপে −১৪ LUFS।"] },
  { en: ["Ready to publish", "An MP4 with captions, three thumbnails for YouTube's Test & Compare, vertical Shorts, a Facebook cut, and a description with chapters and picture credits."], bn: ["পাবলিশের জন্য তৈরি", "ক্যাপশনসহ MP4, YouTube-এর Test & Compare-এর জন্য তিনটা থাম্বনেইল, ভার্টিক্যাল Shorts, একটা Facebook কাট, আর চ্যাপ্টার ও ছবির ক্রেডিটসহ ডেসক্রিপশন।"] },
];

const SCENES = [
  { id: "SC0001", time: "0:00:00–0:00:08", claims: "C02 · C01 · C49", narr: "Bengaluru, India. Twenty eleven, by most accounts. A Rolls-Royce Ghost joins a rental fleet. Its buyer cuts hair.", shots: "R3 razor macro, no face, speed ramp → R3 emblem macro → aerial on “joins”" },
  { id: "SC0002", time: "0:00:08–0:00:15", claims: "C03", narr: "As of the latest reports, in twenty twenty-five, he still does. A fleet owner, behind a barber's chair.", shots: "comb macro → match cut to a night road → the empty chair under one bulb" },
  { id: "SC0003", time: "0:00:15–0:00:22", claims: "C47 · C43", narr: "But the car was only the first bill. The tax after it, he has said, nearly broke him.", shots: "sedan flank → ledger page, a red “+ TAX” line draws → half a second of black" },
];

const COMPARE: { en: string; bn: string; us: string; usBn: string; them: string; themBn: string }[] = [
  { en: "A source for every claim", bn: "প্রতিটা তথ্যের সোর্স", us: "Claim ledger, checked", usBn: "তথ্যের খাতা, যাচাই করা", them: "Not shown", themBn: "দেখানো হয় না" },
  { en: "A licence record for every clip and picture", bn: "প্রতিটা ক্লিপ আর ছবির লাইসেন্স রেকর্ড", us: "Always", usBn: "সবসময়", them: "Rarely shown", themBn: "খুব কমই দেখানো হয়" },
  { en: "Real archive photos of the actual subject", bn: "আসল বিষয়ের আর্কাইভ ছবি", us: "Commons, NASA, Library of Congress, museums; credited", usBn: "Commons, NASA, Library of Congress, জাদুঘর; ক্রেডিটসহ", them: "Generic stock", themBn: "সাধারণ স্টক" },
  { en: "Film length", bn: "ফিল্মের দৈর্ঘ্য", us: "1 to 300 minutes", usBn: "১ থেকে ৩০০ মিনিট", them: "Usually up to about 30", themBn: "সাধারণত প্রায় ৩০ পর্যন্ত" },
  { en: "Price before you start; a failed step is never paid twice", bn: "শুরুর আগেই দাম; ব্যর্থ ধাপের টাকা দুবার নয়", us: "Yes, and resume", usBn: "হ্যাঁ, আর আবার চালানো যায়", them: "Credits spent on failures", themBn: "ব্যর্থ রেন্ডারেও ক্রেডিট খরচ" },
  { en: "Originality check across your channel", bn: "পুরো চ্যানেল জুড়ে কপি-চেক", us: "Every film", usBn: "প্রতিটা ফিল্মে", them: "None", themBn: "নেই" },
  { en: "Your own voice", bn: "নিজের কণ্ঠ", us: "Yes, untouched", usBn: "হ্যাঁ, কোনো পরিবর্তন ছাড়া", them: "Sometimes", themBn: "কখনো কখনো" },
  { en: "Shorts, a Facebook cut and 3 thumbnails from the same run", bn: "একই রান থেকে Shorts, Facebook কাট আর ৩টা থাম্বনেইল", us: "Yes", usBn: "হ্যাঁ", them: "Varies", themBn: "টুল ভেদে আলাদা" },
];

const FAQ: { q: [string, string]; a: [string, string] }[] = [
  { q: ["Will YouTube monetise these videos?", "YouTube কি এই ভিডিও মনিটাইজ করবে?"], a: ["No tool can promise that. Zupona is built around YouTube's rules for original content: every film is researched and structured anew, an originality check compares it with your channel's earlier films, you can narrate it yourself, and realistic AI scenes are disclosed in YouTube Studio.", "কোনো টুলই এটা গ্যারান্টি দিতে পারে না। Zupona তৈরি হয়েছে YouTube-এর মৌলিক কনটেন্টের নিয়ম মেনে: প্রতিটা ফিল্ম নতুন রিসার্চ আর নতুন কাঠামোয় লেখা, আপনার চ্যানেলের আগের ফিল্মগুলোর সাথে কপি-চেক হয়, চাইলে নিজের কণ্ঠ দিতে পারেন, আর বাস্তবসম্মত AI দৃশ্য YouTube Studio-তে ঘোষণা করা হয়।"] },
  { q: ["Is the footage copyright-safe?", "ফুটেজ কি কপিরাইট-নিরাপদ?"], a: ["Every clip and picture carries a licence record: source page, licence and creator. Share-alike, non-commercial and restricted files are refused, CC BY pictures are credited automatically, and nothing is taken from YouTube, Facebook, TikTok, X or Google Images.", "প্রতিটা ক্লিপ আর ছবির সাথে লাইসেন্স রেকর্ড থাকে: সোর্স পেজ, লাইসেন্স আর নির্মাতা। শর্তযুক্ত বা অবাণিজ্যিক ফাইল বাদ যায়, CC BY ছবির ক্রেডিট নিজে থেকে লেখা হয়, আর YouTube, Facebook, TikTok, X বা Google Images থেকে কিছুই নেওয়া হয় না।"] },
  { q: ["How long can a film be?", "ফিল্ম কত বড় হতে পারে?"], a: ["From one minute to five hours. Long films are written chapter by chapter, and each chapter is checked before the next one starts.", "১ মিনিট থেকে ৫ ঘণ্টা। বড় ফিল্ম চ্যাপ্টার ধরে লেখা হয়, আর প্রতিটা চ্যাপ্টার যাচাই হওয়ার পরেই পরেরটা শুরু হয়।"] },
  { q: ["What does a film cost?", "একটা ফিল্মে খরচ কত?"], a: [`You see the estimate before anything starts: about ${FORTY_FIVE.normal} for a 45-minute film, or ${FORTY_FIVE.saving} in saving mode, which takes a few hours longer. A failed step stops with the reason and resumes without paying again.`, `কিছু শুরুর আগেই আনুমানিক খরচ দেখায়: ৪৫ মিনিটের ফিল্মে প্রায় ${FORTY_FIVE.normal}, আর সাশ্রয়ী মোডে ${FORTY_FIVE.saving} (কয়েক ঘণ্টা বেশি সময় লাগে)। কোনো ধাপ ব্যর্থ হলে কারণসহ থামে, আর আবার চালালে আগের টাকা আর লাগে না।`] },
  { q: ["Can I use my own voice?", "নিজের কণ্ঠ দিতে পারব?"], a: ["Yes. The studio gives you a recording script, one line per scene. Your takes are used exactly as recorded, and AI voices only fill the scenes you leave out.", "হ্যাঁ। স্টুডিও আপনাকে দৃশ্য ধরে ধরে রেকর্ডিং স্ক্রিপ্ট দেয়। আপনার রেকর্ড যেমন আছে তেমনই ব্যবহার হয়, আর যে দৃশ্য বাদ রাখবেন শুধু সেগুলোতে AI কণ্ঠ বসে।"] },
  { q: ["Which languages?", "কোন কোন ভাষায়?"], a: ["English (USA) films today. Bangla and Arabic versions, written natively rather than translated, are next.", "এখন English (USA) ফিল্ম। এরপর আসছে বাংলা আর আরবি, যেগুলো অনুবাদ নয়, সরাসরি সেই ভাষায় লেখা।"] },
];

const Check = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0 fill-lime-300"><path d="M8.2 13.6 4.6 10l-1.2 1.2 4.8 4.8L17 7.2 15.8 6z" /></svg>
);

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-300">{children}</p>;
}

export default function ZuponaAiLandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080b0a] text-white selection:bg-lime-300 selection:text-black">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[760px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(3,126,91,0.30),transparent_65%)]" />

      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#080b0a]/75 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8 lg:px-12" aria-label="Main">
          <a href="/" className="flex items-center gap-3" aria-label="Zupona AI home">
            <span className="grid size-9 place-items-center rounded-xl bg-lime-300 text-base font-black text-[#07100c]">Z</span>
            <span className="text-lg font-semibold tracking-tight">zupona<span className="text-lime-300">.ai</span></span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-white/65 lg:flex">
            <a href="#how" className="hover:text-lime-200"><L en="How it works" bn="কীভাবে কাজ করে" /></a>
            <a href="#why" className="hover:text-lime-200"><L en="Why Zupona" bn="কেন Zupona" /></a>
            <a href="#formats" className="hover:text-lime-200"><L en="Formats" bn="ধরন" /></a>
            <a href="#cost" className="hover:text-lime-200"><L en="Cost" bn="খরচ" /></a>
            <a href="#faq" className="hover:text-lime-200"><L en="FAQ" bn="প্রশ্নোত্তর" /></a>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-white/15 p-0.5 text-xs" role="group" aria-label="Language">
              <button type="button" data-set-lang="en" className="lang-btn rounded-full px-2.5 py-1.5">EN</button>
              <button type="button" data-set-lang="bn" lang="bn" className="lang-btn rounded-full px-2.5 py-1.5">বাংলা</button>
            </div>
            <a href="/studio/" className="rounded-full bg-lime-300 px-4 py-2 text-sm font-semibold text-[#09110c] transition hover:bg-lime-200">
              <L en="Studio" bn="স্টুডিও" />
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-8 md:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-12 lg:pb-24">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/[0.07] px-3.5 py-2 text-xs font-medium tracking-wide text-lime-200">
            <span className="size-1.5 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.9)]" />
            <L en="The AI documentary studio" bn="AI ডকুমেন্টারি স্টুডিও" />
          </div>
          <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl lg:text-[4.2rem]">
            <L
              en={<>Documentaries people <span className="bg-gradient-to-r from-lime-200 via-emerald-300 to-teal-400 bg-clip-text text-transparent">watch to the end.</span></>}
              bn={<>যে ডকুমেন্টারি মানুষ <span className="bg-gradient-to-r from-lime-200 via-emerald-300 to-teal-400 bg-clip-text text-transparent">শেষ পর্যন্ত দেখে।</span></>}
            />
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/65 sm:text-lg">
            <L
              en="Give Zupona a topic. It researches it, checks every fact against a source, writes a film built to hold attention, finds real archive photographs and licensed footage, adds narration, music and sound, and renders the video with Shorts and thumbnails. One minute to five hours."
              bn="শুধু একটা বিষয় দিন। Zupona নিজে রিসার্চ করে, প্রতিটা তথ্য সোর্সের সাথে মিলিয়ে দেখে, দর্শক ধরে রাখার মতো করে পুরো ফিল্ম লেখে, আসল আর্কাইভ ছবি আর লাইসেন্স করা ফুটেজ খুঁজে আনে, ন্যারেশন, মিউজিক আর সাউন্ড বসায়, তারপর ভিডিও, Shorts আর থাম্বনেইল বানিয়ে দেয়। ১ মিনিট থেকে ৫ ঘণ্টা পর্যন্ত।"
            />
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/studio/#film" className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-6 py-3.5 text-sm font-semibold text-[#09110c] transition hover:-translate-y-0.5 hover:bg-lime-200">
              <L en="Start a film" bn="ফিল্ম বানানো শুরু করুন" /> <span aria-hidden="true">→</span>
            </a>
            <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-sm font-medium text-white/85 transition hover:border-lime-300/60 hover:text-lime-200">
              <L en="See how it works" bn="কীভাবে কাজ করে দেখুন" />
            </a>
          </div>
          <ul className="mt-9 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
            <li className="flex items-center gap-2"><Check /><L en="Every claim sourced" bn="প্রতিটা তথ্যের সোর্স" /></li>
            <li className="flex items-center gap-2"><Check /><L en="Every picture licensed" bn="প্রতিটা ছবির লাইসেন্স" /></li>
            <li className="flex items-center gap-2"><Check /><L en="Price before you start" bn="শুরুর আগেই খরচ জানা" /></li>
          </ul>
        </div>

        {/* An illustration of the product, not a real frame */}
        <div className="relative mx-auto w-full max-w-[560px]" aria-hidden="true">
          <div className="absolute -inset-8 rounded-[3rem] bg-emerald-400/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[1.6rem] border border-white/15 bg-[#0d1210] p-2.5 shadow-2xl shadow-emerald-950/50">
            <div className="relative aspect-video overflow-hidden rounded-[1.15rem] bg-black">
              <div className="kb absolute inset-[-8%] bg-[radial-gradient(circle_at_70%_30%,rgba(255,214,150,0.55),transparent_28%),linear-gradient(180deg,#3b2f22_0%,#6d5640_42%,#2a2219_43%,#15110d_100%)]" />
              <div className="kb-slow absolute inset-x-[-6%] bottom-[-4%] h-[58%] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.55)),repeating-linear-gradient(90deg,#1b1611_0_9%,#241d16_9%_12%,#14100c_12%_20%,#2c241b_20%_23%,#191410_23%_31%)] [clip-path:polygon(0_38%,8%_30%,14%_36%,22%_18%,30%_26%,38%_10%,46%_24%,55%_14%,63%_28%,72%_8%,80%_22%,88%_16%,100%_30%,100%_100%,0_100%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65)_100%)]" />
              <div className="absolute inset-x-0 top-0 h-[7%] bg-black" />
              <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black" />
              <div className="absolute left-[6%] top-[13%] text-[10px] font-medium uppercase tracking-[0.22em] text-white/70">C1 · The barber's son</div>
              <div className="absolute bottom-[19%] left-[6%]">
                <p className="rise text-xl font-semibold tracking-wide sm:text-3xl" style={{ animationDelay: "0.4s" }}>BENGALURU, INDIA</p>
                <p className="rise mt-1 text-sm text-white/80 sm:text-base" style={{ animationDelay: "1.1s" }}>A Rolls-Royce joins a rental fleet.</p>
              </div>
              <div className="rise absolute bottom-[10%] left-[6%] rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-[#dbe7df]" style={{ animationDelay: "1.8s" }}>C02 · claim ledger</div>
              <div className="absolute bottom-[10%] right-[5%] font-mono text-[10px] text-white/60">00:00:03</div>
            </div>
            <div className="mt-2.5 grid grid-cols-7 gap-1.5 px-0.5">
              {["Topic", "Research", "Story", "Checks", "Pictures", "Sound", "Render"].map((s, i) => (
                <div key={s} className="flex flex-col items-center gap-1.5 rounded-lg bg-white/[0.04] px-1 py-2">
                  <span className="stage-dot size-2 rounded-full" style={{ animationDelay: `${i * 0.9}s` }} />
                  <span className="text-[9px] text-white/55 sm:text-[10px]">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/35"><L en="Illustration of a film being made" bn="একটা ফিল্ম তৈরির ছবি (উদাহরণ)" /></p>
        </div>
      </section>

      {/* Product facts */}
      <section className="relative z-10 border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px px-4 sm:px-8 md:grid-cols-4 lg:px-12">
          {[
            { n: "1–300", en: "minutes per film", bn: "মিনিট পর্যন্ত ফিল্ম" },
            { n: String(FORMATS.length), en: "documentary formats", bn: "ধরনের ডকুমেন্টারি" },
            { n: "0", en: "clips without a licence record", bn: "লাইসেন্স রেকর্ড ছাড়া ক্লিপ" },
            { n: "50%", en: "lower writing cost in saving mode", bn: "সাশ্রয়ী মোডে লেখার খরচ কম" },
          ].map((s) => (
            <div key={s.en} className="px-2 py-8 text-center sm:px-4">
              <p className="text-3xl font-semibold tracking-tight text-lime-200 sm:text-4xl">{s.n}</p>
              <p className="mt-2 text-xs text-white/55 sm:text-sm"><L en={s.en} bn={s.bn} /></p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow><L en="How it works" bn="কীভাবে কাজ করে" /></Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><L en="From one topic to a finished film." bn="একটা বিষয় থেকে পুরো ফিল্ম।" /></h2>
          <p className="mt-5 leading-7 text-white/60"><L en="Seven stages run on their own. Nothing waits for a person, and every stage leaves a file you can open and check." bn="সাতটা ধাপ নিজে থেকে চলে। কোনো ধাপ মানুষের অপেক্ষায় থাকে না, আর প্রতিটা ধাপ এমন ফাইল রেখে যায় যা খুলে দেখা আর যাচাই করা যায়।" /></p>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.en[0]} className="group rounded-3xl border border-white/10 bg-[#0d1210] p-6 transition hover:border-lime-300/30 sm:p-7">
              <span className="font-mono text-sm text-lime-300">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 text-lg font-semibold"><L en={s.en[0]} bn={s.bn[0]} /></h3>
              <p className="mt-3 text-sm leading-7 text-white/60"><L en={s.en[1]} bn={s.bn[1]} /></p>
            </li>
          ))}
        </ol>
      </section>

      {/* Real output */}
      <section className="relative z-10 border-y border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-12 lg:py-24">
          <div>
            <Eyebrow><L en="Real output" bn="আসল আউটপুট" /></Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"><L en="What the engine actually writes." bn="ইঞ্জিন আসলে কী লেখে।" /></h2>
            <p className="mt-5 leading-7 text-white/60">
              <L
                en="The opening scenes of a 45-minute film it wrote, shortened. The C-numbers point to the film's sourced claim ledger; every shot names its source and its exact time."
                bn="ইঞ্জিনের লেখা একটা ৪৫ মিনিটের ফিল্মের শুরুর দৃশ্যগুলো, ছোট করে। C-নম্বরগুলো ফিল্মের সোর্সসহ তথ্যের খাতার দিকে নির্দেশ করে; প্রতিটা শটে তার সোর্স আর সঠিক সময় লেখা থাকে।"
              />
            </p>
          </div>
          <div className="space-y-3">
            {SCENES.map((s) => (
              <article key={s.id} className="rounded-2xl border border-white/10 bg-[#0b100e] p-5 font-mono text-[13px] leading-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
                  <span className="text-lime-300">{s.id}</span><span>{s.time}</span><span className="rounded bg-lime-300/10 px-1.5 text-lime-200">{s.claims}</span>
                </div>
                <p className="mt-2 font-sans text-[15px] leading-7 text-white/90">“{s.narr}”</p>
                <p className="mt-2 text-white/45">SHOTS: {s.shots}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section id="why" className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="max-w-3xl">
          <Eyebrow><L en="Why Zupona" bn="কেন Zupona" /></Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><L en="Built for what gets channels hurt." bn="চ্যানেলের ক্ষতি যেখান থেকে আসে, সেটা মাথায় রেখে তৈরি।" /></h2>
          <p className="mt-5 leading-7 text-white/60"><L en="Wrong facts, unlicensed footage and look-alike videos cost channels their reach. Zupona is designed against all three." bn="ভুল তথ্য, লাইসেন্স ছাড়া ফুটেজ আর একই রকম দেখতে ভিডিও চ্যানেলের রিচ নষ্ট করে। Zupona এই তিনটার বিরুদ্ধেই বানানো।" /></p>
        </div>
        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10">
          <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-white/[0.04] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 sm:px-6">
            <span></span><span className="text-lime-300">Zupona</span><span><L en="Typical AI video tool" bn="সাধারণ AI ভিডিও টুল" /></span>
          </div>
          {COMPARE.map((r) => (
            <div key={r.en} className="grid grid-cols-[1.3fr_1fr_1fr] items-center gap-2 border-t border-white/10 px-4 py-4 text-sm sm:px-6">
              <span className="text-white/85"><L en={r.en} bn={r.bn} /></span>
              <span className="flex items-center gap-2 text-lime-100"><Check /><L en={r.us} bn={r.usBn} /></span>
              <span className="text-white/45"><L en={r.them} bn={r.themBn} /></span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/35"><L en="“Typical” summarises public descriptions of popular AI video generators in November 2026; individual tools differ." bn="“সাধারণ” মানে নভেম্বর ২০২৬-এ জনপ্রিয় AI ভিডিও টুলগুলোর প্রকাশ্য বিবরণের সারাংশ; আলাদা টুলে আলাদা হতে পারে।" /></p>
      </section>

      {/* Motion */}
      <section className="relative z-10 border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="max-w-2xl">
            <Eyebrow><L en="Look and motion" bn="লুক আর মোশন" /></Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><L en="Edited, not just generated." bn="শুধু বানানো নয়, এডিট করা।" /></h2>
            <p className="mt-5 leading-7 text-white/60"><L en="The renderer gives every film one grade and one rhythm, so pictures from many sources read as one film." bn="রেন্ডারার প্রতিটা ফিল্মকে একটাই কালার গ্রেড আর একটাই ছন্দ দেয়, তাই নানা সোর্সের ছবিও একটা ফিল্মের মতো লাগে।" /></p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            <div className="tile">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-black"><div className="kb absolute inset-[-8%] bg-[radial-gradient(circle_at_30%_35%,rgba(240,220,180,0.6),transparent_30%),linear-gradient(160deg,#4a3d2e,#1a1510)]" /></div>
              <p className="tile-title"><L en="Archive photos that move" bn="আর্কাইভ ছবি যা নড়ে" /></p><p className="tile-text"><L en="Slow push-ins, pull-outs and pans over a blurred fill." bn="ধীরে জুম-ইন, জুম-আউট আর প্যান, পেছনে ঝাপসা ব্যাকগ্রাউন্ড।" /></p>
            </div>
            <div className="tile">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                <div className="parallax-bg absolute inset-[-10%] bg-[linear-gradient(180deg,#203a43,#0f2027)] blur-[2px]" />
                <div className="parallax-fg absolute bottom-[-6%] left-[18%] h-[78%] w-[64%] rounded-t-[40%] bg-[linear-gradient(180deg,#c9a46b,#5a4127)] shadow-2xl" />
              </div>
              <p className="tile-title"><L en="Depth on still photos" bn="স্থির ছবিতে গভীরতা" /></p><p className="tile-text"><L en="Picture and background move at different speeds, a 2.5D parallax." bn="ছবি আর পেছনের অংশ আলাদা গতিতে নড়ে, ২.৫D প্যারালাক্স।" /></p>
            </div>
            <div className="tile">
              <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-[#0b110e] text-center">
                <div><p className="rise-loop text-xl font-semibold">THE TAX</p><p className="rise-loop mt-1 text-xl font-semibold text-lime-200" style={{ animationDelay: "0.5s" }}>NEARLY BROKE HIM</p></div>
              </div>
              <p className="tile-title"><L en="Kinetic type, line by line" bn="লাইন ধরে ধরে কাইনেটিক টাইপ" /></p><p className="tile-text"><L en="Words rise in as they are spoken; numbers count up." bn="যে শব্দ বলা হয় সেটা ভেসে ওঠে; সংখ্যা গুনে গুনে বাড়ে।" /></p>
            </div>
            <div className="tile">
              <div className="relative grid aspect-video grid-cols-2 overflow-hidden rounded-xl bg-[#efe6d2] text-[#1d1a16]">
                <div className="grid place-items-center border-r border-[#4a443c]/40 p-3 text-center text-sm font-semibold">“2011”<br /><span className="text-xs font-normal">most reports</span></div>
                <div className="grid place-items-center p-3 text-center text-sm font-semibold">“2012”<br /><span className="text-xs font-normal">one interview</span></div>
              </div>
              <p className="tile-title"><L en="Both sides, side by side" bn="দুই পক্ষ, পাশাপাশি" /></p><p className="tile-text"><L en="When sources disagree, the film shows both versions." bn="সোর্সে মতভেদ থাকলে ফিল্ম দুটো ভার্সনই দেখায়।" /></p>
            </div>
            <div className="tile">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                <div className="kb absolute inset-[-6%] bg-[linear-gradient(120deg,#0c3b46,#1d6f73_40%,#d79a5a_75%,#5a2f1a)]" />
                <div className="absolute inset-x-0 top-0 h-[12%] bg-black" /><div className="absolute inset-x-0 bottom-0 h-[12%] bg-black" />
              </div>
              <p className="tile-title"><L en="A look per genre" bn="ধরন অনুযায়ী লুক" /></p><p className="tile-text"><L en="Cinematic 2.39:1 for stories, faded archive for history, clean for explainers." bn="গল্পে সিনেমাটিক ২.৩৯:১, ইতিহাসে পুরোনো আর্কাইভ লুক, ব্যাখ্যায় পরিষ্কার লুক।" /></p>
            </div>
            <div className="tile">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_45%,#11252a,#070f11)]">
                <svg viewBox="0 0 320 180" className="kb absolute inset-0 h-full w-full">
                  <path d="M40 30 L120 26 L150 60 L176 58 L196 96 L188 150 L150 176 L110 166 L96 120 L60 100 Z" fill="#26402f" stroke="#bef264" strokeWidth="2" />
                  <path d="M196 96 L260 70 L300 90 L292 150 L232 168 L188 150 Z" fill="#1a2a23" stroke="#3b5a4a" strokeWidth="1.5" />
                  <circle cx="150" cy="96" r="22" fill="none" stroke="#bef264" strokeOpacity="0.3" strokeWidth="2" />
                  <circle cx="150" cy="96" r="12" fill="#bef264" fillOpacity="0.12" stroke="#bef264" strokeOpacity="0.5" strokeWidth="2" />
                  <circle cx="150" cy="96" r="4.5" fill="#bef264" stroke="#fff" strokeWidth="1.5" />
                </svg>
                <span className="rise-loop absolute left-[52%] top-[30%] rounded bg-black/60 px-2 py-0.5 text-xs font-semibold tracking-wide">CAIRO, EGYPT</span>
              </div>
              <p className="tile-title"><L en="Animated maps, no map fees" bn="অ্যানিমেটেড ম্যাপ, কোনো ফি ছাড়া" /></p><p className="tile-text"><L en="The country lights up, a pin drops, the name appears; drawn from public-domain map data." bn="দেশটা আলোকিত হয়, পিন পড়ে, নাম ভেসে ওঠে; পাবলিক-ডোমেইন ম্যাপ ডেটা থেকে আঁকা।" /></p>
            </div>
            <div className="tile">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-[#0b110e]">
                <div className="absolute inset-0 flex items-end gap-1.5 p-4">{[38, 52, 30, 64, 46, 72, 58, 84].map((h, i) => <span key={i} className="bar flex-1 rounded-t bg-lime-300/80" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />)}</div>
              </div>
              <p className="tile-title"><L en="Captions on the word" bn="শব্দের সাথে সাথে ক্যাপশন" /></p><p className="tile-text"><L en="Captions follow the voice's timing; Shorts light up each word." bn="ক্যাপশন কণ্ঠের সময় মেনে চলে; Shorts-এ প্রতিটা শব্দ আলো হয়ে ওঠে।" /></p>
            </div>
          </div>
        </div>
      </section>

      {/* Formats */}
      <section id="formats" className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow><L en="Formats" bn="ধরন" /></Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><L en={`${FORMATS.length} kinds of documentary, one engine.`} bn={`${FORMATS.length} ধরনের ডকুমেন্টারি, একটাই ইঞ্জিন।`} /></h2>
          <p className="mt-5 leading-7 text-white/60"><L en="Each format sets the hook, the beats, the look and the music. The film itself is always written new." bn="প্রতিটা ধরন ঠিক করে দেয় হুক, গল্পের ধাপ, লুক আর মিউজিক। কিন্তু ফিল্মটা প্রতিবার নতুন করে লেখা হয়।" /></p>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((f) => (
            <li key={f.id} className="rounded-2xl border border-white/10 bg-[#0d1210] p-5 transition hover:border-lime-300/30">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold"><L en={f.name} bn={f.bn} /></h3>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">{f.minutes[0]}–{f.minutes[1]} min</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/50" data-l="en">{f.hook}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Cost */}
      <section id="cost" className="relative z-10 scroll-mt-20 border-y border-white/10 bg-[linear-gradient(180deg,rgba(190,242,100,0.05),transparent)]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-12 lg:py-24">
          <div>
            <Eyebrow><L en="Cost" bn="খরচ" /></Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><L en="See the price before you start." bn="শুরুর আগেই দাম দেখুন।" /></h2>
            <p className="mt-5 leading-7 text-white/60">
              <L
                en="No credits that vanish on a failed render. The studio shows the estimate first, a failed step stops with its reason, and a resumed film never pays for a finished stage again. Saving mode halves the writing cost and takes a few hours."
                bn="ব্যর্থ রেন্ডারে হারিয়ে যাওয়া ক্রেডিট নেই। স্টুডিও আগে আনুমানিক খরচ দেখায়, কোনো ধাপ ব্যর্থ হলে কারণসহ থামে, আর আবার চালালে শেষ হওয়া ধাপের টাকা আর লাগে না। সাশ্রয়ী মোডে লেখার খরচ অর্ধেক, তবে কয়েক ঘণ্টা সময় লাগে।"
              />
            </p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b100e]">
            <div className="grid grid-cols-3 bg-white/[0.04] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
              <span><L en="Film" bn="ফিল্ম" /></span><span><L en="Standard" bn="সাধারণ" /></span><span className="text-lime-300"><L en="Saving mode" bn="সাশ্রয়ী মোড" /></span>
            </div>
            {PRICES.map((p) => (
              <div key={p.minutes} className="grid grid-cols-3 items-center border-t border-white/10 px-5 py-4 text-sm">
                <span className="text-white/85"><L en={`${p.minutes} minutes`} bn={`${p.minutes} মিনিট`} /></span>
                <span className="text-white/70">{p.normal}</span>
                <span className="font-semibold text-lime-200">{p.saving}</span>
              </div>
            ))}
            <p className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-white/45">
              <L
                en="Estimates for Claude's research, writing and checking. Archive pictures, Pexels and Pixabay are free; rendering runs on GitHub's free minutes; your own voice is free. ElevenLabs narration and music use your ElevenLabs plan."
                bn="এটা Claude-এর রিসার্চ, লেখা আর যাচাইয়ের আনুমানিক খরচ। আর্কাইভ ছবি, Pexels আর Pixabay ফ্রি; রেন্ডার চলে GitHub-এর ফ্রি মিনিটে; নিজের কণ্ঠ ফ্রি। ElevenLabs-এর ন্যারেশন আর মিউজিক আপনার ElevenLabs প্ল্যান থেকে।"
              />
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 mx-auto w-full max-w-4xl scroll-mt-20 px-4 py-20 sm:px-8 lg:py-28">
        <Eyebrow><L en="Questions" bn="প্রশ্নোত্তর" /></Eyebrow>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><L en="Straight answers." bn="সোজা উত্তর।" /></h2>
        <div className="mt-10 divide-y divide-white/10 rounded-3xl border border-white/10">
          {FAQ.map((f) => (
            <details key={f.q[0]} className="group p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                <L en={f.q[0]} bn={f.q[1]} />
                <span className="text-lime-300 transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-white/60"><L en={f.a[0]} bn={f.a[1]} /></p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-20 sm:px-8 lg:px-12">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-lime-300/20 bg-gradient-to-r from-emerald-950/60 to-[#101714] p-8 sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl"><L en="Your first documentary starts with one topic." bn="আপনার প্রথম ডকুমেন্টারি শুরু হয় একটা বিষয় দিয়ে।" /></h2>
            <p className="mt-2 text-sm text-white/55"><L en="Research, script, pictures, voice, music and render, in one run." bn="রিসার্চ, স্ক্রিপ্ট, ছবি, কণ্ঠ, মিউজিক আর রেন্ডার, এক রানেই।" /></p>
          </div>
          <a href="/studio/#film" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-lime-300 px-6 py-3.5 text-sm font-semibold text-[#09110c] transition hover:bg-lime-200">
            <L en="Open the studio" bn="স্টুডিও খুলুন" /> <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-4 py-8 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Zupona AI · <a href="https://zupona.com" className="hover:text-lime-200">zupona.com</a>
      </footer>
    </main>
  );
}
