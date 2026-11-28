# Picture taste: proof status (28 Nov 2026)

No contact sheets are committed: neither fresh Apollo film reached a finished mp4 (a blocked film uploads no artifact), so there is nothing to sheet.

| Film | Result | What the log showed |
|---|---|---|
| 20e30c23 (PR #123 code) | blocked at join | new gate fired: 3 shots under 85% filled (worst 6%, later judged a dark-footage false positive), 1 text-on-black card; relevance 44% |
| 3c50458b (PR #126 code, 2 retries; first two retries failed in "words" on the free brain's plan: type-missing) | blocked at join | text-on-black gone; still blocked by: 3 unfilled shots (worst 35%), 2 clips with a corner logo (SC0004-1 top-left, SC0005-2 top-right), black picture 3.5 s at 15.1 s, relevance 38%, flicker 6, 6 archival-video shots in a row |

Reading: the gate now sees small-in-black pictures and burned-in logos in the finished master. The picture supply for the Apollo launch lines is the open problem (archive footage with logos and black stretches wins); the renderer cannot cut a logo out of footage. Next: make `render/asset-rank` check a candidate clip's own frames for a corner logo and black stretches before choosing it (the metadata check alone did not catch them), and upload the report and master even when blocked so a contact sheet can be made.
