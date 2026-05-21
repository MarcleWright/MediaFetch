importScripts("features.js");

let currentDownloadFolder = "";
let pendingDownloadFileNames = [];
let pendingMetadataPaths = [];
let currentDownloadReferer = "";
let downloadTaskCounter = 0;
let activeDownloadTask = null;
const downloadTaskQueue = [];
const DOWNLOAD_ORIGINALS_MENU_ID = "mediafetch-download-originals";
const WEIBO_DOWNLOAD_RULE_ID = 901001;
const METADATA_SENTINEL_FILE_NAME = "__mediafetch_metadata__.json";
const DOWNLOAD_STRATEGY_DIRECT = "direct";
const DOWNLOAD_STRATEGY_FETCH_IMAGE = "fetchImage";
const HEIC_CONVERTER_OFFSCREEN_URL = "offscreen.html";
const DOWNLOAD_STRATEGY_RULES = [
  { strategy: DOWNLOAD_STRATEGY_FETCH_IMAGE, test: isSinaimgUrl },
  { strategy: DOWNLOAD_STRATEGY_FETCH_IMAGE, test: isXiaohongshuCdnUrl },
];
const features = globalThis.MEDIAFETCH_FEATURES || {};
const lineageFeatureEnabled = !!features.lineageIntegration;
const defaultLineageBaseUrl = normalizeLineageBaseUrl(features.defaultLineageBaseUrl || "http://127.0.0.1:17321");
const defaultLineageToken = String(features.defaultLineageToken || "").trim();
const eagleFeatureEnabled = features.eagleIntegration !== false;
const defaultEagleBaseUrl = normalizeEagleBaseUrl(features.defaultEagleBaseUrl || "http://localhost:41595");

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: DOWNLOAD_ORIGINALS_MENU_ID,
      title: "MediaFetch: 一键下载 Original 图片",
      contexts: ["page", "link"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== DOWNLOAD_ORIGINALS_MENU_ID || !tab?.id) {
    return;
  }

  const linkUrl = resolveContextMenuTargetUrl(info, tab);
  const instagramContext = resolveInstagramContextMenuTarget(linkUrl, tab);
  if (instagramContext.useCurrentTab) {
    enqueueDownloadTask({
      type: "context-tab",
      tabId: tab.id,
    });
    return;
  }

  const targetUrl = instagramContext.linkUrl || linkUrl;
  enqueueDownloadTask(targetUrl
    ? {
      type: "context-link",
      sourceTabId: tab.id,
      sourceTabIndex: typeof tab.index === "number" ? tab.index : null,
      linkUrl: targetUrl,
    }
    : {
      type: "context-tab",
      tabId: tab.id,
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "mediafetch:set-download-folder") {
    currentDownloadFolder = sanitizePathPart(message.folder || "");
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "mediafetch:prepare-downloads") {
    pendingDownloadFileNames = Array.isArray(message.fileNames)
      ? message.fileNames.map((item) => sanitizeFileName(item)).filter(Boolean)
      : [];
    currentDownloadReferer = normalizeHttpUrl(message.pageUrl || "") || "https://weibo.com/";

    setupDownloadHeaderRules(message.urls || [], currentDownloadReferer)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    return true;
  }

  if (message?.type === "mediafetch:queue-metadata-path") {
    const targetPath = sanitizeDownloadPath(message.path || "");
    if (targetPath) {
      pendingMetadataPaths.push(targetPath);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Invalid metadata path." });
    return;
  }

  if (message?.type === "mediafetch:enqueue-selection-download") {
    const taskId = enqueueDownloadTask({
      type: "selection",
      folder: message.folder || "",
      images: Array.isArray(message.images) ? message.images : [],
      metadata: message.metadata || null,
      pageUrl: message.pageUrl || "",
      lineage: message.lineage || null,
      eagle: message.eagle || null,
      lineageOnly: !!message.lineageOnly,
      convertHeicToPng: !!message.convertHeicToPng,
    });
    sendResponse({
      ok: true,
      taskId,
      queuedAhead: Math.max(0, downloadTaskQueue.length - 1),
      active: !!activeDownloadTask,
    });
    return;
  }

  if (message?.type === "mediafetch:enqueue-link-download") {
    const targetUrl = normalizeHttpUrl(message.linkUrl || "");
    if (!targetUrl) {
      sendResponse({ ok: false, error: "Invalid link URL." });
      return;
    }

    const taskId = enqueueDownloadTask({
      type: "context-link",
      sourceTabId: Number(message.sourceTabId || 0) || null,
      sourceTabIndex: Number.isFinite(message.sourceTabIndex) ? Number(message.sourceTabIndex) : null,
      linkUrl: targetUrl,
    });
    sendResponse({
      ok: true,
      taskId,
      queuedAhead: Math.max(0, downloadTaskQueue.length - 1),
      active: !!activeDownloadTask,
    });
    return;
  }

  if (message?.type === "mediafetch:save-to-eagle") {
    saveImagesToEagle({
      images: Array.isArray(message.images) ? message.images : [],
      metadata: message.metadata || null,
      pageUrl: message.pageUrl || "",
      eagle: message.eagle || null,
      convertHeicToPng: !!message.convertHeicToPng,
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    return true;
  }
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  if (downloadItem.byExtensionId !== chrome.runtime.id) {
    suggest();
    return;
  }

  const requestedPath = sanitizeDownloadPath(downloadItem.filename || "");
  const requestedName = sanitizeFileName(downloadItem.filename || "");
  if (requestedName === METADATA_SENTINEL_FILE_NAME) {
    const folder = currentDownloadFolder;
    const targetPath = pendingMetadataPaths.shift() || (folder ? `${folder}/metadata.json` : "metadata.json");
    suggest({
      filename: targetPath,
      conflictAction: "overwrite",
    });
    return;
  }

  const fileName = pendingDownloadFileNames.length
    ? pendingDownloadFileNames.shift()
    : requestedName;
  if (!fileName) {
    suggest();
    return;
  }

  const folder = currentDownloadFolder;
  if (folder) {
    suggest({
      filename: `${folder}/${fileName}`,
      conflictAction: "uniquify",
    });
    return;
  }

  suggest();
});

async function downloadOriginalsFromTab(tab) {
  const instagramNav = await resolveInstagramNavigationContext(tab);
  const maxIndexHint = await probeInstagramMaxIndex(tab, instagramNav);
  const instagramSamples = await collectInstagramRenderedSamples(tab, instagramNav.resolvedPostPath, maxIndexHint);
  const weiboSamples = await collectWeiboRenderedSamples(tab);
  const sampledUrls = [...instagramSamples.urls, ...weiboSamples.urls];
  const sampledIndexes = [...instagramSamples.indexes, ...weiboSamples.layerIds];
  const response = await requestExtraction(tab, maxIndexHint, sampledUrls, sampledIndexes);
  if (!response?.ok) {
    throw new Error(response?.error || "Extraction failed.");
  }

  const originals = (response.images || []).filter((item) => item?.isOriginal);
  if (!originals.length) {
    throw new Error("No Original images found.");
  }

  const folder = sanitizePathPart(response.projectName || "ProjectsA") || "ProjectsA";
  const metadata = buildDownloadMetadata(response.metadata, {
    folderName: folder,
    imageCount: originals.length,
    originalCount: originals.length,
    pluginVersion: "0.2.1",
  });
  await downloadImageBatch(originals, {
    folder,
    metadata,
    pageUrl: tab.url || "",
    convertHeicToPng: await getStoredConvertHeicToPng(),
  });
}

async function downloadOriginalsFromLink(sourceTab, linkUrl) {
  const targetUrl = normalizeHttpUrl(linkUrl);
  if (!targetUrl) {
    throw new Error("Invalid link URL.");
  }

  const tempTab = await chrome.tabs.create({
    url: targetUrl,
    active: false,
    index: typeof sourceTab.index === "number" ? sourceTab.index + 1 : undefined,
  });

  try {
    await waitForTabComplete(tempTab.id, 20000);
    await delay(1200);
    const loadedTab = await chrome.tabs.get(tempTab.id);
    await downloadOriginalsFromTab(loadedTab);
  } finally {
    try {
      await chrome.tabs.remove(tempTab.id);
    } catch {
      // Ignore cleanup failures for temporary link tabs.
    }
  }
}

async function downloadSelectionTask(task) {
  const selected = Array.isArray(task.images) ? task.images.filter((item) => item?.url) : [];
  if (!selected.length) {
    throw new Error("No images selected.");
  }

  const folder = sanitizePathPart(task.folder || "ProjectsA") || "ProjectsA";
  const originalCount = selected.filter((item) => item?.isOriginal).length;
  const metadata = buildDownloadMetadata(task.metadata, {
    folderName: folder,
    imageCount: selected.length,
    originalCount,
    pluginVersion: "0.2.1",
  });
  await downloadImageBatch(selected, {
    folder,
    metadata,
    pageUrl: task.pageUrl || "",
    lineage: task.lineage || null,
    eagle: task.eagle || null,
    lineageOnly: !!task.lineageOnly,
    convertHeicToPng: !!task.convertHeicToPng,
  });
}

async function downloadImageBatch(images, options) {
  const requestedFolder = sanitizePathPart(options.folder || "ProjectsA") || "ProjectsA";
  const folder = options.lineageOnly
    ? buildLineageTempFolderName(requestedFolder)
    : requestedFolder;
  const referer = normalizeHttpUrl(options.pageUrl || "") || "https://weibo.com/";
  const filePrefix = getDownloadFilePrefix(options.metadata);
  currentDownloadFolder = folder;
  currentDownloadReferer = referer;
  await setupDownloadHeaderRules(images.map((item) => item.url), referer);
  pendingDownloadFileNames = images.map((item, index) => {
    const extension = inferOutputExtension(item, options);
    return buildIndexedFileName(filePrefix, index, extension);
  });

  const downloadRecords = [];
  for (let i = 0; i < images.length; i += 1) {
    const item = images[i];
    const extension = inferOutputExtension(item, options);
    const fileName = buildIndexedFileName(filePrefix, i, extension);
    const downloadId = await executeDownloadStrategy(item, fileName, {
      folder,
      referer,
      pageUrl: options.pageUrl || "",
      convertHeicToPng: !!options.convertHeicToPng,
    });
    if (downloadId) {
      downloadRecords.push({
        id: downloadId,
        sourceUrl: normalizeHttpUrl(item.sourceUrl || item.url || ""),
      });
    }
  }

  try {
    if (!options.lineageOnly) {
      await downloadTextFile(JSON.stringify(options.metadata || {}, null, 2), `${folder}/metadata.json`);
    }
    await importDownloadsToLineage(downloadRecords, {
      lineage: options.lineage,
      folder: requestedFolder,
      metadata: options.metadata || {},
      pageUrl: options.pageUrl || "",
    });
    if (options.eagle) {
      await saveImagesToEagle({
        images,
        metadata: options.metadata || {},
        pageUrl: options.pageUrl || "",
        eagle: options.eagle,
        convertHeicToPng: !!options.convertHeicToPng,
      });
    }
  } finally {
    if (options.lineageOnly) {
      await cleanupLineageTempDownloads(downloadRecords.map((item) => item.id));
    }
  }
}

function buildLineageTempFolderName(folder) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `_mediafetch_lineage_imports/${stamp}_${suffix}_${sanitizePathPart(folder || "import")}`;
}

async function cleanupLineageTempDownloads(downloadIds) {
  for (const id of downloadIds || []) {
    try {
      await removeDownloadedFile(id);
    } catch (error) {
      console.warn("MediaFetch could not remove Lineage temp file.", error);
    }
    try {
      await eraseDownloadRecord(id);
    } catch (error) {
      console.warn("MediaFetch could not erase Lineage temp download record.", error);
    }
  }
}

function removeDownloadedFile(id) {
  return new Promise((resolve, reject) => {
    chrome.downloads.removeFile(id, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function eraseDownloadRecord(id) {
  return new Promise((resolve, reject) => {
    chrome.downloads.erase({ id }, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items || []);
    });
  });
}

async function executeDownloadStrategy(item, filename, context = {}) {
  if (shouldConvertHeicToPng(item, context)) {
    return await downloadConvertedPng(item.url, filename);
  }

  const strategy = selectDownloadStrategy(item, context);
  if (strategy === DOWNLOAD_STRATEGY_FETCH_IMAGE) {
    try {
      return await downloadFetchedImage(item.url, filename);
    } catch (error) {
      console.warn("MediaFetch fetch-image download failed; falling back to direct download.", error);
      return await downloadDirectImage(item.url, filename);
    }
  }

  return await downloadDirectImage(item.url, filename);
}

async function downloadConvertedPng(url, filename) {
  const dataUrl = await fetchImageAsPngDataUrl(url);
  return await downloadToChrome({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify",
  });
}

async function downloadDirectImage(url, filename) {
  return await downloadToChrome({
    url,
    filename,
    saveAs: false,
    conflictAction: "uniquify",
  });
}

function getDownloadFilePrefix(metadata) {
  const projectId = sanitizePathPart(metadata?.projectId || "");
  return projectId || "";
}

function buildIndexedFileName(prefix, index, extension) {
  const serial = String(index + 1).padStart(3, "0");
  const safeExtension = sanitizeFileName(extension || "jpg").replace(/^\.+/, "") || "jpg";
  return prefix ? `${prefix}_${serial}.${safeExtension}` : `${serial}.${safeExtension}`;
}

function inferOutputExtension(item, options = {}) {
  return shouldConvertHeicToPng(item, options)
    ? "png"
    : inferExtension(item?.url, item?.format);
}

function shouldConvertHeicToPng(item, options = {}) {
  return !!options.convertHeicToPng && isHeicImage(item?.url, item?.format);
}

function isHeicImage(url, format) {
  const normalizedFormat = String(format || "").trim().toUpperCase();
  if (normalizedFormat === "HEIC" || normalizedFormat === "HEIF") {
    return true;
  }

  try {
    return /\.(heic|heif)$/i.test(new URL(String(url || "")).pathname);
  } catch {
    return /\.(heic|heif)(?:$|[?#])/i.test(String(url || ""));
  }
}

// Network quirks are centralized here so download batching stays platform-neutral.
function selectDownloadStrategy(item, _context = {}) {
  const url = item?.url || "";
  const rule = DOWNLOAD_STRATEGY_RULES.find((entry) => entry.test(url, item, _context));
  return rule?.strategy || DOWNLOAD_STRATEGY_DIRECT;
}

async function downloadFetchedImage(url, filename) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!isFetchedImageContentTypeAllowed(contentType)) {
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) {
    throw new Error("Image response was empty.");
  }

  const mimeType = contentType.startsWith("image/") ? contentType : inferMimeTypeFromFilename(filename);
  const dataUrl = `data:${mimeType};base64,${encodeBase64(bytes)}`;
  return await downloadToChrome({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify",
  });
}

function isFetchedImageContentTypeAllowed(contentType) {
  return (
    !contentType ||
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  );
}

function inferMimeTypeFromFilename(filename) {
  const extension = String(filename || "").split(".").pop().toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "svg") return "image/svg+xml";
  return "image/jpeg";
}

function enqueueDownloadTask(task) {
  downloadTaskCounter += 1;
  const queuedTask = {
    id: downloadTaskCounter,
    ...task,
  };
  downloadTaskQueue.push(queuedTask);
  updateQueueBadge();
  void processDownloadQueue();
  return queuedTask.id;
}

async function processDownloadQueue() {
  if (activeDownloadTask || !downloadTaskQueue.length) {
    updateQueueBadge();
    return;
  }

  activeDownloadTask = downloadTaskQueue.shift();
  updateQueueBadge();

  try {
    if (activeDownloadTask.type === "context-link") {
      const sourceTab = {
        id: activeDownloadTask.sourceTabId,
        index: activeDownloadTask.sourceTabIndex,
      };
      await downloadOriginalsFromLink(sourceTab, activeDownloadTask.linkUrl);
    } else if (activeDownloadTask.type === "selection") {
      await downloadSelectionTask(activeDownloadTask);
    } else {
      const tab = await chrome.tabs.get(activeDownloadTask.tabId);
      await downloadOriginalsFromTab(tab);
    }
    showActionStatus("OK", "#15803d");
  } catch (error) {
    console.error("MediaFetch queued download failed:", error);
    showActionStatus("ERR", "#b91c1c");
  } finally {
    activeDownloadTask = null;
    updateQueueBadge();
    if (downloadTaskQueue.length) {
      void processDownloadQueue();
    }
  }
}

async function setupDownloadHeaderRules(urls, referer = "https://weibo.com/") {
  if (!Array.isArray(urls) || !urls.some((url) => isSinaimgUrl(url))) {
    return;
  }

  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [WEIBO_DOWNLOAD_RULE_ID],
    addRules: [{
      id: WEIBO_DOWNLOAD_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "Referer",
            operation: "set",
            value: referer,
          },
          {
            header: "Origin",
            operation: "set",
            value: "https://weibo.com",
          },
        ],
      },
      condition: {
        urlFilter: "||sinaimg.cn/",
        resourceTypes: [
          "main_frame",
          "sub_frame",
          "image",
          "media",
          "xmlhttprequest",
          "other",
        ],
      },
    }],
  });
}

