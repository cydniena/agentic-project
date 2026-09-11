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
  $("#queue-count").textContent = open || "";
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
  const card = el(`
    <article class="card" data-id="${comment.id}">
      <div class="meta">
        <span class="chan">${escape(comment.channel)}</span>
        <span class="author">${escape(comment.author)}</span>
        <span>${new Date(comment.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p class="comment">${escape(comment.text)}</p>
      <div class="draft"><div class="draft-label">Suggested reply</div></div>
    </article>
  `);
  const draft = card.querySelector(".draft");

  if (comment.status === "approved" || comment.status === "discarded") {
    card.classList.add("is-done");
    draft.append(
      el(`<p class="status">${comment.status === "approved" ? "Approved &amp; copied" : "Discarded"}</p>`)
    );
    if (comment.status === "approved" && comment.finalText) {
      draft.append(el(`<p class="rationale">${escape(comment.finalText)}</p>`));
    }
    return card;
  }

  if (!comment.draft) {
    draft.append(el(`<p class="rationale">Drafting...</p>`));
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
      toast("Copied - paste it into the channel.");
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
        card.replaceWith(renderCard(updated));
      } catch (err) {
        toast(err.message, true);
        event.target.disabled = false;
        event.target.textContent = "Regenerate";
      }
    }
  });

  return card;
}

async function loadQueue({ autoDraft = false } = {}) {
  const comments = await api("GET", "/api/comments");
  $("#queue").replaceChildren(...comments.map(renderCard));
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
          if (card()) card().replaceWith(renderCard(updated));
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
  await loadQueue({ autoDraft: true });
});

/* --------------------------------------------------------- post drafter */
$("#topic-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const topic = $("#topic").value.trim();
  if (!topic) return;
  const button = event.target.querySelector("button");
  button.disabled = true;
  button.textContent = "Generating...";
  $("#posts").replaceChildren(el(`<p class="empty">Writing 3 options...</p>`));

  try {
    const variations = await api("POST", "/api/posts/draft", { topic });
    $("#posts").replaceChildren(...variations.map(renderPost));
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
      <div class="angle">${escape(variation.angle)}</div>
      <div class="draft" style="border:0;padding:0"></div>
    </article>
  `);
  const draft = card.querySelector(".draft");
  const editor = el(`<textarea class="editor" rows="4"></textarea>`);
  editor.value = variation.text;
  draft.append(editor);

  const row = el(`<div class="row"><button class="btn btn-primary">Copy to Clipboard</button></div>`);
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
  $("#key-warning").hidden = config.hasCredentials;
  await loadQueue({ autoDraft: config.hasCredentials });
})();
