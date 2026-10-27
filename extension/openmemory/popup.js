import { buildHandoff, destinationOrigin, DEFAULT_DESTINATION } from "./protocol.js";
const field = (id) => document.getElementById(id);
const error = field("error");
const showError = (message) => {
  error.textContent = message;
  error.hidden = false;
};
try {
  const { destination = DEFAULT_DESTINATION } = await chrome.storage.local.get("destination");
  field("destination").value = destination;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith("http")) {
    field("url").value = tab.url;
    field("title").value = (tab.title || "").slice(0, 300);
  } else showError("Open a web page to save it, or enter its link below.");
} catch {
  showError("Could not read this tab. You can enter the link below.");
}
field("capture").addEventListener("submit", async (event) => {
  event.preventDefault();
  field("save").disabled = true;
  error.hidden = true;
  try {
    const destination = destinationOrigin(field("destination").value.trim());
    const url = buildHandoff(destination, {
      url: field("url").value.trim(),
      title: field("title").value,
      note: field("note").value,
    });
    await chrome.storage.local.set({ destination });
    await chrome.tabs.create({ url });
    window.close();
  } catch (e) {
    showError(e.message || "Could not open OpenMemory. Please try again.");
  } finally {
    field("save").disabled = false;
  }
});
