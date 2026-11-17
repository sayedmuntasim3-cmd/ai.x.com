# Recitation film: review sheet for a person

This sheet is filled in by a person who knows the Quran (and, for the pictures, the owner or an editor)
before a film is signed off with
`node local/quran-review.mjs --run <folder> --signoff --by "Name" --qualification "..." --contact "..."`.
The sign-off is refused without a qualification and a contact: it must be a real, reachable person.
It is kept apart from the automated tests: no test can replace it. Keep one copy per film, with the
film's folder name and date.

Start from the film's review page: `node local/quran-review.mjs --run <folder> --html [--lang bn]` writes
`review.html` with the real frame of every scene, the ayah, the picture with its source and licence, why it
was chosen, what the checks said and what they refused. The publish decision is **PASS** (may be published),
**WARNING** (a person must still look, listen or sign) or **FAIL** (blocked); only PASS publishes.

Film folder: ______________________  Date: __________
Reviewer (real name): ______________________  Qualification (hafiz, ijazah, teacher, scholar): ______________________
Contact: ______________________

## 0. The automated reports (read them; they are not a religious approval)

| Report | Where | Must show |
|---|---|---|
| Ayah timing | `quran-location.json` | the passage; how many ayah ends are sure (two methods agree); any question asked |
| Pictures, every second | `render-report-*.json` → `visual` | coverage 1, no empty or frozen stretch |
| Sound | `render-report-*.json` → `audio` | offset 0, no added silence, no clipping |
| Placeholder cards | `render-report-*.json` → `cards` | none |
| Media refusals | `media.md` | why other pictures were refused |
| Doubtful pictures | `media.md` column "Check", `review.html` | every WARNING scene looked at and approved, replaced or rejected by a person |
| Publish decision | `--ready` (per format) | PASS; any FAIL or WARNING says why |

## 0b. The recording (owner or editor)

| Check | Yes / No | Note |
|---|---|---|
| The reciter is named, and the recording's source is known | | |
| Written permission to publish it, commercial use included (recorded with `--rights`) | | |
| It is a direct recording, not one played through a speaker or taken from another video | | |
| No translation, narration, music or effect in the sound; the recitation untouched | | |

## 1. The Quran text (religious accuracy)

| Check | Yes / No | Note |
|---|---|---|
| The surah and every ayah shown are the ones recited (listen while reading `quran-location.json`) | | |
| The Arabic on screen matches the mushaf letter by letter (it comes from Tanzil Uthmani 1.1) | | |
| Each ayah's text appears while that ayah is recited, not before or after | | |
| A repeated ayah (or repeated words) is shown correctly | | |
| The isti'adha, basmala and closing words are not shown as ayat (the basmala Tanzil writes before ayah 1 is removed) | | |
| Where an ayah end is not confirmed, its Arabic is not shown (fewer than half confirmed blocks the film) | | |
| No cut, fade or picture change falls in the middle of a word or a held note | | |
| The recitation is untouched: no word cut, no change of speed or pitch, no music or sound added | | |

## 2. The pictures (adab)

| Check | Yes / No | Note |
|---|---|---|
| Nothing depicts Allah, a prophet or messenger, a Companion or an angel | | |
| Paradise, Hell and the Hereafter appear only as symbols in real earthly nature, never as a scene | | |
| No faces; people only if the film's adab level allows them, and only from afar (look for small walking figures: the automatic check caught 3 of 3 in a small test, the face detector none) | | |
| No church, temple, idol, statue, painting, icon, music, alcohol or immodest picture; no building, monument or city (the automatic check missed a mountain hut) | | |
| No picture is upside down, sideways, blurred, watermarked or with text on it (the orientation check catches only about half of sideways pictures) | | |
| No painting, drawing or rendering (the automatic check missed one ink painting in ten) | | |
| No map, diagram or night-lights composite presented as a landscape | | |
| Each picture fits the meaning of its ayah, or is a neutral reverent motif (see `shots.md`, column "Why") | | |
| The same picture does not come back, except the refrain's own picture | | |

## 3. Meaning and credits

| Check | Yes / No | Note |
|---|---|---|
| If a translation is shown, it is Pickthall (1930) and credited | | |
| `credits.txt` lists Tanzil, the font, and every asset with its author and licence | | |
| The title and description (`publish.json`) name the right surah and ayat | | |

## 4. Watch and listen once, whole

| Check | Yes / No | Note |
|---|---|---|
| The voice sounds clean and natural (better than the original, not changed) | | |
| The film feels calm and reverent; nothing flashy | | |
| Sound and picture stay together to the end | | |

Decision: ☐ may be published ☐ needs changes (scenes: ____________________)

Signature: ______________________
