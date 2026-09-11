import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { readBrand, writeBrand, findBannedWords } from "./store.js";
import { listComments, getComment, updateComment, resetComments } from "./comments.js";
import { draftReply, draftPosts, hasCredentials, describeProvider } from "./llm.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(here, "..", "public")));

function fail(res, err) {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = !hasCredentials()
    ? "No API key configured. Add one to .env and restart."
    : err?.message || "Something went wrong.";
  res.status(status).json({ error: message });
}

app.get("/api/config", (_req, res) => {
  res.json({ hasCredentials: hasCredentials(), ...describeProvider() });
});

// --- Brand voice profile ---------------------------------------------------
app.get("/api/brand", (_req, res) => res.json(readBrand()));

app.put("/api/brand", (req, res) => {
  try {
    res.json(writeBrand(req.body ?? {}));
  } catch (err) {
    fail(res, err);
  }
});

// --- Comment reply queue ---------------------------------------------------
app.get("/api/comments", (_req, res) => res.json(listComments()));

app.post("/api/comments/reset", (_req, res) => res.json(resetComments()));

app.post("/api/comments/:id/draft", async (req, res) => {
  const comment = getComment(req.params.id);
  if (!comment) return res.status(404).json({ error: "No such comment." });
  try {
    const brand = readBrand();
    const { reply, rationale } = await draftReply({ brand, comment });
    const updated = updateComment(comment.id, {
      draft: { text: reply, rationale, banned: findBannedWords(reply, brand.bannedWords) },
      status: comment.status === "pending" ? "drafted" : comment.status,
    });
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/comments/:id/status", (req, res) => {
  const comment = getComment(req.params.id);
  if (!comment) return res.status(404).json({ error: "No such comment." });
  const { status, finalText } = req.body ?? {};
  if (!["pending", "drafted", "approved", "discarded"].includes(status)) {
    return res.status(400).json({ error: "Unknown status." });
  }
  res.json(updateComment(comment.id, { status, finalText: finalText ?? comment.finalText }));
});

// --- Post drafter ----------------------------------------------------------
app.post("/api/posts/draft", async (req, res) => {
  const topic = String(req.body?.topic ?? "").trim();
  if (!topic) return res.status(400).json({ error: "Type a topic first." });
  try {
    const brand = readBrand();
    const variations = await draftPosts({ brand, topic });
    res.json(
      variations.map((v) => ({ ...v, banned: findBannedWords(v.text, brand.bannedWords) }))
    );
  } catch (err) {
    fail(res, err);
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  const { provider, model, baseUrl } = describeProvider();
  console.log(`BrandVoice running at http://localhost:${port}`);
  console.log(`Provider: ${provider} | model: ${model} | base URL: ${baseUrl}`);
  if (!hasCredentials()) {
    console.log("No API key found - the UI loads, but drafting will error until you add one to .env.");
  }
});
