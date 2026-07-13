// YouTube Moments — content script
// Triggered via the browser's right-click menu ("Save moment"), shown when
// right-clicking the page below the video (see src/background.js). On
// trigger: reads current timestamp (no auto-pause), prompts for an optional
// note, and stores { url, timestamp, title, note, savedAt } in extension storage.

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

function getChannel() {
  const a = document.querySelector(
    "ytd-watch-metadata ytd-channel-name a, ytd-watch-metadata #channel-name a",
  );
  if (a && a.textContent.trim()) {
    return { name: a.textContent.trim(), url: a.href || "" };
  }
  return { name: "", url: "" };
}

async function saveCurrentMoment() {
  const video = getVideoEl();
  if (!video || !onWatchPage()) return;

  const timestamp = Math.floor(video.currentTime || 0);
  const videoId = getVideoId();
  const title = getTitle();
  const channel = getChannel();
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
    channelName: channel.name,
    channelUrl: channel.url,
    note: note.trim(),
    savedAt: Date.now(),
  };

  try {
    const { moments = [] } = await browser.storage.local.get("moments");
    moments.push(moment);
    await browser.storage.local.set({ moments });
    showToast("Moment saved");
  } catch (err) {
    console.error(LOG, "failed to save", err);
    window.alert("Couldn't save this moment. Please try again.");
  }
}

let toastTimer = null;
function showToast(text) {
  let toast = document.getElementById("ytm-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ytm-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("ytm-toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("ytm-toast--visible");
  }, 1600);
}

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "ytm-save-moment") {
    saveCurrentMoment();
  }
});
