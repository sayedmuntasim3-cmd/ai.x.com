/**
 * Every message the studio shows about jobs, checks and decisions, in English
 * and Bengali, keyed by a stable code. Code and logs keep the code and its
 * parameters (a message is data, not a sentence), so the page shows it in the
 * reader's language and a test can check what was said without matching
 * prose. A code without both languages fails the catalog test.
 */

/** @typedef {"en" | "bn"} Lang */
/** @typedef {Record<string, string | number>} Params */
/** @typedef {{ code: string, params?: Params }} Message */

/** @typedef {(p: Params) => string} Render */

/** @type {Readonly<Record<string, { en: Render, bn: Render }>>} */
export const MESSAGES = Object.freeze({
  // Jobs
  "job.queued": { en: () => "Waiting for a free worker.", bn: () => "একটি ফাঁকা ওয়ার্কারের অপেক্ষায়।" },
  "job.claimed": { en: (p) => `${p.worker} started the job (attempt ${p.attempt}).`, bn: (p) => `${p.worker} কাজটি শুরু করেছে (চেষ্টা ${p.attempt})।` },
  "job.reclaimed": { en: (p) => `${p.previous} stopped answering; ${p.worker} continues from the last checkpoint.`, bn: (p) => `${p.previous} সাড়া দেওয়া বন্ধ করেছে; ${p.worker} শেষ চেকপয়েন্ট থেকে কাজটি চালিয়ে যাচ্ছে।` },
  "job.progress": { en: (p) => `${p.stage}: ${p.done} of ${p.total}.`, bn: (p) => `${p.stage}: ${p.total}টির মধ্যে ${p.done}টি।` },
  "job.checkpoint": { en: (p) => `Saved a checkpoint: ${p.stage}.`, bn: (p) => `চেকপয়েন্ট সংরক্ষিত: ${p.stage}।` },
  "job.retry": { en: (p) => `Attempt ${p.attempt} failed: ${p.error} Trying again in ${p.seconds} s.`, bn: (p) => `চেষ্টা ${p.attempt} ব্যর্থ: ${p.error} ${p.seconds} সেকেন্ড পরে আবার চেষ্টা হবে।` },
  "job.lost": { en: (p) => `${p.worker} stopped answering during attempt ${p.attempt}.`, bn: (p) => `চেষ্টা ${p.attempt}-এর সময় ${p.worker} সাড়া দেওয়া বন্ধ করেছে।` },
  "job.timeout": { en: (p) => `Attempt ${p.attempt} ran past its limit of ${p.minutes} minutes.`, bn: (p) => `চেষ্টা ${p.attempt} তার ${p.minutes} মিনিটের সময়সীমা পার হয়ে গেছে।` },
  "job.failed": { en: (p) => `Stopped after ${p.failures} failed attempts: ${p.error} Finished work is kept; you can resume.`, bn: (p) => `${p.failures} বার ব্যর্থ হওয়ার পর থেমে গেছে: ${p.error} শেষ হওয়া কাজ সংরক্ষিত আছে; আবার চালু করা যাবে।` },
  "job.failedPermanent": { en: (p) => `Stopped: ${p.error} Trying again would not help. Finished work is kept.`, bn: (p) => `থেমে গেছে: ${p.error} আবার চেষ্টা করে লাভ হবে না। শেষ হওয়া কাজ সংরক্ষিত আছে।` },
  "job.released": { en: (p) => `${p.worker} paused the job safely; any eligible worker can continue it.`, bn: (p) => `${p.worker} কাজটি নিরাপদে থামিয়েছে; যোগ্য যেকোনো ওয়ার্কার এটি চালিয়ে যেতে পারবে।` },
  "job.cancelled": { en: () => "Cancelled. Finished work is kept.", bn: () => "বাতিল করা হয়েছে। শেষ হওয়া কাজ সংরক্ষিত আছে।" },
  "job.resumed": { en: () => "Queued again by the owner; finished steps are kept.", bn: () => "মালিক আবার চালু করেছেন; শেষ হওয়া ধাপগুলো রাখা হয়েছে।" },
  "job.done": { en: () => "Done.", bn: () => "শেষ হয়েছে।" },
  "job.noWorker": { en: (p) => `No connected worker can do this job yet; it needs: ${p.needs}.`, bn: (p) => `সংযুক্ত কোনো ওয়ার্কার এখনো কাজটি করতে পারে না; দরকার: ${p.needs}।` },

  // Bossism: preflight
  "plan.blocked": { en: (p) => `The film cannot start: ${p.reason}`, bn: (p) => `ফিল্ম শুরু করা যাচ্ছে না: ${p.reason}` },
  "plan.noBrain": { en: () => "No brain (writer model) is connected.", bn: () => "কোনো ব্রেইন (লেখক মডেল) সংযুক্ত নেই।" },
  "plan.noResearch": { en: () => "The brain cannot search the web and no research desk is connected, so facts could not be sourced.", bn: () => "ব্রেইন ওয়েবে খুঁজতে পারে না এবং কোনো রিসার্চ ডেস্কও সংযুক্ত নেই, তাই তথ্যের সূত্র পাওয়া যাবে না।" },
  "plan.notBuilt": { en: (p) => `${p.system} films are not built yet.`, bn: (p) => `${p.system} ফিল্ম এখনো তৈরি হয়নি।` },
  "plan.windowSmall": { en: (p) => `The brain's window (${p.window} tokens) is smaller than a ${p.minutes}-minute film needs (about ${p.needed}).`, bn: (p) => `ব্রেইনের উইন্ডো (${p.window} টোকেন) ${p.minutes} মিনিটের ফিল্মের প্রয়োজনের (প্রায় ${p.needed}) চেয়ে ছোট।` },
  "plan.qaPerChapter": { en: (p) => `The brain's window (${p.window} tokens) cannot hold the whole film for QA (about ${p.needed}): QA reads one chapter at a time, so the model does not compare chapters with each other (code still checks open loops and the clock across the film).`, bn: (p) => `ব্রেইনের উইন্ডো (${p.window} টোকেন) QA-র জন্য পুরো ফিল্ম (প্রায় ${p.needed}) ধরতে পারে না: QA একবারে একটি অধ্যায় পড়বে, তাই মডেল অধ্যায়গুলো পরস্পরের সাথে মিলিয়ে দেখবে না (কোড তবুও পুরো ফিল্মে open loop ও সময় যাচাই করবে)।` },
  "plan.blind": { en: () => "The brain cannot see pictures: footage is not checked by eye; the first licensed search result is used.", bn: () => "ব্রেইন ছবি দেখতে পারে না: ফুটেজ চোখে যাচাই হবে না; প্রথম লাইসেন্সপ্রাপ্ত সার্চ ফলাফল ব্যবহার হবে।" },
  "plan.desk": { en: () => "The brain cannot search the web: research comes from the code research desk (Wikipedia and the pages it cites).", bn: () => "ব্রেইন ওয়েবে খুঁজতে পারে না: তথ্য আসবে কোডের রিসার্চ ডেস্ক থেকে (উইকিপিডিয়া ও সেখানে উদ্ধৃত পেজ)।" },
  "plan.noMarket": { en: () => "No YouTube key: titles are written without the videos that already won on this topic.", bn: () => "YouTube কী নেই: এই বিষয়ে আগে সফল ভিডিও না দেখেই টাইটেল লেখা হবে।" },
  "plan.noMedia": { en: () => "No footage source is connected: shots get no pictures.", bn: () => "কোনো ফুটেজ উৎস সংযুক্ত নেই: শটগুলোতে ছবি থাকবে না।" },
  "plan.noAutoRender": { en: () => "GitHub is not connected: the film is not rendered automatically.", bn: () => "GitHub সংযুক্ত নেই: ফিল্ম নিজে থেকে রেন্ডার হবে না।" },

  // Bossism: gates
  "gate.pass": { en: (p) => `${names(p.gate, "en")}: passed.`, bn: (p) => `${names(p.gate, "bn")}: পাস করেছে।` },
  "gate.revise": { en: (p) => `${names(p.gate, "en")}: needs revision.`, bn: (p) => `${names(p.gate, "bn")}: সংশোধন দরকার।` },
  "gate.block": { en: (p) => `${names(p.gate, "en")}: blocked.`, bn: (p) => `${names(p.gate, "bn")}: আটকে দেওয়া হয়েছে।` },
  "research.fewFacts": { en: (p) => `Only ${p.facts} sourced facts (at least ${p.needed} needed).`, bn: (p) => `মাত্র ${p.facts}টি সূত্রসহ তথ্য (অন্তত ${p.needed}টি দরকার)।` },
  "research.unchecked": { en: () => "The research's sources were never opened in code, so its facts are unverified.", bn: () => "রিসার্চের সূত্রগুলো কোডে কখনো খোলা হয়নি, তাই তথ্যগুলো যাচাই করা হয়নি।" },
  "research.fewSites": { en: (p) => `The facts rest on ${p.sites} site(s); at least ${p.needed} independent sites are expected.`, bn: (p) => `তথ্যগুলো মাত্র ${p.sites}টি সাইটের উপর নির্ভর করে; অন্তত ${p.needed}টি স্বাধীন সাইট প্রত্যাশিত।` },
  "research.unconfirmed": { en: (p) => `${p.count} of ${p.total} facts state a number no opened page shows.`, bn: (p) => `${p.total}টি তথ্যের মধ্যে ${p.count}টিতে এমন সংখ্যা আছে যা খোলা কোনো পেজে নেই।` },
  "research.contradiction": { en: (p) => `Facts ${p.ids} make the same claim with different values and no conflict note.`, bn: (p) => `${p.ids} তথ্যগুলো একই দাবি ভিন্ন মানে করছে, কিন্তু কোনো দ্বন্দ্ব-নোট নেই।` },
  "claims.unknown": { en: (p) => `${p.chapter}: scenes cite claims that are not in the S2 ledger (${p.ids}).`, bn: (p) => `${p.chapter}: দৃশ্যগুলো এমন দাবি উদ্ধৃত করছে যা S2 লেজারে নেই (${p.ids})।` },
  "claims.noLedger": { en: () => "There is no S2 claim ledger to check the script against.", bn: () => "স্ক্রিপ্ট যাচাই করার মতো কোনো S2 দাবি-লেজার নেই।" },
  "script.missing": { en: (p) => `${p.chapter} has not been written.`, bn: (p) => `${p.chapter} এখনো লেখা হয়নি।` },
  "script.errors": { en: (p) => `${p.chapter}: ${p.count} code check(s) still fail (${p.codes}).`, bn: (p) => `${p.chapter}: ${p.count}টি কোড-চেক এখনো ব্যর্থ (${p.codes})।` },
  "story.lowStay": { en: (p) => `The viewer panel would keep ${p.score}/10 watching the opening: ${p.why}`, bn: (p) => `দর্শক প্যানেলের হিসাবে শুরুতে ১০ জনে ${p.score} জন দেখতে থাকবে: ${p.why}` },
  "story.noScript": { en: () => "There is no script yet, so the story cannot be judged.", bn: () => "এখনো কোনো স্ক্রিপ্ট নেই, তাই গল্প যাচাই করা যাচ্ছে না।" },
  "story.notRead": { en: () => "The opening was not test-read by the viewer panel.", bn: () => "শুরুর অংশটি দর্শক প্যানেল পড়ে দেখেনি।" },
  "story.hook": { en: (p) => `The hook still has problems: ${p.codes}.`, bn: (p) => `হুকে এখনো সমস্যা আছে: ${p.codes}।` },
  "story.holds": { en: (p) => `${p.chapter}: ${p.count} shot(s) hold one picture too long with no move.`, bn: (p) => `${p.chapter}: ${p.count}টি শটে একটি ছবি নড়াচড়া ছাড়া বেশি সময় থেমে থাকে।` },
  "visual.none": { en: () => "No footage was searched for this film.", bn: () => "এই ফিল্মের জন্য কোনো ফুটেজ খোঁজা হয়নি।" },
  "visual.missing": { en: (p) => `${p.chapter}: ${p.missing} of ${p.shots} shots have no fitting licensed picture.`, bn: (p) => `${p.chapter}: ${p.shots}টি শটের মধ্যে ${p.missing}টিতে মানানসই লাইসেন্সপ্রাপ্ত ছবি নেই।` },
  "visual.unreviewed": { en: (p) => `${p.chapter}: ${p.count} picks were not checked by eye.`, bn: (p) => `${p.chapter}: ${p.count}টি ছবি চোখে যাচাই করা হয়নি।` },
  "rights.unlicensed": { en: (p) => `${p.chapter}: ${p.count} picture(s) have no acceptable licence record (${p.ids}).`, bn: (p) => `${p.chapter}: ${p.count}টি ছবির গ্রহণযোগ্য লাইসেন্স রেকর্ড নেই (${p.ids})।` },
  "rights.credit": { en: (p) => `${p.count} picture(s) need a credit that the description does not carry.`, bn: (p) => `${p.count}টি ছবির ক্রেডিট দরকার, কিন্তু বর্ণনায় তা নেই।` },
  "rights.owner": { en: (p) => `${p.count} shot(s) use the owner's own pictures; their rights are the owner's responsibility.`, bn: (p) => `${p.count}টি শটে মালিকের নিজের ছবি; এগুলোর অধিকারের দায়িত্ব মালিকের।` },
  "rights.ai": { en: () => "The film may contain realistic AI scenes: set \"Altered or synthetic content\" in YouTube Studio.", bn: () => "ফিল্মে বাস্তবসম্মত AI দৃশ্য থাকতে পারে: YouTube Studio-তে \"Altered or synthetic content\" চালু করুন।" },
  "packaging.missing": { en: () => "The publishing pack (S7) has not been written.", bn: () => "প্রকাশের প্যাকেজ (S7) এখনো লেখা হয়নি।" },
  "packaging.title": { en: (p) => `The title needs work: ${p.problems}`, bn: (p) => `টাইটেলে কাজ বাকি: ${p.problems}` },
  "packaging.originality": { en: (p) => `Originality check: ${p.verdict}. ${p.reasons}`, bn: (p) => `মৌলিকতা যাচাই: ${p.verdict}। ${p.reasons}` },
  "master.missing": { en: () => "There is no render report to check the finished film against.", bn: () => "শেষ ফিল্ম যাচাই করার মতো কোনো রেন্ডার রিপোর্ট নেই।" },
  "master.loudness": { en: (p) => `The master is ${p.lufs} LUFS; the target is ${p.target} ±1.`, bn: (p) => `মাস্টারের লাউডনেস ${p.lufs} LUFS; লক্ষ্য ${p.target} ±1।` },
  "master.peak": { en: (p) => `The master peaks at ${p.peak} dBTP, above ${p.ceiling}.`, bn: (p) => `মাস্টারের পিক ${p.peak} dBTP, যা ${p.ceiling}-এর বেশি।` },
  "master.duration": { en: (p) => `The master runs ${p.actual} s; the film should run ${p.expected} s.`, bn: (p) => `মাস্টার চলে ${p.actual} সেকেন্ড; ফিল্মটি চলার কথা ${p.expected} সেকেন্ড।` },
  "master.warnings": { en: (p) => `The renderer reported ${p.count} problem(s): ${p.first}`, bn: (p) => `রেন্ডারার ${p.count}টি সমস্যা জানিয়েছে: ${p.first}` },
  "master.voice": { en: (p) => `Only ${p.voiced} of ${p.narrated} narrated scenes have a voice.`, bn: (p) => `বর্ণনাসহ ${p.narrated}টি দৃশ্যের মধ্যে মাত্র ${p.voiced}টিতে কণ্ঠ আছে।` },

  // Bossism: decisions
  "release.allowed": { en: () => "Every critical check passed: the film may be rendered and released.", bn: () => "সব গুরুত্বপূর্ণ যাচাই পাস করেছে: ফিল্মটি রেন্ডার ও প্রকাশ করা যাবে।" },
  "release.blocked": { en: (p) => `Release blocked by: ${names(p.gates, "en")}. Fix these or approve the release yourself, with a reason.`, bn: (p) => `প্রকাশ আটকে দিয়েছে: ${names(p.gates, "bn")}। এগুলো ঠিক করুন, অথবা কারণ লিখে নিজে প্রকাশের অনুমতি দিন।` },
  "release.override": { en: (p) => `The owner approved the release despite: ${names(p.gates, "en")}. Reason: ${p.reason}`, bn: (p) => `${names(p.gates, "bn")} থাকা সত্ত্বেও মালিক প্রকাশের অনুমতি দিয়েছেন। কারণ: ${p.reason}` },
  "revise.sent": { en: (p) => `Sent back for revision (round ${p.round} of ${p.max}): ${p.stages}.`, bn: (p) => `সংশোধনের জন্য ফেরত পাঠানো হয়েছে (রাউন্ড ${p.round}/${p.max}): ${p.stages}।` },
  "revise.limit": { en: (p) => `The revision limit (${p.max}) is reached; what is still wrong stays listed.`, bn: (p) => `সংশোধনের সীমা (${p.max}) শেষ; যা এখনো ঠিক হয়নি তা তালিকায় থাকছে।` },
});

