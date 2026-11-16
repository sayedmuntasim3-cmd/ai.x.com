# Ramesh Babu: From Barber to Rolls-Royce (45 min, two versions)

A full production made with the Zupona engine prompts, kept here so no work is lost between sessions.
Two separate films: `USA/` (American English, dollars) and `Bangladesh/` (Bangla, Taka). They never share text.

| Stage | USA | Bangladesh |
|---|---|---|
| S0-S1 brief, research, titles (`s01.md`) | done | done |
| S2 claim ledger (`s2.md`) | done | done |
| S3 structure, 6 chapters (`s3.md`, `s3-chapters.json`) | done | done |
| S4 production bibles (`s4.md`) | done | done |
| S5 script, chapter by chapter (`s5-C1.md` ... `s5-C6.md`) | all six done | not started |
| QA, fixes, S6 report, S7 publishing pack | done | not started |

How to continue (each step is one agent, run from the repository root; the exact instructions are in `prompts/`; see also `docs/NEXT_SESSION.md`):

1. Finish the missing S5 chapters with `prompts/s5-<version>-<chapter>.txt`. A partly written chapter is finished in place and its marker removed.
2. Run `prompts/qa-<version>.txt` (writes `qa.json`), then `prompts/fix-<version>.txt` (edits the chapters in place, keeps `.draft.md` copies).
3. Run `prompts/s6-<version>.txt` and `prompts/s7-<version>.txt`.
4. Build the two pages: `python3 assemble.py && npm install marked && node build.mjs result.json`.

Facts come only from `research_bio.json`; footage only from Pexels, Pixabay, Videvo (free licence), Coverr and Mixkit; no AI imagery or audio.
`brief.md` in each version folder holds the production rules and the version lock. The engine manual it refers to is `../../prompts/1-zupona-master-engine-full.txt`.
