# Automatic picks: 993f09ea, 0:00–3:00, no hand-picking (27 Nov 2026)

One command, nothing chosen by a person:

```bash
GROQ_API_KEY=… ZUPONA_STOCK_RELAY=<worker>/api/voice/<id>/stock NODE_USE_ENV_PROXY=1 \
node local/voice-film.mjs --audio in.mp3 --slice 0:00-3:00 --kind narration --stt faster-whisper \
     --model base.en --language en --media --eyes --master dry --topic "Ramesh Babu - From Barber to Rolls-Royce"
```

`--eyes` runs the same picker as CI (`render/asset-rank/rerank.mjs`):
- every picture shot of the final plan (`shots.json`) is searched from the words heard over it; the free Groq brain wrote all 37 searches;
- video first; archives only in a historical scene;
- OpenCLIP ranks;
- the critic reads each shot's best candidates by their tags against its line (10 per round, at most two re-picks). Groq's free eyes check the cut at 320 px when the day's quota allows;
- refused outright: another country's tags or money, off-world looks, green-screen, cartoon and wedding tags, and a person's face for a line about the film's own man or his family;
- a shot no candidate fits becomes a card of its own words.

## Measured (run 12, the files here)

| | hand-picked (`contact-sheet-hand-picked.jpg`) | automatic (`contact-sheet-auto.jpg`) |
|---|---|---|
| Shots | 55 (46 clips, 9 cards) | 44 (33 pictures, 11 cards, 4 of them gap cards) |
| Video share of pictures | 46/46 | 22/33 |
| Moving (critic) | — | 75% |
| Changes in the first 30 s | — | 10 (hook 10/10) |
| Repeats | 0 | 0 (no repeat finding) |
| Sentence/picture mismatches I judged by looking at every frame | (postmortem: 13 of 55 fail) | **7 of 37**: 3D wireframe Rolls (SC0001-3), green-screen scissors (SC0002-1), barber tools for "the first bill" (SC0003-2), an unknown old man for "is Ramesh Babu" (SC0005-2, P0; fixed in code after this run, not re-run), auto-rickshaw driver for "YourStory, The Better India" (SC0013-3), temple aerial for "the record turns hard" (SC0014-1), street for "Seven is the age" (SC0016-1) |
| Minutes | — | whole slice 16 min (voice, plan, picks); render 2.7 min at 720p |

The critic's own numbers (`rank-C1.json` summary):
- 64 shot questions by words, 2 looks by eye;
- 23 shots sent back, 40 re-picks;
- 30 fit, 0 miss, 3 not judged;
- records: B 31, D 1 (the 3D Rolls), E 1 (a rupee clip its tags call AI);
- film critic: BLOCK on sound only (LRA 1.6 LU, captions 90%, cue coverage 69%), not on pictures.

## Not reached, and why

- **The target was ≤3 mismatches; this run has 7.**
  - Groq's free eyes allow 200,000 tokens a day. Debugging used them up, so this run judged by tags (2 looks).
  - Tags lie: the green-screen scissors are tagged "scissors, cutting".
- **Video share is 22/33.** The critic often found only stills that fit.
- The film critic still blocks on sound. That is not this milestone.
