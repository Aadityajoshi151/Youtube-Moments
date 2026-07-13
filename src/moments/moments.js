// YouTube Moments — saved-moments page logic

const listEl = document.getElementById("list");
const pagerEl = document.getElementById("pager");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");
const exportEl = document.getElementById("export");
const importEl = document.getElementById("import");
const importFileEl = document.getElementById("importFile");
const statusEl = document.getElementById("status");

const PAGE_SIZE = 15;

let allMoments = [];
let query = "";
let editingId = null;
let currentPage = 1;

// ---------- helpers ----------
function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDate(ms) {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

// Build an inline SVG that references a symbol from the sprite in the page.
function makeIcon(name, extraClass) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "icon" + (extraClass ? " " + extraClass : ""));
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", "#i-" + name);
  svg.appendChild(use);
  return svg;
}

async function loadMoments() {
  const { moments = [] } = await browser.storage.local.get("moments");
  allMoments = moments;
  render();
}

async function persist() {
  await browser.storage.local.set({ moments: allMoments });
}

function filtered() {
  const q = query.trim().toLowerCase();
  const items = q
    ? allMoments.filter(
        (m) =>
          (m.note || "").toLowerCase().includes(q) ||
          (m.title || "").toLowerCase().includes(q)
      )
    : allMoments.slice();
  items.sort((a, b) => b.savedAt - a.savedAt);
  return items;
}

// ---------- rendering ----------
function render() {
  const items = filtered();
  const total = allMoments.length;

  countEl.textContent = total === 0 ? "No moments yet" : `${total} saved`;

  listEl.innerHTML = "";

  if (total === 0) {
    pagerEl.hidden = true;
    showEmpty(
      "No moments yet",
      'On any YouTube video, right-click below the player and choose <code>Save moment</code>. Your saved points show up here.'
    );
    return;
  }
  if (items.length === 0) {
    pagerEl.hidden = true;
    showEmpty("No matches", "Nothing matches your search. Try different words.");
    return;
  }

  emptyEl.hidden = true;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  const frag = document.createDocumentFragment();
  for (const m of pageItems) frag.appendChild(renderItem(m));
  listEl.appendChild(frag);

  renderPager(totalPages);
}

function showEmpty(title, html) {
  emptyEl.hidden = false;
  emptyEl.innerHTML = `<h2>${title}</h2><p>${html}</p>`;
}

function videoIdOf(m) {
  if (m.videoId) return m.videoId;
  try {
    return new URL(m.url).searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

// Validate + normalize one entry from an imported file. Returns a clean moment
// or null if it lacks the essentials (a URL and a numeric timestamp).
function normalizeMoment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = typeof raw.url === "string" ? raw.url : "";
  const timestamp = Number(raw.timestamp);
  if (!url || !Number.isFinite(timestamp)) return null;

  let videoId = typeof raw.videoId === "string" ? raw.videoId : "";
  if (!videoId) {
    try {
      videoId = new URL(url).searchParams.get("v") || "";
    } catch {
      videoId = "";
    }
  }

  const savedAt = Number.isFinite(Number(raw.savedAt)) ? Number(raw.savedAt) : Date.now();

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    videoId,
    url,
    timestamp: Math.floor(timestamp),
    title: typeof raw.title === "string" ? raw.title : "",
    channelName: typeof raw.channelName === "string" ? raw.channelName : "",
    channelUrl: typeof raw.channelUrl === "string" ? raw.channelUrl : "",
    note: typeof raw.note === "string" ? raw.note : "",
    savedAt,
  };
}

// Clickable channel byline. Omitted entirely for moments saved before this
// field existed (or imported without it).
function renderChannel(m) {
  if (!m.channelName) return null;
  return el("a", {
    className: "channel",
    href: m.channelUrl || m.url,
    target: "_blank",
    rel: "noopener",
    textContent: m.channelName,
  });
}

function shareMessage(m) {
  return `Found this moment worth sharing. Click the link and it'll jump right to that spot in the video.\n${m.url}`;
}

// timecode chip — links straight to the video at the saved second.
// `overlay` styles it as a badge sitting on top of the thumbnail.
function makeTimecode(m, overlay) {
  return el("a", {
    className: "timecode" + (overlay ? " timecode--overlay" : ""),
    href: m.url,
    target: "_blank",
    rel: "noopener",
    textContent: formatTime(m.timestamp),
    title: "Open at this moment",
  });
}

