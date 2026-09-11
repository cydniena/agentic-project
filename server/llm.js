import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { loadSkill, bulletList } from "./skill.js";

/**
 * Two backends, one interface.
 *
 *   anthropic - the Anthropic Messages API (/v1/messages). Also reaches any
 *               Anthropic-compatible gateway, e.g. OpenCode Zen's Claude models.
 *   openai    - any OpenAI-compatible /chat/completions endpoint, which is how
 *               OpenCode Zen serves DeepSeek, Qwen, GLM, Kimi and friends.
 *
 * Pick with LLM_PROVIDER; everything above this layer is provider-agnostic.
 */
const PROVIDER = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
const IS_OPENAI = PROVIDER === "openai";

const MODEL = process.env.LLM_MODEL || (IS_OPENAI ? "deepseek-v4-flash" : "claude-opus-5");
const BASE_URL = process.env.LLM_BASE_URL || undefined;
const API_KEY = process.env.LLM_API_KEY || undefined;

// OpenCode Go (/zen/go/v1) is the subscription tier and refuses any request
// without a session id. Zen's pay-as-you-go tier (/zen/v1) ignores the header,
// so send it to either rather than making the caller care which one they are on.
const IS_OPENCODE = Boolean(BASE_URL && /opencode\.ai|\/zen\//.test(BASE_URL));

// Structured outputs and `effort` are first-party Claude API features. A gateway
// may not forward them, and non-Claude models will not have them at all, so the
// openai backend always uses prompt-instructed JSON validated by the same schema.
const USE_STRUCTURED_OUTPUT = !IS_OPENAI && process.env.STRUCTURED_OUTPUT !== "off";
const EFFORT = process.env.LLM_EFFORT || "low";

/**
 * Lazily constructed so the server still boots (and the UI still loads) before a
 * key is configured.
 */
let client = null;
function getClient() {
  if (client) return client;
  client = IS_OPENAI
    ? new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL })
    : new Anthropic({
        ...(API_KEY ? { apiKey: API_KEY } : {}),
        ...(BASE_URL ? { baseURL: BASE_URL } : {}),
      });
  return client;
}

export function hasCredentials() {
  if (IS_OPENAI) return Boolean(API_KEY);
  return Boolean(API_KEY || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function describeProvider() {
  return { provider: PROVIDER, model: MODEL, baseUrl: BASE_URL ?? "(provider default)" };
}

/**
 * The whole system prompt is the brand voice skill, with the manager's saved profile
 * overriding the four fields the Brand Voice tab exposes. Both drafting features call
 * this - same voice, same do's and don'ts, same examples - and because it is identical
 * for both it is a single cached prefix across the queue and the post drafter alike.
 *
 * Every rule here comes from the skill file. Nothing about the voice is written in
 * this module, so editing the markdown is the only way to change what DSTA sounds like.
 */
function systemPrompt(brand) {
  const skill = loadSkill();
  if (skill.problems.length) throw new Error(skill.problems.join(" "));

  // Each block ends with a blank line so the examples do not run together.
  const examples = (heading, items, label, field) => [
    heading,
    "",
    ...items.map((ex) =>
      [
        `Situation: ${ex.title}`,
        ex.fields.comment ? `Comment: ${ex.fields.comment}` : null,
        `${label}: ${ex.fields[field]}`,
        ex.fields.why_it_works ? `Why it works: ${ex.fields.why_it_works}` : null,
      ]
        .filter(Boolean)
        .join("\n") + "\n"
    ),
  ];

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
    bulletList(skill.dos),
    "",
    "DO NOT",
    bulletList(skill.donts),
    "",
    "BANNED WORDS AND PHRASES (never use these, or any close variant):",
    bulletList(brand.bannedWords),
    "",
    "HARD CONSTRAINTS",
    bulletList(skill.hardConstraints),
    "",
    "EXAMPLES OF THE VOICE",
    "Match the register, length and structure of these. Never reuse their wording or their",
    "specifics - the situations below are not the one you are writing about.",
    "",
    ...examples("On-brand replies:", skill.replyExamples, "Reply", "reply"),
    ...examples("On-brand posts:", skill.postExamples, "Post", "post"),
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

const REFUSAL = "The model declined to draft this one. Review and write it manually.";
const UNREADABLE = "The model returned an unreadable response. Try again.";

/** Pulls the first JSON object out of a plain-text response. */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(UNREADABLE);
  return JSON.parse(text.slice(start, end + 1));
}

function validate(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(UNREADABLE);
  return result.data;
}

const jsonInstruction = (shape) =>
  `\n\nReply with JSON only, no prose, no markdown fences, in this shape:\n${shape}`;

async function viaOpenAI({ brand, userContent, schema, shape }) {
  const response = await getClient().chat.completions.create(
    {
      model: MODEL,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt(brand) },
        { role: "user", content: userContent + jsonInstruction(shape) },
      ],
    },
    IS_OPENCODE ? { headers: { "x-opencode-session": crypto.randomUUID() } } : undefined
  );
  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error(UNREADABLE);
  return validate(schema, extractJson(text));
}

async function viaAnthropic({ brand, userContent, schema, shape }) {
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
    if (response.stop_reason === "refusal") throw new Error(REFUSAL);
    if (!response.parsed_output) throw new Error(UNREADABLE);
    return response.parsed_output;
  }

  const response = await getClient().messages.create({
    ...request,
    messages: [{ role: "user", content: userContent + jsonInstruction(shape) }],
  });
  if (response.stop_reason === "refusal") throw new Error(REFUSAL);
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return validate(schema, extractJson(text));
}

const generate = (args) => (IS_OPENAI ? viaOpenAI(args) : viaAnthropic(args));

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
