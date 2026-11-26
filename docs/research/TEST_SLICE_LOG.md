# Test-slice log: 0:00–3:00 of `993f09ea`

M6's fourth item: render the first three minutes of the planned film, measure them, compare them with the
reference standard, and iterate internally until the Boss judges the slice world-class. The owner only sees
a slice that has already passed. This page is the record of those rounds.

**Status: no real slice has been rendered yet.** The measurement and return machinery is built and tested
(contact sheets, weak-shot loop, critic including blurred picture and flicker), but a real slice needs the
film's footage, which needs a stock key or relay and the OpenCLIP model; see "What blocks the first round".
Nothing below claims a slice was measured. What *was* measured is the owner's own 3-minute film, which is
the honest baseline this loop has to beat.

## The rule

A slice is not sent to the owner until it clears every measurable gate *and* the Boss's written verdict is
"pass" (hook, rhythm, visuals, sound against the reference standard). Weak shots go back to M3 (re-pick) or
M4 (re-make) at most twice; after that the Boss decides rather than the loop bouncing the same shot again.

## What runs today

```bash
# 1. the slice: the film's own run folder, rendered to three minutes
node render/render-film.mjs --run films/<id> --out out/slice.mp4 --width 1920 --height 1080
#    (the renderer writes out/slice.timeline.json beside the film for the sheet and the loop)

# 2. the critic on the rendered file and its master report
node render/critic.mjs --report out/slice.report.json --film out/slice.mp4

# 3. the contact sheets (one per chapter) and the weak-shot list, with its return rounds
node render/contact-sheet.mjs --film out/slice.mp4 --timeline out/slice.timeline.json \
     --run films/<id> --out out/slice

# 4. the release gate, which includes the critic's verdict
node render/release-gate.mjs --report out/slice.report.json --file out/slice.mp4
```

Outputs: `out/slice.sheet-C1.jpg` … (a frame per shot, the shot id, its TYPE and its relevance score, a weak
shot framed in red), `out/slice.sheets.json` (the same as data), `out/slice.returns.json` (the rounds: which
shot went back to which mission, and which ones exhausted two rounds and were escalated).

## Measured baseline: the owner's 3-minute film (24 Nov 2026)

| What | Measured | House standard (`render/critic.mjs` `STANDARD`) |
|---|---|---|
| Length, size, rate | 3:00, 1280×720, 30 fps | ≥ 120 s, ≥ 720p |
| Cut rhythm | 62 stock shots, average 2.9 s, a burst of cuts at 27–28 s | average shot 2–12 s, ≤ 30% under 1.5 s |
| Moving picture | stock footage throughout | ≥ 55% moving |
| Designed moments | 0 a minute | ≥ 1.2 a minute |
| First 30 s | no designed moment, no turn | ≥ 3 cuts and ≥ 1 designed moment |
| Relevance | not scored (no OpenCLIP run) | ≥ 80% of shots at 0.25 or more |
| Sound | mono, −14.4 LUFS, −1.4 dBTP, LRA 1.9 LU | stereo, −15…−13 LUFS, ≤ −1 dBTP, LRA ≥ 3.5 LU |
| Blurred picture, flicker | not measured then; both are measured now | no blurred shot (median blur > 20) |

Critic verdict on that film: **block**, on four counts at once (no design, no opening beat, flat loudness
range, mono), each with its own English and Bengali sentence. It is the "before" frame: any slice that keeps
those four failures is not better than what the owner already has.

## Against the reference standard

`docs/research/REFERENCE_STANDARD.md` is still a **draft**: length, views and chapters are measured from
YouTube metadata (307 videos), but the craft numbers this slice is judged on — median shot length, moving
versus stills share, text moments per minute, transitions, when the title lands — are **not measured from a
public source yet**. So the slice can be held to the house standard above (which is numbers, not taste) and
to the sourced parts of the reference standard (a named subject, the promise paid inside 30 s, chapters,
13–25 min), but not yet to a cited craft benchmark. That gap is M1's remaining work, not something this log
can invent.

## Rounds

| Round | Date | Slice | Measured | Verdict | Sent back | Notes |
|---|---|---|---|---|---|---|
| 0 | 24 Nov 2026 | owner's own 3-minute film (baseline, not a slice) | 2.9 s stock shots, no design, no first-30 s beat, mono, LRA 1.9 LU | block ×4 | — | the "before" frame; also the test the critic is built from |
| 1 | — | 0:00–3:00 of `993f09ea` | — | — | — | not rendered yet: see blockers |

## What blocks the first round

1. **Footage.** The film's media files need a Pixabay key or the `ZUPONA_STOCK_RELAY` relay; without either,
   every stock shot becomes a text card (the renderer says so in its warnings) and the slice would measure
   design, not footage.
2. **The eyes.** `render/asset-rank/rank.py` needs OpenCLIP (~600 MB model). Without it there are no
   relevance scores, so the relevance gate and the score on every contact-sheet tile stay empty.
3. **The graphics.** Designed moments need Chromium for Playwright; without it the cards render as plain
   text and the designed-moments gate fails for the wrong reason.

Each of these is a machine setup step, not a code gap: the moment one render with a key and the model can
run, rounds 1…n are three commands above, and every number lands in `out/slice.sheets.json` and
`out/slice.critic.json`.
