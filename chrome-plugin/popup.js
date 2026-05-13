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
const MANUAL_FOLDER_STORAGE_KEY = "mediafetchManualFolderName";

folderNameInput.addEventListener("input", () => {
  state.folderTouched = true;
  chrome.storage.local.set({
    [MANUAL_FOLDER_STORAGE_KEY]: folderNameInput.value,
  });
});

folderNameInput.addEventListener("change", () => {
  state.folderTouched = true;
  chrome.storage.local.set({
    [MANUAL_FOLDER_STORAGE_KEY]: folderNameInput.value,
  });
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

initializePopup();

async function initializePopup() {
  await restoreManualFolderName();
  extractFromCurrentTab();
}

async function restoreManualFolderName() {
  try {
    const stored = await chrome.storage.local.get(MANUAL_FOLDER_STORAGE_KEY);
    const manualFolderName = String(stored?.[MANUAL_FOLDER_STORAGE_KEY] || "");
    if (manualFolderName.trim()) {
      folderNameInput.value = manualFolderName;
      state.folderTouched = true;
    }
  } catch {
    // Keep automatic folder naming if storage is unavailable.
  }
}

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

    const maxIndexHint = await probeInstagramMaxIndex(tab);
    const renderedSamples = await collectInstagramRenderedSamples(tab, maxIndexHint);
    const response = await requestExtraction(tab, maxIndexHint, renderedSamples.urls, renderedSamples.indexes);
    if (!response?.ok) {
      throw new Error(response?.error || "Extraction failed.");
    }

    state.images = (response.images || []).map((item) => ({
      ...item,
      selected: false,
    }));
    state.projectName = response.projectName || "ProjectsA";
    renderDebugInfo(response.debug || null);

    if (!state.folderTouched && !folderNameInput.value.trim()) {
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

async function requestExtraction(tab, maxIndexHint = 0, sampledUrls = [], sampledIndexes = []) {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:extract", maxIndexHint, sampledUrls, sampledIndexes });
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
      return await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:extract", maxIndexHint, sampledUrls, sampledIndexes });
    } catch {
      throw new Error("Could not connect to the page. Reload the tab once and try again.");
    }
  }
}

async function collectInstagramRenderedSamples(tab, maxIndexHint = 0) {
  const url = String(tab?.url || "");
  if (!maxIndexHint || !/https:\/\/www\.instagram\.com\//i.test(url)) {
    return { urls: [], indexes: [] };
  }

  const normalizedPath = normalizeInstagramRenderedSamplePath(url);
  if (!normalizedPath) {
    return { urls: [], indexes: [] };
  }

  const tabId = tab?.id || 0;
  if (!tabId) {
    return { urls: [], indexes: [] };
  }

  const originalUrl = url;
  const indexes = buildInstagramProbeIndexes(maxIndexHint);
  const urls = new Set();

  try {
    for (const index of indexes) {
      const probeUrl = new URL(originalUrl);
      probeUrl.pathname = normalizedPath;
      probeUrl.search = "";
      probeUrl.searchParams.set("img_index", String(index));

      await chrome.tabs.update(tabId, { url: probeUrl.toString() });
      await waitForTabComplete(tabId, 15000);
      await delay(1200);

      const snapshot = await requestInstagramRenderedSnapshot(tab);
      (snapshot?.urls || []).forEach((item) => {
        if (item) urls.add(item);
      });
    }
  } catch {
    // Keep best-effort samples; final extraction still has DOM and fetch fallbacks.
  } finally {
    try {
      await chrome.tabs.update(tabId, { url: originalUrl });
      await waitForTabComplete(tabId, 15000);
      await delay(800);
    } catch {
      // Ignore restore failures; the extraction request below will surface connection issues.
    }
  }

  return {
    urls: Array.from(urls),
    indexes,
  };
}

async function requestInstagramRenderedSnapshot(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:instagram-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:instagram-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  }
}

