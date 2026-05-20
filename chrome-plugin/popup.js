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
const clipboardUrlInput = document.getElementById("clipboardUrlInput");
const clipboardUrlEl = document.getElementById("clipboardUrl");
const clipboardDownloadBtn = document.getElementById("clipboardDownloadBtn");
const folderNameInput = document.getElementById("folderName");
const selectionStatus = document.getElementById("selectionStatus");
const statusEl = document.getElementById("status");
const lineageBoxEl = document.getElementById("lineageBox");
const lineageEnabledInput = document.getElementById("lineageEnabled");
const lineageRefreshBtn = document.getElementById("lineageRefreshBtn");
const lineageProbeBtn = document.getElementById("lineageProbeBtn");
const lineageFolderSelect = document.getElementById("lineageFolderSelect");
const lineageSaveSelectedBtn = document.getElementById("lineageSaveSelectedBtn");
const lineageSaveOriginalBtn = document.getElementById("lineageSaveOriginalBtn");
const lineageStatusEl = document.getElementById("lineageStatus");
const lineageDebugBoxEl = document.getElementById("lineageDebugBox");
const lineageDebugInfoEl = document.getElementById("lineageDebugInfo");
const debugBoxEl = document.getElementById("debugBox");
const toggleDebugBtn = document.getElementById("toggleDebugBtn");
const debugInfoEl = document.getElementById("debugInfo");
const copyDebugBtn = document.getElementById("copyDebugBtn");
const resultsEl = document.getElementById("results");
let clipboardLinkUrl = "";
const features = globalThis.MEDIAFETCH_FEATURES || {};
const lineageFeatureEnabled = !!features.lineageIntegration;
const defaultLineageBaseUrl = normalizeLineageBaseUrl(features.defaultLineageBaseUrl || "http://127.0.0.1:17321");
const defaultLineageToken = String(features.defaultLineageToken || "").trim();

folderNameInput.addEventListener("input", () => {
  state.folderTouched = true;
});

