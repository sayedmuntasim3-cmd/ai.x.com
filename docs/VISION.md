# The owner's vision (condensed; the owner pasted it in full on 4 and 5 November 2026)

Read this once per session instead of asking the owner to paste it again.

- **Ambition:** become the world's leading AI video platform, first for long documentaries; compete with and beat Runway, InVideo, Pictory, Higgsfield, Descript, Kutly and the rest by being a fundamentally better product, not by having more features.
- **Think like** a world-class CTO, AI researcher, architect, product strategist and documentary producer. Choose the strongest practical solution; never settle for average; challenge weak implementations; say so when an idea is not the best one.
- **Agents:** about 150 specialist roles matter only for their results. Each role has a real job; they coordinate from research to final video, mixing Claude, code, APIs and deterministic checks. Show honestly which roles really run (`ROLE_STATUS` in `engine/src/agent-roster.mjs`).
- **Excellence in:** research and accuracy, fact-checking, storytelling, retention scripting, finding real pictures, scene matching, cinematic motion and graphics, natural narration, editing and sync, long-form production, render speed and reliability, final quality. Every film should satisfy viewers and could reach tens of millions of views (a target, never a promise).
- **Content:** every kind of viral documentary (success stories, motivation, history, mystery, money, science, and more), mainly for USA and European audiences, later Bangla and Arabic written natively.
- **Effects and editing:** motion, animation, zooms, transitions and sound design at the level of the most viral YouTube documentaries, free wherever possible.
- **Cost:** spend as little as possible (saving mode, free archives, own voice).
- **Rules:** never destroy existing progress or rewrite working code without need; no fake functionality or placeholders claimed as done; test integrations, handle errors, measure results; build for the current stage, keep the long-term vision.
- **Pictures and the law (decided 5 Nov 2026):** the owner asked to take pictures from anywhere without licences. Automated taking of copyrighted pictures, or avoiding YouTube's detection, will not be built. The agreed path: the owner may place pictures he chooses into scenes himself (his decision and responsibility), and the platform adds more free, legal sources (Openverse, museums, US government archives, AI illustrations).

## The owner's master list (6 November 2026): keep every item in view

Read this list at the start of every session and keep all of it in mind. Working on one item must never push the others out: the owner saw a session that worked only on the Quran and forgot the USA work.

1. **Main product:** world-class US-English documentaries, aiming at the world's number one documentary platform. Mainly success stories with a money or business angle and motivation from real lives, plus every other format in `engine/src/formats.mjs`. A film starts from the owner's own voiceover (voice mode) or from an idea.
2. **One signature narrator for every US documentary.** It must be unique: made with ElevenLabs Voice Design, not a shared library voice, and never a clone of anyone's voice. The profile chosen (owner delegated the choice, 6 Nov): a deep, warm American male in his 40s, calm authority with a slight gravel, intimate and sincere, slow cinematic pacing with powerful pauses, rising conviction at the climax. The voice stays the same; the delivery changes per scene (v3 tags).
   - Status, 6 Nov: the design round was not run. The owner's ElevenLabs account has a 10,000-credit monthly quota (the size of the free plan) with 186 credits left, and a round needs 420. Nothing was charged.
   - Audio made on the free plan has no commercial licence. A paid plan is needed before monetised videos and before the website offers voices.
   - A 40-minute film needs roughly 36,000 characters of narration.
3. **Quran recitation films (Arabic).** `engine/src/quran-film.mjs` plans them ayah by ayah; they still have to be wired into the render.
4. **A free brain the owner runs himself.** The owner does not want to depend on paid Claude or ChatGPT APIs.
   - Default for the owner: open-source models (Whisper to listen, CLIP to see, a small language model to think) on free machines or his own computer, behind a swappable "brain plug".
   - Gemini or Claude are used only when their keys are set. Customers pay for the Claude tier.
   - Planned work: about 10 sessions (listening, picture choice, the boss agent and its critic, voice-mode and Quran renders, real tests).
5. **Never ask viewers to like, subscribe or comment.** The film must earn it. Narration bans these phrases in code (`BANNED_EN` in `engine/src/scene-lines.mjs`).
6. **The website:** paid for customers, free for the owner.
7. **Bangla versions** come later.
8. **Repository privacy.** The repository is public, so renders publish films as public pre-releases. Only the owner account `sayedmuntasim3-cmd` can make it private (Settings > General > Danger Zone). Making it private leaves 2,000 free Actions minutes a month on a smaller runner. The account connected to Claude, `sajid1234sajid`, is a collaborator with write access and keeps working.
9. **Open question to the owner:** his computer (RAM, graphics card) decides how large the free brain can be.
