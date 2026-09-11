/**
 * The v1 demo queue. There is no social-network integration in scope, so incoming
 * comments are seeded here. Status lives in memory for the life of the process.
 *
 * Arrival times are stored as an offset from now rather than a fixed date, so the
 * queue always reads as this morning's traffic however long after it is demoed.
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
    minutesAgo: 205,
    text: "I'm a software engineer with 8 years in fintech, looking to move into public sector work. Is DSTA open to mid-career switchers or is it mainly fresh grads and scholars?",
  },
  {
    id: "c2",
    channel: "Facebook",
    author: "Daniel Ong",
    minutesAgo: 176,
    text: "Saw the post about the new sensor work. What's the actual range on it, and is it deployed at the northern installations yet?",
  },
  {
    id: "c3",
    channel: "LinkedIn",
    author: "Serene Tan",
    minutesAgo: 154,
    text: "We're a local SME doing edge AI inference on low-power hardware. Who should we be speaking to about becoming a supplier? We've tried the general enquiry form twice with no response.",
  },
  {
    id: "c4",
    channel: "Instagram",
    author: "@jiaying.codes",
    minutesAgo: 137,
    text: "Took part in BrainHack last year and it genuinely changed what I wanted to do after A levels. Are the mentors from the actual engineering teams?",
  },
  {
    id: "c5",
    channel: "Facebook",
    author: "K. Sivalingam",
    minutesAgo: 110,
    text: "Another expensive tech project while ordinary Singaporeans struggle with cost of living. How much is this one costing taxpayers?",
  },
  {
    id: "c6",
    channel: "LinkedIn",
    author: "Prof. Amelia Ng",
    minutesAgo: 95,
    text: "Brought my final-year students to your booth last week. Your engineers were extremely generous with their time - please pass on our thanks to them.",
  },
];

/** A fresh, unworked copy of the queue with arrival times relative to now. */
function freshSeed() {
  const now = Date.now();
  return SEED.map(({ minutesAgo, ...comment }) => ({
    ...comment,
    receivedAt: new Date(now - minutesAgo * 60_000).toISOString(),
    status: "pending",
    draft: null,
    finalText: null,
  }));
}

const state = new Map(freshSeed().map((c) => [c.id, c]));

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
  for (const c of freshSeed()) state.set(c.id, c);
  return listComments();
}
