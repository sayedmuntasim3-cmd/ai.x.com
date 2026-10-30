# Quran data

| File | What it is | Source and licence |
|---|---|---|
| `tanzil-quran-simple-1.0.2.json` | The 6,236 ayat in mushaf order, one string per ayah, exactly as published | Tanzil Quran Text (Simple), version 1.0.2, Copyright (C) 2008-2010 Tanzil.net, Creative Commons Attribution 3.0 with Tanzil's terms in `TANZIL-LICENSE.txt`: verbatim copies only, credit Tanzil and link to https://tanzil.net. Taken unchanged from the npm package `ar.tanzil.quran-simple.txt@1.0.0`. |
| `surah-names.json` | Arabic names (with and without tashkeel), transliterations and English meanings of the 114 surahs | Extracted unchanged from `quran-meta@7.0.0` (MIT, `QURAN-META-LICENSE.txt`) |

Rules for using this data:

- The text is never changed. Matching uses a normalised copy made in memory (`src/arabic.mjs`); the file stays byte-for-byte as published.
- This copy is used to recognise what a recording recites. Text shown on screen should come from the latest Tanzil release (version 1.1, February 2021), preferably the Uthmani text set in Amiri Quran, downloaded from https://tanzil.net/download/ with its notice. tanzil.net was not reachable from the environment that built this, so that file is not here yet.
- Every video that shows Quran text credits "Quran text: Tanzil.net".
