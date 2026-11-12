/**
 * YouTube Analytics for the owner's own channel, read-only: the audience
 * retention curve of a published film, so the next films learn where
 * viewers left (engine/src/retention.mjs). The owner connects once with
 * Google sign-in (OAuth, scope yt-analytics.readonly); the refresh token is
 * kept in the private R2 bucket. Needs GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET (docs/CONNECT.md).
 */

import { curveFromReport, retentionReport, videoIdOf } from "../engine/src/retention.mjs";

export const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

/** @param {string} secret @param {string} text */
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A sign-in state only this deployment can make (signed with the studio
 * token), so a callback that did not start here is refused.
 * @param {string} secret @param {number} [now]
 */
export async function signState(secret, now = Date.now()) {
  const nonce = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const body = `${now}.${nonce}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** @param {string} secret @param {unknown} state @param {number} [now] */
export async function verifyState(secret, state, now = Date.now()) {
  const parts = String(state ?? "").split(".");
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts;
  if (!(now - Number(ts) >= 0 && now - Number(ts) < STATE_MAX_AGE_MS)) return false;
  const want = await hmac(secret, `${ts}.${nonce}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** The Google sign-in page for read-only analytics. @param {{ clientId: string, redirectUri: string, state: string }} o */
export function authUrl(o) {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: o.clientId, redirect_uri: o.redirectUri, response_type: "code", scope: ANALYTICS_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: o.state })}`;
}

/**
 * @param {typeof fetch} get @param {Record<string, string>} form
 * @returns {Promise<any>}
 */
async function tokenCall(get, form) {
  const res = await get("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  const data = /** @type {any} */ (await res.json().catch(() => ({})));
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}${data?.error ? `: ${data.error}` : ""}).`);
  return data;
}

/** Trade the sign-in code for tokens. @param {{ clientId: string, clientSecret: string, redirectUri: string, code: string, fetch?: typeof fetch }} o */
export async function exchangeCode(o) {
  const data = await tokenCall(o.fetch ?? fetch, { code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: "authorization_code" });
  if (!data.refresh_token) throw new Error("Google gave no refresh token; remove the app's access in your Google account and connect again.");
  return { refreshToken: String(data.refresh_token), accessToken: String(data.access_token ?? "") };
}

/** A fresh access token from the stored refresh token. @param {{ clientId: string, clientSecret: string, refreshToken: string, fetch?: typeof fetch }} o */
export async function accessToken(o) {
  const data = await tokenCall(o.fetch ?? fetch, { refresh_token: o.refreshToken, client_id: o.clientId, client_secret: o.clientSecret, grant_type: "refresh_token" });
  return String(data.access_token ?? "");
}

/**
 * The audience retention report of one video of the owner's channel.
 * @param {{ accessToken: string, videoId: string, fetch?: typeof fetch, today?: string }} o
 */
export async function retentionData(o) {
  const get = o.fetch ?? fetch;
  const params = new URLSearchParams({ ids: "channel==MINE", startDate: "2005-02-14", endDate: o.today ?? new Date().toISOString().slice(0, 10), metrics: "audienceWatchRatio,relativeRetentionPerformance", dimensions: "elapsedVideoTimeRatio", filters: `video==${o.videoId}` });
  const res = await get(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, { headers: { authorization: `Bearer ${o.accessToken}` } });
  const data = /** @type {any} */ (await res.json().catch(() => ({})));
  if (!res.ok) throw new Error(res.status === 403 ? "YouTube Analytics refused: the video must be on the channel you connected." : `YouTube Analytics answered ${res.status}.`);
  return data;
}

/**
 * Learn from one published film: read its retention curve, tie the drops to
 * its scenes, save retention.json with the film and add the lessons to the
 * channel's lessons (channel/lessons.json, the last 30 films).
 * @param {{ store: { get(k: string): Promise<string | null>, put(k: string, v: string): Promise<void> }, channel: { get(k: string): Promise<string | null>, put(k: string, v: string): Promise<void> }, filmId: string, video: unknown, clientId?: string, clientSecret?: string, fetch?: typeof fetch, today?: string }} o
 * @returns {Promise<{ ok: true, report: { at30: number | null, at60: number | null, half: number | null, end: number | null, drops: number, holds: number } } | { ok: false, status: number, error: string }>}
 */
export async function learnFromVideo(o) {
  if (!o.clientId || !o.clientSecret) return { ok: false, status: 503, error: "Connect Google first: the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets (docs/CONNECT.md)." };
  const videoId = videoIdOf(o.video);
  if (!videoId) return { ok: false, status: 400, error: "Give the YouTube link or the 11-character video id of the published film." };
  const oauth = JSON.parse((await o.channel.get("channel/youtube-oauth.json")) ?? "null");
  if (!oauth?.refreshToken) return { ok: false, status: 409, error: "Connect YouTube Analytics first (the studio's Connect YouTube button)." };
  const film = JSON.parse((await o.store.get("film.json")) ?? "null") ?? JSON.parse((await o.store.get("run.json")) ?? "{}").film;
  const plan = JSON.parse((await o.store.get("s3-chapters.json")) ?? "[]");
  if (!film?.durationSeconds || !Array.isArray(plan) || !plan.length) return { ok: false, status: 404, error: "This film has no script yet." };
  const chapters = await Promise.all(plan.map(async (/** @type {any} */ c) => ({ markdown: (await o.store.get(`s5-${c.id}.md`)) ?? "" })));
  const title = /\*\*Final title[^:]*:\s*([^*\n]+)\*\*/i.exec((await o.store.get("s7.md")) ?? "")?.[1]?.trim() ?? film.topic ?? "";
  const token = await accessToken({ clientId: o.clientId, clientSecret: o.clientSecret, refreshToken: oauth.refreshToken, fetch: o.fetch });
  const curve = curveFromReport(await retentionData({ accessToken: token, videoId, fetch: o.fetch, today: o.today }));
  if (curve.length < 10) return { ok: false, status: 422, error: "YouTube has no retention curve for this video yet; it appears a day or two after publishing, once enough people have watched." };
  const report = retentionReport({ filmId: o.filmId, title, videoId, curve, durationSeconds: film.durationSeconds, chapters });
  await o.store.put("retention.json", JSON.stringify(report, null, 1));
  /** @type {any[]} */
  const lessons = JSON.parse((await o.channel.get("channel/lessons.json")) ?? "[]");
  await o.channel.put("channel/lessons.json", JSON.stringify([...lessons.filter((l) => l.filmId !== o.filmId), report].slice(-30)));
  return { ok: true, report: { at30: report.at30, at60: report.at60, half: report.half, end: report.end, drops: report.drops.length, holds: report.holds.length } };
}
