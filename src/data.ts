// Content and option lists for the Zupona documentary studio.
// Everything the page shows as a choice lives here, so copy can change without touching layout code.

export type Mode = "idea" | "voice";
export type CategoryId = "nature" | "ocean" | "space" | "history" | "science" | "culture";
export type AgeId = "all" | "kids" | "teens" | "adults";
export type StyleId = "cinematic" | "observational" | "archival" | "investigative" | "minimal" | "storybook";
export type MusicId = "epic" | "ambient" | "orchestral" | "piano" | "mystery" | "none";

export type Option<T extends string> = { id: T; label: string; hint?: string };

export type Category = Option<CategoryId> & {
  /** Sample film shown in the preview until the person writes their own idea. */
  title: string;
  subtitle: string;
  /** Starter idea used by the Explore cards. */
  idea: string;
  /** Running time shown on the sample poster. */
  runtime: string;
};

export const CATEGORIES: Category[] = [
  {
    id: "nature",
    label: "Nature",
    hint: "Wild places and the life within them",
    title: "Where the Glaciers Sing",
    runtime: "58m",
    subtitle: "A winter on the roof of the world",
    idea: "A snow leopard mother raising her cubs through one brutal Himalayan winter",
  },
  {
    id: "ocean",
    label: "Ocean",
    hint: "Reefs, deep water and migrations",
    title: "The Last Ocean",
    runtime: "1h 42m",
    subtitle: "Life beneath the surface",
    idea: "The secret 8,000 km migration of humpback whales across the Pacific",
  },
  {
    id: "space",
    label: "Space",
    hint: "Stars, planets and the people who study them",
    title: "Light From Elsewhere",
    runtime: "1h 12m",
    subtitle: "The search for a second Earth",
    idea: "How astronomers hunt for distant planets that could hold life",
  },
  {
    id: "history",
    label: "History",
    hint: "Empires, ruins and turning points",
    title: "Roads of Silk and Dust",
    runtime: "1h 36m",
    subtitle: "The cities that connected the world",
    idea: "The forgotten trading cities of the ancient Silk Road and the people who built them",
  },
  {
    id: "science",
    label: "Science",
    hint: "Discoveries, from microbes to machines",
    title: "The Invisible Engine",
    runtime: "46m",
    subtitle: "How microbes run the planet",
    idea: "The trillions of microbes that quietly keep our planet, and our bodies, alive",
  },
  {
    id: "culture",
    label: "Culture",
    hint: "People, places and traditions",
    title: "After Midnight",
    runtime: "52m",
    subtitle: "Inside Asia's night markets",
    idea: "The night food markets of Dhaka, Bangkok and Taipei, from first fire to last light",
  },
];

export const AGES: Option<AgeId>[] = [
  { id: "all", label: "All ages", hint: "Family friendly" },
  { id: "kids", label: "Kids 6+", hint: "Gentle pacing, simple words" },
  { id: "teens", label: "Teens 13+", hint: "Curious and fast-moving" },
  { id: "adults", label: "Adults 18+", hint: "Mature themes allowed" },
];

export const STYLES: Option<StyleId>[] = [
  { id: "cinematic", label: "Cinematic", hint: "Sweeping, film-grade visuals" },
  { id: "observational", label: "Observational", hint: "Patient, quiet and up close" },
  { id: "archival", label: "Archival", hint: "Vintage footage and photographs" },
  { id: "investigative", label: "Investigative", hint: "Sharp, evidence-led storytelling" },
  { id: "minimal", label: "Minimal", hint: "Clean type and motion graphics" },
  { id: "storybook", label: "Storybook", hint: "Illustrated, warm and playful" },
];

export const MUSIC: Option<MusicId>[] = [
  { id: "epic", label: "Epic & Inspiring", hint: "Soaring strings and drums" },
  { id: "ambient", label: "Calm Ambient", hint: "Soft textures that breathe" },
  { id: "orchestral", label: "Classic Orchestral", hint: "Timeless, emotional score" },
  { id: "piano", label: "Solo Piano", hint: "Intimate and reflective" },
  { id: "mystery", label: "Tension & Mystery", hint: "Low pulses, rising suspense" },
  { id: "none", label: "No music", hint: "Narration and natural sound" },
];

