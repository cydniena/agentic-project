/**
 * Loads the brand voice skill - `skills/brand-voice/SKILL.md` - which is the single
 * source of truth for how DSTA sounds in public. Both drafting features build their
 * prompt from what this returns, so the voice cannot drift between them.
 *
 * The file is markdown so a manager can read and edit it without touching code; the
 * parser below only understands the small subset of structure the file actually uses.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_FILE = path.join(here, "..", "skills", "brand-voice", "SKILL.md");

/** Renders a list of items as markdown bullets. Shared with the prompt builder. */
export const bulletList = (items, fallback = "- (none)") =>
  items?.length ? items.map((i) => `- ${i}`).join("\n") : fallback;

/**
 * Headings are matched on letters alone, so `## Don't`, `## Donts` and `## DO NOT`
 * all resolve to the same section. One general rule beats a fallback per heading.
 */
const key = (heading) => heading.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Splits on a heading regex that captures the heading text, returning
 * `[heading, body]` pairs. Used for `##` sections, `###` blocks and `**Label:**`
 * fields alike - all three have the same shape.
 */
function pairs(text, headingRegex) {
  const parts = (text ?? "").split(headingRegex);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push([parts[i].trim(), parts[i + 1]]);
  return out;
}

/** Frontmatter is only ever `key: value` on one line here, so no YAML dependency. */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(match[0].length) };
}

const bullets = (text) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, ""));

const paragraphs = (text) =>
  (text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^[-*]\s+/.test(line.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * An example section is a run of `### Title` blocks, each holding `**Label:** value`
 * fields. Returns `[{ title, fields: { comment, reply, ... } }]`.
 */
const parseExamples = (text) =>
  pairs(text, /^###\s+(.+?)\s*$/m).map(([title, body]) => ({
    title,
    fields: Object.fromEntries(
      pairs(body, /^\*\*(.+?):\*\*/m).map(([label, value]) => [
        key(label) === "whyitworks" ? "why_it_works" : key(label),
        value.trim().replace(/\s*\r?\n\s*/g, " "),
      ])
    ),
  }));

/**
 * The sections a draft must not go out without. A retitled or deleted heading parses
 * to nothing rather than failing, and a prompt silently missing its don'ts would draft
 * DSTA copy with none of the security or procurement limits applied - so say so.
 */
const REQUIRED = [
  ["guidelines", (s) => s.guidelines, "## Guidelines"],
  ["toneRules", (s) => s.toneRules, "## Tone rules"],
  ["dos", (s) => s.dos.length, "## Do"],
  ["donts", (s) => s.donts.length, "## Don't"],
  ["bannedWords", (s) => s.bannedWords.length, "## Banned phrases"],
  ["hardConstraints", (s) => s.hardConstraints.length, "## Hard constraints"],
  ["replyExamples", (s) => s.replyExamples.length, "## Example replies"],
  ["postExamples", (s) => s.postExamples.length, "## Example posts"],
];

/** Returns a list of human-readable problems; empty means the skill is usable. */
export function findProblems(skill) {
  return REQUIRED.filter(([, get]) => !get(skill)).map(
    ([, , heading]) => `${SKILL_FILE}: the "${heading}" section is missing or empty.`
  );
}

let cache = null;

/**
 * Reads and parses the skill, re-reading only when the file changes on disk so an
 * edit lands on the next draft without a restart.
 */
export function loadSkill() {
  const stat = fs.statSync(SKILL_FILE);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.skill;

  const { meta, body } = parseFrontmatter(fs.readFileSync(SKILL_FILE, "utf8"));
  const s = Object.fromEntries(
    pairs(body, /^##\s+(.+?)\s*$/m).map(([heading, text]) => [key(heading), text.trim()])
  );

  const skill = {
    brandName: meta.brand_name || "our organisation",
    guidelines: paragraphs(s.guidelines),
    toneRules: bulletList(bullets(s.tonerules), ""),
    dos: bullets(s.do),
    donts: bullets(s.dont),
    bannedWords: bullets(s.bannedphrases),
    hardConstraints: bullets(s.hardconstraints),
    replyExamples: parseExamples(s.examplereplies),
    postExamples: parseExamples(s.exampleposts),
  };
  skill.problems = findProblems(skill);

  cache = { mtimeMs: stat.mtimeMs, skill };
  return skill;
}

/** The four fields a manager can override from the Brand Voice tab. */
export function skillDefaults() {
  const { brandName, guidelines, toneRules, bannedWords } = loadSkill();
  return { brandName, guidelines, toneRules, bannedWords };
}
