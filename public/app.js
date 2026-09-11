// BrandVoice v1 - human-in-the-loop. Nothing here publishes anywhere; the only
// export is the clipboard.

const $ = (sel) => document.querySelector(sel);
let brand = { bannedWords: [] };

/* ------------------------------------------------------------------ util */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back for plain http://
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function bannedIn(text) {
  const hay = String(text).toLowerCase();
  return (brand.bannedWords || []).filter((w) => hay.includes(String(w).toLowerCase()));
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* --------------------------------------------------------------- avatars */
// Whether the server reported a usable API key. Drives the draft placeholder:
// without a key nothing is ever requested, so "drafting" would be a lie.
let hasKey = false;

const CHANNEL_BADGE = { instagram: "\u{1F4F8}", facebook: "\u{1F4AC}", linkedin: "\u{1F4BC}", x: "\u2716\uFE0F", tiktok: "\u{1F3B5}" };

// Six pastel pairs. Picked by hashing the author so a person keeps their colour.
const AVATAR_GRADIENTS = [
  ["#ff9a9e", "#fecfef"],
  ["#a18cd1", "#fbc2eb"],
  ["#84fab0", "#8fd3f4"],
  ["#ffd26f", "#ff8f70"],
  ["#a6c1ee", "#86a8e7"],
  ["#f6d365", "#fda085"],
];

function hash(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/** Up to two initials from a handle ("@mara.k" -> MK) or a name ("Tomas L." -> TL). */
function initials(author) {
  const parts = String(author).replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
}

function avatar(author, channel) {
  const [from, to] = AVATAR_GRADIENTS[hash(author) % AVATAR_GRADIENTS.length];
  const badge = CHANNEL_BADGE[String(channel).toLowerCase()] || "\u{1F4AC}";
  return `<div class="avatar" style="background:linear-gradient(135deg,${from},${to})" title="${escape(author)}">${escape(initials(author))}<span class="badge" title="${escape(channel)}">${badge}</span></div>`;
}

/* ------------------------------------------------------------------ tabs */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `tab-${tab.dataset.tab}`));
  });
});

/* --------------------------------------------------------- reply queue */
function updateCount(comments) {
  const open = comments.filter((c) => c.status === "pending" || c.status === "drafted").length;
  const pill = $("#queue-count");
  const changed = pill.textContent !== String(open || "");
  pill.textContent = open || "";
  if (changed && open) {
    pill.classList.remove("is-bumped");
    void pill.offsetWidth; // restart the animation
    pill.classList.add("is-bumped");
  }
}

function renderFlag(card, words) {
  const existing = card.querySelector(".flag");
  if (existing) existing.remove();
  if (!words.length) return;
  card.querySelector(".draft").append(
    el(`<div class="flag">Banned word${words.length > 1 ? "s" : ""}: ${escape(words.join(", "))} - edit before copying.</div>`)
  );
}

