import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from "react";
import {
  AGES,
  CATEGORIES,
  DURATION_PRESETS,
  INSPIRATIONS,
  MAX_MINUTES,
  MIN_MINUTES,
  MUSIC,
  STYLES,
  estimateCredits,
  findOption,
  formatClock,
  formatRuntime,
  planChapters,
  workingTitle,
  type AgeId,
  type CategoryId,
  type Chapter,
  type Mode,
  type MusicId,
  type StyleId,
} from "./data";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BulbIcon,
  CategoryIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  CoinsIcon,
  CompassIcon,
  CopyIcon,
  FilmIcon,
  HomeIcon,
  LayersIcon,
  MicIcon,
  MinusIcon,
  MoonIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RecordIcon,
  SparkleIcon,
  StopIcon,
  SunIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
  WandIcon,
  WaveformIcon,
} from "./icons";
import { FoxMark, HeroMountains, PosterArt } from "./art";
import { Select } from "./select";

const DRAFT_KEY = "zupona:studio-draft:v1";
const THEME_KEY = "zupona:theme";
const IDEA_MAX = 500;
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const PREVIEW_SECONDS = 12;

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const eyebrow = "text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-ink";

type Voice = { name: string; size: number; seconds: number; url: string; source: "upload" | "record" };

type Draft = {
  mode: Mode;
  idea: string;
  minutes: number;
  category: CategoryId;
  age: AgeId;
  style: StyleId;
  music: MusicId;
  topic: string;
};

const DEFAULT_DRAFT: Draft = {
  mode: "idea",
  idea: "",
  minutes: 8,
  category: "nature",
  age: "all",
  style: "cinematic",
  music: "epic",
  topic: "",
};

function readDraft(): Partial<Draft> {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw) as Partial<Record<keyof Draft, unknown>>;
    const pick = <T extends string>(value: unknown, allowed: { id: T }[]) =>
      allowed.some((o) => o.id === value) ? (value as T) : undefined;
    const out: Partial<Draft> = {};
    if (saved.mode === "idea" || saved.mode === "voice") out.mode = saved.mode;
    if (typeof saved.idea === "string") out.idea = saved.idea.slice(0, IDEA_MAX);
    if (typeof saved.topic === "string") out.topic = saved.topic.slice(0, 140);
    if (typeof saved.minutes === "number" && Number.isFinite(saved.minutes))
      out.minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(saved.minutes)));
    out.category = pick(saved.category, CATEGORIES);
    out.age = pick(saved.age, AGES);
    out.style = pick(saved.style, STYLES);
    out.music = pick(saved.music, MUSIC);
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<Draft>;
  } catch {
    return {};
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExtension(name: string) {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ");
}

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */

export default function Landing() {
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [ready, setReady] = useState(false);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  const update = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  // Restore the saved draft after hydration, then keep saving it.
  useEffect(() => {
    setDraft((d) => ({ ...d, ...readDraft() }));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage can be unavailable (private mode); the page still works */
    }
  }, [draft, ready]);

  const category = findOption(CATEGORIES, draft.category);
  const voiceLocked = draft.mode === "voice" && voice !== null;
  const totalSeconds = voiceLocked ? voice.seconds : draft.minutes * 60;
  const billedMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
  const credits = estimateCredits(billedMinutes);
  const chapters = useMemo(() => planChapters(totalSeconds), [totalSeconds]);

  const userText = draft.mode === "idea" ? draft.idea : draft.topic || (voice ? stripExtension(voice.name) : "");
  const hasOwnTitle = workingTitle(userText) !== "";
  const title = hasOwnTitle ? workingTitle(userText) : category.title;
  const subtitle = hasOwnTitle
    ? `${findOption(STYLES, draft.style).label} · ${findOption(MUSIC, draft.music).label}`
    : category.subtitle;

  const loadIdea = (id: CategoryId) => {
    const pick = findOption(CATEGORIES, id);
    setDraft((d) => ({ ...d, mode: "idea", category: id, idea: pick.idea }));
    setError("");
    const studio = document.getElementById("studio");
    studio?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => ideaRef.current?.focus({ preventScroll: true }), 450);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1400);
  };

  const create = () => {
    if (draft.mode === "idea" && draft.idea.trim().length < 12) {
      setError("Tell us a little more about your idea. One sentence is plenty.");
      ideaRef.current?.focus();
      return;
    }
    if (draft.mode === "voice" && !voice) {
      setError("Add your narration first: upload an audio file or record one.");
      return;
    }
    setError("");
    setBriefOpen(true);
  };

  const brief = {
    title,
    mode: draft.mode,
    idea: draft.mode === "idea" ? draft.idea.trim() : draft.topic.trim(),
    voiceName: voice?.name,
    runtime: formatRuntime(totalSeconds),
    category: category.label,
    age: findOption(AGES, draft.age).label,
    style: findOption(STYLES, draft.style).label,
    music: findOption(MUSIC, draft.music).label,
    credits,
    chapters,
  };

  return (
    <div id="top" className="relative min-h-screen overflow-x-clip bg-canvas pb-28 font-sans text-ink md:pb-0">
      <a
        href="#studio"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-canvas focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to the studio
      </a>

      <div className="pointer-events-none absolute right-0 top-0 h-[360px] w-full max-w-[960px] [mask-image:radial-gradient(120%_100%_at_100%_0%,#000_45%,transparent_80%)] sm:h-[520px]">
        <HeroMountains className="size-full" />
      </div>

      <Header />

      <main>
        <section className={`${container} relative z-10 pt-6 sm:pt-12 lg:pt-16`} aria-labelledby="hero-title">
          <h1
            id="hero-title"
            className="font-serif text-[clamp(38px,11.5vw,46px)] font-normal leading-[1] tracking-[-0.025em] text-ink motion-safe:animate-rise sm:text-[64px] lg:text-[80px]"
          >
            Create your own
            <br />
            <em className="font-normal italic">documentary</em>
          </h1>
          <p className="mt-5 max-w-[30rem] text-[17px] leading-[1.6] text-ink-2 motion-safe:animate-rise motion-safe:[animation-delay:90ms] sm:text-[19px]">
            Turn your ideas into stunning, cinematic documentaries — in minutes.
          </p>
        </section>

        <section
          id="studio"
          aria-label="Documentary studio"
          className={`${container} relative z-10 mt-8 grid scroll-mt-4 grid-cols-1 items-start gap-12 sm:mt-10 lg:mt-14 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:gap-14`}
        >
          <Composer
            draft={draft}
            update={update}
            voice={voice}
            setVoice={setVoice}
            voiceLocked={voiceLocked}
            totalSeconds={totalSeconds}
            credits={credits}
            error={error}
            setError={setError}
            onCreate={create}
            ideaRef={ideaRef}
            flash={flash}
          />
          <Preview
            category={draft.category}
            title={title}
            subtitle={subtitle}
            runtime={formatRuntime(totalSeconds)}
            age={findOption(AGES, draft.age).label}
            chapters={chapters}
            totalSeconds={totalSeconds}
          />
        </section>

        <Explore onPick={loadIdea} />
        <HowItWorks />
        <Closing />
      </main>

      <Footer />
      <MobileNav />
      <BriefDialog open={briefOpen} onClose={() => setBriefOpen(false)} brief={brief} />
    </div>
  );
}

