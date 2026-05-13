(() => {
  const CONTENT_BUILD_HASH = "1012";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "mediafetch:extract") {
      return;
    }

    (async () => {
      try {
        const result = await extractImagesFromPage();
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

  async function extractImagesFromPage() {
    const items = [];
    const seen = new Set();
    const domainOriginalUrls = await getDomainOriginalUrlSet();

    const push = (rawUrl, options = {}) => {
      const url = normalizeUrl(rawUrl);
      if (!url || seen.has(url)) return;
      seen.add(url);

      const width = Number(options.width || 0);
      const height = Number(options.height || 0);
      const area = width * height;
      const sourceHint = options.sourceHint || "rendered";
      const score = computeScore(url, sourceHint, width, height);

      items.push({
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
      });
    };

    document.querySelectorAll("img").forEach((img) => {
      push(img.currentSrc || img.src, {
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        sourceHint: img.currentSrc ? "rendered-current" : "rendered-direct",
      });

      const bestSrcset = pickBestSrcsetCandidate(img.getAttribute("srcset") || img.getAttribute("data-srcset") || "");
      if (bestSrcset) {
        push(bestSrcset, {
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          sourceHint: "rendered-srcset",
        });
      }
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
      debug: await buildDebugInfo(images, domainOriginalUrls),
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
      .replace(/\s+/g, " ")
      .replace(/_+/g, "_")
      .replace(/\.+$/g, "")
      .trim()
      .slice(0, 64);
  }

  function inferInstagramFolderName() {
    if (!/instagram\.com$/i.test(location.hostname)) {
      return "";
    }

    const pathParts = location.pathname.split("/").filter(Boolean);
    const userName = sanitizeFolderName(pathParts[0] || "");
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || document.title || "";
    const caption = sanitizeFolderName(cleanProjectTitle(metaTitle));

    if (userName && caption && caption.toLowerCase() !== userName.toLowerCase()) {
      return sanitizeFolderName(`${userName} - ${caption}`).slice(0, 64);
    }

    return userName || caption || "Instagram";
  }

  function normalizeUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) return "";
    try {
      return new URL(value, location.href).toString();
    } catch {
      return "";
    }
  }

  function pickBestSrcsetCandidate(srcset) {
    const candidates = String(srcset || "")
      .split(",")
      .map((part) => part.trim())
      .map((part) => {
        const [url, descriptor = ""] = part.split(/\s+/, 2);
        return { url, descriptor };
      })
      .filter((item) => item.url);

    if (!candidates.length) return "";

    const score = (descriptor) => {
      const value = String(descriptor || "").trim().toLowerCase();
      if (!value) return 1;
      if (value.endsWith("w")) return Number.parseFloat(value) || 1;
      if (value.endsWith("x")) return (Number.parseFloat(value) || 1) * 10000;
      return 1;
    };

    return candidates.sort((a, b) => score(b.descriptor) - score(a.descriptor))[0]?.url || "";
  }

  function computeScore(url, sourceHint, width, height) {
    let score = 0;
    if (sourceHint === "rendered-srcset") score += 400;
    else if (sourceHint === "rendered-meta") score += 320;
    else if (sourceHint === "rendered-current") score += 300;
    else score += 220;

    const lowered = String(url || "").toLowerCase();
    if (/(original|orig|full|master|raw|source|highres|hires|largest|large|xl|xxl|4096|2048)/.test(lowered)) {
      score += 120;
    }
    if (/(thumb|thumbnail|small|preview|avatar|icon|sprite|crop|tiny|medium)/.test(lowered)) {
      score -= 140;
    }

    const area = (width || 0) * (height || 0);
    score += Math.min(500, Math.floor(area / 5000));
    return score;
  }

  function detectOriginal(item, maxArea, domainOriginalUrls) {
    if (domainOriginalUrls) {
      return domainOriginalUrls.has(item.url);
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

  async function getDomainOriginalUrlSet() {
    if (/instagram\.com$/i.test(location.hostname)) {
      return await getInstagramOriginalUrlSet() || new Set();
    }

    if (/behance\.net$/i.test(location.hostname)) {
      return getBehanceOriginalUrlSet() || new Set();
    }

    return null;
  }

  async function getInstagramOriginalUrlSet() {
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
    const finalCandidates = clusterCandidates;
    const urls = createUrlSetFromCandidates(finalCandidates);

    return urls.size ? urls : null;
  }

  function getBehanceOriginalUrlSet() {
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

  async function extractInstagramCarouselCount(root) {
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
    return Math.max(maxIndex, htmlEvidenceMax);
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

  async function buildDebugInfo(images, domainOriginalUrls) {
    const originals = images.filter((item) => item.isOriginal).length;
    const instagramContainer = /instagram\.com$/i.test(location.hostname) ? findInstagramPostContainer() : null;
    const instagramMaxImgIndex = instagramContainer ? await extractInstagramCarouselCount(instagramContainer) : 0;
    const debug = {
      domain: location.hostname,
      contentBuildHash: CONTENT_BUILD_HASH,
      imageCount: images.length,
      originalCount: originals,
      whitelistCount: domainOriginalUrls ? domainOriginalUrls.size : null,
    };

    if (/instagram\.com$/i.test(location.hostname)) {
      debug.instagram = {
        postCode: extractInstagramPostCode(location.pathname),
        normalizedPath: normalizeInstagramPostPath(location.pathname),
        currentImgIndex: extractCurrentImgIndex(),
        maxImgIndex: instagramMaxImgIndex,
        articleFound: !!document.querySelector("main article"),
        articleTop: instagramContainer ? getContainerTop(instagramContainer) : null,
        containerFound: !!instagramContainer,
        containerTag: instagramContainer ? instagramContainer.tagName : null,
      };
    }

    if (/behance\.net$/i.test(location.hostname)) {
      const main = document.querySelector("main");
      debug.behance = {
        mainFound: !!main,
        mainTop: main ? getContainerTop(main) : null,
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
