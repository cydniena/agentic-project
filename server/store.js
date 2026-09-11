import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRAND_FILE = path.join(here, "..", "data", "brand.json");

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
  fs.mkdirSync(path.dirname(BRAND_FILE), { recursive: true });
  fs.writeFileSync(BRAND_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Returns the banned words that appear in `text` (case-insensitive, whole phrase). */
export function findBannedWords(text, bannedWords) {
  const hay = String(text ?? "").toLowerCase();
  return (bannedWords ?? []).filter((w) => w && hay.includes(String(w).toLowerCase()));
}