async function requestExtraction(tab, maxIndexHint = 0, sampledUrls = [], sampledIndexes = []) {
  try {
    return await sendTabMessage(tab.id, { type: "mediafetch:extract", maxIndexHint, sampledUrls, sampledIndexes });
  } catch {
    const canInject = /^https?:/i.test(tab.url || "");
    if (!canInject) {
      throw new Error("This page is not supported.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    return await sendTabMessage(tab.id, { type: "mediafetch:extract", maxIndexHint, sampledUrls, sampledIndexes });
  }
}

async function collectInstagramRenderedSamples(tab, resolvedPostPath = "", maxIndexHint = 0) {
  const url = String(tab?.url || "");
  if (!maxIndexHint || !/https:\/\/www\.instagram\.com\//i.test(url)) {
    return { urls: [], indexes: [] };
  }

  if (!resolvedPostPath || maxIndexHint <= 1 || !tab?.id) {
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

      await chrome.tabs.update(tab.id, { url: probeUrl.toString() });
      await waitForTabComplete(tab.id, 15000);
      await delay(1200);

      const snapshot = await requestInstagramRenderedSnapshot(tab.id);
      (snapshot?.urls || []).forEach((item) => {
        if (item) urls.add(item);
      });
    }
  } finally {
    try {
      await chrome.tabs.update(tab.id, { url: restoreUrl });
      await waitForTabComplete(tab.id, 15000);
      await delay(800);
    } catch {
      // Final extraction will surface connection issues if restore failed.
    }
  }

  return {
    urls: Array.from(urls),
    indexes,
  };
}

async function requestInstagramRenderedSnapshot(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "mediafetch:instagram-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const response = await sendTabMessage(tabId, { type: "mediafetch:instagram-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  }
}