export const DURATION_PRESETS: Option<string>[] = [
  { id: "3", label: "3 min", hint: "Short" },
  { id: "5", label: "5 min", hint: "Quick watch" },
  { id: "8", label: "8 min", hint: "Classic" },
  { id: "15", label: "15 min", hint: "Deep dive" },
  { id: "30", label: "30 min", hint: "Episode" },
  { id: "60", label: "60 min", hint: "Feature" },
];

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 120;

/** Ideas the "Inspire me" wand types into the box, one category each. */
export const INSPIRATIONS: { text: string; category: CategoryId }[] = [
  { text: "The life of a mountain lion in the wild", category: "nature" },
  { text: "How a single oak tree supports a thousand species", category: "nature" },
  { text: "The great wildebeest migration, told from the river's edge", category: "nature" },
  { text: "The beauty and fragility of coral reefs", category: "ocean" },
  { text: "Glowing creatures of the deep sea and how they make light", category: "ocean" },
  { text: "The fishing families of the Sundarbans mangrove coast", category: "ocean" },
  { text: "The 50-year journey of the Voyager probes", category: "space" },
  { text: "What we would see standing on the surface of Mars", category: "space" },
  { text: "How a star is born, lives and dies", category: "space" },
  { text: "The rise and fall of the Mughal Empire", category: "history" },
  { text: "The engineers who built the pyramids of Giza", category: "history" },
  { text: "The lost river ports of ancient Bengal", category: "history" },
  { text: "How the human brain turns a moment into a memory", category: "science" },
  { text: "The race to build the first useful quantum computer", category: "science" },
  { text: "Why the honeybee matters more than we think", category: "science" },
  { text: "The last hand-loom muslin weavers of Bengal", category: "culture" },
  { text: "How jazz travelled from New Orleans to the world", category: "culture" },
  { text: "A day inside the world's busiest railway station", category: "culture" },
];

const BEATS = ["The world", "The question", "Rising stakes", "Up close", "The turn", "Other voices", "The reckoning"];

export type Chapter = { title: string; start: number; end: number };

/**
 * A simple narrative structure for a film of the given length: a cold open, a set of
 * middle chapters that grows with the running time, and a closing reflection.
 */
export function planChapters(totalSeconds: number): Chapter[] {
  const total = Math.max(60, Math.round(totalSeconds));
  const minutes = total / 60;
  const count = Math.min(9, Math.max(3, Math.round(minutes / 3) + 2));
  const open = Math.max(20, Math.round(total * 0.08));
  const close = Math.max(20, Math.round(total * 0.1));
  const middle = BEATS.slice(0, count - 2);
  const each = (total - open - close) / middle.length;

  const chapters: Chapter[] = [{ title: "Cold open", start: 0, end: open }];
  middle.forEach((title, i) => {
    chapters.push({ title, start: Math.round(open + each * i), end: Math.round(open + each * (i + 1)) });
  });
  chapters.push({ title: "What remains", start: total - close, end: total });
  return chapters;
}

export function estimateCredits(minutes: number) {
  return Math.max(2, Math.round(minutes * 1.25));
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatRuntime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  return r ? `${m}m ${String(r).padStart(2, "0")}s` : `${m} min`;
}

/** Turns free text into a short working title for the preview card. */
export function workingTitle(text: string, limit = 56) {
  let clean = text.trim().replace(/\s+/g, " ").replace(/^e\.g\.\s*/i, "");
  clean = clean.replace(/[.,;:!?\s]+$/, "");
  if (!clean) return "";
  if (clean.length > limit) {
    const cut = clean.slice(0, limit);
    const space = cut.lastIndexOf(" ");
    clean = `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[.,;:\s-]+$/, "")}…`;
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function findOption<O extends { id: string }>(options: O[], id: O["id"]): O {
  return options.find((o) => o.id === id) ?? options[0];
}
