// M1c: prints the 12-niche section of docs/research/VIRAL_STUDY.md from the data files. Picks (ids) and ratings are my reading; numbers come from the data.
// Run: node tools/research/niche-table.mjs
import { readFileSync, readdirSync } from "node:fs";
const dir = new URL("../../docs/research/data/", import.meta.url);
const all = new Map();
for (const f of readdirSync(dir)) { const j = JSON.parse(readFileSync(new URL(f, dir), "utf8")); if (Array.isArray(j)) for (const v of j) if (v.id) all.set(v.id, { ...(all.get(v.id) ?? {}), ...v }); }
const foot = JSON.parse(readFileSync(new URL("niche-footage.json", dir), "utf8"));
// niche | free-footage rating (my reading) | what exists | [ids] | note on the picks
const N = [
 ["History & Civilizations","Medium","NARA/LoC photos and film for modern history; Internet Archive; museum open-access images for ancient (little real video of antiquity)",["49_Ph2q6uIM","P3IIRiSTc3g","4p51Jj2kyh0"],"Greek-mythology 210-min compilation (26.1M) left out: not history."],
 ["Disasters & Mysteries","Medium-High","NARA, NOAA, USGS, FEMA, NTSB reports, old newsreels on Internet Archive; no footage of most modern mysteries (MH370, Cicada)",["I2O7blSSzpI","kd2KEHvK-q8","CbUjuwhQPKs"],"Hindi/French disaster films (Dhruv Rathee 36.6M, Investigation 34.3M) skipped: not a USA audience."],
 ["Science","High","NASA, NIH, NOAA, USGS video and images; Pixabay science/nature clips",["MiUHjLxm3V0","ujkD4SxPKOI","KfODG5REyss"],"Animation (Kurzgesagt) and lab shoots (Veritasium) are not free-footage films."],
 ["Engineering & Megaprojects","Medium","US Army Corps, Bureau of Reclamation, NARA and Prelinger construction film for 1900-1970 projects; modern megaprojects (China, Saudi) have none free",["7wLhJ7q7By4","QiYvXKQksgI","GbB3vFfiaVU"],"First pick is a 137-min compilation. Only 3 films at 10M+ found."],
 ["Economics & Financial History","Medium","NARA/LoC Depression photos and film, FRED/gov charts, Prelinger; modern markets none",["xguam0TKMw8","T98825bzcKw","EpMLAQbSYAw"],"Dalio film is animation. Folding Ideas NFTs (19.1M, 138 min) is 4th."],
 ["Business & Company History","Low-Medium","Company footage is copyrighted; free only pre-1929, gov films, Prelinger ads",["TXg1mYN2tbw","tS_fJJxMjn4","fNh_GyRbJDA"],"Thin at 10M+: third pick is 7.8M (MagnatesMedia). Search quota gap."],
 ["Automotive & Transport","Medium","Prelinger (cars, rail, highways), NASA/NARA aviation, Smithsonian; modern car footage is copyrighted; Pixabay vehicle clips",["Tr1B18XJ8Z8","e5AGHEUxLME","y0ygn8QKbGA"],"Last two are under 10M (9.4M, 9.0M); a Disney Cars cartoon (50.8M) is not a documentary. Search quota gap."],
 ["WWII & Military","Very high","NARA and US Army/Navy/Air Force film, Internet Archive, LoC; best free supply of any niche",["0UJYYkK4d8s","1CqGeAmVu1I","Zd88lzCWjpA"],"Rank 1 is a 100-min re-upload style film; rank 2 is a map animation; rank 3 is CGI (Yarnhub)."],
 ["Space & Astronomy","Very high","NASA (images, video, audio are generally public domain), ESA/Hubble not all free",["U9WOMerccoM","pSHVbLPWA28","fSbm5LCJspk"],"NASA Artemis II live broadcasts (28.0M, 19.3M, 234-383 min) left out: broadcasts, not films."],
 ["Technology & Inventions","Medium","NASA, NARA, Prelinger, AT&T-era films on Internet Archive for pre-1990; modern tech/AI needs original screen capture",["d95J8yzvjbQ","JsBZOcqZerk","NiCgcUTL9_Q"],"Rank 1 (443M) is a Google DeepMind film release, not a normal channel result."],
 ["Nature & Ocean","High","NOAA Ocean Explorer, NPS, USGS, NASA Earth, Pixabay nature/ocean video",["87Jor5G_NBs","s7DbVTkaXn0","EF8C4v7JIbA"],"Rank 2 is 4K ambient footage (28 min, no story); rank 1 is a travel film (host on camera)."],
 ["Geography & Maps","High","LoC maps (public domain), NASA Earth Observatory, USGS, Pixabay aerials",["H42zWaD4A4s","l6UtZ-u9CyM","9qRxNYuR2c4"],"Pure map-explainer channels (Wendover, RealLifeLore) had no 10M+ film in their latest 50; the three are place-journalism, not map films."],
];
const f1 = (n) => (n / 1e6).toFixed(1) + "M";
console.log("| Niche | # | Video | Channel | Views | Min | Date | Free real footage (my reading) | IA items* |\n|---|---|---|---|---|---|---|---|---|");
for (const [n, rate, what, ids] of N) ids.forEach((id, i) => {
  const v = all.get(id); if (!v) throw new Error("missing " + id);
  const t = v.title.replace(/\|/g, "/").slice(0, 60) + (v.title.length > 60 ? "…" : "");
  console.log(`| ${i ? "" : "**" + n + "**"} | ${i + 1} | [${t}](https://youtu.be/${id}) | ${(v.channelTitle ?? v.channel ?? "").slice(0, 22)} | ${f1(v.views)} | ${Math.round(v.durationSeconds / 60)} | ${(v.publishedAt ?? "").slice(0, 7)} | ${i ? "" : rate} | ${i ? "" : foot.counts[n]} |`);
});
console.log("\n### Footage notes and picks (niche: what exists; note on picks)");
for (const [n, rate, what, , note] of N) console.log(`- **${n}** (${rate}): ${what}. ${note}`);
