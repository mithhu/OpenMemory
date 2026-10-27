import { buildHandoff, DEFAULT_DESTINATION } from "./protocol.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-openmemory",
      title: "Save to OpenMemory",
      contexts: ["page", "link", "selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-openmemory") return;
  const { destination = DEFAULT_DESTINATION } = await chrome.storage.local.get("destination");
  try {
    const url = info.linkUrl || info.pageUrl || tab?.url;
    const title = info.linkUrl ? "" : tab?.title || "";
    await chrome.tabs.create({
      url: buildHandoff(destination, { url, title, note: info.selectionText || "" }),
    });
  } catch {
    // Show the popup's editable destination/error UI instead of failing silently.
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});
