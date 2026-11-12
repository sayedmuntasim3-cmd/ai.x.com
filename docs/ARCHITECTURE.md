# Architecture: no device is the bottleneck

Written 12 November 2026. What runs where, how each failure is handled, how
Bossism decides, and what has and has not been verified. Read
`docs/ENGINEERING_STATE.md` first for the overall state.

## 1. The shape

```
 Phone / browser                 Cloudflare (the studio)                    The owner's machines
 ───────────────                 ───────────────────────                    ────────────────────
 studio page:                    Worker: API, auth, Bossism preflight        node local/jobs.mjs work --api …
  start, watch, decide    ───►   Workflow: durable film runs (hosted brain) ◄─── pull: claim, heartbeat,
  voice check in a Web           R2: every film file, review, decisions,          checkpoint, complete
  Worker, constant memory        the job queue (compare-and-swap)                 (calls out; nothing at home
                                 GitHub runner: renders on request                 is exposed)
```

Three rules hold everywhere:

1. **Clients are thin.** A phone starts, watches and decides; it never holds
   a whole recording, a film or a render.
2. **State lives in durable storage, never in a process.** Every film file,
   stage result, review, decision and job is in R2 (or a folder for local
   runs). Any process can die at any moment; the next one continues.
3. **Work goes to a machine that can do it, at the quality asked for.** A
   worker states its capabilities; a job states its needs; only a match
   claims it. Quality is never lowered to fit a weak machine; work nothing
   can do is reported as waiting, with what it needs.

## 2. What each kind of device does

| Device | Does | Never does |
|---|---|---|
| Phone (any) | Starts films, watches progress, reads Bossism's verdicts, approves releases, checks a recording | Decode a recording beyond its memory budget, hold a film, render |
| Low-end computer (2 GB+, ffmpeg) | Also renders at 720p as a worker | Render 1080p or run a brain |
| Standard computer (4 GB+, 4 cores) | Renders 1080p; runs a small brain if it has one | Claim a film whose brain window it lacks |
| Strong computer (16 GB+, 8 cores, GPU) | Runs the free brain for long films, renders 2160p, several jobs at once | Anything above its probed capabilities |
| Cloudflare Workflow | Films with a hosted brain (Claude, Gemini), durable step by step | Films with the owner's local brain (a worker makes those) |

The tiers come from `engine/src/device-profile.mjs`; `local/device.mjs`
measures memory, cores, ffmpeg and an NVIDIA GPU rather than assuming them.

### The voice check on phones, measured

The studio checks a recording in the browser (`public/studio/app.js`,
`audio-worker.js`). Peak memory over the page's baseline, Chromium, 10-minute
recordings (`node tools/voice-memory-check.cjs`):

| Recording | Before | Now |
|---|---|---|
| WAV, 110 MB | +463 MB | +99 MB (read in 4 MB slices by the Web Worker; exact) |
| MP3, 0.5 GB device budget | +845 MB | +150 MB (decoded in 1 MB parts with backpressure; marked approximate); +179 MB for 30 minutes |
| M4A, 0.5 GB device budget | +816 MB | refused with the memory it needs, in both languages |
| M4A, 8 GB device budget | +816 MB | +699 MB (decoded whole, within the budget) |

The budget is 15% of `navigator.deviceMemory` (Chrome reports it; elsewhere
2 GB is assumed on a phone, 4 GB on a computer), between 120 and 800 MB.
Desktop Chromium, not a real Android phone: the page's own use is measured,
not a given phone's limit. Next: WebCodecs decoding for M4A, so long phone
recordings are read in parts too.

## 3. How every failure is handled

| What happens | What keeps the work | What the person sees |
|---|---|---|
| Page refreshed, browser closed | Everything is in R2; the studio remembers the film id | Progress again on the next visit |
| Weak or lost network on a phone | Polling backs off to 2 minutes and pauses while the tab is hidden | Progress resumes when the signal does |
| Server or Worker restart | Workflow steps are durable; each stage's result, gaps and spending travel in its step result, so a replayed step loses nothing and a retried one duplicates nothing | Nothing |
| A worker machine dies (crash, closed laptop) | Its lease runs out; any eligible worker claims the job and continues from the last checkpoint (film stages, render segments); the loss is counted | "Home PC stopped answering; Laptop continues from the last checkpoint." |
| A worker is stopped with Ctrl+C | The job is handed back at once, no failure counted | "… paused the job safely; any eligible worker can continue it." |
| An attempt fails | Retried after 30 s, 60 s, 120 s … (capped); stops after 3 failures | The error, the wait, and that finished work is kept |
| An error a retry cannot fix (bad input, a film that is not cleared) | Stops at once | "Trying again would not help." |
| An attempt runs past its limit (6 hours default, 24 for films) | Counted as a failure, queued again after a wait | The limit that was passed |
| The owner cancels | The worker sees it at its next heartbeat and stops; nothing it made is deleted | "Cancelled. Finished work is kept." |
| A film that cannot work (no brain, window too small) | Refused before anything is spent | The reason, in both languages |
| The budget is reached | The run stops before the next stage; resumable with a larger budget | The spend and the budget |
| Work no connected machine can do | It waits | "No connected worker can do this job yet; it needs: …" |

Nothing is silently deleted: failed and cancelled jobs keep their history and
checkpoint, and the owner can queue them again (`retry`).

## 4. The job queue

`engine/src/jobs.mjs`, `engine/src/job-runner.mjs`.

- **States:** queued → running → done | failed | cancelled; a lost or
  released job goes back to queued.
- **Lease:** a claim gives a token and an expiry (2 minutes default). The
  worker heart-beats every third of that. A heartbeat that finds the job lost,
  cancelled or past its time limit tells the worker to stop, and a stopped
  worker never completes the job.