/* ================================================================== */
/* Header                                                              */
/* ================================================================== */

function Header() {
  return (
    <header className={`${container} relative z-20 flex items-center justify-between gap-4 py-4 sm:py-6`}>
      <a href="#top" className="flex items-center gap-3 rounded-xl" aria-label="Zupona, back to top">
        <FoxMark className="size-10 sm:size-11" />
        <span className="text-[20px] font-medium tracking-[0.34em] text-ink sm:text-[22px]">ZUPONA</span>
      </a>
      <nav aria-label="Primary" className="hidden items-center gap-1 rounded-full border border-line bg-surface/70 p-1 backdrop-blur md:flex">
        {[
          ["#studio", "Studio"],
          ["#explore", "Explore"],
          ["#how", "How it works"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full px-4 py-2 text-[15px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <a
          href="https://zupona.com"
          aria-label="Go to Zupona"
          title="Zupona"
          className="grid size-11 place-items-center rounded-full border border-line-strong bg-surface/60 text-ink backdrop-blur transition hover:border-ink/40"
        >
          <UserIcon size={22} />
        </a>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = root.dataset.theme ?? (systemDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", next === "dark" ? "#262624" : "#FAF9F5"));
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Light or dark"
      className="grid size-11 place-items-center rounded-full text-ink-2 transition hover:bg-sunken hover:text-ink"
    >
      <MoonIcon size={20} className="dark:hidden" />
      <SunIcon size={20} className="hidden dark:block" />
    </button>
  );
}

/* ================================================================== */
/* Composer                                                            */
/* ================================================================== */

type ComposerProps = {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  voice: Voice | null;
  setVoice: (v: Voice | null) => void;
  voiceLocked: boolean;
  totalSeconds: number;
  credits: number;
  error: string;
  setError: (e: string) => void;
  onCreate: () => void;
  ideaRef: RefObject<HTMLTextAreaElement>;
  flash: boolean;
};

function Composer(props: ComposerProps) {
  const { draft, update, voiceLocked, totalSeconds, credits, onCreate, flash, setError } = props;
  const tabs: { id: Mode; label: string; icon: ReactNode }[] = [
    { id: "idea", label: "Idea", icon: <BulbIcon size={21} /> },
    { id: "voice", label: "Voiceover", icon: <MicIcon size={21} /> },
  ];

  const selectMode = (mode: Mode) => {
    update("mode", mode);
    setError("");
  };

  const hours = Math.floor(draft.minutes / 60);
  const mins = draft.minutes % 60;
  const lockedClock = formatRuntime(totalSeconds);

  return (
    <div
      className={`rounded-[28px] border border-line bg-surface p-4 shadow-card transition-shadow duration-500 motion-safe:animate-rise motion-safe:[animation-delay:160ms] sm:p-6 ${
        flash ? "ring-4 ring-brand/25" : "ring-0 ring-transparent"
      }`}
    >
      {/* Mode tabs */}
      <div role="tablist" aria-label="How do you want to start?" className="relative grid grid-cols-2 rounded-full bg-sunken p-1">
        <span
          aria-hidden="true"
          className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-brand-gradient shadow-cta transition-transform duration-300 ease-[cubic-bezier(.3,.7,.2,1)] ${
            draft.mode === "voice" ? "translate-x-full" : ""
          }`}
        />
        {tabs.map((tab) => {
          const selected = draft.mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectMode(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const next = tab.id === "idea" ? "voice" : "idea";
                  selectMode(next);
                  document.getElementById(`tab-${next}`)?.focus();
                }
              }}
              className={`relative z-10 flex h-12 items-center justify-center gap-2.5 rounded-full text-[16px] font-medium transition-colors duration-300 ${
                selected ? "text-white" : "text-muted hover:text-ink"
              }`}
            >
              <span className={selected ? "text-white" : ""}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {draft.mode === "idea" ? <IdeaPanel {...props} /> : <VoicePanel {...props} />}

      {/* Duration */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p id="duration-label" className="text-[17px] font-medium text-ink">
            Duration
          </p>
          {voiceLocked && <p className="mt-0.5 text-[13px] text-muted">Matched to your narration</p>}
        </div>
        <div className="flex items-center gap-2">
          <Select
            label="Preset lengths"
            triggerLabel="Choose a preset length"
            value={String(draft.minutes)}
            options={DURATION_PRESETS}
            onChange={(v) => update("minutes", Number(v))}
            align="end"
            disabled={voiceLocked}
            triggerClassName="grid size-11 place-items-center rounded-full border border-line-strong text-ink-2 transition hover:border-ink/40 hover:text-ink disabled:opacity-40 min-[380px]:size-12"
          >
            <ClockIcon size={22} />
          </Select>
          <div role="group" aria-labelledby="duration-label" className="flex h-11 items-center rounded-full bg-sunken p-1 min-[380px]:h-12">
            <StepButton
              label="Shorter"
              disabled={voiceLocked || draft.minutes <= MIN_MINUTES}
              onClick={() => update("minutes", Math.max(MIN_MINUTES, draft.minutes - 1))}
            >
              <MinusIcon size={20} />
            </StepButton>
            <output aria-live="polite" className="w-[4.9rem] text-center text-[16px] font-medium tabular-nums text-ink min-[380px]:w-[5.6rem] min-[380px]:text-[17px]">
              {voiceLocked ? lockedClock : `${hours}h ${String(mins).padStart(2, "0")}m`}
            </output>
            <StepButton
              label="Longer"
              disabled={voiceLocked || draft.minutes >= MAX_MINUTES}
              onClick={() => update("minutes", Math.min(MAX_MINUTES, draft.minutes + 1))}
            >
              <PlusIcon size={20} />
            </StepButton>
          </div>
        </div>
      </div>

      {/* Idea + age systems */}
      <div className="mt-5 grid grid-cols-1 rounded-2xl border border-line min-[360px]:grid-cols-2">
        <div className="min-w-0 p-2.5 sm:p-4">
          <p className="flex items-center gap-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted sm:text-[11.5px]">
            <CategoryIcon id={draft.category} size={16} /> Idea system
          </p>
          <Select
            label="Idea system"
            triggerLabel={`Idea system: ${findOption(CATEGORIES, draft.category).label}`}
            value={draft.category}
            options={CATEGORIES}
            onChange={(v) => update("category", v)}
            renderIcon={(id) => <CategoryIcon id={id} size={18} />}
            triggerClassName="mt-3 flex h-11 w-full items-center justify-between gap-1 rounded-full border border-line-strong py-1 pl-1 pr-2.5 transition hover:border-ink/40 sm:pr-3"
          >
            <span className="inline-flex h-full min-w-0 items-center gap-1.5 rounded-full bg-brand-gradient px-2.5 font-semibold text-white sm:gap-2 sm:px-3">
              <CategoryIcon id={draft.category} size={17} className="shrink-0" />
              <span className="truncate text-[15px]">{findOption(CATEGORIES, draft.category).label}</span>
            </span>
            <ChevronDownIcon size={18} className="shrink-0 text-muted" />
          </Select>
        </div>
        <div className="min-w-0 border-t border-line p-2.5 min-[360px]:border-l min-[360px]:border-t-0 sm:p-4">
          <p className="flex items-center gap-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted sm:text-[11.5px]">
            <UsersIcon size={16} /> Age system
          </p>
          <Select
            label="Age system"
            triggerLabel={`Age system: ${findOption(AGES, draft.age).label}`}
            value={draft.age}
            options={AGES}
            onChange={(v) => update("age", v)}
            align="end"
            renderIcon={() => <UsersIcon size={18} />}
            triggerClassName="mt-3 flex h-11 w-full items-center justify-between gap-1 rounded-full border border-line-strong pl-3 pr-2.5 transition hover:border-ink/40 sm:pl-3.5 sm:pr-3"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 text-ink sm:gap-2">
              <UsersIcon size={17} className="shrink-0 text-ink-2" />
              <span className="truncate text-[15px] font-medium">{findOption(AGES, draft.age).label}</span>
            </span>
            <ChevronDownIcon size={18} className="shrink-0 text-muted" />
          </Select>
        </div>
      </div>

      {/* Style + music */}
      <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <Select
          label="Style"
          triggerLabel={`Style: ${findOption(STYLES, draft.style).label}`}
          value={draft.style}
          options={STYLES}
          onChange={(v) => update("style", v)}
          renderIcon={() => <FilmIcon size={18} />}
          triggerClassName={rowTrigger}
        >
          <RowContent icon={<FilmIcon size={20} />} label="Style" value={findOption(STYLES, draft.style).label} />
        </Select>
        <Select
          label="Music"
          triggerLabel={`Music: ${findOption(MUSIC, draft.music).label}`}
          value={draft.music}
          options={MUSIC}
          onChange={(v) => update("music", v)}
          align="end"
          renderIcon={() => <MusicIcon size={18} />}
          triggerClassName={rowTrigger}
        >
          <RowContent icon={<MusicIcon size={20} />} label="Music" value={findOption(MUSIC, draft.music).label} />
        </Select>
      </div>

      {/* Create */}
      <button
        type="button"
        onClick={onCreate}
        className="group relative mt-5 flex h-[60px] w-full items-center justify-center overflow-hidden rounded-2xl bg-brand-gradient px-4 text-white shadow-cta transition hover:brightness-110 active:scale-[0.992]"
      >
        <span className="flex items-center gap-2.5 text-[16px] font-semibold sm:text-[17px]">
          <SparkleIcon size={20} className="transition-transform duration-300 group-hover:rotate-[20deg] group-hover:scale-110" />
          Create documentary
        </span>
        <span className="ml-3 hidden h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/25 px-3 text-[13.5px] font-semibold text-white min-[360px]:flex sm:ml-5">
          <CoinsIcon size={17} />
          <span>
            ~{credits} <span className="sr-only min-[400px]:not-sr-only">credits</span>
          </span>
          <span className="sr-only">estimated credits</span>
        </span>
      </button>
      <p className="mt-3 text-center text-[13px] text-muted">Your settings save automatically on this device.</p>
    </div>
  );
}

const rowTrigger =
  "flex h-full min-h-[64px] w-full items-center gap-2.5 rounded-2xl bg-sunken p-2.5 text-left transition hover:bg-sunken-strong sm:gap-3 sm:p-3";

function RowContent({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink-2 shadow-thumb sm:size-10">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        <span className="line-clamp-2 block text-[13px] leading-snug text-muted">{value}</span>
      </span>
      <ChevronRightIcon size={18} className="hidden shrink-0 text-muted min-[420px]:block" />
    </>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-35 min-[380px]:size-10"
    >
      {children}
    </button>
  );
}

/* ---------------------------- Idea panel ---------------------------- */

function IdeaPanel({ draft, update, error, setError, ideaRef }: ComposerProps) {
  const typing = useRef<number | null>(null);

  const stopTyping = () => {
    if (typing.current !== null) window.clearInterval(typing.current);
    typing.current = null;
  };
  useEffect(() => stopTyping, []);

  const inspire = () => {
    stopTyping();
    const pool = INSPIRATIONS.filter((i) => i.text !== draft.idea);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    update("category", pick.category);
    setError("");
    ideaRef.current?.focus();
    if (prefersReducedMotion()) {
      update("idea", pick.text);
      return;
    }
    let shown = 0;
    update("idea", "");
    typing.current = window.setInterval(() => {
      shown = Math.min(pick.text.length, shown + 2);
      update("idea", pick.text.slice(0, shown));
      if (shown >= pick.text.length) stopTyping();
    }, 18);
  };

  return (
    <div id="panel-idea" role="tabpanel" aria-labelledby="tab-idea" className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="idea" className="text-[17px] font-medium text-ink">
          Describe your idea
        </label>
        <span className="text-[13px] tabular-nums text-muted" aria-hidden="true">
          {draft.idea.length}/{IDEA_MAX}
        </span>
      </div>
      <div
        className={`relative mt-3 rounded-2xl border bg-canvas/50 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 ${
          error ? "border-brand" : "border-line-strong"
        }`}
      >
        <textarea
          id="idea"
          ref={ideaRef}
          value={draft.idea}
          maxLength={IDEA_MAX}
          rows={3}
          onChange={(e) => {
            stopTyping();
            update("idea", e.target.value);
            if (error) setError("");
          }}
          placeholder="e.g. The life of a mountain lion in the wild, or the beauty of coral reefs…"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "studio-error" : undefined}
          className="block max-h-64 min-h-[116px] w-full resize-none bg-transparent px-4 pb-4 pr-14 pt-3.5 text-[16px] leading-relaxed text-ink outline-none placeholder:text-muted [field-sizing:content] focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={inspire}
          aria-label="Inspire me with an idea"
          title="Inspire me"
          className="absolute bottom-2.5 right-2.5 grid size-10 place-items-center rounded-xl text-ink-2 transition hover:bg-sunken hover:text-brand-ink active:scale-95"
        >
          <WandIcon size={22} />
        </button>
      </div>
      {error && (
        <p id="studio-error" role="alert" className="mt-2 text-[14px] text-brand-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------------------- Voice panel --------------------------- */

function VoicePanel({ draft, update, voice, setVoice, error, setError }: ComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<{ mr: MediaRecorder; stream: MediaStream; started: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Stop the microphone and playback when leaving the panel.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    [],
  );

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      if (recorder.current) setElapsed((Date.now() - recorder.current.started) / 1000);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const replaceVoice = (next: Voice | null) => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    if (voice) URL.revokeObjectURL(voice.url);
    setVoice(next);
  };

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    const looksAudio = file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm|opus)$/i.test(file.name);
    if (!looksAudio) {
      setError("That file doesn't look like audio. Try an MP3, WAV, M4A or OGG file.");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError("That file is larger than 200 MB. Try a shorter or compressed recording.");
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const seconds = Number.isFinite(probe.duration) ? probe.duration : 0;
      if (seconds < 1) {
        URL.revokeObjectURL(url);
        setError("We couldn't read the length of that file. Try another format.");
        return;
      }
      setError("");
      replaceVoice({ name: file.name, size: file.size, seconds: Math.min(seconds, MAX_MINUTES * 60), url, source: "upload" });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Your browser can't play that file. Try an MP3 or WAV.");
    };
    probe.src = url;
  };

  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't available in this browser. You can upload a file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = Date.now();
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = (Date.now() - started) / 1000;
        recorder.current = null;
        setRecording(false);
        if (seconds < 1 || !chunks.length) return;
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        replaceVoice({ name: `My narration.${ext}`, size: blob.size, seconds, url: URL.createObjectURL(blob), source: "record" });
      };
      recorder.current = { mr, stream, started };
      setElapsed(0);
      setRecording(true);
      mr.start(1000);
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings, or upload a file.");
    }
  };

  const stopRecording = () => {
    if (recorder.current?.mr.state === "recording") recorder.current.mr.stop();
  };

  const togglePlay = () => {
    if (!voice) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(voice.url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div id="panel-voice" role="tabpanel" aria-labelledby="tab-voice" className="mt-6">
      <p className="text-[17px] font-medium text-ink">Add your narration</p>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">Zupona builds the visuals around your voice, and the film runs as long as you speak.</p>

      {voice ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line-strong bg-canvas/50 p-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause narration" : "Play narration"}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-canvas transition hover:opacity-90"
          >
            {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-ink">{voice.name}</p>
            <p className="text-[13px] tabular-nums text-muted">
              {formatRuntime(voice.seconds)} · {formatBytes(voice.size)} · {voice.source === "record" ? "Recorded here" : "Uploaded"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => replaceVoice(null)}
            aria-label="Remove narration"
            className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      ) : recording ? (
        <div className="mt-3 flex items-center gap-4 rounded-2xl border border-brand/40 bg-brand/5 p-4" role="status">
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex size-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-3 rounded-full bg-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ink">Recording</p>
            <p className="text-[13px] tabular-nums text-muted">{formatClock(elapsed)}</p>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-canvas transition hover:opacity-90"
          >
            <StopIcon size={16} /> Stop
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-3 rounded-2xl border border-dashed px-4 py-6 text-center transition ${
            dragging ? "border-brand bg-brand/5" : error ? "border-brand" : "border-line-strong bg-canvas/50"
          }`}
        >
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-sunken text-brand-ink">
            <WaveformIcon size={22} />
          </span>
          <p className="mt-3 text-[15px] font-medium text-ink">Drop an audio file here</p>
          <p className="mt-0.5 text-[13px] text-muted">MP3, WAV, M4A or OGG · up to 200 MB</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={pillButton}>
              <UploadIcon size={18} /> Choose file
            </button>
            <button type="button" onClick={startRecording} className={pillButton}>
              <RecordIcon size={18} className="text-brand" /> Record
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && (
        <p id="studio-error" role="alert" className="mt-2 text-[14px] text-brand-ink">
          {error}
        </p>
      )}

      <label htmlFor="topic" className="mt-5 block text-[15px] font-medium text-ink">
        What is it about? <span className="font-normal text-muted">Optional</span>
      </label>
      <input
        id="topic"
        value={draft.topic}
        maxLength={140}
        onChange={(e) => update("topic", e.target.value)}
        placeholder="e.g. My grandfather's village on the Padma river"
        className="mt-2 h-12 w-full rounded-2xl border border-line-strong bg-canvas/50 px-4 text-[16px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
    </div>
  );
}

const pillButton =
  "inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink transition hover:border-ink/40";

/* ================================================================== */
/* Preview                                                             */
/* ================================================================== */

type PreviewProps = {
  category: CategoryId;
  title: string;
  subtitle: string;
  runtime: string;
  age: string;
  chapters: Chapter[];
  totalSeconds: number;
};

function Preview({ category, title, subtitle, runtime, age, chapters, totalSeconds }: PreviewProps) {
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const label = findOption(CATEGORIES, category).label;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setPlaying(false), PREVIEW_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [playing, run]);

  return (
    <aside aria-labelledby="preview-title" className="motion-safe:animate-rise motion-safe:[animation-delay:240ms] lg:sticky lg:top-6">
      <div className="flex items-end justify-between gap-4">
        <h2 id="preview-title" className="font-serif text-[23px] font-normal leading-[1.1] tracking-[-0.01em] text-ink min-[400px]:text-[26px] sm:text-[32px]">
          Your documentary preview
        </h2>
        <a href="#explore" className="group inline-flex shrink-0 items-center gap-1 pb-0.5 text-[14px] text-ink-2 sm:gap-1.5 sm:text-[15px] transition-colors hover:text-brand-ink">
          View all <ArrowRightIcon size={18} className="transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>

      <div className="relative isolate mt-5 aspect-[16/11] overflow-hidden rounded-[24px] bg-[#101018] shadow-poster">
        <div key={category} className={`absolute inset-0 motion-safe:animate-fade ${playing ? "is-playing" : ""}`}>
          <PosterArt category={category} className={`size-full ${playing ? "motion-safe:animate-kenburns" : ""}`} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/0" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/20 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md sm:left-5 sm:top-5">
          <CategoryIcon id={category} size={16} /> {label}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-5 pr-24 sm:p-6 sm:pr-28">
          <p className="line-clamp-2 text-balance font-serif text-[28px] leading-[1.05] text-white sm:text-[34px]">{title}</p>
          <p className="mt-2 line-clamp-1 text-[15px] text-white/85">{subtitle}</p>
          <p className="mt-3 flex items-center gap-3 text-[13.5px] text-white/85">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon size={16} /> {runtime}
            </span>
            <span aria-hidden="true" className="h-3.5 w-px bg-white/35" />
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon size={16} /> {age}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPlaying((p) => !p);
            setRun((r) => r + 1);
          }}
          aria-pressed={playing}
          aria-label={playing ? "Pause motion preview" : "Play motion preview"}
          className="absolute bottom-5 right-5 grid size-14 place-items-center rounded-full bg-white text-[#141413] shadow-lg transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
        >
          {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} className="translate-x-px" />}
        </button>
        {playing && <span key={run} className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-brand-gradient motion-safe:animate-progress" />}
      </div>

      <div className="mt-4 rounded-[24px] border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-medium text-ink">Story structure</p>
          <p className="text-[13px] tabular-nums text-muted">
            {chapters.length} chapters · {runtime}
          </p>
        </div>
        <Timeline chapters={chapters} totalSeconds={totalSeconds} />
      </div>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
        <span className="size-1.5 rounded-full bg-brand-gradient" /> Updates as you shape your film.
      </p>
    </aside>
  );
}