async function collectWeiboRenderedSamples(tab) {
  const url = String(tab?.url || "");
  if (!/^https:\/\/weibo\.com\//i.test(url) || !tab?.id) {
    return { urls: [], layerIds: [] };
  }

  const hints = await requestWeiboLayerHints(tab.id);
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

      const snapshot = await requestWeiboRenderedSnapshot(tab.id);
      (snapshot?.urls || []).forEach((item) => {
        if (item) urls.add(item);
      });
    }
  } finally {
    try {
      await chrome.tabs.update(tab.id, { url: originalUrl });
      await waitForTabComplete(tab.id, 15000);
      await delay(800);
    } catch {
      // Final extraction will surface connection issues if restore failed.
    }
  }

  return {
    urls: Array.from(urls),
    layerIds,
  };
}

async function requestWeiboLayerHints(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "mediafetch:weibo-layer-hints" });
    return response?.ok ? response.hints : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const response = await sendTabMessage(tabId, { type: "mediafetch:weibo-layer-hints" });
    return response?.ok ? response.hints : null;
  }
}

async function requestWeiboRenderedSnapshot(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "mediafetch:weibo-rendered-snapshot" });
    return response?.ok ? response.snapshot : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const response = await sendTabMessage(tabId, { type: "mediafetch:weibo-rendered-snapshot" });
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
        // Ignore restore failures; the extraction path will surface tab errors.
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
    context = await requestInstagramPostContext(tab.id);
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

