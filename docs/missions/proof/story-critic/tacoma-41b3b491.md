# Story critic on daily film 41b3b491 (Tacoma Narrows)

Script: artifact daily-41b3b491 of run 45867027399 (script.json, 5946 words, 8 parts). Sources: the two Wikipedia articles of the topic, fetched again on 27 Nov 2026 (the text may differ slightly from 26 Nov). Code checks only (no brain pass).

```
{
 "acts": 8,
 "words": 5946,
 "question": "As we watch the twisted steel plunge into the water, we return to the central question: how could a brand‑new bridge, built on the best theory of its day, shake itself apart in a moderate wind?",
 "answer": {
  "ok": true,
  "cover": 65,
  "causal": true
 },
 "repeats": 2,
 "nearDuplicates": 1,
 "cliches": 2,
 "hedges": 5,
 "brain": false,
 "sourceNumbers": 127
}
- [revise] critique.noWhy C7: Act C7 says what happened but never why.
    
- [block] critique.unsourcedName C2: Act C2: 2 name(s) are in no source: Northwest; Hudson.
    Northwest
    Hudson
- [block] critique.unsourcedName C6: Act C6: 1 name(s) are in no source: Bill.
    Bill
- [revise] critique.filler C1: Filler and cliches (2): C1: a stark reminder; C1: sent shockwaves.
    C1: a stark reminder
    C1: sent shockwaves
```

Read by hand: "Bill and Scanlan" is a real error (the source says Billah and Scanlan); "Hudson" and "Pacific Northwest" are not in the sources. C7 also has a logic gap code cannot see ("those steel trusses" refers to a sentence the fact pass cut); the brain pass is built to find such gaps.
