(() => {
  const CONTENT_BUILD_HASH = "1104";
  let lastInstagramSamplingDebug = null;
  let lastInstagramExternalSamplingDebug = null;
  let lastInstagramOriginalMediaKeys = null;
  let lastBehanceOriginalDebug = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!["mediafetch:extract", "mediafetch:instagram-rendered-snapshot"].includes(message?.type)) {
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

        const result = await extractImagesFromPage(message?.maxIndexHint || 0, message?.sampledUrls || [], message?.sampledIndexes || []);
        sendResponse({
          ok: true,
          pageUrl: location.href,
          projectName: inferProjectName(),
          images: result.images,
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

  async function extractImagesFromPage(maxIndexHint = 0, externalSampledUrls = [], externalSampledIndexes = []) {
    const items = [];
    const seen = new Set();
    const seenInstagramMediaItems = new Map();
    const domainOriginalUrls = await getDomainOriginalUrlSet(maxIndexHint);
    const externalUrls = Array.isArray(externalSampledUrls) ? externalSampledUrls : [];
    externalUrls.forEach((url) => {
      const normalized = normalizeUrl(url);
      if (normalized) {
        domainOriginalUrls?.add(normalized);
      }
    });
    rebuildInstagramOriginalMediaKeys(domainOriginalUrls);
    lastInstagramExternalSamplingDebug = /instagram\.com$/i.test(location.hostname) ? {
      sampleIndexes: Array.isArray(externalSampledIndexes) ? externalSampledIndexes : [],
      sampledUrlCount: externalUrls.length,
      sampledMediaKeyCount: countInstagramMediaKeys(externalUrls),
      sampledUrlPreview: externalUrls.slice(0, 6),
    } : null;

    const push = (rawUrl, options = {}) => {
      const url = normalizeUrl(rawUrl);
      if (!url || seen.has(url)) return;
      const instagramMediaKey = /instagram\.com$/i.test(location.hostname) ? getInstagramMediaKey(url) : "";
      const width = Number(options.width || 0);
      const height = Number(options.height || 0);
      const area = width * height;
      const sourceHint = options.sourceHint || "rendered";
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

      const item = {
        url,
        thumbnail: url,
        format: inferFormat(url),
        resolution: width && height ? `${width} x ${height}` : "Unknown",
        size: "Unknown",
        width,
        height,
        area,
        score,
        sourceHint,
      };
      items.push(item);
      seen.add(url);
      if (instagramMediaKey) {
        seenInstagramMediaItems.set(instagramMediaKey, item);
      }
    };

    if (/(instagram\.com|behance\.net)$/i.test(location.hostname) && domainOriginalUrls?.size) {
      domainOriginalUrls.forEach((url) => {
        push(url, {
          sourceHint: /behance\.net$/i.test(location.hostname) ? "behance-original" : "instagram-sampled",
        });
      });
    }

    document.querySelectorAll("img").forEach((img) => {
      push(img.currentSrc || img.src, {
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        sourceHint: img.currentSrc ? "rendered-current" : "rendered-direct",
      });

      const bestSrcset = pickBestSrcsetCandidate(img.getAttribute("srcset") || img.getAttribute("data-srcset") || "");
      if (bestSrcset) {
        const srcsetSize = getSrcsetCandidateSize(bestSrcset, img);
        push(bestSrcset, {
          width: srcsetSize.width || img.naturalWidth || img.width || 0,
          height: srcsetSize.height || img.naturalHeight || img.height || 0,
          sourceHint: "rendered-srcset",
        });
      }

      getImageAttributeUrls(img).forEach((url) => {
        push(url, {
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
      isOriginal: detectOriginal(item, maxArea, domainOriginalUrls),
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
      debug: await buildDebugInfo(images, domainOriginalUrls, maxIndexHint),
    };
  }

  function inferProjectName() {
    const instagramFolder = inferInstagramFolderName();
    if (instagramFolder) {
      return instagramFolder;
    }

    const candidates = [
      document.querySelector('meta[property="og:title"]')?.content,
      document.querySelector('meta[name="twitter:title"]')?.content,
      document.title,
      document.querySelector("h1")?.textContent,
    ].filter(Boolean);

    for (const value of candidates) {
      const cleaned = sanitizeFolderName(cleanProjectTitle(value));
      if (cleaned) return cleaned;
    }

    return "ProjectsA";
  }

  function cleanProjectTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^[^"]+:\s*"([^"]+)".*$/i, "$1")
      .replace(/\s*[|\-]\s*Behance\b.*$/i, "")
      .replace(/\s*[|\-]\s*Adobe\b.*$/i, "")
      .replace(/\s*[|\-]\s*Instagram\b.*$/i, "")
      .replace(/\s*[|\-]\s*Weibo\b.*$/i, "")
      .trim();
  }

  function sanitizeFolderName(value) {
    return String(value || "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/\.+$/g, "")
      .replace(/^_+|_+$/g, "")
      .trim()
      .slice(0, 64);
  }

  function inferInstagramFolderName() {
    if (!/instagram\.com$/i.test(location.hostname)) {
      return "";
    }

    const userName = sanitizeFolderName(inferInstagramUserName());
    const dateCode = inferInstagramPostDateCode();
    if (userName && dateCode) {
      return sanitizeFolderName(`${userName}_${dateCode}`);
    }

    return userName || "Instagram";
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

  function normalizeUrl(rawUrl) {
    const value = String(rawUrl || "").trim().replace(/&amp;/g, "&");
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) return "";
    try {
      return new URL(value, location.href).toString();
    } catch {
      return "";
    }
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
    if (sourceHint === "behance-original") score += 560;
    else if (sourceHint === "rendered-srcset") score += 400;
    else if (sourceHint === "rendered-data") score += 360;
    else if (sourceHint === "rendered-meta") score += 320;
    else if (sourceHint === "rendered-current") score += 300;
    else score += 220;

    const lowered = String(url || "").toLowerCase();
    if (/(original|orig|full|master|raw|source|highres|hires|largest|large|xl|xxl|4096|2048)/.test(lowered)) {
      score += 120;
    }
    if (/\/project_modules\/max_3840\//i.test(lowered)) {
      score += 220;
    }
    if (/(thumb|thumbnail|small|preview|avatar|icon|sprite|crop|tiny|medium)/.test(lowered)) {
      score -= 140;
    }
    if (isInstagramCroppedSquareUrl(url)) {
      score -= 260;
    }

    const area = (width || 0) * (height || 0);
    score += Math.min(500, Math.floor(area / 5000));
    return score;
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

  function detectOriginal(item, maxArea, domainOriginalUrls) {
    if (domainOriginalUrls) {
      return domainOriginalUrls.has(item.url) || isInstagramOriginalMediaKey(item.url);
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

  async function getDomainOriginalUrlSet(maxIndexHint = 0) {
    if (/instagram\.com$/i.test(location.hostname)) {
      return await getInstagramOriginalUrlSet(maxIndexHint) || new Set();
    }

    if (/behance\.net$/i.test(location.hostname)) {
      return getBehanceOriginalUrlSet() || new Set();
    }

    return null;
  }

  async function getInstagramOriginalUrlSet(maxIndexHint = 0) {
    if (!/instagram\.com$/i.test(location.hostname)) {
      return null;
    }

    if (!extractInstagramPostCode(location.pathname)) {
      return null;
    }

    const article = findInstagramPostContainer();
    if (!article) {
      return null;
    }

    const candidateImages = collectVisualCandidates(article, {
      minArea: 50000,
      isAllowed: (img, candidate) =>
        !isInsideForeignPostLink(img) &&
        !isInsideProfileLink(img) &&
        candidate.top <= getContainerTop(article) + 1800,
    });

    if (!candidateImages.length) {
      return null;
    }

    const firstCluster = takeLeadingCluster(candidateImages, 900);
    const allowedLinkTypes = new Set(["none", "self-post", "other-link"]);
    const narrowed = firstCluster.filter((candidate) => allowedLinkTypes.has(candidate.linkType));
    const clusterCandidates = narrowed.length ? narrowed : firstCluster.slice(0, 10);
    const clusterUrls = createUrlSetFromCandidates(clusterCandidates);
    const carouselCount = await extractInstagramCarouselCount(article, maxIndexHint);
    lastInstagramSamplingDebug = {
      sampleIndexes: [],
      sampledUrlCount: 0,
      sampledUrlPreview: [],
      usedSampledUrls: false,
      carouselCount,
      sampledMediaKeyCount: 0,
    };

    const sampledUrls = carouselCount > 1 ? await fetchInstagramSampledUrls(carouselCount) : null;
    if (sampledUrls?.size) {
      sampledUrls.forEach((url) => clusterUrls.add(url));
    }

    lastInstagramSamplingDebug = {
      sampleIndexes: carouselCount > 0 ? buildInstagramProbeIndexes(carouselCount) : [],
      sampledUrlCount: sampledUrls ? sampledUrls.size : 0,
      sampledMediaKeyCount: sampledUrls ? countInstagramMediaKeys(sampledUrls) : 0,
      sampledUrlPreview: sampledUrls ? Array.from(sampledUrls).slice(0, 6) : [],
      usedSampledUrls: !!sampledUrls?.size,
      carouselCount,
    };

    return clusterUrls.size ? clusterUrls : null;
  }

  function getBehanceOriginalUrlSet() {
    lastBehanceOriginalDebug = null;
    const main = document.querySelector("main");
    if (!main) {
      return null;
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
      return null;
    }

    const firstCluster = takeLeadingCluster(candidateImages, 1100);
    const urls = createUrlSetFromCandidates(firstCluster);
    const htmlHighResUrls = collectBehanceHighResUrlsFromHtml();
    htmlHighResUrls.forEach((url) => urls.add(url));

    lastBehanceOriginalDebug = {
      candidateCount: candidateImages.length,
      clusterCount: firstCluster.length,
      urlCount: urls.size,
      htmlHighResCount: htmlHighResUrls.size,
      srcset3840Count: firstCluster.filter((candidate) =>
        /\b3840w\b/i.test(candidate.img.getAttribute("srcset") || candidate.img.getAttribute("data-srcset") || "")
      ).length,
      preview: Array.from(urls).slice(0, 6),
    };

    return urls.size ? urls : null;
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

  async function extractInstagramCarouselCount(root, maxIndexHint = 0) {
    const postCode = extractInstagramPostCode(location.pathname);
    if (!postCode) {
      return 0;
    }

    let maxIndex = 0;
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
          maxIndex = Math.max(maxIndex, value);
        }
      } catch {
        // Ignore malformed links.
      }
    }

    const htmlEvidenceMax = extractInstagramCarouselCountFromHtml(postCode);
    maxIndex = Math.max(maxIndex, htmlEvidenceMax);
    return Math.max(maxIndex, maxIndexHint > 0 ? maxIndexHint : 0);
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

  async function buildDebugInfo(images, domainOriginalUrls, maxIndexHint = 0) {
    const originals = images.filter((item) => item.isOriginal).length;
    const instagramContainer = /instagram\.com$/i.test(location.hostname) ? findInstagramPostContainer() : null;
    const instagramMaxImgIndex = instagramContainer ? await extractInstagramCarouselCount(instagramContainer, maxIndexHint) : maxIndexHint;
    const debug = {
      domain: location.hostname,
      contentBuildHash: CONTENT_BUILD_HASH,
      imageCount: images.length,
      originalCount: originals,
      whitelistCount: domainOriginalUrls ? domainOriginalUrls.size : null,
      whitelistMediaKeyCount: lastInstagramOriginalMediaKeys ? lastInstagramOriginalMediaKeys.size : null,
    };

    if (/instagram\.com$/i.test(location.hostname)) {
      debug.instagram = {
        postCode: extractInstagramPostCode(location.pathname),
        normalizedPath: normalizeInstagramPostPath(location.pathname),
        currentImgIndex: extractCurrentImgIndex(),
        maxImgIndex: instagramMaxImgIndex,
        maxIndexHint,
        articleFound: !!document.querySelector("main article"),
        articleTop: instagramContainer ? getContainerTop(instagramContainer) : null,
        containerFound: !!instagramContainer,
        containerTag: instagramContainer ? instagramContainer.tagName : null,
        sampling: lastInstagramSamplingDebug,
        externalSampling: lastInstagramExternalSamplingDebug,
      };
    }

    if (/behance\.net$/i.test(location.hostname)) {
      const main = document.querySelector("main");
      debug.behance = {
        mainFound: !!main,
        mainTop: main ? getContainerTop(main) : null,
        original: lastBehanceOriginalDebug,
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

  function getInstagramCurrentPostPath(value) {
    const pathname = normalizePathname(value);
    return /^\/(?:[A-Za-z0-9._-]+\/)?(?:p|reel)\/[^/]+$/i.test(pathname) ? pathname : "";
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

  function rebuildInstagramOriginalMediaKeys(urls) {
    if (!/instagram\.com$/i.test(location.hostname)) {
      lastInstagramOriginalMediaKeys = null;
      return;
    }

    const keys = new Set();
    if (urls) {
      urls.forEach((url) => {
        const key = getInstagramMediaKey(url);
        if (key) {
          keys.add(key);
        }
      });
    }
    lastInstagramOriginalMediaKeys = keys;
  }

  function isInstagramOriginalMediaKey(url) {
    if (!lastInstagramOriginalMediaKeys?.size) {
      return false;
    }

    const key = getInstagramMediaKey(url);
    return !!key && lastInstagramOriginalMediaKeys.has(key);
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
    const anchor = img.closest("a[href]");
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
    return [
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
  }

  function collectBehanceHighResUrlsFromHtml() {
    const urls = new Set();
    const html = document.documentElement?.innerHTML || "";
    if (!html) {
      return urls;
    }

    const patterns = [
      /https?:\\?\/\\?\/[^"'\\\s]+behance\.net\\?\/[^"'\s]*?\\?\/project_modules\\?\/(?:source|max_3840|max_2560|max_1920|3840|2560|1920)\\?\/[^"'\s<>)]+/gi,
      /https?:\/\/[^"'\s]+behance\.net\/[^"'\s]*?\/project_modules\/(?:source|max_3840|max_2560|max_1920|3840|2560|1920)\/[^"'\s<>)]+/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const decoded = decodeEscapedUrl(match[0]);
        if (decoded && /\/project_modules\/(?:source|max_3840|max_2560|max_1920|3840|2560|1920)\//i.test(decoded)) {
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

  function inferFormat(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "PNG";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "JPEG";
    if (pathname.endsWith(".gif")) return "GIF";
    if (pathname.endsWith(".webp")) return "WEBP";
    if (pathname.endsWith(".svg")) return "SVG";
    if (pathname.endsWith(".avif")) return "AVIF";
    return "Unknown";
  }
})();
