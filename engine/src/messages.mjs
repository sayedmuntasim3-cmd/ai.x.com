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

const WHY = {
  coverage: ["much of the speech is not Quran", "কথার অনেকটা কুরআন নয়"],
  quality: ["too few words of the ayat were heard", "আয়াতের খুব কম শব্দ শোনা গেছে"],
  weak: ["the match is weak", "মিল দুর্বল"],
  ambiguous: ["these words occur in more than one place", "এই শব্দগুলো একাধিক জায়গায় আছে"],
  slow: ["far too long for this passage", "এই অংশের তুলনায় রেকর্ডিং অনেক বেশি লম্বা"],
  fast: ["far too short for this passage", "এই অংশের তুলনায় রেকর্ডিং অনেক বেশি ছোট"],
  lengths: ["the phrase lengths do not follow the ayat", "বাক্যাংশের দৈর্ঘ্য আয়াতের সাথে মেলে না"],
};
/** @param {unknown} why @param {0 | 1} lang */
const whyText = (why, lang) => String(why ?? "").split(",").filter(Boolean).map((w) => /** @type {Record<string, string[]>} */ (WHY)[w]?.[lang] ?? w).join("; ");
const whyEn = (/** @type {unknown} */ why) => whyText(why, 0);
const whyBn = (/** @type {unknown} */ why) => whyText(why, 1);
const PHRASE = { istiadha: ["Isti'adha (a'udhu billah)", "আউযুবিল্লাহ"], basmala: ["Basmala", "বিসমিল্লাহ"], closing: ["Closing words (sadaqa Allahu al-'azim)", "সমাপ্তি বাক্য (সাদাকাল্লাহুল আযীম)"], takbir: ["Takbir", "তাকবীর"] };
const phraseEn = (/** @type {unknown} */ k) => /** @type {Record<string, string[]>} */ (PHRASE)[String(k)]?.[0] ?? String(k);
const phraseBn = (/** @type {unknown} */ k) => /** @type {Record<string, string[]>} */ (PHRASE)[String(k)]?.[1] ?? String(k);

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
  "plan.waitWorker": { en: () => "No machine with a brain is connected right now: the film waits in the queue until one is (node local/jobs.mjs work --api ...).", bn: () => "এই মুহূর্তে ব্রেইনসহ কোনো মেশিন সংযুক্ত নেই: একটি সংযুক্ত না হওয়া পর্যন্ত ফিল্মটি কিউতে অপেক্ষা করবে (node local/jobs.mjs work --api ...)।" },
  "plan.noAutoRender": { en: () => "GitHub is not connected: the film is not rendered automatically.", bn: () => "GitHub সংযুক্ত নেই: ফিল্ম নিজে থেকে রেন্ডার হবে না।" },

  // Bossism: gates
  "gate.notRun": { en: (p) => `${names(p.gate, "en")}: could not run (BLOCKED), so it blocks release.`, bn: (p) => `${names(p.gate, "bn")}: চালানো যায়নি (BLOCKED), তাই প্রকাশ আটকে আছে।` },
  "gate.naScript": { en: (p) => `${names(p.gate, "en")}: not applicable (a script-only review has no pictures to check; it never clears a film for release).`, bn: (p) => `${names(p.gate, "bn")}: প্রযোজ্য নয় (শুধু স্ক্রিপ্টের রিভিউতে যাচাই করার মতো ছবি নেই; এটা কখনো ফিল্ম প্রকাশের ছাড়পত্র দেয় না)।` },
  "gate.pass": { en: (p) => `${names(p.gate, "en")}: passed.`, bn: (p) => `${names(p.gate, "bn")}: পাস করেছে।` },
  "gate.revise": { en: (p) => `${names(p.gate, "en")}: needs revision.`, bn: (p) => `${names(p.gate, "bn")}: সংশোধন দরকার।` },
  "gate.block": { en: (p) => `${names(p.gate, "en")}: blocked.`, bn: (p) => `${names(p.gate, "bn")}: আটকে দেওয়া হয়েছে।` },
  "research.fewFacts": { en: (p) => `Only ${p.facts} sourced facts (at least ${p.needed} needed).`, bn: (p) => `মাত্র ${p.facts}টি সূত্রসহ তথ্য (অন্তত ${p.needed}টি দরকার)।` },
  "research.unchecked": { en: () => "The research's sources were never opened in code, so its facts are unverified.", bn: () => "রিসার্চের সূত্রগুলো কোডে কখনো খোলা হয়নি, তাই তথ্যগুলো যাচাই করা হয়নি।" },
  "research.fewSites": { en: (p) => `The facts rest on ${p.sites} site(s); at least ${p.needed} independent sites are expected.`, bn: (p) => `তথ্যগুলো মাত্র ${p.sites}টি সাইটের উপর নির্ভর করে; অন্তত ${p.needed}টি স্বাধীন সাইট প্রত্যাশিত।` },
  "research.unconfirmed": { en: (p) => `${p.count} of ${p.total} facts state a number no opened page shows.`, bn: (p) => `${p.total}টি তথ্যের মধ্যে ${p.count}টিতে এমন সংখ্যা আছে যা খোলা কোনো পেজে নেই।` },
  "research.contradiction": { en: (p) => `Facts ${p.ids} make the same claim with different values and no conflict note.`, bn: (p) => `${p.ids} তথ্যগুলো একই দাবি ভিন্ন মানে করছে, কিন্তু কোনো দ্বন্দ্ব-নোট নেই।` },
  "claims.unknown": { en: (p) => `${p.chapter}: scenes cite claims that are not in the S2 ledger (${p.ids}).`, bn: (p) => `${p.chapter}: দৃশ্যগুলো এমন দাবি উদ্ধৃত করছে যা S2 লেজারে নেই (${p.ids})।` },
  "claims.placeholder": { en: (p) => `${p.chapter}: ${p.count} unresolved markers would be read aloud or shown on screen (${p.list}).`, bn: (p) => `${p.chapter}: ${p.count}টি অমীমাংসিত চিহ্ন জোরে পড়া হবে বা পর্দায় দেখা যাবে (${p.list})।` },
  "claims.markerResolved": { en: (p) => `${p.chapter}: a marker was replaced by a number although the S2 ledger has no value for its claim (${p.list}).`, bn: (p) => `${p.chapter}: S2 লেজারে দাবিটির কোনো মান না থাকা সত্ত্বেও একটি চিহ্নের জায়গায় সংখ্যা বসানো হয়েছে (${p.list})।` },
  "claims.noEvidence": { en: (p) => `${p.chapter}: scenes cite claims with no evidence the research kept (${p.ids}).`, bn: (p) => `${p.chapter}: দৃশ্যগুলো এমন দাবি উদ্ধৃত করছে যার পক্ষে গবেষণায় রাখা কোনো প্রমাণ নেই (${p.ids})।` },
  "claims.unverified": { en: (p) => `${p.chapter}: scenes state as fact claims that no opened page confirms (${p.ids}).`, bn: (p) => `${p.chapter}: দৃশ্যগুলো এমন দাবিকে তথ্য হিসেবে বলছে যা খোলা কোনো পেজ নিশ্চিত করে না (${p.ids})।` },
  "claims.lowConfidence": { en: (p) => `${p.chapter}: scenes state as fact claims the ledger rates low confidence (${p.ids}).`, bn: (p) => `${p.chapter}: দৃশ্যগুলো এমন দাবিকে তথ্য হিসেবে বলছে যার আস্থা লেজারে কম (${p.ids})।` },
  "claims.ambiguousEvidence": { en: (p) => `${p.chapter}: FACT claims rest on a page the research shares between confirmed and unconfirmed facts (${p.ids}).`, bn: (p) => `${p.chapter}: তথ্য-দাবিগুলো এমন পেজের ওপর নির্ভর করছে যা গবেষণায় নিশ্চিত ও অনিশ্চিত দুই ধরনের তথ্যে ব্যবহৃত (${p.ids})।` },
  "claims.unlinked": { en: (p) => `${p.chapter}: narrated sentences have no valid claim tag (${p.ids}).`, bn: (p) => `${p.chapter}: বর্ণনার বাক্যগুলোর কোনো বৈধ দাবি-ট্যাগ নেই (${p.ids})।` },
  "claims.unlinkedFact": { en: (p) => `${p.chapter}: sentences tagged as non-factual state a number, a date or a name (${p.ids}).`, bn: (p) => `${p.chapter}: তথ্যহীন হিসেবে চিহ্নিত বাক্যে সংখ্যা, তারিখ বা নাম আছে (${p.ids})।` },
  "claims.unknownStated": { en: (p) => `${p.chapter}: sentences that rest only on UNKNOWN claims state a value (${p.ids}).`, bn: (p) => `${p.chapter}: শুধু অজানা দাবির ওপর দাঁড়ানো বাক্য একটি মান বলছে (${p.ids})।` },
  "claims.unlinkedScreen": { en: (p) => `${p.chapter}: numbers are shown on screen in scenes that cite no claim (${p.ids}).`, bn: (p) => `${p.chapter}: যে দৃশ্য কোনো দাবি উদ্ধৃত করে না, সেখানে পর্দায় সংখ্যা দেখানো হচ্ছে (${p.ids})।` },
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
  "release.stale": { en: () => "This review was made by an older version of the checks, so it clears nothing. Review the film again before release.", bn: () => "এই রিভিউ চেকের পুরোনো সংস্করণে করা, তাই এটি কোনো ছাড়পত্র দেয় না। প্রকাশের আগে ফিল্মটি আবার রিভিউ করুন।" },
  "script.approved": { en: () => "Script approved by every gate that applies. This is a script-only review: the film still needs its pictures and a full review before any release.", bn: () => "প্রযোজ্য সব gate স্ক্রিপ্টটি অনুমোদন করেছে। এটা শুধু স্ক্রিপ্টের রিভিউ: যেকোনো প্রকাশের আগে ফিল্মটির ছবি আর পূর্ণ রিভিউ লাগবে।" },
  "script.blocked": { en: (p) => `Script not approved: ${names(p.gates, "en")}. This is a script-only review; it never clears a film for release.`, bn: (p) => `স্ক্রিপ্ট অনুমোদিত হয়নি: ${names(p.gates, "bn")}। এটা শুধু স্ক্রিপ্টের রিভিউ; এটা কখনো ফিল্ম প্রকাশের ছাড়পত্র দেয় না।` },
  "release.allowed": { en: () => "Every critical check passed: the film may be rendered and released.", bn: () => "সব গুরুত্বপূর্ণ যাচাই পাস করেছে: ফিল্মটি রেন্ডার ও প্রকাশ করা যাবে।" },
  "release.blocked": { en: (p) => `Release blocked by: ${names(p.gates, "en")}. Fix these or approve the release yourself, with a reason.`, bn: (p) => `প্রকাশ আটকে দিয়েছে: ${names(p.gates, "bn")}। এগুলো ঠিক করুন, অথবা কারণ লিখে নিজে প্রকাশের অনুমতি দিন।` },
  "release.override": { en: (p) => `The owner approved the release despite: ${names(p.gates, "en")}. Reason: ${p.reason}`, bn: (p) => `${names(p.gates, "bn")} থাকা সত্ত্বেও মালিক প্রকাশের অনুমতি দিয়েছেন। কারণ: ${p.reason}` },
  "revise.sent": { en: (p) => `Sent back for revision (round ${p.round} of ${p.max}): ${p.stages}.`, bn: (p) => `সংশোধনের জন্য ফেরত পাঠানো হয়েছে (রাউন্ড ${p.round}/${p.max}): ${p.stages}।` },
  "revise.limit": { en: (p) => `The revision limit (${p.max}) is reached; what is still wrong stays listed.`, bn: (p) => `সংশোধনের সীমা (${p.max}) শেষ; যা এখনো ঠিক হয়নি তা তালিকায় থাকছে।` },

  // Voice system: intake, words, understanding, pictures
  "voice.ready": { en: (p) => `Voice checked: ${p.seconds} s, ${p.lufs} LUFS, true peak ${p.peak} dBTP, ${p.silence}% silence.`, bn: (p) => `ভয়েস পরীক্ষা হয়েছে: ${p.seconds} সেকেন্ড, ${p.lufs} LUFS, ট্রু পিক ${p.peak} dBTP, ${p.silence}% নীরবতা।` },
  "voice.noFfmpeg": { en: () => "ffmpeg is not installed, so the voice file cannot be read.", bn: () => "ffmpeg ইনস্টল নেই, তাই ভয়েস ফাইল পড়া যাচ্ছে না।" },
  "voice.unreadable": { en: (p) => `The voice file could not be read as audio: ${p.error}`, bn: (p) => `ভয়েস ফাইলটি অডিও হিসেবে পড়া গেল না: ${p.error}` },
  "voice.short": { en: () => "The recording is shorter than one second.", bn: () => "রেকর্ডিং এক সেকেন্ডের চেয়ে ছোট।" },
  "voice.clipping": { en: (p) => `The voice clips in ${p.runs} place(s); it is repaired gently, but a new take with lower gain is better.`, bn: (p) => `ভয়েস ${p.runs} জায়গায় ক্লিপ করেছে; আলতোভাবে ঠিক করা হবে, তবে কম গেইনে নতুন করে রেকর্ড করা ভালো।` },
  "voice.noisy": { en: (p) => `Background noise is only ${p.snr} dB under the voice.`, bn: (p) => `পেছনের শব্দ ভয়েসের চেয়ে মাত্র ${p.snr} dB কম।` },
  "voice.quiet": { en: (p) => `The voice is very quiet (${p.lufs} LUFS); raising it also raises its noise.`, bn: (p) => `ভয়েস খুব আস্তে (${p.lufs} LUFS); বাড়ালে এর নয়েজও বাড়বে।` },
  "voice.silent": { en: (p) => `${p.silence}% of the file is silence; check that it is the right file.`, bn: (p) => `ফাইলের ${p.silence}% নীরব; ঠিক ফাইল কি না দেখে নিন।` },
  "voice.lowRate": { en: (p) => `The sample rate is ${p.rate} Hz, so the voice will sound dull.`, bn: (p) => `স্যাম্পল রেট ${p.rate} Hz, তাই ভয়েস ভোঁতা শোনাবে।` },
  "voice.words": { en: (p) => `${p.count} words heard (${p.language}) by ${p.engine} ${p.model}.`, bn: (p) => `${p.engine} ${p.model} ${p.count}টি শব্দ শুনেছে (${p.language})।` },
  "voice.noWords": { en: () => "No words were found in the voice, so no film can be planned on it.", bn: () => "ভয়েসে কোনো শব্দ পাওয়া যায়নি, তাই এর উপর ফিল্মের পরিকল্পনা করা যাবে না।" },
  "voice.wordsEstimated": { en: () => "The transcript has times per line only; word times inside a line are estimated, so cuts may be off by a fraction of a second.", bn: () => "ট্রান্সক্রিপ্টে শুধু লাইনের সময় আছে; লাইনের ভেতরে শব্দের সময় অনুমান করা, তাই কাট সেকেন্ডের ভগ্নাংশ এদিক-ওদিক হতে পারে।" },
  "voice.wordsAligned": { en: (p) => `The words are the script's, exactly; ${p.share}% of them were timed where they were heard, the rest are placed between those.`, bn: (p) => `শব্দগুলো হুবহু স্ক্রিপ্টের; এর ${p.share}% শব্দের সময় নেওয়া হয়েছে যেখানে শোনা গেছে, বাকিগুলো তাদের মাঝখানে বসানো।` },
  "voice.lowConfidence": { en: (p) => `${p.share}% of the words were heard with low confidence; check the transcript before the film is made.`, bn: (p) => `${p.share}% শব্দ কম নিশ্চয়তায় শোনা গেছে; ফিল্ম বানানোর আগে ট্রান্সক্রিপ্ট দেখে নিন।` },
  "voice.badTimes": { en: (p) => `${p.count} word time(s) were out of order or past the end of the recording.`, bn: (p) => `${p.count}টি শব্দের সময় উল্টাপাল্টা বা রেকর্ডিংয়ের শেষের পরে ছিল।` },
  "voice.kind": { en: (p) => `This voice is ${p.kind === "quran" ? "Quran recitation" : "narration"} (${p.language}).`, bn: (p) => `এই ভয়েসটি ${p.kind === "quran" ? "কুরআন তিলাওয়াত" : "বর্ণনা (narration)"} (${p.language})।` },
  "voice.quranFound": { en: (p) => `Recognised Surah ${p.surah}, ayat ${p.from}-${p.to} (${p.coverage}% of the words match Tanzil).`, bn: (p) => `চেনা গেছে সূরা ${p.surah}, আয়াত ${p.from}-${p.to} (${p.coverage}% শব্দ Tanzil-এর সাথে মেলে)।` },
  "voice.quranNotFound": { en: () => "Quran recitation was asked for, but no ayah was recognised; the transcript may be too weak.", bn: () => "কুরআন তিলাওয়াত বলা হয়েছে, কিন্তু কোনো আয়াত চেনা যায়নি; ট্রান্সক্রিপ্ট হয়তো দুর্বল।" },
  // Quran: which surah and ayat, and when each is recited (quran-locate.mjs)
  "quran.given": { en: (p) => `Using the passage you gave: ${p.passage}.`, bn: (p) => `আপনার দেওয়া অংশ ধরা হয়েছে: ${p.passage}।` },
  "quran.badSurah": { en: (p) => `No surah matches "${p.value}". Give the surah's number (1 to 114) or its name.`, bn: (p) => `"${p.value}" নামে কোনো সূরা পাওয়া যায়নি। সূরার নম্বর (১ থেকে ১১৪) বা নাম দিন।` },
  "quran.badAyat": { en: (p) => `Surah ${p.surah} has ${p.count} ayat; "${p.value}" is not a range inside it. Write it like 1-${p.count}.`, bn: (p) => `সূরা ${p.surah}-এ ${p.count}টি আয়াত আছে; "${p.value}" তার ভেতরের সীমা নয়। এভাবে লিখুন: 1-${p.count}।` },
  "quran.heard": { en: (p) => `Heard: ${p.passage} (${p.coverage}% of the recognised words are Quran; ${p.quality}% of the words of these ayat were heard).`, bn: (p) => `শোনা গেছে: ${p.passage} (চেনা শব্দের ${p.coverage}% কুরআনের; এই আয়াতগুলোর ${p.quality}% শব্দ শোনা গেছে)।` },
  "quran.confirmed": { en: () => "What was heard agrees with the passage you gave.", bn: () => "যা শোনা গেছে তা আপনার দেওয়া অংশের সাথে মেলে।" },
  "quran.unconfirmed": { en: () => "The recognizer could not confirm the passage; your surah and ayat are used as given.", bn: () => "রিকগনাইজার অংশটি নিশ্চিত করতে পারেনি; আপনার দেওয়া সূরা ও আয়াতই ধরা হয়েছে।" },
  "quran.estimated": { en: (p) => `No recognizer confirmed the times: ayah times are estimated from the measured pauses and the length of each ayah. ${p.sure} of ${p.total} ayah ends are sure; the others are marked unsure and must not be used as cut points until a recognizer or a person confirms them.`, bn: (p) => `সময়গুলো কোনো রিকগনাইজার নিশ্চিত করেনি: আয়াতের সময় মাপা বিরতি ও প্রতিটি আয়াতের দৈর্ঘ্য থেকে অনুমান করা। ${p.total}টি আয়াত-শেষের ${p.sure}টি নিশ্চিত; বাকিগুলো অনিশ্চিত চিহ্নিত, রিকগনাইজার বা কোনো মানুষ নিশ্চিত না করা পর্যন্ত সেখানে ছবি কাটা যাবে না।` },
  "quran.timed": { en: (p) => `Ayah times come from the recognised words, moved onto the measured pauses: ${p.sure} of ${p.total} ayah ends are sure.`, bn: (p) => `আয়াতের সময় চেনা শব্দ থেকে নেওয়া, তারপর মাপা বিরতির ওপর বসানো: ${p.total}টি আয়াত-শেষের ${p.sure}টি নিশ্চিত।` },
  "quran.ask.adhan": { en: () => "This sounds like the adhan (call to prayer), not a Quran recitation, so no ayah is matched to it. Send a recitation, or say which surah and ayat it is if this is wrong.", bn: () => "এটি আজানের মতো শোনাচ্ছে, কুরআন তিলাওয়াত নয়, তাই কোনো আয়াতের সাথে মেলানো হয়নি। তিলাওয়াত পাঠান, অথবা ভুল হলে বলুন এটি কোন সূরা ও কোন আয়াত।" },
  "quran.ask.passage": { en: () => "The recitation could not be identified surely enough, so nothing is guessed. Which surah and ayat is it? (for example: surah 93, ayat 1-11)", bn: () => "তিলাওয়াতটি যথেষ্ট নিশ্চিতভাবে চেনা যায়নি, তাই কিছু অনুমান করা হয়নি। এটি কোন সূরা ও কোন আয়াত? (যেমন: সূরা 93, আয়াত 1-11)" },
  "quran.ask.confirm": { en: (p) => `It sounds like ${p.passage}, but not surely enough (${whyEn(p.why)}). Give the surah and ayat to continue.`, bn: (p) => `শুনে মনে হচ্ছে ${p.passage}, কিন্তু যথেষ্ট নিশ্চিত নয় (${whyBn(p.why)})। এগোতে সূরা ও আয়াত দিন।` },
  "quran.ask.mismatch": { en: (p) => `You gave ${p.given}, but the recording sounds like ${p.heard}. Which is right?`, bn: (p) => `আপনি দিয়েছেন ${p.given}, কিন্তু রেকর্ডিং শুনে মনে হচ্ছে ${p.heard}। কোনটি ঠিক?` },
  "quran.ask.notFit": { en: (p) => `The recording does not fit ${p.passage} (${whyEn(p.why)}). Check the surah and ayat.`, bn: (p) => `রেকর্ডিংটি ${p.passage}-এর সাথে মেলে না (${whyBn(p.why)})। সূরা ও আয়াত আবার দেখুন।` },
  "quran.ask.times": { en: () => "The passage was recognised but the recognizer gave no word times. Run it again with word times, or give the surah and ayat.", bn: () => "অংশটি চেনা গেছে, কিন্তু রিকগনাইজার শব্দের সময় দেয়নি। শব্দ-সময়সহ আবার চালান, অথবা সূরা ও আয়াত দিন।" },
  "quran.fixed": { en: (p) => `${phraseEn(p.phrase)} at ${p.start}-${p.end} s: labelled, not an ayah.`, bn: (p) => `${phraseBn(p.phrase)} ${p.start}-${p.end} সেকেন্ডে: চিহ্নিত করা হয়েছে, এটি আয়াত নয়।` },
  "quran.repeat": { en: (p) => `Ayah ${p.surah}:${p.ayah} is recited again at ${p.start} s: kept as recited.`, bn: (p) => `আয়াত ${p.surah}:${p.ayah} ${p.start} সেকেন্ডে আবার পড়া হয়েছে: যেমন পড়া হয়েছে তেমনই রাখা হয়েছে।` },
  "quran.other": { en: (p) => `${p.words} recognised word(s) are not Quran text (from ${p.start} s): they get no ayah.`, bn: (p) => `${p.words}টি চেনা শব্দ কুরআনের পাঠ নয় (${p.start} সেকেন্ড থেকে): এগুলোর জন্য কোনো আয়াত ধরা হয়নি।` },
  "quran.openingUnsure": { en: () => "The pauses do not settle whether the recording opens with the isti'adha or the basmala; say which (--opening) to be sure.", bn: () => "রেকর্ডিং আউযুবিল্লাহ বা বিসমিল্লাহ দিয়ে শুরু কি না, বিরতি দেখে নিশ্চিত হওয়া যায়নি; নিশ্চিত হতে নিজে বলে দিন (--opening)।" },
  "quran.joined": { en: (p) => `${p.count} ayah end(s) have no pause: the reciter went on in one breath, so those cut points are approximate.`, bn: (p) => `${p.count}টি আয়াতের শেষে কোনো বিরতি নেই: কারী এক নিঃশ্বাসে পড়ে গেছেন, তাই ওই কাটার জায়গাগুলো আনুমানিক।` },
  "quran.directed": { en: (p) => `Shot list: ${p.shots} shots, cut only at ayah ends and pauses; ${p.symbolic} show the unseen only as a symbol (adab level ${p.level}).`, bn: (p) => `শট তালিকা: ${p.shots}টি শট, কাটা হয়েছে শুধু আয়াতের শেষে ও বিরতিতে; ${p.symbolic}টিতে অদৃশ্য বিষয় শুধু প্রতীক হিসেবে (আদব স্তর ${p.level})।` },
  "quran.directionProblems": { en: (p) => `${p.count} problem(s) in the shot list: the film is not rendered until they are fixed.`, bn: (p) => `শট তালিকায় ${p.count}টি সমস্যা: ঠিক না হওয়া পর্যন্ত ফিল্ম রেন্ডার হবে না।` },
  "quran.media": { en: (p) => `Media: ${p.found} of ${p.shots} shots have a licensed asset (${p.video} video, ${p.image} photo); ${p.gaps} shot(s) have none and are listed as gaps.`, bn: (p) => `মিডিয়া: ${p.shots}টি শটের ${p.found}টিতে লাইসেন্সসহ ফুটেজ আছে (${p.video}টি ভিডিও, ${p.image}টি ছবি); ${p.gaps}টি শটে কিছু পাওয়া যায়নি, সেগুলো ঘাটতি হিসেবে তালিকায় আছে।` },
  "quran.review.noName": { en: () => "A decision needs the reviewer's name.", bn: () => "সিদ্ধান্তের জন্য রিভিউয়ারের নাম লাগবে।" },
  "quran.review.noScene": { en: (p) => `There is no scene ${p.shot}.`, bn: (p) => `${p.shot} নামে কোনো দৃশ্য নেই।` },
  "quran.review.decided": { en: (p) => `${p.count} scene(s): ${p.action}.`, bn: (p) => `${p.count}টি দৃশ্য: ${p.action === "approve" ? "অনুমোদিত" : p.action === "replace" ? "বদলানো হবে" : "বাতিল, গাঢ় কার্ড"} (${p.action})।` },
  "quran.review.open": { en: (p) => `${p.count} scene(s) are not approved yet (${p.shots}).`, bn: (p) => `${p.count}টি দৃশ্য এখনো অনুমোদিত হয়নি (${p.shots})।` },
  "quran.review.signed": { en: (p) => `Signed off by ${p.by}: the Quran text, the ayat and the pictures were checked.`, bn: (p) => `${p.by} স্বাক্ষর করেছেন: কুরআনের লেখা, আয়াত ও ছবি যাচাই করা হয়েছে।` },
  "quran.review.none": { en: () => "The film has not been reviewed.", bn: () => "ফিল্মটির রিভিউ হয়নি।" },
  "quran.review.unsigned": { en: () => "No reviewer has signed off the religious accuracy: the film cannot be marked ready.", bn: () => "কোনো রিভিউয়ার ধর্মীয় নির্ভুলতায় স্বাক্ষর করেননি: ফিল্মটি প্রকাশযোগ্য বলা যাবে না।" },
  "quran.review.notRendered": { en: () => "The film has not been rendered and measured yet.", bn: () => "ফিল্মটি এখনো রেন্ডার ও মাপা হয়নি।" },
  "quran.review.renderFailed": { en: () => "The rendered film failed its own checks (length, black or frozen picture, or a cut inside the voice).", bn: () => "রেন্ডার করা ফিল্ম নিজের পরীক্ষায় ফেল করেছে (দৈর্ঘ্য, কালো বা থেমে থাকা ছবি, বা কণ্ঠের ভেতরে কাট)।" },
  "quran.review.loudness": { en: (p) => `The film is at ${p.lufs} LUFS, not -14.`, bn: (p) => `ফিল্মের লাউডনেস ${p.lufs} LUFS, -14 নয়।` },
  "quran.review.peak": { en: (p) => `The true peak is ${p.peak} dBTP, above -1.`, bn: (p) => `ট্রু পিক ${p.peak} dBTP, -1-এর বেশি।` },
  "quran.review.ready": { en: (p) => `Ready to publish: every scene approved, the film passed its checks, signed off by ${p.by}.`, bn: (p) => `প্রকাশের জন্য প্রস্তুত: সব দৃশ্য অনুমোদিত, ফিল্ম পরীক্ষায় পাস, স্বাক্ষর করেছেন ${p.by}।` },
  "quran.fragment": { en: (p) => `${p.count} short fragment(s) matched another place (${p.places}) and were not taken as ayat; listen to that part.`, bn: (p) => `${p.count}টি ছোট টুকরো অন্য জায়গার (${p.places}) সাথে মিলেছে, সেগুলোকে আয়াত ধরা হয়নি; ওই অংশটা শুনে নিন।` },
  "quran.page.title": { en: () => "Recitation film review", bn: () => "তিলাওয়াত ফিল্ম রিভিউ" },
  "quran.page.intro": { en: () => "For the scholar and the editor, each on their own. Every scene shows the real frame from the rendered film, the ayah, the picture with its source and licence, why it was chosen and what the checks said. Approve, reject or replace with the commands shown; a film is published only at PASS.", bn: () => "আলেম ও এডিটর আলাদাভাবে দেখবেন। প্রতিটি দৃশ্যে রেন্ডার করা ফিল্মের আসল ফ্রেম, আয়াত, ছবির উৎস ও লাইসেন্স, কেন বাছা হলো আর চেক কী বলল, সব আছে। দেখানো কমান্ড দিয়ে অনুমোদন, বাতিল বা বদল করুন; শুধু PASS হলে ফিল্ম প্রকাশ হয়।" },
  "quran.page.decision": { en: () => "Publish decision", bn: () => "প্রকাশের সিদ্ধান্ত" },
  "quran.page.recording": { en: () => "Recording (reciter, source, permission)", bn: () => "রেকর্ডিং (ক্বারি, উৎস, অনুমতি)" },
  "quran.page.signoff": { en: () => "Religious sign-off", bn: () => "ধর্মীয় অনুমোদন" },
  "quran.page.none": { en: () => "not recorded", bn: () => "লেখা নেই" },
  "quran.page.said": { en: () => "Recited", bn: () => "তিলাওয়াত" },
  "quran.page.meaning": { en: () => "Meaning (Pickthall 1930, for the reviewer only; not shown in the film)", bn: () => "অর্থ (Pickthall 1930, শুধু রিভিউয়ের জন্য; ফিল্মে দেখানো হয় না)" },
  "quran.page.picture": { en: () => "Picture", bn: () => "ছবিটি" },
  "quran.page.why": { en: () => "Why this picture", bn: () => "কেন এই ছবি" },
  "quran.page.check": { en: () => "Automatic check", bn: () => "স্বয়ংক্রিয় চেক" },
  "quran.page.refused": { en: () => "Refused for this scene", bn: () => "এই দৃশ্যের জন্য বাদ দেওয়া" },
  "quran.page.status": { en: () => "Decision", bn: () => "সিদ্ধান্ত" },
  "quran.page.noFrame": { en: () => "no rendered frame (render the film first)", bn: () => "রেন্ডার করা ফ্রেম নেই (আগে ফিল্ম রেন্ডার করুন)" },
  "quran.page.unsure": { en: () => "ayah end not confirmed: its Arabic is not shown in the film", bn: () => "আয়াত-শেষ নিশ্চিত নয়: ফিল্মে এর আরবি দেখানো হয় না" },
  "quran.review.noRights": { en: () => "The recording's reciter, source and permission to publish are not recorded: only a recording that may be published (commercial use included) can be used.", bn: () => "রেকর্ডিংয়ের ক্বারি, উৎস ও প্রকাশের অনুমতি লেখা নেই: শুধু যে রেকর্ডিং প্রকাশ করা যায় (বাণিজ্যিক ব্যবহারসহ) সেটিই ব্যবহার করা যাবে।" },
  "quran.review.rightsMissing": { en: () => "Write all three: the reciter, where the recording comes from, and the permission to publish it.", bn: () => "তিনটিই লিখুন: ক্বারি কে, রেকর্ডিং কোথা থেকে, আর প্রকাশের অনুমতি।" },
  "quran.review.rights": { en: (p) => `Recording recorded: ${p.reciter}, with its source and permission.`, bn: (p) => `রেকর্ডিংয়ের তথ্য রাখা হলো: ${p.reciter}, উৎস ও অনুমতিসহ।` },
  "quran.review.flagged": { en: (p) => `${p.count} scene(s) have a doubtful picture that a person must look at and approve (${p.shots}).`, bn: (p) => `${p.count}টি দৃশ্যের ছবি সন্দেহজনক; একজন মানুষকে দেখে অনুমোদন দিতে হবে (${p.shots})।` },
  "quran.review.timing": { en: (p) => `Only ${p.sure} of ${p.total} ayah ends are confirmed by two methods: the verse timing is not verified, so the film may not be published.`, bn: (p) => `${p.total}টি আয়াত-শেষের মধ্যে মাত্র ${p.sure}টি দুই পদ্ধতিতে নিশ্চিত: আয়াতের সময় যাচাই হয়নি, তাই ফিল্মটি প্রকাশ করা যাবে না।` },
  "quran.review.timingPartly": { en: (p) => `${Number(p.total) - Number(p.sure)} of ${p.total} ayah ends are not confirmed (their Arabic is not shown): a person must listen to them.`, bn: (p) => `${p.total}টি আয়াত-শেষের ${Number(p.total) - Number(p.sure)}টি নিশ্চিত নয় (সেগুলোর আরবি দেখানো হয়নি): একজন মানুষকে শুনে দেখতে হবে।` },
  "quran.review.cards": { en: (p) => `${p.count} shot(s) have no licensed picture, only a placeholder (${p.at}): find pictures for them first.`, bn: (p) => `${p.count}টি শটে লাইসেন্সসহ কোনো ছবি নেই, শুধু খালি কার্ড (${p.at}): আগে সেগুলোর ছবি খুঁজতে হবে।` },
  "quran.review.visual": { en: (p) => `The picture check found ${p.empty} empty and ${p.frozen} frozen stretch(es) (${p.at}).`, bn: (p) => `ছবি-পরীক্ষায় ${p.empty}টি খালি আর ${p.frozen}টি থেমে থাকা অংশ পাওয়া গেছে (${p.at})।` },
  "quran.review.noAudit": { en: () => "The rendered picture was not audited: render again with this version.", bn: () => "রেন্ডার করা ছবির অডিট হয়নি: এই সংস্করণ দিয়ে আবার রেন্ডার করুন।" },
  "quran.review.audio": { en: (p) => `The sound check failed: offset ${p.offset} s from the voice, ${p.silences} added silence(s), ${p.clipped} clipped sample(s).`, bn: (p) => `শব্দ-পরীক্ষায় ফেল: কণ্ঠ থেকে ${p.offset} সেকেন্ড সরে আছে, ${p.silences}টি বাড়তি নীরবতা, ${p.clipped}টি ক্লিপ হওয়া স্যাম্পল।` },
  "quran.inventions": { en: (p) => `${p.count} word(s) the recognizer invented (phrases from video subtitles, such as "subscribe to the channel") were removed; they are never Quran.`, bn: (p) => `রিকগনাইজারের বানানো ${p.count}টি শব্দ (ভিডিও সাবটাইটেলের বাক্য, যেমন "চ্যানেল সাবস্ক্রাইব করুন") বাদ দেওয়া হয়েছে; এগুলো কখনো কুরআন নয়।` },
  "quran.aligned": { en: (p) => `The given text was aligned letter by letter to the recitation: ${p.agree} of ${p.ends} ayah ends agree with the pauses and are sure; ${p.moved} were placed by the alignment alone (not sure: no cut and no Arabic text there); ${p.low} could not be placed.`, bn: (p) => `দেওয়া পাঠ অক্ষর ধরে তিলাওয়াতের সাথে মেলানো হয়েছে: ${p.ends}টি আয়াত-শেষের ${p.agree}টি বিরতির সাথে একমত, তাই নিশ্চিত; ${p.moved}টি শুধু অক্ষর-মিলানো দিয়ে বসানো (অনিশ্চিত: সেখানে কাট বা আরবি লেখা হবে না); ${p.low}টি বসানো যায়নি।` },
  "quran.review.identity": { en: () => "A religious sign-off needs the reviewer's qualification (for example: hafiz, ijazah in Hafs) and a way to reach them.", bn: () => "ধর্মীয় স্বাক্ষরের জন্য রিভিউয়ারের যোগ্যতা (যেমন: হাফেজ, হাফস রেওয়ায়েতে ইজাযাহ) আর যোগাযোগের উপায় লাগবে।" },
  "voice.scenes": { en: (p) => `${p.count} scenes cut on the voice's own word times.`, bn: (p) => `ভয়েসের নিজের শব্দ-সময় ধরে ${p.count}টি দৃশ্য কাটা হয়েছে।` },
  "voice.wordsKept": { en: () => "Every spoken word is in the plan, unchanged and in order.", bn: () => "প্রতিটি বলা শব্দ পরিকল্পনায় আছে, অপরিবর্তিত ও ক্রমমতো।" },
  "voice.wordsChanged": { en: (p) => `The picture plan changed the words of ${p.scenes}; they were put back from the voice.`, bn: (p) => `ছবির পরিকল্পনা ${p.scenes}-এর শব্দ বদলেছিল; ভয়েস থেকে আবার ঠিক করে বসানো হয়েছে।` },
  "voice.noBrain": { en: () => "No writer model answered, so pictures were chosen from each scene's own words.", bn: () => "কোনো লেখক মডেল সাড়া দেয়নি, তাই প্রতিটি দৃশ্যের নিজের শব্দ থেকে ছবি বাছা হয়েছে।" },
  "voice.assetRefused": { en: (p) => `A picture from ${p.source} was refused: ${p.reason}`, bn: (p) => `${p.source} থেকে একটি ছবি বাদ দেওয়া হয়েছে: ${p.reason}` },
  "voice.noAsset": { en: (p) => `No free licensed picture was found for ${p.scene}.`, bn: (p) => `${p.scene}-এর জন্য বিনামূল্যের লাইসেন্সসহ কোনো ছবি পাওয়া যায়নি।` },
  "voice.meaningGap": { en: () => "No translation with a licence that allows its use is bundled, so meanings are not shown.", bn: () => "ব্যবহারের অনুমতিসহ কোনো অনুবাদ সাথে নেই, তাই অর্থ দেখানো হচ্ছে না।" },
  // Voice mastering: what was measured
  "vm.measured": { en: (p) => `Measured ${p.seconds} s: ${p.lufs} LUFS, true peak ${p.peak} dBTP, noise ${p.snr} dB under the voice, loudness range ${p.lra} LU.`, bn: (p) => `${p.seconds} সেকেন্ড মাপা হয়েছে: ${p.lufs} LUFS, ট্রু পিক ${p.peak} dBTP, নয়েজ কণ্ঠের ${p.snr} dB নিচে, লাউডনেস রেঞ্জ ${p.lra} LU।` },
  "vm.tooShort": { en: () => "The recording is too short or too quiet to master.", bn: () => "রেকর্ডিংটি মাস্টার করার জন্য খুব ছোট বা খুব আস্তে।" },
  "vm.noise.noPauses": { en: () => "There is no pause long enough to measure the background noise, so noise reduction stays off.", bn: () => "পেছনের নয়েজ মাপার মতো লম্বা বিরতি নেই, তাই নয়েজ কমানো বন্ধ থাকছে।" },
  "vm.noise.low": { en: (p) => `The recording is clean (noise ${p.snr} dB under the voice).`, bn: (p) => `রেকর্ডিং পরিষ্কার (নয়েজ কণ্ঠের ${p.snr} dB নিচে)।` },
  "vm.noise.some": { en: (p) => `Some background noise (${p.snr} dB under the voice); it is reduced lightly.`, bn: (p) => `কিছু পেছনের নয়েজ আছে (কণ্ঠের ${p.snr} dB নিচে); হালকাভাবে কমানো হবে।` },
  "vm.noise.high": { en: (p) => `Background noise is high (only ${p.snr} dB under the voice). It is reduced as far as is safe for the letters; it cannot be removed completely.`, bn: (p) => `পেছনের নয়েজ বেশি (কণ্ঠের মাত্র ${p.snr} dB নিচে)। হরফ নষ্ট না করে যতটা নিরাপদ ততটা কমানো হবে; পুরোপুরি সরানো সম্ভব নয়।` },
  "vm.hum": { en: (p) => `Mains hum at ${p.hz} Hz (${p.db} dB above the noise around it, ${p.count} harmonic(s)); it is notched out.`, bn: (p) => `বিদ্যুতের গুঞ্জন (hum) ${p.hz} Hz-এ আছে (আশপাশের নয়েজের ${p.db} dB উপরে, ${p.count}টি হারমোনিক); সরু ফিল্টারে সরানো হবে।` },
  "vm.dc": { en: (p) => `The waveform is off-centre (DC ${p.offset}); it is centred.`, bn: (p) => `ওয়েভফর্ম কেন্দ্র থেকে সরে আছে (DC ${p.offset}); ঠিক করা হবে।` },
  "vm.clipped": { en: (p) => `${p.runs} clipped peak(s). They are rounded off, but what was cut cannot be recovered; a new take with lower gain is better.`, bn: (p) => `${p.runs}টি পিক ক্লিপ করেছে। এগুলো মসৃণ করা হবে, কিন্তু কেটে যাওয়া অংশ ফেরানো যায় না; কম গেইনে নতুন রেকর্ড করা ভালো।` },
  "vm.plosives": { en: (p) => `${p.count} breath pop(s) on the microphone; the low cut is made steeper.`, bn: (p) => `মাইকে ${p.count}টি নিঃশ্বাসের ধাক্কা (পপ) পাওয়া গেছে; নিচের ফ্রিকোয়েন্সি বেশি কাটা হবে।` },
  "vm.sibilance": { en: (p) => `S sounds are sharp (${p.db} dB against the voice); they are softened a little, never dulled.`, bn: (p) => `স/শ ধ্বনি তীক্ষ্ণ (কণ্ঠের তুলনায় ${p.db} dB); সামান্য নরম করা হবে, ভোঁতা করা হবে না।` },
  "vm.tone.ok": { en: () => "The tonal balance is close to the target; only small corrections.", bn: () => "সুরের ভারসাম্য লক্ষ্যের কাছাকাছি; সামান্য সংশোধন মাত্র।" },
  "vm.tone.boomy": { en: (p) => `The low end is heavy (${p.db} dB over the target); it is thinned.`, bn: (p) => `নিচের অংশ ভারী (লক্ষ্যের ${p.db} dB উপরে); হালকা করা হবে।` },
  "vm.tone.thin": { en: (p) => `The voice is thin (lows ${p.db} dB under the target). A narration gets a little warmth back; a recitation's lows are never boosted, because that raises rumble.`, bn: (p) => `কণ্ঠ পাতলা (নিচের অংশ লক্ষ্যের ${p.db} dB নিচে)। বর্ণনায় সামান্য উষ্ণতা ফেরানো হয়; তিলাওয়াতে নিচের অংশ কখনো বাড়ানো হয় না, কারণ তাতে গুমগুম শব্দ বাড়ে।` },
  "vm.tone.dull": { en: (p) => `The voice is dull (highs ${p.db} dB under the target); clarity is lifted gently.`, bn: (p) => `কণ্ঠ ভোঁতা (উপরের অংশ লক্ষ্যের ${p.db} dB নিচে); স্পষ্টতা আলতো করে বাড়ানো হবে।` },
  "vm.tone.bright": { en: (p) => `The voice is bright or harsh (highs ${p.db} dB over the target); it is softened.`, bn: (p) => `কণ্ঠ বেশি উজ্জ্বল বা কর্কশ (উপরের অংশ লক্ষ্যের ${p.db} dB উপরে); নরম করা হবে।` },
  "vm.room.unknown": { en: () => "Too few clear pauses to judge the room in the recording.", bn: () => "রেকর্ডিংয়ের ঘরের প্রতিধ্বনি বোঝার মতো যথেষ্ট পরিষ্কার বিরতি নেই।" },
  "vm.room.dry": { en: (p) => `The recording is dry (decay about ${p.rt} s): a good base for added reverb.`, bn: (p) => `রেকর্ডিং শুকনো (রেশ প্রায় ${p.rt} সেকেন্ড): রিভার্ব যোগ করার জন্য ভালো ভিত্তি।` },
  "vm.room.some": { en: (p) => `The recording carries some room (decay about ${p.rt} s); added reverb is lowered to match.`, bn: (p) => `রেকর্ডিংয়ে কিছুটা ঘরের রেশ আছে (প্রায় ${p.rt} সেকেন্ড); যোগ করা রিভার্ব সেই অনুযায়ী কমানো হবে।` },
  "vm.room.heavy": { en: (p) => `The recording already has heavy room echo (decay about ${p.rt} s). This cannot be removed; added reverb is kept low.`, bn: (p) => `রেকর্ডিংয়ে আগে থেকেই ঘরের ভারী প্রতিধ্বনি আছে (রেশ প্রায় ${p.rt} সেকেন্ড)। এটা সরানো যায় না; যোগ করা রিভার্ব কম রাখা হবে।` },
  "vm.shape": { en: (p) => `${p.pauses} pause(s) (median ${p.median} s), ${p.sustained} sustained note(s), crest ${p.crest} dB.`, bn: (p) => `${p.pauses}টি বিরতি (মাঝামাঝি ${p.median} সেকেন্ড), ${p.sustained}টি টানা স্বর, ক্রেস্ট ${p.crest} dB।` },
  // Voice mastering: what was done
  "vm.did.declip": { en: (p) => `${p.repaired} of ${p.found} clipped peaks were rounded off (long flat tops are left as they are).`, bn: (p) => `${p.found}টি ক্লিপ হওয়া পিকের মধ্যে ${p.repaired}টি মসৃণ করা হয়েছে (লম্বা সমতল অংশ যেমন ছিল তেমনই আছে)।` },
  "vm.did.declick": { en: (p) => `${p.count} click(s) removed.`, bn: (p) => `${p.count}টি ক্লিক শব্দ সরানো হয়েছে।` },
  "vm.did.highpass": { en: (p) => `Low cut at ${p.hz} Hz (${p.slope} dB per octave), placed under the lowest note of the voice.`, bn: (p) => `${p.hz} Hz-এর নিচে কাটা হয়েছে (প্রতি অক্টেভে ${p.slope} dB), কণ্ঠের সবচেয়ে নিচু সুরের নিচে।` },
  "vm.did.hum": { en: (p) => `Hum notched at ${p.hz} Hz.`, bn: (p) => `${p.hz} Hz-এ গুঞ্জন (hum) সরানো হয়েছে।` },
  "vm.did.denoise": { en: (p) => `Background noise lowered by up to ${p.db} dB (kept shallow on purpose, so no letter is smeared).`, bn: (p) => `পেছনের নয়েজ সর্বোচ্চ ${p.db} dB কমানো হয়েছে (ইচ্ছা করেই অল্প, যাতে কোনো হরফ ঝাপসা না হয়)।` },
  "vm.did.eq": { en: (p) => `Tone corrected: ${p.moves}.`, bn: (p) => `টোন ঠিক করা হয়েছে: ${p.moves}।` },
  "vm.did.eqNone": { en: () => "No tone correction was needed.", bn: () => "টোন ঠিক করার দরকার হয়নি।" },
  "vm.did.deess": { en: (p) => `S sounds softened by at most ${p.db} dB.`, bn: (p) => `স/শ ধ্বনি সর্বোচ্চ ${p.db} dB নরম করা হয়েছে।` },
  "vm.did.dynamics": { en: (p) => `Level evened gently: phrases moved by -${p.down} to +${p.up} dB, then ${p.ratio}:1 compression (mean ${p.mean} dB, at most ${p.max} dB).`, bn: (p) => `আওয়াজ আলতো করে সমান করা হয়েছে: বাক্যাংশ -${p.down} থেকে +${p.up} dB সরানো, তারপর ${p.ratio}:1 কম্প্রেশন (গড়ে ${p.mean} dB, সর্বোচ্চ ${p.max} dB)।` },
  "vm.did.peaks": { en: (p) => `The tallest peaks (hard consonants, pops) stood ${p.before} dB above the voice; they were eased to ${p.after} dB (at most ${p.max} dB), so the final limiter has little to do.`, bn: (p) => `সবচেয়ে উঁচু পিকগুলো (শক্ত ব্যঞ্জন, পপ) কণ্ঠের ${p.before} dB উপরে ছিল; সেগুলো ${p.after} dB-তে নামানো হয়েছে (সর্বোচ্চ ${p.max} dB), যাতে শেষের লিমিটারের কাজ কম থাকে।` },
  "vm.did.pauses": { en: (p) => `${p.count} pause(s) turned down by ${p.db} dB (a dip, not a cut), so the noise between phrases stays low.`, bn: (p) => `${p.count}টি বিরতির আওয়াজ ${p.db} dB নামানো হয়েছে (কাটা নয়, শুধু নামানো), যাতে বাক্যের মাঝের নয়েজ কম থাকে।` },
  "vm.space.none": { en: () => "No reverb added: the voice stays as close as it was recorded.", bn: () => "কোনো রিভার্ব যোগ করা হয়নি: কণ্ঠ যেমন কাছ থেকে রেকর্ড হয়েছে তেমনই আছে।" },
  "vm.space.reverb": { en: (p) => `Reverb "${p.preset}": decay ${p.rt} s, pre-delay ${p.pre} ms, tail ${p.wet} dB against the voice. A smooth tail only; no repeating echo.`, bn: (p) => `রিভার্ব "${p.preset}": রেশ ${p.rt} সেকেন্ড, প্রি-ডিলে ${p.pre} মিলিসেকেন্ড, রেশের মাত্রা কণ্ঠের তুলনায় ${p.wet} dB। শুধু মসৃণ রেশ; শব্দ ফিরে আসা ইকো নয়।` },
  "vm.space.lowered": { en: (p) => `The recording already has a room (about ${p.rt} s), so the added reverb was lowered by ${p.db} dB.`, bn: (p) => `রেকর্ডিংয়ে আগে থেকেই ঘরের রেশ আছে (প্রায় ${p.rt} সেকেন্ড), তাই যোগ করা রিভার্ব ${p.db} dB কমানো হয়েছে।` },
  "vm.space.shortened": { en: (p) => `Pauses are short (median ${p.pause} s), so the decay was shortened from ${p.wanted} s to ${p.rt} s to keep the next words clear.`, bn: (p) => `বিরতিগুলো ছোট (মাঝামাঝি ${p.pause} সেকেন্ড), তাই পরের শব্দ পরিষ্কার রাখতে রেশ ${p.wanted} থেকে কমিয়ে ${p.rt} সেকেন্ড করা হয়েছে।` },
  "vm.space.narration": { en: () => "Narration is kept close, warm and nearly dry: that is how top documentaries sound. A hall would blur the words.", bn: () => "বর্ণনার কণ্ঠ কাছের, উষ্ণ ও প্রায় শুকনো রাখা হয়েছে: সেরা ডকুমেন্টারি এভাবেই শোনায়। হলের রেশ দিলে শব্দ ঝাপসা হতো।" },
  "vm.did.generated": { en: () => "A generated voice: repair steps (noise, hum, clicks, clipping) stay off; only tone, level and loudness are set.", bn: () => "এটি তৈরি করা (জেনারেটেড) কণ্ঠ: মেরামতের ধাপ (নয়েজ, গুঞ্জন, ক্লিক, ক্লিপিং) বন্ধ; শুধু টোন, লেভেল ও লাউডনেস ঠিক করা হয়েছে।" },
  "vm.master.done": { en: (p) => `Mastered to ${p.lufs} LUFS, true peak ${p.peak} dBTP (the limiter took at most ${p.limit} dB off a peak).`, bn: (p) => `মাস্টার হয়েছে: ${p.lufs} LUFS, ট্রু পিক ${p.peak} dBTP (লিমিটার কোনো পিক থেকে সর্বোচ্চ ${p.limit} dB কমিয়েছে)।` },
  "vm.master.short": { en: (p) => `Loudness stops at ${p.lufs} LUFS instead of ${p.target}: going further would press the peaks by more than ${p.limit} dB and hurt the voice.`, bn: (p) => `লাউডনেস ${p.target}-এর বদলে ${p.lufs} LUFS-এ থেমেছে: এর বেশি করলে পিক ${p.limit} dB-এর বেশি চাপতে হতো, যা কণ্ঠের ক্ষতি করে।` },
  "vm.proof.duration": { en: (p) => `Length kept: all ${p.samples} samples are in place (reverb tail after the last word: ${p.extra} s).`, bn: (p) => `দৈর্ঘ্য অটুট: ${p.samples}টি স্যাম্পলের সবই নিজের জায়গায় আছে (শেষ শব্দের পরে রিভার্বের রেশ: ${p.extra} সেকেন্ড)।` },
  "vm.proof.durationFailed": { en: (p) => `Length check failed: the master differs from the original's ${p.samples} samples by ${p.extra} s.`, bn: (p) => `দৈর্ঘ্য পরীক্ষা ব্যর্থ: মাস্টারটি মূলের ${p.samples} স্যাম্পল থেকে ${p.extra} সেকেন্ড আলাদা।` },
  "vm.proof.alignment": { en: (p) => `Timing kept: the voice sits within ${p.ms} ms of the original at the start, middle and end (drift ${p.drift} samples), so ayah times and captions stay valid.`, bn: (p) => `সময় অটুট: শুরু, মাঝ ও শেষে কণ্ঠ মূলের ${p.ms} মিলিসেকেন্ডের মধ্যে আছে (সরণ ${p.drift} স্যাম্পল), তাই আয়াতের সময় ও ক্যাপশন ঠিক থাকবে।` },
  "vm.proof.alignmentFailed": { en: (p) => `Timing check failed: the voice moved by ${p.ms} ms (drift ${p.drift} samples).`, bn: (p) => `সময় পরীক্ষা ব্যর্থ: কণ্ঠ ${p.ms} মিলিসেকেন্ড সরে গেছে (সরণ ${p.drift} স্যাম্পল)।` },
  "vm.proof.pitch": { en: (p) => `Pitch untouched: the voice differs by a median of ${p.cents} cents, ${p.share}% of voiced frames within 20 cents, contour correlation ${p.correlation} (finished mix: ${p.mixCents} cents, ${p.mixShare}%).`, bn: (p) => `সুর (pitch) অপরিবর্তিত: কণ্ঠের মাঝামাঝি পার্থক্য ${p.cents} সেন্ট, ${p.share}% স্বরযুক্ত ফ্রেম ২০ সেন্টের মধ্যে, সুরের রেখার মিল ${p.correlation} (চূড়ান্ত মিক্সে: ${p.mixCents} সেন্ট, ${p.mixShare}%)।` },
  "vm.proof.pitchFailed": { en: (p) => `Pitch check failed: median difference ${p.cents} cents, only ${p.share}% of frames within 20 cents (correlation ${p.correlation}).`, bn: (p) => `সুর (pitch) পরীক্ষা ব্যর্থ: মাঝামাঝি পার্থক্য ${p.cents} সেন্ট, মাত্র ${p.share}% ফ্রেম ২০ সেন্টের মধ্যে (মিল ${p.correlation})।` },
  "vm.proof.pitchUnknown": { en: () => "Too few voiced frames to compare the pitch.", bn: () => "সুর (pitch) তুলনা করার মতো যথেষ্ট স্বরযুক্ত অংশ নেই।" },
  "vm.proof.echoFree": { en: (p) => `Reverb checked: measured decay ${p.rt} s at 500 Hz; no slap-back (strongest late slice ${p.slice} dB) and no repeat (largest rise in the tail ${p.rise} dB).`, bn: (p) => `রিভার্ব পরীক্ষিত: ৫০০ Hz-এ মাপা রেশ ${p.rt} সেকেন্ড; কোনো ফিরে আসা শব্দ নেই (সবচেয়ে জোরালো দেরির অংশ ${p.slice} dB), কোনো পুনরাবৃত্তি নেই (রেশের ভেতরে সর্বোচ্চ উত্থান ${p.rise} dB)।` },
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
