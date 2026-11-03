/**
 * The Zupona agent roster: 151 specialist roles in 15 squads. The first ten
 * squads are the original documentary roster; five squads were added for
 * the owner's own voice, Quran and Islamic content, idea-to-story films and
 * the three language versions. A role is a precise job with an input, an
 * output and a check, run only when the film needs it (see pipeline.mjs); it
 * is not a process that runs all the time. No role waits for a person:
 * failed checks go back to the responsible squad, and publishing stays with
 * the owner.
 */

/**
 * @typedef {[id: string, name: string, mission: string, deliverable: string]} AgentRow
 * @typedef {{ id: string, name: string, goal: string, agents: AgentRow[] }} Squad
 * @typedef {{ id: string, squadId: string, squadName: string, name: string, mission: string, deliverable: string }} Agent
 */

/** @type {readonly Squad[]} */
export const SQUADS = Object.freeze([
  {
    id: "research",
    name: "Research & Evidence",
    goal: "Build a claim-by-claim evidence base, prefer original sources, and expose uncertainty instead of concealing it.",
    agents: [
      ["primary-source", "Primary Source Scout", "Find direct records, original research, official documents, first-party datasets, and exact URLs for the central claims.", "A short list of direct sources, the claims each can support, and missing evidence."],
      ["fact-ledger", "Claim Ledger Analyst", "Turn factual statements into individually testable claims with a source and a confidence/status.", "A numbered claim ledger marking supported, disputed, dated, inferred, or unsupported claims."],
      ["date-check", "Chronology & Date Auditor", "Check dates, time periods, event order, and whether a source is contemporary or retrospective.", "A timeline of date risks and corrections to investigate."],
      ["statistics", "Statistics Verifier", "Check quantities, units, denominators, geography, sample sizes, and whether statistics are comparable.", "A numeric-claim audit with units, context, and missing metadata."],
      ["peer-review", "Academic Literature Scout", "Identify relevant peer-reviewed papers, methods, sample limitations, and conflicting scholarly results.", "A source map of studies, methods, limitations, and disagreements."],
      ["counterevidence", "Counter-Evidence Hunter", "Search for credible disconfirming evidence, alternative explanations, and material caveats.", "The strongest counter-evidence and how it changes the narrative."],
      ["geography", "Geography & Place Verifier", "Verify place names, borders, maps, distances, geographic context, and territorial uncertainty.", "A place/map verification checklist."],
      ["people-orgs", "People & Organization Verifier", "Check names, roles, organizational affiliations, quotations, and identity ambiguity.", "An identity and attribution audit; flag unverified allegations."],
      ["source-diversity", "Source Independence Auditor", "Detect circular citations, copied reports, one-source dependence, and apparent but not genuine corroboration.", "A source-independence matrix and weakly corroborated claims."],
      ["freshness", "Source Freshness Monitor", "Check whether important facts, laws, figures, office-holders, or technical claims may have changed.", "A freshness table with last-checked dates and recheck-needed items."],
    ],
  },
  {
    id: "story",
    name: "Transcript & Story",
    goal: "Shape a coherent long-form story while preserving transcript truth and avoiding fabricated narration.",
    agents: [
      ["transcript-integrity", "Transcript Integrity Auditor", "Compare the supplied narration and proposed scenes without silently adding, removing, or reordering factual wording.", "A list of omitted, reordered, repeated, or unsupported narration spans."],
      ["chapter-arc", "Chapter Arc Architect", "Test the chapter progression, stakes, causality, and whether each chapter changes the viewer's understanding.", "A chapter-by-chapter arc with structural gaps."],
      ["opening-hook", "Opening Hook Specialist", "Evaluate the first 30–60 seconds for specificity, clarity, curiosity, and evidence-backed promises.", "A hook scorecard and revised options that do not overpromise."],
      ["open-loops", "Open-Loop Editor", "Track questions raised, answered, delayed, and abandoned across the runtime.", "An open-loop ledger with payoff timestamps/chapters."],
      ["exposition", "Complexity-to-Clarity Editor", "Find dense passages, unexplained concepts, missing definitions, and jumps in causal reasoning.", "A plain-language clarity pass with exact locations."],
      ["narration", "Spoken-Language Editor", "Check whether the narration sounds natural aloud in its version's language, with reasonable sentence length and clear referents.", "Spoken-language edits that preserve meaning and claim boundaries."],
      ["continuity", "Narrative Continuity Editor", "Check names, terms, dates, causal links, chapter recaps, pronouns, and repeated facts.", "A continuity issue list ordered by severity."],
      ["emotional-arc", "Emotional Arc Analyst", "Map tension, empathy, relief, wonder, and reflection so emotion follows the evidence rather than manipulating it.", "An emotion/pacing curve and sections that feel flat or forced."],
      ["ending", "Ending & Payoff Editor", "Check whether the ending pays off the central question, handles unresolved facts, and avoids a false conclusion.", "Ending strengths, unresolved questions, and payoff recommendations."],
      ["script-coverage", "Narration Coverage Auditor", "Estimate whether each planned scene has enough spoken words for its intended duration without padding.", "Scene-level narration coverage and likely timing mismatches."],
    ],
  },
  {
    id: "cinematography",
    name: "Cinematography & Visual Direction",
    goal: "Make every shot intentional, visually coherent, specific, and truthful to what the evidence can show.",
    agents: [
      ["visual-director", "Visual Director", "Define visual intent for each beat and distinguish illustration from literal evidence.", "A scene-level visual intent pass and missing visual beats."],
      ["composition", "Composition Specialist", "Review focal hierarchy, framing, negative space, foreground/background relationships, and visual readability.", "Composition notes for each scene or visual family."],
      ["lens-language", "Lens & Perspective Specialist", "Recommend shot scale, perspective, lens feel, depth of field, and when a graphic is clearer than footage.", "A camera/lens vocabulary plan with reasons."],
      ["camera-motion", "Camera Motion Designer", "Plan restrained pans, tilts, push-ins, reveals, and locked shots without pointless motion.", "A motion plan and shots that should remain still."],
      ["lighting", "Lighting Continuity Specialist", "Check light direction, contrast, time-of-day plausibility, and continuity across adjacent shots.", "Lighting continuity notes and correction priorities."],
      ["environment", "Location & Environment Scout", "Specify believable locations, weather, season, and environmental details supported by sources.", "A scene-to-environment brief and uncertain details."],
      ["archive-language", "Archival Visual Specialist", "Differentiate genuine archival material, contemporary illustrative footage, reenactment risks, and contextual labels.", "Archival authenticity labels and safe substitute suggestions."],
      ["visual-metaphor", "Visual Metaphor Specialist", "Use visual metaphors only when they clarify a concept and cannot be mistaken for literal evidence.", "Metaphor opportunities plus misinterpretation warnings."],
      ["shot-variety", "Shot Variety Analyst", "Detect repetitive shot sizes, repetitive stock imagery, visual fatigue, and under-covered transitions.", "A visual variety matrix across chapters."],
      ["accessibility", "Visual Accessibility Reviewer", "Review contrast, safe text area, flashing, motion intensity, subtitle legibility, and color-only communication.", "Accessibility issues and minimum fixes."],
    ],
  },
  {
    id: "animation",
    name: "Animation & Motion Graphics",
    goal: "Decide where animation, maps, data graphics, and transitions genuinely improve comprehension.",
    agents: [
      ["motion-director", "Motion Design Director", "Set the overall motion grammar, pacing, easing, and restrained use of animation across the film.", "A consistent motion-design brief."],
      ["map-motion", "Map Animation Specialist", "Plan accurate map pans, zooms, route lines, labels, projection choices, and uncertainty annotations.", "Map shot plans and geographic-data requirements."],
      ["data-graphics", "Data Visualization Specialist", "Choose chart forms that honestly encode the data and avoid misleading axes, scale, or comparisons.", "Chart specifications with source and axis rules."],
      ["kinetic-type", "Kinetic Typography Specialist", "Plan readable animated words, emphasis, timing, and hierarchy without turning narration into visual clutter.", "Typography beats and timing notes."],
      ["diagram-builder", "Diagram & Explainer Specialist", "Convert complex processes into accurate diagrams with explicit relationships and labels.", "Diagram blueprints and source-backed relationships."],
      ["2d-animation", "2D Animation Specialist", "Identify where shape animation, paths, masks, and layered cutouts clarify a physical or conceptual process.", "2D shot recommendations and build notes."],
      ["3d-visualization", "3D Visualization Specialist", "Specify when a 3D model or spatial visualization is worth building, while avoiding fake evidence.", "3D shot options, model requirements, and authenticity labels."],
      ["parallax", "Parallax & Depth Specialist", "Identify safe uses of depth/parallax on licensed stills without fabricating detail or movement.", "Still-image animation notes and artifact risk."],
      ["transition-logic", "Transition Logic Designer", "Select transitions motivated by time, place, evidence, or concept rather than arbitrary effects.", "Transition pairs with motivation and duration ranges."],
      ["fx-qc", "Effects Quality Controller", "Check for visual artifacts, jitter, clipping, inconsistent easing, overuse of effects, and unearned drama.", "Effects QA checklist and failure severity."],
    ],
  },
  {
    id: "footage",
    name: "Footage Discovery & Rights",
    goal: "Find exact useful assets and keep licensing, provenance, and commercial-suitability visible.",
    agents: [
      ["asset-strategist", "Asset Search Strategist", "Translate each scene into precise search queries and identify the best source families.", "Per-scene query packs and likely providers."],
      ["exact-match", "Exact Asset Finder", "Rank actual item-page candidates by relevance, shot content, length, and visible metadata.", "A ranked candidate shortlist with exact item URLs only."],
      ["provider-coverage", "Provider Coverage Auditor", "Identify when configured providers fail and route the gap to additional lawful sources or a written permission request to the creator.", "Provider gaps and next search routes."],
      ["metadata", "Media Metadata Auditor", "Check duration, dimensions, frame rate when known, creator, date, location, and provenance fields.", "A metadata completeness table."],
      ["license", "License Term Reviewer", "Flag editorial-only, non-commercial, attribution, share-alike, standalone redistribution, and model/property-release conditions.", "Item-level rights flags; never claim legal clearance."],
      ["attribution", "Attribution Writer", "Create accurate attribution records from provider/item data and mark missing fields.", "A credits/attribution manifest with unknowns left explicit."],
      ["duplicate-assets", "Duplicate & Reuse Detector", "Detect repeated assets and repeated compositions across the runtime.", "Duplicate asset groups and substitution suggestions."],
      ["scene-fit", "Scene-to-Footage Matchmaker", "Score the semantic and visual fit between footage candidates and a scene's exact intent.", "A scene-to-candidate match score with explanation."],
      ["release-risk", "Release & Property Risk Reviewer", "Flag recognizable people, private property, trademarks, minors, sensitive contexts, and missing release evidence.", "A release-risk list; anything unresolved blocks that shot automatically."],
      ["rights-gate", "Rights Gatekeeper", "Block unresolved assets from export-ready status and verify required manifest fields are present.", "Pass/review/block decisions and reasons."],
    ],
  },
  {
    id: "editing",
    name: "Editorial & Timeline",
    goal: "Build a legible 40–50 minute cut with controlled pace, traceable scene timing, and continuity.",
    agents: [
      ["runtime", "Runtime Controller", "Check chapter/scene durations against the target runtime, stage dependencies, feasible schedule, and budget assumptions; never invent provider prices.", "A runtime budget, critical-path risks, cost assumptions, and timing deviations."],
      ["pace", "Pacing Analyst", "Detect stretches with too little visual or narrative change and sections that move too quickly.", "Pacing alerts tied to timecodes and suggested fixes."],
      ["coverage", "Coverage Editor", "Check whether footage/graphics cover the narration without irrelevant filler or repeated stock shots.", "Coverage gaps and suggested insert types."],
      ["cut-logic", "Cut Logic Specialist", "Check whether cuts follow meaning, geography, action, evidence, or emotional beats.", "Cut/transition recommendations with rationale."],
      ["timeline-integrity", "Timeline Integrity Auditor", "Find overlaps, gaps, invalid timestamps, duration mismatches, ordering errors, and invalid stage/timeline state transitions.", "A timeline and state validation report with exact scene IDs and recovery needs."],
      ["continuity-match", "Visual Match Editor", "Review visual continuity of direction, location, season, costumes, and recurring elements.", "Visual continuity breaks and safer cut alternatives."],
      ["b-roll-balance", "B-roll Balance Editor", "Detect overuse of generic B-roll and ensure key claims receive appropriately specific visuals.", "A B-roll-to-claim coverage matrix."],
      ["chapter-transitions", "Chapter Transition Editor", "Create clear narrative handoffs between chapters without redundant recap.", "Transition lines/beats and repeated-summary warnings."],
      ["intro-outro", "Intro & Outro Editor", "Audit title cards, cold open, end slate, and end pacing against the documentary's promise.", "Intro/outro recommendations and timing."],
      ["edit-qc", "Edit Decision Quality Reviewer", "Review a proposed cut for distracting edits, dead air, jumpy tempo, unresolved notes, cancellation recovery, and duplicate-work risks.", "Severity-ranked edit notes, recovery steps, and idempotency risks."],
    ],
  },
  {
    id: "audio",
    name: "Voice, Sound & Music",
    goal: "Make dialogue clear, music supportive, levels safe, and all audio choices traceable.",
    agents: [
      ["voice-sync", "Voiceover Sync Analyst", "Compare narration text with word/segment timestamps and flag scenes whose timing does not match speech.", "Word-timing coverage and sync-risk list."],
      ["noise", "Noise & Room-Tone Reviewer", "Detect likely noise, abrupt noise-floor changes, clipped tails, and missing room tone from available measurements.", "Audio cleanup tasks; state when measurements are unavailable."],
      ["dialogue-level", "Dialogue Level Controller", "Recommend consistent dialogue loudness and identify clipping or weak passages when measurements exist.", "Dialogue level targets and measured/unknown indicators."],
      ["ducking", "Music Ducking Specialist", "Set music-under-voice behavior, fade points, and when music should disappear for clarity.", "Ducking/fade automation plan."],
      ["sound-effects", "SFX Editor", "Recommend only motivated sound effects and flag manipulative or misleading sound cues.", "SFX placement and credibility warnings."],
      ["music-arc", "Music Arc Composer", "Plan music energy across chapters, transitions, silence, and emotional turns.", "A music cue sheet with usage/licensing fields."],
      ["loudness", "Loudness & Peak Auditor", "Check integrated loudness, true peak, codec headroom, and delivery targets when measurable.", "Measured values or a clear not-measured warning."],
      ["silence", "Silence & Pause Editor", "Protect meaningful pauses while detecting accidental long silence or broken audio.", "Pause annotations and fix-needed intervals."],
      ["pronunciation", "Pronunciation & Names Reviewer", "Check difficult names, place names, acronyms, and Arabic, English and Bangla pronunciation notes against trusted references.", "Pronunciation guide with sources and unresolved names."],
      ["audio-qc", "Audio Mix Quality Controller", "Check sync, phase/mono concerns, abrupt edits, music clashes, and audio export integrity.", "Audio QA report and blocking defects."],
    ],
  },
  {
    id: "color",
    name: "Color, Finishing & Encoding",
    goal: "Make footage visually consistent without altering the evidentiary meaning or creating an artificial look.",
    agents: [
      ["color-match", "Shot Matching Colorist", "Match adjacent shots for exposure, contrast, white balance, and overall continuity.", "Shot-match notes and order of correction."],
      ["exposure", "Exposure Auditor", "Detect clipped highlights, crushed shadows, insufficient detail, and inconsistent exposure when frame samples exist.", "Exposure issues with scene references."],
      ["white-balance", "White Balance Specialist", "Find inconsistent color temperature/tint and recommend neutral-reference checks.", "White-balance match notes."],
      ["skin-tone", "Skin Tone Fidelity Reviewer", "Protect realistic skin tones and avoid stylized grades that misrepresent people or archival imagery.", "Skin-tone consistency review."],
      ["look-dev", "Look Development Artist", "Propose a restrained film look that supports the story while preserving source authenticity.", "A look bible with shot-family variations."],
      ["archive-grade", "Archival Grade Specialist", "Keep archival treatment readable and labeled without manufacturing age or authenticity.", "Archive treatment rules and authenticity warnings."],
      ["artifact-check", "Image Artifact Reviewer", "Look for banding, blocking, oversharpening, denoise artifacts, halos, flicker, and damaged frames.", "Artifact log and correction priorities."],
      ["subtitle-style", "Subtitle Styling Specialist", "Check typography, line breaks, placement, contrast, and mobile safe areas for burned-in captions.", "Subtitle style rules and problematic subtitle IDs."],
      ["encode", "Encoding & Bitrate Auditor", "Check output resolution, frame rate, codec compatibility, file size, and expected quality constraints.", "An export preset and validation checklist."],
      ["final-master", "Mastering QC Reviewer", "Review visual and audio finishing requirements before the final master is accepted.", "A master-delivery checklist with explicit pass/block status."],
    ],
  },
  {
    id: "quality",
    name: "Fact, Safety & Technical QA",
    goal: "Catch factual, reputational, accessibility, rendering, and policy problems automatically before export.",
    agents: [
      ["hallucination", "Hallucination & Unsupported-Claim Auditor", "Find claims presented as facts without adequate support or where evidence does not match the wording.", "A blocking unsupported-claim list."],
      ["defamation", "Defamation & Allegation Reviewer", "Flag potentially harmful allegations about identifiable people/organizations and require robust support and careful language.", "Legal-risk flags; unresolved items block export automatically."],
      ["sensitive-context", "Sensitive-Context Reviewer", "Review violence, tragedy, medical, political, or vulnerable-person context for respectful and necessary depiction.", "Contextual safety notes and suggested safeguards."],
      ["artifact-qc", "Visual Artifact QC Agent", "Inspect provided frames/metadata for obvious generative artifacts, malformed maps, impossible objects, or inconsistent details.", "Artifact reports; state when frames were not supplied."],
      ["subtitle-text", "Subtitle Text Auditor", "Check subtitle spellings, punctuation, timing collisions, overflow, and text/narration mismatch.", "Subtitle error list and corrected text suggestions."],
      ["timeline-qc", "Timeline Technical Auditor", "Validate scene order, start/end times, frame boundaries, duplicate IDs, and audio duration alignment.", "Technical timeline pass/review/block report."],
      ["license-qc", "License Manifest Auditor", "Block assets missing source page, creator, license evidence, and required attribution fields.", "Rights-manifest completeness report."],
      ["claim-language", "Certainty & Attribution Auditor", "Reduce overstatement, distinguish fact/opinion/allegation/estimate, and ensure causal claims are justified.", "Claim phrasing corrections and uncertainty labels."],
      ["accessibility-qc", "Accessibility QA Agent", "Check subtitle readability, flashing/motion risk, contrast, and whether key info depends only on color.", "Accessibility pass/review/block report."],
      ["release-gate", "Pre-Export Release Gate", "Synthesize prior findings, privacy/secret risks, budget limits, failed-stage recovery, and release readiness; block export recommendations when a critical issue remains unresolved.", "A final pass/review/block checklist with outstanding tests; never auto-publish."],
    ],
  },
  {
    id: "audience",
    name: "Audience, Retention & Distribution",
    goal: "Improve clarity and retention without misleading titles, fabricated urgency, or guaranteed-virality claims.",
    agents: [
      ["retention", "Retention Curve Analyst", "Estimate where attention may drop based on pace, repetition, exposition density, and unanswered questions.", "Likely drop-off points and specific fixes; do not claim actual analytics without data."],
      ["audience-fit", "Audience Fit Researcher", "Check audience assumptions, language register, cultural references, and accessibility for the intended market.", "Audience-fit risks and validation questions."],
      ["title", "Title & Promise Auditor", "Create specific truthful titles whose promise is fulfilled by the actual documentary.", "Title options and a promise-to-content check."],
      ["thumbnail", "Thumbnail Composition Reviewer", "Plan a readable thumbnail focal point, contrast, and authentic evidence while avoiding fabricated visual claims.", "Thumbnail brief and misleading-visual warnings."],
      ["first-minute", "First Minute Reviewer", "Evaluate the opening minute for immediate context, visual change, and a clear reason to continue.", "First-minute beat map."],
      ["midpoint", "Midpoint Re-Engagement Reviewer", "Check whether the midpoint advances the argument or merely repeats the premise.", "Midpoint reset and new-information suggestions."],
      ["cta", "Call-to-Action Editor", "Recommend a restrained ending CTA only where natural and appropriate.", "CTA wording options and placement."],
      ["platform-specs", "Delivery Specs Auditor", "Check platform aspect ratio, frame rate, subtitle formats, audio requirements, and safe areas against current requirements supplied in context.", "A platform delivery checklist and unknowns."],
      ["metadata", "Metadata & Search Relevance Editor", "Improve description, chapters, tags, and metadata using accurate topic-specific language.", "Metadata suggestions and unsupported-term warnings."],
      ["panel-review", "Audience Panel Synthesizer", "Synthesize clarity, emotion, novelty, evidence, pacing, and trust risks into a review report.", "A weighted scorecard with reasons and non-guaranteed outcomes."],
    ],
  },
  {
    id: "intake",
    name: "Intake & Understanding",
    goal: "Understand any input (a recording, a cloned voice, a rough idea with spelling mistakes, a finished script) and turn it into a precise brief without asking the owner.",
    agents: [
      ["transcriber", "Speech-to-Text Transcriber", "Transcribe uploaded audio with word times, using a Quran-tuned model when the audio is Arabic recitation.", "A transcript with word timings and confidence; low-confidence words marked."],
      ["language-detector", "Language & Script Detector", "Detect the language, script and dialect of every input and flag mixed inputs.", "A language report per input."],
      ["recitation-identifier", "Recitation Identifier", "Match the transcript against the Tanzil text and return surah, ayah range, per-ayah times, confidence and ambiguity; never guess an ambiguous reference.", "A recitation map; ambiguous passages listed with every place they occur."],
      ["content-classifier", "Content Classifier", "Decide recitation, Islamic content, documentary, story or the owner's own script, with reasons.", "A content type and the rules that follow from it."],
      ["intent-interpreter", "Intent Interpreter", "Read rough, misspelled or mixed-language ideas and restate them precisely.", "A one-paragraph premise the other squads work from."],
      ["fact-fiction-judge", "Fact or Fiction Judge", "Decide whether the film tells a true story (researched) or an invented one (labelled fiction); stories of prophets and Companions are always sourced, never fiction.", "A mode decision with evidence."],
      ["rights-intake", "Rights Intake Officer", "Record who made each uploaded recording and what it may be used for; reject other reciters' or other people's voices.", "A rights attestation stored with the project."],
      ["version-planner", "Version Planner", "Plan the Arabic, English (USA) and Bangla versions as separate films that share only research and premise.", "A brief per version."],
      ["duration-planner", "Duration & Scale Planner", "Turn the requested length into media needs, retention structure and a render plan.", "A film plan from the engine core."],
      ["brief-writer", "Production Brief Writer", "Write the single brief every other squad works from.", "The production brief."],
    ],
  },
  {
    id: "voice",
    name: "Voice Studio",
    goal: "Keep the owner's voice exactly theirs (clean, level, natural) and use a cloned voice only where one is wanted.",
    agents: [
      ["recording-analyst", "Recording Analyst", "Measure loudness, true peak, noise floor, clipping and speaking pace of every voice track.", "A recording report with plain-language problems."],
      ["voice-guardian", "Voice Preservation Guard", "Block any processing that changes pitch, formants, timing or identity, and keep the untouched original.", "Pass or block for every processing step."],
      ["repair-engineer", "Repair Engineer", "Remove DC offset, restore clipped peaks and apply only the noise reduction the measurements call for.", "Repair settings with reasons."],
      ["tone-dynamics", "Tone & Dynamics Engineer", "Set the high-pass, gentle compression and de-essing for the voice.", "Chain settings."],
      ["loudness-engineer", "Loudness Engineer", "Level the whole stitched track to -14 LUFS with true peak at or below -1 dBTP.", "Master levels, measured."],
      ["elevenlabs-operator", "ElevenLabs Voice Operator", "Read each version with the right model (Multilingual v2 for English and Arabic, v3 for Bangla) using only the owner's own cloned voice; chunk at paragraphs and regenerate outliers.", "Narration audio per version."],
      ["pronunciation", "Pronunciation Lexicon Keeper", "Keep the pronunciation of names and terms in Arabic, English and Bangla.", "A pronunciation lexicon."],
      ["pacing-editor", "Pacing & Pause Editor", "Fit narration to scenes by trimming or extending pauses, never by changing speed.", "Timing edits."],
      ["music-supervisor", "Music Supervisor", "Apply the music policy per content and version: licensed, Content-ID-safe tracks only, vocal-only where instruments are not allowed, silence under the Quran.", "A cue sheet with licences."],
      ["mix-engineer", "Mix Engineer", "Set the bed level and ducking automation and check the final mix.", "The final mix report."],
    ],
  },
  {
    id: "quran",
    name: "Quran & Islamic Content",
    goal: "Present the Quran and Islamic subjects with complete accuracy and adab: verbatim text, correct references, no music, nothing depicted that must not be.",
    agents: [
      ["ayah-aligner", "Ayah Timing Aligner", "Align every ayah to the recording for cuts and captions.", "An ayah timeline."],
      ["text-guardian", "Quran Text Guardian", "Render only verbatim Tanzil text looked up by reference, never recognised or generated text, and verify every character.", "Verified on-screen text."],
      ["reference-checker", "Reference Checker", "Check surah names and ayah numbers, and withhold numbers for passages that occur in more than one place.", "A reference list."],
      ["translation-curator", "Translation Curator", "Choose a translation each version may legally show (public-domain Pickthall for English; other translations only with written permission) and credit it.", "Translation source and credit per version."],
      ["meaning-researcher", "Meaning & Context Researcher", "Summarise what each ayah is about from recognised tafsir, only to guide visual choices.", "Per-ayah theme notes with sources."],
      ["visual-matcher", "Ayah Visual Matcher", "Choose nature and cosmos footage that matches each ayah's theme.", "A shot list per ayah."],
      ["visual-adab-guard", "Visual Adab Guard", "Block depictions of prophets, Companions, angels or Allah, people and women in recitation videos, AI-generated people or animals, and Paradise or Hell imagery.", "Pass or block for every shot."],
      ["recitation-editor", "Recitation Editor", "Cut only at ayah ends or permitted stops; never speed up, slow, loop or reorder.", "An edit decision list."],
      ["arabic-typographer", "Arabic Typographer", "Lay out ayat in Amiri Quran with ayah markers and correct right-to-left shaping.", "Type specifications and a render check."],
      ["islamic-reviewer", "Islamic Audience Reviewer", "Check the finished film against every Islamic rule automatically.", "A pass or block report."],
    ],
  },
  {
    id: "screenplay",
    name: "Story & Screenplay",
    goal: "Turn a one-line idea into an original, believable, gripping story with a 3-second hook, real twists and a payoff, clearly labelled as fiction.",
    agents: [
      ["premise-architect", "Premise Architect", "Find the strongest version of the idea: the want, the wound and the stakes.", "A premise sheet."],
      ["era-researcher", "Era & World Researcher", "Build the era bible: wages, prices, cars, phones, slang and real business economics.", "An era bible with sources."],
      ["character-designer", "Character Designer", "Create characters with wants and flaws and antagonists with understandable motives; ordinary names, no real private people.", "A character bible."],
      ["plot-architect", "Plot & Twist Architect", "Build \"but/therefore\" beats with a twist near a quarter, a reversal at the midpoint and a low point near three quarters.", "A beat sheet."],
      ["hook-doctor", "Hook Doctor", "Write 3-second and 30-second hooks that the title and thumbnail promise and the film pays off.", "Hook options."],
      ["money-path-auditor", "Money Path Auditor", "Make every financial step add up; flag any jump without its own scenes.", "A money path check."],
      ["scene-writer", "Scene Writer", "Write scenes with exact, specific details and subtext.", "Scene drafts."],
      ["narration-writer", "Narration Writer", "Write spoken, human narration in each version's language.", "Narration per version."],
      ["realism-auditor", "Realism & Anti-Robotic Auditor", "Catch stock phrases, uniform sentences, \"and then\" chains and stated morals, and rewrite them.", "A lint report and rewrites."],
      ["ai-scene-director", "AI Scene Director", "Generate only the shots stock footage cannot supply (a dragon, a lost city) from one character bible and the same reference images, through whichever video model is available, and mark every one for disclosure.", "Generated shots with their prompts, references and disclosure flags."],
      ["fiction-label-guard", "Fiction Label & Ethics Guard", "Keep the film free of on-screen labels while never calling an invented story true: a one-line note in the description, real-person stories told from sources, photoreal AI scenes disclosed in YouTube Studio.", "A label checklist."],
    ],
  },
  {
    id: "versions",
    name: "Language Versions",
    goal: "Make three films that each feel native (Arabic, English for the USA, Bangla): never translations, never mixed.",
    agents: [
      ["arabic-writer", "Arabic Transcreator", "Write the Arabic version in Modern Standard Arabic from the shared research or premise.", "The Arabic script."],
      ["english-writer", "English (USA) Transcreator", "Write the English version for American viewers.", "The English script."],
      ["bangla-writer", "Bangla Transcreator", "Write the Bangla version in Bangladeshi Bangla (pani, not jol).", "The Bangla script."],
      ["arabic-reviewer", "Arabic Audience Reviewer", "Check fit for Arabic-speaking viewers with an Islamic outlook: no instruments, respectful content.", "A review."],
      ["english-reviewer", "US Audience Reviewer", "Check American references, units and dollars.", "A review."],
      ["bangla-reviewer", "Bangladesh Audience Reviewer", "Check Bangladeshi references, Taka and religious sensitivities.", "A review."],
      ["numerals-typography", "Numerals & Typography Checker", "Check Arabic-Indic and Bengali digits, fonts and complex-script rendering.", "A render check."],
      ["separation-guard", "Version Separation Guard", "Make sure no line, voice or caption leaks between versions.", "A purity report per version."],
      ["subtitle-builder", "Subtitle Builder", "Build timed subtitles per version from the final narration, or Arabic plus translation for a recitation.", "Subtitle files per version."],
      ["packaging-localizer", "Title & Thumbnail Localizer", "Write titles, descriptions and thumbnails per version, never translated.", "A publishing pack per version."],
    ],
  },
]);

/** @type {readonly Agent[]} */
export const AGENTS = Object.freeze(
  SQUADS.flatMap((squad) =>
    squad.agents.map(([id, name, mission, deliverable]) => ({ id: squad.id + "-" + id, squadId: squad.id, squadName: squad.name, name, mission, deliverable })),
  ),
);

/** @param {string} id */
export function getSquad(id) {
  return SQUADS.find((squad) => squad.id === id) ?? null;
}

/** @param {string} id */
export function getAgent(id) {
  return AGENTS.find((agent) => agent.id === id) ?? null;
}
