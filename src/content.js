// YouTube Moments — content script
// Injects a "Save moment" button into the action row below the video.
// On click: reads current timestamp (no auto-pause), prompts for an optional
// note, and stores { url, timestamp, title, note, savedAt } in extension storage.

const BTN_ID = "ytm-save-btn";
const LOG = "[YT Moments]";

function onWatchPage() {
  return (
    location.pathname === "/watch" &&
    new URLSearchParams(location.search).has("v")
  );
}

function getVideoId() {
  return new URLSearchParams(location.search).get("v");
}

function getVideoEl() {
  return (
    document.querySelector("video.html5-main-video") ||
    document.querySelector("video")
  );
}

function getTitle() {
  const el = document.querySelector(
    "h1.ytd-watch-metadata yt-formatted-string, h1.ytd-watch-metadata",
  );
  if (el && el.textContent.trim()) return el.textContent.trim();
  return document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
}

// Prioritized candidate containers. We prefer the visible one inside the
// watch metadata block (avoids hidden duplicate #top-level-buttons-computed
// nodes that YouTube keeps elsewhere on the page).
const ROW_SELECTORS = [
  "ytd-watch-metadata #top-level-buttons-computed",
  "ytd-watch-metadata #actions #menu #top-level-buttons-computed",
  "ytd-watch-metadata #actions-inner #menu",
  "#top-level-buttons-computed",
];

function isVisible(node) {
  return !!node && node.offsetParent !== null;
}

function findActionRow() {
  for (const sel of ROW_SELECTORS) {
    for (const node of document.querySelectorAll(sel)) {
      if (isVisible(node)) return node;
    }
  }
  return null;
}

function findFallbackMount() {
  return (
    document.querySelector("ytd-watch-metadata #above-the-fold") ||
    document.querySelector("ytd-watch-metadata") ||
    null
  );
}

function makeButton() {
  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.type = "button";
  btn.className = "ytm-save-btn";
  btn.setAttribute("aria-label", "Save this moment");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path fill="#FFB84D" d="M8 5v14l11-7z"/></svg>' +
    '<span class="ytm-save-btn__label">Save moment</span>';
  btn.addEventListener("click", handleSaveClick);
  return btn;
}

// Returns true if a button is present (already there or just added).
function ensureButton() {
  if (!onWatchPage()) return false;

  const existing = document.getElementById(BTN_ID);
  if (existing && document.contains(existing)) return true;

  const row = findActionRow();
  if (row) {
    row.appendChild(makeButton());
    return true;
  }
  return false;
}

// Safety net: if the action row genuinely can't be found, mount just below the
// title so a button always appears. Only used after the normal attempts fail.
function injectFallback() {
  if (document.getElementById(BTN_ID)) return;
  const mount = findFallbackMount();
  if (!mount) {
    console.warn(LOG, "no mount point found — YouTube layout may have changed");
    return;
  }
  const wrap = document.createElement("div");
  wrap.style.margin = "8px 0 0";
  wrap.appendChild(makeButton());
  mount.prepend(wrap);
}

async function handleSaveClick(e) {
  const btn = e.currentTarget;
  const video = getVideoEl();
  if (!video || !onWatchPage()) return;

  const timestamp = Math.floor(video.currentTime || 0);
  const videoId = getVideoId();
  const title = getTitle();
  const url = `https://www.youtube.com/watch?v=${videoId}&t=${timestamp}s`;

  // Optional note. Cancel (null) aborts the whole save.
  const note = window.prompt("Add a note for this moment (optional):", "");
  if (note === null) return;

  const moment = {
    id:
      (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now() + Math.random()),
    videoId,
    url,
    timestamp,
    title,
    note: note.trim(),
    savedAt: Date.now(),
  };

  try {
    const { moments = [] } = await browser.storage.local.get("moments");
    moments.push(moment);
    await browser.storage.local.set({ moments });
    flashSaved(btn);
  } catch (err) {
    console.error(LOG, "failed to save", err);
    window.alert("Couldn't save this moment. Please try again.");
  }
}

function flashSaved(btn) {
  const label = btn.querySelector(".ytm-save-btn__label");
  const original = label ? label.textContent : null;
  btn.classList.add("ytm-save-btn--done");
  if (label) label.textContent = "Saved";
  setTimeout(() => {
    btn.classList.remove("ytm-save-btn--done");
    if (label && original !== null) label.textContent = original;
  }, 1300);
}

// ---- Injection lifecycle: poll early, observe for churn, handle SPA nav ----
let attempts = 0;
const MAX_ATTEMPTS = 40; // ~20s at 500ms intervals

const poll = setInterval(() => {
  attempts++;
  if (ensureButton()) {
    clearInterval(poll);
    return;
  }
  if (attempts >= MAX_ATTEMPTS) {
    clearInterval(poll);
    injectFallback();
  }
}, 500);

// Re-add the button if YouTube re-renders and removes it.
const observer = new MutationObserver(() => ensureButton());
observer.observe(document.documentElement, { childList: true, subtree: true });

// YouTube navigates without full reloads; re-run on each navigation.
window.addEventListener("yt-navigate-finish", () => {
  attempts = 0;
  ensureButton();
});