function Timeline({ chapters, totalSeconds }: { chapters: Chapter[]; totalSeconds: number }) {
  return (
    <>
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-brand-gradient" aria-hidden="true">
        {chapters.slice(1).map((c) => (
          <span
            key={c.title}
            style={{ left: `${(c.start / Math.max(1, totalSeconds)) * 100}%` }}
            className="absolute inset-y-0 w-1 -translate-x-1/2 bg-surface transition-[left] duration-500"
          />
        ))}
      </div>
      <ol className="mt-4 gap-x-6 sm:columns-2">
        {chapters.map((c) => (
          <li key={c.title} className="flex break-inside-avoid items-baseline gap-3 py-1 text-[14px]">
            <span className="w-14 shrink-0 tabular-nums text-muted">{formatClock(c.start)}</span>
            <span className="text-ink">{c.title}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/* ================================================================== */
/* Explore                                                             */
/* ================================================================== */

function Explore({ onPick }: { onPick: (id: CategoryId) => void }) {
  return (
    <section id="explore" aria-labelledby="explore-title" className="relative z-10 mt-24 scroll-mt-6 sm:mt-32">
      <div className={container}>
        <p className={eyebrow}>Explore</p>
        <h2 id="explore-title" className="mt-3 max-w-xl text-balance font-serif text-[36px] font-normal leading-[1.06] tracking-[-0.015em] sm:text-[52px]">
          Start from a story worth telling
        </h2>
        <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
          Pick an idea to load it into the studio, then make it entirely your own.
        </p>
      </div>
      <ul
        className={`${container} mt-9 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto pb-4 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden`}
      >
        {CATEGORIES.map((c) => (
          <li key={c.id} className="w-[80%] max-w-[22rem] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="group relative isolate block aspect-[4/5] w-full overflow-hidden rounded-[24px] bg-[#101018] text-left shadow-poster transition duration-300 hover:-translate-y-1 sm:aspect-[5/6]"
            >
              <PosterArt category={c.id} className="absolute inset-0 size-full transition-transform duration-700 ease-out group-hover:scale-[1.05]" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/5" />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
                <CategoryIcon id={c.id} size={14} /> {c.label}
              </span>
              <span className="absolute inset-x-0 bottom-0 p-5">
                <span className="block text-balance font-serif text-[26px] leading-[1.05] text-white">{c.title}</span>
                <span className="mt-2 line-clamp-2 block text-[13.5px] leading-relaxed text-white/80">{c.idea}</span>
                <span className="mt-4 flex items-center justify-between text-[13px] text-white/85">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    Use this idea <ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <ClockIcon size={15} /> {c.runtime}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ================================================================== */
/* How it works                                                        */
/* ================================================================== */

const STEPS = [
  {
    icon: <BulbIcon size={22} />,
    title: "Describe it",
    text: "Write a sentence about your idea, or bring your own voiceover. That is all it takes to begin.",
  },
  {
    icon: <LayersIcon size={22} />,
    title: "Shape it",
    text: "Set the length, the audience, the look and the score. Every choice stays yours to change.",
  },
  {
    icon: <FilmIcon size={22} />,
    title: "Watch it",
    text: "Zupona brings script, visuals, narration and music together into one film you can share.",
  },
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={`${container} relative z-10 mt-24 scroll-mt-6 sm:mt-32`}>
      <p className={eyebrow}>How it works</p>
      <h2 id="how-title" className="mt-3 max-w-2xl text-balance font-serif text-[36px] font-normal leading-[1.06] tracking-[-0.015em] sm:text-[52px]">
        From a single sentence to a finished film
      </h2>
      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-[26px] border border-line bg-surface p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand-ink">{s.icon}</span>
              <span className="font-serif text-[40px] italic leading-none text-line-strong">{i + 1}</span>
            </div>
            <h3 className="mt-10 font-serif text-[27px] font-normal leading-tight text-ink">{s.title}</h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ================================================================== */
/* Closing + footer                                                    */
/* ================================================================== */

function Closing() {
  return (
    <section className={`${container} relative z-10 mt-24 sm:mt-32`} aria-labelledby="closing-title">
      <div className="relative isolate overflow-hidden rounded-[32px] bg-[#07070B] px-6 py-16 text-center text-[#FAF8F3] ring-1 ring-inset ring-white/5 sm:px-12 sm:py-24">
        <span aria-hidden="true" className="absolute -left-24 top-1/4 -z-10 size-[26rem] rounded-full bg-[#2B63F6]/30 blur-[90px]" />
        <span aria-hidden="true" className="absolute -right-24 bottom-0 -z-10 size-[28rem] rounded-full bg-[#B43CC8]/30 blur-[100px]" />
        <span aria-hidden="true" className="absolute left-1/2 top-10 -z-10 size-40 -translate-x-1/2 rounded-full bg-[#EA3A8C]/25 blur-[60px]" />
        <FoxMark glow className="mx-auto size-16 sm:size-20" />
        <h2 id="closing-title" className="mx-auto mt-7 max-w-2xl text-balance font-serif text-[38px] font-normal leading-[1.05] tracking-[-0.015em] sm:text-[60px]">
          Every story deserves to be <em className="text-brand-gradient italic">seen.</em>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed text-[#C9C6BC] sm:text-[17px]">
          Bring an idea. Zupona will help you tell it beautifully.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <a
            href="#studio"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-gradient px-6 text-[15px] font-semibold text-white shadow-cta transition hover:brightness-110"
          >
            <SparkleIcon size={18} /> Start creating
          </a>
          <a
            href="https://zupona.com"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 px-6 text-[15px] font-medium text-[#FAF8F3] transition hover:border-white/50"
          >
            Visit Zupona <ArrowUpRightIcon size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={`${container} relative z-10 mt-16 flex flex-col gap-4 border-t border-line py-8 text-[14px] text-muted sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex items-center gap-2.5">
        <FoxMark className="size-6" />
        <span>
          © <span suppressHydrationWarning>{new Date().getFullYear()}</span> Zupona AI. Made for imagination.
        </span>
      </div>
      <nav aria-label="Footer" className="flex gap-5">
        <a href="#studio" className="transition-colors hover:text-ink">
          Studio
        </a>
        <a href="#explore" className="transition-colors hover:text-ink">
          Explore
        </a>
        <a href="https://zupona.com" className="transition-colors hover:text-ink">
          zupona.com
        </a>
      </nav>
    </footer>
  );
}

/* ================================================================== */
/* Mobile tab bar                                                      */
/* ================================================================== */

const NAV = [
  { id: "top", label: "Home", Icon: HomeIcon },
  { id: "studio", label: "Create", Icon: SparkleIcon },
  { id: "explore", label: "Explore", Icon: CompassIcon },
  { id: "how", label: "Guide", Icon: LayersIcon },
] as const;

function MobileNav() {
  const [active, setActive] = useState<string>("top");

  useEffect(() => {
    const sections = NAV.map((n) => (n.id === "top" ? document.getElementById("hero-title") : document.getElementById(n.id))).filter(
      (el): el is HTMLElement => el !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const target = visible[0].target as HTMLElement;
        setActive(target.id === "hero-title" ? "top" : target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={on ? "location" : undefined}
                className={`relative flex flex-col items-center gap-1 pb-3 pt-2.5 text-[12px] font-medium transition-colors ${on ? "text-brand-ink" : "text-muted"}`}
              >
                <Icon size={23} />
                {label}
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 h-[3px] w-9 rounded-full bg-brand-gradient transition-opacity ${on ? "opacity-100" : "opacity-0"}`}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ================================================================== */
/* Brief dialog                                                        */
/* ================================================================== */

type Brief = {
  title: string;
  mode: Mode;
  idea: string;
  voiceName?: string;
  runtime: string;
  category: string;
  age: string;
  style: string;
  music: string;
  credits: number;
  chapters: Chapter[];
};

function briefText(b: Brief) {
  return [
    "Zupona documentary brief",
    "",
    `Working title: ${b.title}`,
    b.mode === "idea" ? `Idea: ${b.idea}` : `Voiceover: ${b.voiceName ?? "—"}${b.idea ? ` (about: ${b.idea})` : ""}`,
    `Length: ${b.runtime} · Audience: ${b.age}`,
    `Idea system: ${b.category} · Style: ${b.style} · Music: ${b.music}`,
    `Estimated cost: ~${b.credits} credits`,
    "",
    "Chapters:",
    ...b.chapters.map((c) => `${formatClock(c.start)}  ${c.title}`),
  ].join("\n");
}

function BriefDialog({ open, onClose, brief }: { open: boolean; onClose: () => void; brief: Brief }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setCopied(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const copy = async () => {
    const text = briefText(brief);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
  };

  const facts = [
    ["Starts from", brief.mode === "idea" ? "Your idea" : "Your voiceover"],
    ["Style", brief.style],
    ["Music", brief.music],
    ["Estimated cost", `~${brief.credits} credits`],
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby="brief-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[28px] border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[#141413]/50 backdrop:backdrop-blur-[2px] open:motion-safe:animate-sheet sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      <div className="max-h-[92dvh] overflow-y-auto p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`${eyebrow} flex items-center gap-1.5`}>
              <CheckIcon size={16} /> Brief ready
            </p>
            <h2 id="brief-title" className="mt-2 text-balance font-serif text-[30px] font-normal leading-[1.1] text-ink">
              {brief.title}
            </h2>
            <p className="mt-2 text-[14px] text-muted">
              {brief.runtime} · {brief.category} · {brief.age}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {facts.map(([k, v]) => (
            <div key={k} className="bg-surface p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">{k}</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <p className="text-[15px] font-medium text-ink">Chapters</p>
          <Timeline chapters={brief.chapters} totalSeconds={brief.chapters[brief.chapters.length - 1]?.end ?? 60} />
        </div>

        <p className="mt-6 rounded-2xl bg-sunken p-4 text-[14px] leading-relaxed text-ink-2">
          Rendering happens in Zupona Studio, which is opening to creators soon. Your settings are saved on this device, so they
          will be waiting for you.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line-strong text-[15px] font-medium text-ink transition hover:border-ink/40"
          >
            {copied ? <CheckIcon size={18} className="text-brand-ink" /> : <CopyIcon size={18} />}
            {copied ? "Copied" : "Copy brief"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-medium text-canvas transition hover:opacity-90"
          >
            Keep editing
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? "Brief copied to clipboard" : ""}
        </p>
      </div>
    </dialog>
  );
}
