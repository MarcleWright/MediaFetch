const state = {
  images: [],
  videos: [],
  media: [],
  projectName: "ProjectsA",
  metadata: null,
  folderTouched: false,
  settings: null,
  extractionRange: "images",
  view: "main",
};

const mainViewEl = document.getElementById("mainView");
const settingsViewEl = document.getElementById("settingsView");
const settingsBtn = document.getElementById("settingsBtn");
const settingsBackBtn = document.getElementById("settingsBackBtn");
const refreshBtn = document.getElementById("refreshBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const clearBtn = document.getElementById("clearBtn");
const selectOriginalBtn = document.getElementById("selectOriginalBtn");
const downloadBtn = document.getElementById("downloadBtn");
const extractionRangeInput = document.getElementById("extractionRange");
const clipboardUrlInput = document.getElementById("clipboardUrlInput");
const clipboardUrlEl = document.getElementById("clipboardUrl");
const clipboardDownloadBtn = document.getElementById("clipboardDownloadBtn");
const clipboardBoxEl = document.getElementById("clipboardBox");
const convertHeicToPngInput = document.getElementById("settingConvertHeicToPng");
const settingLinkDownloadInput = document.getElementById("settingLinkDownload");
const settingLineageInput = document.getElementById("settingLineage");
const settingEagleInput = document.getElementById("settingEagle");
const folderNameInput = document.getElementById("folderName");
const selectionStatus = document.getElementById("selectionStatus");
const statusEl = document.getElementById("status");
const lineageBoxEl = document.getElementById("lineageBox");
const lineageRefreshBtn = document.getElementById("lineageRefreshBtn");
const lineageProbeBtn = document.getElementById("lineageProbeBtn");
const lineageFolderDropdownEl = document.getElementById("lineageFolderDropdown");
const lineageFolderTriggerBtn = document.getElementById("lineageFolderTrigger");
const lineageFolderTriggerText = document.getElementById("lineageFolderTriggerText");
const lineageFolderPanelEl = document.getElementById("lineageFolderPanel");
const lineageFolderSearchInput = document.getElementById("lineageFolderSearch");
const lineageFolderSelect = document.getElementById("lineageFolderSelect");
const lineageFolderTreeEl = document.getElementById("lineageFolderTree");
const lineageSaveSelectedBtn = document.getElementById("lineageSaveSelectedBtn");
const lineageSaveOriginalBtn = document.getElementById("lineageSaveOriginalBtn");
const lineageStatusEl = document.getElementById("lineageStatus");
const lineageDebugBoxEl = document.getElementById("lineageDebugBox");
const lineageDebugInfoEl = document.getElementById("lineageDebugInfo");
const eagleBoxEl = document.getElementById("eagleBox");
const eagleRefreshBtn = document.getElementById("eagleRefreshBtn");
const eagleProbeBtn = document.getElementById("eagleProbeBtn");
const eagleFolderDropdownEl = document.getElementById("eagleFolderDropdown");
const eagleFolderTriggerBtn = document.getElementById("eagleFolderTrigger");
const eagleFolderTriggerText = document.getElementById("eagleFolderTriggerText");
const eagleFolderPanelEl = document.getElementById("eagleFolderPanel");
const eagleFolderSearchInput = document.getElementById("eagleFolderSearch");
const eagleFolderSelect = document.getElementById("eagleFolderSelect");
const eagleFolderTreeEl = document.getElementById("eagleFolderTree");
const eagleSaveSelectedBtn = document.getElementById("eagleSaveSelectedBtn");
const eagleSaveOriginalBtn = document.getElementById("eagleSaveOriginalBtn");
const eagleStatusEl = document.getElementById("eagleStatus");
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
const eagleFeatureEnabled = features.eagleIntegration !== false;
const defaultEagleBaseUrl = normalizeEagleBaseUrl(features.defaultEagleBaseUrl || "http://localhost:41595");
const debugPanelEnabled = features.debugPanel !== false;
const WEIBO_ALBUM_EXTRACTION_MODE = "background";
const popupSettingsDefaults = {
  showLinkDownload: true,
  showLineage: true,
  showEagle: true,
  convertHeicToPng: false,
  extractionRange: "images",
};
const lineageFolderTreeState = {
  folders: [],
  selectedId: "",
  collapsedIds: new Set(),
  search: "",
  selectedLabel: "Root",
};
const eagleFolderTreeState = {
  folders: [],
  selectedId: "",
  collapsedIds: new Set(),
  search: "",
  selectedLabel: "Root",
};

folderNameInput.addEventListener("input", () => {
  state.folderTouched = true;
});

folderNameInput.addEventListener("change", () => {
  state.folderTouched = true;
});

refreshBtn.addEventListener("click", extractFromCurrentTab);
extractionRangeInput?.addEventListener("change", async () => {
  await savePopupSetting("extractionRange", normalizeExtractionRange(extractionRangeInput.value));
  await extractFromCurrentTab();
});
selectAllBtn.addEventListener("click", () => {
  getVisibleMediaItems().forEach((item) => {
    item.selected = true;
  });
  render();
});
clearBtn.addEventListener("click", () => {
  getVisibleMediaItems().forEach((item) => {
    item.selected = false;
  });
  render();
});
selectOriginalBtn.addEventListener("click", () => {
  state.images.forEach((item) => {
    item.selected = item.mediaType === "image" && !!item.isOriginal;
  });
  state.videos.forEach((item) => {
    item.selected = false;
  });
  syncMergedMediaState();
  render();
});
settingsBtn?.addEventListener("click", () => {
  showSettingsView();
});
settingsBackBtn?.addEventListener("click", () => {
  showMainView();
});
downloadBtn.addEventListener("click", downloadSelected);
clipboardDownloadBtn.addEventListener("click", downloadClipboardWeiboOriginal);
clipboardUrlInput.addEventListener("input", () => {
  updateClipboardLinkState(clipboardUrlInput.value);
});
convertHeicToPngInput?.addEventListener("change", saveConvertHeicToPngSetting);
settingLinkDownloadInput?.addEventListener("change", () => savePopupSetting("showLinkDownload", !!settingLinkDownloadInput.checked));
settingLineageInput?.addEventListener("change", () => savePopupSetting("showLineage", !!settingLineageInput.checked));
settingEagleInput?.addEventListener("change", () => savePopupSetting("showEagle", !!settingEagleInput.checked));
copyDebugBtn?.addEventListener("click", copyDebugInfo);
toggleDebugBtn?.addEventListener("click", toggleDebugSection);
lineageFolderSelect?.addEventListener("change", saveLineageSettings);
lineageFolderTriggerBtn?.addEventListener("click", () => {
  setLineageFolderDropdownOpen(lineageFolderPanelEl?.hidden !== false);
});
lineageFolderSearchInput?.addEventListener("input", () => {
  lineageFolderTreeState.search = String(lineageFolderSearchInput.value || "").trim().toLowerCase();
  renderLineageFolderTree();
});
lineageRefreshBtn?.addEventListener("click", refreshLineageFolders);
lineageProbeBtn?.addEventListener("click", probeLineageConnection);
lineageSaveSelectedBtn?.addEventListener("click", saveSelectedToLineage);
lineageSaveOriginalBtn?.addEventListener("click", saveOriginalToLineage);
eagleFolderSelect?.addEventListener("change", saveEagleSettings);
eagleFolderTriggerBtn?.addEventListener("click", () => {
  setEagleFolderDropdownOpen(eagleFolderPanelEl?.hidden !== false);
});
eagleFolderSearchInput?.addEventListener("input", () => {
  eagleFolderTreeState.search = String(eagleFolderSearchInput.value || "").trim().toLowerCase();
  renderEagleFolderTree();
});
document.addEventListener("click", (event) => {
  if (!lineageFolderDropdownEl?.contains(event.target)) {
    setLineageFolderDropdownOpen(false);
  }
  if (!eagleFolderDropdownEl?.contains(event.target)) {
    setEagleFolderDropdownOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setLineageFolderDropdownOpen(false);
    setEagleFolderDropdownOpen(false);
  }
});
eagleRefreshBtn?.addEventListener("click", refreshEagleFolders);
eagleProbeBtn?.addEventListener("click", probeEagleConnection);
eagleSaveSelectedBtn?.addEventListener("click", saveSelectedToEagle);
eagleSaveOriginalBtn?.addEventListener("click", saveOriginalToEagle);

initializePopup().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Popup init failed: ${message}`, true);
  renderDebugInfo({
    phase: "popup-init-error",
    version: "0.2.1",
    error: message,
  });
});

async function initializePopup() {
  initializeDebugPanel();
  await initializePopupSettings();
  await initializeLineageSettings();
  await initializeEagleSettings();
  applyPopupSettingsToUi();
  showMainView();
  extractFromCurrentTab();
}

async function initializePopupSettings() {
  const settings = await getStorageValues(popupSettingsDefaults);
  state.settings = normalizePopupSettings(settings);
  state.extractionRange = state.settings.extractionRange;
}

async function initializeConvertHeicToPngSetting() {
  if (!convertHeicToPngInput) {
    return;
  }

  convertHeicToPngInput.checked = !!state.settings?.convertHeicToPng;
}

async function initializeLineageSettings() {
  if (!lineageFeatureEnabled || !lineageBoxEl) {
    return;
  }

  lineageBoxEl.hidden = false;
  const settings = await getLineageSettings();
  await renderLineageFolders(settings.customFolderId);
}

async function initializeEagleSettings() {
  if (!eagleFeatureEnabled || !eagleBoxEl) {
    return;
  }

  eagleBoxEl.hidden = false;
  eagleBoxEl.removeAttribute("hidden");
  const settings = await getEagleSettings();
  await renderEagleFolders(settings.parentFolderId);
}

function initializeDebugPanel() {
  if (!debugPanelEnabled && debugBoxEl) {
    debugBoxEl.hidden = true;
  }
}

function normalizePopupSettings(settings) {
  const merged = {
    ...popupSettingsDefaults,
    ...(settings || {}),
  };

  return {
    showLinkDownload: merged.showLinkDownload !== false,
    showLineage: merged.showLineage !== false,
    showEagle: merged.showEagle !== false,
    convertHeicToPng: !!merged.convertHeicToPng,
    extractionRange: normalizeExtractionRange(merged.extractionRange || "images"),
  };
}

function getPopupSettings() {
  return normalizePopupSettings(state.settings);
}

function normalizeExtractionRange(value) {
  const normalized = String(value || "images").toLowerCase();
  if (normalized === "videos" || normalized === "both") {
    return normalized;
  }
  return "images";
}

async function savePopupSetting(key, value) {
  const nextSettings = {
    ...getPopupSettings(),
    [key]: !!value,
  };
  if (key === "extractionRange") {
    nextSettings.extractionRange = normalizeExtractionRange(value);
  }
  state.settings = nextSettings;
  state.extractionRange = nextSettings.extractionRange || state.extractionRange || "images";
  await chrome.storage.local.set(nextSettings);
  if (key === "showLineage" && nextSettings.showLineage) {
    await initializeLineageSettings();
  }
  if (key === "showEagle" && nextSettings.showEagle) {
    await initializeEagleSettings();
  }
  applyPopupSettingsToUi();
}

function applyPopupSettingsToUi() {
  const settings = getPopupSettings();
  if (settingLinkDownloadInput) {
    settingLinkDownloadInput.checked = settings.showLinkDownload;
  }
  if (settingLineageInput) {
    settingLineageInput.checked = settings.showLineage;
  }
  if (settingEagleInput) {
    settingEagleInput.checked = settings.showEagle;
  }
  if (convertHeicToPngInput) {
    convertHeicToPngInput.checked = settings.convertHeicToPng;
  }
  if (extractionRangeInput) {
    extractionRangeInput.value = normalizeExtractionRange(settings.extractionRange || state.extractionRange || "images");
  }

  if (clipboardBoxEl) {
    clipboardBoxEl.hidden = !settings.showLinkDownload;
  }
  if (lineageBoxEl) {
    lineageBoxEl.hidden = !lineageFeatureEnabled || !settings.showLineage;
  }
  if (eagleBoxEl) {
    eagleBoxEl.hidden = !eagleFeatureEnabled || !settings.showEagle;
  }
}

function showMainView() {
  state.view = "main";
  if (mainViewEl) {
    mainViewEl.hidden = false;
  }
  if (settingsViewEl) {
    settingsViewEl.hidden = true;
  }
  applyPopupSettingsToUi();
}

function showSettingsView() {
  state.view = "settings";
  if (mainViewEl) {
    mainViewEl.hidden = true;
  }
  if (settingsViewEl) {
    settingsViewEl.hidden = false;
  }
  applyPopupSettingsToUi();
}

function getConvertHeicToPngSetting() {
  return !!convertHeicToPngInput?.checked;
}

function getExtractionRangeSetting() {
  return normalizeExtractionRange(extractionRangeInput?.value || state.settings?.extractionRange || state.extractionRange || "images");
}

function saveConvertHeicToPngSetting() {
  if (!convertHeicToPngInput) {
    return Promise.resolve();
  }

  return savePopupSetting("convertHeicToPng", !!convertHeicToPngInput.checked);
}

function getStorageValues(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });
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

function getAllMediaItems() {
  return Array.isArray(state.media) ? state.media : [];
}

function getVisibleMediaItems() {
  const range = getExtractionRangeSetting();
  const items = getAllMediaItems();
  if (range === "images") {
    return items.filter((item) => item.mediaType !== "video");
  }
  if (range === "videos") {
    return items.filter((item) => item.mediaType === "video");
  }
  return items;
}

function getVisibleImages() {
  const range = getExtractionRangeSetting();
  if (range === "videos") {
    return [];
  }
  return Array.isArray(state.images) ? state.images : [];
}

function getVisibleVideos() {
  const range = getExtractionRangeSetting();
  if (range === "images") {
    return [];
  }
  return Array.isArray(state.videos) ? state.videos : [];
}

function getSelectedMediaItems() {
  return getAllMediaItems().filter((item) => item.selected);
}

function normalizeMediaItem(item, index = 0) {
  const mediaType = item?.mediaType === "video" ? "video" : "image";
  const url = normalizeHttpUrl(item?.url || "");
  const sourceUrl = normalizeHttpUrl(item?.sourceUrl || item?.url || "");
  const downloadStrategy = String(item?.download?.strategy || (mediaType === "video" ? "direct" : "fetchBlob"));
  return {
    id: String(item?.id || `${mediaType}:${index + 1}`),
    mediaType,
    url,
    sourceUrl,
    thumbnail: normalizeHttpUrl(item?.thumbnail || "") || item?.thumbnail || url,
    previewUrl: normalizeHttpUrl(item?.previewUrl || "") || item?.previewUrl || url,
    posterUrl: normalizeHttpUrl(item?.posterUrl || "") || item?.posterUrl || "",
    format: item?.format || "Unknown",
    resolution: item?.resolution || "Unknown",
    size: item?.size || "Unknown",
    width: Number(item?.width || 0),
    height: Number(item?.height || 0),
    duration: Number(item?.duration || 0),
    isOriginal: !!item?.isOriginal,
    selected: !!item?.selected,
    score: Number(item?.score || 0),
    area: Number(item?.area || 0),
    download: {
      strategy: downloadStrategy === "fetchBlob" ? "fetchBlob" : "direct",
    },
  };
}

function normalizeExtractionMedia(response) {
  const media = [];
  const rawMedia = Array.isArray(response?.media) ? response.media : null;
  if (rawMedia?.length) {
    rawMedia.forEach((item, index) => {
      media.push(normalizeMediaItem(item, index));
    });
    return media;
  }

  const rawImages = Array.isArray(response?.images) ? response.images : [];
  rawImages.forEach((item, index) => {
    media.push(normalizeMediaItem({
      ...item,
      mediaType: "image",
      download: item?.download || { strategy: "fetchBlob" },
    }, index));
  });

  const rawVideos = Array.isArray(response?.videos) ? response.videos : [];
  rawVideos.forEach((item, index) => {
    media.push(normalizeMediaItem({
      ...item,
      mediaType: "video",
      download: item?.download || { strategy: "direct" },
    }, rawImages.length + index));
  });
  return media;
}

function normalizeExtractionResponse(response) {
  const media = normalizeExtractionMedia(response);
  const images = media.filter((item) => item.mediaType !== "video");
  const videos = media.filter((item) => item.mediaType === "video");
  return {
    ...response,
    media,
    images,
    videos,
  };
}

function applyExtractionResponse(extracted) {
  state.images = Array.isArray(extracted?.images)
    ? extracted.images.map((item) => ({ ...item, selected: false }))
    : [];
  state.videos = Array.isArray(extracted?.videos)
    ? extracted.videos.map((item) => ({ ...item, selected: false }))
    : [];
  state.media = [...state.images, ...state.videos];
}

function syncMergedMediaState() {
  state.media = [...(Array.isArray(state.images) ? state.images : []), ...(Array.isArray(state.videos) ? state.videos : [])];
}

function countMediaTypes(media) {
  return Array.isArray(media)
    ? media.reduce((acc, item) => {
      if (item?.mediaType === "video") {
        acc.videos += 1;
      } else {
        acc.images += 1;
      }
      return acc;
    }, { images: 0, videos: 0 })
    : { images: 0, videos: 0 };
}

function renderMediaStatusText(media) {
  const counts = countMediaTypes(media);
  const total = counts.images + counts.videos;
  if (!total) {
    return "No media found on the current page.";
  }

  const parts = [`Found ${total} item(s)`];
  if (counts.images) {
    parts.push(`${counts.images} image(s)`);
  }
  if (counts.videos) {
    parts.push(`${counts.videos} video(s)`);
  }
  return `${parts[0]}: ${parts.slice(1).join(", ")}.`;
}

async function extractFromCurrentTab() {
  try {
    const extractionRange = getExtractionRangeSetting();
    state.extractionRange = extractionRange;
    setStatus("Extracting media...");
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
      version: "0.2.1",
      contentBuildHash: "1153",
      extractionRange,
    });

    const originalTabUrl = String(tab.url || "");
    const useSpecialImageFlow = extractionRange !== "videos";

    if (useSpecialImageFlow && /^https:\/\/www\.instagram\.com\//i.test(originalTabUrl)) {
      const response = await requestInstagramExtractionInBackground(tab, extractionRange);
      if (!response?.ok) {
        throw new Error(response?.error || "Instagram background extraction failed.");
      }

      const extracted = normalizeExtractionResponse(response.response || response);
      applyExtractionResponse(extracted);
      const previousProjectName = state.projectName || "";
      state.projectName = extracted.projectName || "ProjectsA";
      state.metadata = extracted.metadata || null;
      const debug = extracted.debug || {};
      const responseClient = debug.client || {};
      debug.client = {
        ...responseClient,
        version: "0.2.1",
        contentBuildHash: "1153",
        probeError: responseClient.probeError || "",
        instagramSamplingError: responseClient.instagramSamplingError || "",
        weiboSamplingError: responseClient.weiboSamplingError || "",
        instagramResolvedPostPath: responseClient.instagramResolvedPostPath || "",
        instagramInitialCarouselCount: responseClient.instagramInitialCarouselCount || 0,
        instagramContextSource: responseClient.instagramContextSource || "",
        maxIndexHint: responseClient.maxIndexHint || 0,
        instagramProbeMaxIndex: responseClient.instagramProbeMaxIndex || 0,
        instagramSampleMaxIndex: responseClient.instagramSampleMaxIndex || responseClient.maxIndexHint || 0,
        instagramSampleIndexes: responseClient.instagramSampleIndexes || [],
        instagramSampledUrlCount: responseClient.instagramSampledUrlCount || 0,
        weiboSampleLayerIds: responseClient.weiboSampleLayerIds || [],
        weiboSampledUrlCount: responseClient.weiboSampledUrlCount || 0,
        instagramBackgroundExtraction: true,
        instagramBackgroundTabOpened: !!responseClient.instagramBackgroundTabOpened,
        instagramExtractionMode: responseClient.instagramExtractionMode || "background",
        instagramSourceUrl: originalTabUrl,
        extractionRange,
      };
      renderDebugInfo(debug);

      const currentFolderInput = folderNameInput.value.trim();
      if (!state.folderTouched || !currentFolderInput || currentFolderInput === previousProjectName) {
        folderNameInput.value = state.projectName;
        state.folderTouched = false;
      }

      setStatus(renderMediaStatusText(state.media));
      render();
      return;
    }

    if (useSpecialImageFlow && isWeiboAlbumUrl(originalTabUrl)) {
      let albumProbe = null;
      let albumProbeError = "";
      try {
        albumProbe = await requestWeiboAlbumProbe(tab);
      } catch (error) {
        albumProbeError = error instanceof Error ? error.message : String(error);
      }

      const albumDebug = albumProbe?.album || null;
      const albumDetailUrl = getWeiboAlbumResolvedDetailUrl(albumDebug);
      if (!albumDetailUrl) {
        throw new Error(albumProbeError || "Could not resolve Weibo album project ID.");
      }

      const response = await requestWeiboAlbumExtractionInBackground(albumDetailUrl, 0, tab.index, extractionRange);
      if (!response?.ok) {
        throw new Error(response?.error || "Weibo album background extraction failed.");
      }

      const extracted = normalizeExtractionResponse(response.response || response);
      applyExtractionResponse(extracted);
      const previousProjectName = state.projectName || "";
      state.projectName = extracted.projectName || "ProjectsA";
      state.metadata = extracted.metadata || null;
      const debug = extracted.debug || {};
      debug.client = {
        version: "0.2.1",
        contentBuildHash: "1153",
        probeError: "",
        instagramSamplingError: "",
        weiboSamplingError: "",
        instagramResolvedPostPath: "",
        instagramInitialCarouselCount: 0,
        instagramContextSource: "",
        maxIndexHint: 0,
        instagramSampleIndexes: [],
        instagramSampledUrlCount: 0,
        weiboSampleLayerIds: [],
        weiboSampledUrlCount: 0,
        weiboAlbumSamplingPaused: true,
        weiboAlbumProbeOnly: true,
        weiboAlbumProbeError: albumProbeError,
        weiboAlbumResolvedDetailUrl: albumDetailUrl,
        weiboAlbumRedirectedToDetail: true,
        weiboAlbumOpenedProjectTab: false,
        weiboAlbumExtractionMode: WEIBO_ALBUM_EXTRACTION_MODE,
        weiboAlbumRedirectError: "",
        weiboAlbumSourceUrl: originalTabUrl,
        extractionRange,
      };
      if (debug.weibo && albumDebug) {
        debug.weibo.album = albumDebug;
      }
      renderDebugInfo(debug);

      const currentFolderInput = folderNameInput.value.trim();
      if (!state.folderTouched || !currentFolderInput || currentFolderInput === previousProjectName) {
        folderNameInput.value = state.projectName;
        state.folderTouched = false;
      }

      setStatus(renderMediaStatusText(state.media));
      render();
      return;
    }

    const instagramNav = useSpecialImageFlow ? await resolveInstagramNavigationContext(tab) : {
      resolvedPostPath: "",
      initialCarouselCount: 0,
      source: "",
      context: null,
    };
    let maxIndexHint = 0;
    let probeError = "";
    if (useSpecialImageFlow) {
      try {
        maxIndexHint = await probeInstagramMaxIndex(tab, instagramNav);
      } catch (error) {
        probeError = error instanceof Error ? error.message : String(error);
      }
    }

    let instagramSamples = { urls: [], indexes: [] };
    let instagramSamplingError = "";
    if (useSpecialImageFlow) {
      try {
        instagramSamples = await collectInstagramRenderedSamples(tab, instagramNav.resolvedPostPath, maxIndexHint);
      } catch (error) {
        instagramSamplingError = error instanceof Error ? error.message : String(error);
      }
    }

    let weiboSamples = { urls: [], layerIds: [] };
    let weiboSamplingError = "";
    if (useSpecialImageFlow) {
      try {
        weiboSamples = await collectWeiboRenderedSamples(tab);
      } catch (error) {
        weiboSamplingError = error instanceof Error ? error.message : String(error);
      }
    }

    const sampledUrls = [...instagramSamples.urls, ...weiboSamples.urls];
    const sampledIndexes = [...instagramSamples.indexes, ...weiboSamples.layerIds];
    let response = await requestExtraction(tab, maxIndexHint, sampledUrls, sampledIndexes, extractionRange);
    if (!response?.ok) {
      throw new Error(response?.error || "Extraction failed.");
    }

    const albumDebug = response?.debug?.weibo?.album || null;
    const albumDetailUrl = getWeiboAlbumResolvedDetailUrl(albumDebug);
    let albumRedirectedToDetail = false;
    let albumRedirectError = "";
    let albumOpenedProjectTab = false;
    if (useSpecialImageFlow && isWeiboAlbumUrl(originalTabUrl) && albumDetailUrl && normalizeHttpUrl(albumDetailUrl) && normalizeHttpUrl(albumDetailUrl) !== normalizeHttpUrl(originalTabUrl)) {
      if (WEIBO_ALBUM_EXTRACTION_MODE === "visible") {
        try {
          const detailTab = await chrome.tabs.create({
            url: albumDetailUrl,
            active: true,
            index: typeof tab.index === "number" ? tab.index + 1 : undefined,
          });
          await waitForTabComplete(detailTab.id, 15000);
          await delay(1200);

          weiboSamples = await collectWeiboRenderedSamples(detailTab);

          const redirectedSampledUrls = [...instagramSamples.urls, ...weiboSamples.urls];
          const redirectedSampledIndexes = [...instagramSamples.indexes, ...weiboSamples.layerIds];
          const redirectedResponse = await requestExtraction(detailTab, maxIndexHint, redirectedSampledUrls, redirectedSampledIndexes, extractionRange);
          if (!redirectedResponse?.ok) {
            throw new Error(redirectedResponse?.error || "Extraction failed.");
          }

          response = redirectedResponse;
          albumRedirectedToDetail = true;
          albumOpenedProjectTab = true;
          if (response.debug && albumDebug) {
            response.debug.weibo = response.debug.weibo || {};
            response.debug.weibo.album = albumDebug;
          }
        } catch (error) {
          albumRedirectError = error instanceof Error ? error.message : String(error);
        }
      } else {
        try {
          const backgroundResponse = await requestWeiboAlbumExtractionInBackground(albumDetailUrl, maxIndexHint, tab.index, extractionRange);
          if (!backgroundResponse?.ok) {
            throw new Error(backgroundResponse?.error || "Weibo album background extraction failed.");
          }

          response = backgroundResponse.response || backgroundResponse;
          albumRedirectedToDetail = true;
          if (response.debug && albumDebug) {
            response.debug.weibo = response.debug.weibo || {};
            response.debug.weibo.album = albumDebug;
          }
        } catch (error) {
          albumRedirectError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    const extracted = normalizeExtractionResponse(response.response || response);
    applyExtractionResponse(extracted);
    const previousProjectName = state.projectName || "";
    state.projectName = extracted.projectName || "ProjectsA";
    state.metadata = extracted.metadata || null;
    const debug = extracted.debug || {};
    debug.client = {
      version: "0.2.1",
      contentBuildHash: "1153",
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
      weiboAlbumSamplingPaused: isWeiboAlbumUrl(originalTabUrl),
      weiboAlbumResolvedDetailUrl: albumDetailUrl || "",
      weiboAlbumRedirectedToDetail: albumRedirectedToDetail,
      weiboAlbumOpenedProjectTab: albumOpenedProjectTab,
      weiboAlbumExtractionMode: WEIBO_ALBUM_EXTRACTION_MODE,
      weiboAlbumRedirectError: albumRedirectError,
      weiboAlbumSourceUrl: originalTabUrl,
      extractionRange,
    };
    renderDebugInfo(debug);

    const currentFolderInput = folderNameInput.value.trim();
    if (!state.folderTouched || !currentFolderInput || currentFolderInput === previousProjectName) {
      folderNameInput.value = state.projectName;
        state.folderTouched = false;
      }

    setStatus(renderMediaStatusText(state.media));
    render();
  } catch (error) {
    state.images = [];
    state.videos = [];
    state.media = [];
    renderDebugInfo({
      phase: "error",
      version: "0.2.1",
      error: error instanceof Error ? error.message : String(error),
    });
    render();
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function requestExtraction(tab, maxIndexHint = 0, sampledUrls = [], sampledIndexes = [], extractionRange = "images") {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:extract", maxIndexHint, sampledUrls, sampledIndexes, extractionRange });
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
      return await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:extract", maxIndexHint, sampledUrls, sampledIndexes, extractionRange });
    } catch {
      throw new Error("Could not connect to the page. Reload the tab once and try again.");
    }
  }
}

async function requestWeiboAlbumProbe(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:weibo-album-probe" });
    return response?.ok ? response : null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "mediafetch:weibo-album-probe" });
    return response?.ok ? response : null;
  }
}

async function requestWeiboAlbumExtractionInBackground(albumDetailUrl, maxIndexHint = 0, sourceTabIndex = null, extractionRange = "images") {
  return await chrome.runtime.sendMessage({
    type: "mediafetch:extract-weibo-album",
    albumDetailUrl,
    maxIndexHint,
    sourceTabIndex,
    extractionMode: WEIBO_ALBUM_EXTRACTION_MODE,
    extractionRange,
  });
}

async function requestInstagramExtractionInBackground(tab, extractionRange = "images") {
  return await chrome.runtime.sendMessage({
    type: "mediafetch:extract-instagram",
    sourceUrl: tab?.url || "",
    sourceTabIndex: Number.isFinite(tab?.index) ? tab.index : null,
    extractionMode: "background",
    extractionRange,
  });
}

function getWeiboAlbumResolvedDetailUrl(albumDebug) {
  const url = normalizeHttpUrl(albumDebug?.resolvedDetailUrl || "");
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    if (!/^https:\/\/weibo\.com$/i.test(`${parsed.protocol}//${parsed.hostname}`)) {
      return "";
    }

    if (!/^\/\d+\/[A-Za-z0-9]+\/?$/.test(parsed.pathname)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
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

function isWeiboAlbumUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return /^https:\/\/weibo\.com$/i.test(`${parsed.protocol}//${parsed.hostname}`) &&
      /^\/\d+\/?$/.test(parsed.pathname) &&
      parsed.searchParams.get("tabtype") === "album" &&
      /^\d+$/.test(parsed.searchParams.get("uid") || "") &&
      /^\d+$/.test(parsed.searchParams.get("index") || "");
  } catch {
    return false;
  }
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

  if (isWeiboAlbumUrl(url)) {
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
  const INSTAGRAM_MAX_PROBE_INDEX = 21;
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
    await delay(1200);
    const finalUrl = await waitForInstagramProbeUrl(tabId, INSTAGRAM_MAX_PROBE_INDEX, 10000);
    const finalParsed = new URL(finalUrl);
    const value = Number.parseInt(finalParsed.searchParams.get("img_index") || "", 10);
    if (Number.isFinite(value) && value > 0 && value < INSTAGRAM_MAX_PROBE_INDEX) {
      return value;
    }

    const snapshot = await requestInstagramRenderedSnapshot(tab);
    if (!snapshot?.containerFound) {
      return 1;
    }

    const currentIndex = Number(snapshot?.currentImgIndex || 0);
    if (Number.isFinite(currentIndex) && currentIndex > 0 && currentIndex < INSTAGRAM_MAX_PROBE_INDEX) {
      return currentIndex;
    }

    return 0;
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
  const INSTAGRAM_MAX_PROBE_INDEX = 21;
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
    parsed.searchParams.set("img_index", String(INSTAGRAM_MAX_PROBE_INDEX));
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
  const selected = getSelectedMediaItems();
  if (!selected.length) return;

  const folder = sanitizeFolderName(folderNameInput.value.trim() || state.projectName || "ProjectsA");
  setStatus("Queueing download...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await enqueueSelectionDownload({
      folder,
      media: selected.map((item) => ({
        id: item.id,
        url: item.url,
        sourceUrl: item.sourceUrl,
        format: item.format,
        mediaType: item.mediaType,
        isOriginal: !!item.isOriginal,
        thumbnail: item.thumbnail,
        previewUrl: item.previewUrl,
        posterUrl: item.posterUrl,
        resolution: item.resolution,
        size: item.size,
        width: item.width,
        height: item.height,
        duration: item.duration,
        download: item.download,
      })),
      metadata: state.metadata,
      pageUrl: tab?.url || "",
      convertHeicToPng: getConvertHeicToPngSetting(),
    });
    const queuedAhead = Number(result?.queuedAhead || 0);
    if (result?.active || queuedAhead > 0) {
      setStatus(`Queued ${selected.length} item(s). ${queuedAhead} task(s) ahead.`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Download failed: ${message}`, true);
    return;
  }

  setStatus(`Download started for ${selected.length} item(s) in "${folder}".`);
}

async function saveSelectedToLineage() {
  const selected = getVisibleImages().filter((item) => item.selected);
  await saveImagesToLineage(selected);
}

async function saveOriginalToLineage() {
  const originals = getVisibleImages().filter((item) => item.isOriginal);
  state.images.forEach((item) => {
    item.selected = !!item.isOriginal;
  });
  state.videos.forEach((item) => {
    item.selected = false;
  });
  syncMergedMediaState();
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
      media: selected.map((item) => ({
        id: item.id,
        url: item.url,
        sourceUrl: item.sourceUrl,
        format: item.format,
        mediaType: item.mediaType,
        isOriginal: !!item.isOriginal,
        thumbnail: item.thumbnail,
        previewUrl: item.previewUrl,
        posterUrl: item.posterUrl,
        resolution: item.resolution,
        size: item.size,
        width: item.width,
        height: item.height,
        duration: item.duration,
        download: item.download,
      })),
      metadata: state.metadata,
      pageUrl: tab?.url || "",
      lineage,
      lineageOnly: true,
      convertHeicToPng: getConvertHeicToPngSetting(),
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

async function saveSelectedToEagle() {
  const selected = getVisibleImages().filter((item) => item.selected);
  await saveImagesToEagle(selected);
}

async function saveOriginalToEagle() {
  const originals = getVisibleImages().filter((item) => item.isOriginal);
  state.images.forEach((item) => {
    item.selected = !!item.isOriginal;
  });
  state.videos.forEach((item) => {
    item.selected = false;
  });
  syncMergedMediaState();
  render();
  await saveImagesToEagle(originals);
}

async function saveImagesToEagle(selected) {
  if (!selected.length) return;

  const folder = sanitizeFolderName(folderNameInput.value.trim() || state.projectName || "ProjectsA");
  const eagle = await getEagleSaveOptions(folder, { requireEnabled: false });
  setEagleStatus("Sending to Eagle...", false);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await sendImagesToEagle({
      images: selected.filter((item) => item.mediaType !== "video").map((item) => ({
        url: item.url,
        sourceUrl: item.sourceUrl,
        format: item.format,
        isOriginal: !!item.isOriginal,
      })),
      metadata: state.metadata,
      pageUrl: tab?.url || "",
      eagle,
      convertHeicToPng: getConvertHeicToPngSetting(),
    });
    setEagleStatus(`Saved ${Number(result?.importedCount || selected.filter((item) => item.mediaType !== "video").length)} image(s) to Eagle.`, false);
  } catch (error) {
    setEagleStatus(`Eagle save failed: ${error instanceof Error ? error.message : String(error)}`, true);
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
    throw new Error(`Media request failed: ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Unexpected response type: ${contentType}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("Media response was empty.");
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
  const counts = options.counts || { images: Number(options.imageCount || 0), videos: Number(options.videoCount || 0) };
  return {
    ...(baseMetadata || {}),
    folderName: options.folderName,
    downloadedAt: new Date().toISOString(),
    imageCount: Number(options.imageCount || 0),
    originalCount: Number(options.originalCount || 0),
    videoCount: Number(options.videoCount || 0),
    counts,
    pluginVersion: options.pluginVersion || "0.2.1",
  };
}

async function getLineageDownloadOptions(folderName, options = {}) {
  if (!lineageFeatureEnabled) {
    return null;
  }

  await saveLineageSettings();
  const settings = await getLineageSettings();
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
      lineageBaseUrl: defaultLineageBaseUrl,
      lineageToken: defaultLineageToken,
      lineageCustomFolderId: "",
    }, (items) => {
      resolve({
        enabled: true,
        baseUrl: normalizeLineageBaseUrl(defaultLineageBaseUrl || items.lineageBaseUrl),
        token: String(defaultLineageToken || items.lineageToken || ""),
        customFolderId: String(items.lineageCustomFolderId || ""),
      });
    });
  });
}