async function requestInstagramPostContext(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "mediafetch:instagram-post-context" });
    return response?.ok ? response.context : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const response = await sendTabMessage(tabId, { type: "mediafetch:instagram-post-context" });
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

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
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

async function downloadTextFile(text, filename) {
  const targetPath = sanitizeDownloadPath(filename || "");
  if (targetPath) {
    pendingMetadataPaths.push(targetPath);
  }
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(String(text || ""))}`;
  await downloadToChrome({
    url: dataUrl,
    filename: METADATA_SENTINEL_FILE_NAME,
    saveAs: false,
    conflictAction: "overwrite",
  });
}

function buildDownloadMetadata(baseMetadata, options) {
  return {
    ...(baseMetadata || {}),
    folderName: options.folderName,
    downloadedAt: new Date().toISOString(),
    imageCount: Number(options.imageCount || 0),
    originalCount: Number(options.originalCount || 0),
    pluginVersion: options.pluginVersion || "0.2.1",
  };
}

async function importDownloadsToLineage(downloadRecords, options = {}) {
  if (!lineageFeatureEnabled) {
    return;
  }

  const lineage = normalizeLineageOptions(options.lineage);
  if (!lineage?.enabled) {
    return;
  }

  const completedDownloads = await resolveCompletedDownloads(downloadRecords);
  const filePaths = completedDownloads.map((item) => item.filePath).filter(Boolean);
  if (!filePaths.length) {
    throw new Error("Lineage import skipped because no completed download paths were available.");
  }

  await lineageRequest(lineage, "/imports/originals", {
    method: "POST",
    body: JSON.stringify(buildLineageImportPayload(completedDownloads, lineage, options)),
  });
}

function buildLineageImportPayload(completedDownloads, lineage, options = {}) {
  const filePaths = completedDownloads.map((item) => item.filePath).filter(Boolean);
  const metadataSourceUrl = resolveLineageMetadataSourceUrl(options.metadata, options.pageUrl);
  const payload = {
    filePaths,
    notes: "Imported from MediaFetch Chrome plugin",
  };

  if (metadataSourceUrl) {
    payload.sourceUrl = metadataSourceUrl;
  } else {
    const sourceUrls = completedDownloads.map((item) => item.sourceUrl || "").filter(Boolean);
    if (sourceUrls.length === filePaths.length) {
      payload.sourceUrls = sourceUrls;
    }
  }

  payload.createCustomFolder = {
    name: lineage.folderName || options.folder || "MediaFetch",
    description: buildLineageFolderDescription(options.metadata),
    parentCustomFolderId: lineage.customFolderId || null,
  };
  return payload;
}

async function resolveCompletedDownloads(downloadRecords) {
  const downloads = [];
  for (const record of downloadRecords || []) {
    const item = await waitForDownloadItemComplete(record.id);
    if (item?.filename) {
      downloads.push({
        filePath: item.filename,
        sourceUrl: record.sourceUrl || "",
      });
    }
  }
  return downloads;
}

async function waitForDownloadItemComplete(id, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [item] = await searchDownloads({ id });
    if (!item) {
      throw new Error(`Download ${id} was not found.`);
    }
    if (item.state === "complete") {
      return item;
    }
    if (item.state === "interrupted") {
      throw new Error(`Download interrupted: ${item.error || id}`);
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for download ${id}.`);
}

