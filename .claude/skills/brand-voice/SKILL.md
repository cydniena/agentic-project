---
name: brand-voice
description: DSTA's public brand voice - tone, do's and don'ts, security and procurement boundaries, banned phrases and worked examples. Use when drafting, rewriting or reviewing any DSTA-facing copy - social posts, comment replies, announcements, careers and event material - or when judging whether a draft sounds like DSTA.
---

# DSTA brand voice

The voice is defined in one place: **`skills/brand-voice/SKILL.md`** at the repo root.

Read that file before drafting or reviewing DSTA copy. It is deliberately not duplicated
here - the same file is what the BrandVoice app loads at runtime (`server/skill.js`), so
a single edit changes both what the app drafts and how you write.

It contains the guidelines, tone rules, do's, don'ts, banned phrases, and four worked
example replies and four example posts with a note on why each works.

## How to apply it

- Read the whole file first. The don'ts and the examples carry more of the voice than the guidelines do.
- Treat the **Don't** section as hard limits, not style preferences. The security and
  procurement lines - no operational detail, no confirming or denying, no comment on live
  tenders, no speaking for MINDEF or the SAF - are the ones that matter most.
- Match the register and structure of the examples. Never reuse their wording or their
  specifics; those situations are not the one you are writing about.
- Check a draft against the banned phrases before handing it over. Note that `defense`
  and `organization` are banned as American spellings.
- If a request needs a fact you do not have - a figure, a date, a programme name, an
  eligibility rule - say so and leave a placeholder rather than inventing it. That is the
  voice as much as the tone is.

## Related

- `server/skill.js` parses the voice file for the app; its tests are `server/skill.test.js`.
- Editing `skills/brand-voice/SKILL.md` lands on the app's next draft with no restart.
