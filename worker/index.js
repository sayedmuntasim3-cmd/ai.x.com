// Cloudflare Worker: serves the static site from ./public and adds POST /api/script.
// Secrets (set in the Cloudflare dashboard, never in code):
//   GEMINI_API_KEY  - Google AI Studio key (tried first)
//   GROQ_API_KEY    - Groq key (optional fallback)

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const IDEA_MAX = 500;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function buildPrompt(input) {
  const minutes = Math.min(30, Math.max(1, Math.round(Number(input.minutes) || 8)));
  const words = minutes * 140;
  const system = [
    "You are an award-winning documentary writer and narrator-script editor.",
    "Write narration in the style of the best nature and history documentaries: concrete detail, vivid imagery, a clear human thread, and restraint (no hype, no clichés, no filler).",
    "Use real, checkable facts only. If a number or date is uncertain, speak in general terms instead of inventing it.",
    "Write in the same language as the user's idea (for example Bangla if the idea is in Bangla).",
  ].join(" ");
  const user = [
    `Idea: ${input.idea}`,
    `Category: ${input.category || "general"} | Audience: ${input.age || "all ages"} | Style: ${input.style || "cinematic"} | Music mood: ${input.music || "epic"}`,
    `Length: about ${minutes} minutes of narration, roughly ${words} words.`,
    "",
    "Format exactly like this:",
    "TITLE: <working title>",
    "LOGLINE: <one sentence>",
    "",
    "Then 4 to 7 chapters. For each chapter:",
    "## <Chapter title>",
    "VISUALS: <1-2 lines describing what the viewer sees>",
    "NARRATION: <the spoken words>",
    "",
    "Start with a strong hook and end with a memorable closing line.",
  ].join("\n");
  return { system, user };
}

async function callGemini(env, { system, user }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("gemini empty");
  return text;
}

async function callGroq(env, { system, user }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.8,
      max_tokens: 6000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("groq empty");
  return text;
}

async function handleScript(request, env) {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  // Only our own site may call this, so nobody can burn the free quota from elsewhere.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "Not allowed." }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const idea = clean(body.idea, IDEA_MAX);
  if (idea.length < 12) return json({ error: "Tell us a little more about your idea." }, 400);

  const prompt = buildPrompt({
    idea,
    minutes: body.minutes,
    category: clean(body.category, 40),
    age: clean(body.age, 40),
    style: clean(body.style, 40),
    music: clean(body.music, 40),
  });

  const providers = [];
  if (env.GEMINI_API_KEY) providers.push(["gemini", callGemini]);
  if (env.GROQ_API_KEY) providers.push(["groq", callGroq]);
  if (providers.length === 0) return json({ error: "Script writer is not configured yet." }, 503);

  for (const [name, call] of providers) {
    try {
      const script = await call(env, prompt);
      return json({ script, provider: name });
    } catch {
      /* try the next provider */
    }
  }
  return json({ error: "The script writer is busy right now. Please try again in a minute." }, 502);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/script") return handleScript(request, env);
    return env.ASSETS.fetch(request);
  },
};
