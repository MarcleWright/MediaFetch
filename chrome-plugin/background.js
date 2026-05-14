let currentDownloadFolder = "";
const DOWNLOAD_ORIGINALS_MENU_ID = "mediafetch-download-originals";

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
      contexts: ["page"],
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
  if (message?.type !== "mediafetch:set-download-folder") {
    return;
  }

  currentDownloadFolder = sanitizePathPart(message.folder || "");
  sendResponse({ ok: true });

  return;
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  if (downloadItem.byExtensionId !== chrome.runtime.id) {
    suggest();
    return;
  }

  const fileName = sanitizeFileName(downloadItem.filename || "");
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
  const maxIndexHint = await probeInstagramMaxIndex(tab);
  const renderedSamples = await collectInstagramRenderedSamples(tab, maxIndexHint);
  const response = await requestExtraction(tab, maxIndexHint, renderedSamples.urls, renderedSamples.indexes);
  if (!response?.ok) {
    throw new Error(response?.error || "Extraction failed.");
  }

  const originals = (response.images || []).filter((item) => item?.isOriginal);
  if (!originals.length) {
    throw new Error("No Original images found.");
  }

  currentDownloadFolder = sanitizePathPart(response.projectName || "ProjectsA") || "ProjectsA";
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

  showActionStatus(String(originals.length), "#15803d");
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

async function collectInstagramRenderedSamples(tab, maxIndexHint = 0) {
  const url = String(tab?.url || "");
  if (!maxIndexHint || !/https:\/\/www\.instagram\.com\//i.test(url)) {
    return { urls: [], indexes: [] };
  }

  const normalizedPath = normalizeInstagramRenderedSamplePath(url);
  if (!normalizedPath || !tab?.id) {
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
      await chrome.tabs.update(tab.id, { url: originalUrl });
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

async function probeInstagramMaxIndex(tab) {
  const url = String(tab?.url || "");
  if (!/https:\/\/www\.instagram\.com\//i.test(url)) {
    return 0;
  }

  const normalized = normalizeInstagramProbeUrl(url);
  if (!normalized || !tab?.id) {
    return 0;
  }

  try {
    const originalUrl = url;
    await chrome.tabs.update(tab.id, { url: normalized });
    await waitForTabComplete(tab.id, 15000);
    const finalUrl = await waitForInstagramProbeUrl(tab.id, 20, 10000);
    const finalParsed = new URL(finalUrl);
    const value = Number.parseInt(finalParsed.searchParams.get("img_index") || "", 10);
    await chrome.tabs.update(tab.id, { url: originalUrl });
    await waitForTabComplete(tab.id, 15000);
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
