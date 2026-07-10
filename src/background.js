// No popup: clicking the toolbar icon opens the dedicated full page.
browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("src/moments/moments.html") });
});
