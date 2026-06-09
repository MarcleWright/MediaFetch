import { heicTo } from "./vendor/heic-to.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (![
    "mediafetch:offscreen-convert-heic-to-png",
    "mediafetch:offscreen-download-blob-url",
  ].includes(message?.type)) {
    return;
  }

  const action = message?.type === "mediafetch:offscreen-download-blob-url"
    ? downloadBlobUrl(message)
    : convertHeicToPngDataUrl(message).then((dataUrl) => ({ dataUrl }));

  action
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  return true;
});

async function convertHeicToPngDataUrl(message) {
  const bytes = decodeBase64(message?.bufferBase64);
  if (!bytes.length) {
    throw new Error("HEIC input was empty.");
  }

  const sourceType = normalizeHeicMimeType(message?.contentType);
  const sourceBlob = new Blob([bytes], { type: sourceType });
  const pngBlob = await heicTo({
    blob: sourceBlob,
    type: "image/png",
  });

  if (!pngBlob?.size) {
    throw new Error("HEIC conversion produced an empty PNG.");
  }

  return await blobToDataUrl(pngBlob);
}

function decodeBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeHeicMimeType(contentType) {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();
  return value === "image/heif" || value === "image/heic"
    ? value
    : "image/heic";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read converted PNG."));
    reader.readAsDataURL(blob);
  });
}

async function downloadBlobUrl(message) {
  const url = normalizeHttpUrl(message?.url || "");
  if (!url) {
    throw new Error("Invalid media URL.");
  }

  const filename = sanitizeDownloadFilename(message?.filename || "download.bin");
  const expectedType = String(message?.expectedType || "").trim().toLowerCase();
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Media request failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (isHtmlContentType(contentType)) {
    throw new Error("Media request returned HTML instead of a file.");
  }

  if (expectedType === "video" && contentType && !isAllowedVideoContentType(contentType)) {
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("Media response was empty.");
  }
  if (await isHtmlBlob(blob, contentType)) {
    throw new Error("Media response blob was HTML instead of a file.");
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadId = await downloadToChrome({
      url: objectUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify",
    });
    return { downloadId };
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }
}

function isAllowedVideoContentType(contentType) {
  return (
    contentType.startsWith("video/") ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  );
}

function isHtmlContentType(contentType) {
  return contentType.includes("text/html");
}

async function isHtmlBlob(blob, contentType) {
  if (isHtmlContentType(contentType)) {
    return true;
  }
  const sample = await blob.slice(0, 512).text();
  const normalized = String(sample || "").trim().toLowerCase();
  return normalized.startsWith("<!doctype html") || normalized.startsWith("<html") || normalized.includes("<body");
}

function normalizeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (!/^https?:$/i.test(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function sanitizeDownloadFilename(value) {
  const raw = String(value || "").replace(/\\/g, "/");
  const parts = raw
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\x00-\x1F]/g, "").trim())
    .filter(Boolean);
  return parts.length ? parts.join("/") : "download.bin";
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
