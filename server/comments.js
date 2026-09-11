/**
 * The v1 demo queue. There is no social-network integration in scope, so incoming
 * comments are seeded here. Status lives in memory for the life of the process.
 */
const SEED = [
  {
    id: "c1",
    channel: "Instagram",
    author: "@mara.k",
    receivedAt: "2026-09-11T08:12:00Z",
    text: "Ordered the Ethiopia single origin on Friday and it still hasn't shipped. Any update? Starting to regret it.",
  },
  {
    id: "c2",
    channel: "Instagram",
    author: "@deepbrew",
    receivedAt: "2026-09-11T08:41:00Z",
    text: "That new espresso blend is unreal. Third bag this month. Do you ever do 1kg sizes?",
  },
  {
    id: "c3",
    channel: "Facebook",
    author: "Tomas L.",
    receivedAt: "2026-09-11T09:03:00Z",
    text: "Is the decaf process chemical-free? My wife is pregnant and we're being careful.",
  },
  {
    id: "c4",
    channel: "LinkedIn",
    author: "Priya N.",
    receivedAt: "2026-09-11T09:20:00Z",
    text: "Do you supply to offices? We're a team of 30 and go through a lot of coffee.",
  },
  {
    id: "c5",
    channel: "Instagram",
    author: "@jo_makes",
    receivedAt: "2026-09-11T09:47:00Z",
    text: "Bag arrived split open and there was coffee through the whole box. Not great.",
  },
  {
    id: "c6",
    channel: "Facebook",
    author: "Ellen R.",
    receivedAt: "2026-09-11T10:02:00Z",
    text: "What grind should I ask for if I use a moka pot?",
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
