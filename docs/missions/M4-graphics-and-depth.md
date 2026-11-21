# M4: Zupona motion graphics and cinematic stills
Goal: designed moments that look modern and premium, and stills that move like a camera, not like a slideshow.
Owns: render/graphics/ (new; HTML, CSS, canvas and three.js templates rendered with Playwright to frames or
alpha video), render/depth/ (new; Depth Anything V2 small, CPU), and the photo composition in
render/render-film.mjs (around lines 470-530, where the blurred-copy frame lives).
Must not touch: the audio mix (M5), the chunk and join logic (King's 5), and media fetching (M3).

## Checklist
- [x] Zupona identity tokens (two free fonts, accent colour, easing, grade pair) in render/graphics/brand.
- [x] Templates, each driven by the existing FX fields where they exist (FX-KINETIC, FX-CHART, maps.mjs):
      kinetic line, number counter, lower third, quote card, chapter title, timeline, document or newspaper
      reveal. A short MP4 sample of each, with frames checked.
- [x] Depth 2.5D: a still gets a depth map and a real camera move (dolly, orbit, rack focus), with artefact
      checks at the edges. It replaces the blurred-copy frame, which is kept only as a rare, designed "photo
      on a desk".
- [x] Wire the templates and depth into render-film.mjs behind the shot TYPE (M2) with safe fallbacks. Keep
      frame-exact timing and chunk rendering working (run the existing part/join test).

## Gate
In the 3-minute slice render, there is at least 1 designed moment per 45 s, at most 1 blurred-copy frame,
and no shot over 8 s without movement. Before/after frames are sent to the Boss.

## Found for others
- M2: the renderer reads an optional `v.shotType` (TRANSFORMATION §3 vocabulary: photo-2.5D, photo-designed, title, kinetic-type, quote, document, timeline...). Please emit that field name, or tell me yours.
- Not wired yet: alpha overlays (lower third / chapter over footage) need a filter graph in the clip path; clip titles keep their ffmpeg lower third for now.
- package.json "test" did not list render/graphics/graphics.test.mjs; Boss allowed me to add that one line (done).

## Log
- 2026-11-21: brand tokens in render/graphics/brand/brand.mjs (Fraunces + Inter, OFL, woff2 inlined; accent #F2A93B; one bezier ease family; warm/cool grade). Evidence: node --test render/graphics/graphics.test.mjs, 2 pass.
- 2026-11-21: 7 templates (render/graphics/templates.mjs), frame-exact Playwright renderer (render-graphic.mjs; lower third = ProRes 4444 alpha), FX-field mapping (from-shot.mjs). Samples via `node render/graphics/samples.mjs <dir>` (~10 fps at 1080p); frames checked by eye, sheets in render/graphics/samples/. Tests: 5 pass.
- 2026-11-21: depth camera in render/depth/ (Depth Anything V2 small, Apache-2.0, quantized ONNX fetched once to ~/.cache, CPU ~4 s per photo; dolly / orbit / rack focus in ffmpeg, ~11-14 s per 5 s shot at 1080p). Edge rule: displacement + pan < overscan margin (tested for every move); foreground edges grown so stretch lands on background; flat pictures return null (old still move). Frames checked: render/depth/samples/. Tests: 7 pass. Blurred-copy is only replaced when wired (next item).
- 2026-11-21: wired into render-film.mjs (photo composition + card drawing only): designed cards via graphicFor (shotType first, FX fields second), depth camera for every non-print still, both switch off with one warning when a tool is missing. FX-PAPER keeps its tested ffmpeg highlighter. End-to-end 22 s test render: 660/660 frames, 2 designed + 2 depth shots, print kept (render/depth/samples/wired-render-frames.jpg). render.test + pipeline.test 25/25 incl. part/join.