function saveLineageSettings() {
  if (!lineageFeatureEnabled) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({
      lineageBaseUrl: defaultLineageBaseUrl,
      lineageToken: defaultLineageToken,
      lineageCustomFolderId: String(lineageFolderTreeState.selectedId || lineageFolderSelect?.value || ""),
    }, resolve);
  });
}

async function getEagleSaveOptions(folderName, options = {}) {
  if (!eagleFeatureEnabled) {
    return null;
  }

  await saveEagleSettings();
  const settings = await getEagleSettings();
  if (!settings.baseUrl) {
    throw new Error("Eagle API URL is missing from features.js.");
  }

  return {
    enabled: true,
    baseUrl: settings.baseUrl,
    folderName,
    parentFolderId: settings.parentFolderId || "",
  };
}

function getEagleSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      eagleBaseUrl: defaultEagleBaseUrl,
      eagleParentFolderId: "",
    }, (items) => {
      resolve({
        enabled: true,
        baseUrl: normalizeEagleBaseUrl(defaultEagleBaseUrl || items.eagleBaseUrl),
        parentFolderId: String(items.eagleParentFolderId || ""),
      });
    });
  });
}

function saveEagleSettings() {
  if (!eagleFeatureEnabled) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({
      eagleBaseUrl: defaultEagleBaseUrl,
      eagleParentFolderId: String(eagleFolderTreeState.selectedId || eagleFolderSelect?.value || ""),
    }, resolve);
  });
}

