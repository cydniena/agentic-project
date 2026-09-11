/**
 * The v1 demo queue. There is no social-network integration in scope, so incoming
 * comments are seeded here. Status lives in memory for the life of the process.
 *
 * The six are chosen to exercise the skill's don'ts, not just its tone: an individual
 * eligibility question, an operational-detail question, a supplier enquiry, a warm
 * one, political criticism, and a thank-you. Four of the six should end in a redirect
 * or a plain refusal rather than an answer.
 */
const SEED = [
  {
    id: "c1",
    channel: "LinkedIn",
    author: "Rahul M.",
    receivedAt: "2026-09-11T08:12:00Z",
    text: "I'm a software engineer with 8 years in fintech, looking to move into public sector work. Is DSTA open to mid-career switchers or is it mainly fresh grads and scholars?",
  },
  {
    id: "c2",
    channel: "Facebook",
    author: "Daniel Ong",
    receivedAt: "2026-09-11T08:41:00Z",
    text: "Saw the post about the new sensor work. What's the actual range on it, and is it deployed at the northern installations yet?",
  },
  {
    id: "c3",
    channel: "LinkedIn",
    author: "Serene Tan",
    receivedAt: "2026-09-11T09:03:00Z",
    text: "We're a local SME doing edge AI inference on low-power hardware. Who should we be speaking to about becoming a supplier? We've tried the general enquiry form twice with no response.",
  },
  {
    id: "c4",
    channel: "Instagram",
    author: "@jiaying.codes",
    receivedAt: "2026-09-11T09:20:00Z",
    text: "Took part in BrainHack last year and it genuinely changed what I wanted to do after A levels. Are the mentors from the actual engineering teams?",
  },
  {
    id: "c5",
    channel: "Facebook",
    author: "K. Sivalingam",
    receivedAt: "2026-09-11T09:47:00Z",
    text: "Another expensive tech project while ordinary Singaporeans struggle with cost of living. How much is this one costing taxpayers?",
  },
  {
    id: "c6",
    channel: "LinkedIn",
    author: "Prof. Amelia Ng",
    receivedAt: "2026-09-11T10:02:00Z",
    text: "Brought my final-year students to your booth last week. Your engineers were extremely generous with their time - please pass on our thanks to them.",
  },
];

const state = new Map(
  SEED.map((c) => [c.id, { ...c, status: "pending", draft: null, finalText: null }])
);

export function listComments() {
  return [...state.values()];
}

export function getComment(id) {
  return state.get(id) ?? null;
}

export function updateComment(id, patch) {
  const current = state.get(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  state.set(id, next);
  return next;
}

export function resetComments() {
  for (const c of SEED) {
    state.set(c.id, { ...c, status: "pending", draft: null, finalText: null });
  }
  return listComments();
}
