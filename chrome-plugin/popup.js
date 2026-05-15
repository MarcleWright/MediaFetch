const state = {
  images: [],
  projectName: "ProjectsA",
  metadata: null,
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

    const instagramNav = await resolveInstagramNavigationContext(tab);
    let maxIndexHint = 0;
    let probeError = "";
    try {
      maxIndexHint = await probeInstagramMaxIndex(tab, instagramNav);
    } catch (error) {
      probeError = error instanceof Error ? error.message : String(error);
    }

    let instagramSamples = { urls: [], indexes: [] };
    let instagramSamplingError = "";
    try {
      instagramSamples = await collectInstagramRenderedSamples(tab, instagramNav.resolvedPostPath, maxIndexHint);
    } catch (error) {
      instagramSamplingError = error instanceof Error ? error.message : String(error);
    }

    let weiboSamples = { urls: [], layerIds: [] };
    let weiboSamplingError = "";
    try {
      weiboSamples = await collectWeiboRenderedSamples(tab);
    } catch (error) {
      weiboSamplingError = error instanceof Error ? error.message : String(error);
    }

    const sampledUrls = [...instagramSamples.urls, ...weiboSamples.urls];
    const sampledIndexes = [...instagramSamples.indexes, ...weiboSamples.layerIds];
    const response = await requestExtraction(tab, maxIndexHint, sampledUrls, sampledIndexes);
    if (!response?.ok) {
      throw new Error(response?.error || "Extraction failed.");
    }

    state.images = (response.images || []).map((item) => ({
      ...item,
      selected: false,
    }));
    state.projectName = response.projectName || "ProjectsA";
    state.metadata = response.metadata || null;
    const debug = response.debug || {};
    debug.client = {
      version: "0.1.4",
      probeError,
      instagramSamplingError,
      weiboSamplingError,
      instagramResolvedPostPath: instagramNav.resolvedPostPath || "",
      instagramInitialCarouselCount: instagramNav.initialCarouselCount || 0,
      instagramContextSource: instagramNav.source || "",
      maxIndexHint,
      instagramSampleIndexes: instagramSamples.indexes || [],
      instagramSampledUrlCount: instagramSamples.urls?.length || 0,
      weiboSampleLayerIds: weiboSamples.layerIds || [],
      weiboSampledUrlCount: weiboSamples.urls?.length || 0,
    };
    renderDebugInfo(debug);

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

async function collectInstagramRenderedSamples(tab, resolvedPostPath = "", maxIndexHint = 0) {
  const url = String(tab?.url || "");
  if (!maxIndexHint || !/https:\/\/www\.instagram\.com\//i.test(url)) {
    return { urls: [], indexes: [] };
  }

  if (!resolvedPostPath || maxIndexHint <= 1) {
    return { urls: [], indexes: [] };
  }

  const tabId = tab?.id || 0;
  if (!tabId) {
    return { urls: [], indexes: [] };
  }

  const originalUrl = url;
  const restoreUrl = buildInstagramStableReturnUrl(originalUrl, resolvedPostPath);
  const indexes = buildInstagramProbeIndexes(maxIndexHint);
  const urls = new Set();

  try {
    for (const index of indexes) {
      const probeUrl = new URL(originalUrl);
      probeUrl.pathname = resolvedPostPath;
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
      await chrome.tabs.update(tabId, { url: restoreUrl });
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

async function collectWeiboRenderedSamples(tab) {
  const url = String(tab?.url || "");
  if (!/^https:\/\/weibo\.com\//i.test(url) || !tab?.id) {
    return { urls: [], layerIds: [] };
  }

  const hints = await requestWeiboLayerHints(tab);
  const layerIds = Array.from(new Set(hints?.layerIds || [])).slice(0, 12);
  if (!layerIds.length) {
    return { urls: [], layerIds: [] };
  }

  const originalUrl = url;
  const urls = new Set();

  try {
    for (const layerId of layerIds) {
      const probeUrl = new URL(originalUrl);
      probeUrl.searchParams.set("layerid", String(layerId));

      await chrome.tabs.update(tab.id, { url: probeUrl.toString() });
      await waitForTabComplete(tab.id, 15000);
      await delay(1200);

      const snapshot = await requestWeiboRenderedSnapshot(tab);
      (snapshot?.urls || []).forEach((item) => {
        if (item) urls.add(item);
      });
    }
  } catch {
    // Keep best-effort samples; final extraction still uses the current DOM.
  } finally {
    try {
      await chrome.tabs.update(tab.id, { url: originalUrl });
      await waitForTabComplete(tab.id, 15000);
      await delay(800);
    } catch {
      // Ignore restore failures; the extraction request below will surface connection issues.
    }
  }

  return {
    urls: Array.from(urls),
    layerIds,
  };
}

async function requestWeiboLayerHints(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:weibo-layer-hints" });
    return response?.ok ? response.hints : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:weibo-layer-hints" });
    return response?.ok ? response.hints : null;
  }
}

async function requestWeiboRenderedSnapshot(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:weibo-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:weibo-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  }
}

async function probeInstagramMaxIndex(tab, instagramNav = null) {
  const url = String(tab?.url || "");
  if (!/https:\/\/www\.instagram\.com\//i.test(url)) {
    return 0;
  }

  const nav = instagramNav || await resolveInstagramNavigationContext(tab);
  if (nav.initialCarouselCount === 1) {
    return 1;
  }

  const normalized = await normalizeInstagramProbeUrl(tab, nav.resolvedPostPath);
  if (!normalized) {
    return 0;
  }

  const tabId = tab?.id || 0;
  const originalUrl = String(tab.url || "");
  const restoreUrl = buildInstagramStableReturnUrl(originalUrl, nav.resolvedPostPath);
  let navigated = false;
  try {
    if (!tabId) {
      return 0;
    }

    await chrome.tabs.update(tabId, { url: normalized });
    navigated = true;
    await waitForTabComplete(tabId, 15000);
    const finalUrl = await waitForInstagramProbeUrl(tabId, 20, 10000);
    const finalParsed = new URL(finalUrl);
    const value = Number.parseInt(finalParsed.searchParams.get("img_index") || "", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  } finally {
    if (navigated && restoreUrl) {
      try {
        await chrome.tabs.update(tabId, { url: restoreUrl });
        await waitForTabComplete(tabId, 15000);
      } catch {
        // Ignore restore failures; the next extraction step will surface tab errors.
      }
    }
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

async function normalizeInstagramProbeUrl(tab, resolvedPostPath = "") {
  try {
    const rawUrl = String(tab?.url || "");
    const parsed = new URL(rawUrl);
    if (!/instagram\.com$/i.test(parsed.hostname)) {
      return "";
    }
    const postPath = resolvedPostPath || await resolveInstagramPostPath(tab);
    if (!postPath) {
      throw new Error("Instagram max index probe failed: missing username in post URL.");
    }
    parsed.pathname = postPath;
    parsed.search = "";
    parsed.searchParams.set("img_index", "20");
    return parsed.toString();
  } catch {
    throw new Error("Instagram max index probe failed: missing username in post URL.");
  }
}

async function resolveInstagramPostPath(tab) {
  const nav = await resolveInstagramNavigationContext(tab);
  if (nav.resolvedPostPath) {
    return nav.resolvedPostPath;
  }

  throw new Error("Instagram max index probe failed: missing username in post URL.");
}

async function resolveInstagramNavigationContext(tab) {
  const rawUrl = String(tab?.url || "");
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      resolvedPostPath: "",
      initialCarouselCount: 0,
      source: "",
      context: null,
    };
  }

  if (!/instagram\.com$/i.test(parsed.hostname)) {
    return {
      resolvedPostPath: "",
      initialCarouselCount: 0,
      source: "",
      context: null,
    };
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  const directMatch = path.match(/^\/([A-Za-z0-9._-]+)\/(p|reel)\/([^/]+)$/i);

  let context = null;
  try {
    context = await requestInstagramPostContext(tab);
  } catch {
    context = null;
  }

  if (directMatch) {
    return {
      resolvedPostPath: `/${directMatch[1]}/${directMatch[2].toLowerCase()}/${directMatch[3]}`,
      initialCarouselCount: Number(context?.initialCarouselCount || 0),
      source: "url",
      context,
    };
  }

  const shortMatch = path.match(/^\/(p|reel)\/([^/]+)$/i);
  if (!shortMatch) {
    return {
      resolvedPostPath: "",
      initialCarouselCount: Number(context?.initialCarouselCount || 0),
      source: context?.source || "",
      context,
    };
  }

  if (isTrustedInstagramPostContext(context)) {
    return {
      resolvedPostPath: context.postPath,
      initialCarouselCount: Number(context?.initialCarouselCount || 0),
      source: context.source || "",
      context,
    };
  }

  return {
    resolvedPostPath: "",
    initialCarouselCount: Number(context?.initialCarouselCount || 0),
    source: context?.source || "",
    context,
  };
}

function isTrustedInstagramPostContext(context) {
  if (!context?.postPath || !context?.username) {
    return false;
  }

  return [
    "url",
    "canonical",
    "og:url",
    "al:ios:user",
    "metaTitle",
    "header",
  ].includes(context.source);
}

function buildInstagramStableReturnUrl(rawUrl, resolvedPostPath = "") {
  try {
    const parsed = new URL(String(rawUrl || ""));
    if (!/instagram\.com$/i.test(parsed.hostname) || !resolvedPostPath) {
      return parsed.toString();
    }

    parsed.pathname = resolvedPostPath;
    return parsed.toString();
  } catch {
    return String(rawUrl || "");
  }
}

async function requestInstagramPostContext(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:instagram-post-context" });
    return response?.ok ? response.context : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:instagram-post-context" });
    return response?.ok ? response.context : null;
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
  const indexes = new Set();
  const groups = Math.floor(maxIndex / 4);

  for (let n = 1; n <= groups; n += 1) {
    const probe = 4 * n - 1;
    if (probe >= 1 && probe <= maxIndex) {
      indexes.add(probe);
    }
  }

  if (maxIndex > 0 && indexes.size === 0) {
    indexes.add(maxIndex);
  } else if (maxIndex > 0 && maxIndex % 4 !== 0) {
    indexes.add(maxIndex);
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
    const backgroundFolderEnabled = await setDownloadFolder(folder);
    const fileNames = selected.map((item, index) => {
      const extension = inferExtension(item.url, item.format);
      return `${String(index + 1).padStart(3, "0")}.${extension}`;
    });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await prepareDownloads(selected.map((item) => item.url), fileNames, tab?.url || "");

    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      const fileName = fileNames[i];
      if (isSinaimgUrl(item.url)) {
        await downloadFetchedBlob(item.url, backgroundFolderEnabled ? fileName : `${folder}/${fileName}`);
      } else {
        await downloadToChrome({
          url: item.url,
          filename: backgroundFolderEnabled ? fileName : `${folder}/${fileName}`,
          saveAs: false,
          conflictAction: "uniquify",
        });
      }
    }

    const metadata = buildDownloadMetadata(state.metadata, {
      folderName: folder,
      imageCount: selected.length,
      originalCount: selected.filter((item) => item.isOriginal).length,
      pluginVersion: "0.1.4",
    });
    await downloadTextFile(
      JSON.stringify(metadata, null, 2),
      `${folder}/metadata.json`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Download failed: ${message}`, true);
    return;
  }

  setStatus(`Download started for ${selected.length} image(s) in "${folder}".`);
}

function prepareDownloads(urls, fileNames, pageUrl) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "mediafetch:prepare-downloads", urls, fileNames, pageUrl }, () => {
      resolve();
    });
  });
}

function setDownloadFolder(folder) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "mediafetch:set-download-folder", folder }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve(false);
        return;
      }

      if (!response?.ok) {
        resolve(false);
        return;
      }

      resolve(true);
    });
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

async function downloadFetchedBlob(url, filename) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("Image response was empty.");
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    await downloadToChrome({
      url: objectUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify",
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
  }
}

async function downloadTextFile(text, filename) {
  await queueMetadataPath(filename);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    await downloadToChrome({
      url: objectUrl,
      filename: "__mediafetch_metadata__.json",
      saveAs: false,
      conflictAction: "overwrite",
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
  }
}

function queueMetadataPath(path) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "mediafetch:queue-metadata-path", path }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Failed to queue metadata path."));
        return;
      }

      resolve();
    });
  });
}

function buildDownloadMetadata(baseMetadata, options) {
  return {
    ...(baseMetadata || {}),
    folderName: options.folderName,
    downloadedAt: new Date().toISOString(),
    imageCount: Number(options.imageCount || 0),
    originalCount: Number(options.originalCount || 0),
    pluginVersion: options.pluginVersion || "0.1.4",
  };
}

function isSinaimgUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)sinaimg\.cn$/i.test(parsed.hostname);
  } catch {
    return false;
  }
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