async function probeInstagramMaxIndex(tab) {
  const url = String(tab?.url || "");
  if (!/https:\/\/www\.instagram\.com\//i.test(url)) {
    return 0;
  }

  const normalized = normalizeInstagramProbeUrl(url);
  if (!normalized) {
    return 0;
  }

  try {
    const tabId = tab?.id || 0;
    if (!tabId) {
      return 0;
    }

    const originalUrl = String(tab.url || "");
    await chrome.tabs.update(tabId, { url: normalized });
    await waitForTabComplete(tabId, 15000);
    const finalUrl = await waitForInstagramProbeUrl(tabId, 20, 10000);
    const finalParsed = new URL(finalUrl);
    const value = Number.parseInt(finalParsed.searchParams.get("img_index") || "", 10);
    await chrome.tabs.update(tabId, { url: originalUrl });
    await waitForTabComplete(tabId, 15000);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

async function waitForInstagramProbeUrl(tabId, requestedIndex, timeoutMs) {
  const start = Date.now();
  let lastUrl = "";

  while (Date.now() - start < timeoutMs) {
    const updated = await chrome.tabs.get(tabId);
    lastUrl = String(updated.url || "");

    try {
      const parsed = new URL(lastUrl);
      const value = Number.parseInt(parsed.searchParams.get("img_index") || "", 10);
      if (Number.isFinite(value) && value > 0 && value !== requestedIndex) {
        return lastUrl;
      }
    } catch {}

    await delay(350);
  }

  return lastUrl;
}

function normalizeInstagramProbeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/instagram\.com$/i.test(parsed.hostname)) {
      return "";
    }
    parsed.search = "";
    parsed.searchParams.set("img_index", "20");
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeInstagramRenderedSamplePath(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/instagram\.com$/i.test(parsed.hostname)) {
      return "";
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return /^\/(?:[A-Za-z0-9._-]+\/)?(?:p|reel)\/[^/]+$/i.test(pathname) ? pathname : "";
  } catch {
    return "";
  }
}

function buildInstagramProbeIndexes(maxIndex) {
  if (maxIndex > 0 && maxIndex <= 4) {
    return [maxIndex];
  }

  const indexes = new Set();
  const groups = Math.floor(maxIndex / 4);

  for (let n = 1; n <= groups; n += 1) {
    const probe = 4 * n - 1;
    if (probe >= 1 && probe <= maxIndex) {
      indexes.add(probe);
    }
  }

  indexes.add(maxIndex);

  if (maxIndex >= 1 && indexes.size === 1) {
    indexes.add(1);
  }

  return Array.from(indexes).sort((a, b) => a - b);
}

function stripInstagramUsernameFromPathname(pathname) {
  return String(pathname || "").replace(/^\/[^/]+\/(?=(p|reel)\/)/i, "/");
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => finish(new Error("Probe timeout.")), timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "complete") {
        finish();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadSelected() {
  const selected = state.images.filter((item) => item.selected);
  if (!selected.length) return;

  const folder = sanitizeFolderName(folderNameInput.value.trim() || state.projectName || "ProjectsA");
  setStatus("Downloading...");

  try {
    await ensureDownloadFolder(folder);
    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      const extension = inferExtension(item.url, item.format);
      const fileName = `${String(i + 1).padStart(3, "0")}.${extension}`;
      await downloadToChrome({
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

async function ensureDownloadFolder(folder) {
  const marker = "data:text/plain;charset=utf-8,MediaFetch%20download%20folder";
  await downloadToChrome({
    url: marker,
    filename: `${folder}/_mediafetch_folder.txt`,
    saveAs: false,
    conflictAction: "overwrite",
  });
}

function downloadToChrome(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!downloadId) {
        reject(new Error("Chrome did not create a download item."));
        return;
      }

      resolve(downloadId);
    });
  });
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
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/^_+|_+$/g, "")
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