async function refreshEagleFolders() {
  try {
    await saveEagleSettings();
    const settings = await getEagleSettings();
    await renderEagleFolders(settings.parentFolderId);
  } catch (error) {
    setEagleStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function probeEagleConnection() {
  if (!eagleFeatureEnabled) {
    setEagleStatus("Eagle feature is disabled.", true);
    return;
  }

  eagleProbeBtn.disabled = true;
  setEagleStatus("Running Eagle probe...", false);
  try {
    const settings = await getEagleSettings();
    const [info, folders] = await Promise.all([
      eagleRequest(settings, ""),
      eagleRequest(settings, "/api/folder/list"),
    ]);
    const folderCount = normalizeEagleFolderOptions(folders).length;
    setEagleStatus(`Eagle connected. ${folderCount} folder(s) loaded.`, false);
    await renderEagleFolders(settings.parentFolderId);
    renderDebugInfo({
      phase: "eagle-probe",
      eagleVersion: info?.data?.version || "",
      buildVersion: info?.data?.buildVersion || "",
      folderCount,
    });
  } catch (error) {
    setEagleStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    eagleProbeBtn.disabled = false;
  }
}

async function renderEagleFolders(selectedId = "") {
  if (!eagleFolderSelect || !eagleFolderTreeEl) {
    return;
  }

  eagleRefreshBtn.disabled = true;
  try {
    const settings = await getEagleSettings();
    const payload = await eagleRequest(settings, "/api/folder/list");
    const folders = normalizeEagleFolderTree(payload);
    const flatFolders = flattenEagleFolderTree(folders);
    const activeId = selectedId || eagleFolderTreeState.selectedId || String(eagleFolderSelect.value || "");

    eagleFolderSelect.innerHTML = "";
    eagleFolderSelect.appendChild(createFolderOption("", "Root"));
    for (const folder of flatFolders) {
      eagleFolderSelect.appendChild(createFolderOption(folder.id, buildEagleFolderLabel(folder)));
    }

    eagleFolderTreeState.folders = folders;
    eagleFolderTreeState.selectedId = flatFolders.some((folder) => folder.id === activeId) ? activeId : "";
    eagleFolderSelect.value = eagleFolderTreeState.selectedId;
    updateEagleFolderTriggerLabel();
    renderEagleFolderTree();
    await saveEagleSettings();
    setEagleStatus("", false);
  } catch (error) {
    eagleFolderSelect.innerHTML = "";
    eagleFolderSelect.appendChild(createFolderOption("", "Root"));
    eagleFolderTreeState.folders = [];
    eagleFolderTreeState.selectedId = "";
    updateEagleFolderTriggerLabel();
    renderEagleFolderTree();
    setEagleStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    eagleRefreshBtn.disabled = false;
  }
}

function setEagleFolderDropdownOpen(isOpen) {
  if (!eagleFolderPanelEl || !eagleFolderTriggerBtn) {
    return;
  }

  eagleFolderPanelEl.hidden = !isOpen;
  eagleFolderTriggerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (isOpen) {
    eagleFolderSearchInput?.focus();
  }
}

function updateEagleFolderTriggerLabel() {
  if (!eagleFolderTriggerText) {
    return;
  }

  const selected = findEagleFolderById(eagleFolderTreeState.folders, eagleFolderTreeState.selectedId);
  eagleFolderTreeState.selectedLabel = selected?.fullPath || selected?.name || "Root";
  eagleFolderTriggerText.textContent = eagleFolderTreeState.selectedLabel;
  eagleFolderTriggerText.title = eagleFolderTreeState.selectedLabel;
}

function findEagleFolderById(nodes, id) {
  const targetId = String(id || "");
  if (!targetId) {
    return null;
  }

  for (const node of nodes || []) {
    if (String(node?.id || "") === targetId) {
      return { ...node, fullPath: buildEagleFolderPath(node) };
    }
    const child = findEagleFolderById(getEagleFolderChildren(node), targetId);
    if (child) {
      return child;
    }
  }
  return null;
}

function renderEagleFolderTree() {
  if (!eagleFolderTreeEl) {
    return;
  }

  eagleFolderTreeEl.innerHTML = "";
  if (!eagleFolderTreeState.search) {
    const rootRow = createEagleFolderTreeRow({
      id: "",
      name: "Root",
      depth: 0,
      children: eagleFolderTreeState.folders,
      fullPath: "Root",
    }, { isRoot: true });
    eagleFolderTreeEl.appendChild(rootRow);
  }

  const rows = eagleFolderTreeState.search
    ? buildRankedEagleSearchResults(eagleFolderTreeState.folders, eagleFolderTreeState.search)
    : buildVisibleEagleFolderRows(eagleFolderTreeState.folders);

  if (!rows.length && eagleFolderTreeState.search) {
    const empty = document.createElement("div");
    empty.className = "folderTreeEmpty";
    empty.textContent = "No matching folders.";
    eagleFolderTreeEl.appendChild(empty);
    return;
  }

  for (const folder of rows) {
    eagleFolderTreeEl.appendChild(createEagleFolderTreeRow(folder));
  }
}

function createEagleFolderTreeRow(folder, options = {}) {
  const row = document.createElement("div");
  row.className = "folderTreeRow";
  row.setAttribute("role", "treeitem");
  row.style.paddingLeft = `${Math.min(Number(folder.depth || 0), 8) * 14}px`;
  if (String(folder.id || "") === eagleFolderTreeState.selectedId) {
    row.classList.add("selected");
  }

  const childCount = getEagleFolderChildren(folder).length;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "folderTreeToggle";
  toggle.disabled = options.isRoot || !childCount || !!eagleFolderTreeState.search;
  toggle.textContent = childCount && !options.isRoot
    ? eagleFolderTreeState.collapsedIds.has(folder.id) ? "+" : "-"
    : "";
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (eagleFolderTreeState.collapsedIds.has(folder.id)) {
      eagleFolderTreeState.collapsedIds.delete(folder.id);
    } else {
      eagleFolderTreeState.collapsedIds.add(folder.id);
    }
    renderEagleFolderTree();
  });

  const name = document.createElement("button");
  name.type = "button";
  name.className = "folderTreeName";
  const primary = document.createElement("span");
  primary.className = "folderTreeNamePrimary";
  primary.textContent = options.isRoot
    ? "Root"
    : `${folder.name || "Untitled"}${childCount && !eagleFolderTreeState.search ? ` (${childCount})` : ""}`;
  primary.title = primary.textContent;
  name.appendChild(primary);

  if (eagleFolderTreeState.search && folder.fullPath) {
    const path = document.createElement("span");
    path.className = "folderTreeNamePath";
    path.textContent = folder.fullPath;
    path.title = folder.fullPath;
    name.appendChild(path);
  }

  name.addEventListener("click", () => {
    eagleFolderTreeState.selectedId = String(folder.id || "");
    if (eagleFolderSelect) {
      eagleFolderSelect.value = eagleFolderTreeState.selectedId;
    }
    updateEagleFolderTriggerLabel();
    saveEagleSettings();
    renderEagleFolderTree();
    setEagleFolderDropdownOpen(false);
  });

  row.appendChild(toggle);
  row.appendChild(name);
  return row;
}

