# Next session brief (written 3 November 2026 from the whole first chat)

Read this, `docs/HANDOFF.md` and `docs/YOUTUBE_BENCHMARKS.md`. Do not re-analyse the old chat, the repository history or the web.

## 1. The owner's mission and standard

The goal is to build the world's best AI documentary video platform, Zupona AI Studio, and to compete for the top spot against InVideo, Runway, Pictory, Higgsfield, Descript and others. The owner's standing directive:

- Think like a world-class CTO, AI researcher and documentary producer.
- Choose the strongest practical solution, and never an average one when a better practical one exists.
- About 150 specialised agents, each with a meaningful job, an output and a check. The number means nothing without coordination and results.
- Excellence in every stage: research, fact-checking, storytelling, retention, footage discovery, scene matching, cinematic motion, natural narration, editing and sync, long films, render speed and final quality.
- Quality before appearances: no fake functionality and no placeholders claimed as done. Test, validate, handle errors, measure.
- Never destroy existing progress. Continue, don't restart, don't rewrite working code.
- Build for today's stage with the long-term vision in mind. Every task should create real user value.
- Be honest: no view count or "number one" can be guaranteed. Earn it with engineering and quality.

Every film must feel human-made and Hollywood or Bollywood level. Films can be any length, from 1 minute to 5 hours or more, and must never be "short of pictures".

**The owner's budget is very small.** Spend credits carefully:

- one agent at a time;
- long outputs written to files in parts;
- short replies in Bangla.

## 2. Two separate tracks: do not mix them up

| Track | What it is | Where |
|---|---|---|
| A. The platform | The website and engine clients will use | `engine/` (formats, versions, voice, Quran, story mode, 151-role roster, run plans; tests); the first screen at `/studio/` on branch `claude/studio-first-screen-y4tp15` |
| B. The Ramesh Babu film | A sample 45-minute documentary script made with the engine prompts, in two fully separate versions. It shows the quality the platform must reach | `productions/ramesh-babu/` |

The owner's current priority (3 Nov 2026):

1. Finish the **USA version** of the Ramesh Babu film.
2. Then put the effort into the platform for the **US market** (English first).

**The Bangladesh version of the film is postponed to save credits; do not start it.** Arabic and Bangla stay in the platform's design, but they are built after the English path works end to end.

A link from the landing page (the site's home page, `public/index.html`) to `/studio/` is a small Track A task for later.

## 3. Track B: exactly what is left

The topic is "Ramesh Babu: From Barber to Rolls-Royce", 45:00. Each version has six chapters (S5). A chapter is a timed list of scene lines carrying the narration, the shots, the stock search queries, the motion, the sound and the grade.

**USA** (American English, dollars):

| Ch | Title | Time | Scenes | Status |
|---|---|---|---|---|
| C1 | The Shop | 0:00-8:30 | SC0001-SC0054 | **partly written** (ends with `<!-- CONTINUE -->`): finish it |
| C2 | The Chair | 8:30-15:30 | SC0055-SC0095 | done |
| C3 | One Used Van | 15:30-22:30 | SC0096-SC0136 | done (use as the format example) |
| C4 | The Luxury Bet | 22:30-30:00 | SC0137-SC0181 | done |
| C5 | The Ghost and the Bill | 30:00-38:00 | SC0182-SC0228 | **not started** |
| C6 | Still at the Chair | 38:00-45:00 | SC0229-SC0270 | done |

**Bangladesh** (Bangla, Taka). S0 to S4 are done; every chapter is still to write:

| Ch | Title | Time | Scenes |
|---|---|---|---|
| C1 | কাঁচি | 0:00-7:00 | SC0001-SC0045 |
| C2 | কিস্তি | 7:00-14:30 | SC0046-SC0090 |
| C3 | চাবি | 14:30-22:30 | SC0091-SC0138 |
| C4 | ঘোস্ট | 22:30-30:00 | SC0139-SC0183 |
| C5 | কর | 30:00-36:00 | SC0184-SC0219 |
| C6 | আয়না | 36:00-45:00 | SC0220-SC0270 |

**Order of work.** One agent at a time; each step writes to files.

1. USA: finish C1, then write C5 (`productions/ramesh-babu/prompts/s5-USA-C1.txt`, `s5-USA-C5.txt`).
2. USA: QA (`qa-USA.txt` → `USA/qa.json`), then fixes (`fix-USA.txt`, which edits in place and keeps `.draft.md` copies), then the S6 report (`s6-USA.txt`) and the S7 publishing pack (`s7-USA.txt`).
3. Build the USA page: `cd productions/ramesh-babu && python3 assemble.py && npm install marked && node build.mjs result.json`.
4. Bangladesh: **postponed by the owner.** When it is resumed: C1 to C6, then QA, fixes, S6, S7 and the page, in the same way.

**Saving credits on the chapter agents.** Each agent reads:

- the version's `brief.md`;
- its own entry in `s3-chapters.json`;
- `s2.md` (the facts);
- `s4.md` (style, look, sound);
- one finished chapter as the format example (`USA/s5-C3.md`).

It does not read the whole engine manual. When the prompt names the manual, only sections 11 (compact scene-line format) and 16 (banned list) are needed. The prompt paths are relative to the repository root.

**Fixed rules for this film:**

- Facts only from `research_bio.json`. Where sources conflict, say "reports differ"; quotes are paraphrased with attribution.
- Footage only from Pexels, Pixabay, Videvo (free licence), Coverr and Mixkit, plus graphics. No AI imagery or audio.
- Never a stock face presented as Ramesh Babu or his family.
- The USA version is English only; the Bangladesh version is Bangla only. Never mix them.

## 4. Benchmarks

The owner sent 39 example videos. All 39 links, with what each one is and what to learn from it, are in `docs/YOUTUBE_BENCHMARKS.md`; use that file instead of searching again. The main lessons are already built into `engine/src/formats.mjs` (15 formats) and `docs/SYSTEM_V5.md`:

- a superlative or impossible title with a concrete noun;
- the hook stated within 30 seconds;
- a new section every 1 to 3 minutes;
- one real named person with an exact date (the Yarnhub pattern);
- the end state shown first, then how it happened.

## 5. Decisions that must not change

1. No human approval step inside a run. The owner publishes.
2. Three native versions: Arabic (Islamic outlook), English (USA), Bangla.
3. No "fictional story" label on screen. Invented stories get only a one-line note in the description; never call them true or attach them to a real person. Real people's stories are told from sources.
4. Quran:
   - verbatim Tanzil text only;
   - nothing laid under a recitation;
   - cut only at ayah ends;
   - never synthesised;
   - prophets, Companions, angels and Allah never depicted;
   - stories of prophets never told as fiction.
5. The owner's own voice is never altered. ElevenLabs: Multilingual v2 for English and Arabic, v3 for Bangla.
6. Footage only from legal free sources or with the creator's written permission. No downloading from Facebook, X, YouTube or TikTok.
7. Never push to zupona's `main`. No PR unless the owner asks. Run `cd engine && npm test` before every push.
8. Cloudflare will be connected later by the owner. The code only has to be ready, and `npx wrangler deploy --dry-run` passes.
