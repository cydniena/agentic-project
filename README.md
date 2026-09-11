# BrandVoice v1

Social post & comment reply assistant. The manager stays the editor: BrandVoice drafts,
the manager reviews, and the only export is the clipboard. Nothing is published anywhere.

## Run it

```bash
npm install
cp .env.example .env      # then paste your key into ANTHROPIC_API_KEY
npm start                 # http://localhost:3000
```

The app boots and the UI loads without a key — the queue renders, but drafting calls
return "No Anthropic API key configured" until you add one and restart.

## The demo (matches the key user flow)

1. **Open the app.** The Reply Queue is the first screen. Six seeded comments load and
   every pending one is drafted in parallel, so the queue is review-ready on arrival.
2. **Edit inline.** Each draft sits in an editable box. Tweak a word, hit
   **Copy to Clipboard**, paste it into the live channel.
3. **Approve & Copy.** One click on an accurate draft copies it and marks the comment
   done. **Regenerate** re-drafts; **Discard** drops it.
4. **Post Drafter tab.** Type `Announce our summer discount` → 3 on-brand variations,
   each editable and copyable.
5. **Brand Voice tab.** Guidelines, tone rules and banned words. Saved to
   `data/brand.json` as overrides on top of the skill, and injected into every prompt
   from the next draft onward.

"Reset demo queue" restores all six comments — useful between user sessions.

## How it works

| File | Role |
|---|---|
| `skills/brand-voice/SKILL.md` | **The brand voice.** Tone, do's/don'ts, banned phrases, worked examples |
| `server/skill.js` | Parses the skill; re-reads it when the file changes |
| `server/index.js` | Express app + JSON API |
| `server/llm.js` | Model calls (both providers); the skill is the system prompt |
| `server/store.js` | Manager's overrides on the skill + banned-word matching |
| `server/comments.js` | Seeded comment queue (status in memory, per process) |
| `public/` | Single-page UI, no build step |

### The brand voice skill

`skills/brand-voice/SKILL.md` is the single source of truth for how the brand sounds.
It is plain markdown - a manager can read and edit it without touching code - and it
holds the tone rules, the do's and don'ts, the banned phrases, and four worked example
replies and four example posts, each with a line on why it works.

Both drafting features go through it. `draftReply` and `draftPosts` share one
`systemPrompt()` built from the skill, so the two never drift apart, and this holds for
either provider - the skill is the `system` block on the Anthropic path and the `system`
message on the OpenAI-compatible one. On the Anthropic path the prompt is byte-identical
for both features, so they share a single prompt cache entry. Editing `SKILL.md` lands on
the next draft - the file is re-read when its mtime changes, no restart needed.

What the Brand Voice tab can override: brand name, guidelines, tone rules, banned
words. Those are saved to `data/brand.json` and layer on top of the skill's defaults.
The do's, don'ts and examples come from the skill only - change them by editing the
file, which keeps them in git and reviewable.

Run `npm test` to check the skill parses and its examples obey their own rules.

### Choosing a model

The app talks to two kinds of endpoint, selected with `LLM_PROVIDER`:

| `LLM_PROVIDER` | Endpoint | Use for |
|---|---|---|
| `openai` | `/chat/completions` | OpenCode Zen's DeepSeek, Qwen, GLM, Kimi, GPT... |
| `anthropic` (default) | `/v1/messages` | Claude, direct or via Zen |

**DeepSeek V4 Flash on OpenCode** — this is the OpenAI-compatible endpoint, not the
Anthropic one the Claude models use:

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=https://opencode.ai/zen/go/v1
LLM_API_KEY=<your OpenCode key>
LLM_MODEL=deepseek-v4-flash
```

**Mind the `/go/` in that path.** OpenCode has two billing tiers on near-identical URLs:

| Path | Tier | Fails with |
|---|---|---|
| `/zen/go/v1` | Go — subscription | — |
| `/zen/v1` | Zen — prepaid credit wallet | `401 Insufficient balance` if the wallet is empty |

A Go subscription key sent to `/zen/v1` gets `401 Insufficient balance` even though the key
is valid and the subscription has plenty of headroom, because the two tiers meter
separately. Go also **requires an `x-opencode-session` header** on every request; the app
sends a fresh UUID automatically whenever the base URL is an OpenCode one.

**Claude via Zen** — `LLM_PROVIDER=anthropic`, `LLM_BASE_URL=https://opencode.ai/zen`.
If the gateway 400s on `output_config`, set `STRUCTURED_OUTPUT=off`.

**Anthropic directly** — `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`, nothing else.

The startup log prints the provider, model and base URL in use, and `/api/config` returns
the same, so you can see at a glance what a demo is actually running on.

### How drafting works

On the `anthropic` provider with a first-party key, replies come back as structured output
(Zod schema) at `effort: "low"` — short replies, fast enough to draft the whole queue on
page load. Every other configuration asks for JSON in the prompt and validates it against
the *same* Zod schema, tolerating markdown fences and surrounding prose. A response that
doesn't fit the schema surfaces as "unreadable response, try again" on the card rather than
as a broken draft.

Guardrails in v1:

- Banned words are checked **server-side on generation and client-side as you type**;
  Copy and Approve are blocked while a banned word is present.
- The system prompt forbids inventing prices, dates, policies or ingredients.
- A model refusal surfaces as a visible message on the card rather than a blank draft.

## Privacy

- No text reaches a social network. Copy-to-clipboard is the only export path.
- Zero data retention is an **organisation-level setting on your Anthropic account** —
  enable it there; there is no per-request flag for it. Claude API inputs are not used to
  train models by default.
- The brand profile lives only in `data/brand.json` on your machine (git-ignored).

## Out of scope in v1

No publishing APIs, no scheduling, no image/video, no multi-user roles, no analytics.