function buildVisibleEagleFolderRows(nodes, depth = 0, output = []) {
  const search = eagleFolderTreeState.search;
  for (const node of nodes || []) {
    const children = getEagleFolderChildren(node);
    const name = String(node?.name || "").toLowerCase();
    const selfMatches = !search || name.includes(search);
    const childOutput = [];
    buildVisibleEagleFolderRows(children, depth + 1, childOutput);
    const hasMatchingChild = childOutput.length > 0;
    const shouldShow = !search || selfMatches || hasMatchingChild;

    if (!shouldShow) {
      continue;
    }

    const folder = { ...node, depth, children, fullPath: buildEagleFolderPath(node) };
    output.push(folder);
    if (search || !eagleFolderTreeState.collapsedIds.has(node.id)) {
      if (search) {
        output.push(...childOutput);
      } else {
        buildVisibleEagleFolderRows(children, depth + 1, output);
      }
    }
  }
  return output;
}

function buildRankedEagleSearchResults(nodes, search) {
  const flatFolders = flattenEagleFolderTree(nodes).map((folder) => ({
    ...folder,
    fullPath: buildEagleFolderPath(folder),
  }));

  return flatFolders
    .map((folder) => ({
      ...folder,
      score: getFolderSearchScore(String(folder.name || ""), search),
    }))
    .filter((folder) => folder.score !== null)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (left.name.length !== right.name.length) return left.name.length - right.name.length;
      return String(left.fullPath || "").localeCompare(String(right.fullPath || ""), "en");
    });
}