folderNameInput.addEventListener("change", () => {
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
clipboardDownloadBtn.addEventListener("click", downloadClipboardWeiboOriginal);
clipboardUrlInput.addEventListener("input", () => {
  updateClipboardLinkState(clipboardUrlInput.value);
});
copyDebugBtn.addEventListener("click", copyDebugInfo);
toggleDebugBtn.addEventListener("click", toggleDebugSection);
lineageEnabledInput?.addEventListener("change", saveLineageSettings);
lineageFolderSelect?.addEventListener("change", saveLineageSettings);
lineageRefreshBtn?.addEventListener("click", refreshLineageFolders);
lineageProbeBtn?.addEventListener("click", probeLineageConnection);
lineageSaveSelectedBtn?.addEventListener("click", saveSelectedToLineage);
lineageSaveOriginalBtn?.addEventListener("click", saveOriginalToLineage);

initializePopup();

async function initializePopup() {
  await initializeLineageSettings();
  await hydrateClipboardSection();
  extractFromCurrentTab();
}

async function initializeLineageSettings() {
  if (!lineageFeatureEnabled || !lineageBoxEl) {
    return;
  }

  lineageBoxEl.hidden = false;
  const settings = await getLineageSettings();
  lineageEnabledInput.checked = !!settings.enabled;
  await renderLineageFolders(settings.customFolderId);
}

async function hydrateClipboardSection() {
  try {
    if (!navigator.clipboard?.readText) {
      renderClipboardLink("");
      return;
    }

    const text = String(await navigator.clipboard.readText() || "").trim();
    renderClipboardLink(text);
  } catch {
    renderClipboardLink("");
  }
}

function renderClipboardLink(url) {
  clipboardUrlInput.value = String(url || "");
  updateClipboardLinkState(clipboardUrlInput.value);
}

function updateClipboardLinkState(rawValue) {
  const normalized = normalizeHttpUrl(rawValue);
  clipboardLinkUrl = normalized;
  clipboardDownloadBtn.disabled = !clipboardLinkUrl;
  clipboardUrlEl.textContent = clipboardLinkUrl
    ? ""
    : rawValue
      ? "Invalid URL."
      : "";
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
      version: "0.2.0",
      contentBuildHash: "1134",
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
    const previousProjectName = state.projectName || "";
    state.projectName = response.projectName || "ProjectsA";
    state.metadata = response.metadata || null;
    const debug = response.debug || {};
    debug.client = {
      version: "0.2.0",
      contentBuildHash: "1134",
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

    const currentFolderInput = folderNameInput.value.trim();
    if (!state.folderTouched || !currentFolderInput || currentFolderInput === previousProjectName) {
      folderNameInput.value = state.projectName;
      state.folderTouched = false;
    }

    setStatus(state.images.length ? `Found ${state.images.length} image(s).` : "No images found on the current page.");
    render();
  } catch (error) {
    state.images = [];
    renderDebugInfo({
      phase: "error",
      version: "0.2.0",
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
  const lineage = await getLineageDownloadOptions(folder);
  setStatus("Queueing download...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await enqueueSelectionDownload({
      folder,
      images: selected.map((item) => ({
        url: item.url,
        sourceUrl: item.sourceUrl,
        format: item.format,
        isOriginal: !!item.isOriginal,
      })),
      metadata: state.metadata,
      pageUrl: tab?.url || "",
      lineage,
    });
    const queuedAhead = Number(result?.queuedAhead || 0);
    if (result?.active || queuedAhead > 0) {
      setStatus(`Queued ${selected.length} image(s). ${queuedAhead} task(s) ahead.`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Download failed: ${message}`, true);
    return;
  }

  setStatus(`Download started for ${selected.length} image(s) in "${folder}".`);
}

async function saveSelectedToLineage() {
  const selected = state.images.filter((item) => item.selected);
  await saveImagesToLineage(selected);
}

async function saveOriginalToLineage() {
  const originals = state.images.filter((item) => item.isOriginal);
  state.images.forEach((item) => {
    item.selected = !!item.isOriginal;
  });
  render();
  await saveImagesToLineage(originals);
}

async function saveImagesToLineage(selected) {
  if (!selected.length) return;

  const folder = sanitizeFolderName(folderNameInput.value.trim() || state.projectName || "ProjectsA");
  const lineage = await getLineageDownloadOptions(folder, { requireEnabled: false });
  setLineageStatus("Queueing Lineage import...", false);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await enqueueSelectionDownload({
      folder,
      images: selected.map((item) => ({
        url: item.url,
        sourceUrl: item.sourceUrl,
        format: item.format,
        isOriginal: !!item.isOriginal,
      })),
      metadata: state.metadata,
      pageUrl: tab?.url || "",
      lineage,
      lineageOnly: true,
    });
    const queuedAhead = Number(result?.queuedAhead || 0);
    setLineageStatus(
      result?.active || queuedAhead > 0
        ? `Queued ${selected.length} image(s) for Lineage. ${queuedAhead} task(s) ahead.`
        : `Lineage import started for ${selected.length} image(s).`,
      false
    );
  } catch (error) {
    setLineageStatus(`Lineage save failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function downloadClipboardWeiboOriginal() {
  if (!clipboardLinkUrl) {
    return;
  }

  clipboardDownloadBtn.disabled = true;
  setStatus("Queueing Weibo Original download...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await enqueueLinkDownload({
      linkUrl: clipboardLinkUrl,
      sourceTabId: tab?.id || 0,
      sourceTabIndex: typeof tab?.index === "number" ? tab.index : null,
    });
    const queuedAhead = Number(result?.queuedAhead || 0);
    setStatus(
      result?.active || queuedAhead > 0
        ? `Queued Weibo Original download. ${queuedAhead} task(s) ahead.`
        : "Weibo Original download started."
    );
    window.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Clipboard download failed: ${message}`, true);
  } finally {
    clipboardDownloadBtn.disabled = !clipboardLinkUrl;
  }
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
    pluginVersion: options.pluginVersion || "0.2.0",
  };
}

async function getLineageDownloadOptions(folderName, options = {}) {
  if (!lineageFeatureEnabled) {
    return null;
  }

  await saveLineageSettings();
  const settings = await getLineageSettings();
  if (!settings.enabled && options.requireEnabled !== false) {
    return null;
  }
  if (!settings.baseUrl) {
    throw new Error("Lineage API URL is missing from features.js.");
  }
  if (!settings.token) {
    throw new Error("Lineage token is missing from features.js.");
  }

  return {
    enabled: true,
    baseUrl: normalizeLineageBaseUrl(settings.baseUrl),
    token: settings.token || "",
    folderName,
    customFolderId: settings.customFolderId || "",
  };
}

function getLineageSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      lineageEnabled: false,
      lineageBaseUrl: defaultLineageBaseUrl,
      lineageToken: defaultLineageToken,
      lineageCustomFolderId: "",
    }, (items) => {
      resolve({
        enabled: !!items.lineageEnabled,
        baseUrl: normalizeLineageBaseUrl(defaultLineageBaseUrl || items.lineageBaseUrl),
        token: String(defaultLineageToken || items.lineageToken || ""),
        customFolderId: String(items.lineageCustomFolderId || ""),
      });
    });
  });
}

function saveLineageSettings() {
  if (!lineageFeatureEnabled || !lineageEnabledInput) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({
      lineageEnabled: !!lineageEnabledInput.checked,
      lineageBaseUrl: defaultLineageBaseUrl,
      lineageToken: defaultLineageToken,
      lineageCustomFolderId: String(lineageFolderSelect?.value || ""),
    }, resolve);
  });
}

async function refreshLineageFolders() {
  try {
    await saveLineageSettings();
    const settings = await getLineageSettings();
    await renderLineageFolders(settings.customFolderId);
  } catch (error) {
    setLineageStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function probeLineageConnection() {
  if (!lineageFeatureEnabled) {
    renderLineageDebug({ ok: false, error: "Lineage feature is disabled." });
    return;
  }

  lineageProbeBtn.disabled = true;
  setLineageStatus("Running Lineage probe...", false);
  const settings = await getLineageSettings();
  const probe = {
    contentBuildHash: "1134",
    featureEnabled: lineageFeatureEnabled,
    baseUrl: settings.baseUrl,
    tokenPresent: !!settings.token,
    tokenPreview: settings.token ? `${settings.token.slice(0, 6)}...${settings.token.slice(-4)}` : "",
    selectedParentCustomFolderId: settings.customFolderId || "",
    manifestHostPermissions: chrome.runtime.getManifest()?.host_permissions || [],
    checks: [],
  };

  await runLineageProbeCheck(probe, "health", () => lineageRequest(settings, "/health"));
  await runLineageProbeCheck(probe, "custom-folders", () => lineageRequest(settings, "/custom-folders"));

  const folderCheck = probe.checks.find((item) => item.name === "custom-folders");
  if (folderCheck?.ok) {
    const folders = normalizeLineageFolderOptions(folderCheck.payload);
    folderCheck.folderCount = folders.length;
    folderCheck.treeCount = Array.isArray(folderCheck.payload?.customFolderTree)
      ? folderCheck.payload.customFolderTree.length
      : 0;
    folderCheck.flatCount = Array.isArray(folderCheck.payload?.customFolders)
      ? folderCheck.payload.customFolders.length
      : 0;
    await renderLineageFolders(settings.customFolderId);
  }

  renderLineageDebug(probe);
  const passed = probe.checks.every((item) => item.ok);
  setLineageStatus(passed ? "Lineage probe passed." : "Lineage probe failed. See debug details.", !passed);
  lineageProbeBtn.disabled = false;
}

async function runLineageProbeCheck(probe, name, action) {
  const startedAt = Date.now();
  try {
    const payload = await action();
    probe.checks.push({
      name,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      payload,
    });
  } catch (error) {
    probe.checks.push({
      name,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function renderLineageDebug(debug) {
  if (!lineageDebugBoxEl || !lineageDebugInfoEl) return;
  lineageDebugBoxEl.hidden = false;
  lineageDebugBoxEl.open = false;
  lineageDebugInfoEl.textContent = JSON.stringify(debug, null, 2);
}

async function renderLineageFolders(selectedId = "") {
  if (!lineageFolderSelect) {
    return;
  }

  lineageRefreshBtn.disabled = true;
  try {
    const settings = await getLineageSettings();
    const payload = await lineageRequest(settings, "/custom-folders");
    const folders = normalizeLineageFolderOptions(payload);
    const activeId = selectedId || String(lineageFolderSelect.value || "");

    lineageFolderSelect.innerHTML = "";
    lineageFolderSelect.appendChild(createLineageFolderOption("", "Root"));
    for (const folder of folders) {
      const label = buildLineageFolderLabel(folder);
      lineageFolderSelect.appendChild(createLineageFolderOption(folder.id, label));
    }

    lineageFolderSelect.value = folders.some((folder) => folder.id === activeId) ? activeId : "";
    await saveLineageSettings();
    setLineageStatus(`Loaded ${folders.length} Custom Folder(s).`, false);
  } catch (error) {
    lineageFolderSelect.innerHTML = "";
    lineageFolderSelect.appendChild(createLineageFolderOption("", "Create from Folder Name"));
    setLineageStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    lineageRefreshBtn.disabled = false;
  }
}

function normalizeLineageFolderOptions(payload) {
  const tree = Array.isArray(payload?.customFolderTree) ? payload.customFolderTree : [];
  if (tree.length) {
    return flattenLineageFolderTree(tree);
  }

  return Array.isArray(payload?.customFolders)
    ? payload.customFolders.map((folder) => ({ ...folder, depth: 0 }))
    : [];
}

function flattenLineageFolderTree(nodes, depth = 0, output = []) {
  for (const node of nodes || []) {
    output.push({ ...node, depth });
    flattenLineageFolderTree(Array.isArray(node?.children) ? node.children : [], depth + 1, output);
  }
  return output;
}

function createLineageFolderOption(value, label) {
  const option = document.createElement("option");
  option.value = String(value || "");
  option.textContent = label;
  return option;
}

function buildLineageFolderLabel(folder) {
  const prefix = folder?.depth > 0 ? `${"  ".repeat(folder.depth)}- ` : "";
  const name = String(folder?.name || "Untitled");
  const assetCount = Number(folder?.assetCount || 0);
  const childCount = Number(folder?.childCount || 0);
  return `${prefix}${name} (${assetCount} assets, ${childCount} folders)`;
}

async function lineageRequest(settings, path, options = {}) {
  const baseUrl = normalizeLineageBaseUrl(settings.baseUrl);
  if (!baseUrl) {
    throw new Error("Lineage API URL is required.");
  }
  if (!settings.token) {
    throw new Error("Lineage token is required.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lineage-Token": settings.token,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Lineage API request failed: ${response.status}`);
  }
  return payload;
}

function setLineageStatus(message, isError = false) {
  if (!lineageStatusEl) return;
  lineageStatusEl.textContent = message;
  lineageStatusEl.classList.toggle("error", isError);
}

function normalizeLineageBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/g, "");
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return "";
    }
    return parsed.toString().replace(/\/+$/g, "");
  } catch {
    return "";
  }
}

function enqueueSelectionDownload(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "mediafetch:enqueue-selection-download", ...payload }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Failed to queue download."));
        return;
      }

      resolve(response);
    });
  });
}

function enqueueLinkDownload(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "mediafetch:enqueue-link-download", ...payload }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Failed to queue link download."));
        return;
      }

      resolve(response);
    });
  });
}

function isSinaimgUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)sinaimg\.cn$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
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
  if (lineageSaveSelectedBtn) {
    lineageSaveSelectedBtn.disabled = selectedCount === 0 || !lineageFeatureEnabled;
  }
  if (lineageSaveOriginalBtn) {
    lineageSaveOriginalBtn.disabled = originalCount === 0 || !lineageFeatureEnabled;
  }

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

function toggleDebugSection() {
  const collapsed = debugBoxEl.classList.toggle("collapsed");
  toggleDebugBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
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
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
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
  if (format === "HEIC") return "heic";

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}