- **Every change is a compare-and-swap** on a versioned store, so two
  workers can never both win a claim. Stores: in memory (tests), a folder
  with lock files (`local/folder-store.mjs`, several processes or machines
  sharing a disk; not a sync service such as Dropbox), and R2 with
  conditional writes (`worker/r2-job-store.mjs`).
- **Eligibility:** kind, capabilities (`ffmpeg`, `render:1080p`, `brain` …),
  memory, and the brain window a film needs (`minContextTokens`, from
  Bossism's measured window needs).
- **History:** every event is a message code with parameters, shown in
  English or Bengali (`engine/src/messages.mjs`); 60 entries kept per job.
- **Scale:** listing every job to claim one suits one owner's studio. For
  many users the same interface belongs on a strongly consistent store with a
  claim index (a Durable Object per queue shard, for example).

### Commands

```sh
# on the owner's machines, taking work from the cloud studio (set WORKER_TOKEN, the studio's worker secret)
node local/jobs.mjs work --api https://ai.zupona.com --name "Home PC"

# or a queue in a folder, without Cloudflare
node local/jobs.mjs add film --topic "The rise and fall of Lamborghini" --minutes 10
node local/jobs.mjs add render --run films/<slug> --resolution 1920x1080
node local/jobs.mjs work                      # one or more, on one or more machines
node local/jobs.mjs status --lang bn          # or: health, cancel <id>, retry <id>
node local/jobs.mjs add selftest              # checks a worker end to end (checkpoints, takeover)
```

In the studio: tick "Make it on my own computer" when starting a film, and
"Render on my computer" on a finished film (the file stays on the machine;
nothing is published).

Settings: `WORKER_TOKEN` (secret; separate from `STUDIO_TOKEN`, so a
machine's credential cannot start films or spend money), `MAX_REVISIONS`
(0 to 3, default 1).

## 5. Bossism

`engine/src/bossism.mjs`, `engine/src/supervise.mjs`. Bossism does not
write; it decides, from evidence, never from a model saying its own work is
good.

1. **Understand** what is made: an idea film (wired), a voice film or a
   Quran film (planned; refused with that reason).
2. **Production graph:** every stage the run executes, with the roster roles
   that do it, what each needs, and its dependencies ("data": a later stage
   reads it; "order": film order only). A test runs a whole film and checks
   that every stage it executed is a node, in an order the graph allows.
3. **Preflight**, before anything is spent: no brain, no research path, or a
   brain window too small for the film's largest stage (measured on the
   finished 45-minute film: QA reads about 150k tokens at once) blocks the
   film. Every lowered quality is named: research through the code desk, no
   footage check by eye, QA chapter by chapter, no market data, no
   auto-render, waiting for a worker.
4. **Seven gates** read the run's own files:

   | Gate | Checks | Critical |
   |---|---|---|
   | Research | enough sourced facts; pages opened by code; at least 4 independent sites (2 is a block); unconfirmed numbers; one claim with two values and no conflict note | yes |
   | Claims | every claim a scene cites exists in the S2 ledger | yes |
   | Script | every chapter written; the scene checks re-run by the gate itself | yes |
   | Story | the cold viewer panel's score; the hook; pictures held too long | no |
   | Pictures | every shot has a fitting licensed picture (over 20% missing: revise; over 50%: block); picks not checked by eye are said | no |
   | Rights | every picture's licence record is acceptable; every credit CC BY requires is in the description | yes |
   | Packaging | the publishing pack, a clean title, originality against the channel | no |

   A gate with nothing to judge blocks; it never passes.
5. **Revision:** a finding names the stage that made the defect and a note
   for it; that stage and everything that reads it are redone with the notes
   (bounded, default once), their old gaps withdrawn. Only "data"
   dependents are redone: fixing chapter 1 does not rewrite chapter 2.
6. **Release:** a film is rendered and published only when no gate blocks
   and no critical gate asks for revision, or when the owner approves it with
   a written reason, recorded after the review. The render workflow checks
   this before spending anything, and measures the master (loudness, true
   peak, voice coverage, failed pictures, and its real length with ffprobe)
   before publishing.
7. **Decision record:** `decisions.json` is only appended to: each review's
   verdicts, each revision, each release decision and each owner approval.

What Bossism cannot judge: whether the story is moving or a picture is
beautiful. It measures what code can (a cold panel's score, hook rules,
hold lengths, coverage), and leaves taste to the owner, who sees every
verdict and decides.

## 6. Verified, and not

Verified in this session:
- 173 engine and 73 platform tests pass; the strict type check and the
  Cloudflare build check pass.
- Real processes: a worker killed with SIGKILL mid-job is replaced after its
  lease and the job continues from its checkpoint, through a folder queue
  and through the cloud API; Ctrl+C hands a job back; two workers ran six
  jobs, each once (five consecutive runs).
- The local Workers runtime with real local R2: five simultaneous claims,
  one winner; a real worker process took and finished a job; a film that does
  not fit the brain refused (422, both languages); an unreviewed render
  blocked (409); the owner's approval recorded.
- Chromium: the voice-check memory figures above; the studio loads with no
  script errors.
- The finished Ramesh Babu film: claims gate (73 ledger claims, 409
  citations, 0 unknown) and script gate pass; research and pictures block,
  correctly, because that film was written by hand without them.

Not verified:
- A real Cloudflare deployment, real Claude, Gemini or local-model calls, or
  the live Wikipedia API (none reachable from this sandbox).
- A real Android phone (desktop Chromium was used).
- A render job on a worker end to end with a real film (the render code is
  the existing renderer; the job path was tested up to the release gate).