function searchDownloads(query) {
  return new Promise((resolve, reject) => {
    chrome.downloads.search(query, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items || []);
    });
  });
}

async function getStoredLineageDownloadOptions(folderName) {
  if (!lineageFeatureEnabled) {
    return null;
  }

  const settings = await getStorageValues({
    lineageEnabled: false,
    lineageBaseUrl: defaultLineageBaseUrl,
    lineageToken: defaultLineageToken,
    lineageCustomFolderId: "",
  });

  return normalizeLineageOptions({
    enabled: !!settings.lineageEnabled,
    baseUrl: defaultLineageBaseUrl || settings.lineageBaseUrl,
    token: defaultLineageToken || settings.lineageToken,
    folderName,
    customFolderId: settings.lineageCustomFolderId,
  });
}

async function getStoredConvertHeicToPng() {
  const settings = await getStorageValues({ convertHeicToPng: false });
  return !!settings.convertHeicToPng;
}

function getStorageValues(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });
}

function normalizeLineageOptions(value) {
  if (!value || !value.enabled) {
    return null;
  }

  return {
    enabled: true,
    baseUrl: normalizeLineageBaseUrl(value.baseUrl),
    token: String(value.token || "").trim(),
    folderName: sanitizePathPart(value.folderName || "MediaFetch") || "MediaFetch",
    customFolderId: String(value.customFolderId || "").trim(),
  };
}

