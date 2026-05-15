let currentDownloadFolder = "";
let pendingDownloadFileNames = [];
let pendingMetadataPaths = [];
let currentDownloadReferer = "";
const DOWNLOAD_ORIGINALS_MENU_ID = "mediafetch-download-originals";
const WEIBO_DOWNLOAD_RULE_ID = 901001;
const METADATA_SENTINEL_FILE_NAME = "__mediafetch_metadata__.json";

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

  downloadOriginalsFromTab(tab).catch((error) => {
    console.error("MediaFetch context download failed:", error);
    showActionStatus("ERR", "#b91c1c");
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
  showActionStatus("...", "#2563eb");
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

  currentDownloadFolder = sanitizePathPart(response.projectName || "ProjectsA") || "ProjectsA";
  currentDownloadReferer = normalizeHttpUrl(tab.url || "") || "https://weibo.com/";
  await setupDownloadHeaderRules(originals.map((item) => item.url), currentDownloadReferer);
  pendingDownloadFileNames = originals.map((item, index) => {
    const extension = inferExtension(item.url, item.format);
    return `${String(index + 1).padStart(3, "0")}.${extension}`;
  });
  for (let i = 0; i < originals.length; i += 1) {
    const item = originals[i];
    const extension = inferExtension(item.url, item.format);
    const fileName = `${String(i + 1).padStart(3, "0")}.${extension}`;
    await downloadToChrome({
      url: item.url,
      filename: fileName,
      saveAs: false,
      conflictAction: "uniquify",
    });
  }

  const metadata = buildDownloadMetadata(response.metadata, {
    folderName: currentDownloadFolder,
    imageCount: originals.length,
    originalCount: originals.length,
    pluginVersion: "0.1.4",
  });
  await downloadTextFile(JSON.stringify(metadata, null, 2), `${currentDownloadFolder}/metadata.json`);

  showActionStatus(String(originals.length), "#15803d");
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
    pluginVersion: options.pluginVersion || "0.1.4",
  };
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

function isSinaimgUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)sinaimg\.cn$/i.test(parsed.hostname);
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

function showActionStatus(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 3000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizePathPart(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/^_+|_+$/g, "")
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
