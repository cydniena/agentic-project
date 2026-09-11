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
   `data/brand.json` and injected into every prompt from the next draft onward.

"Reset demo queue" restores all six comments — useful between user sessions.

## How it works

| File | Role |
|---|---|
| `server/index.js` | Express app + JSON API |
| `server/claude.js` | Claude calls; the brand profile is the cached system prompt |
| `server/store.js` | Brand profile persistence + banned-word matching |
| `server/comments.js` | Seeded comment queue (status in memory, per process) |
| `public/` | Single-page UI, no build step |

Model: `claude-opus-5` with adaptive thinking at `effort: "low"` — replies are short and
the low setting keeps them fast enough to draft the whole queue on page load. Replies and
post sets come back as structured output (Zod schema), so the UI never parses prose.

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
