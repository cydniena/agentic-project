import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { loadSkill } from "./skill.js";

const MODEL = process.env.LLM_MODEL || "claude-opus-5";

// Structured outputs and `effort` are first-party Claude API features. A
// gateway that only mirrors the core Messages API may reject them, so both are
// switchable; with STRUCTURED_OUTPUT=off we ask for JSON in the prompt instead.
const USE_STRUCTURED_OUTPUT = process.env.STRUCTURED_OUTPUT !== "off";
const EFFORT = process.env.LLM_EFFORT || "low";

/**
 * Lazily constructed so the server still boots (and the UI still loads) before a
 * key is configured. The SDK reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN and
 * ANTHROPIC_BASE_URL from the environment, so pointing this at an
 * Anthropic-compatible gateway (e.g. OpenCode Zen) is env config, not code.
 */
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export function hasCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * The whole system prompt is the brand voice skill, with the manager's saved profile
 * overriding the four fields the Brand Voice tab exposes. Both drafting features call
 * this - same voice, same do's and don'ts, same examples - and because it is identical
 * for both it is a single cached prefix across the queue and the post drafter alike.
 */
function systemPrompt(brand) {
  const skill = loadSkill();

  const examples = (heading, items, field) => [
    heading,
    "",
    // Each block ends with a blank line so the examples do not run together.
    ...items.map(
      (ex) =>
        [
          `Situation: ${ex.title}`,
          ex.fields.comment ? `Comment: ${ex.fields.comment}` : null,
          `${field[0].toUpperCase()}${field.slice(1)}: ${ex.fields[field]}`,
          ex.fields.why_it_works ? `Why it works: ${ex.fields.why_it_works}` : null,
        ]
          .filter(Boolean)
          .join("\n") + "\n"
    ),
  ];

  const list = (items, fallback) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : fallback;

  return [
    `You write social media copy for ${brand.brandName.replace(/\.$/, "")}.`,
    "",
    "BRAND GUIDELINES",
    brand.guidelines,
    "",
    "TONE RULES",
    brand.toneRules,
    "",
    "DO",
    list(skill.dos, "- (none)"),
    "",
    "DO NOT",
    list(skill.donts, "- (none)"),
    "",
    "BANNED WORDS AND PHRASES (never use these, or any close variant):",
    list(brand.bannedWords ?? [], "- (none)"),
    "",
    "HARD CONSTRAINTS",
    "- Never invent facts: no prices, dates, delivery windows, ingredients or policies that were not given to you.",
    "- If answering properly needs information you do not have, write a reply that acknowledges the person and says the team will follow up with the specifics.",
    "- Never apologise more than once in a single reply.",
    "- Output plain text only. No markdown, no hashtags unless the tone rules ask for them.",
    "",
    "EXAMPLES OF THE VOICE",
    "Match the register, length and structure of these. Never reuse their wording or their",
    "specifics - the situations below are not the one you are writing about.",
    "",
    ...examples("On-brand replies:", skill.replyExamples, "reply"),
    ...examples("On-brand posts:", skill.postExamples, "post"),
  ].join("\n");
}

const ReplySchema = z.object({
  reply: z.string().describe("The draft reply, ready to paste as-is."),
  rationale: z
    .string()
    .describe("One short sentence on the approach taken, for the reviewer."),
});

const PostsSchema = z.object({
  variations: z
    .array(
      z.object({
        angle: z.string().describe("2-4 word label for this angle, e.g. 'Direct offer'."),
        text: z.string().describe("The full post, ready to paste as-is."),
      })
    )
    .length(3),
});

function refusalGuard(response) {
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to draft this one. Review and write it manually.");
  }
}

/** Pulls the first JSON object out of a plain-text response. */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON found in the response.");
  return JSON.parse(text.slice(start, end + 1));
}

async function generate({ brand, userContent, schema, shape }) {
  const request = {
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: "text", text: systemPrompt(brand), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  };

  if (USE_STRUCTURED_OUTPUT) {
    const response = await getClient().messages.parse({
      ...request,
      output_config: { effort: EFFORT, format: zodOutputFormat(schema) },
    });
    refusalGuard(response);
    if (!response.parsed_output) throw new Error("The model returned an unreadable response. Try again.");
    return response.parsed_output;
  }

  // Gateway fallback: ask for JSON in the prompt, then validate with the same schema.
  const response = await getClient().messages.create({
    ...request,
    messages: [{ role: "user", content: `${userContent}\n\nReply with JSON only, no prose, in this shape:\n${shape}` }],
  });
  refusalGuard(response);
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const result = schema.safeParse(extractJson(text));
  if (!result.success) throw new Error("The model returned an unreadable response. Try again.");
  return result.data;
}

export async function draftReply({ brand, comment }) {
  return generate({
    brand,
    schema: ReplySchema,
    shape: `{"reply": "the draft reply", "rationale": "one short sentence for the reviewer"}`,
    userContent: [
      "Draft a reply to this incoming comment.",
      "",
      `Channel: ${comment.channel}`,
      `From: ${comment.author}`,
      `Comment: ${comment.text}`,
    ].join("\n"),
  });
}

export async function draftPosts({ brand, topic }) {
  const out = await generate({
    brand,
    schema: PostsSchema,
    shape: `{"variations": [{"angle": "2-4 word label", "text": "the full post"}, ... exactly 3 items]}`,
    userContent: [
      `Write 3 distinctly different post options about: ${topic}`,
      "",
      "Make the angles genuinely different from each other (for example: direct, story-led, question-led).",
      "Each post must stand on its own and be ready to publish without edits.",
    ].join("\n"),
  });
  return out.variations;
}
