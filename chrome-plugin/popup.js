const state = {
  images: [],
  projectName: "ProjectsA",
  folderTouched: false,
};

const refreshBtn = document.getElementById("refreshBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const clearBtn = document.getElementById("clearBtn");
const selectOriginalBtn = document.getElementById("selectOriginalBtn");
const downloadBtn = document.getElementById("downloadBtn");
const folderNameInput = document.getElementById("folderName");
const selectionStatus = document.getElementById("selectionStatus");
const statusEl = document.getElementById("status");
const debugInfoEl = document.getElementById("debugInfo");
const copyDebugBtn = document.getElementById("copyDebugBtn");
const resultsEl = document.getElementById("results");

folderNameInput.addEventListener("input", () => {
  state.folderTouched = true;
});

refreshBtn.addEventListener("click", extractFromCurrentTab);
selectAllBtn.addEventListener("click", () => {
  state.images.forEach((item) => {
    item.selected = true;
  });
  render();
});
clearBtn.addEventListener("click", () => {
  state.images.forEach((item) => {
    item.selected = false;
  });
  render();
});
selectOriginalBtn.addEventListener("click", () => {
  state.images.forEach((item) => {
    item.selected = !!item.isOriginal;
  });
  render();
});
downloadBtn.addEventListener("click", downloadSelected);
copyDebugBtn.addEventListener("click", copyDebugInfo);

extractFromCurrentTab();

async function extractFromCurrentTab() {
  try {
    setStatus("Extracting images...");
    renderDebugInfo({
      phase: "query-tab",
    });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    renderDebugInfo({
      phase: "request-extraction",
      tabId: tab.id,
      tabUrl: tab.url || "",
      version: "0.1.4",
    });

    const response = await requestExtraction(tab);
    if (!response?.ok) {
      throw new Error(response?.error || "Extraction failed.");
    }

    state.images = (response.images || []).map((item) => ({
      ...item,
      selected: false,
    }));
    state.projectName = response.projectName || "ProjectsA";
    renderDebugInfo(response.debug || null);

    if (!state.folderTouched || !folderNameInput.value.trim() || folderNameInput.value.trim() === "ProjectsA") {
      folderNameInput.value = state.projectName;
    }

    setStatus(state.images.length ? `Found ${state.images.length} image(s).` : "No images found on the current page.");
    render();
  } catch (error) {
    state.images = [];
    renderDebugInfo({
      phase: "error",
      version: "0.1.4",
      error: error instanceof Error ? error.message : String(error),
    });
    render();
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function requestExtraction(tab) {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:extract" });
  } catch (error) {
    const canInject = /^https?:/i.test(tab.url || "");
    if (!canInject) {
      throw new Error("This page is not supported. Open a normal website tab and try again.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    try {
      return await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:extract" });
    } catch {
      throw new Error("Could not connect to the page. Reload the tab once and try again.");
    }
  }
}

async function downloadSelected() {
  const selected = state.images.filter((item) => item.selected);
  if (!selected.length) return;

  const folder = sanitizeFolderName(folderNameInput.value.trim() || state.projectName || "ProjectsA");
  setStatus("Downloading...");

  try {
    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      const extension = inferExtension(item.url, item.format);
      const fileName = `${String(i + 1).padStart(3, "0")}.${extension}`;
      await chrome.downloads.download({
        url: item.url,
        filename: `${folder}/${fileName}`,
        saveAs: false,
        conflictAction: "uniquify",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Download failed: ${message}`, true);
    return;
  }

  setStatus(`Download started for ${selected.length} image(s) in "${folder}".`);
}

function render() {
  resultsEl.innerHTML = "";

  const selectedCount = state.images.filter((item) => item.selected).length;
  const originalCount = state.images.filter((item) => item.isOriginal).length;
  selectionStatus.textContent = `Selected: ${selectedCount} / ${state.images.length} | Original: ${originalCount}`;

  selectAllBtn.disabled = state.images.length === 0;
  clearBtn.disabled = state.images.length === 0;
  selectOriginalBtn.disabled = originalCount === 0;
  downloadBtn.disabled = selectedCount === 0;

  for (const [index, item] of state.images.entries()) {
    const card = document.createElement("article");
    card.className = "card";
    if (item.selected) card.classList.add("selected");

    if (item.isOriginal) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Original";
      card.appendChild(badge);
    }

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = item.thumbnail || item.url;
    img.alt = `image ${index + 1}`;
    thumb.appendChild(img);
    card.appendChild(thumb);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(createPill(item.format || "Unknown"));
    meta.appendChild(createPill(item.resolution || "Unknown"));
    meta.appendChild(createPill(item.size || "Unknown"));
    card.appendChild(meta);

    card.addEventListener("click", () => {
      item.selected = !item.selected;
      render();
    });

    resultsEl.appendChild(card);
  }
}

function createPill(value) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = value;
  return pill;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderDebugInfo(debug) {
  if (!debug) {
    debugInfoEl.textContent = "No debug data yet.";
    return;
  }

  debugInfoEl.textContent = JSON.stringify(debug, null, 2);
}

async function copyDebugInfo() {
  const text = debugInfoEl.textContent || "";
  if (!text.trim()) return;

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Debug copied.");
  } catch (error) {
    setStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

function sanitizeFolderName(value) {
  return String(value || "ProjectsA")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 64) || "ProjectsA";
}

function inferExtension(url, format) {
  if (format === "PNG") return "png";
  if (format === "JPEG") return "jpg";
  if (format === "GIF") return "gif";
  if (format === "WEBP") return "webp";
  if (format === "SVG") return "svg";
  if (format === "AVIF") return "avif";

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}
