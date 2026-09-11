import Anthropic from "@anthropic-ai/sdk";
// The SDK's zodOutputFormat helper runs zod v4's toJSONSchema, so the schemas
// below must be built with the v4 API. zod 3.25 ships it on the "zod/v4"
// subpath; importing from "zod" gives v3 schemas, which the helper rejects with
// "Cannot read properties of undefined (reading 'def')".
import { z } from "zod/v4";
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

const VoiceSchema = z.object({
  brandName: z
    .string()
    .describe("The brand's name if the replies name it explicitly, otherwise an empty string."),
  guidelines: z
    .string()
    .describe(
      "A short prose paragraph describing who the brand is and how it handles people, " +
        "written in the second person as instructions ('We are...', 'Always...'). 3-5 sentences."
    ),
  toneRules: z
    .string()
    .describe(
      "Concrete, checkable rules, one per line, each starting with '- '. Prefer rules a " +
        "reviewer could verify at a glance (sentence count, character length, emoji use, " +
        "punctuation habits) over vague adjectives. 4-7 rules."
    ),
  bannedWords: z
    .array(z.string())
    .describe(
      "Candidate words and phrases that would clash with this voice. These are suggestions " +
        "for the manager to accept or delete, not conclusions - absence from a small sample " +
        "is not proof a brand avoids a word. At most 8, and an empty array is a valid answer."
    ),
  observations: z
    .string()
    .describe(
      "One or two sentences on what in the samples led to these rules, so the reviewer can " +
        "judge whether the read is right."
    ),
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

/**
 * Reverse of the usual flow: instead of asking a manager to describe their tone,
 * derive a starting profile from replies they were happy to send. The result is a
 * proposal - the caller fills the form with it and the manager edits and saves.
 * Nothing is persisted here.
 */
export async function inferBrandVoice({ samples }) {
  const system = [
    "You are a brand voice analyst. You are given real replies a social media manager",
    "sent and was happy with. Infer the voice profile those replies imply.",
    "",
    "HOW TO READ THE SAMPLES",
    "- Describe what the replies actually do, not what a brand would like to be true.",
    "- Look at observable habits: length, sentence count, greetings and sign-offs,",
    "  emoji and punctuation use, how complaints are handled, how much is promised.",
    "- Where the samples disagree, say so in the observations rather than averaging them.",
    "- Do not invent policies, products, prices or delivery terms. You are describing",
    "  a way of writing, not writing a company handbook.",
    "- If the samples are too few or too inconsistent to support a rule, leave it out.",
  ].join("\n");

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "high", format: zodOutputFormat(VoiceSchema) },
    system,
    messages: [
      {
        role: "user",
        content: [
          `Here are ${samples.length} replies this brand was happy to send.`,
          "",
          ...samples.map((text, i) => `Reply ${i + 1}:\n${text}`),
          "",
          "Infer the brand voice profile these replies imply.",
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to analyse these samples. Fill the profile in by hand.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned an unreadable response. Try again.");
  }

  const out = response.parsed_output;
  return {
    brandName: out.brandName.trim(),
    guidelines: out.guidelines.trim(),
    toneRules: out.toneRules.trim(),
    bannedWords: out.bannedWords.map((w) => w.trim()).filter(Boolean),
    observations: out.observations.trim(),
  };
}