function getFolderSearchScore(name, search) {
  const normalizedName = String(name || "").toLowerCase();
  if (!search) return 99;
  if (normalizedName === search) return 0;
  if (normalizedName.startsWith(search)) return 1;
  if (normalizedName.includes(search)) return 2;
  return null;
}

function normalizeEagleFolderOptions(payload) {
  return flattenEagleFolderTree(normalizeEagleFolderTree(payload));
}

function normalizeEagleFolderTree(payload) {
  const root = Array.isArray(payload?.data) ? payload.data : [];
  return normalizeEagleFolderNodes(root, null);
}

function normalizeEagleFolderNodes(nodes, parentNode = null) {
  return (nodes || []).map((node) => {
    const normalizedNode = {
      ...node,
      parentNode,
      children: [],
    };
    normalizedNode.children = normalizeEagleFolderNodes(getEagleFolderChildren(node), normalizedNode);
    return normalizedNode;
  });
}

function getEagleFolderChildren(folder) {
  return Array.isArray(folder?.children) ? folder.children : [];
}

function buildEagleFolderPath(folder) {
  const parts = [];
  let current = folder;
  while (current) {
    if (current.name) {
      parts.push(String(current.name));
    }
    current = current.parentNode || null;
  }
  return parts.reverse().join(" / ");
}

