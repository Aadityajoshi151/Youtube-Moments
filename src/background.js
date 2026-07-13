// No popup: clicking the toolbar icon opens the dedicated full page.
browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("src/moments/moments.html") });
});

// Right-click menu entry, shown on YouTube watch pages (the video player
// itself intercepts right-clicks with its own menu, so this only appears
// when right-clicking elsewhere on the page, e.g. below the video).
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "ytm-save-moment",
    title: "Save moment",
    contexts: ["page"],
    documentUrlPatterns: ["*://www.youtube.com/watch*"],
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ytm-save-moment" && tab && tab.id != null) {
    browser.tabs.sendMessage(tab.id, { type: "ytm-save-moment" });
  }
});

// Keyboard shortcut (default Alt+Shift+Space, user-remappable in about:addons).
// Handled by the browser itself, so it never fires while typing in a page
// input, and never collides with YouTube's own single-key shortcuts.
browser.commands.onCommand.addListener((command, tab) => {
  if (command === "save-moment" && tab && tab.id != null) {
    browser.tabs.sendMessage(tab.id, { type: "ytm-save-moment" });
  }
});
