# M4: Zupona motion graphics and cinematic stills
Goal: designed moments that look modern and premium, and stills that move like a camera, not like a slideshow.
Owns: render/graphics/ (new; HTML, CSS, canvas and three.js templates rendered with Playwright to frames or
alpha video), render/depth/ (new; Depth Anything V2 small, CPU), and the photo composition in
render/render-film.mjs (around lines 470-530, where the blurred-copy frame lives).
Must not touch: the audio mix (M5), the chunk and join logic (King's 5), and media fetching (M3).

## Checklist
- [x] Zupona identity tokens (two free fonts, accent colour, easing, grade pair) in render/graphics/brand.
- [ ] Templates, each driven by the existing FX fields where they exist (FX-KINETIC, FX-CHART, maps.mjs):
      kinetic line, number counter, lower third, quote card, chapter title, timeline, document or newspaper
      reveal. A short MP4 sample of each, with frames checked.
- [ ] Depth 2.5D: a still gets a depth map and a real camera move (dolly, orbit, rack focus), with artefact
      checks at the edges. It replaces the blurred-copy frame, which is kept only as a rare, designed "photo
      on a desk".
- [ ] Wire the templates and depth into render-film.mjs behind the shot TYPE (M2) with safe fallbacks. Keep
      frame-exact timing and chunk rendering working (run the existing part/join test).

## Gate
In the 3-minute slice render, there is at least 1 designed moment per 45 s, at most 1 blurred-copy frame,
and no shot over 8 s without movement. Before/after frames are sent to the Boss.

## Found for others
- package.json "test" does not list render/graphics/graphics.test.mjs (not my file); please add it.

## Log
- 2026-11-21: brand tokens in render/graphics/brand/brand.mjs (Fraunces + Inter, OFL, woff2 inlined; accent #F2A93B; one bezier ease family; warm/cool grade). Evidence: node --test render/graphics/graphics.test.mjs, 2 pass.