function flattenEagleFolderTree(nodes, depth = 0, output = []) {
  for (const node of nodes || []) {
    output.push({ ...node, depth });
    flattenEagleFolderTree(Array.isArray(node?.children) ? node.children : [], depth + 1, output);
  }
  return output;
}

function buildEagleFolderLabel(folder) {
  const prefix = folder?.depth > 0 ? `${"  ".repeat(folder.depth)}- ` : "";
  const name = String(folder?.name || "Untitled");
  const childCount = Number(folder?.children?.length || folder?.childCount || 0);
  return childCount ? `${prefix}${name} (${childCount} folders)` : `${prefix}${name}`;
}

function createFolderOption(value, label) {
  const option = document.createElement("option");
  option.value = String(value || "");
  option.textContent = label;
  return option;
}

async function eagleRequest(settings, path, options = {}) {
  const baseUrl = normalizeEagleBaseUrl(settings.baseUrl);
  if (!baseUrl) {
    throw new Error("Eagle API URL is required.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
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

function setEagleStatus(message, isError = false) {
  if (!eagleStatusEl) return;
  eagleStatusEl.textContent = message;
  eagleStatusEl.classList.toggle("error", isError);
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
    contentBuildHash: "1153",
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
  if (!debugPanelEnabled || !lineageDebugBoxEl || !lineageDebugInfoEl) return;
  lineageDebugBoxEl.hidden = false;
  lineageDebugBoxEl.open = false;
  lineageDebugInfoEl.textContent = JSON.stringify(debug, null, 2);
}

async function renderLineageFolders(selectedId = "") {
  if (!lineageFolderSelect || !lineageFolderTreeEl) {
    return;
  }

  lineageRefreshBtn.disabled = true;
  try {
    const settings = await getLineageSettings();
    const payload = await lineageRequest(settings, "/custom-folders");
    const folders = normalizeLineageFolderTree(payload);
    const flatFolders = flattenLineageFolderTree(folders);
    const activeId = selectedId || lineageFolderTreeState.selectedId || String(lineageFolderSelect.value || "");

    lineageFolderSelect.innerHTML = "";
    lineageFolderSelect.appendChild(createLineageFolderOption("", "Root"));
    for (const folder of flatFolders) {
      const label = buildLineageFolderLabel(folder);
      lineageFolderSelect.appendChild(createLineageFolderOption(folder.id, label));
    }

    lineageFolderTreeState.folders = folders;
    lineageFolderTreeState.selectedId = flatFolders.some((folder) => String(folder.id || "") === String(activeId || "")) ? String(activeId || "") : "";
    lineageFolderSelect.value = lineageFolderTreeState.selectedId;
    updateLineageFolderTriggerLabel();
    renderLineageFolderTree();
    await saveLineageSettings();
    setLineageStatus("", false);
  } catch (error) {
    lineageFolderSelect.innerHTML = "";
    lineageFolderSelect.appendChild(createLineageFolderOption("", "Root"));
    lineageFolderTreeState.folders = [];
    lineageFolderTreeState.selectedId = "";
    updateLineageFolderTriggerLabel();
    renderLineageFolderTree();
    setLineageStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    lineageRefreshBtn.disabled = false;
  }
}

function normalizeLineageFolderOptions(payload) {
  return flattenLineageFolderTree(normalizeLineageFolderTree(payload));
}

function normalizeLineageFolderTree(payload) {
  const tree = Array.isArray(payload?.customFolderTree) ? payload.customFolderTree : [];
  if (tree.length) {
    return normalizeLineageFolderNodes(tree, null);
  }

  const flat = Array.isArray(payload?.customFolders) ? payload.customFolders : [];
  return normalizeLineageFolderNodes(flat, null);
}

function normalizeLineageFolderNodes(nodes, parentNode = null) {
  return (nodes || []).map((node) => {
    const normalizedNode = {
      ...node,
      parentNode,
      children: [],
    };
    normalizedNode.children = normalizeLineageFolderNodes(getLineageFolderChildren(node), normalizedNode);
    return normalizedNode;
  });
}

function setLineageFolderDropdownOpen(isOpen) {
  if (!lineageFolderPanelEl || !lineageFolderTriggerBtn) {
    return;
  }

  lineageFolderPanelEl.hidden = !isOpen;
  lineageFolderTriggerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (isOpen) {
    lineageFolderSearchInput?.focus();
  }
}

function updateLineageFolderTriggerLabel() {
  if (!lineageFolderTriggerText) {
    return;
  }

  const selected = findLineageFolderById(lineageFolderTreeState.folders, lineageFolderTreeState.selectedId);
  lineageFolderTreeState.selectedLabel = selected?.fullPath || selected?.name || "Root";
  lineageFolderTriggerText.textContent = lineageFolderTreeState.selectedLabel;
  lineageFolderTriggerText.title = lineageFolderTreeState.selectedLabel;
}

function findLineageFolderById(nodes, id) {
  const targetId = String(id || "");
  if (!targetId) {
    return null;
  }

  for (const node of nodes || []) {
    if (String(node?.id || "") === targetId) {
      return { ...node, fullPath: buildLineageFolderPath(node) };
    }
    const child = findLineageFolderById(getLineageFolderChildren(node), targetId);
    if (child) {
      return child;
    }
  }
  return null;
}

function renderLineageFolderTree() {
  if (!lineageFolderTreeEl) {
    return;
  }

  lineageFolderTreeEl.innerHTML = "";
  if (!lineageFolderTreeState.search) {
    const rootRow = createLineageFolderTreeRow({
      id: "",
      name: "Root",
      depth: 0,
      children: lineageFolderTreeState.folders,
      fullPath: "Root",
    }, { isRoot: true });
    lineageFolderTreeEl.appendChild(rootRow);
  }

  const rows = lineageFolderTreeState.search
    ? buildRankedLineageSearchResults(lineageFolderTreeState.folders, lineageFolderTreeState.search)
    : buildVisibleLineageFolderRows(lineageFolderTreeState.folders);

  if (!rows.length && lineageFolderTreeState.search) {
    const empty = document.createElement("div");
    empty.className = "folderTreeEmpty";
    empty.textContent = "No matching folders.";
    lineageFolderTreeEl.appendChild(empty);
    return;
  }

  for (const folder of rows) {
    lineageFolderTreeEl.appendChild(createLineageFolderTreeRow(folder));
  }
}

function createLineageFolderTreeRow(folder, options = {}) {
  const row = document.createElement("div");
  row.className = "folderTreeRow";
  row.setAttribute("role", "treeitem");
  row.style.paddingLeft = `${Math.min(Number(folder.depth || 0), 8) * 14}px`;
  if (String(folder.id || "") === lineageFolderTreeState.selectedId) {
    row.classList.add("selected");
  }

  const childCount = getLineageFolderChildren(folder).length;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "folderTreeToggle";
  toggle.disabled = options.isRoot || !childCount || !!lineageFolderTreeState.search;
  toggle.textContent = childCount && !options.isRoot
    ? lineageFolderTreeState.collapsedIds.has(folder.id) ? "+" : "-"
    : "";
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (lineageFolderTreeState.collapsedIds.has(folder.id)) {
      lineageFolderTreeState.collapsedIds.delete(folder.id);
    } else {
      lineageFolderTreeState.collapsedIds.add(folder.id);
    }
    renderLineageFolderTree();
  });

  const name = document.createElement("button");
  name.type = "button";
  name.className = "folderTreeName";
  const primary = document.createElement("span");
  primary.className = "folderTreeNamePrimary";
  primary.textContent = options.isRoot
    ? "Root"
    : `${folder.name || "Untitled"}${childCount && !lineageFolderTreeState.search ? ` (${childCount})` : ""}`;
  primary.title = primary.textContent;
  name.appendChild(primary);

  if (lineageFolderTreeState.search && folder.fullPath) {
    const path = document.createElement("span");
    path.className = "folderTreeNamePath";
    path.textContent = folder.fullPath;
    path.title = folder.fullPath;
    name.appendChild(path);
  }

  name.addEventListener("click", () => {
    lineageFolderTreeState.selectedId = String(folder.id || "");
    if (lineageFolderSelect) {
      lineageFolderSelect.value = lineageFolderTreeState.selectedId;
    }
    updateLineageFolderTriggerLabel();
    saveLineageSettings();
    renderLineageFolderTree();
    setLineageFolderDropdownOpen(false);
  });

  row.appendChild(toggle);
  row.appendChild(name);
  return row;
}

function buildVisibleLineageFolderRows(nodes, depth = 0, output = []) {
  const search = lineageFolderTreeState.search;
  for (const node of nodes || []) {
    const children = getLineageFolderChildren(node);
    const name = String(node?.name || "").toLowerCase();
    const selfMatches = !search || name.includes(search);
    const childOutput = [];
    buildVisibleLineageFolderRows(children, depth + 1, childOutput);
    const hasMatchingChild = childOutput.length > 0;
    const shouldShow = !search || selfMatches || hasMatchingChild;

    if (!shouldShow) {
      continue;
    }

    const folder = { ...node, depth, children, fullPath: buildLineageFolderPath(node) };
    output.push(folder);
    if (search || !lineageFolderTreeState.collapsedIds.has(node.id)) {
      if (search) {
        output.push(...childOutput);
      } else {
        buildVisibleLineageFolderRows(children, depth + 1, output);
      }
    }
  }
  return output;
}

function buildRankedLineageSearchResults(nodes, search) {
  const flatFolders = flattenLineageFolderTree(nodes).map((folder) => ({
    ...folder,
    fullPath: buildLineageFolderPath(folder),
  }));

  return flatFolders
    .map((folder) => ({
      ...folder,
      score: getFolderSearchScore(String(folder.name || ""), search),
    }))
    .filter((folder) => folder.score !== null)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (left.name.length !== right.name.length) return left.name.length - right.name.length;
      return String(left.fullPath || "").localeCompare(String(right.fullPath || ""), "en");
    });
}

