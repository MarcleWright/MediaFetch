let currentDownloadFolder = "";

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
