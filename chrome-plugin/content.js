(() => {
const CONTENT_BUILD_HASH = "1157";
const PLUGIN_VERSION = "0.2.1";
  const XIAOHONGSHU_DISPLAY_NAME = "\u5c0f\u7ea2\u4e66";
  const XIAOHONGSHU_SUFFIX_PATTERN = /\s*[|\-]\s*(?:\u5c0f\u7ea2\u4e66|Xiaohongshu)\b.*$/i;
  const XIAOHONGSHU_TITLE_PATTERN = /^(.{1,80}?)\s*(?:\u7684|on)\s*(?:\u5c0f\u7ea2\u4e66|Xiaohongshu)/i;
  const XIAOHONGSHU_SELF_TEXT = "\u6211";
  const PLATFORM_REGISTRY = [
    {
      id: "instagram",
      folderPlatform: "instagram",
      match: isInstagramHost,
      extractFacts: extractInstagramFacts,
      sampleContext: () => ({}),
      collectImages: collectInstagramOriginalMedia,
      collectVideos: null,
    },
    {
      id: "behance",
      folderPlatform: "behance",
      match: isBehanceHost,
      extractFacts: extractBehanceFacts,
      sampleContext: () => ({}),
      collectImages: collectBehanceOriginalMedia,
      collectVideos: null,
    },
    {
      id: "xiaohongshu",
      folderPlatform: XIAOHONGSHU_DISPLAY_NAME,
      match: isXiaohongshuHost,
      extractFacts: extractXiaohongshuFacts,
      sampleContext: () => ({}),
      collectImages: collectXiaohongshuOriginalMedia,
      collectVideos: null,
    },
    {
      id: "weibo",
      folderPlatform: "weibo",
      match: isWeiboHost,
      extractFacts: extractWeiboFacts,
      sampleContext: () => ({}),
      collectImages: collectWeiboOriginalMedia,
      collectVideos: null,
    },
    {
      id: "weixin",
      folderPlatform: "weixin",
      match: isWeixinHost,
      extractFacts: extractWeixinFacts,
      sampleContext: () => ({}),
      collectImages: collectWeixinOriginalMedia,
      collectVideos: null,
    },
  ];

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (![
      "mediafetch:extract",
      "mediafetch:weibo-album-probe",
      "mediafetch:instagram-post-context",
      "mediafetch:instagram-rendered-snapshot",
      "mediafetch:weibo-layer-hints",
      "mediafetch:weibo-rendered-snapshot",
    ].includes(message?.type)) {
      return;
    }

    (async () => {
      try {
        if (message?.type === "mediafetch:instagram-rendered-snapshot") {
          sendResponse({
            ok: true,
            snapshot: collectInstagramRenderedSnapshot(),
          });
          return;
        }

        if (message?.type === "mediafetch:instagram-post-context") {
          const context = collectInstagramPostContext();
          if (context) {
            const container = findInstagramPostContainer();
            const carouselEvidence = container
              ? await getInstagramCarouselEvidence(container, 0)
              : {
                  count: 0,
                  source: "none",
                  hrefMax: 0,
                  htmlEvidenceMax: 0,
                  visibleCount: 0,
                  liveDistinctCount: 0,
                  usedHint: false,
                  hintValue: 0,
                };
            context.initialCarouselCount = carouselEvidence.count;
            context.initialCarouselEvidence = carouselEvidence;
          }
          sendResponse({
            ok: true,
            context,
          });
          return;
        }

        if (message?.type === "mediafetch:weibo-layer-hints") {
          sendResponse({
            ok: true,
            hints: collectWeiboLayerHints(),
          });
          return;
        }

        if (message?.type === "mediafetch:weibo-rendered-snapshot") {
          sendResponse({
            ok: true,
            snapshot: collectWeiboRenderedSnapshot(),
          });
          return;
        }

        if (message?.type === "mediafetch:weibo-album-probe") {
          sendResponse({
            ok: true,
            album: collectWeiboAlbumProbe(),
          });
          return;
        }

        const result = await extractMediaFromPage(
          String(message?.extractionRange || "images"),
          message?.maxIndexHint || 0,
          message?.sampledUrls || [],
          message?.sampledIndexes || []
        );
        const facts = collectProjectIdentityFacts();
        const metadata = {
          ...buildProjectMetadataFromFacts(facts),
          imageCount: Number(result.imageCount || 0),
          originalCount: Number(result.originalCount || 0),
          videoCount: Number(result.videoCount || 0),
          counts: result.counts || {
            images: Number(result.imageCount || 0),
            videos: Number(result.videoCount || 0),
          },
        };
        sendResponse({
          ok: true,
          pageUrl: location.href,
          projectName: buildFolderNameFromFacts(facts),
          metadata,
          media: result.media,
          images: result.images,
          videos: result.videos,
          debug: result.debug,
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return true;
  });

  async function extractImagesForPage(maxIndexHint = 0, externalSampledUrls = [], externalSampledIndexes = []) {
    const host = location.hostname || "";
    const domainRule = getImageDomainRule(host);
    if (typeof domainRule === "function") {
      const domainResult = await domainRule(maxIndexHint, externalSampledUrls, externalSampledIndexes);
      if (domainResult) {
        return domainResult;
      }
    }

    return await extractGenericImages(maxIndexHint, externalSampledUrls, externalSampledIndexes);
  }

  async function extractDomainImages(maxIndexHint = 0, externalSampledUrls = [], externalSampledIndexes = []) {
    const items = [];
    const seen = new Set();
    const seenInstagramMediaItems = new Map();
    const seenBehanceMediaItems = new Map();
    const seenWeiboMediaItems = new Map();
    const platformMedia = await collectPlatformMedia(maxIndexHint);
    const domainOriginalUrls = platformMedia.originalUrls;
    const externalUrls = Array.isArray(externalSampledUrls) ? externalSampledUrls : [];
    const externalMergeDebug = mergeExternalSampledUrls(domainOriginalUrls, externalUrls);
    const instagramExternalSamplingDebug = /instagram\.com$/i.test(location.hostname) ? {
      sampleIndexes: Array.isArray(externalSampledIndexes) ? externalSampledIndexes : [],
      sampledUrlCount: externalUrls.length,
      sampledMediaKeyCount: countInstagramMediaKeys(externalUrls),
      sampledUrlPreview: externalUrls.slice(0, 6),
    } : null;
    if (instagramExternalSamplingDebug) {
      platformMedia.debug.externalSampling = instagramExternalSamplingDebug;
    }

    const weiboExternalSamplingDebug = /weibo\.com$/i.test(location.hostname) ? {
      layerIds: Array.isArray(externalSampledIndexes) ? externalSampledIndexes : [],
      sampledUrlCount: externalUrls.length,
      sampledMediaKeyCount: countWeiboMediaKeys(externalUrls),
      acceptedUrlCount: externalMergeDebug.accepted.length,
      acceptedMediaKeyCount: countWeiboMediaKeys(externalMergeDebug.accepted),
      rejectedUrlCount: externalMergeDebug.rejected.length,
      sampledUrlPreview: externalUrls.slice(0, 6),
      acceptedUrlPreview: externalMergeDebug.accepted.slice(0, 6),
      rejectedUrlPreview: externalMergeDebug.rejected.slice(0, 6),
    } : null;
    if (weiboExternalSamplingDebug) {
      platformMedia.debug.externalSampling = weiboExternalSamplingDebug;
    }

    const push = (rawUrl, options = {}) => {
      const url = /weibo\.com$/i.test(location.hostname)
        ? normalizeWeiboImageUrl(rawUrl)
        : normalizeUrl(rawUrl);
      if (!url || seen.has(url)) return;
      const instagramMediaKey = /instagram\.com$/i.test(location.hostname) ? getInstagramMediaKey(url) : "";
      const behanceMediaKey = /behance\.net$/i.test(location.hostname) ? getBehanceMediaKey(url) : "";
      const weiboMediaKey = /weibo\.com$/i.test(location.hostname) ? getWeiboMediaKey(url) : "";
      const width = Number(options.width || 0);
      const height = Number(options.height || 0);
      const area = width * height;
      const sourceHint = options.sourceHint || "rendered";
      const normalizedThumbnail = normalizeUrl(options.thumbnail || "");
      const score = computeScore(url, sourceHint, width, height);
      if (instagramMediaKey) {
        const existing = seenInstagramMediaItems.get(instagramMediaKey);
        if (existing) {
          if (isBetterInstagramMediaVariant({ url, score, area }, existing)) {
            const index = items.indexOf(existing);
            if (index >= 0) {
              items.splice(index, 1);
            }
            seen.delete(existing.url);
          } else {
            return;
          }
        }
      }
      if (behanceMediaKey) {
        const existing = seenBehanceMediaItems.get(behanceMediaKey);
        if (existing) {
          if (isBetterBehanceMediaVariant({ url, score, area }, existing)) {
            const index = items.indexOf(existing);
            if (index >= 0) {
              items.splice(index, 1);
            }
            seen.delete(existing.url);
          } else {
            hydrateKnownMediaMetadata(existing, { width, height, area });
            return;
          }
        }
      }
      if (weiboMediaKey) {
        const existing = seenWeiboMediaItems.get(weiboMediaKey);
        if (existing) {
          if (isBetterWeiboMediaVariant({ url, score, area }, existing)) {
            const index = items.indexOf(existing);
            if (index >= 0) {
              items.splice(index, 1);
            }
            seen.delete(existing.url);
          } else {
            return;
          }
        }
      }

      const item = {
        url,
        thumbnail: normalizedThumbnail || options.thumbnail || url,
        format: options.format || inferFormat(url),
        resolution: width && height ? `${width} x ${height}` : "Unknown",
        size: "Unknown",
        width,
        height,
        area,
        score,
        sourceHint,
      };
      if (behanceMediaKey) {
        hydrateKnownMediaMetadata(item, {
          width: item.width || width,
          height: item.height || height,
        });
      }
      if (behanceMediaKey) {
        const existing = seenBehanceMediaItems.get(behanceMediaKey);
        if (existing) {
          hydrateKnownMediaMetadata(item, existing);
        }
      }
      if (weiboMediaKey) {
        const existing = seenWeiboMediaItems.get(weiboMediaKey);
        if (existing?.thumbnail && !normalizedThumbnail) {
          item.thumbnail = existing.thumbnail;
        }
      }
      items.push(item);
      seen.add(url);
      if (instagramMediaKey) {
        seenInstagramMediaItems.set(instagramMediaKey, item);
      }
      if (behanceMediaKey) {
        seenBehanceMediaItems.set(behanceMediaKey, item);
      }
      if (weiboMediaKey) {
        seenWeiboMediaItems.set(weiboMediaKey, item);
      }
    };

    document.querySelectorAll("img").forEach((img) => {
      const renderedThumbnail = normalizeUrl(img.currentSrc || img.src || "");
      push(img.currentSrc || img.src, {
        thumbnail: renderedThumbnail,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        sourceHint: img.currentSrc ? "rendered-current" : "rendered-direct",
      });

      const bestSrcset = pickBestSrcsetCandidate(img.getAttribute("srcset") || img.getAttribute("data-srcset") || "");
      if (bestSrcset) {
        const srcsetSize = getSrcsetCandidateSize(bestSrcset, img);
        push(bestSrcset, {
          thumbnail: renderedThumbnail,
          width: srcsetSize.width || img.naturalWidth || img.width || 0,
          height: srcsetSize.height || img.naturalHeight || img.height || 0,
          sourceHint: "rendered-srcset",
        });
      }

      getImageAttributeUrls(img).forEach((url) => {
        push(url, {
          thumbnail: renderedThumbnail,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          sourceHint: "rendered-data",
        });
      });
    });

    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]').forEach((node) => {
      push(node.getAttribute("content") || node.getAttribute("href") || "", {
        sourceHint: "rendered-meta",
      });
    });

    await augmentWeixinOriginalsFromExtractedItems(platformMedia, items);
    pushDomainOriginalUrls(platformMedia, push);
    await hydrateWeiboItemMetadata(items);

    const sorted = items
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.area - a.area;
      });

    const maxArea = sorted[0]?.area || 0;
    const images = sorted.map((item) => ({
      url: item.url,
      thumbnail: item.thumbnail,
      format: item.format,
      resolution: item.resolution,
      size: item.size,
      isOriginal: detectOriginal(item, maxArea, platformMedia),
      score: item.score,
      area: item.area,
      selected: false,
    }))
      .sort((a, b) => {
        if (Number(b.isOriginal) !== Number(a.isOriginal)) {
          return Number(b.isOriginal) - Number(a.isOriginal);
        }
        if ((b.score || 0) !== (a.score || 0)) {
          return (b.score || 0) - (a.score || 0);
        }
        return (b.area || 0) - (a.area || 0);
      })
      .map(({ score, area, ...item }) => item);

    return {
      images,
      debug: await buildDebugInfo(images, platformMedia, maxIndexHint),
    };
  }

  async function extractGenericImages(maxIndexHint = 0, externalSampledUrls = [], externalSampledIndexes = []) {
    const items = [];
    const seen = new Set();
    const debug = {
      scannedImageElements: 0,
      scannedSourceCandidates: 0,
      scannedMetaCandidates: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      acceptedPreview: [],
      rejectedPreview: [],
    };

    const push = (rawUrl, options = {}) => {
      const url = normalizeUrl(rawUrl);
      if (!url || seen.has(url)) {
        return;
      }

      const width = Number(options.width || 0);
      const height = Number(options.height || 0);
      const area = width * height;
      const sourceHint = options.sourceHint || "generic";
      const normalizedThumbnail = normalizeUrl(options.thumbnail || "");
      const score = computeScore(url, sourceHint, width, height);

      items.push({
        url,
        thumbnail: normalizedThumbnail || options.thumbnail || url,
        format: options.format || inferFormat(url),
        resolution: width && height ? `${width} x ${height}` : "Unknown",
        size: "Unknown",
        width,
        height,
        area,
        score,
        sourceHint,
      });
      seen.add(url);
      debug.acceptedCount += 1;
      if (debug.acceptedPreview.length < 12) {
        debug.acceptedPreview.push({
          url,
          width,
          height,
          score,
        });
      }
    };

    document.querySelectorAll("img").forEach((img) => {
      debug.scannedImageElements += 1;
      const renderedThumbnail = normalizeUrl(img.currentSrc || img.src || "");
      push(img.currentSrc || img.src, {
        thumbnail: renderedThumbnail,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        sourceHint: img.currentSrc ? "generic-current" : "generic-direct",
      });

      const bestSrcset = pickBestSrcsetCandidate(img.getAttribute("srcset") || img.getAttribute("data-srcset") || "");
      if (bestSrcset) {
        const srcsetSize = getSrcsetCandidateSize(bestSrcset, img);
        push(bestSrcset, {
          thumbnail: renderedThumbnail,
          width: srcsetSize.width || img.naturalWidth || img.width || 0,
          height: srcsetSize.height || img.naturalHeight || img.height || 0,
          sourceHint: "generic-srcset",
        });
      }

      getImageAttributeUrls(img).forEach((url) => {
        debug.scannedSourceCandidates += 1;
        push(url, {
          thumbnail: renderedThumbnail,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          sourceHint: "generic-data",
        });
      });
    });

    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]').forEach((node) => {
      debug.scannedMetaCandidates += 1;
      push(node.getAttribute("content") || node.getAttribute("href") || "", {
        sourceHint: "generic-meta",
      });
    });

    const sorted = items
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.area - a.area;
      });

    const maxArea = sorted[0]?.area || 0;
    const images = sorted.map((item) => ({
      url: item.url,
      thumbnail: item.thumbnail,
      format: item.format,
      resolution: item.resolution,
      size: item.size,
      isOriginal: detectOriginal(item, maxArea, null),
      score: item.score,
      area: item.area,
      selected: false,
    }))
      .sort((a, b) => {
        if (Number(b.isOriginal) !== Number(a.isOriginal)) {
          return Number(b.isOriginal) - Number(a.isOriginal);
        }
        if ((b.score || 0) !== (a.score || 0)) {
          return (b.score || 0) - (a.score || 0);
        }
        return (b.area || 0) - (a.area || 0);
      })
      .map(({ score, area, ...item }) => item);

    return {
      images,
      debug: {
        ...debug,
        summary: {
          imageCount: images.length,
          originalCount: images.filter((item) => item.isOriginal).length,
        },
      },
    };
  }

  async function extractMediaFromPage(extractionRange = "images", maxIndexHint = 0, externalSampledUrls = [], externalSampledIndexes = []) {
    const range = normalizeExtractionRange(extractionRange);
    const includeImages = range !== "videos";
    const includeVideos = range !== "images";

    const imageResult = includeImages
      ? await extractImagesForPage(maxIndexHint, externalSampledUrls, externalSampledIndexes)
      : { images: [], debug: {} };

    const videoResult = includeVideos
      ? await extractVideosForPage()
      : createEmptyVideoMediaResult();

    const imageMedia = convertImageItemsToMedia(imageResult.images || []);
    const videoMedia = Array.isArray(videoResult.media) ? videoResult.media : [];
    const media = mergeMediaResults({
      images: includeImages ? imageMedia : [],
      videos: includeVideos ? videoMedia : [],
    });

    const counts = countMediaTypes(media);
    const imageCount = counts.images;
    const originalCount = imageMedia.filter((item) => item.isOriginal).length;
    const videoCount = counts.videos;
    const debug = {
      image: imageResult.debug || {},
      video: videoResult.debug || {},
      client: {
        version: PLUGIN_VERSION,
        contentBuildHash: CONTENT_BUILD_HASH,
      },
    };

    return {
      media,
      images: imageMedia,
      videos: videoMedia,
      debug,
      counts,
      imageCount,
      originalCount,
      videoCount,
    };
  }

  function convertImageItemsToMedia(images) {
    return Array.from(images || []).map((item, index) => ({
      id: `image:${index + 1}`,
      mediaType: "image",
      url: item.url,
      sourceUrl: item.url,
      thumbnail: item.thumbnail || item.url,
      previewUrl: item.thumbnail || item.url,
      posterUrl: "",
      format: item.format || "Unknown",
      resolution: item.resolution || "Unknown",
      size: item.size || "Unknown",
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      duration: 0,
      isOriginal: !!item.isOriginal,
      selected: !!item.selected,
      score: Number(item.score || 0),
      area: Number(item.area || 0),
      download: {
        strategy: isSinaimgUrl(item.url)
          ? "fetchBlob"
          : isXiaohongshuCdnUrl(item.url)
            ? "xiaohongshuImageFetchBlob"
            : "direct",
      },
    }));
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

  function mergeMediaResults({ images = [], videos = [] } = {}) {
    return [
      ...(Array.isArray(images) ? images : []),
      ...(Array.isArray(videos) ? videos : []),
    ];
  }

  async function extractVideosForPage() {
    const host = location.hostname || "";
    const domainRule = getVideoDomainRule(host);
    if (typeof domainRule === "function") {
      const domainResult = await domainRule({
        extractionRange: "videos",
        location,
        document,
      });
      if (domainResult?.media?.length) {
        return domainResult;
      }

      const xiaohongshuVideoDebug = domainResult?.debug?.xiaohongshu || (isXiaohongshuHost() ? collectXiaohongshuVideoDebug() : null);
      const weiboVideoDebug = domainResult?.debug?.weibo || null;
      const xinpianchangVideoDebug = domainResult?.debug?.xinpianchang || (isXinpianchangHost() ? collectXinpianchangVideoDebug() : null);
      const genericResult = await extractGenericVideos();
      if (xiaohongshuVideoDebug) {
        genericResult.debug = {
          ...(genericResult.debug || {}),
          xiaohongshu: xiaohongshuVideoDebug,
        };
      }
      if (weiboVideoDebug) {
        genericResult.debug = {
          ...(genericResult.debug || {}),
          weibo: weiboVideoDebug,
        };
      }
      if (xinpianchangVideoDebug) {
        genericResult.debug = {
          ...(genericResult.debug || {}),
          xinpianchang: xinpianchangVideoDebug,
        };
      }
      return genericResult;
    }

    const genericResult = await extractGenericVideos();
    return genericResult;
  }

  function getImageDomainRule(_host) {
    const normalizedHost = String(_host || "").toLowerCase();
    const supportedHosts = [
      /(^|\.)instagram\.com$/i,
      /(^|\.)behance\.net$/i,
      /(^|\.)xiaohongshu\.com$/i,
      /(^|\.)weibo\.com$/i,
      /(^|\.)weixin\.qq\.com$/i,
    ];
    if (!supportedHosts.some((pattern) => pattern.test(normalizedHost))) {
      return null;
    }

    return async (maxIndexHint = 0, externalSampledUrls = [], externalSampledIndexes = []) => {
      return await extractDomainImages(maxIndexHint, externalSampledUrls, externalSampledIndexes);
    };
  }

  async function extractGenericVideos() {
    const media = [];
    const seen = new Set();
    const debug = {
      scannedVideoElements: 0,
      scannedSourceElements: 0,
      scannedAttributeCandidates: 0,
      scannedHtmlCandidates: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      acceptedPreview: [],
      rejectedPreview: [],
    };

    const push = (rawUrl, options = {}) => {
      const candidate = normalizeVideoCandidate(rawUrl, options);
      if (!candidate.ok) {
        debug.rejectedCount += 1;
        if (candidate.reason && debug.rejectedPreview.length < 12) {
          debug.rejectedPreview.push({ url: String(rawUrl || ""), reason: candidate.reason });
        }
        return;
      }

      if (seen.has(candidate.url)) {
        return;
      }

      seen.add(candidate.url);
      debug.acceptedCount += 1;
      if (debug.acceptedPreview.length < 12) {
        debug.acceptedPreview.push({
          url: candidate.url,
          width: candidate.width,
          height: candidate.height,
          duration: candidate.duration,
          format: candidate.format,
        });
      }
      media.push({
        id: `video:${media.length + 1}`,
        mediaType: "video",
        url: candidate.url,
        sourceUrl: candidate.url,
        thumbnail: candidate.posterUrl || candidate.previewUrl || candidate.url,
        previewUrl: candidate.previewUrl || candidate.posterUrl || candidate.url,
        posterUrl: candidate.posterUrl || "",
        format: candidate.format,
        resolution: candidate.width && candidate.height ? `${candidate.width} x ${candidate.height}` : "Unknown",
        size: "Unknown",
        width: candidate.width,
        height: candidate.height,
        duration: candidate.duration,
        isOriginal: false,
        selected: false,
        score: candidate.score,
        area: candidate.area,
        download: {
          strategy: candidate.strategy,
        },
      });
    };

    document.querySelectorAll("video").forEach((video) => {
      debug.scannedVideoElements += 1;
      const poster = normalizeUrl(video.getAttribute("poster") || "");
      const duration = Number(video.duration || video.getAttribute("data-duration") || 0);
      const width = Number(video.videoWidth || video.getAttribute("width") || video.clientWidth || 0);
      const height = Number(video.videoHeight || video.getAttribute("height") || video.clientHeight || 0);
      const sourceUrls = new Set();
      [
        video.currentSrc,
        video.src,
        video.getAttribute("data-src"),
        video.getAttribute("data-video"),
        video.getAttribute("data-video-src"),
        video.getAttribute("data-play-url"),
      ].forEach((value) => {
        const normalized = normalizeVideoUrl(value || "");
        if (normalized) {
          sourceUrls.add(normalized);
        }
      });

      video.querySelectorAll("source[src]").forEach((source) => {
        debug.scannedSourceElements += 1;
        const normalized = normalizeVideoUrl(source.getAttribute("src") || "");
        if (normalized) {
          sourceUrls.add(normalized);
        }
      });

      Array.from(video.attributes || []).forEach((attr) => {
        const values = collectVideoUrlsFromText(String(attr.value || ""));
        debug.scannedAttributeCandidates += values.length;
        values.forEach((value) => sourceUrls.add(value));
      });

      sourceUrls.forEach((url) => push(url, {
        posterUrl: poster,
        previewUrl: poster,
        duration,
        width,
        height,
        strategy: selectVideoDownloadStrategy(url),
      }));
    });

    document.querySelectorAll('meta[property*="video"], meta[name*="video"], link[rel*="video"]').forEach((node) => {
      const value = node.getAttribute("content") || node.getAttribute("href") || "";
      const normalized = normalizeVideoUrl(value);
      if (normalized) {
        push(normalized, {
          previewUrl: normalizeUrl(node.getAttribute("content") || node.getAttribute("href") || ""),
          strategy: selectVideoDownloadStrategy(normalized),
        });
      }
    });

    return {
      media,
      debug,
    };
  }

  function normalizeVideoCandidate(rawUrl, options = {}) {
    const url = normalizeVideoUrl(rawUrl);
    if (!url) {
      return { ok: false, reason: "invalid-url" };
    }

    if (isManifestVideoUrl(url)) {
      return { ok: false, reason: "manifest-url" };
    }

    const hasVideoExtension = /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(url);
    const hasDimensions = Number(options.width || 0) > 0 && Number(options.height || 0) > 0;
    const hasDuration = Number(options.duration || 0) > 0;
    if (!hasVideoExtension && !hasDimensions && !hasDuration) {
      return { ok: false, reason: "weak-candidate" };
    }

    const format = inferVideoFormat(url, options.contentType);
    const width = Number(options.width || 0);
    const height = Number(options.height || 0);
    const duration = Number(options.duration || 0);
    const posterUrl = normalizeUrl(options.posterUrl || "");
    const previewUrl = normalizeUrl(options.previewUrl || "");
    const strategy = options.strategy || selectVideoDownloadStrategy(url);

    return {
      ok: true,
      url,
      format,
      width,
      height,
      duration,
      posterUrl,
      previewUrl,
      strategy,
      score: computeVideoScore(url, width, height, duration),
      area: width * height,
    };
  }

  function createEmptyVideoMediaResult() {
    return {
      media: [],
      debug: {
        scannedVideoElements: 0,
        scannedSourceElements: 0,
        scannedAttributeCandidates: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        acceptedPreview: [],
        rejectedPreview: [],
      },
    };
  }

  function getVideoDomainRule(_host) {
    const normalizedHost = String(_host || "").toLowerCase();
    if (/(^|\.)weibo\.com$/i.test(normalizedHost)) {
      return async () => {
        return await collectWeiboVideoMedia();
      };
    }
    if (/(^|\.)xinpianchang\.com$/i.test(normalizedHost)) {
      return async () => {
        return await collectXinpianchangVideoMedia();
      };
    }
    if (!/(^|\.)xiaohongshu\.com$/i.test(normalizedHost)) {
      return null;
    }

    return async () => {
      return await collectXiaohongshuVideoMedia();
    };
  }

  function normalizeExtractionRange(value) {
    const normalized = String(value || "images").toLowerCase();
    if (normalized === "videos" || normalized === "both") {
      return normalized;
    }
    return "images";
  }

  function normalizeVideoUrl(rawUrl) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      return "";
    }

    if (/^(?:blob:|data:)/i.test(normalized)) {
      return "";
    }

    return normalized;
  }

  function isManifestVideoUrl(url) {
    return /\.m3u8(?:$|[?#])/i.test(String(url || "")) || /\.mpd(?:$|[?#])/i.test(String(url || ""));
  }

  function isXinpianchangVideoUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return false;
    }

    try {
      const parsed = new URL(normalized);
      return /(^|\.)xpccdn\.com$/i.test(parsed.hostname || "") && /\.(mp4|m4v|mov)(?:$|[?#])/i.test(normalized);
    } catch (_error) {
      return /xpccdn\.com/i.test(normalized) && /\.(mp4|m4v|mov)(?:$|[?#])/i.test(normalized);
    }
  }

  function collectVideoUrlsFromText(value) {
    const text = String(value || "");
    if (!text) {
      return [];
    }

    const urls = [];
    const matches = text.match(/https?:\/\/[^"'`\s<>]+?(?:\.mp4|\.webm|\.mov|\.m4v|\.ogv|\.m3u8|\.mpd)(?:[?#][^"'`\s<>]*)?/gi) || [];
    matches.forEach((match) => {
      const normalized = normalizeVideoUrl(match);
      if (normalized) {
        urls.push(normalized);
      }
    });
    return urls;
  }

  function inferVideoFormat(url, contentType = "") {
    const lowered = String(url || "").toLowerCase();
    const ct = String(contentType || "").toLowerCase();
    if (ct.includes("mp4")) return "MP4";
    if (ct.includes("webm")) return "WEBM";
    if (ct.includes("quicktime")) return "MOV";
    if (ct.includes("mpegurl")) return "M3U8";
    if (lowered.endsWith(".mp4")) return "MP4";
    if (lowered.endsWith(".webm")) return "WEBM";
    if (lowered.endsWith(".mov")) return "MOV";
    if (lowered.endsWith(".m4v")) return "M4V";
    return "Unknown";
  }

  function computeVideoScore(url, width = 0, height = 0, duration = 0) {
    let score = 0;
    if (width > 0 && height > 0) {
      score += Math.min(500, Math.floor((width * height) / 5000));
    }
    if (duration > 0) {
      score += Math.min(120, Math.floor(duration));
    }
    const lowered = String(url || "").toLowerCase();
    if (/(original|source|high|large|hd|master|raw)/.test(lowered)) {
      score += 80;
    }
    if (/(preview|thumb|poster|small|sprite)/.test(lowered)) {
      score -= 40;
    }
    return score;
  }

  function selectVideoDownloadStrategy(url) {
    if (isWeiboVideoUrl(url)) {
      return "weiboVideoDirect";
    }
    if (isXiaohongshuCdnUrl(url)) {
      return "xiaohongshuVideoFetchBlob";
    }
    if (isXinpianchangVideoUrl(url)) {
      return "mediaCapture";
    }
    return isManifestVideoUrl(url) ? "direct" : "fetchBlob";
  }

  function mergeExternalSampledUrls(domainOriginalUrls, externalUrls) {
    const accepted = [];
    const rejected = [];
    const weiboBaseKeys = new Set();

    if (/weibo\.com$/i.test(location.hostname)) {
      Array.from(domainOriginalUrls || []).forEach((item) => {
        const key = getWeiboMediaKey(item);
        if (key) weiboBaseKeys.add(key);
      });
    }

    Array.from(externalUrls || []).forEach((url) => {
      const normalized = /weibo\.com$/i.test(location.hostname)
        ? normalizeWeiboImageUrl(url)
        : normalizeUrl(url);
      if (!normalized) {
        rejected.push(String(url || ""));
        return;
      }

      if (/weibo\.com$/i.test(location.hostname)) {
        const key = getWeiboMediaKey(normalized);
        if (weiboBaseKeys.size && (!key || !weiboBaseKeys.has(key))) {
          rejected.push(normalized);
          return;
        }
      }

      domainOriginalUrls?.add(normalized);
      accepted.push(normalized);
    });

    return { accepted, rejected };
  }

  function pushDomainOriginalUrls(platformMedia, push) {
    const domainOriginalUrls = platformMedia?.originalUrls || null;
    if (!domainOriginalUrls?.size) {
      return;
    }

    if (!(/(instagram\.com|behance\.net|weibo\.com|weixin\.qq\.com)$/i.test(location.hostname) || isXiaohongshuHost())) {
      return;
    }

    domainOriginalUrls.forEach((url) => {
      const originalMeta = platformMedia.originalUrlMeta?.get?.(url) || {};
      push(url, {
        ...originalMeta,
        sourceHint: /behance\.net$/i.test(location.hostname)
          ? "behance-original"
          : /weibo\.com$/i.test(location.hostname)
            ? "weibo-original"
            : /weixin\.qq\.com$/i.test(location.hostname)
              ? "weixin-original"
              : isXiaohongshuHost()
                ? "xiaohongshu-original"
                : "instagram-sampled",
      });
    });
  }

  async function hydrateWeiboItemMetadata(items) {
    if (!/weibo\.com$/i.test(location.hostname) || !Array.isArray(items) || !items.length) {
      return;
    }

    const concurrency = 4;
    for (let index = 0; index < items.length; index += concurrency) {
      const batch = items.slice(index, index + concurrency);
      await Promise.all(batch.map(async (item) => {
        const probe = await probeImageResource(item.url, 2500);
        const width = Number(probe.width || probe.responseWidth || 0);
        const height = Number(probe.height || probe.responseHeight || 0);
        if (width > 0 && height > 0) {
          item.width = width;
          item.height = height;
          item.area = width * height;
          item.resolution = `${width} x ${height}`;
        }
        item.format = inferFormatFromUrlOrProbe(item.url, probe) || item.format;
        item.score = computeScore(item.url, item.sourceHint, item.width || 0, item.height || 0);
      }));
    }
  }

  function inferProjectName() {
    const facts = collectProjectIdentityFacts();
    return buildFolderNameFromFacts(facts);
  }

  // Folder naming is global policy; platform extractors only provide facts.
  function buildFolderNameFromFacts(rawFacts) {
    const facts = normalizeProjectFacts(rawFacts);
    const parts = [];
    const platform = sanitizeFolderSegment(facts.folderPlatform || facts.platform);

    if (platform) {
      parts.push(platform);
    }
    if (facts.displayAuthor) {
      parts.push(sanitizeFolderSegment(facts.displayAuthor));
    }
    if (facts.publishedDateCode) {
      parts.push(sanitizeFolderSegment(facts.publishedDateCode));
    }
    if (facts.platform === "weibo") {
      if (facts.publishedTimeCode) {
        parts.push(sanitizeFolderSegment(facts.publishedTimeCode));
      }
    } else if (facts.title) {
      parts.push(sanitizeFolderSegment(facts.title));
    }
    const folderName = stripTrailingXiaohongshuFolderSuffix(
      sanitizeFolderName(parts.filter(Boolean).join("_"))
    );
    return folderName || "ProjectsA";
  }

  function stripTrailingXiaohongshuFolderSuffix(value) {
    return String(value || "")
      .replace(/-小红书$/i, "")
      .replace(/[-_]+$/g, "")
      .trim();
  }

  function buildProjectMetadata() {
    const facts = collectProjectIdentityFacts();
    return buildProjectMetadataFromFacts(facts);
  }

  // Metadata is built from normalized facts so fields stay consistent across platforms.
  function buildProjectMetadataFromFacts(rawFacts) {
    const facts = normalizeProjectFacts(rawFacts);
    return {
      platform: facts.platform,
      domain: facts.domain,
      projectUrl: facts.projectUrl,
      normalizedUrl: facts.normalizedUrl,
      projectName: buildFolderNameFromFacts(facts),
      title: facts.title,
      username: facts.displayAuthor,
      authorId: facts.authorId,
      projectId: facts.projectId,
      publishedAt: facts.publishedAt,
      publishedDateCode: facts.publishedDateCode,
      publishedTimeCode: facts.publishedTimeCode,
    };
  }

  function collectProjectIdentityFacts() {
    const facts = createEmptyProjectFacts();
    const adapter = getCurrentPlatformAdapter();
    return adapter?.extractFacts ? adapter.extractFacts(facts) : normalizeProjectFacts(facts);
  }

  function extractInstagramFacts(baseFacts) {
    const facts = { ...baseFacts };
    const context = collectInstagramPostContext();
    facts.displayAuthor = context?.username || "";
    facts.authorId = context?.username || "";
    facts.projectId = context?.postCode || extractInstagramPostCode(location.pathname) || "";
    facts.publishedAt = inferInstagramPublishedAt();
    facts.publishedDateCode = inferInstagramPostDateCode();
    return normalizeProjectFacts(facts);
  }

  function extractWeiboFacts(baseFacts) {
    const facts = { ...baseFacts };
    const dateTimeCode = inferWeiboPostDateTimeCode();
    facts.displayAuthor = inferWeiboAuthorName();
    facts.projectId = extractWeiboStatusId(location.href);
    facts.publishedAt = inferWeiboPublishedAt();
    facts.publishedDateCode = formatDateCodeYymmdd(facts.publishedAt) || formatDateCodeYymmdd(dateTimeCode);
    facts.publishedTimeCode = /^\d{8,12}$/.test(dateTimeCode) ? dateTimeCode.slice(6) : "";
    return normalizeProjectFacts(facts);
  }

  function extractBehanceFacts(baseFacts) {
    const facts = { ...baseFacts };
    const authorContext = inferBehanceAuthorContext();
    facts.title = inferBehanceProjectTitle();
    facts.displayAuthor = authorContext?.authorName || authorContext?.slug || "";
    facts.authorId = authorContext?.slug || "";
    facts.projectId = extractBehanceProjectId(location.pathname) || extractBehanceProjectId(facts.projectUrl) || extractBehanceProjectId(facts.normalizedUrl);
    facts.publishedAt = inferBehancePublishedAt();
    facts.publishedDateCode = formatDateCodeYymmdd(facts.publishedAt);
    return normalizeProjectFacts(facts);
  }

  function extractXiaohongshuFacts(baseFacts) {
    const facts = { ...baseFacts };
    const authorContext = inferXiaohongshuAuthorContextV2();
    facts.displayAuthor = authorContext?.username || "";
    facts.authorId = authorContext?.userId || "";
    facts.projectId = extractXiaohongshuNoteId(location.href);
    facts.publishedAt = inferXiaohongshuPublishedAt();
    facts.publishedDateCode = formatDateCodeYymmdd(facts.publishedAt);
    return normalizeProjectFacts(facts);
  }

  function extractWeixinFacts(baseFacts) {
    const facts = { ...baseFacts };
    facts.displayAuthor = inferWeixinAuthorName();
    facts.projectId = extractWeixinProjectId(location.href);
    facts.publishedAt = inferWeixinPublishedAt();
    facts.publishedDateCode = formatDateCodeYymmdd(facts.publishedAt);
    return normalizeProjectFacts(facts);
  }

  function createEmptyProjectFacts() {
    return {
      platform: inferPlatformName(),
      folderPlatform: inferFolderPlatformName(),
      domain: location.hostname,
      projectUrl: location.href,
      normalizedUrl: inferNormalizedProjectUrl(),
      title: inferProjectTitle(),
      displayAuthor: "",
      authorId: "",
      projectId: "",
      publishedAt: "",
      publishedDateCode: "",
      publishedTimeCode: "",
    };
  }

  // Normalize platform-specific findings into the shared facts shape.
  function normalizeProjectFacts(rawFacts) {
    const facts = rawFacts || {};
    const displayAuthor = facts.displayAuthor || facts.username || "";
    return {
      platform: facts.platform || inferPlatformName(),
      folderPlatform: facts.folderPlatform || inferFolderPlatformName(),
      domain: facts.domain || location.hostname,
      projectUrl: facts.projectUrl || location.href,
      normalizedUrl: facts.normalizedUrl || inferNormalizedProjectUrl(),
      title: facts.title || "",
      displayAuthor,
      username: displayAuthor,
      authorId: facts.authorId || "",
      projectId: facts.projectId || "",
      publishedAt: facts.publishedAt || "",
      publishedDateCode: facts.publishedDateCode || "",
      publishedTimeCode: facts.publishedTimeCode || "",
    };
  }

  function inferPlatformName() {
    const adapter = getCurrentPlatformAdapter();
    if (adapter?.id) return adapter.id;
    return location.hostname.replace(/^www\./i, "") || "web";
  }

  function inferFolderPlatformName() {
    const adapter = getCurrentPlatformAdapter();
    return adapter?.folderPlatform || inferPlatformName();
  }

  function inferNormalizedProjectUrl() {
    if (isInstagramHost()) {
      return buildInstagramNormalizedUrl(collectInstagramPostContext());
    }

    if (isWeixinHost()) {
      return buildWeixinNormalizedUrl();
    }

    try {
      const parsed = new URL(location.href);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return location.href;
    }
  }

  function inferProjectTitle() {
    const candidates = [
      document.querySelector('meta[property="og:title"]')?.content,
      document.querySelector('meta[name="twitter:title"]')?.content,
      document.querySelector("h1")?.textContent,
      document.title,
    ].filter(Boolean);

    for (const value of candidates) {
      const cleaned = cleanProjectTitle(value);
      if (cleaned) {
        return cleaned;
      }
    }

    return "";
  }

  function inferBehanceProjectTitle() {
    const pathname = normalizePathname(location.pathname);
    const match = pathname.match(/^\/gallery\/\d+\/([^/]+)/i);
    if (match?.[1]) {
      const slugTitle = decodeURIComponent(match[1])
        .replace(/[-_]+/g, " ")
        .trim();
      const cleaned = cleanProjectTitle(slugTitle);
      if (cleaned) {
        return cleaned;
      }
    }

    return inferProjectTitle();
  }

  function inferWeiboFolderName() {
    if (!/weibo\.com$/i.test(location.hostname)) {
      return "";
    }

    const author = sanitizeFolderName(cleanWeiboTitlePart(inferWeiboAuthorName()));
    const dateTimeCode = inferWeiboPostDateTimeCode();
    const statusId = sanitizeFolderName(extractWeiboStatusId(location.href));

    if (author && dateTimeCode) {
      return sanitizeFolderName(`${author}_${dateTimeCode}`);
    }

    if (author) {
      return author;
    }

    if (dateTimeCode) {
      return dateTimeCode;
    }

    return statusId || "";
  }

  function inferWeiboAuthorName() {
    const root = findWeiboPostContainer();
    const candidates = [];

    const push = (value) => {
      const cleaned = cleanWeiboTitlePart(value);
      if (cleaned) {
        candidates.push(cleaned);
      }
    };

    if (root) {
      [
        '[role="link"]',
        'a[href*="/u/"]',
        'a[href^="/u/"]',
        'a[href^="/n/"]',
        'a[href*="profile"]',
        'span[title]',
      ].forEach((selector) => {
        const node = root.querySelector(selector);
        if (!node) {
          return;
        }
        push(node.getAttribute("title") || "");
        push(node.textContent || "");
      });
    }

    push(document.querySelector('meta[name="author"]')?.content || "");

    const jsonMatches = [
      /"screen_name"\s*:\s*"([^"]{1,80})"/i,
      /"nick(?:name)?"\s*:\s*"([^"]{1,80})"/i,
      /"userName"\s*:\s*"([^"]{1,80})"/i,
    ];
    const html = document.documentElement?.innerHTML || "";
    jsonMatches.forEach((pattern) => {
      const match = html.match(pattern);
      if (match?.[1]) {
        push(match[1]);
      }
    });

    const title = document.title || document.querySelector('meta[property="og:title"]')?.content || "";
    const titleMatch = title.match(/^(.{1,40}?)(?:的微博视频|的微博|[:：-]|\s)/);
    if (titleMatch?.[1]) {
      push(titleMatch[1]);
    }

    return candidates.find((value) => isUsableWeiboAuthor(value)) || "";
  }

  function inferWeiboPostDescriptor() {
    const root = findWeiboPostContainer();
    const candidates = [];

    const push = (value) => {
      const cleaned = cleanWeiboTitlePart(value);
      if (cleaned) {
        candidates.push(cleaned);
      }
    };

    if (root) {
      const textNodes = Array.from(root.querySelectorAll("span, div, p"))
        .map((node) => node.textContent || "")
        .map((text) => text.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((text) => text.length >= 4);

      textNodes.slice(0, 20).forEach((text) => push(text));
    }

    push(document.querySelector('meta[property="og:title"]')?.content || "");
    push(document.querySelector('meta[name="description"]')?.content || "");
    push(document.title || "");

    return candidates.find((value) => isUsableWeiboDescriptor(value)) || "";
  }

  function cleanWeiboTitlePart(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\\u003c[^>]*\\u003e/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#＃][^#＃]{1,40}[#＃]/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/@[\w\-.一-龥]+/g, " ")
      .replace(/\b微博视频号\b/g, " ")
      .replace(/\b微博\b/g, " ")
      .replace(/\bweibo\b/gi, " ")
      .replace(/[|｜\-—–_:：]+/g, " ")
      .replace(/[“”"'‘’]/g, "")
      .replace(/[^\w\u4e00-\u9fff\s&()+,.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 28);
  }

  function isUsableWeiboAuthor(value) {
    const text = String(value || "").trim();
    if (!text || text.length < 2) {
      return false;
    }
    return !/^(微博|weibo|详情|全文|视频|图片|赞|评论|转发)$/i.test(text);
  }

  function isUsableWeiboDescriptor(value) {
    const text = String(value || "").trim();
    if (!text || text.length < 4) {
      return false;
    }
    if (/^(微博|weibo|详情|全文|视频|图片|赞|评论|转发)$/i.test(text)) {
      return false;
    }
    return !/^\d+$/.test(text);
  }

  function inferWeiboPostDateTimeCode() {
    const candidates = collectWeiboTimeCandidates();
    for (const value of candidates) {
      const code = formatWeiboDateTimeCode(value);
      if (code) {
        return code;
      }
    }

    return "";
  }

  function formatWeiboDateTimeCode(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    let date = null;
    if (/^\d{10,13}$/.test(raw)) {
      const numeric = Number(raw);
      date = new Date(raw.length === 13 ? numeric : numeric * 1000);
    } else {
      date = parseWeiboDateLikeText(raw);
    }

    if (!date || Number.isNaN(date.getTime())) {
      return "";
    }

    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}${hour}${minute}`;
  }

  function cleanProjectTitle(value) {
    return String(value || "")
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
      .replace(/\s+/g, " ")
      .replace(/^[^"]+:\s*"([^"]+)".*$/i, "$1")
      .replace(/\s*[|\-]\s*Behance\b.*$/i, "")
      .replace(/\s*[|\-]\s*Adobe\b.*$/i, "")
      .replace(/\s*[|\-]\s*Instagram\b.*$/i, "")
      .replace(XIAOHONGSHU_SUFFIX_PATTERN, "")
      .replace(/\s*[|\-]\s*Weibo\b.*$/i, "")
      .trim();
  }

  function sanitizeFolderName(value) {
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

  function sanitizeFolderSegment(value) {
    return String(value || "")
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/[_\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/\.+$/g, "")
      .replace(/^-+|-+$/g, "")
      .trim()
      .slice(0, 64);
  }

  function buildInstagramNormalizedUrl(context) {
    try {
      const parsed = new URL(location.href);
      parsed.hash = "";
      parsed.search = "";
      if (context?.postPath) {
        parsed.pathname = context.postPath;
      } else {
        parsed.pathname = normalizeInstagramPostPath(location.pathname);
      }
      return parsed.toString();
    } catch {
      return location.href;
    }
  }

  function inferInstagramUserName() {
    const pathParts = location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 3 && /^(p|reel)$/i.test(pathParts[1])) {
      return pathParts[0] || "";
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || document.title || "";
    const titleMatch = metaTitle.match(/^@?([A-Za-z0-9._]+)\s+(?:on|在)\s+Instagram/i);
    if (titleMatch) {
      return titleMatch[1];
    }

    const profileLink = document.querySelector('header a[href^="/"], main a[href^="/"]')?.getAttribute("href") || "";
    const profileMatch = profileLink.match(/^\/([A-Za-z0-9._]+)\/?$/);
    return profileMatch ? profileMatch[1] : "";
  }

  function collectInstagramPostContext() {
    if (!/instagram\.com$/i.test(location.hostname)) {
      return null;
    }

    const postCode = extractInstagramPostCode(location.pathname);
    const kind = extractInstagramPostKind(location.pathname);
    if (!postCode || !kind) {
      return null;
    }

    const pathParts = location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 3 && /^(p|reel)$/i.test(pathParts[1])) {
      return {
        postCode,
        kind,
        username: pathParts[0],
        postPath: `/${pathParts[0]}/${kind}/${postCode}`,
        source: "url",
      };
    }

    const canonical = findInstagramCanonicalPostPath(postCode);
    if (canonical?.username) {
      return {
        postCode,
        kind: canonical.kind || kind,
        username: canonical.username,
        postPath: canonical.path,
        source: canonical.source,
      };
    }

    const ownerContext = inferInstagramOwnerContext();
    if (ownerContext?.username) {
      return {
        postCode,
        kind,
        username: ownerContext.username,
        postPath: `/${ownerContext.username}/${kind}/${postCode}`,
        source: ownerContext.source,
      };
    }

    return {
      postCode,
      kind,
      username: "",
      postPath: "",
      source: "missing",
    };
  }

  function collectInstagramUsernameProbe() {
    if (!/instagram\.com$/i.test(location.hostname)) {
      return null;
    }

    const postCode = extractInstagramPostCode(location.pathname);
    const kind = extractInstagramPostKind(location.pathname);
    const pathParts = location.pathname.split("/").filter(Boolean);
    const directUrlContext = pathParts.length >= 3 && /^(p|reel)$/i.test(pathParts[1])
      ? {
          username: pathParts[0],
          kind: pathParts[1].toLowerCase(),
          postCode: pathParts[2] || "",
          matchesPostCode: !postCode || pathParts[2] === postCode,
          postPath: `/${pathParts[0]}/${pathParts[1].toLowerCase()}/${pathParts[2] || ""}`,
        }
      : null;

    const canonicalCandidates = collectInstagramCanonicalCandidates(postCode);
    const canonicalMatch = canonicalCandidates.find((item) => item.matchesPostCode && item.username) || null;

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const pageTitle = document.title || "";
    const titleUsername = extractInstagramTitleUsername(metaTitle || pageTitle);

    const headerHref = document.querySelector('main header a[href^="/"], header a[href^="/"]')?.getAttribute("href") || "";
    const headerMatch = headerHref.match(/^\/([A-Za-z0-9._]+)\/?$/);
    const headerUsername = headerMatch ? headerMatch[1] : "";
    const alIosUsername = extractInstagramAlIosUsername();
    const ownerContext = inferInstagramOwnerContext();

    const jsonLd = findInstagramJsonLdPostProfile(postCode);

    return {
      locationPath: location.pathname,
      postCode,
      kind,
      directUrl: directUrlContext,
      canonicalCandidates,
      canonicalMatch,
      metaTitle,
      pageTitle,
      alIosUsername,
      titleUsername,
      headerHref,
      headerUsername,
      ownerContext,
      jsonLd,
      finalContext: collectInstagramPostContext(),
    };
  }

  function collectInstagramCanonicalCandidates(postCode) {
    const candidates = [
      { label: "canonical", value: document.querySelector('link[rel="canonical"]')?.href || "" },
      { label: "og:url", value: document.querySelector('meta[property="og:url"]')?.content || "" },
      { label: "al:ios:url", value: document.querySelector('meta[property="al:ios:url"]')?.content || "" },
    ];

    return candidates.map(({ label, value }) => {
      const result = {
        label,
        value,
        username: "",
        kind: "",
        postCode: "",
        matchesPostCode: false,
        postPath: "",
      };

      try {
        const parsed = new URL(value, location.href);
        const match = parsed.pathname.match(/^\/([A-Za-z0-9._-]+)\/(p|reel)\/([^/]+)/i);
        if (match) {
          result.username = match[1];
          result.kind = match[2].toLowerCase();
          result.postCode = match[3];
          result.matchesPostCode = !postCode || match[3] === postCode;
          result.postPath = `/${match[1]}/${match[2].toLowerCase()}/${match[3]}`;
        }
      } catch {
        // Ignore malformed metadata URLs.
      }

      return result;
    });
  }

  function findInstagramCanonicalPostPath(postCode) {
    const candidates = collectInstagramCanonicalCandidates(postCode);

    for (const item of candidates) {
      if (item.matchesPostCode && item.username) {
        return {
          username: item.username,
          kind: item.kind,
          path: `/${item.username}/${item.kind}/${postCode}`,
          source: item.label,
        };
      }
    }

    return null;
  }

  function inferInstagramOwnerContext() {
    const alIosUsername = extractInstagramAlIosUsername();
    if (alIosUsername) {
      return { username: alIosUsername, source: "al:ios:user" };
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || document.title || "";
    const titleUsername = extractInstagramTitleUsername(metaTitle);
    if (titleUsername) {
      return { username: titleUsername, source: "metaTitle" };
    }

    const headerLink = document.querySelector('main header a[href^="/"], header a[href^="/"]')?.getAttribute("href") || "";
    const headerMatch = headerLink.match(/^\/([A-Za-z0-9._]+)\/?$/);
    if (headerMatch) {
      return { username: headerMatch[1], source: "header" };
    }

    return null;
  }

  function inferInstagramOwnerUserNameStrict() {
    const context = inferInstagramOwnerContext();
    return context?.username || "";
  }

  function extractInstagramTitleUsername(value) {
    const title = String(value || "").trim();
    if (!title) {
      return "";
    }

    const directMatch = title.match(/^@?([A-Za-z0-9._]+)\s+on\s+Instagram/i);
    if (directMatch) {
      return directMatch[1];
    }

    const handleMatch = title.match(/\(@?([A-Za-z0-9._]+)\)/);
    return handleMatch ? handleMatch[1] : "";
  }

  function extractInstagramAlIosUsername() {
    const raw = document.querySelector('meta[property="al:ios:url"]')?.content || "";
    if (!raw) {
      return "";
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || document.title || "";
    try {
      const parsed = new URL(raw, location.href);
      const username = parsed.searchParams.get("username") || "";
      if (/^[A-Za-z0-9._]+$/.test(username)) {
        return username;
      }
    } catch {
      const match = raw.match(/username=([A-Za-z0-9._]+)/i);
      if (match) {
        return match[1];
      }
    }

    return extractInstagramTitleUsername(metaTitle);
  }

  function findInstagramJsonLdPostProfile(postCode) {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const node of scripts) {
      const raw = node.textContent || "";
      if (!raw) {
        continue;
      }

      try {
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          const mainEntity = entry?.mainEntityOfPage || entry?.url || "";
          const authorUrl = entry?.author?.url || entry?.author?.mainEntityOfPage || "";
          const candidateUrl = String(mainEntity || authorUrl || "");
          const authorName = String(entry?.author?.alternateName || entry?.author?.identifier || entry?.author?.name || "");
          const result = {
            rawMainEntity: mainEntity || "",
            rawAuthorUrl: authorUrl || "",
            authorName,
            username: "",
            kind: "",
            matchedPostCode: "",
            matchesPostCode: false,
            postPath: "",
          };

          if (candidateUrl) {
            try {
              const url = new URL(candidateUrl, location.href);
              const match = url.pathname.match(/^\/([A-Za-z0-9._-]+)\/(p|reel)\/([^/]+)/i);
              if (match) {
                result.username = match[1];
                result.kind = match[2].toLowerCase();
                result.matchedPostCode = match[3];
                result.matchesPostCode = !postCode || match[3] === postCode;
                result.postPath = `/${match[1]}/${match[2].toLowerCase()}/${match[3]}`;
              }
            } catch {
              // Ignore malformed JSON-LD URLs.
            }
          }

          if (result.username || result.authorName || result.rawMainEntity || result.rawAuthorUrl) {
            return result;
          }
        }
      } catch {
        // Ignore malformed JSON-LD blocks.
      }
    }

    return null;
  }

  function inferInstagramPostDateCode() {
    const candidates = [
      ...Array.from(document.querySelectorAll("time[datetime]")).map((node) => node.getAttribute("datetime") || ""),
      document.querySelector('meta[property="article:published_time"]')?.content || "",
      document.querySelector('meta[name="date"]')?.content || "",
    ];

    const html = document.documentElement?.innerHTML || "";
    const jsonTimeMatch = html.match(/"(?:taken_at_timestamp|date|created_at)"\s*:\s*(?:"([^"]+)"|(\d{10,13}))/i);
    if (jsonTimeMatch) {
      candidates.push(jsonTimeMatch[1] || jsonTimeMatch[2] || "");
    }

    for (const value of candidates) {
      const dateCode = formatInstagramDateCode(value);
      if (dateCode) {
        return dateCode;
      }
    }

    return "";
  }

  function inferInstagramPublishedAt() {
    const candidates = [
      ...Array.from(document.querySelectorAll("time[datetime]")).map((node) => node.getAttribute("datetime") || ""),
      document.querySelector('meta[property="article:published_time"]')?.content || "",
      document.querySelector('meta[name="date"]')?.content || "",
    ];

    const html = document.documentElement?.innerHTML || "";
    const jsonTimeMatch = html.match(/"(?:taken_at_timestamp|date|created_at)"\s*:\s*(?:"([^"]+)"|(\d{10,13}))/i);
    if (jsonTimeMatch) {
      candidates.push(jsonTimeMatch[1] || jsonTimeMatch[2] || "");
    }

    return normalizePublishedAt(candidates);
  }

  function formatInstagramDateCode(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    let date = null;
    if (/^\d{10,13}$/.test(raw)) {
      const numeric = Number(raw);
      date = new Date(raw.length === 13 ? numeric : numeric * 1000);
    } else {
      date = new Date(raw);
    }

    if (!date || Number.isNaN(date.getTime())) {
      return "";
    }

    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function formatDateCodeYymmdd(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    if (/^\d{6}$/.test(raw)) {
      return raw;
    }

    if (/^\d{8,12}$/.test(raw)) {
      return raw.slice(0, 6);
    }

    return formatInstagramDateCode(raw);
  }

  function inferWeiboPublishedAt() {
    return normalizePublishedAt(collectWeiboTimeCandidates());
  }

  function collectWeiboTimeProbe() {
    if (!/weibo\.com$/i.test(location.hostname)) {
      return null;
    }

    const timeNodes = Array.from(document.querySelectorAll("time, [datetime]"))
      .slice(0, 12)
      .map((node) => ({
        tag: node.tagName,
        datetime: node.getAttribute("datetime") || "",
        text: cleanProjectTitle(node.textContent || ""),
      }));

    const metaCandidates = [
      {
        label: "article:published_time",
        value: document.querySelector('meta[property="article:published_time"]')?.content || "",
      },
      {
        label: "date",
        value: document.querySelector('meta[name="date"]')?.content || "",
      },
      {
        label: "og:time",
        value: document.querySelector('meta[property="og:time"]')?.content || "",
      },
    ].filter((item) => item.value);

    const publishedAt = inferWeiboPublishedAt();
    const dateTimeCode = inferWeiboPostDateTimeCode();
    return {
      locationPath: location.pathname,
      locationSearch: location.search,
      publishedAt,
      publishedDateCode: formatDateCodeYymmdd(publishedAt) || formatDateCodeYymmdd(dateTimeCode),
      publishedTimeCode: /^\d{8,12}$/.test(dateTimeCode) ? dateTimeCode.slice(6) : "",
      timeNodes,
      metaCandidates,
      candidatePreview: collectWeiboTimeCandidates().slice(0, 16).map((value) => ({
        value,
        dateTimeCode: formatWeiboDateTimeCode(value),
        normalizedPublishedAt: normalizePublishedAt([value]),
      })),
    };
  }

  function collectWeiboAlbumProbe() {
    const parsed = parseWeiboAlbumUrl(location.href);
    if (!parsed) {
      return null;
    }

    const candidates = collectWeiboAlbumProjectCandidates(parsed.uid);
    const best = candidates[0] || null;
    return {
      isAlbumUrl: true,
      uid: parsed.uid,
      index: parsed.index,
      resolvedProjectId: best?.projectId || "",
      resolvedDetailUrl: best?.detailUrl || "",
      source: best?.source || "",
      candidateCount: candidates.length,
      candidatePreview: candidates.slice(0, 12),
    };
  }

  async function collectWeiboVideoMedia() {
    const html = document.documentElement?.innerHTML || "";
    const statusId = extractWeiboStatusId(location.href);
    const payload = extractWeiboVideoPayloadFromHtml(html);
    const qualityProbe = await collectWeiboHighestQualityProbe();
    const candidates = [];
    const seen = new Set();
    const rejectedPreview = [];
    const candidatePreview = [];
    let rejectedCount = 0;

    const push = (rawUrl, options = {}) => {
      const normalized = normalizeVideoUrl(rawUrl);
      if (!normalized) {
        rejectedCount += 1;
        if (rejectedPreview.length < 12) {
          rejectedPreview.push({
            url: String(rawUrl || ""),
            reason: "invalid-url",
          });
        }
        return;
      }

      const normalizedOptions = {
        ...options,
        strategy: "direct",
        posterUrl: options.posterUrl || payload.posterUrl || "",
        previewUrl: options.previewUrl || payload.previewUrl || "",
        contentType: options.contentType || payload.contentType || "",
      };
      const candidate = normalizeVideoCandidate(normalized, normalizedOptions);
      if (!candidate.ok) {
        rejectedCount += 1;
        if (candidate.reason && rejectedPreview.length < 12) {
          rejectedPreview.push({
            url: String(rawUrl || ""),
            reason: candidate.reason,
          });
        }
        return;
      }

      if (seen.has(candidate.url)) {
        return;
      }

      seen.add(candidate.url);
      const enrichedCandidate = {
        ...candidate,
        source: String(options.source || ""),
        sourceType: String(options.sourceType || ""),
        label: String(options.label || ""),
        hostHint: String(options.hostHint || ""),
        bitrate: Number(options.bitrate || candidate.bitrate || 0),
      };
      enrichedCandidate.score = scoreWeiboVideoCandidate(enrichedCandidate);
      candidates.push(enrichedCandidate);
      candidatePreview.push({
        url: enrichedCandidate.url,
        width: enrichedCandidate.width,
        height: enrichedCandidate.height,
        duration: enrichedCandidate.duration,
        format: enrichedCandidate.format,
        score: enrichedCandidate.score,
        source: enrichedCandidate.source,
        sourceType: enrichedCandidate.sourceType,
      });
    };

    collectWeiboVideoCandidatesFromPayload(payload, push);

    if (qualityProbe?.selectedUrl) {
      push(qualityProbe.selectedUrl, {
        source: "quality-menu",
        sourceType: "dom",
        label: qualityProbe.targetLabel || "",
        hostHint: qualityProbe.currentQualityLabel || "",
        posterUrl: payload.posterUrl || "",
        previewUrl: payload.previewUrl || "",
        contentType: payload.contentType || "",
        duration: Number(qualityProbe.duration || 0),
        width: Number(qualityProbe.width || 0),
        height: Number(qualityProbe.height || 0),
      });
    }

    document.querySelectorAll("video").forEach((video) => {
      const poster = normalizeUrl(video.getAttribute("poster") || "");
      const duration = Number(video.duration || video.getAttribute("data-duration") || 0);
      const width = Number(video.videoWidth || video.getAttribute("width") || video.clientWidth || 0);
      const height = Number(video.videoHeight || video.getAttribute("height") || video.clientHeight || 0);
      const sourceUrls = new Set();

      [
        video.currentSrc,
        video.src,
        video.getAttribute("data-src"),
        video.getAttribute("data-video"),
        video.getAttribute("data-video-src"),
        video.getAttribute("data-play-url"),
      ].forEach((value) => {
        const normalized = normalizeVideoUrl(value || "");
        if (normalized) {
          sourceUrls.add(normalized);
        }
      });

      video.querySelectorAll("source[src]").forEach((source) => {
        const normalized = normalizeVideoUrl(source.getAttribute("src") || "");
        if (normalized) {
          sourceUrls.add(normalized);
        }
      });

      Array.from(video.attributes || []).forEach((attr) => {
        collectVideoUrlsFromText(String(attr.value || "")).forEach((value) => sourceUrls.add(value));
      });

      sourceUrls.forEach((url) => push(url, {
        source: "video-element",
        sourceType: "dom",
        posterUrl: poster,
        previewUrl: poster,
        duration,
        width,
        height,
      }));
    });

    document.querySelectorAll('meta[property*="video"], meta[name*="video"], link[rel*="video"]').forEach((node) => {
      const value = node.getAttribute("content") || node.getAttribute("href") || "";
      const normalized = normalizeVideoUrl(value);
      if (normalized) {
        push(normalized, {
          source: "meta",
          sourceType: "dom",
          previewUrl: normalizeUrl(node.getAttribute("content") || node.getAttribute("href") || ""),
        });
      }
    });

    const ranked = rankWeiboVideoCandidates(candidates);
    const selectedCandidate = ranked[0] || null;
    const fallbackCandidates = selectedCandidate
      ? ranked.filter((candidate) => candidate.url !== selectedCandidate.url)
      : [];
    const selectedMedia = selectedCandidate
      ? buildWeiboVideoMediaItem(selectedCandidate, fallbackCandidates)
      : null;

    return {
      media: selectedMedia ? [selectedMedia] : [],
      debug: {
        weibo: {
          statusId,
          pageInfoFound: payload.pageInfoFound,
          mediaInfoFound: payload.mediaInfoFound,
          mixMediaInfoFound: payload.mixMediaInfoFound,
          structuredPayloadFound: payload.structuredPayloadFound,
          payloadSources: payload.payloadSources,
          candidateCount: ranked.length,
          acceptedCount: selectedCandidate ? 1 : 0,
          rejectedCount,
          acceptedPreview: selectedCandidate ? [{
            url: selectedCandidate.url,
            width: selectedCandidate.width,
            height: selectedCandidate.height,
            duration: selectedCandidate.duration,
            format: selectedCandidate.format,
            score: selectedCandidate.score,
          }] : [],
          rejectedPreview,
          candidatePreview: candidatePreview.slice(0, 12),
          selectedCandidate: selectedCandidate ? {
            url: selectedCandidate.url,
            width: selectedCandidate.width,
            height: selectedCandidate.height,
            duration: selectedCandidate.duration,
            format: selectedCandidate.format,
            score: selectedCandidate.score,
            source: selectedCandidate.source,
            sourceType: selectedCandidate.sourceType,
            label: selectedCandidate.label,
            hostHint: selectedCandidate.hostHint,
          } : null,
          qualityProbe: qualityProbe?.debug || null,
          fallbackToGeneric: !selectedCandidate,
        },
      },
    };
  }

  async function collectWeiboHighestQualityProbe() {
    const video = findWeiboPrimaryVideoElement();
    if (!video) {
      return {
        selectedUrl: "",
        width: 0,
        height: 0,
        duration: 0,
        targetLabel: "",
        currentQualityLabel: "",
        debug: {
          available: false,
          reason: "no-video-element",
          items: [],
        },
      };
    }

    const qualityRoot = findWeiboQualityControlRoot(video);
    if (!qualityRoot) {
      return {
        selectedUrl: normalizeVideoUrl(video.currentSrc || video.src || ""),
        width: Number(video.videoWidth || 0),
        height: Number(video.videoHeight || 0),
        duration: Number(video.duration || 0),
        targetLabel: "",
        currentQualityLabel: "",
        debug: {
          available: false,
          reason: "no-quality-menu",
          items: [],
        },
      };
    }

    const items = collectWeiboQualityMenuItems(qualityRoot);
    const rankedItems = items.slice().sort((left, right) => right.rank - left.rank);
    const selectedItem = items.find((item) => item.selected) || null;
    const targetItem = rankedItems[0] || null;
    const currentQualityLabel = readWeiboQualityValue(qualityRoot);
    const beforeUrl = normalizeVideoUrl(video.currentSrc || video.src || "");
    const beforeDimensions = inferWeiboVideoDimensions(beforeUrl, selectedItem?.text || currentQualityLabel || "");

    const probeDebug = {
      available: true,
      reason: "",
      beforeUrl,
      beforeQualityLabel: currentQualityLabel || (selectedItem?.text || ""),
      targetLabel: targetItem?.text || "",
      switched: false,
      restored: false,
      switchSucceeded: false,
      items: items.map((item) => ({
        text: item.text,
        rank: item.rank,
        selected: item.selected,
      })),
      afterUrl: beforeUrl,
      afterQualityLabel: currentQualityLabel || "",
    };

    if (!targetItem) {
      probeDebug.reason = "no-quality-items";
      return {
        selectedUrl: beforeUrl,
        width: beforeDimensions.width || Number(video.videoWidth || 0),
        height: beforeDimensions.height || Number(video.videoHeight || 0),
        duration: Number(video.duration || 0),
        targetLabel: "",
        currentQualityLabel,
        debug: probeDebug,
      };
    }

    let resolvedUrl = beforeUrl;
    let resolvedLabel = currentQualityLabel || selectedItem?.text || "";
    let resolvedDimensions = beforeDimensions;

    if (!selectedItem || normalizeWeiboQualityLabel(selectedItem.text) !== normalizeWeiboQualityLabel(targetItem.text)) {
      const switchSucceeded = await switchWeiboVideoQuality(qualityRoot, targetItem);
      probeDebug.switched = true;
      probeDebug.switchSucceeded = switchSucceeded;
      await waitForWeiboVideoQualityState(video, targetItem, beforeUrl, qualityRoot);
      resolvedUrl = normalizeVideoUrl(video.currentSrc || video.src || "");
      resolvedLabel = readWeiboQualityValue(qualityRoot) || targetItem.text;
      resolvedDimensions = inferWeiboVideoDimensions(resolvedUrl, targetItem.text);

      if (selectedItem) {
        const restored = await switchWeiboVideoQuality(qualityRoot, selectedItem);
        probeDebug.restored = restored;
        await waitForWeiboVideoQualityState(video, selectedItem, resolvedUrl, qualityRoot);
      }
    }

    probeDebug.afterUrl = resolvedUrl;
    probeDebug.afterQualityLabel = resolvedLabel;

    return {
      selectedUrl: resolvedUrl,
      width: resolvedDimensions.width || Number(video.videoWidth || 0),
      height: resolvedDimensions.height || Number(video.videoHeight || 0),
      duration: Number(video.duration || 0),
      targetLabel: targetItem.text,
      currentQualityLabel: resolvedLabel,
      debug: probeDebug,
    };
  }

  function findWeiboPrimaryVideoElement() {
    return document.querySelector('.video-js video, video.vjs-tech, video');
  }

  function findWeiboQualityControlRoot(video) {
    const playerRoot = video?.closest('.video-js') || null;
    if (playerRoot) {
      const localQualityRoot = playerRoot.querySelector('.vjs-quality.vjs-menu-button');
      if (localQualityRoot) {
        return localQualityRoot;
      }
    }
    return document.querySelector('.vjs-quality.vjs-menu-button');
  }

  function collectWeiboQualityMenuItems(qualityRoot) {
    return Array.from(qualityRoot?.querySelectorAll('.vjs-menu-item') || [])
      .map((item) => {
        const text = normalizeWeiboQualityLabel(item.textContent || "");
        return {
          node: item,
          text,
          selected: item.classList.contains('vjs-selected') || item.getAttribute('aria-checked') === 'true',
          rank: scoreWeiboQualityLabel(text),
        };
      })
      .filter((item) => item.text && item.rank > 0);
  }

  function normalizeWeiboQualityLabel(value) {
    return String(value || "").replace(/\s*,\s*选择\s*$/u, "").replace(/\s+/g, " ").trim();
  }

  function scoreWeiboQualityLabel(label) {
    const text = normalizeWeiboQualityLabel(label);
    if (/4k/i.test(text)) return 5000;
    if (/2k/i.test(text)) return 4000;
    if (/2160p/i.test(text)) return 3800;
    if (/1440p/i.test(text)) return 3400;
    if (/1080p/i.test(text)) return 3000;
    if (/720p/i.test(text)) return 2000;
    if (/480p/i.test(text)) return 1000;
    return 0;
  }

  function readWeiboQualityValue(qualityRoot) {
    return normalizeWeiboQualityLabel(
      qualityRoot?.querySelector('.vjs-quality-value')?.textContent || ""
    );
  }

  async function switchWeiboVideoQuality(qualityRoot, targetItem) {
    if (!qualityRoot || !targetItem?.node) {
      return false;
    }

    const button = qualityRoot.querySelector('button');
    const menu = qualityRoot.querySelector('.vjs-menu');
    try {
      qualityRoot.classList.add('vjs-hover');
      if (button) {
        button.setAttribute('aria-expanded', 'true');
        dispatchWeiboMouseEvent(button, 'mouseenter');
        dispatchWeiboMouseEvent(button, 'mouseover');
        dispatchWeiboMouseEvent(button, 'mousemove');
        dispatchWeiboMouseEvent(button, 'click');
      }
      if (menu) {
        menu.classList.remove('vjs-hidden');
      }
      dispatchWeiboMouseEvent(targetItem.node, 'mouseenter');
      dispatchWeiboMouseEvent(targetItem.node, 'mouseover');
      dispatchWeiboMouseEvent(targetItem.node, 'mousemove');
      dispatchWeiboMouseEvent(targetItem.node, 'mousedown');
      dispatchWeiboMouseEvent(targetItem.node, 'mouseup');
      dispatchWeiboMouseEvent(targetItem.node, 'click');
      await waitForTimeout(120);
      return true;
    } catch {
      return false;
    } finally {
      if (menu) {
        menu.classList.add('vjs-hidden');
      }
      if (button) {
        button.setAttribute('aria-expanded', 'false');
      }
      qualityRoot.classList.remove('vjs-hover');
    }
  }

  function dispatchWeiboMouseEvent(target, type) {
    if (!target) {
      return;
    }
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    }));
  }

  async function waitForWeiboVideoQualityState(video, targetItem, previousUrl, qualityRoot) {
    const targetLabel = normalizeWeiboQualityLabel(targetItem?.text || "");
    const previous = normalizeVideoUrl(previousUrl || "");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const currentUrl = normalizeVideoUrl(video?.currentSrc || video?.src || "");
      const currentQuality = readWeiboQualityValue(qualityRoot);
      if (
        (targetLabel && currentQuality && normalizeWeiboQualityLabel(currentQuality) === targetLabel) ||
        (currentUrl && currentUrl !== previous)
      ) {
        return true;
      }
      await waitForTimeout(100);
    }
    return false;
  }

  function inferWeiboVideoDimensions(url, label = "") {
    const normalizedUrl = String(url || "");
    const normalizedLabel = normalizeWeiboQualityLabel(label);
    const result = { width: 0, height: 0 };

    const templateMatch = normalizedUrl.match(/[?&]template=(\d+)x(\d+)(?:\.|&|$)/i);
    if (templateMatch) {
      result.width = Number(templateMatch[1] || 0);
      result.height = Number(templateMatch[2] || 0);
      return result;
    }

    if (/4k/i.test(normalizedLabel)) return { width: 3840, height: 2160 };
    if (/2k/i.test(normalizedLabel)) return { width: 2560, height: 1440 };
    if (/1080p/i.test(normalizedLabel)) return { width: 1920, height: 1080 };
    if (/720p/i.test(normalizedLabel)) return { width: 1280, height: 720 };
    if (/480p/i.test(normalizedLabel)) return { width: 854, height: 480 };

    return result;
  }

  function waitForTimeout(timeoutMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Number(timeoutMs || 0)));
    });
  }

  function extractWeiboVideoPayloadFromHtml(html) {
    const raw = String(html || "");
    const pageInfoText = extractWeiboJsonObjectText(raw, "page_info");
    const mediaInfoText = extractWeiboJsonObjectText(raw, "media_info");
    const mixMediaInfoText = extractWeiboJsonObjectText(raw, "mix_media_info");
    const pageInfo = pageInfoText ? tryParseJsonLike(pageInfoText) : null;
    const mediaInfo = mediaInfoText ? tryParseJsonLike(mediaInfoText) : null;
    const mixMediaInfo = mixMediaInfoText ? tryParseJsonLike(mixMediaInfoText) : null;
    const payloadRoots = [pageInfo, mediaInfo, mixMediaInfo].filter(Boolean);

    return {
      pageInfo,
      mediaInfo,
      mixMediaInfo,
      payloadRoots,
      pageInfoFound: !!pageInfoText,
      mediaInfoFound: !!mediaInfoText,
      mixMediaInfoFound: !!mixMediaInfoText,
      structuredPayloadFound: payloadRoots.length > 0,
      payloadSources: [
        pageInfo ? "page_info" : "",
        mediaInfo ? "media_info" : "",
        mixMediaInfo ? "mix_media_info" : "",
      ].filter(Boolean),
      posterUrl: extractWeiboVideoPosterUrl(pageInfo, mediaInfo, mixMediaInfo),
      previewUrl: extractWeiboVideoPreviewUrl(pageInfo, mediaInfo, mixMediaInfo),
      contentType: extractWeiboVideoContentType(pageInfo, mediaInfo, mixMediaInfo),
    };
  }

  function extractWeiboJsonObjectText(text, marker) {
    const raw = String(text || "");
    const markerIndex = raw.indexOf(String(marker || ""));
    if (markerIndex < 0) {
      return "";
    }

    const braceIndex = raw.indexOf("{", markerIndex);
    if (braceIndex < 0) {
      return "";
    }

    return extractBalancedJson(raw, braceIndex);
  }

  function collectWeiboVideoCandidatesFromPayload(payload, push) {
    const roots = Array.isArray(payload?.payloadRoots) ? payload.payloadRoots : [];
    roots.forEach((root, index) => {
      walkWeiboVideoPayload(root, `payload[${index}]`, {
        width: 0,
        height: 0,
        duration: 0,
        posterUrl: payload?.posterUrl || "",
        previewUrl: payload?.previewUrl || "",
        contentType: payload?.contentType || "",
      }, push);
    });
  }

  function walkWeiboVideoPayload(value, path, inherited, push) {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walkWeiboVideoPayload(item, `${path}[${index}]`, inherited, push);
      });
      return;
    }

    if (typeof value === "string") {
      const decoded = decodeEscapedUrl(value) || String(value || "");
      collectVideoUrlsFromText(decoded).forEach((url) => {
        push(url, {
          source: path,
          sourceType: "payload",
          posterUrl: inherited?.posterUrl || "",
          previewUrl: inherited?.previewUrl || "",
          contentType: inherited?.contentType || "",
          width: Number(inherited?.width || 0),
          height: Number(inherited?.height || 0),
          duration: Number(inherited?.duration || 0),
        });
      });
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const local = {
      width: Number(inherited?.width || value.width || value.video_width || value.videoWidth || value.pic_width || 0),
      height: Number(inherited?.height || value.height || value.video_height || value.videoHeight || value.pic_height || 0),
      duration: Number(inherited?.duration || value.duration || value.video_duration || value.videoDuration || 0),
      posterUrl: normalizeUrl(value.poster || value.poster_url || value.cover || value.cover_url || value.pic || inherited?.posterUrl || ""),
      previewUrl: normalizeUrl(value.preview_url || value.previewUrl || value.preview || value.image || inherited?.previewUrl || ""),
      contentType: String(value.content_type || value.contentType || inherited?.contentType || ""),
    };

    Object.entries(value).forEach(([key, child]) => {
      const childPath = `${path}.${key}`;
      if (typeof child === "string") {
        const decoded = decodeEscapedUrl(child) || String(child || "");
        if (decoded) {
          collectVideoUrlsFromText(decoded).forEach((url) => {
            push(url, {
              source: childPath,
              sourceType: "payload",
              posterUrl: local.posterUrl,
              previewUrl: local.previewUrl,
              contentType: local.contentType,
              width: local.width,
              height: local.height,
              duration: local.duration,
              label: key,
            });
          });
        }
        return;
      }

      walkWeiboVideoPayload(child, childPath, local, push);
    });
  }

  function extractWeiboVideoPosterUrl(...roots) {
    const candidates = [];
    roots.forEach((root) => {
      walkWeiboVideoNode(root, (value, keyPath) => {
        if (!/(?:poster|cover|pic|thumbnail)/i.test(keyPath)) {
          return;
        }
        const normalized = normalizeUrl(value);
        if (normalized) {
          candidates.push(normalized);
        }
      });
    });
    return candidates[0] || "";
  }

  function extractWeiboVideoPreviewUrl(...roots) {
    const candidates = [];
    roots.forEach((root) => {
      walkWeiboVideoNode(root, (value, keyPath) => {
        if (!/(?:preview|thumb|poster)/i.test(keyPath)) {
          return;
        }
        const normalized = normalizeUrl(value);
        if (normalized) {
          candidates.push(normalized);
        }
      });
    });
    return candidates[0] || "";
  }

  function extractWeiboVideoContentType(...roots) {
    let contentType = "";
    roots.forEach((root) => {
      walkWeiboVideoNode(root, (value, keyPath) => {
        if (contentType || !/(?:content[_-]?type|mime[_-]?type)/i.test(keyPath)) {
          return;
        }
        contentType = String(value || "");
      });
    });
    return contentType;
  }

  function walkWeiboVideoNode(value, visit, path = "") {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walkWeiboVideoNode(item, visit, `${path}[${index}]`));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    Object.entries(value).forEach(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === "string") {
        visit(child, childPath);
        return;
      }
      walkWeiboVideoNode(child, visit, childPath);
    });
  }

  function scoreWeiboVideoCandidate(candidate) {
    let score = computeVideoScore(candidate.url, candidate.width, candidate.height, candidate.duration);
    const host = getVideoCandidateHost(candidate.url);
    const url = String(candidate.url || "").toLowerCase();
    const width = Number(candidate.width || 0);
    const height = Number(candidate.height || 0);
    const area = width * height;

    if (/weibocdn\.com$/i.test(host) || /video\.weibo\.com$/i.test(host)) {
      score += 120;
    }

    const templateMatch = url.match(/template=(\d{2,5})x(\d{2,5})/i);
    if (templateMatch) {
      const templateArea = Number(templateMatch[1]) * Number(templateMatch[2]);
      score += Math.min(120000, Math.floor(templateArea / 8));
    }

    const labelMatch = url.match(/label=mp4_(\d{3,4})p/i);
    if (labelMatch) {
      score += Number(labelMatch[1]) * 4;
    }

    if (area > 0) {
      score += Math.min(100000, Math.floor(area / 4));
    }
    if (/(?:original|source|high|large|hd|master|raw)/.test(url)) {
      score += 60;
    }
    if (/(?:preview|thumb|poster|small|sprite)/.test(url)) {
      score -= 90;
    }

    return score;
  }

  function rankWeiboVideoCandidates(candidates) {
    return Array.from(candidates || []).sort((left, right) => {
      if ((right.score || 0) !== (left.score || 0)) {
        return (right.score || 0) - (left.score || 0);
      }
      const rightArea = Number(right.width || 0) * Number(right.height || 0);
      const leftArea = Number(left.width || 0) * Number(left.height || 0);
      if (rightArea !== leftArea) {
        return rightArea - leftArea;
      }
      if ((right.duration || 0) !== (left.duration || 0)) {
        return (right.duration || 0) - (left.duration || 0);
      }
      return String(left.url || "").localeCompare(String(right.url || ""));
    });
  }

  function buildWeiboVideoMediaItem(candidate, fallbackCandidates = []) {
    const posterUrl = normalizeUrl(candidate.posterUrl || candidate.previewUrl || "");
    const previewUrl = normalizeUrl(candidate.previewUrl || candidate.posterUrl || candidate.url || "");
    const fallbackUrls = Array.isArray(fallbackCandidates)
      ? fallbackCandidates.map((item) => normalizeUrl(item?.url || "")).filter(Boolean)
      : [];
    return {
      id: "video:1",
      mediaType: "video",
      url: candidate.url,
      sourceUrl: candidate.url,
      thumbnail: posterUrl || previewUrl || candidate.url,
      previewUrl: previewUrl || posterUrl || candidate.url,
      posterUrl: posterUrl || "",
      format: candidate.format || "MP4",
      resolution: candidate.width && candidate.height ? `${candidate.width} x ${candidate.height}` : "Unknown",
      size: "Unknown",
      width: candidate.width,
      height: candidate.height,
      duration: candidate.duration,
      isOriginal: false,
      selected: false,
      score: candidate.score,
      area: Number(candidate.width || 0) * Number(candidate.height || 0),
      download: {
        strategy: "weiboVideoDirect",
        allowDirectFallback: false,
        fallbackUrls,
      },
    };
  }

  function getVideoCandidateHost(rawUrl) {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function collectXinpianchangVideoMedia() {
    const media = [];
    const seen = new Set();
    const debug = {
      scannedVideoElements: 0,
      scannedSourceElements: 0,
      scannedAttributeCandidates: 0,
      scannedHtmlCandidates: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      acceptedPreview: [],
      rejectedPreview: [],
    };

    const push = (rawUrl, options = {}) => {
      const candidate = normalizeVideoCandidate(rawUrl, {
        ...options,
        strategy: "direct",
      });
      if (!candidate.ok) {
        debug.rejectedCount += 1;
        if (candidate.reason && debug.rejectedPreview.length < 12) {
          debug.rejectedPreview.push({ url: String(rawUrl || ""), reason: candidate.reason });
        }
        return;
      }

      if (seen.has(candidate.url)) {
        return;
      }

      seen.add(candidate.url);
      const enrichedCandidate = {
        ...candidate,
        score: scoreXinpianchangVideoCandidate(candidate),
      };
      media.push(enrichedCandidate);
      debug.acceptedCount += 1;
      if (debug.acceptedPreview.length < 12) {
        debug.acceptedPreview.push({
          url: enrichedCandidate.url,
          width: enrichedCandidate.width,
          height: enrichedCandidate.height,
          duration: enrichedCandidate.duration,
          format: enrichedCandidate.format,
          score: enrichedCandidate.score,
        });
      }
    };

    document.querySelectorAll("video").forEach((video) => {
      debug.scannedVideoElements += 1;
      const poster = normalizeUrl(video.getAttribute("poster") || "");
      const duration = Number(video.duration || video.getAttribute("data-duration") || 0);
      const width = Number(video.videoWidth || video.getAttribute("width") || video.clientWidth || 0);
      const height = Number(video.videoHeight || video.getAttribute("height") || video.clientHeight || 0);
      const sourceUrls = new Set();

      [
        { value: video.currentSrc, source: "video.currentSrc" },
        { value: video.src, source: "video.src" },
        { value: video.getAttribute("data-src"), source: "video.data-src" },
        { value: video.getAttribute("data-video"), source: "video.data-video" },
        { value: video.getAttribute("data-video-src"), source: "video.data-video-src" },
        { value: video.getAttribute("data-play-url"), source: "video.data-play-url" },
      ].forEach(({ value, source }) => {
        const normalized = normalizeVideoUrl(value || "");
        if (normalized) {
          sourceUrls.add(JSON.stringify({ url: normalized, source }));
        }
      });

      video.querySelectorAll("source[src]").forEach((source) => {
        debug.scannedSourceElements += 1;
        const normalized = normalizeVideoUrl(source.getAttribute("src") || "");
        if (normalized) {
          sourceUrls.add(JSON.stringify({ url: normalized, source: "video.source" }));
        }
      });

      Array.from(video.attributes || []).forEach((attr) => {
        const values = collectVideoUrlsFromText(String(attr.value || ""));
        debug.scannedAttributeCandidates += values.length;
        values.forEach((value) => sourceUrls.add(JSON.stringify({ url: value, source: `attr:${attr.name}` })));
      });

      sourceUrls.forEach((encoded) => {
        let entry = { url: String(encoded || ""), source: "" };
        try {
          entry = JSON.parse(encoded);
        } catch {}
        push(entry.url, {
          source: entry.source || "video",
          sourceType: "dom",
          posterUrl: poster,
          previewUrl: poster,
          duration,
          width,
          height,
        });
      });
    });

    document.querySelectorAll('meta[property*="video"], meta[name*="video"], link[rel*="video"]').forEach((node) => {
      const value = node.getAttribute("content") || node.getAttribute("href") || "";
      const normalized = normalizeVideoUrl(value);
      if (normalized) {
        push(normalized, {
          source: "meta",
          sourceType: "dom",
          previewUrl: normalizeUrl(node.getAttribute("content") || node.getAttribute("href") || ""),
        });
      }
    });

    const htmlCandidates = collectVideoUrlsFromText(document.documentElement?.innerHTML || "");
    debug.scannedHtmlCandidates += htmlCandidates.length;
    htmlCandidates.forEach((url) => push(url, {
      source: "html",
      sourceType: "document",
    }));

    const ranked = rankXinpianchangVideoCandidates(media);
    const selectedCandidate = ranked[0] || null;
    const selectedMedia = selectedCandidate ? buildXinpianchangVideoMediaItem(selectedCandidate) : null;

    return {
      media: selectedMedia ? [selectedMedia] : [],
      debug: {
        xinpianchang: {
          candidateCount: ranked.length,
          acceptedCount: selectedCandidate ? 1 : 0,
          rejectedCount: debug.rejectedCount,
          scannedVideoElements: debug.scannedVideoElements,
          scannedSourceElements: debug.scannedSourceElements,
          scannedAttributeCandidates: debug.scannedAttributeCandidates,
          scannedHtmlCandidates: debug.scannedHtmlCandidates,
          acceptedPreview: selectedCandidate ? [{
            url: selectedCandidate.url,
            width: selectedCandidate.width,
            height: selectedCandidate.height,
            duration: selectedCandidate.duration,
            format: selectedCandidate.format,
            score: selectedCandidate.score,
          }] : [],
          rejectedPreview: debug.rejectedPreview,
          candidatePreview: ranked.slice(0, 12).map((candidate) => ({
            url: candidate.url,
            width: candidate.width,
            height: candidate.height,
            duration: candidate.duration,
            format: candidate.format,
            score: candidate.score,
          })),
          selectedCandidate: selectedCandidate ? {
            url: selectedCandidate.url,
            width: selectedCandidate.width,
            height: selectedCandidate.height,
            duration: selectedCandidate.duration,
            format: selectedCandidate.format,
            score: selectedCandidate.score,
          } : null,
          fallbackToGeneric: !selectedCandidate,
        },
      },
    };
  }

  function collectXinpianchangVideoDebug() {
    return collectXinpianchangVideoMedia().debug?.xinpianchang || null;
  }

  function scoreXinpianchangVideoCandidate(candidate) {
    let score = computeVideoScore(candidate.url, candidate.width, candidate.height, candidate.duration);
    const host = getVideoCandidateHost(candidate.url);
    const url = String(candidate.url || "").toLowerCase();

    if (/xpccdn\.com$/i.test(host) || /xinpianchang\.com$/i.test(host)) {
      score += 140;
    }
    if (/\.xpccdn\.com$/i.test(host) && /-l\./i.test(host)) {
      score += 220;
    }
    if (/video\.currentsrc|video\.src/i.test(String(candidate.source || ""))) {
      score += 260;
    }
    if (/(?:original|source|master|hd|large|high|raw)/.test(url)) {
      score += 80;
    }
    if (/(?:preview|thumb|poster|small|sprite)/.test(url)) {
      score -= 100;
    }

    return score;
  }

  function rankXinpianchangVideoCandidates(candidates) {
    return Array.from(candidates || []).sort((left, right) => {
      if ((right.score || 0) !== (left.score || 0)) {
        return (right.score || 0) - (left.score || 0);
      }
      const rightArea = Number(right.width || 0) * Number(right.height || 0);
      const leftArea = Number(left.width || 0) * Number(left.height || 0);
      if (rightArea !== leftArea) {
        return rightArea - leftArea;
      }
      if ((right.duration || 0) !== (left.duration || 0)) {
        return (right.duration || 0) - (left.duration || 0);
      }
      return String(left.url || "").localeCompare(String(right.url || ""));
    });
  }

  function buildXinpianchangVideoMediaItem(candidate) {
    const posterUrl = normalizeUrl(candidate.posterUrl || candidate.previewUrl || "");
    const previewUrl = normalizeUrl(candidate.previewUrl || candidate.posterUrl || candidate.url || "");
    return {
      id: "video:1",
      mediaType: "video",
      url: candidate.url,
      sourceUrl: candidate.url,
      thumbnail: posterUrl || previewUrl || candidate.url,
      previewUrl: previewUrl || posterUrl || candidate.url,
      posterUrl: posterUrl || "",
      format: candidate.format || "MP4",
      resolution: candidate.width && candidate.height ? `${candidate.width} x ${candidate.height}` : "Unknown",
      size: "Unknown",
      width: candidate.width,
      height: candidate.height,
      duration: candidate.duration,
      isOriginal: false,
      selected: false,
      score: candidate.score,
      area: Number(candidate.width || 0) * Number(candidate.height || 0),
      download: {
        strategy: selectVideoDownloadStrategy(candidate.url),
        outputExtension: isXinpianchangVideoUrl(candidate.url) ? "webm" : "",
        allowDirectFallback: false,
      },
    };
  }

  function parseWeiboAlbumUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      if (!/^(?:www\.)?weibo\.com$/i.test(parsed.hostname)) {
        return null;
      }

      if (parsed.searchParams.get("tabtype") !== "album") {
        return null;
      }

      const uid = String(parsed.searchParams.get("uid") || "").trim();
      const index = Number.parseInt(parsed.searchParams.get("index") || "", 10);
      if (!/^\d+$/.test(uid) || !Number.isFinite(index)) {
        return null;
      }

      return { uid, index };
    } catch {
      return null;
    }
  }

  function collectWeiboAlbumProjectCandidates(uid) {
    const dedupe = new Set();
    const results = [];
    const roots = findWeiboAlbumActiveRoots();
    const escapedUid = String(uid || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const directPattern = new RegExp(`(?:https?:)?\\/\\/weibo\\.com\\/${escapedUid}\\/([A-Za-z0-9]{4,})`, "ig");
    const shortPattern = /\/detail\/([A-Za-z0-9]{4,})/ig;

    const push = (projectId, source, score, rawValue) => {
      const normalized = normalizeWeiboProjectId(projectId);
      if (!normalized) {
        return;
      }

      const detailUrl = `https://weibo.com/${uid}/${normalized}`;
      const key = `${normalized}|${detailUrl}`;
      if (dedupe.has(key)) {
        return;
      }

      dedupe.add(key);
      results.push({
        projectId: normalized,
        detailUrl,
        source,
        score,
        rawValue: String(rawValue || "").slice(0, 240),
      });
    };

    roots.forEach((root) => {
      const scope = root || document;
      const nodes = Array.from(scope.querySelectorAll?.("a[href], [action-data], [data-url], [data-href], [data-mid], [mid], [mblogid]") || []);
      nodes.forEach((node) => {
        ["href", "action-data", "data-url", "data-href", "data-mid", "mid", "mblogid"].forEach((attrName) => {
          const raw = node.getAttribute?.(attrName) || "";
          if (raw) {
            collectWeiboAlbumProjectCandidatesFromText(raw, `attr:${attrName}`);
          }
        });
      });

      collectWeiboAlbumProjectCandidatesFromText(scope.innerHTML || "", "html");
    });

    collectWeiboAlbumProjectCandidatesFromText(document.documentElement?.innerHTML || "", "document");

    results.sort((left, right) => right.score - left.score || left.projectId.localeCompare(right.projectId));
    return results;

    function collectWeiboAlbumProjectCandidatesFromText(value, source) {
      const text = String(value || "").replace(/&amp;/g, "&");
      if (!text) {
        return;
      }

      let match;
      while ((match = directPattern.exec(text)) !== null) {
        push(match[1], source, 100, text);
      }

      while ((match = shortPattern.exec(text)) !== null) {
        push(match[1], source, 70, text);
      }

      const detailAlt = text.match(/(?:projectid|project_id|mblogid|mid)["'=:%\s]+([A-Za-z0-9]{4,})/i);
      if (detailAlt?.[1]) {
        push(detailAlt[1], source, 30, text);
      }
    }
  }

  function findWeiboAlbumActiveRoots() {
    const selectors = [
      "main",
      "[role='dialog']",
      "[aria-modal='true']",
      '[class*="album"]',
      '[class*="Album"]',
      '[class*="photo"]',
      '[class*="Photo"]',
      '[class*="modal"]',
      '[class*="Modal"]',
      '[class*="dialog"]',
      '[class*="Dialog"]',
      '[class*="layer"]',
      '[class*="Layer"]',
    ];

    const roots = [];
    selectors.forEach((selector) => {
      Array.from(document.querySelectorAll(selector)).forEach((node) => {
        if (node instanceof Element && !roots.includes(node)) {
          roots.push(node);
        }
      });
    });

    if (!roots.length) {
      roots.push(document.body || document.documentElement);
    }

    return roots.filter(Boolean).slice(0, 12);
  }

  function normalizeWeiboProjectId(value) {
    const text = String(value || "").trim();
    return /^[A-Za-z0-9]{4,}$/.test(text) ? text : "";
  }

  function collectWeiboTimeCandidates() {
    const candidates = [];
    const seen = new Set();
    const push = (value) => {
      const text = String(value || "").trim();
      if (!text || seen.has(text)) {
        return;
      }
      seen.add(text);
      candidates.push(text);
    };

    Array.from(document.querySelectorAll("time[datetime]")).forEach((node) => {
      push(node.getAttribute("datetime") || "");
      push(node.textContent || "");
    });
    Array.from(document.querySelectorAll("[datetime]")).forEach((node) => {
      push(node.getAttribute("datetime") || "");
      push(node.textContent || "");
    });

    push(document.querySelector('meta[property="article:published_time"]')?.content || "");
    push(document.querySelector('meta[name="date"]')?.content || "");
    push(document.querySelector('meta[property="og:time"]')?.content || "");

    const root = findWeiboPostContainer();
    if (root) {
      const articleText = root.innerText || root.textContent || "";
      extractWeiboDateStrings(articleText).forEach(push);
    }

    const html = document.documentElement?.innerHTML || "";
    [
      /"(?:created_at|publish_time|published_at|status_time)"\s*:\s*"([^"]+)"/ig,
      /"(?:created_at|publish_time|published_at|status_time)"\s*:\s*(\d{10,13})/ig,
    ].forEach((pattern) => {
      for (const match of html.matchAll(pattern)) {
        if (match?.[1]) {
          push(match[1]);
        }
      }
    });

    extractWeiboDateStrings(html).forEach(push);
    return candidates;
  }

  function extractWeiboDateStrings(value) {
    const text = String(value || "");
    if (!text) {
      return [];
    }

    const matches = new Set();
    const patterns = [
      /\b20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2}\b/g,
      /\b\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2}\b/g,
      /(?:今天|昨日|昨天)\s+\d{1,2}:\d{2}/g,
      /\b\d{1,2}:\d{2}\b/g,
    ];

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const raw = String(match[0] || "").trim();
        if (raw) {
          matches.add(raw);
        }
      }
    }

    return Array.from(matches);
  }

  function parseWeiboDateLikeText(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) {
      return null;
    }

    const now = new Date();
    const todayMatch = raw.match(/^(今天|今日)\s+(\d{1,2}):(\d{2})$/);
    if (todayMatch) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(todayMatch[2]), Number(todayMatch[3]));
    }

    const yesterdayMatch = raw.match(/^(昨天|昨日)\s+(\d{1,2}):(\d{2})$/);
    if (yesterdayMatch) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(yesterdayMatch[2]), Number(yesterdayMatch[3]));
      date.setDate(date.getDate() - 1);
      return date;
    }

    const fullMatch = raw.match(/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?\s+(\d{1,2}):(\d{2})$/);
    if (fullMatch) {
      return new Date(Number(fullMatch[1]), Number(fullMatch[2]) - 1, Number(fullMatch[3]), Number(fullMatch[4]), Number(fullMatch[5]));
    }

    const monthDayMatch = raw.match(/^(\d{1,2})[-/.月](\d{1,2})(?:日)?\s+(\d{1,2}):(\d{2})$/);
    if (monthDayMatch) {
      return new Date(now.getFullYear(), Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]), Number(monthDayMatch[3]), Number(monthDayMatch[4]));
    }

    const normalized = raw
      .replace(/\u5e74|\/|\./g, "-")
      .replace(/\u6708/g, "-")
      .replace(/\u65e5/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function inferBehancePublishedAt() {
    const candidates = [
      document.querySelector('meta[property="article:published_time"]')?.content || "",
      document.querySelector('meta[name="date"]')?.content || "",
      document.querySelector('meta[property="og:updated_time"]')?.content || "",
    ];

    const html = document.documentElement?.innerHTML || "";
    const match = html.match(/"(?:published_on|published_at|created_on|created_at)"\s*:\s*"([^"]+)"/i);
    if (match?.[1]) {
      candidates.push(match[1]);
    }

    return normalizePublishedAt(candidates);
  }

  function normalizePublishedAt(values) {
    for (const value of values) {
      const raw = String(value || "").trim();
      if (!raw) {
        continue;
      }

      if (/^\d{10,13}$/.test(raw)) {
        const numeric = Number(raw);
        const date = new Date(raw.length === 13 ? numeric : numeric * 1000);
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
        continue;
      }

      const customDate = parseWeiboDateLikeText(raw);
      if (customDate && !Number.isNaN(customDate.getTime())) {
        return customDate.toISOString();
      }

      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return "";
  }

  function extractBehanceUsername(value) {
    const pathname = normalizePathname(value);
    const match = pathname.match(/^\/([^/]+)\/project\/\d+/i);
    return match ? match[1] : "";
  }

  function inferBehanceUsername() {
    const direct = extractBehanceUsername(location.pathname);
    if (direct) {
      return direct;
    }

    const scored = new Map();
    const push = (username, weight = 1) => {
      const cleaned = String(username || "").trim();
      if (!cleaned || !isUsableBehanceUsername(cleaned)) {
        return;
      }
      scored.set(cleaned, (scored.get(cleaned) || 0) + weight);
    };

    [
      document.querySelector('meta[property="og:url"]')?.content || "",
      document.querySelector('meta[name="twitter:url"]')?.content || "",
      document.querySelector('link[rel="canonical"]')?.href || "",
    ].forEach((value) => push(extractBehanceProfileSlug(value), 3));

    const anchors = Array.from(document.querySelectorAll('main a[href], header a[href], a[href]'));
    anchors.forEach((anchor) => {
      const username = extractBehanceProfileSlug(anchor.getAttribute("href") || "");
      if (!username) {
        return;
      }

      let weight = 1;
      const text = cleanProjectTitle(
        anchor.getAttribute("title") ||
        anchor.getAttribute("aria-label") ||
        anchor.textContent ||
        ""
      );
      if (text) {
        weight += 2;
      }

      const rect = typeof anchor.getBoundingClientRect === "function" ? anchor.getBoundingClientRect() : null;
      if (rect && rect.top >= 0 && rect.top < window.innerHeight * 1.5) {
        weight += 1;
      }

      if (anchor.closest("main")) {
        weight += 1;
      }

      push(username, weight);
    });

    return Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])[0] || "";
  }

  function inferBehanceAuthorContext() {
    const slug = inferBehanceUsername();
    const authorName = inferBehanceAuthorName();
    return {
      slug,
      authorName,
    };
  }

  function inferBehanceAuthorName() {
    const scored = new Map();
    const push = (name, weight = 1) => {
      const cleaned = cleanProjectTitle(name || "");
      if (!cleaned || !isUsableBehanceAuthorName(cleaned)) {
        return;
      }
      scored.set(cleaned, (scored.get(cleaned) || 0) + weight);
    };

    const main = document.querySelector("main");
    const anchors = Array.from(document.querySelectorAll('main a[href], header a[href], a[href]'));
    anchors.forEach((anchor) => {
      const slug = extractBehanceProfileSlug(anchor.getAttribute("href") || "");
      if (!slug) {
        return;
      }

      const text = cleanProjectTitle(
        anchor.getAttribute("title") ||
        anchor.getAttribute("aria-label") ||
        anchor.textContent ||
        ""
      );
      if (!text) {
        return;
      }

      let weight = 2;
      if (main && anchor.closest("main")) {
        weight += 3;
      }
      const rect = typeof anchor.getBoundingClientRect === "function" ? anchor.getBoundingClientRect() : null;
      if (rect && rect.top >= 0 && rect.top < window.innerHeight * 1.8) {
        weight += 2;
      }
      if (text.split(/\s+/).length >= 2) {
        weight += 1;
      }

      push(text, weight);
    });

    collectBehanceJsonLdAuthorCandidates().forEach((entry) => {
      push(entry.name, 4);
    });

    return Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])[0] || "";
  }

  function collectBehanceUsernameProbe() {
    if (!/behance\.net$/i.test(location.hostname)) {
      return null;
    }

    const directSlug = extractBehanceUsername(location.pathname);
    const metaCandidates = [
      {
        label: "og:url",
        value: document.querySelector('meta[property="og:url"]')?.content || "",
      },
      {
        label: "twitter:url",
        value: document.querySelector('meta[name="twitter:url"]')?.content || "",
      },
      {
        label: "canonical",
        value: document.querySelector('link[rel="canonical"]')?.href || "",
      },
    ].map((item) => ({
      ...item,
      slug: extractBehanceProfileSlug(item.value),
    })).filter((item) => item.value);

    const anchorCandidates = Array.from(document.querySelectorAll('main a[href], header a[href], a[href]'))
      .map((anchor) => {
        const href = anchor.getAttribute("href") || "";
        const slug = extractBehanceProfileSlug(href);
        const text = cleanProjectTitle(
          anchor.getAttribute("title") ||
          anchor.getAttribute("aria-label") ||
          anchor.textContent ||
          ""
        );
        if (!slug && !text) {
          return null;
        }
        return {
          href,
          slug,
          text,
          inMain: !!anchor.closest("main"),
        };
      })
      .filter(Boolean)
      .slice(0, 20);

    const metaAuthor = document.querySelector('meta[name="author"]')?.content || "";
    const jsonLdCandidates = collectBehanceJsonLdAuthorCandidates();

    return {
      locationPath: location.pathname,
      directSlug,
      metaCandidates,
      metaAuthor,
      anchorCandidates,
      jsonLdCandidates,
      finalSlug: inferBehanceUsername(),
      finalAuthorName: inferBehanceAuthorName(),
    };
  }

  function collectBehanceJsonLdAuthorCandidates() {
    const results = [];
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    scripts.forEach((script) => {
      const text = script.textContent || "";
      if (!text.trim()) {
        return;
      }

      try {
        const parsed = JSON.parse(text);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        entries.forEach((entry) => {
          const author = entry?.author;
          const url = String(author?.url || author?.mainEntityOfPage || "");
          const slug = extractBehanceProfileSlug(url);
          const name = cleanProjectTitle(author?.name || author?.alternateName || author?.identifier || "");
          if (url || slug || name) {
            results.push({
              url,
              slug,
              name,
            });
          }
        });
      } catch {
        // Ignore invalid JSON-LD blocks.
      }
    });

    return results.slice(0, 12);
  }

  function extractBehanceProfileSlug(value) {
    const href = String(value || "").trim();
    if (!href) {
      return "";
    }

    try {
      const parsed = new URL(href, location.href);
      if (!/behance\.net$/i.test(parsed.hostname)) {
        return "";
      }
      const pathname = normalizePathname(parsed.pathname);
      const match = pathname.match(/^\/([^/]+)\/?$/);
      return match ? match[1] : "";
    } catch {
      const pathname = normalizePathname(href);
      const match = pathname.match(/^\/([^/]+)\/?$/);
      return match ? match[1] : "";
    }
  }

  function isUsableBehanceUsername(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) {
      return false;
    }

    return ![
      "gallery",
      "assets",
      "joblist",
      "search",
      "about",
      "adobe",
      "schools",
      "hire",
      "blog",
      "services",
    ].includes(text);
  }

  function isUsableBehanceAuthorName(value) {
    const text = String(value || "").trim();
    if (!text || text.length < 3) {
      return false;
    }

    const lowered = text.toLowerCase();
    return ![
      "behance",
      "explore",
      "jobs",
      "client work",
      "about behance",
      "blog",
      "community",
      "help",
      "tou",
      "privacy",
      "skip to main content",
      "skip to footer",
    ].includes(lowered);
  }

  function extractBehanceProjectId(value) {
    const pathname = normalizePathname(value);
    if (!pathname) {
      return "";
    }

    let match = pathname.match(/\/gallery\/([^/?#]+)(?:\/|$)/i);
    if (match?.[1]) {
      return match[1];
    }

    match = pathname.match(/\/project\/([^/?#]+)(?:\/|$)/i);
    if (match?.[1]) {
      return match[1];
    }

    return "";
  }

  function normalizeUrl(rawUrl) {
    const value = String(rawUrl || "").trim().replace(/&amp;/g, "&");
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) return "";
    try {
      return new URL(value, location.href).toString();
    } catch {
      return "";
    }
  }

  function normalizeWeiboImageUrl(rawUrl) {
    const decoded = decodeEscapedUrl(rawUrl);
    if (!decoded) {
      return "";
    }

    try {
      const parsed = new URL(decoded);
      if (!/(^|\.)sinaimg\.cn$/i.test(parsed.hostname)) {
        return "";
      }

      const parts = parsed.pathname.split("/");
      if (parts.length < 3) {
        return "";
      }

      const fileName = parts[parts.length - 1] || "";
      if (!/\.(?:jpe?g|png|gif|webp)(?:$|[?#])/i.test(fileName)) {
        return "";
      }

      const sizePartIndex = parts.length - 2;
      const sizePart = parts[sizePartIndex] || "";
      if (isWeiboCdnSizeSegment(sizePart)) {
        parts[sizePartIndex] = "large";
      }

      parsed.pathname = parts.join("/");
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function isWeiboCdnSizeSegment(value) {
    return /^(?:thumb\d+|thumbnail|square|orj\d+|wap\d+|mw\d+|bmiddle|small|large|oslarge)$/i.test(String(value || ""));
  }

  function pickBestSrcsetCandidate(srcset) {
    return pickBestSrcsetCandidateInfo(srcset).url;
  }

  function pickBestSrcsetCandidateInfo(srcset) {
    const candidates = String(srcset || "")
      .split(",")
      .map((part) => part.trim())
      .map((part) => {
        const [url, descriptor = ""] = part.split(/\s+/, 2);
        return { url, descriptor };
      })
      .filter((item) => item.url);

    if (!candidates.length) return { url: "", descriptor: "" };

    const score = (descriptor) => {
      const value = String(descriptor || "").trim().toLowerCase();
      if (!value) return 1;
      if (value.endsWith("w")) return Number.parseFloat(value) || 1;
      if (value.endsWith("x")) return (Number.parseFloat(value) || 1) * 10000;
      return 1;
    };

    return candidates.sort((a, b) => score(b.descriptor) - score(a.descriptor))[0] || { url: "", descriptor: "" };
  }

  function getSrcsetCandidateSize(url, img) {
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
    const info = pickBestSrcsetCandidateInfo(srcset);
    if (normalizeUrl(info.url) !== normalizeUrl(url)) {
      return { width: 0, height: 0 };
    }

    const descriptor = String(info.descriptor || "").trim().toLowerCase();
    if (descriptor.endsWith("w")) {
      const width = Number.parseInt(descriptor, 10) || 0;
      const naturalWidth = Number(img.naturalWidth || img.width || 0);
      const naturalHeight = Number(img.naturalHeight || img.height || 0);
      const ratio = naturalWidth && naturalHeight ? naturalHeight / naturalWidth : 0;
      return {
        width,
        height: ratio ? Math.round(width * ratio) : 0,
      };
    }

    if (descriptor.endsWith("x")) {
      const scale = Number.parseFloat(descriptor) || 0;
      return {
        width: Math.round((img.naturalWidth || img.width || 0) * scale),
        height: Math.round((img.naturalHeight || img.height || 0) * scale),
      };
    }

    return { width: 0, height: 0 };
  }

  function computeScore(url, sourceHint, width, height) {
    let score = 0;
    if (sourceHint === "weibo-original") score += 580;
    else if (sourceHint === "behance-original") score += 560;
    else if (sourceHint === "xiaohongshu-original") score += 550;
    else if (sourceHint === "weixin-original") score += 545;
    else if (sourceHint === "rendered-srcset") score += 400;
    else if (sourceHint === "rendered-data") score += 360;
    else if (sourceHint === "rendered-meta") score += 320;
    else if (sourceHint === "rendered-current") score += 300;
    else score += 220;

    const lowered = String(url || "").toLowerCase();
    if (/(original|orig|full|master|raw|source|highres|hires|largest|large|xl|xxl|4096|2048)/.test(lowered)) {
      score += 120;
    }
    if (/\/project_modules\/[^/]*max_3840[^/]*\//i.test(lowered)) {
      score += 220;
    }
    if (/\/\/[^/]+\.sinaimg\.cn\/(?:mw2000|large|mw1024|oslarge)\//i.test(lowered)) {
      score += 180;
    }
    if (/\/\/mmbiz\.qpic\.cn\/[^?#]+\/0(?:[?#]|$)/i.test(lowered)) {
      score += 180;
    }
    if (/(thumb|thumbnail|small|preview|avatar|icon|sprite|crop|tiny|medium)/.test(lowered)) {
      score -= 140;
    }
    if (/\/\/[^/]+\.sinaimg\.cn\/(?:thumb\d+|thumbnail|square|orj\d+|wap\d+|mw\d+|bmiddle)\//i.test(lowered)) {
      score -= 120;
    }
    if (isInstagramCroppedSquareUrl(url)) {
      score -= 260;
    }

    const area = (width || 0) * (height || 0);
    score += Math.min(500, Math.floor(area / 5000));
    return score;
  }

  function isBetterWeiboMediaVariant(candidate, existing) {
    const candidateRank = getWeiboSizeRank(candidate.url);
    const existingRank = getWeiboSizeRank(existing.url);
    if (candidateRank !== existingRank) {
      return candidateRank > existingRank;
    }

    if ((candidate.score || 0) !== (existing.score || 0)) {
      return (candidate.score || 0) > (existing.score || 0);
    }

    return (candidate.area || 0) > (existing.area || 0);
  }

  function isBetterInstagramMediaVariant(candidate, existing) {
    const candidateCrop = isInstagramCroppedSquareUrl(candidate.url);
    const existingCrop = isInstagramCroppedSquareUrl(existing.url);
    if (candidateCrop !== existingCrop) {
      return !candidateCrop;
    }

    if ((candidate.score || 0) !== (existing.score || 0)) {
      return (candidate.score || 0) > (existing.score || 0);
    }

    return (candidate.area || 0) > (existing.area || 0);
  }

  function isInstagramCroppedSquareUrl(url) {
    const raw = String(url || "").toLowerCase();
    if (!/cdninstagram\.com|fbcdn\.net|\/scontent/i.test(raw)) {
      return false;
    }

    try {
      const parsed = new URL(normalizeUrl(url));
      const stp = parsed.searchParams.get("stp") || "";
      return /(?:^|_)c\d+\.\d+\.\d+\.\d+a(?:_|$)/i.test(stp) || /s640x640/i.test(stp);
    } catch {
      return /[?&]stp=[^&#]*(?:c\d+\.\d+\.\d+\.\d+a|s640x640)/i.test(raw);
    }
  }

  function detectOriginal(item, maxArea, platformMedia) {
    const domainOriginalUrls = platformMedia?.originalUrls || null;
    if (domainOriginalUrls) {
      return domainOriginalUrls.has(item.url) || isInstagramOriginalMediaKey(item.url, platformMedia?.originalMediaKeys);
    }

    const area = item.area || 0;
    if (!area || !maxArea) return item.score >= 380;
    const areaRatio = area / maxArea;
    const lowered = String(item.url || "").toLowerCase();
    if (areaRatio >= 0.98) return true;
    if (/(thumb|thumbnail|small|preview|avatar|icon|sprite|crop|tiny|medium)/.test(lowered)) return false;
    if (/(original|orig|full|master|raw|source|highres|hires|largest|large|xl|xxl|4096|2048)/.test(lowered) && areaRatio >= 0.5) {
      return true;
    }
    return areaRatio >= 0.85 || item.score >= 500;
  }

  // Platform media collection owns original URL selection; callers consume the uniform result shape.
  async function collectPlatformMedia(maxIndexHint = 0) {
    const adapter = getCurrentPlatformAdapter();
    return adapter?.collectImages ? await adapter.collectImages(maxIndexHint) :
      adapter?.collectMedia ? await adapter.collectMedia(maxIndexHint) : createEmptyPlatformMedia();
  }

  function createEmptyPlatformMedia() {
    return {
      originalUrls: null,
      originalMediaKeys: null,
      originalUrlMeta: null,
      debug: {},
    };
  }

  function collectWeiboOriginalMedia() {
    const media = createEmptyPlatformMedia();
    if (!/weibo\.com$/i.test(location.hostname)) {
      return media;
    }

    const root = findWeiboPostContainer();
    const urls = new Set();
    const candidateImages = root ? collectVisualCandidates(root, {
      minArea: 60000,
      isAllowed: (img, candidate) =>
        isLikelyWeiboContentImage(img) &&
        !isLikelyWeiboUtilityImage(img) &&
        candidate.linkType !== "profile",
    }) : [];

    const mediaCandidates = selectWeiboPostMediaCandidates(candidateImages);
    createUrlSetFromCandidates(mediaCandidates).forEach((url) => {
      const largeUrl = normalizeWeiboImageUrl(url);
      if (largeUrl) urls.add(largeUrl);
    });

    const layerHints = collectWeiboLayerHints(root);

    media.originalUrls = urls.size ? urls : null;
    media.debug.original = {
      containerFound: !!root,
      containerTag: root ? root.tagName : null,
      candidateCount: candidateImages.length,
      clusterCount: mediaCandidates.length,
      layerIdCount: layerHints.layerIds.length,
      layerIds: layerHints.layerIds.slice(0, 12),
      urlCount: urls.size,
      preview: Array.from(urls).slice(0, 6),
    };

    return media;
  }

  async function collectWeixinOriginalMedia() {
    const media = createEmptyPlatformMedia();
    if (!isWeixinHost()) {
      return media;
    }

    const root = findWeixinArticleContainer();
    const candidateImages = collectWeixinArticleImageCandidates(root || document.body);

    const originalProbe = await collectWeixinOriginalProbe(candidateImages);
    media.originalUrls = originalProbe.urls.size ? originalProbe.urls : null;
    media.originalUrlMeta = originalProbe.meta.size ? originalProbe.meta : null;
    media.debug.original = {
      containerFound: !!root,
      containerTag: root ? root.tagName : null,
      candidateCount: candidateImages.length,
      bodyFallbackCandidateCount: candidateImages.filter((item) => item.sourceScope === "body-fallback").length,
      probeCount: originalProbe.probes.length,
      acceptedCount: originalProbe.probes.filter((item) => item.accepted).length,
      acceptedOriginalCount: originalProbe.probes.filter((item) => item.accepted && item.finalUrl === item.originalUrl).length,
      renderedCandidatePreview: candidateImages.slice(0, 8).map((candidate) => ({
        url: candidate.sourceUrl,
        width: candidate.width,
        height: candidate.height,
        sourceKind: candidate.sourceKind,
        sourceScope: candidate.sourceScope,
      })),
      sourceKindCounts: countWeixinCandidateSourceKinds(candidateImages),
      probePreview: originalProbe.probes.slice(0, 8),
      urlCount: originalProbe.urls.size,
      preview: Array.from(originalProbe.urls).slice(0, 8),
    };

    return media;
  }

  async function collectXiaohongshuOriginalMedia() {
    const media = createEmptyPlatformMedia();
    if (!isXiaohongshuHost()) {
      return media;
    }

    const html = document.documentElement?.innerHTML || "";
    const root = findXiaohongshuPostContainer();
    const mainContainer = findXiaohongshuMainMediaContainer(root);
    const mainCandidateImages = mainContainer ? collectVisualCandidates(mainContainer, {
      minArea: 50000,
      isAllowed: (img, candidate) =>
        isLikelyXiaohongshuContentImage(img) &&
        !isLikelyXiaohongshuUtilityImage(img) &&
        candidate.linkType !== "profile",
    }) : [];
    const mainMediaCandidates = selectXiaohongshuPostMediaCandidates(mainCandidateImages);
    const structuredImageProbe = collectXiaohongshuStructuredNoteImageCandidatesFromHtml(html);
    const structuredMediaCandidates = structuredImageProbe.candidates;
    const fallbackCandidateImages = root ? collectVisualCandidates(root, {
      minArea: 50000,
      isAllowed: (img, candidate) =>
        isLikelyXiaohongshuContentImage(img) &&
        !isLikelyXiaohongshuUtilityImage(img) &&
        candidate.linkType !== "profile",
    }) : [];
    const fallbackMediaCandidates = selectXiaohongshuPostMediaCandidates(fallbackCandidateImages);
    const htmlProbe = collectXiaohongshuHighResUrlsFromHtml();
    const htmlHighResUrls = htmlProbe.urls;
    const prioritizedCandidates = mainMediaCandidates.length
      ? mainMediaCandidates
      : structuredMediaCandidates.length
        ? structuredMediaCandidates
        : fallbackMediaCandidates;
    const enlargement = await collectXiaohongshuEnlargedMedia(prioritizedCandidates);
    const urls = enlargement.urls;

    media.originalUrls = urls.size ? urls : null;
    media.originalUrlMeta = enlargement.meta.size ? enlargement.meta : null;
    media.debug.original = {
      containerFound: !!root,
      containerTag: root ? root.tagName : null,
      mainContainerFound: !!mainContainer,
      mainContainerTag: mainContainer ? mainContainer.tagName : null,
      candidateStrategy: mainMediaCandidates.length
        ? "main-container"
        : structuredMediaCandidates.length
          ? "structured-imageList"
          : "visual-cluster",
      candidateCount: mainCandidateImages.length,
      clusterCount: fallbackCandidateImages.length,
      structuredImageCount: structuredMediaCandidates.length,
      renderedCandidatePreview: prioritizedCandidates.slice(0, 6).map((candidate) => ({
        url: normalizeXiaohongshuImageUrl(candidate.sourceUrl || candidate.img?.currentSrc || candidate.img?.src || ""),
        width: candidate.width,
        height: candidate.height,
        sourceKind: candidate.sourceKind || "",
        sourceScope: candidate.sourceScope || "",
      })),
      structuredImagePreview: structuredImageProbe.preview.slice(0, 6),
      structuredRejectedPreview: structuredImageProbe.rejectedPreview.slice(0, 6),
      renderedClusterPreview: fallbackMediaCandidates.slice(0, 6).map((candidate) => ({
        url: normalizeXiaohongshuImageUrl(candidate.img.currentSrc || candidate.img.src || ""),
        width: candidate.width,
        height: candidate.height,
      })),
      htmlRawCandidateCount: htmlProbe.rawCount,
      htmlImageCandidateCount: htmlProbe.imageCount,
      htmlHighResCount: htmlHighResUrls.size,
      htmlRawPreview: htmlProbe.rawPreview,
      htmlHighResPreview: Array.from(htmlHighResUrls).slice(0, 6),
      htmlRejectedPreview: htmlProbe.rejectedPreview,
      enlargedCandidateCount: enlargement.probes.length,
      enlargedAcceptedCount: enlargement.probes.filter((item) => item.accepted).length,
      enlargedPreview: enlargement.probes.slice(0, 6),
      urlCount: urls.size,
      preview: Array.from(urls).slice(0, 6),
    };

    return media;
  }

  async function collectInstagramOriginalMedia(maxIndexHint = 0) {
    const media = createEmptyPlatformMedia();
    if (!/instagram\.com$/i.test(location.hostname)) {
      return media;
    }

    if (!extractInstagramPostCode(location.pathname)) {
      return media;
    }

    const article = findInstagramPostContainer();
    if (!article) {
      return media;
    }

    const candidateImages = collectVisualCandidates(article, {
      minArea: 50000,
      isAllowed: (img, candidate) =>
        !isInsideForeignPostLink(img) &&
        !isInsideProfileLink(img) &&
        candidate.top <= getContainerTop(article) + 1800,
    });

    if (!candidateImages.length) {
      return media;
    }

    const firstCluster = takeLeadingCluster(candidateImages, 900);
    const allowedLinkTypes = new Set(["none", "self-post", "other-link"]);
    const narrowed = firstCluster.filter((candidate) => allowedLinkTypes.has(candidate.linkType));
    const clusterCandidates = narrowed.length ? narrowed : firstCluster.slice(0, 10);
    const clusterUrls = createUrlSetFromCandidates(clusterCandidates);
    const carouselEvidence = await getInstagramCarouselEvidence(article, maxIndexHint);
    const carouselCount = carouselEvidence.count;
    media.debug.sampling = {
      sampleIndexes: [],
      sampledUrlCount: 0,
      sampledUrlPreview: [],
      usedSampledUrls: false,
      carouselCount,
      carouselEvidence,
      sampledMediaKeyCount: 0,
    };

    const sampledUrls = carouselCount > 1 ? await fetchInstagramSampledUrls(carouselCount) : null;
    if (sampledUrls?.size) {
      sampledUrls.forEach((url) => clusterUrls.add(url));
    }

    media.debug.sampling = {
      sampleIndexes: carouselCount > 0 ? buildInstagramProbeIndexes(carouselCount) : [],
      sampledUrlCount: sampledUrls ? sampledUrls.size : 0,
      sampledMediaKeyCount: sampledUrls ? countInstagramMediaKeys(sampledUrls) : 0,
      sampledUrlPreview: sampledUrls ? Array.from(sampledUrls).slice(0, 6) : [],
      usedSampledUrls: !!sampledUrls?.size,
      carouselCount,
      carouselEvidence,
    };

    media.originalUrls = clusterUrls.size ? clusterUrls : null;
    media.originalMediaKeys = buildInstagramOriginalMediaKeys(media.originalUrls);
    return media;
  }

  function collectBehanceOriginalMedia() {
    const media = createEmptyPlatformMedia();
    const main = document.querySelector("main");
    if (!main) {
      return media;
    }

    const candidateImages = collectVisualCandidates(main, {
      minArea: 180000,
      isAllowed: (img, candidate) =>
        !isInsideBehanceRelatedLink(img) &&
        !isLikelyBehanceUtilityImage(img) &&
        candidate.linkType !== "profile" &&
        candidate.linkType !== "other-link",
    });

    if (!candidateImages.length) {
      return media;
    }

    const urls = createBehanceUrlSetFromCandidates(candidateImages);
    const htmlHighResUrls = collectBehanceHighResUrlsFromHtml();
    htmlHighResUrls.forEach((url) => mergeBehancePreferredUrl(urls, url));

    media.originalUrls = urls.size ? urls : null;
    media.debug.original = {
      candidateCount: candidateImages.length,
      clusterCount: candidateImages.length,
      urlCount: urls.size,
      htmlHighResCount: htmlHighResUrls.size,
      srcset3840Count: candidateImages.filter((candidate) =>
        /\b3840w\b/i.test(candidate.img.getAttribute("srcset") || candidate.img.getAttribute("data-srcset") || "")
      ).length,
      preview: Array.from(urls).slice(0, 6),
    };

    return media;
  }

  function collectVisualCandidates(root, options) {
    const items = Array.from(root.querySelectorAll("img"))
      .map((img) => buildVisualCandidate(img))
      .filter(Boolean)
      .filter((candidate) => candidate.area >= (options.minArea || 0))
      .filter((candidate) => (options.isAllowed ? options.isAllowed(candidate.img, candidate) : true))
      .sort((a, b) => a.top - b.top);

    return items.map((candidate, index) => ({
      ...candidate,
      topGap: index === 0 ? 0 : candidate.top - items[index - 1].top,
    }));
  }

  function buildVisualCandidate(img) {
    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    const area = width * height;
    if (!area) {
      return null;
    }

    return {
      img,
      width,
      height,
      area,
      top: Math.max(0, Math.round(img.getBoundingClientRect().top + window.scrollY)),
      linkType: classifyLinkContext(img),
    };
  }

  function getContainerTop(element) {
    return Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY));
  }

  async function getInstagramCarouselEvidence(root, maxIndexHint = 0) {
    const postCode = extractInstagramPostCode(location.pathname);
    if (!postCode) {
      return {
        count: 0,
        source: "missing-post-code",
        hrefMax: 0,
        htmlEvidenceMax: 0,
        visibleCount: 0,
        liveDistinctCount: 0,
        usedHint: false,
        hintValue: Number(maxIndexHint || 0) || 0,
      };
    }

    let hrefMax = 0;
    const hrefs = [
      ...Array.from(root.querySelectorAll('a[href*="img_index="]')).map((node) => node.getAttribute("href") || ""),
      ...Array.from(document.querySelectorAll('a[href*="img_index="]')).map((node) => node.getAttribute("href") || ""),
    ];

    for (const href of hrefs) {
      try {
        const parsed = new URL(href, location.href);
        if (!sameInstagramPostPath(parsed.pathname)) {
          continue;
        }

        const value = Number.parseInt(parsed.searchParams.get("img_index") || "", 10);
        if (Number.isFinite(value) && value > 0) {
          hrefMax = Math.max(hrefMax, value);
        }
      } catch {
        // Ignore malformed links.
      }
    }

    const htmlEvidenceMax = extractInstagramCarouselCountFromHtml(postCode);
    let visibleCount = 0;
    let liveDistinctCount = 0;
    const hrefOrHtmlMax = Math.max(hrefMax, htmlEvidenceMax);
    if (hrefOrHtmlMax > 0) {
      return {
        count: hrefOrHtmlMax,
        source: hrefMax >= htmlEvidenceMax ? "href" : "html",
        hrefMax,
        htmlEvidenceMax,
        visibleCount,
        liveDistinctCount,
        usedHint: false,
        hintValue: Number(maxIndexHint || 0) || 0,
      };
    }

    if (root) {
      const candidateImages = collectVisualCandidates(root, {
        minArea: 20000,
        isAllowed: (img, candidate) =>
          !isInsideForeignPostLink(img) &&
          !isInsideProfileLink(img) &&
          candidate.top <= getContainerTop(root) + 1800,
      });

      if (candidateImages.length) {
        const firstCluster = takeLeadingCluster(candidateImages, 900);
        const allowedLinkTypes = new Set(["none", "self-post", "other-link"]);
        const narrowed = firstCluster.filter((candidate) => allowedLinkTypes.has(candidate.linkType));
        const clusterCandidates = narrowed.length ? narrowed : firstCluster.slice(0, 10);
        visibleCount = createUrlSetFromCandidates(clusterCandidates).size || clusterCandidates.length;
        if (visibleCount > 0) {
          return {
            count: visibleCount,
            source: "visible-cluster",
            hrefMax,
            htmlEvidenceMax,
            visibleCount,
            liveDistinctCount,
            usedHint: false,
            hintValue: Number(maxIndexHint || 0) || 0,
          };
        }
      }
    }

    if (root) {
      const containerTop = getContainerTop(root);
      const liveImages = Array.from(root.querySelectorAll("img"))
        .filter((img) => img instanceof HTMLImageElement)
        .map((img) => ({
          img,
          src: img.currentSrc || img.src || "",
          width: Number(img.naturalWidth || img.width || 0),
          height: Number(img.naturalHeight || img.height || 0),
          top: Math.max(0, Math.round(img.getBoundingClientRect().top + window.scrollY)),
        }))
        .filter((item) =>
          item.src &&
          item.width >= 120 &&
          item.height >= 120 &&
          item.top <= containerTop + 1800 &&
          !isInsideForeignPostLink(item.img) &&
          !isInsideProfileLink(item.img)
        );

      if (liveImages.length) {
        const distinctSources = new Set(
          liveImages.map((item) => {
            try {
              const parsed = new URL(item.src, location.href);
              parsed.search = "";
              return parsed.toString();
            } catch {
              return item.src;
            }
          })
        );
        liveDistinctCount = distinctSources.size || 0;
        if (liveDistinctCount > 0) {
          return {
            count: liveDistinctCount,
            source: "live-images",
            hrefMax,
            htmlEvidenceMax,
            visibleCount,
            liveDistinctCount,
            usedHint: false,
            hintValue: Number(maxIndexHint || 0) || 0,
          };
        }
      }
    }

    const hintValue = Number(maxIndexHint || 0) || 0;
    return {
      count: hintValue > 0 ? hintValue : 0,
      source: hintValue > 0 ? "hint" : "none",
      hrefMax,
      htmlEvidenceMax,
      visibleCount,
      liveDistinctCount,
      usedHint: hintValue > 0,
      hintValue,
    };
  }

  async function extractInstagramCarouselCount(root, maxIndexHint = 0) {
    const evidence = await getInstagramCarouselEvidence(root, maxIndexHint);
    return evidence.count;
  }

  function extractCurrentImgIndex() {
    try {
      const currentUrl = new URL(location.href);
      const value = Number.parseInt(currentUrl.searchParams.get("img_index") || "", 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function sameInstagramPostPath(pathname) {
    const left = extractInstagramPostCode(pathname);
    const right = extractInstagramPostCode(location.pathname);
    return !!left && left === right;
  }

  function getCurrentPlatformAdapter() {
    return PLATFORM_REGISTRY.find((platform) => platform.match()) || null;
  }

  async function buildDebugInfo(images, platformMedia, maxIndexHint = 0) {
    const domainOriginalUrls = platformMedia?.originalUrls || null;
    const mediaDebug = platformMedia?.debug || {};
    const originalMediaKeys = platformMedia?.originalMediaKeys || null;
    const originals = images.filter((item) => item.isOriginal).length;
    const instagramContainer = /instagram\.com$/i.test(location.hostname) ? findInstagramPostContainer() : null;
    const instagramCarouselEvidence = instagramContainer
      ? await getInstagramCarouselEvidence(instagramContainer, maxIndexHint)
      : {
          count: maxIndexHint,
          source: maxIndexHint > 0 ? "hint" : "none",
          hrefMax: 0,
          htmlEvidenceMax: 0,
          visibleCount: 0,
          liveDistinctCount: 0,
          usedHint: maxIndexHint > 0,
          hintValue: maxIndexHint,
        };
    const instagramMaxImgIndex = instagramCarouselEvidence.count;
    const debug = {
      domain: location.hostname,
      contentBuildHash: CONTENT_BUILD_HASH,
      imageCount: images.length,
      originalCount: originals,
      whitelistCount: domainOriginalUrls ? domainOriginalUrls.size : null,
      whitelistMediaKeyCount: originalMediaKeys ? originalMediaKeys.size : null,
    };

    if (/instagram\.com$/i.test(location.hostname)) {
      debug.instagram = {
        postCode: extractInstagramPostCode(location.pathname),
        normalizedPath: normalizeInstagramPostPath(location.pathname),
        currentImgIndex: extractCurrentImgIndex(),
        maxImgIndex: instagramMaxImgIndex,
        maxIndexHint,
        countEvidence: instagramCarouselEvidence,
        articleFound: !!document.querySelector("main article"),
        articleTop: instagramContainer ? getContainerTop(instagramContainer) : null,
        containerFound: !!instagramContainer,
        containerTag: instagramContainer ? instagramContainer.tagName : null,
        usernameProbe: collectInstagramUsernameProbe(),
        sampling: mediaDebug.sampling,
        externalSampling: mediaDebug.externalSampling,
      };
    }

    if (/behance\.net$/i.test(location.hostname)) {
      const main = document.querySelector("main");
      debug.behance = {
        mainFound: !!main,
        mainTop: main ? getContainerTop(main) : null,
        usernameProbe: collectBehanceUsernameProbe(),
        original: mediaDebug.original,
      };
    }

    if (isXiaohongshuHost()) {
      debug.xiaohongshu = {
        noteId: extractXiaohongshuNoteId(location.href),
        usernameProbe: collectXiaohongshuUsernameProbeV2(),
        dateProbe: collectXiaohongshuDateProbe(),
        original: mediaDebug.original,
      };
    }

    if (/weibo\.com$/i.test(location.hostname)) {
      debug.weibo = {
        statusId: extractWeiboStatusId(location.href),
        album: collectWeiboAlbumProbe(),
        timeProbe: collectWeiboTimeProbe(),
        original: mediaDebug.original,
        externalSampling: mediaDebug.externalSampling,
        video: mediaDebug.video?.weibo || null,
      };
    }

    if (isXinpianchangHost()) {
      debug.xinpianchang = {
        video: mediaDebug.video?.xinpianchang || null,
      };
    }

    if (/weixin\.qq\.com$/i.test(location.hostname)) {
      debug.weixin = {
        projectId: extractWeixinProjectId(location.href),
        author: inferWeixinAuthorName(),
        publishedAt: inferWeixinPublishedAt(),
        original: mediaDebug.original,
      };
    }

    return debug;
  }

  function findInstagramPostContainer() {
    const main = document.querySelector("main");
    if (!main) {
      return null;
    }

    const directArticle = main.querySelector("article");
    if (directArticle) {
      return directArticle;
    }

    const scopedCandidates = Array.from(main.querySelectorAll("section, div"))
      .map((node) => ({
        node,
        score: scoreInstagramContainer(node),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scopedCandidates[0]?.node || null;
  }

  function isXiaohongshuHost() {
    return /(^|\.)xiaohongshu\.com$/i.test(location.hostname);
  }

  function isInstagramHost() {
    return /(^|\.)instagram\.com$/i.test(location.hostname);
  }

  function isBehanceHost() {
    return /(^|\.)behance\.net$/i.test(location.hostname);
  }

  function isWeiboHost() {
    return /(^|\.)weibo\.com$/i.test(location.hostname);
  }

  function isXinpianchangHost() {
    return /(^|\.)xinpianchang\.com$/i.test(location.hostname);
  }

  function isWeixinHost() {
    return /(^|\.)weixin\.qq\.com$/i.test(location.hostname);
  }

  function inferXiaohongshuAuthorContext() {
    const profileLink = findXiaohongshuPrimaryProfileLink();
    if (profileLink?.userId) {
      return {
        username: profileLink.text || "",
        userId: profileLink.userId,
        source: "profile-link",
        href: profileLink.href,
      };
    }

    const scriptInfo = extractXiaohongshuAuthorFromHtml();
    if (scriptInfo.userId || scriptInfo.username) {
      return {
        username: scriptInfo.username,
        userId: scriptInfo.userId,
        source: "html",
      };
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const titleMatch = metaTitle.match(XIAOHONGSHU_TITLE_PATTERN);
    if (titleMatch?.[1]) {
      return {
        username: cleanProjectTitle(titleMatch[1]),
        userId: "",
        source: "meta-title",
      };
    }

    return null;
  }

  function collectXiaohongshuUsernameProbe() {
    if (!isXiaohongshuHost()) {
      return null;
    }

    const noteId = extractXiaohongshuNoteId(location.href);
    const profileLink = findXiaohongshuPrimaryProfileLink();
    const profileCandidates = collectXiaohongshuProfileCandidates();
    const scriptInfo = extractXiaohongshuAuthorFromHtml();
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const pageTitle = document.title || "";
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content || "";

    return {
      locationPath: location.pathname,
      noteId,
      canonical,
      ogUrl,
      metaTitle,
      pageTitle,
      profileLink,
      profileCandidates,
      scriptInfo,
      finalContext: inferXiaohongshuAuthorContext(),
    };
  }

  function findXiaohongshuPrimaryProfileLink() {
    const root = findXiaohongshuPostContainer() || document.body;
    const links = root ? Array.from(root.querySelectorAll('a[href]')) : [];
    let fallback = null;
    for (const link of links) {
      const info = parseXiaohongshuProfileLink(link.getAttribute("href") || "");
      if (!info.userId) {
        continue;
      }

      const text = cleanProjectTitle(link.textContent || link.getAttribute("title") || link.getAttribute("aria-label") || "");
      const item = {
        href: info.href,
        userId: info.userId,
        text,
      };
      if (text && text !== XIAOHONGSHU_SELF_TEXT) {
        return item;
      }
      if (!fallback) {
        fallback = item;
      }
    }

    return fallback;
  }

  function collectXiaohongshuProfileCandidates() {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const items = [];
    const seen = new Set();

    for (const link of links) {
      const info = parseXiaohongshuProfileLink(link.getAttribute("href") || "");
      if (!info.userId) {
        continue;
      }

      const key = `${info.userId}|${info.href}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      items.push({
        href: info.href,
        userId: info.userId,
        text: cleanProjectTitle(link.textContent || link.getAttribute("title") || link.getAttribute("aria-label") || ""),
      });
      if (items.length >= 8) {
        break;
      }
    }

    return items;
  }

  function parseXiaohongshuProfileLink(value) {
    const href = String(value || "").trim();
    if (!href) {
      return { href: "", userId: "" };
    }

    try {
      const parsed = new URL(href, location.href);
      const match = parsed.pathname.match(/\/user\/profile\/([A-Za-z0-9]+)/i);
      return {
        href: parsed.toString(),
        userId: match ? match[1] : "",
      };
    } catch {
      const match = href.match(/\/user\/profile\/([A-Za-z0-9]+)/i);
      return {
        href,
        userId: match ? match[1] : "",
      };
    }
  }

  function extractXiaohongshuAuthorFromHtml() {
    const html = document.documentElement?.innerHTML || "";
    const usernamePatterns = [
      /"nickname"\s*:\s*"([^"]{1,120})"/i,
      /"nick_name"\s*:\s*"([^"]{1,120})"/i,
      /"display_name"\s*:\s*"([^"]{1,120})"/i,
      /"author"\s*:\s*\{[^{}]{0,400}?"nickname"\s*:\s*"([^"]{1,120})"/i,
    ];
    const userIdPatterns = [
      /"user_id"\s*:\s*"?(\\d{5,})"?/i,
      /"userid"\s*:\s*"?(\\d{5,})"?/i,
      /"userId"\s*:\s*"?(\\d{5,})"?/i,
      /\/user\/profile\/(\\d{5,})/i,
    ];

    let username = "";
    for (const pattern of usernamePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        username = cleanProjectTitle(match[1]);
        if (username) {
          break;
        }
      }
    }

    let userId = "";
    for (const pattern of userIdPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        userId = match[1];
        break;
      }
    }

    return { username, userId };
  }

  function inferXiaohongshuAuthorContextV2() {
    const profileLink = findXiaohongshuPrimaryProfileLink();
    if (profileLink?.userId && profileLink.text && profileLink.text !== XIAOHONGSHU_SELF_TEXT) {
      return {
        username: profileLink.text || "",
        userId: profileLink.userId,
        source: "profile-link",
        href: profileLink.href,
      };
    }

    const profileCandidates = collectXiaohongshuProfileCandidates();
    const bestCandidate = profileCandidates.find((item) => item.text && item.text !== XIAOHONGSHU_SELF_TEXT) || null;
    if (bestCandidate?.userId) {
      return {
        username: bestCandidate.text || "",
        userId: bestCandidate.userId,
        source: "profile-candidate",
        href: bestCandidate.href,
      };
    }

    const scriptInfo = extractXiaohongshuAuthorFromHtmlV2();
    if (scriptInfo.userId || scriptInfo.username) {
      return {
        username: scriptInfo.username,
        userId: scriptInfo.userId,
        source: "html",
      };
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const titleMatch = metaTitle.match(XIAOHONGSHU_TITLE_PATTERN);
    if (titleMatch?.[1]) {
      return {
        username: cleanProjectTitle(titleMatch[1]),
        userId: "",
        source: "meta-title",
      };
    }

    return null;
  }

  function collectXiaohongshuUsernameProbeV2() {
    if (!isXiaohongshuHost()) {
      return null;
    }

    const noteId = extractXiaohongshuNoteId(location.href);
    const profileLink = findXiaohongshuPrimaryProfileLink();
    const profileCandidates = collectXiaohongshuProfileCandidates();
    const scriptInfo = extractXiaohongshuAuthorFromHtmlV2();
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const pageTitle = document.title || "";
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content || "";

    return {
      locationPath: location.pathname,
      noteId,
      canonical,
      ogUrl,
      metaTitle,
      pageTitle,
      profileLink,
      profileCandidates,
      scriptInfo,
      finalContext: inferXiaohongshuAuthorContextV2(),
    };
  }

  function extractXiaohongshuAuthorFromHtmlV2() {
    const html = document.documentElement?.innerHTML || "";
    const usernamePatterns = [
      /"nickname"\s*:\s*"([^"]{1,120})"/i,
      /"nick_name"\s*:\s*"([^"]{1,120})"/i,
      /"display_name"\s*:\s*"([^"]{1,120})"/i,
      /"author"\s*:\s*\{[^{}]{0,400}?"nickname"\s*:\s*"([^"]{1,120})"/i,
    ];
    const userIdPatterns = [
      /"user_id"\s*:\s*"?(?:\\u003c)?([A-Za-z0-9]{6,})"?/i,
      /"userid"\s*:\s*"?(?:\\u003c)?([A-Za-z0-9]{6,})"?/i,
      /"userId"\s*:\s*"?(?:\\u003c)?([A-Za-z0-9]{6,})"?/i,
      /\/user\/profile\/([A-Za-z0-9]{6,})/i,
    ];

    let username = "";
    for (const pattern of usernamePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        username = cleanProjectTitle(match[1]);
        if (username) {
          break;
        }
      }
    }

    let userId = "";
    for (const pattern of userIdPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        userId = match[1];
        break;
      }
    }

    return { username, userId };
  }

  function collectXiaohongshuDateProbe() {
    if (!isXiaohongshuHost()) {
      return null;
    }

    const html = document.documentElement?.innerHTML || "";
    const root = findXiaohongshuPostContainer();
    const metaCandidates = collectXiaohongshuDateMetaCandidates();
    const htmlCandidates = collectXiaohongshuDateHtmlCandidates(html);
    const visibleCandidates = collectXiaohongshuDateVisibleCandidates(root || document.body);
    const allCandidates = [...metaCandidates, ...htmlCandidates, ...visibleCandidates];
    const parsedCandidates = [];
    const seen = new Set();

    allCandidates.forEach((candidate) => {
      const parsed = parseXiaohongshuDateCandidate(candidate.value);
      const key = `${candidate.source}:${candidate.label}:${candidate.value}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      parsedCandidates.push({
        ...candidate,
        dateCode: parsed.dateCode,
        normalizedDate: parsed.normalizedDate,
      });
    });

    const finalCandidate = parsedCandidates.find((item) => item.dateCode) || null;
    return {
      locationPath: location.pathname,
      noteId: extractXiaohongshuNoteId(location.href),
      finalDateCode: finalCandidate?.dateCode || "",
      finalNormalizedDate: finalCandidate?.normalizedDate || "",
      finalSource: finalCandidate?.source || "",
      finalLabel: finalCandidate?.label || "",
      metaCandidates: metaCandidates.slice(0, 12),
      htmlCandidateCount: htmlCandidates.length,
      visibleCandidateCount: visibleCandidates.length,
      candidatePreview: parsedCandidates.slice(0, 24),
    };
  }

  function inferXiaohongshuPublishedAt() {
    const probe = collectXiaohongshuDateProbe();
    return probe?.finalNormalizedDate || "";
  }

  function collectXiaohongshuDateMetaCandidates() {
    const candidates = [];
    document.querySelectorAll("meta, time[datetime]").forEach((node) => {
      const label = node.getAttribute("property") || node.getAttribute("name") || node.tagName.toLowerCase();
      const value = node.getAttribute("content") || node.getAttribute("datetime") || "";
      if (value && isLikelyDateText(value)) {
        candidates.push({ source: "meta", label, value });
      }
    });
    return candidates;
  }

  function collectXiaohongshuDateHtmlCandidates(html) {
    const candidates = [];
    const patterns = [
      /"(?:createTime|createdTime|create_time|created_time|publishTime|publish_time|lastUpdateTime|last_update_time|time|timestamp)"\s*:\s*(?:"([^"]{4,40})"|(\d{10,13}))/gi,
      /(?:发布于|编辑于|发表于|更新于)\s*[:：]?\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/g,
      /(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)/g,
    ];

    patterns.forEach((pattern, patternIndex) => {
      let match;
      while ((match = pattern.exec(html)) !== null && candidates.length < 80) {
        const value = match[1] || match[2] || "";
        if (value && isLikelyDateText(value)) {
          candidates.push({ source: "html", label: `pattern-${patternIndex + 1}`, value });
        }
      }
    });

    return candidates;
  }

  function collectXiaohongshuDateVisibleCandidates(root) {
    const candidates = [];
    if (!root) {
      return candidates;
    }

    const nodes = Array.from(root.querySelectorAll("span, div, time, p"))
      .slice(0, 500);
    nodes.forEach((node) => {
      const text = cleanVisibleText(node.textContent || "");
      if (!text || text.length > 80 || !isLikelyDateText(text)) {
        return;
      }

      candidates.push({
        source: "visible",
        label: node.tagName.toLowerCase(),
        value: text,
      });
    });

    return candidates.slice(0, 80);
  }

  function parseXiaohongshuDateCandidate(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return { dateCode: "", normalizedDate: "" };
    }

    if (/^\d{10,13}$/.test(raw)) {
      const numeric = Number(raw);
      const date = new Date(raw.length === 10 ? numeric * 1000 : numeric);
      const dateCode = formatDateCodeYymmdd(date.toISOString());
      return { dateCode, normalizedDate: dateCode ? date.toISOString() : "" };
    }

    const fullDateMatch = raw.match(/(20\d{2})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})/);
    if (fullDateMatch) {
      const year = Number(fullDateMatch[1]);
      const month = Number(fullDateMatch[2]);
      const day = Number(fullDateMatch[3]);
      if (isValidDateParts(year, month, day)) {
        const normalizedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return {
          dateCode: `${String(year).slice(-2)}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`,
          normalizedDate,
        };
      }
    }

    return { dateCode: "", normalizedDate: "" };
  }

  function isLikelyDateText(value) {
    const text = String(value || "");
    return /\d{10,13}|20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}|(?:发布于|编辑于|发表于|更新于)/.test(text);
  }

  function inferWeixinAuthorName() {
    const candidates = [
      document.querySelector("#js_name")?.textContent,
      document.querySelector(".rich_media_meta_text")?.textContent,
      document.querySelector('meta[property="og:article:author"]')?.content,
      document.querySelector('meta[name="author"]')?.content,
    ].map((value) => cleanVisibleText(value))
      .filter((value) => value && !/^(微信|Weixin|公众号)$/i.test(value));

    return candidates[0] || "";
  }

  function inferWeixinPublishedAt() {
    const candidates = [
      document.querySelector("#publish_time")?.textContent,
      document.querySelector("#js_publish_time")?.textContent,
      document.querySelector('meta[property="article:published_time"]')?.content,
      document.querySelector('meta[name="publishdate"]')?.content,
      document.documentElement?.innerHTML || "",
    ].filter(Boolean);

    for (const value of candidates) {
      const parsed = parseWeixinDate(value);
      if (parsed) {
        return parsed;
      }
    }

    return "";
  }

  function parseWeixinDate(value) {
    const raw = String(value || "");
    const isoMatch = raw.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (isValidDateParts(year, month, day)) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    const cnMatch = raw.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (cnMatch) {
      const year = Number(cnMatch[1]);
      const month = Number(cnMatch[2]);
      const day = Number(cnMatch[3]);
      if (isValidDateParts(year, month, day)) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    return "";
  }

  function extractWeixinProjectId(value) {
    try {
      const parsed = new URL(value, location.href);
      const shortLinkMatch = parsed.pathname.match(/^\/s\/([^/?#]+)/i);
      if (shortLinkMatch?.[1]) {
        return decodeURIComponent(shortLinkMatch[1]);
      }

      return parsed.searchParams.get("__biz") ||
        parsed.searchParams.get("mid") ||
        parsed.searchParams.get("sn") ||
        "";
    } catch {
      return "";
    }
  }

  function buildWeixinNormalizedUrl() {
    const projectId = extractWeixinProjectId(location.href);
    if (projectId && /^\/s\//i.test(location.pathname)) {
      return `https://mp.weixin.qq.com/s/${encodeURIComponent(projectId)}`;
    }

    try {
      const parsed = new URL(location.href);
      parsed.hash = "";
      ["chksm", "scene", "subscene", "sessionid", "clicktime", "enterid", "ascene", "devicetype", "version", "lang", "nettype", "exportkey", "pass_ticket", "wx_header"].forEach((name) => {
        parsed.searchParams.delete(name);
      });
      return parsed.toString();
    } catch {
      return location.href;
    }
  }

  function isValidDateParts(year, month, day) {
    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
      return false;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function cleanVisibleText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findXiaohongshuPostContainer() {
    const selectors = [
      "main",
      "article",
      '[class*="note"]',
      '[class*="Note"]',
      '[class*="post"]',
      '[class*="Post"]',
      '[class*="content"]',
      '[class*="Content"]',
    ];

    const scored = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node, index, nodes) => node instanceof Element && nodes.indexOf(node) === index)
      .map((node) => ({
        node,
        score: scoreXiaohongshuContainer(node),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.node || document.querySelector("main") || document.body;
  }

  function findXiaohongshuMainMediaContainer(root = findXiaohongshuPostContainer()) {
    if (!(root instanceof Element)) {
      return null;
    }

    const rootBounds = typeof root.getBoundingClientRect === "function" ? root.getBoundingClientRect() : null;
    const candidates = collectVisualCandidates(root, {
      minArea: 50000,
      isAllowed: (img, candidate) =>
        isLikelyXiaohongshuContentImage(img) &&
        !isLikelyXiaohongshuUtilityImage(img) &&
        candidate.linkType !== "profile",
    });

    if (!candidates.length) {
      return null;
    }

    const primaryCandidates = candidates.slice(0, Math.min(candidates.length, 5));
    const scored = new Map();

    primaryCandidates.forEach((candidate, index) => {
      let node = candidate.img;
      let depth = 0;
      while (node instanceof Element && node !== root && depth < 8) {
        if (!scored.has(node)) {
          const score = scoreXiaohongshuMainMediaContainer(node, root, primaryCandidates, index, rootBounds);
          if (score > 0) {
            scored.set(node, score);
          }
        }
        node = node.parentElement;
        depth += 1;
      }
    });

    const ranked = Array.from(scored.entries())
      .map(([node, score]) => ({ node, score }))
      .sort((left, right) => right.score - left.score);

    const best = ranked[0] || null;
    if (!best || best.score < 55) {
      return null;
    }

    return best.node;
  }

  function scoreXiaohongshuMainMediaContainer(node, root, seedCandidates = [], seedIndex = 0, rootBounds = null) {
    if (!(node instanceof Element) || !(root instanceof Element) || !root.contains(node)) {
      return 0;
    }

    const images = Array.from(node.querySelectorAll("img"));
    if (!images.length) {
      return 0;
    }

    const realImages = images.filter((img) => {
      const width = Number(img.naturalWidth || img.width || 0);
      const height = Number(img.naturalHeight || img.height || 0);
      const area = width * height;
      return area >= 50000 && isLikelyXiaohongshuContentImage(img) && !isLikelyXiaohongshuUtilityImage(img);
    });
    if (!realImages.length) {
      return 0;
    }

    let score = 0;
    const text = `${node.getAttribute("class") || ""} ${node.getAttribute("id") || ""} ${node.getAttribute("data-testid") || ""} ${node.getAttribute("role") || ""}`;
    if (/(note|post|content|media|gallery|swiper|carousel|picture|photo|image|feed)/i.test(text)) {
      score += 35;
    }
    if (/(comment|reply|recommend|related|feed-list|comment-list)/i.test(text)) {
      score -= 30;
    }

    const count = realImages.length;
    score += Math.min(30, count * 6);
    if (count <= 8) {
      score += 12;
    }
    if (count > 12) {
      score -= 12;
    }

    const totalArea = realImages.reduce((sum, img) => {
      return sum + Number(img.naturalWidth || img.width || 0) * Number(img.naturalHeight || img.height || 0);
    }, 0);
    score += Math.min(20, Math.floor(totalArea / 200000));

    const bounds = typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null;
    if (bounds) {
      if (bounds.top >= 0 && bounds.top < window.innerHeight * 1.5) {
        score += 14;
      }
      if (rootBounds && bounds.bottom <= rootBounds.bottom + 1200) {
        score += 8;
      }
      if (bounds.height > 0 && rootBounds && bounds.height < rootBounds.height * 0.8) {
        score += 10;
      }
      if (bounds.height > 0 && bounds.height > window.innerHeight * 2.8) {
        score -= 18;
      }
    }

    const candidateTop = seedCandidates[seedIndex]?.top || 0;
    const nodeTop = bounds ? Math.max(0, Math.round(bounds.top + window.scrollY)) : 0;
    if (candidateTop && nodeTop && Math.abs(nodeTop - candidateTop) < 400) {
      score += 8;
    }

    const imageCount = images.length;
    if (imageCount > 20) {
      score -= 18;
    }

    return score;
  }

  function findWeixinArticleContainer() {
    const selectors = [
      "#js_content",
      ".rich_media_content",
      "#img-content",
      "article",
      "main",
    ];

    const scored = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node, index, nodes) => node instanceof Element && nodes.indexOf(node) === index)
      .map((node) => ({
        node,
        score: scoreWeixinContainer(node),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.node || document.querySelector("#js_content") || document.body;
  }

  function scoreWeixinContainer(node) {
    if (!(node instanceof Element)) {
      return 0;
    }

    const images = Array.from(node.querySelectorAll("img"));
    if (!images.length) {
      return 0;
    }

    let score = 0;
    const text = `${node.id || ""} ${node.getAttribute("class") || ""}`;
    if (/(js_content|rich_media_content|img-content|article|content)/i.test(text)) {
      score += 80;
    }

    images.forEach((img) => {
      const src = String(img.currentSrc || img.src || img.getAttribute("data-src") || "");
      const area = Number(img.naturalWidth || img.width || 0) * Number(img.naturalHeight || img.height || 0);
      if (isWeixinQpicImageUrl(src)) score += 12;
      if (area >= 40000) score += 8;
      if (isLikelyWeixinUtilityImage(img)) score -= 20;
    });

    return score;
  }

  function scoreXiaohongshuContainer(node) {
    if (!(node instanceof Element)) {
      return 0;
    }

    const images = Array.from(node.querySelectorAll("img"));
    if (!images.length) {
      return 0;
    }

    let score = 0;
    const text = `${node.getAttribute("class") || ""} ${node.getAttribute("id") || ""} ${node.getAttribute("data-testid") || ""}`;
    if (/(note|post|content|feed|article|explore)/i.test(text)) {
      score += 40;
    }

    images.forEach((img) => {
      const area = Number(img.naturalWidth || img.width || 0) * Number(img.naturalHeight || img.height || 0);
      const src = String(img.currentSrc || img.src || "");
      if (/xhscdn\.com|snsimg\.com|qpic\.cn|imageView2/i.test(src)) score += 10;
      if (area >= 40000) score += 8;
      if (isLikelyXiaohongshuUtilityImage(img)) score -= 12;
    });

    const bounds = node.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.top < window.innerHeight * 2) {
      score += 12;
    }

    return score;
  }

  function findWeiboPostContainer() {
    const selectors = [
      "article",
      '[class*="Detail"]',
      '[class*="detail"]',
      '[class*="Feed_detail"]',
      '[class*="feed-detail"]',
      '[class*="card-wrap"]',
      '[class*="Feed"]',
      "main",
    ];

    const scored = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node, index, nodes) => node instanceof Element && nodes.indexOf(node) === index)
      .map((node) => ({
        node,
        score: scoreWeiboContainer(node),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.node || document.querySelector("main") || document.body;
  }

  function scoreWeiboContainer(node) {
    if (!(node instanceof Element)) {
      return 0;
    }

    const images = Array.from(node.querySelectorAll("img"));
    if (!images.length) {
      return 0;
    }

    let score = 0;
    const text = `${node.getAttribute("class") || ""} ${node.getAttribute("data-testid") || ""} ${node.getAttribute("role") || ""}`;
    if (/(detail|feed|card|微博|weibo|article|status)/i.test(text)) {
      score += 45;
    }

    images.forEach((img) => {
      const url = normalizeWeiboImageUrl(img.currentSrc || img.src || "");
      const area = Number(img.naturalWidth || img.width || 0) * Number(img.naturalHeight || img.height || 0);
      if (url) score += 10;
      if (area >= 30000) score += 8;
      if (isLikelyWeiboUtilityImage(img)) score -= 12;
    });

    const bounds = node.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.top < window.innerHeight * 1.8) {
      score += 15;
    }

    return score;
  }

  function selectXiaohongshuPostMediaCandidates(candidates) {
    const realMedia = candidates.filter((candidate) => {
      const url = normalizeUrl(candidate.img.currentSrc || candidate.img.src || "");
      return url &&
        candidate.width >= 220 &&
        candidate.height >= 220 &&
        candidate.area >= 50000;
    });

    if (!realMedia.length) {
      return [];
    }

    const firstCluster = takeLeadingCluster(realMedia, 800);
    return firstCluster.filter((candidate) => candidate.linkType !== "profile").slice(0, 20);
  }

  function normalizeXiaohongshuImageUrl(rawUrl) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      return "";
    }

    try {
      const parsed = new URL(normalized);
      if (!/(^|\.)xhscdn\.com$/i.test(parsed.hostname) && !/(^|\.)snsimg\.cn$/i.test(parsed.hostname)) {
        return normalized;
      }

      parsed.hash = "";
      parsed.search = "";
      return parsed.toString();
    } catch {
      return normalized.replace(/([?#].*)$/, "");
    }
  }

  function normalizeWeixinImageUrl(rawUrl) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      return "";
    }

    try {
      const parsed = new URL(normalized);
      if (!isWeixinQpicImageUrl(parsed.toString())) {
        return normalized;
      }

      parsed.hash = "";
      return parsed.toString();
    } catch {
      return normalized.replace(/#.*$/, "");
    }
  }

  function isWeixinQpicImageUrl(rawUrl) {
    try {
      const parsed = new URL(normalizeUrl(rawUrl));
      return /(^|\.)mmbiz\.qpic\.cn$/i.test(parsed.hostname) && /\/(?:sz_)?mmbiz_(?:jpg|jpeg|png|gif|webp)\//i.test(parsed.pathname);
    } catch {
      return /mmbiz\.qpic\.cn\/(?:sz_)?mmbiz_(?:jpg|jpeg|png|gif|webp)\//i.test(String(rawUrl || ""));
    }
  }

  function isLikelyWeixinContentImage(img) {
    const src = getWeixinCandidateSourceUrl(img);
    if (!isWeixinQpicImageUrl(src)) {
      return false;
    }

    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    return width >= 180 && height >= 120;
  }

  function collectWeixinArticleImageCandidates(root) {
    const byKey = new Map();
    const push = (candidate) => {
      if (!candidate?.sourceUrl) {
        return;
      }

      const key = getWeixinMediaKey(candidate.sourceUrl) || candidate.sourceUrl;
      const existing = byKey.get(key);
      if (!existing || isBetterWeixinCandidate(candidate, existing)) {
        byKey.set(key, candidate);
      }
    };

    Array.from(root.querySelectorAll("img")).forEach((img) => {
      push(buildWeixinArticleImageCandidate(img));
    });

    collectWeixinDomImageUrls(root).forEach((item) => {
      push(buildWeixinUrlCandidate(item.url, item.kind, item.element, "article-root"));
    });

    if (root !== document.body && document.body) {
      Array.from(document.body.querySelectorAll("img")).forEach((img) => {
        push(buildWeixinArticleImageCandidate(img, "body-fallback"));
      });
      collectWeixinDomImageUrls(document.body).forEach((item) => {
        push(buildWeixinUrlCandidate(item.url, item.kind, item.element, "body-fallback"));
      });
    }

    return Array.from(byKey.values())
      .sort((a, b) => a.top - b.top);
  }

  function buildWeixinArticleImageCandidate(img, sourceScope = "article-root") {
    if (isLikelyWeixinUtilityImage(img)) {
      return null;
    }

    const linkType = classifyLinkContext(img);
    if (linkType === "profile") {
      return null;
    }

    const source = getWeixinCandidateSourceInfo(img);
    if (!source.url) {
      return null;
    }

    const width = Number(img.naturalWidth || img.width || img.getAttribute("data-w") || img.getAttribute("width") || 0);
    const ratioHeight = width && img.getAttribute("data-ratio")
      ? Math.round(width * Number(img.getAttribute("data-ratio") || 0))
      : 0;
    const height = Number(img.naturalHeight || img.height || ratioHeight || img.getAttribute("height") || 0);

    return {
      img,
      sourceUrl: source.url,
      sourceKind: source.kind,
      sourceScope,
      width,
      height,
      area: width * height,
      top: Math.max(0, Math.round(img.getBoundingClientRect().top + window.scrollY)),
      linkType,
    };
  }

  function buildWeixinUrlCandidate(rawUrl, sourceKind, element = null, sourceScope = "article-root") {
    const sourceUrl = normalizeWeixinImageUrl(rawUrl);
    if (!isWeixinQpicImageUrl(sourceUrl)) {
      return null;
    }

    if (element instanceof Element) {
      const linkType = classifyElementLinkContext(element);
      if (linkType === "profile") {
        return null;
      }
      const text = `${element.getAttribute("alt") || ""} ${element.getAttribute("class") || ""} ${element.id || ""}`.toLowerCase();
      if (/(avatar|headimg|profile|icon|logo|qr|qrcode|emoji|reward|comment|like|share|loading|placeholder)/i.test(`${sourceUrl} ${text}`)) {
        return null;
      }
    }

    const width = Number(element?.getAttribute?.("data-w") || element?.getAttribute?.("width") || 0);
    const ratioHeight = width && element?.getAttribute?.("data-ratio")
      ? Math.round(width * Number(element.getAttribute("data-ratio") || 0))
      : 0;
    const height = Number(ratioHeight || element?.getAttribute?.("height") || 0);

    return {
      img: element?.tagName === "IMG" ? element : null,
      sourceUrl,
      sourceKind,
      sourceScope,
      width,
      height,
      area: width * height,
      top: element instanceof Element ? Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY)) : 0,
      linkType: element instanceof Element ? classifyElementLinkContext(element) : "none",
    };
  }

  function collectWeixinDomImageUrls(root) {
    const items = [];
    const push = (url, kind, element = null) => {
      const normalized = normalizeWeixinImageUrl(url);
      if (isWeixinQpicImageUrl(normalized)) {
        items.push({ url: normalized, kind, element });
      }
    };

    Array.from(root.querySelectorAll("*")).forEach((element) => {
      Array.from(element.attributes || []).forEach((attr) => {
        collectWeixinUrlsFromText(attr.value).forEach((url) => push(url, `attr:${attr.name}`, element));
      });
    });

    collectWeixinUrlsFromText(root.innerHTML || "").forEach((url) => push(url, "html-scan", root));
    return items;
  }

  function collectWeixinUrlsFromText(value) {
    const text = String(value || "");
    if (!text || !/mmbiz\.qpic\.cn/i.test(text)) {
      return [];
    }

    const urls = [];
    const patterns = [
      /https?:\\?\/\\?\/[^"'\\\s<>]+mmbiz\.qpic\.cn\\?\/[^"'\s<>)]+/gi,
      /https?:\/\/[^"'\s<>]+mmbiz\.qpic\.cn\/[^"'\s<>)]+/gi,
      /\/\/[^"'\s<>]+mmbiz\.qpic\.cn\/[^"'\s<>)]+/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const decoded = decodeEscapedUrl(match[0]);
        if (decoded) {
          urls.push(decoded);
        }
      }
    });

    return urls;
  }

  function isBetterWeixinCandidate(candidate, existing) {
    const sourceRank = {
      "data-src": 6,
      "data-original": 5,
      currentSrc: 4,
      src: 3,
      "html-scan": 1,
    };
    const leftRank = sourceRank[candidate.sourceKind] || (String(candidate.sourceKind || "").startsWith("attr:") ? 2 : 0);
    const rightRank = sourceRank[existing.sourceKind] || (String(existing.sourceKind || "").startsWith("attr:") ? 2 : 0);
    if (leftRank !== rightRank) {
      return leftRank > rightRank;
    }
    if (candidate.sourceScope !== existing.sourceScope) {
      return candidate.sourceScope === "article-root";
    }
    return (candidate.area || 0) > (existing.area || 0);
  }

  function getWeixinMediaKey(rawUrl) {
    const url = normalizeWeixinImageUrl(rawUrl);
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return `${parsed.hostname}/${parts.slice(0, -1).join("/")}`;
      }
      return `${parsed.hostname}${parsed.pathname}`;
    } catch {
      return url.replace(/[?#].*$/, "");
    }
  }

  function countWeixinCandidateSourceKinds(candidates) {
    return candidates.reduce((counts, item) => {
      const key = item.sourceKind || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function isLikelyWeixinUtilityImage(img) {
    const src = String(img.currentSrc || img.src || img.getAttribute("data-src") || "").toLowerCase();
    const text = `${img.alt || ""} ${img.className || ""} ${img.id || ""}`.toLowerCase();
    if (/(avatar|headimg|profile|icon|logo|qr|qrcode|emoji|reward|comment|like|share|loading|placeholder)/i.test(src + " " + text)) {
      return true;
    }

    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    return !!(width && height && (width < 120 || height < 80));
  }

  function collectXiaohongshuHighResUrlsFromHtml() {
    const urls = new Set();
    const rawPreview = [];
    const rejectedPreview = [];
    let rawCount = 0;
    let imageCount = 0;
    const html = document.documentElement?.innerHTML || "";
    if (!html) {
      return { urls, rawCount, imageCount, rawPreview, rejectedPreview };
    }

    const patterns = [
      /https?:\\?\/\\?\/[^"'\\\s<>]+(?:xhscdn\.com|snsimg\.cn)\\?\/[^"'\s<>)]+/gi,
      /https?:\/\/[^"'\s<>]+(?:xhscdn\.com|snsimg\.cn)\/[^"'\s<>)]+/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const normalized = normalizeXiaohongshuImageUrl(decodeEscapedUrl(match[0]));
        if (!normalized) {
          continue;
        }

        rawCount += 1;
        if (rawPreview.length < 8) {
          rawPreview.push(normalized);
        }

        if (!isXiaohongshuImageCdnUrl(normalized) || isLikelyXiaohongshuNonContentUrl(normalized)) {
          if (rejectedPreview.length < 8) {
            rejectedPreview.push(normalized);
          }
          continue;
        }

        imageCount += 1;
        if (isLikelyXiaohongshuHighResUrl(normalized)) {
          urls.add(normalized);
        } else if (rejectedPreview.length < 8) {
          rejectedPreview.push(normalized);
        }
      }
    });

    return { urls, rawCount, imageCount, rawPreview, rejectedPreview };
  }

  function collectXiaohongshuVideoMedia() {
    const html = document.documentElement?.innerHTML || "";
    const noteId = extractXiaohongshuNoteId(location.href);
    const noteDetailMapFound = /"noteDetailMap"\s*:\s*\{/.test(html);
    const note = extractXiaohongshuNotePayloadFromHtml(html, noteId);
    const structuredVideo = extractXiaohongshuStructuredVideoPayload(note);
    const streamRoot = structuredVideo?.streamRoot || null;
    const candidates = streamRoot ? collectXiaohongshuVideoStreamCandidates(streamRoot) : [];
    const rankedCandidates = rankXiaohongshuVideoCandidates(candidates);
    const selectedCandidate = rankedCandidates[0] || null;
    const media = selectedCandidate ? [buildXiaohongshuVideoMediaItem(selectedCandidate, structuredVideo)] : [];

    return {
      media,
      debug: {
        xiaohongshu: {
          noteId,
          currentNoteId: extractXiaohongshuCurrentNoteIdFromHtml(html),
          noteDetailMapFound,
          mediaV2Found: !!structuredVideo?.mediaV2,
          structuredSource: structuredVideo?.source || "none",
          thumbnailFileid: structuredVideo?.thumbnailFileid || "",
          structuredCoverUrl: structuredVideo?.coverUrl || "",
          streamRootFound: !!streamRoot,
          streamFamilyCounts: structuredVideo?.streamFamilyCounts || {},
          candidateCount: candidates.length,
          acceptedCount: media.length,
          fallbackToGeneric: !selectedCandidate,
          candidatePreview: rankedCandidates.slice(0, 8).map((candidate) => ({
            url: candidate.url,
            streamFamily: candidate.streamFamily,
            streamType: candidate.streamType,
            width: candidate.width,
            height: candidate.height,
            bitrate: candidate.bitrate,
            codec: candidate.codec,
            duration: candidate.duration,
            score: candidate.score,
          })),
          selectedCandidate: selectedCandidate ? {
            url: selectedCandidate.url,
            streamFamily: selectedCandidate.streamFamily,
            streamType: selectedCandidate.streamType,
            width: selectedCandidate.width,
            height: selectedCandidate.height,
            bitrate: selectedCandidate.bitrate,
            codec: selectedCandidate.codec,
            duration: selectedCandidate.duration,
            score: selectedCandidate.score,
            backupUrlCount: selectedCandidate.backupUrls.length,
          } : null,
        },
      },
    };
  }

  function collectXiaohongshuVideoDebug() {
    return collectXiaohongshuVideoMedia().debug?.xiaohongshu || null;
  }

  function extractXiaohongshuNotePayloadFromHtml(html, noteId) {
    const raw = String(html || "");
    if (!raw) {
      return null;
    }

    const noteChunk = extractXiaohongshuNoteDetailChunkFromHtml(raw, noteId);
    const noteObjectText = extractXiaohongshuJsonObjectText(noteChunk, '"note":');
    if (!noteObjectText) {
      return null;
    }

    return tryParseJsonLike(noteObjectText);
  }

  function extractXiaohongshuStructuredVideoPayload(note) {
    if (!note || typeof note !== "object") {
      return null;
    }

    const mediaV2Text = typeof note.mediaV2 === "string"
      ? note.mediaV2
      : typeof note.video?.mediaV2 === "string"
        ? note.video.mediaV2
        : "";

    const mediaV2 = mediaV2Text ? tryParseJsonLike(mediaV2Text) : null;
    const streamRoot = mediaV2?.stream || mediaV2?.video?.stream || note.video?.stream || null;
    const thumbnailFileid = extractXiaohongshuVideoThumbnailFileId(note);
    const coverUrl = buildXiaohongshuVideoCoverUrl(thumbnailFileid);
    if (!streamRoot) {
      return {
        mediaV2: mediaV2Text ? mediaV2 : null,
        streamRoot: null,
        source: mediaV2Text ? "mediaV2" : (note.video?.stream ? "video.stream" : "none"),
        streamFamilyCounts: {},
        thumbnailFileid,
        coverUrl,
      };
    }

    return {
      mediaV2: mediaV2 || null,
      streamRoot,
      source: mediaV2?.stream ? "mediaV2.stream" : (mediaV2 ? "mediaV2.video.stream" : "video.stream"),
      streamFamilyCounts: countXiaohongshuStreamFamilies(streamRoot),
      thumbnailFileid,
      coverUrl,
    };
  }

  function extractXiaohongshuVideoThumbnailFileId(note) {
    if (!note || typeof note !== "object") {
      return "";
    }

    const raw = note.video?.image?.thumbnailFileid
      || note.video?.image?.thumbnail_fileid
      || note.video?.thumbnailFileid
      || note.video?.thumbnail_fileid
      || "";
    const value = String(raw || "").trim();
    return /^[a-z0-9_-]+$/i.test(value) ? value : "";
  }

  function buildXiaohongshuVideoCoverUrl(fileId) {
    const normalizedFileId = String(fileId || "").trim();
    if (!/^[a-z0-9_-]+$/i.test(normalizedFileId)) {
      return "";
    }

    return `https://ci.xiaohongshu.com/${normalizedFileId}`;
  }

  function countXiaohongshuStreamFamilies(streamRoot) {
    const counts = {};
    ["h264", "h265", "av1", "h266"].forEach((family) => {
      counts[family] = Array.isArray(streamRoot?.[family]) ? streamRoot[family].length : 0;
    });
    return counts;
  }

  function collectXiaohongshuVideoStreamCandidates(streamRoot) {
    const candidates = [];
    const seen = new Set();
    const families = ["h264", "h265", "av1", "h266"];

    families.forEach((family) => {
      const entries = Array.isArray(streamRoot?.[family]) ? streamRoot[family] : [];
      entries.forEach((stream, index) => {
        const candidate = buildXiaohongshuVideoStreamCandidate(stream, family, index);
        if (!candidate || seen.has(candidate.url)) {
          return;
        }
        seen.add(candidate.url);
        candidates.push(candidate);
      });
    });

    return candidates;
  }

  function buildXiaohongshuVideoStreamCandidate(stream, family, index = 0) {
    if (!stream || typeof stream !== "object") {
      return null;
    }

    const backupUrls = [];
    const primaryUrl = normalizeVideoUrl(stream.masterUrl || stream.master_url || stream.url || "");
    if (primaryUrl) {
      backupUrls.push(primaryUrl);
    }

    [
      ...(Array.isArray(stream.backupUrls) ? stream.backupUrls : []),
      ...(Array.isArray(stream.backup_urls) ? stream.backup_urls : []),
    ].forEach((rawUrl) => {
      const normalized = normalizeVideoUrl(rawUrl || "");
      if (normalized && !backupUrls.includes(normalized)) {
        backupUrls.push(normalized);
      }
    });

    const url = backupUrls[0] || "";
    if (!url) {
      return null;
    }

    const width = Number(stream.width || 0);
    const height = Number(stream.height || 0);
    const bitrate = Number(stream.avgBitrate || stream.avg_bitrate || stream.videoBitrate || stream.video_bitrate || 0);
    const audioBitrate = Number(stream.audioBitrate || stream.audio_bitrate || 0);
    const streamType = Number(stream.streamType || stream.stream_type || 0);
    const duration = normalizeXiaohongshuVideoDuration(stream.duration || stream.videoDuration || 0);
    const codec = String(stream.videoCodec || stream.video_codec || family || "").toLowerCase();
    const qualityLabel = String(stream.qualityType || stream.quality_type || stream.streamDesc || stream.stream_desc || "").trim();
    const score = scoreXiaohongshuVideoStreamCandidate({
      width,
      height,
      bitrate,
      streamType,
      codec,
      family,
      index,
    });

    return {
      url,
      backupUrls,
      streamFamily: family,
      streamType,
      width,
      height,
      bitrate,
      audioBitrate,
      codec,
      qualityLabel,
      duration,
      score,
      format: inferVideoFormat(url, stream.contentType || stream.content_type || "video/mp4"),
    };
  }

  function scoreXiaohongshuVideoStreamCandidate(candidate) {
    let score = 0;
    const width = Number(candidate?.width || 0);
    const height = Number(candidate?.height || 0);
    const bitrate = Number(candidate?.bitrate || 0);
    const streamType = Number(candidate?.streamType || 0);
    const codecRank = getXiaohongshuVideoCodecRank(candidate?.codec || candidate?.family || "");
    const area = width * height;

    if (area > 0) {
      score += Math.min(1000000, area);
    }
    if (width > 0) {
      score += Math.floor(width / 4);
    }
    if (height > 0) {
      score += Math.floor(height / 4);
    }
    if (bitrate > 0) {
      score += Math.min(200000, Math.floor(bitrate / 4));
    }
    if (streamType > 0) {
      score += Math.min(1000, streamType);
    }
    score += codecRank * 10;
    score += Number(candidate?.index || 0) * -1;
    return score;
  }

  function getXiaohongshuVideoCodecRank(codec) {
    const lowered = String(codec || "").toLowerCase();
    if (lowered.includes("h264")) return 3;
    if (lowered.includes("h265") || lowered.includes("hevc")) return 2;
    if (lowered.includes("av1")) return 1;
    return 0;
  }

  function rankXiaohongshuVideoCandidates(candidates) {
    return Array.from(candidates || []).sort((left, right) => {
      if ((right.width * right.height) !== (left.width * left.height)) {
        return (right.width * right.height) - (left.width * left.height);
      }
      if ((right.bitrate || 0) !== (left.bitrate || 0)) {
        return (right.bitrate || 0) - (left.bitrate || 0);
      }
      if ((right.streamType || 0) !== (left.streamType || 0)) {
        return (right.streamType || 0) - (left.streamType || 0);
      }
      if (getXiaohongshuVideoCodecRank(right.codec || right.streamFamily) !== getXiaohongshuVideoCodecRank(left.codec || left.streamFamily)) {
        return getXiaohongshuVideoCodecRank(right.codec || right.streamFamily) - getXiaohongshuVideoCodecRank(left.codec || left.streamFamily);
      }
      return String(left.url || "").localeCompare(String(right.url || ""));
    });
  }

  function buildXiaohongshuVideoMediaItem(candidate, structuredVideo = null) {
    const structuredCoverUrl = normalizeUrl(structuredVideo?.coverUrl || "");
    const fallbackUrl = candidate.previewUrl || candidate.posterUrl || candidate.url;
    const thumbnailUrl = structuredCoverUrl || fallbackUrl;
    return {
      id: "video:1",
      mediaType: "video",
      url: candidate.url,
      sourceUrl: candidate.url,
      thumbnail: thumbnailUrl,
      previewUrl: thumbnailUrl,
      posterUrl: structuredCoverUrl || "",
      format: candidate.format || "MP4",
      resolution: candidate.width && candidate.height ? `${candidate.width} x ${candidate.height}` : "Unknown",
      size: "Unknown",
      width: candidate.width,
      height: candidate.height,
      duration: candidate.duration,
      isOriginal: false,
      selected: false,
      score: candidate.score,
      area: candidate.width * candidate.height,
      download: {
        strategy: "xiaohongshuVideoFetchBlob",
      },
    };
  }

  function normalizeXiaohongshuVideoDuration(value) {
    const duration = Number(value || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      return 0;
    }
    if (duration > 1000) {
      return Number((duration / 1000).toFixed(3));
    }
    return duration;
  }

  function extractXiaohongshuCurrentNoteIdFromHtml(html) {
    const raw = String(html || "");
    if (!raw) {
      return "";
    }

    const currentMatch = raw.match(/"currentNoteId"\s*:\s*"([^"]+)"/i);
    if (currentMatch?.[1]) {
      return currentMatch[1];
    }

    const firstMatch = raw.match(/"firstNoteId"\s*:\s*"([^"]+)"/i);
    return firstMatch?.[1] || "";
  }

  function extractXiaohongshuJsonObjectText(text, marker) {
    const raw = String(text || "");
    if (!raw || !marker) {
      return "";
    }

    const markerIndex = raw.indexOf(marker);
    if (markerIndex < 0) {
      return "";
    }

    const braceIndex = raw.indexOf("{", markerIndex);
    if (braceIndex < 0) {
      return "";
    }

    return extractBalancedJson(raw, braceIndex);
  }

  async function collectWeixinOriginalProbe(mediaCandidates) {
    const urls = new Set();
    const meta = new Map();
    const candidates = mediaCandidates.slice(0, 40);
    const probes = await mapWithConcurrency(candidates, 4, async (candidate) => {
      const sourceUrl = candidate.sourceUrl || (candidate.img ? getWeixinCandidateSourceUrl(candidate.img) : "");
      if (!sourceUrl) {
        return null;
      }

      const originalUrl = buildWeixinOriginalImageUrl(sourceUrl);
      const probe = originalUrl && originalUrl !== sourceUrl ? await probeImageResource(originalUrl, 8000) : null;
      const loadedWidth = Number(probe?.width || 0);
      const loadedHeight = Number(probe?.height || 0);
      const responseWidth = Number(probe?.responseWidth || 0);
      const responseHeight = Number(probe?.responseHeight || 0);
      const verifiedWidth = loadedWidth || responseWidth || 0;
      const verifiedHeight = loadedHeight || responseHeight || 0;
      const accepted = isAcceptableWeixinOriginalProbe(probe, candidate) || isWeixinOriginalImageResponse(probe, originalUrl);
      const finalUrl = accepted ? originalUrl : sourceUrl;
      const width = accepted ? verifiedWidth : candidate.width;
      const height = accepted ? verifiedHeight : candidate.height;
      const format = accepted ? inferFormatFromUrlOrProbe(originalUrl, probe) : inferFormat(sourceUrl);
      const dimensionSource = accepted
        ? (loadedWidth && loadedHeight ? "image-load" : (responseWidth && responseHeight ? "headers" : "unknown"))
        : "rendered-fallback";

      return {
        finalUrl,
        sourceUrl,
        originalUrl,
        accepted,
        width,
        height,
        format,
        contentType: probe?.contentType || "",
        dimensionSource,
        renderedWidth: candidate.width,
        renderedHeight: candidate.height,
        sourceKind: candidate.sourceKind || "",
        sourceScope: candidate.sourceScope || "",
      };
    });

    probes.filter(Boolean).forEach((item) => {
      urls.add(item.finalUrl);
      meta.set(item.finalUrl, {
        thumbnail: item.sourceUrl,
        width: item.dimensionSource === "unknown" ? 0 : item.width,
        height: item.dimensionSource === "unknown" ? 0 : item.height,
        format: item.format,
      });
    });

    return { urls, meta, probes: probes.filter(Boolean) };
  }

  async function augmentWeixinOriginalsFromExtractedItems(platformMedia, items) {
    if (!isWeixinHost() || !platformMedia || !Array.isArray(items) || !items.length) {
      return;
    }

    const originalUrls = platformMedia.originalUrls || new Set();
    const originalMeta = platformMedia.originalUrlMeta || new Map();
    const knownKeys = new Set(Array.from(originalUrls).map((url) => getWeixinMediaKey(url)).filter(Boolean));
    const candidates = [];

    items.forEach((item) => {
      const sourceUrl = normalizeWeixinImageUrl(item?.url || "");
      if (!isWeixinQpicImageUrl(sourceUrl)) {
        return;
      }

      const key = getWeixinMediaKey(sourceUrl);
      if (key && knownKeys.has(key)) {
        return;
      }

      if (key) {
        knownKeys.add(key);
      }
      candidates.push({
        img: null,
        sourceUrl,
        sourceKind: item?.sourceHint || "generic-items",
        sourceScope: "generic-items",
        width: Number(item?.width || 0),
        height: Number(item?.height || 0),
        area: Number(item?.area || 0),
        top: 0,
        linkType: "none",
      });
    });

    const probe = await collectWeixinOriginalProbe(candidates);
    probe.urls.forEach((url) => originalUrls.add(url));
    probe.meta.forEach((value, url) => originalMeta.set(url, value));

    platformMedia.originalUrls = originalUrls.size ? originalUrls : null;
    platformMedia.originalUrlMeta = originalMeta.size ? originalMeta : null;
    platformMedia.debug.original = {
      ...(platformMedia.debug.original || {}),
      genericBridgeCandidateCount: candidates.length,
      genericBridgeAcceptedCount: probe.probes.filter((item) => item.accepted).length,
      genericBridgePreview: probe.probes.slice(0, 8),
    };
  }

  function getWeixinCandidateSourceUrl(img) {
    return getWeixinCandidateSourceInfo(img).url;
  }

  function getWeixinCandidateSourceInfo(img) {
    const sources = [
      { kind: "data-src", url: img.getAttribute("data-src") || "" },
      { kind: "data-original", url: img.getAttribute("data-original") || "" },
      { kind: "currentSrc", url: img.currentSrc || "" },
      { kind: "src", url: img.src || "" },
    ];

    for (const source of sources) {
      const normalized = normalizeWeixinImageUrl(source.url);
      if (isWeixinQpicImageUrl(normalized)) {
        return {
          kind: source.kind,
          url: normalized,
        };
      }
    }

    return { kind: "", url: "" };
  }

  function buildWeixinOriginalImageUrl(rawUrl) {
    const sourceUrl = normalizeWeixinImageUrl(rawUrl);
    if (!sourceUrl) {
      return "";
    }

    try {
      const parsed = new URL(sourceUrl);
      if (!isWeixinQpicImageUrl(parsed.toString())) {
        return "";
      }

      const parts = parsed.pathname.split("/");
      const sizeIndex = parts.length - 1;
      if (sizeIndex < 1) {
        return "";
      }

      if (/^(?:0|[1-9]\d*|s\d+)$/i.test(parts[sizeIndex] || "")) {
        parts[sizeIndex] = "0";
      }

      parsed.pathname = parts.join("/");
      const format = inferWeixinQpicFormat(sourceUrl);
      parsed.search = "";
      if (format) {
        parsed.searchParams.set("wx_fmt", format);
      }
      parsed.searchParams.set("from", "appmsg");
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function inferWeixinQpicFormat(rawUrl) {
    try {
      const parsed = new URL(normalizeWeixinImageUrl(rawUrl));
      const wxFmt = parsed.searchParams.get("wx_fmt") || "";
      if (/^(?:jpeg|jpg|png|gif|webp)$/i.test(wxFmt)) {
        return wxFmt.toLowerCase() === "jpg" ? "jpeg" : wxFmt.toLowerCase();
      }

      const hostPath = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
      if (/mmbiz_png/.test(hostPath)) return "png";
      if (/mmbiz_gif/.test(hostPath)) return "gif";
      if (/mmbiz_jpg|mmbiz_jpeg/.test(hostPath)) return "jpeg";
    } catch {
      return "";
    }

    return "";
  }

  function isAcceptableWeixinOriginalProbe(probe, candidate) {
    if (!probe?.loaded) {
      return false;
    }

    const width = Number(probe.width || probe.responseWidth || 0);
    const height = Number(probe.height || probe.responseHeight || 0);
    const renderedWidth = Number(candidate?.width || 0);
    const renderedHeight = Number(candidate?.height || 0);
    if (!width || !height) {
      return false;
    }

    if (renderedWidth && width > renderedWidth + 8) {
      return true;
    }

    if (renderedHeight && height > renderedHeight + 8) {
      return true;
    }

    return width >= 1600 || height >= 1600;
  }

  function isWeixinOriginalImageResponse(probe, originalUrl) {
    if (!probe || !/\/0(?:[?#]|$)/i.test(String(originalUrl || ""))) {
      return false;
    }

    return /^image\/(?:png|jpe?g|webp|gif)/i.test(String(probe.contentType || ""));
  }

  async function collectXiaohongshuEnlargedMedia(mediaCandidates) {
    const urls = new Set();
    const meta = new Map();
    const candidates = mediaCandidates.slice(0, 30);
    const probes = await mapWithConcurrency(candidates, 4, async (candidate) => {
      const sourceUrl = normalizeXiaohongshuImageUrl(candidate.sourceUrl || candidate.img?.currentSrc || candidate.img?.src || "");
      if (!sourceUrl) {
        return null;
      }

      const enlargedUrl = buildXiaohongshuEnlargedImageUrl(sourceUrl);
      const probe = enlargedUrl ? await probeImageResource(enlargedUrl, 2500) : null;
      const accepted = isAcceptableXiaohongshuEnlargedProbe(probe);
      const finalUrl = accepted ? enlargedUrl : sourceUrl;
      const loadedWidth = Number(probe?.width || 0);
      const loadedHeight = Number(probe?.height || 0);
      const responseWidth = Number(probe?.responseWidth || 0);
      const responseHeight = Number(probe?.responseHeight || 0);
      const verifiedWidth = loadedWidth || responseWidth || 0;
      const verifiedHeight = loadedHeight || responseHeight || 0;
      const width = accepted ? verifiedWidth : candidate.width;
      const height = accepted ? verifiedHeight : candidate.height;
      const format = accepted ? inferFormatFromUrlOrProbe(enlargedUrl, probe) : inferFormat(sourceUrl);
      const dimensionSource = accepted
        ? (loadedWidth && loadedHeight ? "image-load" : (responseWidth && responseHeight ? "headers" : "unknown"))
        : "rendered-fallback";

      return {
        finalUrl,
        sourceUrl,
        enlargedUrl,
        accepted,
        width,
        height,
        format,
        contentType: probe?.contentType || "",
        dimensionSource,
        renderedWidth: candidate.width,
        renderedHeight: candidate.height,
        sourceKind: candidate.sourceKind || "",
        sourceScope: candidate.sourceScope || "",
      };
    });

    probes.filter(Boolean).forEach((item) => {
      urls.add(item.finalUrl);
      meta.set(item.finalUrl, {
        thumbnail: item.sourceUrl,
        width: item.dimensionSource === "unknown" ? 0 : item.width,
        height: item.dimensionSource === "unknown" ? 0 : item.height,
        format: item.format,
      });
    });

    return { urls, meta, probes: probes.filter(Boolean) };
  }

  function collectXiaohongshuStructuredNoteImageCandidatesFromHtml(html) {
    const noteId = extractXiaohongshuNoteId(location.href);
    const noteChunk = extractXiaohongshuNoteDetailChunkFromHtml(html, noteId);
    const imageListText = extractXiaohongshuImageListTextFromHtml(noteChunk || html);
    const candidatesByUrl = new Map();
    const preview = [];
    const rejectedPreview = [];

    if (!imageListText) {
      return {
        candidates: [],
        preview,
        rejectedPreview,
      };
    }

    const patterns = [
      { sourceKind: "imageList:urlDefault", scoreBoost: 130, pattern: /"urlDefault"\s*:\s*"((?:https?:\\\/\\\/|https?:\/\/)[^"]+)"/gi },
      { sourceKind: "imageList:urlPre", scoreBoost: 110, pattern: /"urlPre"\s*:\s*"((?:https?:\\\/\\\/|https?:\/\/)[^"]+)"/gi },
      { sourceKind: "imageList:infoList", scoreBoost: 90, pattern: /"url"\s*:\s*"((?:https?:\\\/\\\/|https?:\/\/)[^"]+)"/gi },
    ];

    patterns.forEach(({ sourceKind, scoreBoost, pattern }) => {
      let match;
      while ((match = pattern.exec(imageListText)) !== null) {
        const rawUrl = decodeEscapedUrl(match[1]);
        const normalizedUrl = normalizeXiaohongshuImageUrl(rawUrl);
        if (!normalizedUrl || !isXiaohongshuImageCdnUrl(normalizedUrl) || isLikelyXiaohongshuNonContentUrl(normalizedUrl)) {
          if (rejectedPreview.length < 8) {
            rejectedPreview.push(rawUrl || match[1] || "");
          }
          continue;
        }

        const context = imageListText.slice(
          Math.max(0, match.index - 320),
          Math.min(imageListText.length, match.index + match[0].length + 640)
        );
        const width = extractXiaohongshuImageDimension(context, "width");
        const height = extractXiaohongshuImageDimension(context, "height");
        const candidate = {
          sourceUrl: normalizedUrl,
          width,
          height,
          area: width * height,
          top: 0,
          sourceKind,
          sourceScope: "structured-imageList",
          score: scoreBoost + Math.min(20, Math.floor((width * height) / 200000)),
          previewUrl: normalizedUrl,
          posterUrl: "",
        };

        const existing = candidatesByUrl.get(candidate.sourceUrl);
        if (!existing || candidate.score > existing.score) {
          candidatesByUrl.set(candidate.sourceUrl, candidate);
        }
      }
    });

    const candidates = Array.from(candidatesByUrl.values())
      .sort((left, right) => right.score - left.score || left.sourceUrl.localeCompare(right.sourceUrl));

    candidates.slice(0, 8).forEach((candidate) => {
      preview.push({
        url: candidate.sourceUrl,
        width: candidate.width,
        height: candidate.height,
        sourceKind: candidate.sourceKind,
        sourceScope: candidate.sourceScope,
      });
    });

    return {
      candidates,
      preview,
      rejectedPreview,
    };
  }

  function extractXiaohongshuNoteDetailChunkFromHtml(html, noteId) {
    const raw = String(html || "");
    if (!raw) {
      return "";
    }

    if (noteId) {
      const noteMarker = `\"${noteId}\":{`;
      const noteIndex = raw.indexOf(noteMarker);
      if (noteIndex >= 0) {
        return raw.slice(noteIndex, Math.min(raw.length, noteIndex + 260000));
      }
    }

    const mapIndex = raw.indexOf('"noteDetailMap":{');
    if (mapIndex >= 0) {
      return raw.slice(mapIndex, Math.min(raw.length, mapIndex + 260000));
    }

    return raw;
  }

  function extractXiaohongshuImageListTextFromHtml(text) {
    const raw = String(text || "");
    if (!raw) {
      return "";
    }

    const marker = '"imageList":[';
    const start = raw.indexOf(marker);
    if (start < 0) {
      return "";
    }

    return extractBalancedJson(raw, start + marker.length - 1);
  }

  function extractXiaohongshuImageDimension(text, key) {
    const raw = String(text || "");
    if (!raw) {
      return 0;
    }

    const pattern = key === "height"
      ? /"height"\s*:\s*(\d{2,5})/i
      : /"width"\s*:\s*(\d{2,5})/i;
    const match = raw.match(pattern);
    return Number(match?.[1] || 0) || 0;
  }

  function isAcceptableXiaohongshuEnlargedProbe(probe) {
    if (probe?.loaded) {
      return true;
    }

    const contentType = String(probe?.contentType || "").toLowerCase();
    return contentType.includes("image/heic") || contentType.includes("image/heif");
  }

  async function mapWithConcurrency(items, limit, worker) {
    const source = Array.isArray(items) ? items : [];
    const results = new Array(source.length);
    const workerCount = Math.max(1, Math.min(Number(limit || 1), source.length || 1));
    let nextIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < source.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(source[index], index);
      }
    }));

    return results;
  }

  function buildXiaohongshuEnlargedImageUrl(rawUrl) {
    const sourceUrl = normalizeXiaohongshuImageUrl(rawUrl);
    if (!sourceUrl) {
      return "";
    }

    try {
      const parsed = new URL(sourceUrl);
      if (!/^sns-webpic(?:-[a-z0-9-]+)?\.xhscdn\.com$/i.test(parsed.hostname)) {
        return "";
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 3 || !/^\d{8,14}$/.test(parts[0]) || !/^[0-9a-f]{10,}$/i.test(parts[1])) {
        return "";
      }

      const imagePath = parts.slice(2).join("/").replace(/!.+$/i, "");
      if (!imagePath || /\.(?:js|css|mjs|map|woff2?|ttf|otf)$/i.test(imagePath)) {
        return "";
      }

      return `https://sns-img-al.xhscdn.com/${imagePath}`;
    } catch {
      return "";
    }
  }

  async function probeImageResource(url, timeoutMs = 2500) {
    const [dimensions, responseInfo] = await Promise.all([
      probeImageDimensions(url, timeoutMs),
      probeImageResponseInfo(url, timeoutMs),
    ]);

    return {
      ...dimensions,
      contentType: responseInfo.contentType,
      responseWidth: responseInfo.width,
      responseHeight: responseInfo.height,
    };
  }

  function probeImageDimensions(url, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const img = new Image();
      const done = (result) => {
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(result);
      };
      const timer = setTimeout(() => done({ loaded: false, error: "timeout" }), timeoutMs);
      img.onload = () => done({
        loaded: true,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      });
      img.onerror = () => done({ loaded: false, error: "load-error" });
      img.decoding = "async";
      img.src = url;
    });
  }

  async function probeImageResponseInfo(url, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "HEAD",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });

      return {
        contentType: String(response.headers.get("content-type") || "").toLowerCase(),
        width: Number(response.headers.get("x-width") || 0),
        height: Number(response.headers.get("x-height") || 0),
      };
    } catch {
      return { contentType: "", width: 0, height: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  function inferFormatFromUrlOrProbe(url, probe) {
    const contentType = String(probe?.contentType || "").toLowerCase();
    if (contentType.includes("png")) return "PNG";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return "JPEG";
    if (contentType.includes("webp")) return "WEBP";
    if (contentType.includes("avif")) return "AVIF";
    if (contentType.includes("heic") || contentType.includes("heif")) return "HEIC";
    const format = inferFormat(url);
    return format === "Unknown" ? "JPEG" : format;
  }

  function isLikelyXiaohongshuHighResUrl(rawUrl) {
    const value = String(rawUrl || "").toLowerCase();
    return (
      /\.(?:png|jpe?g|webp|avif)(?:$|[?#!])/i.test(value) ||
      /!(?:[^/?#]*_)?(?:png|jpe?g|webp|avif)(?:_|$)/i.test(value) ||
      /(?:origin|original|raw|source|large|w[hl]teh|wgth|spectrum)/i.test(value)
    );
  }

  function isXiaohongshuImageCdnUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      if (/\.(?:js|css|mjs|map|woff2?|ttf|otf)(?:$|[?#])/i.test(path)) {
        return false;
      }

      return (
        /^sns-webpic(?:-[a-z0-9-]+)?\.xhscdn\.com$/i.test(host) ||
        /^sns-img(?:-[a-z0-9-]+)?\.xhscdn\.com$/i.test(host) ||
        /(^|\.)snsimg\.cn$/i.test(host)
      );
    } catch {
      return false;
    }
  }

  function isLikelyXiaohongshuNonContentUrl(rawUrl) {
    return /avatar|icon|emoji|emoticon|badge|sprite|logo|qrcode|qr-code|\/resource\/(?:js|css|font)\//i.test(String(rawUrl || ""));
  }

  function selectWeiboPostMediaCandidates(candidates) {
    const realMedia = candidates.filter((candidate) => {
      const url = normalizeWeiboImageUrl(candidate.img.currentSrc || candidate.img.src || "");
      return url &&
        candidate.width >= 240 &&
        candidate.height >= 160 &&
        candidate.area >= 60000 &&
        !/tvax\d*\.sinaimg\.cn|h5\.sinaimg\.cn/i.test(url);
    });

    if (!realMedia.length) {
      return [];
    }

    const firstCluster = takeLeadingCluster(realMedia, 700);
    return firstCluster.slice(0, 18);
  }

  function isLikelyXiaohongshuContentImage(img) {
    const urls = [
      normalizeUrl(img.currentSrc || img.src || ""),
      ...getImageAttributeUrls(img),
    ].filter(Boolean);

    return urls.some((url) => !/avatar|emoji|icon|badge|sprite|logo/i.test(url));
  }

  function isLikelyXiaohongshuUtilityImage(img) {
    const text = `${img.getAttribute("alt") || ""} ${img.getAttribute("class") || ""} ${img.currentSrc || img.src || ""}`.toLowerCase();
    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    const area = width * height;

    if (/(avatar|profile|icon|logo|badge|emoji|emoticon|sprite|qr|qrcode)/i.test(text)) {
      return true;
    }

    return area > 0 && area < 12000;
  }

  function scoreInstagramContainer(node) {
    if (!(node instanceof Element)) {
      return 0;
    }

    const images = Array.from(node.querySelectorAll("img"));
    if (!images.length) {
      return 0;
    }

    let score = 0;
    const text = `${node.getAttribute("role") || ""} ${node.getAttribute("aria-label") || ""} ${node.className || ""}`;
    if (/carousel|post|media|presentation|dialog/i.test(text)) {
      score += 50;
    }

    const currentPostCode = extractInstagramPostCode(location.pathname);
    images.forEach((img) => {
      const area = Number(img.naturalWidth || img.width || 0) * Number(img.naturalHeight || img.height || 0);
      if (area >= 50000) {
        score += 5;
      }

      const anchor = img.closest("a[href]");
      if (anchor) {
        const href = anchor.getAttribute("href") || "";
        if (href && currentPostCode && extractInstagramPostCode(href) === currentPostCode) {
          score += 12;
        }
        if (/img_index=/i.test(href)) {
          score += 20;
        }
      } else {
        score += 3;
      }
    });

    const bounds = node.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.top < window.innerHeight * 1.5) {
      score += 20;
    }

    return score;
  }

  function normalizePathname(value) {
    try {
      const url = new URL(value, location.href);
      return String(url.pathname || "").replace(/\/+$/, "");
    } catch {
      return String(value || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    }
  }

  function extractInstagramPostCode(value) {
    const pathname = normalizePathname(value);
    const match = pathname.match(/\/(?:[A-Za-z0-9._-]+\/)?(?:p|reel)\/([^/]+)/i);
    return match ? match[1] : "";
  }

  function extractInstagramPostKind(value) {
    const pathname = normalizePathname(value);
    const match = pathname.match(/\/(?:[A-Za-z0-9._-]+\/)?(p|reel)\/[^/]+/i);
    return match ? match[1].toLowerCase() : "";
  }

  function normalizeInstagramPostPath(value) {
    const pathname = normalizePathname(value);
    const match = pathname.match(/\/(?:[A-Za-z0-9._-]+\/)?(p|reel)\/([^/]+)/i);
    if (!match) {
      return pathname;
    }

    return `/${match[1].toLowerCase()}/${match[2]}`;
  }

  function extractInstagramCarouselCountFromHtml(postCode) {
    const html = document.documentElement?.innerHTML || "";
    if (!html) {
      return 0;
    }

    const escapedPostCode = escapeRegex(postCode);
    const patterns = [
      new RegExp(`/(?:[A-Za-z0-9._-]+/)?(?:p|reel)/${escapedPostCode}/[^"'\\s>]*?img_index=(\\d+)`, "gi"),
      new RegExp(`${escapedPostCode}[^"'\\s>]{0,200}?img_index(?:=|%3[Dd]|\\\\u003[dD])(\\d+)`, "gi"),
    ];

    let maxIndex = 0;
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const value = Number.parseInt(match[1] || "", 10);
        if (Number.isFinite(value) && value > 0) {
          maxIndex = Math.max(maxIndex, value);
        }
      }
    }

    return maxIndex;
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function fetchInstagramSampledUrls(maxIndex) {
    const samplePath = getInstagramCurrentPostPath(location.pathname);
    if (!samplePath || !maxIndex) {
      return null;
    }

    const probeIndexes = buildInstagramProbeIndexes(maxIndex);
    const urls = new Set();

    for (const index of probeIndexes) {
      try {
        const probeUrl = new URL(location.href);
        probeUrl.pathname = samplePath;
        probeUrl.search = "";
        probeUrl.searchParams.set("img_index", String(index));

        const response = await fetch(probeUrl.toString(), {
          method: "GET",
          credentials: "include",
          redirect: "follow",
        });

        const html = await response.text();
        collectInstagramUrlsFromHtml(html, urls, extractInstagramPostCode(samplePath));
      } catch {
        // Ignore per-probe failures and keep best-effort behavior.
      }
    }

    return urls.size ? urls : null;
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

  function getInstagramCurrentPostPath(value) {
    const pathname = normalizePathname(value);
    const directMatch = pathname.match(/^\/([A-Za-z0-9._-]+)\/(p|reel)\/([^/]+)$/i);
    if (directMatch) {
      return `/${directMatch[1]}/${directMatch[2].toLowerCase()}/${directMatch[3]}`;
    }

    const shortMatch = pathname.match(/^\/(p|reel)\/([^/]+)$/i);
    if (!shortMatch) {
      return "";
    }

    const context = collectInstagramPostContext();
    return isTrustedInstagramPostContext(context) ? context.postPath : "";
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

  function collectInstagramUrlsFromHtml(html, urls, postCode = "") {
    const safeHtml = String(html || "");
    if (!safeHtml) {
      return;
    }

    const foundScopedUrls = collectInstagramScopedUrlsFromHtml(safeHtml, urls, postCode);
    if (foundScopedUrls) {
      return;
    }

    const patterns = [
      /"display_url"\s*:\s*"([^"]+)"/g,
      /"image_url"\s*:\s*"([^"]+)"/g,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
      /"url"\s*:\s*"(https?:\\\/\\\/[^"]+scontent[^"]+)"/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(safeHtml)) !== null) {
        const decoded = decodeEscapedUrl(match[1]);
        if (decoded) {
          urls.add(decoded);
        }
      }
    }
  }

  function collectInstagramScopedUrlsFromHtml(html, urls, postCode) {
    if (!postCode) {
      return false;
    }

    const beforeSize = urls.size;
    const documentForScripts = new DOMParser().parseFromString(html, "text/html");
    const scriptTexts = Array.from(documentForScripts.querySelectorAll("script"))
      .map((node) => node.textContent || "")
      .filter((text) => text.includes(postCode));

    for (const text of scriptTexts) {
      parseInstagramJsonFragments(text).forEach((value) => {
        collectInstagramUrlsFromJson(value, urls, postCode);
      });
      collectInstagramUrlsNearPostCode(text, urls, postCode);
    }

    return urls.size > beforeSize;
  }

  function parseInstagramJsonFragments(text) {
    const fragments = [];
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return fragments;
    }

    const whole = tryParseJsonLike(trimmed);
    if (whole) {
      fragments.push(whole);
    }

    const assignmentPatterns = [
      /window\.__additionalDataLoaded\s*\(\s*["'][^"']+["']\s*,\s*/g,
      /window\.__sharedData\s*=\s*/g,
    ];

    for (const pattern of assignmentPatterns) {
      let match;
      while ((match = pattern.exec(trimmed)) !== null) {
        const fragment = extractBalancedJson(trimmed, pattern.lastIndex);
        const parsed = tryParseJsonLike(fragment);
        if (parsed) {
          fragments.push(parsed);
        }
      }
    }

    return fragments;
  }

  function tryParseJsonLike(value) {
    const raw = String(value || "").trim().replace(/;$/, "");
    if (!raw || !/^[{\[]/.test(raw)) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function extractBalancedJson(text, startIndex) {
    const start = text.slice(startIndex).search(/[{\[]/);
    if (start < 0) {
      return "";
    }

    const absoluteStart = startIndex + start;
    const opener = text[absoluteStart];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = absoluteStart; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === opener) {
        depth += 1;
      } else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(absoluteStart, i + 1);
        }
      }
    }

    return "";
  }

  function collectInstagramUrlsFromJson(value, urls, postCode) {
    walkInstagramJson(value, (node) => {
      if (isInstagramCurrentPostNode(node, postCode)) {
        appendInstagramMediaNodeUrls(node, urls);
      }
    });
  }

  function walkInstagramJson(value, visit) {
    if (!value || typeof value !== "object") {
      return;
    }

    visit(value);
    if (Array.isArray(value)) {
      value.forEach((item) => walkInstagramJson(item, visit));
      return;
    }

    Object.values(value).forEach((item) => walkInstagramJson(item, visit));
  }

  function isInstagramCurrentPostNode(node, postCode) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }

    const shortcode = String(node.shortcode || node.code || node.shortcode_media?.shortcode || "");
    if (shortcode === postCode) {
      return true;
    }

    const permalink = String(node.permalink || node.url || node.share_url || "");
    return permalink ? extractInstagramPostCode(permalink) === postCode : false;
  }

  function appendInstagramMediaNodeUrls(node, urls) {
    if (!node || typeof node !== "object") {
      return;
    }

    appendInstagramUrlFields(node, urls);

    const mediaLists = [
      node.carousel_media,
      node.edge_sidecar_to_children?.edges?.map((edge) => edge?.node),
      node.items,
      node.clips_metadata?.achievements_info?.media,
    ].filter(Boolean);

    mediaLists.flat().forEach((item) => {
      appendInstagramUrlFields(item?.node || item, urls);
    });
  }

  function appendInstagramUrlFields(node, urls) {
    if (!node || typeof node !== "object") {
      return;
    }

    [
      node.display_url,
      node.image_url,
      node.thumbnail_url,
      node.url,
    ].forEach((url) => addInstagramMediaUrl(urls, url));

    [
      node.image_versions2?.candidates,
      node.image_versions?.candidates,
      node.display_resources,
      node.thumbnail_resources,
    ].filter(Boolean).flat().forEach((candidate) => {
      addInstagramMediaUrl(urls, candidate?.url || candidate?.src);
    });
  }

  function collectInstagramUrlsNearPostCode(text, urls, postCode) {
    const escapedPostCode = escapeRegex(postCode);
    const scopedPattern = new RegExp(`${escapedPostCode}[\\s\\S]{0,20000}`, "g");
    let match;
    while ((match = scopedPattern.exec(text)) !== null) {
      const chunk = match[0];
      [
        /"display_url"\s*:\s*"([^"]+)"/g,
        /"image_url"\s*:\s*"([^"]+)"/g,
        /"url"\s*:\s*"(https?:\\\/\\\/[^"]+scontent[^"]+)"/g,
      ].forEach((pattern) => {
        let urlMatch;
        while ((urlMatch = pattern.exec(chunk)) !== null) {
          addInstagramMediaUrl(urls, urlMatch[1]);
        }
      });
    }
  }

  function addInstagramMediaUrl(urls, value) {
    const decoded = decodeEscapedUrl(value);
    if (decoded && /\/(?:scontent|instagram)\b|fbcdn\.net|cdninstagram\.com/i.test(decoded)) {
      urls.add(decoded);
    }
  }

  function buildInstagramOriginalMediaKeys(urls) {
    const keys = new Set();
    if (urls) {
      urls.forEach((url) => {
        const key = getInstagramMediaKey(url);
        if (key) {
          keys.add(key);
        }
      });
    }
    return keys;
  }

  function isInstagramOriginalMediaKey(url, mediaKeys) {
    if (!mediaKeys?.size) {
      return false;
    }

    const key = getInstagramMediaKey(url);
    return !!key && mediaKeys.has(key);
  }

  function countInstagramMediaKeys(urls) {
    const keys = new Set();
    Array.from(urls || []).forEach((url) => {
      const key = getInstagramMediaKey(url);
      if (key) {
        keys.add(key);
      }
    });
    return keys.size;
  }

  function getInstagramMediaKey(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url);
      const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      if (filename && /\.(?:jpe?g|webp|png)$/i.test(filename)) {
        return `file:${filename}`;
      }

      const cacheKey = parsed.searchParams.get("ig_cache_key");
      if (cacheKey) {
        return `ig:${cacheKey}`;
      }

      return parsed.pathname ? `path:${parsed.hostname}${parsed.pathname}` : "";
    } catch {
      return "";
    }
  }

  function getWeiboMediaKey(rawUrl) {
    const url = normalizeWeiboImageUrl(rawUrl);
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url);
      const fileName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      return fileName ? `file:${fileName.toLowerCase()}` : `path:${parsed.hostname}${parsed.pathname}`;
    } catch {
      return "";
    }
  }

  function countWeiboMediaKeys(urls) {
    const keys = new Set();
    Array.from(urls || []).forEach((url) => {
      const key = getWeiboMediaKey(url);
      if (key) {
        keys.add(key);
      }
    });
    return keys.size;
  }

  function getWeiboSizeRank(rawUrl) {
    try {
      const parsed = new URL(normalizeUrl(rawUrl));
      const parts = parsed.pathname.split("/").filter(Boolean);
      const size = String(parts[parts.length - 2] || "").toLowerCase();
      if (size === "large" || size === "oslarge") return 100;
      if (size === "mw2000") return 90;
      if (size === "mw1024") return 80;
      if (size === "mw690" || size === "bmiddle") return 60;
      if (/^orj\d+$/i.test(size)) return 40;
      if (/^(?:thumb|wap|mw)\d+$/i.test(size)) return 20;
      if (/^(?:thumbnail|square|small)$/i.test(size)) return 10;
      return 50;
    } catch {
      return 0;
    }
  }

  function collectWeiboUrlsFromHtml(root = document.documentElement) {
    const urls = new Set();
    const html = root?.innerHTML || document.documentElement?.innerHTML || "";
    if (!html) {
      return urls;
    }

    const patterns = [
      /https?:\\?\/\\?\/[^"'\\\s<>]+\.sinaimg\.cn\\?\/[^"'\s<>]+\.(?:jpe?g|png|gif|webp)/gi,
      /\/\/[^"'\\\s<>]+\.sinaimg\.cn\/[^"'\s<>]+\.(?:jpe?g|png|gif|webp)/gi,
      /(?:pic_src|picUrl|original_pic|thumbnail_pic|bmiddle_pic)["'=:%\\\s]+(https?:\\?\/\\?\/[^"'\\\s<>]+\.sinaimg\.cn\\?\/[^"'\s<>]+)/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const raw = match[1] || match[0];
        const normalized = normalizeWeiboImageUrl(raw);
        if (normalized) {
          urls.add(normalized);
        }
      }
    });

    return urls;
  }

  function collectWeiboLayerHints(root = findWeiboPostContainer()) {
    const layerIds = new Set();
    const fallbackLayerIds = new Set();
    const urls = new Set();
    const scope = root || document;
    const statusId = extractWeiboStatusId(location.href);

    Array.from(scope.querySelectorAll?.("a[href], [action-data], [data-url], [data-href]") || []).forEach((node) => {
      [
        node.getAttribute("href") || "",
        node.getAttribute("action-data") || "",
        node.getAttribute("data-url") || "",
        node.getAttribute("data-href") || "",
      ].forEach((value) => {
        collectWeiboLayerIdsFromText(value, layerIds, fallbackLayerIds);
        collectWeiboImageUrlsFromText(value, urls);
      });
    });

    collectWeiboLayerIdsFromText(scope.innerHTML || "", layerIds, fallbackLayerIds);

    if (!layerIds.size) {
      collectWeiboLayerIdsFromText(document.documentElement?.innerHTML || "", layerIds, fallbackLayerIds);
    }

    if (!layerIds.size) {
      fallbackLayerIds.forEach((id) => layerIds.add(id));
    }

    return {
      statusId,
      layerIds: Array.from(layerIds).slice(0, 18),
      urls: Array.from(urls).map((url) => normalizeWeiboImageUrl(url)).filter(Boolean),
    };
  }

  function collectWeiboLayerIdsFromText(value, layerIds, fallbackLayerIds) {
    const text = String(value || "").replace(/&amp;/g, "&");
    if (!text) {
      return;
    }

    [
      /[?&]layerid=(\d{8,})/gi,
      /(?:layerid|layer_id)["'=:%\s]+(\d{8,})/gi,
    ].forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          layerIds.add(match[1]);
        }
      }
    });

    [
      /(?:mid|mblogid)["'=:%\s]+(\d{12,})/gi,
    ].forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          fallbackLayerIds.add(match[1]);
        }
      }
    });
  }

  function collectWeiboImageUrlsFromText(value, urls) {
    const text = String(value || "");
    if (!text || !/sinaimg\.cn/i.test(text)) {
      return;
    }

    const matches = text.match(/https?:\\?\/\\?\/[^"'\\\s&<>]+\.sinaimg\.cn\\?\/[^"'\s&<>]+|\/\/[^"'\\\s&<>]+\.sinaimg\.cn\/[^"'\s&<>]+/gi) || [];
    matches.forEach((match) => {
      const normalized = normalizeWeiboImageUrl(match);
      if (normalized) {
        urls.add(normalized);
      }
    });
  }

  function isLikelyWeiboContentImage(img) {
    const url = normalizeWeiboImageUrl(img.currentSrc || img.src || "");
    if (url) {
      return true;
    }

    return getImageAttributeUrls(img).some((candidate) => !!normalizeWeiboImageUrl(candidate));
  }

  function isLikelyWeiboUtilityImage(img) {
    const text = `${img.getAttribute("alt") || ""} ${img.getAttribute("class") || ""} ${img.currentSrc || img.src || ""}`.toLowerCase();
    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    const area = width * height;
    if (/(avatar|face|profile|icon|logo|badge|emoji|emoticon|verified|vip|sprite)/i.test(text)) {
      return true;
    }
    if (/tvax\d*\.sinaimg\.cn|h5\.sinaimg\.cn/i.test(text)) {
      return true;
    }
    return area > 0 && area < 12000;
  }

  function extractWeiboStatusId(value) {
    try {
      const parsed = new URL(value, location.href);
      const detailMatch = parsed.pathname.match(/\/detail\/([A-Za-z0-9]+)/i);
      if (detailMatch) return detailMatch[1];
      const statusMatch = parsed.pathname.match(/\/(?:u\/)?\d+\/([A-Za-z0-9]+)/i);
      return statusMatch ? statusMatch[1] : "";
    } catch {
      return "";
    }
  }

  function extractXiaohongshuNoteId(value) {
    try {
      const parsed = new URL(value, location.href);
      const match = parsed.pathname.match(/\/explore\/([A-Za-z0-9]+)/i);
      return match ? match[1] : "";
    } catch {
      return "";
    }
  }

  function collectInstagramRenderedSnapshot() {
    const container = findInstagramPostContainer();
    const urls = new Set();
    if (container) {
      const candidateImages = collectVisualCandidates(container, {
        minArea: 50000,
        isAllowed: (img, candidate) =>
          !isInsideForeignPostLink(img) &&
          !isInsideProfileLink(img) &&
          candidate.top <= getContainerTop(container) + 1800,
      });

      const firstCluster = takeLeadingCluster(candidateImages, 900);
      const allowedLinkTypes = new Set(["none", "self-post", "other-link"]);
      const narrowed = firstCluster.filter((candidate) => allowedLinkTypes.has(candidate.linkType));
      createUrlSetFromCandidates(narrowed.length ? narrowed : firstCluster.slice(0, 10)).forEach((url) => urls.add(url));
    }

    return {
      postCode: extractInstagramPostCode(location.pathname),
      normalizedPath: normalizeInstagramPostPath(location.pathname),
      currentImgIndex: extractCurrentImgIndex(),
      containerFound: !!container,
      urls: Array.from(urls),
    };
  }

  function collectWeiboRenderedSnapshot() {
    const root = document.body || findWeiboPostContainer();
    const urls = new Set();
    const items = [];
    const candidates = root ? collectVisualCandidates(root, {
      minArea: 60000,
      isAllowed: (img, candidate) =>
        isLikelyWeiboContentImage(img) &&
        !isLikelyWeiboUtilityImage(img) &&
        candidate.linkType !== "profile",
    }) : [];

    selectWeiboPostMediaCandidates(candidates).forEach((candidate) => {
      appendCandidateUrls(urls, candidate.img);
    });

    Array.from(urls).forEach((url) => {
      const normalized = normalizeWeiboImageUrl(url);
      if (normalized) {
        items.push(normalized);
      }
    });

    return {
      statusId: extractWeiboStatusId(location.href),
      layerId: extractCurrentWeiboLayerId(),
      containerFound: !!root,
      urls: items,
    };
  }

  function extractCurrentWeiboLayerId() {
    try {
      const parsed = new URL(location.href);
      return parsed.searchParams.get("layerid") || "";
    } catch {
      return "";
    }
  }

  function decodeEscapedUrl(value) {
    const raw = String(value || "");
    if (!raw) {
      return "";
    }

    const normalized = raw
      .replace(/\\u0026/g, "&")
      .replace(/\\u003D/gi, "=")
      .replace(/\\\//g, "/");

    return normalizeUrl(normalized);
  }

  function classifyLinkContext(img) {
    return classifyElementLinkContext(img);
  }

  function classifyElementLinkContext(element) {
    const anchor = element?.closest?.("a[href]");
    if (!anchor) {
      return "none";
    }

    const href = anchor.getAttribute("href") || "";
    if (!href) {
      return "none";
    }

    if (/instagram\.com$/i.test(location.hostname)) {
      if (/^\/(?:p|reel)\//i.test(href)) {
        return href.startsWith(location.pathname) ? "self-post" : "foreign-post";
      }
      if (/^\/[A-Za-z0-9._]+\//.test(href)) {
        return "profile";
      }
    }

    if (/behance\.net$/i.test(location.hostname)) {
      if (/\/gallery\//i.test(href)) {
        return href.includes(location.pathname) ? "self-project" : "foreign-project";
      }
      if (/\/(?!gallery\/)[A-Za-z0-9._-]+\/?$/i.test(href)) {
        return "profile";
      }
    }

    if (/weibo\.com$/i.test(location.hostname)) {
      if (/\/(?:u\/)?\d+\/?$/i.test(href) || /\/profile\//i.test(href)) {
        return "profile";
      }
    }

    if (/weixin\.qq\.com$/i.test(location.hostname)) {
      if (/profile|__biz=|bizprofile/i.test(href)) {
        return "profile";
      }
    }

    if (isXiaohongshuHost()) {
      if (/\/user\/profile\//i.test(href) || /^\/user\/profile\//i.test(href)) {
        return "profile";
      }
      if (/\/explore\//i.test(href)) {
        return href.includes(location.pathname) ? "self-post" : "foreign-post";
      }
    }

    return "other-link";
  }

  function takeLeadingCluster(candidates, maxGap) {
    if (!candidates.length) {
      return [];
    }

    const cluster = [candidates[0]];
    for (let i = 1; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (candidate.topGap > maxGap) {
        break;
      }
      cluster.push(candidate);
    }
    return cluster;
  }

  function createUrlSetFromCandidates(candidates) {
    const urls = new Set();
    candidates.forEach((candidate) => appendCandidateUrls(urls, candidate.img));
    return urls;
  }

  function createBehanceUrlSetFromCandidates(candidates) {
    const urls = new Set();
    candidates.forEach((candidate) => appendBehanceCandidateUrls(urls, candidate.img));
    return urls;
  }

  function appendBehanceCandidateUrls(urls, img) {
    const candidateUrls = new Set();
    const current = normalizeUrl(img.currentSrc || img.src);
    if (current) {
      candidateUrls.add(current);
    }

    const bestSrcset = pickBestSrcsetCandidate(img.getAttribute("srcset") || img.getAttribute("data-srcset") || "");
    const srcsetUrl = normalizeUrl(bestSrcset);
    if (srcsetUrl) {
      candidateUrls.add(srcsetUrl);
    }

    getImageAttributeUrls(img).forEach((url) => candidateUrls.add(url));
    candidateUrls.forEach((url) => mergeBehancePreferredUrl(urls, url));
  }

  function mergeBehancePreferredUrl(urls, rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return;
    }

    const key = getBehanceMediaKey(url);
    if (!key) {
      urls.add(url);
      return;
    }

    const existing = Array.from(urls).find((item) => getBehanceMediaKey(item) === key);
    if (!existing) {
      urls.add(url);
      return;
    }

    if (isBetterBehanceMediaVariant({ url, score: 0, area: 0 }, { url: existing, score: 0, area: 0 })) {
      urls.delete(existing);
      urls.add(url);
    }
  }

  function appendCandidateUrls(urls, img) {
    const current = normalizeUrl(img.currentSrc || img.src);
    if (current) {
      urls.add(current);
    }

    const bestSrcset = pickBestSrcsetCandidate(img.getAttribute("srcset") || img.getAttribute("data-srcset") || "");
    const srcsetUrl = normalizeUrl(bestSrcset);
    if (srcsetUrl) {
      urls.add(srcsetUrl);
    }

    getImageAttributeUrls(img).forEach((url) => urls.add(url));
  }

  function getImageAttributeUrls(img) {
    const urls = [
      "data-src",
      "data-original",
      "data-full",
      "data-fullsrc",
      "data-hires",
      "data-high-res-src",
      "data-large-src",
      "data-image",
      "data-url",
    ].map((name) => normalizeUrl(img.getAttribute(name) || ""))
      .filter(Boolean);

    if (/weibo\.com$/i.test(location.hostname)) {
      ["data-pic", "data-pic-src", "action-data"].forEach((name) => {
        const normalized = normalizeWeiboImageUrl(img.getAttribute(name) || "");
        if (normalized) urls.push(normalized);
      });

      Array.from(img.attributes || []).forEach((attr) => {
        const value = String(attr.value || "");
        if (!/sinaimg\.cn/i.test(value)) {
          return;
        }
        const matches = value.match(/https?:\\?\/\\?\/[^"'\\\s&<>]+\.sinaimg\.cn\\?\/[^"'\s&<>]+|\/\/[^"'\\\s&<>]+\.sinaimg\.cn\/[^"'\s&<>]+/gi) || [];
        matches.forEach((match) => {
          const normalized = normalizeWeiboImageUrl(match);
          if (normalized) urls.push(normalized);
        });
      });
    }

    return urls;
  }

  function collectBehanceHighResUrlsFromHtml() {
    const urls = new Set();
    const html = document.documentElement?.innerHTML || "";
    if (!html) {
      return urls;
    }

    const behanceHighResBucketPattern = "(?:source|[^/]*max_3840[^/]*|max_2560|max_1920|3840|2560|1920)";

    const patterns = [
      new RegExp(
        `https?:\\\\?\\/\\\\?\\/[^"'\\\\\\s]+behance\\.net\\\\?\\/(?:[^"'\\s]*?\\\\?\\/)?project_modules\\\\?\\/${behanceHighResBucketPattern}\\\\?\\/[^"'\\s<>)]+`,
        "gi"
      ),
      new RegExp(
        `https?:\\/\\/[^"'\\s]+behance\\.net\\/(?:[^"'\\s]*?\\/)?project_modules\\/${behanceHighResBucketPattern}\\/[^"'\\s<>)]+`,
        "gi"
      ),
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const decoded = decodeEscapedUrl(match[0]);
        if (decoded && new RegExp(`/project_modules/${behanceHighResBucketPattern}/`, "i").test(decoded)) {
          urls.add(decoded);
        }
      }
    });

    return urls;
  }

  function isInsideForeignPostLink(img) {
    return classifyLinkContext(img) === "foreign-post";
  }

  function isInsideProfileLink(img) {
    return classifyLinkContext(img) === "profile";
  }

  function isInsideBehanceRelatedLink(img) {
    return classifyLinkContext(img) === "foreign-project";
  }

  function isLikelyBehanceUtilityImage(img) {
    const alt = String(img.getAttribute("alt") || "").toLowerCase();
    const src = String(img.currentSrc || img.src || "").toLowerCase();
    return /(avatar|profile|icon|logo|badge)/.test(`${alt} ${src}`);
  }

  function getBehanceMediaKey(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url);
      if (!/behance\.net$/i.test(parsed.hostname)) {
        return "";
      }
      const match = parsed.pathname.match(/\/project_modules\/[^/]+\/([^/?#]+)/i);
      return match ? match[1].toLowerCase() : "";
    } catch {
      return "";
    }
  }

  function getBehanceSizeRank(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return 0;
    }

    try {
      const pathname = new URL(url).pathname.toLowerCase();
      const match = pathname.match(/\/project_modules\/([^/]+)\//i);
      const bucket = match ? match[1].toLowerCase() : "";
      if (/^source/.test(bucket)) return 6;
      if (/max_3840/i.test(bucket) || /(?:^|_)3840(?:_|$)/.test(bucket)) return 5;
      if (/max_2560|(?:^|_)2560(?:_|$)/.test(bucket)) return 4;
      if (/max_1920|(?:^|_)1920(?:_|$)/.test(bucket)) return 3;
      if (/^fs(?:_|$)/.test(bucket)) return 2;
      return 1;
    } catch {
      return 0;
    }
  }

  function isBetterBehanceMediaVariant(candidate, existing) {
    const candidateRank = getBehanceSizeRank(candidate.url);
    const existingRank = getBehanceSizeRank(existing.url);
    if (candidateRank !== existingRank) {
      return candidateRank > existingRank;
    }

    if ((candidate.score || 0) !== (existing.score || 0)) {
      return (candidate.score || 0) > (existing.score || 0);
    }

    return (candidate.area || 0) > (existing.area || 0);
  }

  function hydrateKnownMediaMetadata(target, source) {
    if (!target || !source) {
      return;
    }

    const targetWidth = Number(target.width || 0);
    const targetHeight = Number(target.height || 0);
    const sourceWidth = Number(source.width || 0);
    const sourceHeight = Number(source.height || 0);
    if (!sourceWidth || !sourceHeight) {
      return;
    }

    const inferred = inferBehanceVariantDimensions(target.url, {
      width: sourceWidth,
      height: sourceHeight,
    });
    const width = inferred.width || sourceWidth;
    const height = inferred.height || sourceHeight;
    if (!width || !height) {
      return;
    }

    if (width > targetWidth || height > targetHeight || !targetWidth || !targetHeight) {
      target.width = width;
      target.height = height;
      target.area = width * height;
      target.resolution = `${width} x ${height}`;
    }
  }

  function inferBehanceVariantDimensions(rawUrl, fallback) {
    const width = Number(fallback?.width || 0);
    const height = Number(fallback?.height || 0);
    if (!width || !height) {
      return { width: 0, height: 0 };
    }

    const ratio = height / width;
    const rankWidth = getBehanceRankWidth(rawUrl);
    if (!rankWidth) {
      return { width, height };
    }

    return {
      width: rankWidth,
      height: Math.max(1, Math.round(rankWidth * ratio)),
    };
  }

  function getBehanceRankWidth(rawUrl) {
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return 0;
    }

    try {
      const pathname = new URL(url).pathname.toLowerCase();
      const match = pathname.match(/\/project_modules\/([^/]+)\//i);
      const bucket = match ? match[1].toLowerCase() : "";
      if (/max_3840/i.test(bucket) || /(?:^|_)3840(?:_|$)/.test(bucket)) return 3840;
      if (/max_2560|(?:^|_)2560(?:_|$)/.test(bucket)) return 2560;
      if (/max_1920|(?:^|_)1920(?:_|$)/.test(bucket)) return 1920;
      return 0;
    } catch {
      return 0;
    }
  }

  function inferFormat(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    const fullUrl = String(url || "").toLowerCase();
    if (pathname.endsWith(".png")) return "PNG";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "JPEG";
    if (pathname.endsWith(".gif")) return "GIF";
    if (pathname.endsWith(".webp")) return "WEBP";
    if (pathname.endsWith(".svg")) return "SVG";
    if (pathname.endsWith(".avif")) return "AVIF";
    if (pathname.endsWith(".heic") || pathname.endsWith(".heif")) return "HEIC";
    if (/!(?:[^/?#]*_)?webp(?:_|$)/i.test(fullUrl)) return "WEBP";
    if (/!(?:[^/?#]*_)?jpg(?:_|$)|!(?:[^/?#]*_)?jpeg(?:_|$)/i.test(fullUrl)) return "JPEG";
    if (/!(?:[^/?#]*_)?png(?:_|$)/i.test(fullUrl)) return "PNG";
    return "Unknown";
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
})();