function renderCard(comment) {
  const time = new Date(comment.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const card = el(`
    <article class="card" data-id="${comment.id}">
      <div class="meta">
        ${avatar(comment.author, comment.channel)}
        <div class="who">
          <span class="author">${escape(comment.author)}</span>
          <span class="sub">${escape(comment.channel)} <span class="dot">&middot;</span> ${time}</span>
        </div>
      </div>
      <p class="comment">${escape(comment.text)}</p>
      <div class="draft">
        <div class="draft-label"><span class="avatar is-bot">\u2728</span> Suggested reply</div>
      </div>
    </article>
  `);
  const draft = card.querySelector(".draft");

  if (comment.status === "approved" || comment.status === "discarded") {
    card.classList.add("is-done");
    draft.append(
      comment.status === "approved"
        ? el(`<p class="status"><span class="tick">\u2705</span> Approved &amp; copied</p>`)
        : el(`<p class="status" style="color:var(--muted);background:#f4f2f8">\u{1F5D1}\uFE0F Discarded</p>`)
    );
    if (comment.status === "approved" && comment.finalText) {
      draft.append(el(`<p class="rationale">${escape(comment.finalText)}</p>`));
    }
    return card;
  }

  if (!comment.draft) {
    draft.append(
      hasKey
        ? el(`<p class="thinking">Writing a reply <span class="dots"><i></i><i></i><i></i></span></p>`)
        : el(`<p class="nokey">\u{1F511} Add <code>ANTHROPIC_API_KEY</code> to .env and restart to draft this.</p>`)
    );
    return card;
  }

  const editor = el(`<textarea class="editor" rows="3"></textarea>`);
  editor.value = comment.draft.text;
  draft.append(editor);
  if (comment.draft.rationale) {
    draft.append(el(`<p class="rationale">${escape(comment.draft.rationale)}</p>`));
  }

  const row = el(`
    <div class="row">
      <button class="btn btn-primary" data-act="approve">Approve &amp; Copy</button>
      <button class="btn" data-act="copy">Copy to Clipboard</button>
      <button class="btn" data-act="regen">Regenerate</button>
      <span class="spacer"></span>
      <button class="btn btn-ghost" data-act="discard">Discard</button>
    </div>
  `);
  draft.append(row);

  editor.addEventListener("input", () => renderFlag(card, bannedIn(editor.value)));
  renderFlag(card, comment.draft.banned || []);

  row.addEventListener("click", async (event) => {
    const act = event.target.dataset.act;
    if (!act) return;
    const text = editor.value.trim();

    if (act === "copy" || act === "approve") {
      const words = bannedIn(text);
      if (words.length) return toast(`Remove banned word: ${words.join(", ")}`, true);
      if (!(await copy(text))) return toast("Could not access the clipboard.", true);
      if (act === "copy") return toast("Copied - paste it into the channel.");
      await api("POST", `/api/comments/${comment.id}/status`, { status: "approved", finalText: text });
      card.classList.add("is-cheered");
      toast("\u2728 Copied - paste it into the channel.");
      return loadQueue();
    }

    if (act === "discard") {
      await api("POST", `/api/comments/${comment.id}/status`, { status: "discarded" });
      return loadQueue();
    }

    if (act === "regen") {
      event.target.disabled = true;
      event.target.textContent = "Regenerating...";
      try {
        const updated = await api("POST", `/api/comments/${comment.id}/draft`);
        const fresh = renderCard(updated);
        fresh.style.setProperty("--i", card.style.getPropertyValue("--i") || 0);
        card.replaceWith(fresh);
      } catch (err) {
        toast(err.message, true);
        event.target.disabled = false;
        event.target.textContent = "Regenerate";
      }
    }
  });

  return card;
}

/** Give each card an index so the entrance animation staggers down the list. */
function stagger(cards) {
  cards.forEach((card, i) => card.style.setProperty("--i", i));
  return cards;
}

async function loadQueue({ autoDraft = false } = {}) {
  const comments = await api("GET", "/api/comments");
  $("#queue").replaceChildren(
    ...(comments.length
      ? stagger(comments.map(renderCard))
      : [el(`<p class="empty"><span class="big">\u{1F389}</span>Queue's all clear. Nice work!</p>`)])
  );
  updateCount(comments);

  if (!autoDraft) return;
  // Draft every pending comment up front, so the queue is review-ready on open.
  await Promise.all(
    comments
      .filter((c) => c.status === "pending" && !c.draft)
      .map(async (c) => {
        const card = () => $(`.card[data-id="${c.id}"]`);
        try {
          const updated = await api("POST", `/api/comments/${c.id}/draft`);
          if (card()) {
            const fresh = renderCard(updated);
            fresh.style.setProperty("--i", card().style.getPropertyValue("--i") || 0);
            card().replaceWith(fresh);
          }
        } catch (err) {
          if (card()) {
            card().querySelector(".draft").replaceChildren(el(`<div class="flag">${escape(err.message)}</div>`));
          }
        }
      })
  );
}

$("#reset-queue").addEventListener("click", async () => {
  await api("POST", "/api/comments/reset");
  // Gate on the key like boot does, so a keyless demo shows the same
  // "add a key" chip rather than six red server errors.
  await loadQueue({ autoDraft: hasKey });
});

/* --------------------------------------------------------- post drafter */
$("#topic-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const topic = $("#topic").value.trim();
  if (!topic) return;
  const button = event.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Generating...";
  $("#posts").replaceChildren(
    el(`<p class="empty"><span class="big">\u{1F4DD}</span>Writing 3 options <span class="dots"><i></i><i></i><i></i></span></p>`)
  );

  try {
    const variations = await api("POST", "/api/posts/draft", { topic });
    $("#posts").replaceChildren(...stagger(variations.map(renderPost)));
  } catch (err) {
    $("#posts").replaceChildren(el(`<div class="card"><div class="flag">${escape(err.message)}</div></div>`));
  } finally {
    button.disabled = false;
    button.textContent = "Generate 3 options";
  }
});