async function lineageRequest(settings, path, options = {}) {
  if (!settings.baseUrl) {
    throw new Error("Lineage API URL is required.");
  }
  if (!settings.token) {
    throw new Error("Lineage token is required.");
  }

  const response = await fetch(`${settings.baseUrl}${path}`, {
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

function buildLineageFolderDescription(metadata) {
  const platform = String(metadata?.platform || "").trim();
  const sourceUrl = String(metadata?.projectUrl || metadata?.normalizedUrl || "").trim();
  return [platform && `Platform: ${platform}`, sourceUrl && `Source: ${sourceUrl}`]
    .filter(Boolean)
    .join("\n") || "Created by MediaFetch";
}

function resolveLineageMetadataSourceUrl(metadata, pageUrl = "") {
  return normalizeHttpUrl(
    metadata?.projectUrl ||
    metadata?.normalizedUrl ||
    metadata?.url ||
    pageUrl ||
    ""
  );
}

async function saveImagesToEagle(options = {}) {
  if (!eagleFeatureEnabled) {
    throw new Error("Eagle feature is disabled.");
  }

  const eagle = normalizeEagleOptions(options.eagle);
  if (!eagle?.enabled) {
    throw new Error("Eagle import is not enabled.");
  }

  const images = Array.isArray(options.images) ? options.images.filter((item) => item?.url) : [];
  if (!images.length) {
    throw new Error("No images selected.");
  }

  const childFolder = await eagleRequest(eagle, "/api/folder/create", {
    method: "POST",
    body: JSON.stringify({
      folderName: eagle.folderName || "MediaFetch",
      parent: eagle.parentFolderId || undefined,
    }),
  });
  const folderId = String(childFolder?.data?.id || childFolder?.id || "").trim();
  if (!folderId) {
    throw new Error("Eagle did not return a created folder id.");
  }

  const website = resolveEagleMetadataSourceUrl(options.metadata, options.pageUrl);
  const tags = buildEagleTags(options.metadata);
  for (const [index, image] of images.entries()) {
    const extension = inferOutputExtension(image, options);
    const name = buildIndexedFileName(getDownloadFilePrefix(options.metadata), index, extension).replace(/\.[^.]+$/, "");
    const importUrl = await resolveEagleImportUrl(image.url, `${name}.${extension}`, {
      convertHeicToPng: !!options.convertHeicToPng,
      image,
    });
    await eagleRequest(eagle, "/api/item/addFromURL", {
      method: "POST",
      body: JSON.stringify({
        url: importUrl,
        name,
        website: website || normalizeHttpUrl(image.sourceUrl || image.url || ""),
        annotation: buildEagleAnnotation(options.metadata),
        tags,
        folderID: folderId,
        notification: true,
      }),
    });
  }

  return {
    importedCount: images.length,
    folderId,
  };
}

async function resolveEagleImportUrl(url, filename, options = {}) {
  if (shouldConvertHeicToPng(options.image || { url }, options)) {
    return await fetchImageAsPngDataUrl(url);
  }

  try {
    return await fetchImageAsDataUrl(url, filename);
  } catch (error) {
    console.warn("MediaFetch could not inline image for Eagle; falling back to source URL.", error);
    return url;
  }
}

async function fetchImageAsDataUrl(url, filename) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!isFetchedImageContentTypeAllowed(contentType)) {
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) {
    throw new Error("Image response was empty.");
  }

  const mimeType = contentType.startsWith("image/") ? contentType : inferMimeTypeFromFilename(filename);
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

async function fetchImageAsPngDataUrl(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!isFetchedImageContentTypeAllowed(contentType)) {
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error("Image response was empty.");
  }

  return await convertHeicArrayBufferToPngDataUrl(buffer, contentType);
}

let creatingHeicConverterDocument = null;

async function convertHeicArrayBufferToPngDataUrl(buffer, contentType) {
  await ensureHeicConverterDocument();

  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "mediafetch:offscreen-convert-heic-to-png",
      bufferBase64: encodeBase64(new Uint8Array(buffer)),
      contentType,
    }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response?.ok || !response.dataUrl) {
        reject(new Error(response?.error || "HEIC conversion failed."));
        return;
      }
      resolve(response.dataUrl);
    });
  });
}

