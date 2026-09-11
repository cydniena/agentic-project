// Shared by the server (server/store.js) and the browser (public/app.js) so the
// two can never drift apart - they used to keep separate copies of this logic.

/** Straight-quote curly apostrophes and collapse whitespace, so "don't" == "don't". */
function normalise(text) {
  return String(text ?? "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Inflections a banned word should still be caught in: cheap -> cheaper, cheapest.
// Deliberately not a general prefix match, which would flag "ready" for "ad".
// A bare "d" is only allowed after an "e" (guarantee -> guaranteed); allowing it
// everywhere would make "ad" flag "add".
function suffixPattern(word) {
  const endings = ["s", "es", "ed", "ing", "er", "est", "ly"];
  if (word.endsWith("e")) endings.push("d");
  return `(?:${endings.join("|")})?`;
}

function toPattern(word) {
  const parts = normalise(word).split(" ").filter(Boolean);
  if (!parts.length) return null;

  // A phrase matches as a phrase, tolerating any run of whitespace between words.
  const body = parts.map(escapeRegex).join("\\s+");

  // \b would not fire next to a leading or trailing non-word character (e.g. a
  // banned entry of "!!"), so only anchor the ends that actually start or end
  // with a word character.
  const left = /^\w/.test(parts[0]) ? "\\b" : "";
  const last = parts[parts.length - 1];
  const right = /\w$/.test(last) ? `${suffixPattern(last)}\\b` : "";

  return new RegExp(`${left}${body}${right}`);
}

/**
 * Returns the banned entries that appear in `text`.
 *
 * Matching is case-insensitive and respects word boundaries, so a short entry
 * like "ad" flags "ad" and "ads" but not "ready" or "advice". Multi-word entries
 * match as a phrase.
 */
export function findBannedWords(text, bannedWords) {
  const hay = normalise(text);
  if (!hay) return [];
  return (bannedWords ?? []).filter((word) => {
    const pattern = toPattern(word);
    return pattern ? pattern.test(hay) : false;
  });
}
