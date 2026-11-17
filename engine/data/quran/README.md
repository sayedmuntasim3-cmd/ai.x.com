# Quran data

| File | What it is | Source and licence |
|---|---|---|
| `tanzil-quran-simple-1.0.2.json` | The 6,236 ayat in mushaf order, one string per ayah, exactly as published | Tanzil Quran Text (Simple), version 1.0.2, Copyright (C) 2008-2010 Tanzil.net, Creative Commons Attribution 3.0 with Tanzil's terms in `TANZIL-LICENSE.txt`: verbatim copies only, credit Tanzil and link to https://tanzil.net. Taken unchanged from the npm package `ar.tanzil.quran-simple.txt@1.0.0`. |
| `tanzil-quran-uthmani-1.1.txt` | The 6,236 ayat in the Uthmani script, `surah|ayah|text`, with Tanzil's notice at the end, byte for byte as downloaded on 13 Nov 2026 (sha256 in `engine/test/quran-meaning.test.mjs`) | Tanzil Quran Text (Uthmani), version 1.1, Copyright (C) 2007-2026 Tanzil Project, Creative Commons Attribution 3.0 with Tanzil's terms (verbatim copies only, credit Tanzil Project, link to tanzil.net, keep the notice), https://tanzil.net/download/ |
| `pickthall-1930.json` | Pickthall's English translation of the meaning, one string per ayah | M. M. Pickthall, *The Meaning of the Glorious Koran* (1930), from Project Gutenberg eBook #16955 (public domain in the USA; the translator died in 1936), extracted word for word by `scripts/extract-pickthall.mjs`; four misprinted verse labels of that file are corrected by position and listed in `labelsFixed`. Checked against Tanzil's own copy: 6,168 of 6,236 ayat identical in letters. Tanzil's translation files are for non-commercial use only, so they are not used. |
| `surah-names.json` | Arabic names (with and without tashkeel), transliterations and English meanings of the 114 surahs | Extracted unchanged from `quran-meta@7.0.0` (MIT, `QURAN-META-LICENSE.txt`) |

Rules for using this data:

- The text is never changed. Matching uses a normalised copy made in memory (`src/arabic.mjs`); the file stays byte-for-byte as published.
- The Simple copy is used to recognise what a recording recites and to find the things an ayah names. Text shown on screen comes from the Uthmani copy, verbatim.
- Every video that shows Quran text credits "Quran text: Tanzil.net".
