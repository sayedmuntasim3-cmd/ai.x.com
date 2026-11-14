"""
A pool of Commons pictures for the visual-check validation set, scored by the
same frame check the films use (detect.check), with numbered contact sheets
for a person to label:

  python local/media/eval_pool.py --out pool [--per 12]

Saved: pool/items.json (title, page, thumb, query group, scores) and
pool/sheet-<group>.jpg. Labels are written separately
(local/media/validation/labels.json) by someone who looked at every picture;
local/media/visual-eval.mjs measures precision and recall from both.
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import detect  # noqa: E402

# Groups chosen to hold positives, negatives and hard cases for each check.
GROUPS = [
    ("hikers", "hikers mountain trail incategory:Quality_images"), ("shepherd", "shepherd sheep landscape incategory:Quality_images"),
    ("tourists", "tourists viewpoint landscape incategory:Quality_images"), ("hut", "mountain hut incategory:Quality_images"),
    ("ruins", "ruins desert incategory:Quality_images"), ("village", "village valley landscape incategory:Quality_images"),
    ("city", "city skyline night incategory:Quality_images"), ("mountain", "mountain landscape incategory:Quality_images"),
    ("desert", "desert dunes incategory:Quality_images"), ("sea", "sea waves coast incategory:Quality_images"),
    ("forest", "forest trees incategory:Quality_images"), ("sky", "clouds sky sunset incategory:Quality_images"),
    ("painting", "landscape oil painting"), ("drawing", "landscape drawing engraving"),
    ("sign", "signpost trail incategory:Quality_images"), ("litter", "litter plastic pollution"),
    ("road", "road through landscape incategory:Quality_images"), ("power", "power line landscape incategory:Quality_images"),
]
UA = {"User-Agent": "ZuponaStudio/1.0 (visual check validation)"}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception as e:
            sys.stderr.write(f"{url[:80]}: {e}\n")
            time.sleep(15 * (k + 1))
    return None


def sheet(paths, out):
    from PIL import Image, ImageDraw

    w, h = 480, 320
    img = Image.new("RGB", (w * 4, h * ((len(paths) + 3) // 4)), "black")
    for i, (n, p) in enumerate(paths):
        try:
            t = Image.open(p).convert("RGB")
            t.thumbnail((w, h))
            img.paste(t, ((i % 4) * w, (i // 4) * h))
        except Exception:
            pass
        d = ImageDraw.Draw(img)
        d.rectangle([(i % 4) * w, (i // 4) * h, (i % 4) * w + 70, (i // 4) * h + 34], fill="black")
        d.text(((i % 4) * w + 6, (i // 4) * h + 6), str(n), fill="yellow", font_size=24)
    img.save(out, quality=85)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--out", default="pool")
    a.add_argument("--per", type=int, default=12)
    o = a.parse_args()
    os.makedirs(o.out, exist_ok=True)
    items, n = [], 0
    for group, q in GROUPS:
        api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": o.per + 6, "gsrsearch": q, "prop": "imageinfo", "iiprop": "url|mime", "iiurlwidth": 1024})
        time.sleep(3)
        raw = get(api)
        if not raw:
            continue
        pages = sorted(json.loads(raw).get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
        shown = []
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]
            if ii.get("mime") != "image/jpeg" or len(shown) >= o.per:
                continue
            time.sleep(1)
            data = get(ii["thumburl"])
            if not data:
                continue
            n += 1
            path = os.path.join(o.out, f"{n:03d}.jpg")
            open(path, "wb").write(data)
            item = detect.check(path, 1, True, None)
            items.append({"n": n, "group": group, "title": p["title"], "page": ii["descriptionurl"], "thumb": ii["thumburl"], "faces": item["faces"], "people": item["people"], "look": item["look"], "exposure": item["exposure"], "sideways": item["sideways"]})
            shown.append((n, path))
        if shown:
            sheet(shown, os.path.join(o.out, f"sheet-{group}.jpg"))
        print(group, len(shown), flush=True)
    json.dump({"detector": detect.CLIP_MODEL, "items": items}, open(os.path.join(o.out, "items.json"), "w"), indent=1, ensure_ascii=False)
    print("items", len(items))


if __name__ == "__main__":
    main()
