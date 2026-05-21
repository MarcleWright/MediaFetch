import { heicTo } from "./vendor/heic-to.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "mediafetch:offscreen-convert-heic-to-png") {
    return;
  }

  convertHeicToPngDataUrl(message)
    .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
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
