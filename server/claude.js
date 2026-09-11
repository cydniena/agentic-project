import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MODEL = "claude-opus-5";

/**
 * Lazily constructed so the server still boots (and the UI still loads) before a
 * key is configured. The SDK resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
 * an `ant auth login` profile from the environment.
 */
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export function hasCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** The brand voice profile is the stable prefix of every prompt, so it is cached. */
function systemPrompt(brand) {
  return [
    `You write social media copy for ${brand.brandName}.`,
    "",
    "BRAND GUIDELINES",
    brand.guidelines,
    "",
    "TONE RULES",
    brand.toneRules,
    "",
    "BANNED WORDS AND PHRASES (never use these, or any close variant):",
    (brand.bannedWords ?? []).map((w) => `- ${w}`).join("\n") || "- (none)",
    "",
    "HARD CONSTRAINTS",
    "- Never invent facts: no prices, dates, delivery windows, ingredients or policies that were not given to you.",
    "- If answering properly needs information you do not have, write a reply that acknowledges the person and says the team will follow up with the specifics.",
    "- Never apologise more than once in a single reply.",
    "- Output plain text only. No markdown, no hashtags unless the tone rules ask for them.",
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

async function parse({ brand, userContent, format }) {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format },
    system: [
      { type: "text", text: systemPrompt(brand), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      "The model declined to draft this one. Review and write it manually."
    );
  }
  if (!response.parsed_output) {
    throw new Error("The model returned an unreadable response. Try again.");
  }
  return response.parsed_output;
}

export async function draftReply({ brand, comment }) {
  return parse({
    brand,
    format: zodOutputFormat(ReplySchema),
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
  const out = await parse({
    brand,
    format: zodOutputFormat(PostsSchema),
    userContent: [
      `Write 3 distinctly different post options about: ${topic}`,
      "",
      "Make the angles genuinely different from each other (for example: direct, story-led, question-led).",
      "Each post must stand on its own and be ready to publish without edits.",
    ].join("\n"),
  });
  return out.variations;
}
