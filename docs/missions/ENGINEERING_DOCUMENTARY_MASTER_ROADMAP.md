# Engineering Documentary Master Roadmap (owner's directive, 26 Nov 2026)

**The niche (fixed):** Engineering Disasters & Megaprojects.
**The audience:** ordinary American viewers.
**The goal:** films that can stand beside the best documentaries on YouTube. View counts are an aspiration, never
a promise.

**Rules:**
- Evidence before assumptions; implementation before claims; measured quality before success.
- Extend what exists (OpenCLIP rerank, critic, shot plan, Craft Ledger); never build a second copy.
- Never present a reconstruction or AI image as authentic historical evidence.

## Content pillars
- **A. Engineering disasters:** Tacoma Narrows, St. Francis Dam, bridge, dam, tunnel and building failures.
- **B. Megaproject histories:** Panama and Suez canals, Hoover Dam, Golden Gate, Empire State Building, ports,
  railways.
- **C. Hidden infrastructure:** the power grid, city water, subways, container ports, interstates.
- **D. Engineering mysteries and overlooked stories:** structures that should not have survived, near-failures.

## Workstreams (one worker chat per milestone; ≤5-line Bangla reports to the Boss)

| # | Workstream | Deliverable | Status |
|---|---|---|---|
| W1 | Initial platform audit + agent table (Role, Status, Invocation, Input, Output, Verification, Defect) | `docs/audit/INITIAL_PLATFORM_AUDIT.md` | started 26 Nov |
| W2 | 3-minute film postmortem (branch claude/test-film-3min): timestamped defects, root cause per stage, priority | `docs/audit/THREE_MINUTE_FILM_POSTMORTEM.md` | started 26 Nov |
| W3 | Market intelligence: 25–35 channels; 120–160 videos; outliers normalised to the channel's own last 20–25 uploads; facts kept apart from hypotheses | `docs/research/ENGINEERING_MARKET_STUDY.md` | started 26 Nov |
| W4 | YouTube's official recommendation guidance (appeal, engagement, satisfaction; the 30 s metric is a measure, not a hook length) | inside the W3 doc | with W3 |
| W5 | Automatic shot picking at hand-picked quality, plus strict visual acceptance | King's 15 | running |
| W6 | Craft Ledger learns from every film (and from first-party retention when available) | King's 16 | running |
| W7 | Topic selection engine: a transparent score (demand, outliers, competition, US appeal, authentic visuals, research reliability, advertiser fit, effort, evergreen, narrative, similarity) and rules for rejection | engine module + tests | after W3 |
| W8 | Story architecture for ordinary viewers: one central question, escalation, reveal, payoff; no fabricated facts | shot plan / director | after W2 |
| W9 | Independent release board: separate reviewers (story, research, visual, cinematography, editing, motion, sound, packaging, comprehension); hard rejects; a defect goes back to its source stage | critic + release gate | after W5 |
| W10 | Free legal visual sources for the niche (NARA, Library of Congress, HAER/HABS drawings, Internet Archive, Wikimedia, NASA, USGS, Bureau of Reclamation); activate only what measurably helps | source adapters | after W3 |
| W11 | Engineering 3-minute test slice on a real, well-documented story (e.g. Tacoma Narrows 1940) at 1920×1080 30 fps: real archival footage, accurate maps, real diagrams, measured LUFS | the film + proof | after W5, W8, W9 |

## Strict visual acceptance (W5 and W9)
Every shot is checked on subject identity, place, era, event, object or structure, composition, aesthetics,
continuity, licence and source.

Every shot is classed as one of:
- **A** authentic historical evidence
- **B** authentic present-day footage
- **C** labelled reconstruction
- **D** illustrative CGI
- **E** AI explanatory image

If no right picture exists, use a diagram, a map or a marked evidence gap, never an unrelated photograph.