async function ensureHeicConverterDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("HEIC conversion requires the chrome.offscreen extension API.");
  }

  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) {
    return;
  }

  if (!creatingHeicConverterDocument) {
    creatingHeicConverterDocument = chrome.offscreen.createDocument({
      url: HEIC_CONVERTER_OFFSCREEN_URL,
      reasons: ["BLOBS"],
      justification: "Convert downloaded HEIC/HEIF image data to PNG inside MediaFetch.",
    }).finally(() => {
      creatingHeicConverterDocument = null;
    });
  }

  await creatingHeicConverterDocument;
}

function normalizeEagleOptions(value) {
  if (!value || !value.enabled) {
    return null;
  }

  return {
    enabled: true,
    baseUrl: normalizeEagleBaseUrl(value.baseUrl || defaultEagleBaseUrl),
    folderName: sanitizePathPart(value.folderName || "MediaFetch") || "MediaFetch",
    parentFolderId: String(value.parentFolderId || "").trim(),
  };
}

async function eagleRequest(settings, path, options = {}) {
  if (!settings.baseUrl) {
    throw new Error("Eagle API URL is required.");
  }

  const response = await fetch(`${settings.baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status === "error") {
    throw new Error(payload.error || payload.message || `Eagle API request failed: ${response.status}`);
  }
  return payload;
}

function normalizeEagleBaseUrl(value) {
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

function resolveEagleMetadataSourceUrl(metadata, pageUrl = "") {
  return normalizeHttpUrl(
    metadata?.projectUrl ||
    metadata?.normalizedUrl ||
    metadata?.url ||
    pageUrl ||
    ""
  );
}

function buildEagleAnnotation(metadata) {
  const platform = String(metadata?.platform || "").trim();
  const title = String(metadata?.title || metadata?.projectTitle || "").trim();
  return [platform && `Platform: ${platform}`, title && `Title: ${title}`]
    .filter(Boolean)
    .join("\n");
}

function buildEagleTags(metadata) {
  const tags = [];
  const platform = String(metadata?.platform || "").trim();
  if (platform) tags.push(platform);
  return tags;
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

function isSinaimgUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)sinaimg\.cn$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isXiaohongshuCdnUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)xhscdn\.com$/i.test(parsed.hostname) || /(^|\.)snsimg\.cn$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return /^https?:$/i.test(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function resolveContextMenuTargetUrl(info, tab) {
  const direct = normalizeHttpUrl(info?.linkUrl || "");
  if (direct) {
    return direct;
  }

  const rawLink = String(info?.linkUrl || "").trim();
  if (!rawLink) {
    return "";
  }

  try {
    const base = normalizeHttpUrl(tab?.url || "") || normalizeHttpUrl(info?.pageUrl || "");
    if (!base) {
      return "";
    }
    const resolved = new URL(rawLink, base);
    return /^https?:$/i.test(resolved.protocol) ? resolved.toString() : "";
  } catch {
    return "";
  }
}

function resolveInstagramContextMenuTarget(linkUrl, tab) {
  if (!linkUrl) {
    return { useCurrentTab: false, linkUrl: "" };
  }

  try {
    const target = new URL(linkUrl);
    const source = new URL(String(tab?.url || ""));
    if (!/instagram\.com$/i.test(target.hostname) || !/instagram\.com$/i.test(source.hostname)) {
      return { useCurrentTab: false, linkUrl };
    }

    const targetPost = parseInstagramPostPath(target.pathname);
    const sourcePost = parseInstagramPostPath(source.pathname);
    if (!targetPost) {
      return { useCurrentTab: false, linkUrl };
    }

    if (sourcePost?.postCode && sourcePost.postCode === targetPost.postCode) {
      return { useCurrentTab: true, linkUrl: "" };
    }

    if (!targetPost.username) {
      const sourceUsername = extractInstagramUsernameFromPath(source.pathname);
      if (sourceUsername) {
        target.pathname = `/${sourceUsername}/${targetPost.kind}/${targetPost.postCode}`;
        return { useCurrentTab: false, linkUrl: target.toString() };
      }
    }

    return { useCurrentTab: false, linkUrl };
  } catch {
    return { useCurrentTab: false, linkUrl };
  }
}

function parseInstagramPostPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/, "");
  let match = normalized.match(/^\/([A-Za-z0-9._-]+)\/(p|reel)\/([^/]+)$/i);
  if (match) {
    return {
      username: match[1],
      kind: match[2].toLowerCase(),
      postCode: match[3],
    };
  }

  match = normalized.match(/^\/(p|reel)\/([^/]+)$/i);
  if (match) {
    return {
      username: "",
      kind: match[1].toLowerCase(),
      postCode: match[2],
    };
  }

  return null;
}

function extractInstagramUsernameFromPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/, "");
  const match = normalized.match(/^\/([A-Za-z0-9._-]+)(?:\/)?$/);
  if (!match) {
    return "";
  }

  const username = match[1];
  return /^(?:p|reel|explore|accounts|direct|stories)$/i.test(username) ? "" : username;
}

function showActionStatus(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    updateQueueBadge();
  }, 3000);
}

function updateQueueBadge() {
  if (activeDownloadTask) {
    const queuedCount = downloadTaskQueue.length;
    chrome.action.setBadgeText({ text: queuedCount > 0 ? `>${queuedCount}` : "RUN" });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    return;
  }

  if (downloadTaskQueue.length > 0) {
    chrome.action.setBadgeText({ text: String(downloadTaskQueue.length) });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    return;
  }

  chrome.action.setBadgeText({ text: "" });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function sanitizePathPart(value) {
  return String(value || "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .trim()
    .slice(0, 64);
}

function sanitizeDownloadPath(value) {
  return String(value || "")
    .split(/[\\/]/)
    .map((part) => sanitizePathPart(part))
    .filter(Boolean)
    .join("/");
}

function sanitizeFileName(value) {
  const cleaned = String(value || "")
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();

  return cleaned || "";
}
