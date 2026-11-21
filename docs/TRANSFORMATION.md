# The cinematic transformation (21 Nov 2026): decisions, corrections, gates

Source: the owner's "Ultimate Documentary Production Engine" brief (21 Nov 2026), checked against the
code by King's 1. This file overrides `docs/ROADMAP.md` steps 3–7. The missions live in `docs/missions/`.

## 1. What is really wrong today (evidence, not opinion)
Film 993f09ea passed every automated check, and the owner rightly called it an "old-era slideshow". Six
frames from his screen recording show four problems:
- **A small photo floating over a blurred copy of itself.** This comes from `render/render-film.mjs:479-519`.
- **Off-topic, era-wrong archive stills.** A modern Indian barber's story got a 1900s car, a pothole, and
  Jobs and Gates.
- **Stills only.** There is no moving footage.
- **No designed moments.** The film has 0 transitions and 0 punch-ins.

Root cause: the voiceover path calls `planVoiceVisuals` with **no brain** (`local/voice-film.mjs:338,360`).
Because of that:
- The roster's model roles never run: Visual Director, Asset Search Strategist, Exact Asset Finder,
  Matchmaker and Edit Director.
- The renderer's existing craft is never triggered: maps.mjs, FX-CHART, FX-KINETIC, FX-HIGHLIGHT,
  whip/slide/zoom-through transitions and parallax. All of these wait for FX/TRANS fields that nobody writes.
- Nothing looks at a picture. There is no seeing model, and PEXELS_API_KEY is unset.
- The release gate checks that the film *exists* (no black frames, loudness), not that it is *good*.

Roster truth (`engine/src/agent-roster.mjs` ROLE_STATUS): 151 roles = 65 code + 45 model + 6 built (not
wired) + 35 planned. Nothing is lost on older branches: every one is behind main.

## 2. Corrections to the brief (honest limits under the owner's zero-cost rule)
- **AI-generated video and full 3D environments are not free at film scale.** Runway, Veo and Kling cost
  money. Open video models (Wan, LTX) need a GPU, and GitHub runners have none. **Decision:** not now. This
  is listed as an owner decision (a GPU or a paid service).
- **What we can do for free is enough for a big jump:**
  - stock and archival **video** (Pexels, Pixabay video, NASA, Internet Archive, Wikimedia);
  - **depth-based 2.5D**: a free depth model (Depth Anything V2 small, Apache-2.0) runs on CPU and turns a
    still into a real camera move;
  - **designed motion graphics**: HTML/CSS/canvas/three.js rendered by Playwright, which is already on the
    runners;
  - a free **image–text model** (OpenCLIP) and a free **aesthetic scorer**, used as eyes.
- **Studying reference videos:** downloading other creators' videos breaks YouTube's terms, so we don't.
  Instead we use:
  - YouTube Data API metadata (views, duration, dates, chapters);
  - public writing about these creators;
  - **the owner's own phone screen recordings of the references.** We measure these frame by frame: cut
    rate, share of moving footage, text moments.
  - 50+ reference links the owner already sent are waiting in `docs/YOUTUBE_BENCHMARKS.md` ("not analysed
    yet").
- **Visuals cannot replace a weak voiceover hook.** In voiceover mode the words belong to the creator. The
  engine will *score* the first 30 s and tell the creator plainly, and it front-loads the strongest visuals.
- **Nobody can promise 30–40M views.** Views depend on topic, title, thumbnail, channel and timing. We
  build the qualities those videos share and measure them.

## 3. The new production pipeline (what each film goes through)
1. **Understand the voice.** Transcript, words and times; sentence and beat boundaries; named entities
   (people, places, eras, numbers, organisations); emotion per beat. This already partly exists in
   voice-understand.mjs.
2. **Director pass, per chapter, free brain (Groq → Gemini pool).** Writes a **beat sheet**. For each beat:
   the viewer goal (understand / feel), the emotion, the reveal moments and the visual language for its genre.
3. **Shot plan, in code-checked fields.** For each shot:
   - `TYPE`, from one closed vocabulary: live-video, archival-video, photo-2.5D, photo-designed, map,
     timeline, chart, document, kinetic-type, quote, establishing, title;
   - the subject, era, place, camera move and duration;
   - the FX/TRANS fields the renderer already knows;
   - a sound cue.

   Code enforces the genre's rhythm (see the gates) and restores the voice's words and times.
4. **Asset engine, multi-stage.**
   - **Queries:** from entities, era and place, never from bare keywords.
   - **Candidate pool:** 50–200 per shot across video-first providers.
   - **Hard filters:** licence, resolution (video ≥1080p, stills ≥1600 px wide), aspect, watermarks,
     duplicates.
   - **Scores:** OpenCLIP relevance to the shot text, aesthetic score, and era/place consistency.
   - **Sequence choice:** the shots of one beat are chosen *together* (continuity of colour and era,
     variety of scale, no repeats within 10 min), not one "best image" at a time.
5. **Make it cinematic.** Video is trimmed to its best moment. Stills get depth 2.5D or a designed frame (on
   a desk, in a document or archive treatment), not a blurred copy. Graphics come from the Zupona template
   library.
6. **Sound as part of the cut.**
   - Music cues follow the beats (the free score or free CC0/Pixabay music), and are ducked under the voice.
   - Whoosh, hit and riser sit on transitions and reveals.
   - Ambience follows the location.
   - Silence is used on purpose.
   - Loudness: -14 LUFS, true peak ≤ -1 dBTP.
7. **Critic and QC loop.**
   - Automatic measures, per shot and per film (the gates below).
   - A contact sheet per chapter.
   - Weak shots are sent back to stage 4 or 5, at most twice.
   - The owner judges the 3-minute test slice beside a reference recording; his verdict is the last gate.

## 4. Quality gates for the 3-minute test slice (the first 3:00 of 993f09ea, which includes the hook)
| Measure | Target |
|---|---|
| Screen time that moves (footage or animated graphic) | ≥ 70 % |
| Plain still with only a zoom | ≤ 15 % |
| Blurred-copy frame | ≤ 1 per 3 min |
| Median shot length | 2.5–6 s, by genre |
| Longest shot with no change of camera or graphic | 8 s |
| Designed moments (kinetic line, counter, map, quote, lower third, title), each on a narration beat | ≥ 1 per 45 s |
| OpenCLIP relevance | every shot above the film's floor; 0 shots flagged off-topic by the critic |
| Off-era or off-place pictures | 0 |
| Repeats within 10 min | 0 |
| Native resolution | ≥ 1080p |
| First 30 s | ≥ 6 visual beats; the strongest shots front-loaded; title by 0:40 |
| Sound | a cue on every designed moment; music ducked 8 dB or more under the voice; -14 ±1 LUFS |
| Owner's side-by-side verdict against his chosen reference | "pass" |

## 5. Visual identity: Zupona, not a copy of anyone
One house look, used by every graphic:
- **Type:** two free fonts, a display face and a text face.
- **Colour:** one accent colour plus a warm/cool grade pair.
- **Motion:** a single easing curve family.
- **Signatures:** a signature title card and lower third, and a signature map style.

We learn the craft from the references, not their look.
