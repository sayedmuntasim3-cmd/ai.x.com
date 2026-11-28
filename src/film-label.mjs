/**
 * What one voiceover film's card says (src/voice-film.tsx), as plain data.
 *
 * A draft is a film that was handed over even though the release gate still blocked it after the
 * auto-fix rounds: it is kept, downloadable, marked, and never shown as a released film.
 * Kept free of React so the mapping is tested as a unit (src/film-label.test.mjs).
 */

/** The one wording of a draft, used on every surface. */
export const DRAFT_LABEL = "Draft — did not pass the quality check";
/** A draft's download button says it is a draft. */
export const DRAFT_DOWNLOAD = "Download draft";

/** @typedef {{ code?: string, en?: string, bn?: string }} Block */
/** @typedef {{ draft?: boolean, status?: string, blocks?: (Block | string)[], film?: any }} FilmLike */

/** Whether this film is a draft: either the record says so or the studio has no better status for it. @param {FilmLike | null | undefined} film */
export function isDraft(film) {
  return film?.draft === true || film?.status === "draft";
}

/**
 * The 1-3 plain reasons the critic gave, in the reader's language of the page (English).
 * @param {FilmLike | null | undefined} film
 * @returns {string[]}
 */
export function draftReasons(film) {
  const blocks = Array.isArray(film?.blocks) ? film.blocks : [];
  return blocks
    .map((b) => (typeof b === "string" ? b : String(b?.en ?? "")))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * The card's own words: the label, the reasons and what its buttons say.
 * @param {FilmLike | null | undefined} film
 * @returns {{ draft: boolean, label: string, reasons: string[], download: string, canDownload: boolean, canRetry: boolean }}
 */
export function cardOf(film) {
  const draft = isDraft(film);
  return {
    draft,
    label: draft ? DRAFT_LABEL : "",
    reasons: draft ? draftReasons(film) : [],
    download: draft ? DRAFT_DOWNLOAD : "Download",
    canDownload: Boolean(film?.film),
    canRetry: draft || film?.status === "failed",
  };
}
