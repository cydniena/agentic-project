import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { skillDefaults } from "./skill.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRAND_FILE = path.join(here, "..", "data", "brand.json");

/**
 * The brand profile is the skill's defaults (`skills/brand-voice/SKILL.md`) with the
 * manager's saved overrides layered on top. The skill stays the one place the voice is
 * defined; `data/brand.json` only ever holds what was changed in the Brand Voice tab.
 */
export function readBrand() {
  const defaults = skillDefaults();
  try {
    const raw = fs.readFileSync(BRAND_FILE, "utf8");
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
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
  fs.mkdirSync(path.dirname(BRAND_FILE), { recursive: true });
  fs.writeFileSync(BRAND_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Returns the banned words that appear in `text` (case-insensitive, whole phrase). */
export function findBannedWords(text, bannedWords) {
  const hay = String(text ?? "").toLowerCase();
  return (bannedWords ?? []).filter((w) => w && hay.includes(String(w).toLowerCase()));
}
