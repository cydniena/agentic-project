import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRAND_FILE = path.join(here, "..", "data", "brand.json");
const QUEUE_FILE = path.join(here, "..", "data", "queue.json");

/**
 * Write via a temp file and rename, so a crash mid-write cannot leave a
 * half-written JSON file behind that then fails to parse on the next boot.
 */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export const DEFAULT_BRAND = {
  brandName: "Northwind Coffee Co.",
  guidelines:
    "We are a small-batch coffee roaster. We are warm, practical and never salesy. " +
    "Always acknowledge the person's specific point before answering. " +
    "If someone is unhappy, apologise once, plainly, and offer a concrete next step.",
  toneRules:
    "- Friendly and human, never corporate\n" +
    "- 1-3 sentences, under 300 characters\n" +
    "- At most one emoji, only when the comment is positive\n" +
    "- No exclamation marks stacked (!!), no ALL CAPS\n" +
    "- Never promise refunds, discounts or delivery dates we have not confirmed",
  bannedWords: ["guarantee", "cheap", "best in the world", "ASAP", "synergy"],
};

export function readBrand() {
  try {
    const raw = fs.readFileSync(BRAND_FILE, "utf8");
    return { ...DEFAULT_BRAND, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

export function writeBrand(brand) {
  const next = {
    brandName: String(brand.brandName ?? "").slice(0, 120),
    guidelines: String(brand.guidelines ?? "").slice(0, 4000),
    toneRules: String(brand.toneRules ?? "").slice(0, 4000),
    bannedWords: Array.isArray(brand.bannedWords)
      ? brand.bannedWords.map((w) => String(w).trim()).filter(Boolean).slice(0, 100)
      : [],
  };
  writeJson(BRAND_FILE, next);
  return next;
}

const STATUSES = new Set(["pending", "drafted", "approved", "discarded"]);

/**
 * Queue persistence stores only the worked state - status, draft, finalText -
 * keyed by comment id. The comments themselves are rebuilt from the seed on
 * every boot, which keeps two things true:
 *
 *   - arrival times stay relative to now, so a restored queue still reads as
 *     this morning's traffic rather than the day it was first opened;
 *   - no inbound message text is written to disk, only the replies we drafted.
 */
export function readQueueState() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  // Anything unrecognised is dropped rather than trusted - this file is on disk
  // between runs and a stale or hand-edited copy should not break a demo.
  const clean = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    if (!STATUSES.has(entry.status)) continue;

    const draft =
      entry.draft && typeof entry.draft.text === "string"
        ? {
            text: entry.draft.text,
            rationale: typeof entry.draft.rationale === "string" ? entry.draft.rationale : "",
          }
        : null;

    // "drafted" without a draft is incoherent: nothing would re-draft it and the
    // card would sit on the placeholder forever. Treat it as untouched instead.
    if (entry.status === "drafted" && !draft) continue;

    clean[id] = {
      status: entry.status,
      draft,
      finalText: typeof entry.finalText === "string" ? entry.finalText : null,
    };
  }
  return clean;
}

export function writeQueueState(comments) {
  const next = {};
  for (const c of comments) {
    // Untouched comments carry no information worth keeping.
    if (c.status === "pending" && !c.draft) continue;
    next[c.id] = {
      status: c.status,
      draft: c.draft ? { text: c.draft.text, rationale: c.draft.rationale ?? "" } : null,
      finalText: c.finalText ?? null,
    };
  }
  writeJson(QUEUE_FILE, next);
}

/** Returns the banned words that appear in `text` (case-insensitive, whole phrase). */
export function findBannedWords(text, bannedWords) {
  const hay = String(text ?? "").toLowerCase();
  return (bannedWords ?? []).filter((w) => w && hay.includes(String(w).toLowerCase()));
}
