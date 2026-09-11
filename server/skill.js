/**
 * Loads the brand voice skill - `skills/brand-voice/SKILL.md` - which is the single
 * source of truth for how Northwind sounds in public. Both drafting features build
 * their prompt from what this returns, so the voice cannot drift between them.
 *
 * The file is markdown so a manager can read and edit it without touching code; the
 * parser below only understands the small subset of structure the file actually uses.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_FILE = path.join(here, "..", "skills", "brand-voice", "SKILL.md");

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

/** `## Heading` -> the text under it, keyed by lowercased heading. */
function splitSections(body) {
  const sections = {};
  const parts = body.split(/^##\s+(.+?)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    sections[parts[i].trim().toLowerCase()] = parts[i + 1].trim();
  }
  return sections;
}

const bullets = (text) =>
  (text ?? "")
    .split(/\r?\n/)
    .filter((line) => /^[-*]\s+/.test(line.trim()))
    .map((line) => line.trim().replace(/^[-*]\s+/, "").trim());

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
function parseExamples(text) {
  if (!text) return [];
  const blocks = text.split(/^###\s+(.+?)\s*$/m);
  const out = [];
  for (let i = 1; i < blocks.length; i += 2) {
    const fields = {};
    const fieldParts = blocks[i + 1].split(/^\*\*(.+?):\*\*/m);
    for (let j = 1; j < fieldParts.length; j += 2) {
      fields[fieldParts[j].trim().toLowerCase().replace(/\s+/g, "_")] =
        fieldParts[j + 1].trim().replace(/\s*\r?\n\s*/g, " ");
    }
    out.push({ title: blocks[i].trim(), fields });
  }
  return out;
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
  const s = splitSections(body);

  const skill = {
    name: meta.name || "brand-voice",
    description: meta.description || "",
    brandName: meta.brand_name || "our brand",
    guidelines: paragraphs(s["guidelines"]),
    toneRules: bullets(s["tone rules"]).map((r) => `- ${r}`).join("\n"),
    dos: bullets(s["do"]),
    donts: bullets(s["don't"] ?? s["donts"] ?? s["dont"]),
    bannedWords: bullets(s["banned phrases"]),
    replyExamples: parseExamples(s["example replies"]),
    postExamples: parseExamples(s["example posts"]),
  };

  cache = { mtimeMs: stat.mtimeMs, skill };
  return skill;
}

/** The four fields a manager can override from the Brand Voice tab. */
export function skillDefaults() {
  const skill = loadSkill();
  return {
    brandName: skill.brandName,
    guidelines: skill.guidelines,
    toneRules: skill.toneRules,
    bannedWords: skill.bannedWords,
  };
}
