/**
 * The v1 demo queue. There is no social-network integration in scope, so incoming
 * comments are seeded here.
 *
 * Arrival times are stored as an offset from now rather than a fixed date, so the
 * queue always reads as this morning's traffic however long after it is demoed.
 *
 * Worked state - which comments are drafted, approved or discarded - is persisted
 * to data/queue.json so a restart does not throw away an in-progress session and
 * pay to re-draft everything. The comments are always rebuilt from the seed and
 * the saved state merged on top, so arrival times stay relative to now. "Reset
 * demo queue" remains the explicit way to start over.
 */
import { readQueueState, writeQueueState } from "./store.js";

const SEED = [
  {
    id: "c1",
    channel: "Instagram",
    author: "@mara.k",
    minutesAgo: 205,
    text: "Ordered the Ethiopia single origin on Friday and it still hasn't shipped. Any update? Starting to regret it.",
  },
  {
    id: "c2",
    channel: "Instagram",
    author: "@deepbrew",
    minutesAgo: 176,
    text: "That new espresso blend is unreal. Third bag this month. Do you ever do 1kg sizes?",
  },
  {
    id: "c3",
    channel: "Facebook",
    author: "Tomas L.",
    minutesAgo: 154,
    text: "Is the decaf process chemical-free? My wife is pregnant and we're being careful.",
  },
  {
    id: "c4",
    channel: "LinkedIn",
    author: "Priya N.",
    minutesAgo: 137,
    text: "Do you supply to offices? We're a team of 30 and go through a lot of coffee.",
  },
  {
    id: "c5",
    channel: "Instagram",
    author: "@jo_makes",
    minutesAgo: 110,
    text: "Bag arrived split open and there was coffee through the whole box. Not great.",
  },
  {
    id: "c6",
    channel: "Facebook",
    author: "Ellen R.",
    minutesAgo: 95,
    text: "What grind should I ask for if I use a moka pot?",
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

/** A fresh queue with any saved work merged back on top of it. */
function restored() {
  const saved = readQueueState();
  return new Map(
    freshSeed().map((comment) => {
      const work = saved[comment.id];
      return [comment.id, work ? { ...comment, ...work } : comment];
    })
  );
}

const state = restored();

function persist() {
  writeQueueState(listComments());
}

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
  persist();
  return next;
}

export function resetComments() {
  state.clear();
  for (const c of freshSeed()) state.set(c.id, c);
  persist();
  return listComments();
}
