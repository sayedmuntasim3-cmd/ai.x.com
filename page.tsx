import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zupona AI — Turn Ideas Into Videos",
  description:
    "A new creative space for cinematic AI video. Bring your idea; let your imagination lead.",
  alternates: { canonical: "https://ai.zupona.com" },
};

const features = [
  {
    number: "01",
    title: "Start with an idea",
    description: "Begin with a simple concept, a scene, or a story you want the world to see.",
  },
  {
    number: "02",
    title: "Shape your vision",
    description: "Build a clear creative direction with mood, movement, and a cinematic feel.",
  },
  {
    number: "03",
    title: "Make it yours",
    description: "Create content designed to feel personal, memorable, and ready to share.",
  },
];

export default function ZuponaAiLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#080b0a] text-white selection:bg-lime-300 selection:text-black">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[700px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(3,126,91,0.28),transparent_65%)]" />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
        <a href="/" className="flex items-center gap-3" aria-label="Zupona AI home">
          <span className="grid size-10 place-items-center rounded-xl bg-lime-300 text-lg font-black text-[#07100c]">Z</span>
          <span className="text-lg font-semibold tracking-tight">zupona<span className="text-lime-300">.ai</span></span>
        </a>
        <a href="#how-it-works" className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-lime-300/60 hover:text-lime-200">
          Explore
        </a>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[78vh] w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 md:grid-cols-[1.05fr_0.95fr] md:py-20 lg:px-12">
        <div className="max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/[0.07] px-3.5 py-2 text-xs font-medium tracking-wide text-lime-200">
            <span className="size-1.5 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.9)]" />
            A new way to tell stories
          </div>
          <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Your ideas.
            <br />
            <span className="bg-gradient-to-r from-lime-200 via-emerald-300 to-teal-400 bg-clip-text text-transparent">Cinematic worlds.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/65 sm:text-lg">
            Meet Zupona AI — a creative space for turning imagination into video. From a spark of an idea to a story worth watching, your next scene starts here.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#how-it-works" className="inline-flex items-center gap-3 rounded-full bg-lime-300 px-6 py-3.5 text-sm font-semibold text-[#09110c] transition hover:-translate-y-0.5 hover:bg-lime-200">
              Discover the vision <span aria-hidden="true">↗</span>
            </a>
            <span className="text-sm text-white/45">Made for curious creators</span>
          </div>
          <div className="mt-12 flex items-center gap-5 border-t border-white/10 pt-6 text-xs uppercase tracking-[0.18em] text-white/40">
            <span>Imagine</span><span className="text-lime-300">✳</span><span>Create</span><span className="text-lime-300">✳</span><span>Share</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[520px]">
          <div className="absolute -inset-8 rounded-[3rem] bg-emerald-400/10 blur-3xl" />
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-white/15 bg-[#101714] p-3 shadow-2xl shadow-emerald-950/40">
            <div className="absolute inset-3 overflow-hidden rounded-[1.5rem] bg-[radial-gradient(ellipse_at_50%_25%,rgba(163,230,53,0.23),transparent_35%),linear-gradient(145deg,#1a3027_0%,#101715_48%,#050706_100%)]">
              <div className="absolute -right-12 top-16 size-64 rounded-full border border-lime-200/20" />
              <div className="absolute -right-2 top-28 size-44 rounded-full border border-lime-200/20" />
              <div className="absolute left-[-15%] top-[28%] h-48 w-[130%] rotate-[-18deg] rounded-[50%] border border-emerald-200/20 bg-emerald-200/[0.03] blur-[1px]" />
              <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#080b0a] via-[#080b0a]/70 to-transparent" />
              <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/70 backdrop-blur">
                <span className="size-1.5 rounded-full bg-lime-300" /> Creative mode
              </div>
              <div className="absolute bottom-7 left-6 right-6">
                <p className="text-xs uppercase tracking-[0.25em] text-lime-200/80">Scene 001 · The beginning</p>
                <p className="mt-3 max-w-sm text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Every great story starts with a thought.</p>
                <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-white/50">
                  <span>YOUR IMAGINATION, IN MOTION</span><span>✳ Z</span>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-3 rounded-2xl border border-white/10 bg-[#111815]/95 px-4 py-3 shadow-xl backdrop-blur sm:-left-8">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Made for</p>
            <p className="mt-1 text-sm font-medium">Storytellers & creators</p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 border-t border-white/10 bg-white/[0.025]">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-300">The creative process</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Big ideas deserve to be seen.</h2>
            <p className="mt-5 leading-7 text-white/55">A simple creative mindset: start with what you imagine, shape the story, and make something that stays with people.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.number} className="rounded-3xl border border-white/10 bg-[#0d1210] p-6 transition hover:border-lime-300/30 sm:p-8">
                <span className="text-sm font-medium text-lime-300">{feature.number}</span>
                <h3 className="mt-8 text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/55">{feature.description}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 flex flex-col justify-between gap-6 rounded-3xl border border-lime-300/20 bg-gradient-to-r from-emerald-950/50 to-[#101714] p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <p className="text-lg font-semibold">The future of your next story starts here.</p>
              <p className="mt-2 text-sm text-white/55">Zupona AI · A creative journey in progress.</p>
            </div>
            <a href="https://zupona.com" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-medium transition hover:border-lime-300/60 hover:text-lime-200">
              Visit Zupona <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-5 py-7 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Zupona AI. Made for imagination.
      </footer>
    </main>
  );
}
