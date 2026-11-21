# Missions: one chat = one mission, nothing else

Every worker chat is given exactly one file here. These rules hold for every mission:
- **On every turn,** including a bare "continue" from the owner or a turn after a credit reset:
  1. Run `git fetch origin && git pull` on your branch.
  2. Re-read your mission file.
  3. Resume at the first unchecked item.
- **Stay inside the mission's "Owns" files.** If you find a problem outside them, write one line under
  "Found for others" and go on. Never switch topic.
- **After each finished item:**
  1. Tick it.
  2. Add one line to the Log (date, what, evidence).
  3. Commit and push.

  The file is the memory, so a new chat can take over from it.
- **Merging:** only through a PR, with CI green, the preview opened, and production checked after the
  merge. Never force-push, reset or delete a branch.
- **Spending:** zero money. No paid API, no Claude API inside the product. Never synthesize Quran recitation.
- **Saving tokens:**
  - Use grep -n and sed -n; never open big files whole.
  - Run only the tests you touched, and the full checks once before each commit.
  - No polling: one send_later at the expected finish time.
- **Reporting:** report to the Zupona BOSS session (session_018ZdrYZ2w2t2RcK58Ch7YsV) in at most 5 Bangla
  lines, only when an item that has a proof is done.

Read `docs/TRANSFORMATION.md` once; the gates in its section 4 are the standard.
