import test from "node:test";
import assert from "node:assert/strict";
import { pickCandidates, looksEnglish, CHANNEL_ORDER } from "./youtube-watch.mjs";

const row = (id, channel, views = 2e6, durationSeconds = 900, title = "How the great tunnel was built") => ({ id, channel, views, durationSeconds, title });

test("looksEnglish: Latin titles yes, other scripts no", () => {
  assert.equal(looksEnglish("Why Are There So Many Different Transmission Towers?"), true);
  assert.equal(looksEnglish("ऐसा क्यों होता है इंजीनियरिंग में"), false);
});

test("pickCandidates: 1M+, English, 8-45 min, unwatched, best channels first, max 15", () => {
  const rows = [
    row("aaaaaaaaaaa", "Other", 9e6), row("bbbbbbbbbbb", "Practical Engineering", 1.2e6), row("ccccccccccc", "Plainly Difficult", 1.1e6),
    row("ddddddddddd", "Other", 5e5), row("eeeeeeeeeee", "Other", 3e6, 7200), row("fffffffffff", "Other", 3e6, 900, "इंजीनियरिंग की कहानी यहाँ"),
    row("ggggggggggg", "Storified", 2e6), { ...row("hhhhhhhhhhh", "Other"), channel: undefined, channelTitle: "ColdFusion" },
  ];
  const ids = pickCandidates(rows, new Set(["ggggggggggg"])).map((c) => c.id);
  assert.deepEqual(ids, ["ccccccccccc", "hhhhhhhhhhh", "bbbbbbbbbbb", "aaaaaaaaaaa"]);
  assert.ok(CHANNEL_ORDER[0] === "Plainly Difficult");
  const many = Array.from({ length: 40 }, (_, i) => row(String(i).padStart(11, "x"), "Other", 2e6 + i));
  assert.equal(pickCandidates(many, new Set()).length, 15);
});