/** Names of gates and stages, in both languages. */
export const NAMES = Object.freeze({
  research: { en: "Research", bn: "রিসার্চ" },
  claims: { en: "Claims", bn: "দাবি" },
  script: { en: "Script", bn: "স্ক্রিপ্ট" },
  story: { en: "Story", bn: "গল্প" },
  visual: { en: "Pictures", bn: "ছবি" },
  rights: { en: "Rights", bn: "অধিকার" },
  packaging: { en: "Packaging", bn: "প্যাকেজিং" },
  master: { en: "Finished film", bn: "শেষ ফিল্ম" },
});

/**
 * A message in one language. An unknown code is shown as itself, never as
 * an empty string, so a missing translation is visible.
 * @param {Message} message @param {Lang} [lang]
 */
export function say(message, lang = "en") {
  const entry = MESSAGES[message.code];
  if (!entry) return message.code;
  return entry[lang === "bn" ? "bn" : "en"](message.params ?? {});
}

/**
 * A message in both languages, for files the studio and the owner read.
 * @param {string} code @param {Params} [params]
 * @returns {Message & { en: string, bn: string }}
 */
export function msg(code, params = {}) {
  const m = { code, params };
  return { ...m, en: say(m, "en"), bn: say(m, "bn") };
}

/**
 * Gate or stage ids ("research,visual") as names in one language, so a
 * message never mixes languages.
 * @param {string | number | undefined} ids @param {Lang} lang
 */
function names(ids, lang) {
  const list = String(ids ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return list.map((id) => nameOf(id, lang)).join(lang === "bn" ? ", " : ", ");
}

/** A gate or stage name in one language. @param {string} id @param {Lang} [lang] */
export function nameOf(id, lang = "en") {
  const n = NAMES[/** @type {keyof typeof NAMES} */ (id)];
  return n ? n[lang === "bn" ? "bn" : "en"] : id;
}
