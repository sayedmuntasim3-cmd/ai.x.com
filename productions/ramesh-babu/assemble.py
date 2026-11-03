"""Assemble result.json for build.mjs from the per-stage files of each version."""
import json, os, sys
DIR = os.path.dirname(os.path.abspath(__file__))
out = {"versions": []}
missing = []
for v in ["USA", "Bangladesh"]:
    d = os.path.join(DIR, v)
    def read(name):
        p = os.path.join(d, name)
        if not os.path.exists(p):
            missing.append(f"{v}/{name}")
            return ""
        return open(p, encoding="utf-8").read()
    chapters = json.load(open(os.path.join(d, "s3-chapters.json"), encoding="utf-8"))
    s5 = [{"id": c["id"], "title": c["title"], "markdown": read(f"s5-{c['id']}.md")} for c in chapters]
    for c in s5:
        if "CONTINUE" in c["markdown"]:
            missing.append(f"{v}/s5-{c['id']}.md is unfinished")
    qa = json.load(open(os.path.join(d, "qa.json"), encoding="utf-8")) if os.path.exists(os.path.join(d, "qa.json")) else {"mustFix": []}
    out["versions"].append({"version": v, "s01": read("s01.md"), "s2": read("s2.md"), "s3": read("s3.md"), "s4": read("s4.md"),
                            "s5": s5, "s6": read("s6.md"), "s7": read("s7.md"), "qa": {"mustFix": len(qa.get("mustFix", []))}})
json.dump(out, open(os.path.join(DIR, "result.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("missing:", missing if missing else "none")
