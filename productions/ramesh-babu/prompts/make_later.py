import json,sys
DIR='productions/ramesh-babu'
HEAD="You are one member of a two-version documentary production. Work only from files; write your output to the one file named below with the Write tool; reply with a short summary only (at most 6 lines).\n\n1. Read {d}/brief.md and follow it exactly: it tells you which engine manual and research files to read, and holds the production rules and the VERSION LOCK (language, currency, audience) that every client-facing word must obey.\n"
LENSES=[
 "LENS: FACTS. Check every factual statement in narration and on-screen text against the S2 ledger and "+DIR+"/research_bio.json. Flag invented facts, silently resolved conflicts, verbatim quotes presented as exact, unattributed \"billionaire\"/net-worth claims, celebrity clients stated as fact, wrong currency conversions.",
 "LENS: LANGUAGE, AUDIENCE AND RIGHTS. Check the version lock on every client-facing word (language, script, spelling, currency, cultural references), the banned list (engine section 16), native speakable narration, and the production rules: only the five free stock sites, no paid/agency/social/AI sources, no stock face presented as Ramesh Babu or family, no minors, no logos in thumbnails, Videvo/Mixkit/Coverr licence conditions.",
 "LENS: CRAFT, TIMING AND RETENTION. Check timestamps tile 00:00-45:00 with no gaps or overlaps across chapters, scene IDs continuous SC0001-SC0270 (or the S3 total), narration word counts vs durations, the 30-second hook's four beats and fast cuts, resets about every 3 minutes, interrupts about every 25 s, midpoint and 80% cliffhanger as real turns, every open loop paid, chapter hand-offs, no clip repeated within 10 minutes, at most 3 variants per clip, and whether the edit/grade/sound notes would really hide free-stock origins at a Hollywood level.",
]
def chapters(v): return json.load(open(f'{DIR}/{v}/s3-chapters.json'))
def qa(v):
    d=f'{DIR}/{v}'
    files=", ".join(f"{d}/s5-{c['id']}.md" for c in chapters(v))
    for i,lens in enumerate(LENSES,1):
        p=HEAD.format(d=d)+f"2. Read the S2 claim ledger {d}/s2.md, the S3 architecture {d}/s3.md, and the whole S5 film, chapter by chapter: {files}.\n3. {lens}\nEvery real defect is a mustFix naming the chapter ID (C1-C6) and scene ID, with exact replacement text. Do not report style preferences as defects. List what passed.\n4. Write JSON to {d}/qa-lens{i}.json with exactly this shape: {{\"mustFix\": [{{\"chapter\": \"C1\", \"scene\": \"SC0001\", \"issue\": \"...\", \"fix\": \"...\"}}], \"passed\": [\"...\"]}}. It must parse with JSON.parse. Do not write any other file.\n5. Reply with the file path, the number of mustFix items by chapter, and anything you could not check."
        open(f'{DIR}/prompts/qa-{v}-lens{i}.txt','w').write(p)
def fix(v):
    d=f'{DIR}/{v}'
    for c in chapters(v):
        cid=c['id']
        p=HEAD.format(d=d)+f"2. Read the QA findings in {d}/qa-lens1.json, {d}/qa-lens2.json and {d}/qa-lens3.json and keep only the mustFix items whose chapter is {cid}. Also read the S2 ledger {d}/s2.md and S4 bibles {d}/s4.md.\n3. Revise chapter {cid} of the S5 script, {d}/s5-{cid}.md: apply EVERY one of those fixes exactly; keep everything else, the format, scene IDs and timestamps ({c['start']}-{c['end']}, {c['firstScene']}-{c['lastScene']}). If two fixes conflict, apply the one that keeps facts accurate and say so in your reply.\n4. Write the complete revised chapter to {d}/s5-{cid}.final.md (even if there were no fixes for {cid}, write the chapter unchanged). Do not change any other file.\n5. Reply with the file path, how many fixes you applied, and any fix you could not apply and why."
        open(f'{DIR}/prompts/fix-{v}-{cid}.txt','w').write(p)
def report(v):
    d=f'{DIR}/{v}'
    files=", ".join(f"{d}/s5-{c['id']}.final.md" for c in chapters(v))
    p6=HEAD.format(d=d)+f"2. Read the final film chapter by chapter: {files}; the QA findings that were applied: {d}/qa-lens1.json, {d}/qa-lens2.json, {d}/qa-lens3.json; and {d}/s2.md, {d}/s3.md.\n3. Write stage S6, the whole-film QA report (engine section 13), for the final film: every gate PASS/FAIL with evidence, totals (scenes, runtime, words vs budget, R1 vs R3 shares, clips used, repeats), the QA fixes that were applied (summarise by type, with the total count), and every remaining GAP with its action (for example verifying quotes against original articles). Be honest; do not claim checks you did not run. Count things from the files (you may use shell tools such as grep or a short script to count scenes and words) rather than estimating.\n4. Write it (markdown) to {d}/s6.md. Do not write any other file.\n5. Reply with the file path, the number of FAIL gates and remaining GAPs."
    open(f'{DIR}/prompts/s6-{v}.txt','w').write(p6)
    p7=HEAD.format(d=d)+f"2. Read S1 {d}/s01.md, S3 {d}/s3.md and the final film: {files}.\n3. Write stage S7, the publishing pack (engine section 14), for this film and audience: final title (from S1, matching the delivered film), 3 thumbnail briefs (free stock + typography, no faces of real people, no logos), description with chapters (first at 00:00, from the final chapter timestamps), credits block for the free stock and music actually used in the final film (with the \"© OpenStreetMap contributors\" credit), tags, pinned comment, 3 Shorts cut-downs and 1 Facebook-native cut each with its own hook and exact source timestamps from the final film, upload settings (disclosure: no synthetic content used; made for kids: No; category; language), and posting plan for this audience.\n4. Write it (markdown) to {d}/s7.md. Do not write any other file.\n5. Reply with the file path and the final title."
    open(f'{DIR}/prompts/s7-{v}.txt','w').write(p7)
for v in ['USA','Bangladesh']:
    qa(v); fix(v); report(v)