function getLineageFolderChildren(folder) {
  return Array.isArray(folder?.children) ? folder.children : [];
}

function buildLineageFolderPath(folder) {
  const parts = [];
  let current = folder;
  while (current) {
    if (current.name) {
      parts.push(String(current.name));
    }
    current = current.parentNode || null;
  }
  return parts.reverse().join(" / ");
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

function sendImagesToEagle(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "mediafetch:save-to-eagle", ...payload }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Failed to save to Eagle."));
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

  const visibleItems = getVisibleMediaItems();
  const selectedCount = visibleItems.filter((item) => item.selected).length;
  const selectedTotalCount = getSelectedMediaItems().length;
  const imageCount = visibleItems.filter((item) => item.mediaType !== "video").length;
  const videoCount = visibleItems.filter((item) => item.mediaType === "video").length;
  const originalCount = visibleItems.filter((item) => item.mediaType !== "video" && item.isOriginal).length;
  selectionStatus.textContent = `Selected: ${selectedCount} / ${visibleItems.length} | Images: ${imageCount} | Videos: ${videoCount} | Original: ${originalCount}`;

  selectAllBtn.disabled = visibleItems.length === 0;
  clearBtn.disabled = visibleItems.length === 0;
  selectOriginalBtn.disabled = originalCount === 0 || getExtractionRangeSetting() === "videos";
  downloadBtn.disabled = selectedTotalCount === 0;
  if (lineageSaveSelectedBtn) {
    lineageSaveSelectedBtn.disabled = selectedCount === 0 || !lineageFeatureEnabled;
  }
  if (lineageSaveOriginalBtn) {
    lineageSaveOriginalBtn.disabled = originalCount === 0 || !lineageFeatureEnabled;
  }
  if (eagleSaveSelectedBtn) {
    eagleSaveSelectedBtn.disabled = selectedCount === 0 || !eagleFeatureEnabled;
  }
  if (eagleSaveOriginalBtn) {
    eagleSaveOriginalBtn.disabled = originalCount === 0 || !eagleFeatureEnabled;
  }

  for (const [index, item] of visibleItems.entries()) {
    const card = document.createElement("article");
    card.className = "card";
    if (item.selected) card.classList.add("selected");

    if (item.mediaType !== "video" && item.isOriginal) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Original";
      card.appendChild(badge);
    }

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (item.mediaType === "video") {
      const poster = document.createElement("img");
      poster.loading = "lazy";
      poster.src = item.posterUrl || item.thumbnail || item.previewUrl || item.url;
      poster.alt = `video ${index + 1}`;
      thumb.appendChild(poster);
      const videoBadge = document.createElement("span");
      videoBadge.className = "badge";
      videoBadge.textContent = "Video";
      card.appendChild(videoBadge);
    } else {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = item.thumbnail || item.url;
      img.alt = `image ${index + 1}`;
      thumb.appendChild(img);
    }
    card.appendChild(thumb);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(createPill(item.format || "Unknown"));
    meta.appendChild(createPill(item.resolution || "Unknown"));
    meta.appendChild(createPill(item.size || "Unknown"));
    if (item.mediaType === "video") {
      meta.appendChild(createPill(item.duration ? `${Math.round(item.duration)}s` : "Unknown"));
    }
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
  if (!debugPanelEnabled || !debugBoxEl || !toggleDebugBtn) return;
  const collapsed = debugBoxEl.classList.toggle("collapsed");
  toggleDebugBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function renderDebugInfo(debug) {
  if (!debugPanelEnabled || !debugInfoEl) return;
  if (!debug) {
    debugInfoEl.textContent = "No debug data yet.";
    return;
  }

  debugInfoEl.textContent = JSON.stringify(debug, null, 2);
}

async function copyDebugInfo() {
  if (!debugPanelEnabled || !debugInfoEl) return;
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