// Left column: thumbnail (from YouTube's CDN, derived from the video id) with
// the timecode overlaid. If the image can't load — deleted/private video, which
// 404s or returns YouTube's 120px gray placeholder — the thumbnail is dropped
// and we fall back to the standalone timecode chip.
function renderMedia(m) {
  const media = el("div", { className: "media" });
  const vid = videoIdOf(m);

  if (!vid) {
    media.append(makeTimecode(m, false));
    return media;
  }

  const thumbLink = el("a", {
    className: "thumb",
    href: m.url,
    target: "_blank",
    rel: "noopener",
  });
  thumbLink.setAttribute("aria-label", "Open at this moment");

  const img = el("img", { className: "thumb__img", loading: "lazy", alt: "" });
  img.src = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
  thumbLink.append(img);

  media.append(thumbLink, makeTimecode(m, true));

  const dropThumbnail = () => {
    media.innerHTML = "";
    media.append(makeTimecode(m, false));
  };
  img.addEventListener("error", dropThumbnail);
  img.addEventListener("load", () => {
    // Unavailable videos come back as a 120px-wide gray placeholder.
    if (img.naturalWidth && img.naturalWidth <= 120) dropThumbnail();
  });

  return media;
}

function renderItem(m) {
  const li = el("li", { className: "item" });
  li.dataset.id = m.id;

  const media = renderMedia(m);
  const body = el("div", { className: "body" });

  if (editingId === m.id) {
    // show which video this is, then edit its label
    body.append(
      el("a", {
        className: "videotitle",
        href: m.url,
        target: "_blank",
        rel: "noopener",
        textContent: m.title || "(untitled video)",
      })
    );
    const channelLink = renderChannel(m);
    if (channelLink) body.append(channelLink);
    body.append(renderEditor(m));
  } else {
    const hasNote = !!(m.note && m.note.trim());
    // headline = label (note); falls back to the video title when empty
    const headline = el("a", {
      className: "label",
      href: m.url,
      target: "_blank",
      rel: "noopener",
      textContent: hasNote ? m.note : m.title || "(untitled video)",
      title: "Open at this moment",
    });
    body.append(headline);

    // video title sits beneath the label
    if (hasNote) {
      body.append(
        el("a", {
          className: "videotitle",
          href: m.url,
          target: "_blank",
          rel: "noopener",
          textContent: m.title || "(untitled video)",
        })
      );
    }

    const channelLink = renderChannel(m);
    if (channelLink) body.append(channelLink);

    const meta = el("div", { className: "meta" }, [
      el("span", { className: "date", textContent: formatDate(m.savedAt) }),
      makeAction("copy", m.id, "Copy link", "copy"),
      makeAction("share", m.id, "Share", "share"),
      makeAction("edit", m.id, hasNote ? "Edit label" : "Add label", hasNote ? "edit" : "add"),
      makeAction("delete", m.id, "Delete", "delete", true),
    ]);
    body.append(meta);
  }

  li.append(media, body);
  return li;
}

function makeAction(action, id, label, iconName, danger = false) {
  const btn = el("button", {
    className: "link-btn" + (danger ? " danger" : ""),
    type: "button",
  });
  btn.dataset.action = action;
  btn.dataset.id = id;
  btn.append(
    makeIcon(iconName),
    el("span", { className: "link-btn__label", textContent: label })
  );
  return btn;
}

function renderEditor(m) {
  const wrap = el("div", { className: "editor" });
  const ta = el("textarea", { value: m.note || "" });
  ta.setAttribute("placeholder", "Write a label for this moment…");
  ta.dataset.editor = m.id;

  const save = el("button", {
    className: "btn-sm primary",
    type: "button",
    textContent: "Save label",
  });
  save.dataset.action = "save";
  save.dataset.id = m.id;

  const cancel = el("button", {
    className: "btn-sm",
    type: "button",
    textContent: "Cancel",
  });
  cancel.dataset.action = "cancel";
  cancel.dataset.id = m.id;

  wrap.append(ta, el("div", { className: "editor__actions" }, [save, cancel]));
  setTimeout(() => ta.focus(), 0);
  return wrap;
}

