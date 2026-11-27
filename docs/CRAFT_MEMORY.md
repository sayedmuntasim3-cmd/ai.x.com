# The Craft Ledger: the platform learns its own taste

Every film tool judges each new film with the rules it had on day one. That is why two channels using the
same tools produce the same-looking films: the taste never accumulates anywhere. This is the missing layer.

**The idea in one sentence:** every finished film is measured once, the measurements are kept, and the next
film of that genre is judged against what this channel's own *passing* films actually achieved — so the tenth
film is made to a standard the first one did not have.

That is also the moat. Models, stock footage and CLIP scores are commodities anyone can rent tomorrow. A
ledger of what worked on *this* channel, film after film, cannot be downloaded.

## How it works

1. **Read.** `recordFromReport` takes the measures the critic already writes into `<film>.report.json`:
   moving share, designed moments a minute, average and longest shot, narration coverage, cuts in the first
   30 s, sound cues on designed moments, largest subtitle gap. No media, no model call: a few hundred bytes
   per film.
2. **Keep.** One compact record per film (`filmId`, genre, time, duration, verdict, measures). The same film
   re-rendered replaces its record instead of counting twice; the ledger is capped at 200 films, oldest out.
3. **Learn.** `targetFor` uses only **passing films of the same genre** (and films the audience held, see
   below), and only from the third film on (`MIN_FILMS = 3`): two films are an accident, three are a habit.
4. **Judge.** `craftIndex` scores any film 0–100 against those targets. `fit` is 1 inside a band and falls
   away by the band's own width, so the number means "how far from where this channel wants to be".

## The guards (why this cannot learn its way down)

Learning from your own output is how a channel drifts into mediocre and stays there. Three limits stop it:

- **The house standard is the floor.** A learned minimum may not fall below 85 % of the doctrine's number
  (`RELAX.min`), and a learned maximum may not rise above 125 % of it (`RELAX.max`). The films say how far
  above the standard this channel really is; they never say the standard is wrong.
- **A band moves, it does not widen.** A learned band keeps the house width and moves its centre to where the
  films land, no more than `RELAX.band` (50 %) past the house band — pacing may be learned, a slideshow may not.
- **A hard envelope.** No learned target can leave the metric's `envelope` (a 40 % moving share is never
  accepted, whatever the films did).

The doctrine itself (`DOCTRINE`, per genre: history, biography, science, motivation, default) is code, not a
prompt: it is reviewable, testable and identical on every machine.

## The audience: the only judge that watched the film

The critic measures the cut; the audience measures the film. Once a film is published, YouTube's own
retention curve is laid over its scenes (`engine/src/retention.mjs`, `worker/youtube-analytics.mjs`) and
the result is filed with the ledger record:

- **Thresholds.** A film counts as *held* when at least 55 % are still watching at 0:30 and at least 25 %
  reach the end (`AUDIENCE`). Those are floors for a documentary, not good numbers: a hit holds far more.
- **What it changes.** A held film is evidence even when the critic only said `review` — the audience saw
  the finished thing and stayed — and its record carries `pass` from then on. A held film the critic
  **blocked** stays blocked: a defect the audience sat through is still a defect.
- **What it keeps.** `at30`, `half`, `end`, the video id and the scenes where viewers left (`drops`) and
  stayed (`holds`). The CLI prints those as lessons for the next film's writers and editor.
- **It survives a re-render.** The curve belongs to the published cut, so re-measuring the film keeps it.

The retention curve is not used to *move* a numeric target: a target is still a median of what passing
films measured. Retention decides which films are allowed to teach, which is the honest use of it — an
unwatched film is not evidence about craft, however tidy its report looked.

```bash
# after the film is published and YouTube has a curve for it (a day or two)
node local/craft-memory.mjs --retention out/<film>.retention.json --id <filmId>
```

## Use

```bash
# after a render, file the finished film (the critic already wrote the report)
node local/craft-memory.mjs --report out/<film>.report.json --id <filmId> --genre history

# what the next film of this genre is judged against (en + bn), and its name/evidence
node local/craft-memory.mjs --brief --genre history

# the ledger, one line a film, with its craft index
node local/craft-memory.mjs --show
```

The ledger is JSON at `out/craft-ledger.json` by default. Pass `--ledger productions/craft-ledger.json` to
keep it in the repository instead of on one machine; `mergeLedgers` combines two machines' ledgers, newest
reading of a film winning.

## Honest limits

- **It does not make a film better by itself.** It makes the *targets* this channel's own, and it says when a
  film fell short. What changes the picture is still the shot plan, the asset engine and the renderer.
- **It learns only what the critic measures.** A beautiful shot stays invisible to it. The critic's measures
  are the ceiling of what can be learned; widening them widens the ledger.
- **A passing verdict is the teacher.** A channel whose gate is too loose will teach itself a loose standard
  as well — the guards slow that down, but they cannot replace a gate that is honest.
- **The ledger is per genre.** It does not compare a history film with a motivation film; different genres
  are different crafts.
- **Retention needs a published film and an audience.** Under a few hundred views the curve is noise; the
  ledger only takes its thresholds at face value, so early films are judged by the critic alone.
- **A held film is not a good film.** It means the hook and the pacing worked well enough that people stayed.
  Nothing in a retention curve says the writing was true.