function renderPost(variation) {
  const card = el(`
    <article class="card">
      <div class="angle">\u2728 ${escape(variation.angle)}</div>
      <div class="draft" style="border:0;padding:0"></div>
    </article>
  `);
  const draft = card.querySelector(".draft");
  const editor = el(`<textarea class="editor" rows="4"></textarea>`);
  editor.value = variation.text;
  draft.append(editor);

  const row = el(`<div class="row"><button class="btn btn-primary">\u{1F4CB} Copy to Clipboard</button></div>`);
  draft.append(row);

  editor.addEventListener("input", () => renderFlag(card, bannedIn(editor.value)));
  renderFlag(card, variation.banned || []);

  row.querySelector("button").addEventListener("click", async () => {
    const words = bannedIn(editor.value);
    if (words.length) return toast(`Remove banned word: ${words.join(", ")}`, true);
    toast((await copy(editor.value.trim())) ? "Copied - paste it into the channel." : "Could not access the clipboard.", false);
  });

  return card;
}

/* ---------------------------------------------------------- brand voice */
function fillBrandForm(b) {
  $("#brandName").value = b.brandName || "";
  $("#guidelines").value = b.guidelines || "";
  $("#toneRules").value = b.toneRules || "";
  $("#bannedWords").value = (b.bannedWords || []).join("\n");
}

/**
 * Reverse onboarding: derive the profile from replies the manager already liked,
 * instead of asking them to describe their own tone from a blank textarea.
 * The result only fills the form — saving stays an explicit, separate action.
 */
async function inferVoice() {
  const button = $("#infer-btn");
  const text = $("#infer-samples").value.trim();
  const note = $("#infer-note");

  if (!text) return toast("Paste a few replies first.", true);
  if (!hasKey) return toast("Add ANTHROPIC_API_KEY to .env and restart to use this.", true);

  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Reading your replies...";
  note.hidden = true;

  try {
    const voice = await api("POST", "/api/brand/infer", { text });

    // Keep whatever the manager already typed if the samples did not name a brand.
    fillBrandForm({ ...voice, brandName: voice.brandName || $("#brandName").value });

    note.textContent = voice.observations;
    note.hidden = !voice.observations;
    $("#review-banner").hidden = false;

    for (const id of ["#brandName", "#guidelines", "#toneRules", "#bannedWords"]) {
      const field = $(id);
      field.classList.remove("is-filled");
      void field.offsetWidth; // restart the flash
      field.classList.add("is-filled");
    }

    $("#brand-form").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("\u{1FA84} Profile drafted - review it and save.");
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

$("#infer-btn").addEventListener("click", inferVoice);

$("#brand-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    brand = await api("PUT", "/api/brand", {
      brandName: $("#brandName").value,
      guidelines: $("#guidelines").value,
      toneRules: $("#toneRules").value,
      bannedWords: $("#bannedWords").value.split("\n").map((w) => w.trim()).filter(Boolean),
    });
    fillBrandForm(brand);
    $("#review-banner").hidden = true;
    toast("Brand voice saved - new drafts will use it.");
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------------------------------------------------------------- boot */
(async function start() {
  const [config, loaded] = await Promise.all([api("GET", "/api/config"), api("GET", "/api/brand")]);
  brand = loaded;
  fillBrandForm(brand);
  hasKey = config.hasCredentials;
  $("#key-warning").hidden = hasKey;
  await loadQueue({ autoDraft: hasKey });
})();