// ---------- pagination ----------
function pageWindow(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

function pagerButton(label, { disabled = false, current = false, onClick }) {
  const b = el("button", {
    className: "pager__btn" + (current ? " pager__btn--current" : ""),
    type: "button",
    textContent: label,
  });
  if (disabled) b.disabled = true;
  if (current) b.setAttribute("aria-current", "page");
  if (onClick && !disabled && !current) b.addEventListener("click", onClick);
  return b;
}

function renderPager(totalPages) {
  pagerEl.innerHTML = "";
  if (totalPages <= 1) {
    pagerEl.hidden = true;
    return;
  }
  pagerEl.hidden = false;

  pagerEl.append(
    pagerButton("‹ Prev", {
      disabled: currentPage === 1,
      onClick: () => goTo(currentPage - 1),
    })
  );

  for (const p of pageWindow(currentPage, totalPages)) {
    if (p === "…") {
      pagerEl.append(el("span", { className: "pager__gap", textContent: "…" }));
    } else {
      pagerEl.append(
        pagerButton(String(p), {
          current: p === currentPage,
          onClick: () => goTo(p),
        })
      );
    }
  }

  pagerEl.append(
    pagerButton("Next ›", {
      disabled: currentPage === totalPages,
      onClick: () => goTo(currentPage + 1),
    })
  );
}

function goTo(page) {
  currentPage = page;
  render();
  window.scrollTo({ top: 0 });
}

// ---------- actions ----------
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === "edit") {
    editingId = id;
    render();
  } else if (action === "cancel") {
    editingId = null;
    render();
  } else if (action === "save") {
    const ta = listEl.querySelector(`textarea[data-editor="${id}"]`);
    const value = ta ? ta.value.trim() : "";
    const m = allMoments.find((x) => x.id === id);
    if (m) m.note = value;
    editingId = null;
    await persist();
    render();
  } else if (action === "copy") {
    const m = allMoments.find((x) => x.id === id);
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.url);
      const label = btn.querySelector(".link-btn__label");
      const original = label ? label.textContent : "";
      if (label) label.textContent = "Copied";
      btn.classList.add("copied");
      setTimeout(() => {
        if (label) label.textContent = original;
        btn.classList.remove("copied");
      }, 1200);
    } catch (err) {
      console.error("Copy failed", err);
      window.prompt("Copy this link:", m.url);
    }
  } else if (action === "share") {
    const m = allMoments.find((x) => x.id === id);
    if (!m) return;
    const text = shareMessage(m);
    try {
      await navigator.clipboard.writeText(text);
      const label = btn.querySelector(".link-btn__label");
      const original = label ? label.textContent : "";
      if (label) label.textContent = "Copied";
      btn.classList.add("copied");
      setTimeout(() => {
        if (label) label.textContent = original;
        btn.classList.remove("copied");
      }, 1200);
    } catch (err) {
      console.error("Copy failed", err);
      window.prompt("Copy this message:", text);
    }
  } else if (action === "delete") {
    const m = allMoments.find((x) => x.id === id);
    const label = m && m.note ? `“${m.note}”` : m && m.title ? `“${m.title}”` : "this moment";
    if (!window.confirm(`Delete ${label}?`)) return;
    allMoments = allMoments.filter((x) => x.id !== id);
    if (editingId === id) editingId = null;
    await persist();
    render();
  }
});

searchEl.addEventListener("input", () => {
  query = searchEl.value;
  currentPage = 1;
  render();
});

let statusTimer = null;
function showStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " status--" + kind : "");
  statusEl.hidden = false;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.hidden = true;
  }, 6000);
}

exportEl.addEventListener("click", () => {
  const data = JSON.stringify(allMoments, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `youtube-moments-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Import merges by id: existing moments are kept, new ones added, and any entry
// whose id is already present is skipped — so re-importing a file is a no-op.
importEl.addEventListener("click", () => importFileEl.click());

importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files && importFileEl.files[0];
  importFileEl.value = ""; // let the same file be picked again later
  if (!file) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showStatus("Couldn't read that file — is it valid JSON?", "err");
    return;
  }
  if (!Array.isArray(parsed)) {
    showStatus("That file isn't a Moments export (expected a list).", "err");
    return;
  }
  if (parsed.length === 0) {
    showStatus("No moments found in that file.", "err");
    return;
  }

  const existing = new Set(allMoments.map((m) => m.id));
  let added = 0;
  let duplicates = 0;
  let invalid = 0;

  for (const raw of parsed) {
    const moment = normalizeMoment(raw);
    if (!moment) {
      invalid++;
      continue;
    }
    if (existing.has(moment.id)) {
      duplicates++;
      continue;
    }
    existing.add(moment.id);
    allMoments.push(moment);
    added++;
  }

  if (added > 0) {
    currentPage = 1;
    await persist();
    render();
  }

  const parts = [`Imported ${added}`];
  if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped`);
  if (invalid) parts.push(`${invalid} invalid skipped`);
  showStatus(parts.join(" · "), added > 0 ? "ok" : "err");
});

// keep the page in sync if a moment is saved while it's open
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.moments) {
    allMoments = changes.moments.newValue || [];
    render();
  }
});

loadMoments();
