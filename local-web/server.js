import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const PORT = Number(process.env.PORT || 3200);
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const MAX_IMAGES = 60;
const IMAGE_FETCH_CONCURRENCY = 5;
const THUMBNAIL_WIDTH = 280;
const MAX_DOWNLOAD_BODY_BYTES = 2 * 1024 * 1024;
const SETTINGS_FILE = path.join(process.cwd(), ".mediafetch-settings.json");
const BROWSER_FALLBACK_TIMEOUT_MS = 20000;

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && requestUrl.pathname === "/") {
      return sendHtml(res, renderPage(await loadSettings()));
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/extract") {
      const target = requestUrl.searchParams.get("url");
      if (!target) {
        return sendJson(res, 400, { error: "Please provide a url parameter first." });
      }

      const result = await extractImages(target);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/download") {
      const body = await readJsonBody(req, MAX_DOWNLOAD_BODY_BYTES);
      const result = await downloadImages(body);
      return sendJson(res, 200, result);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`MediaFetch running at http://localhost:${PORT}`);
});

function renderPage(settings = {}) {
  const savedDownloadRoot = escapeHtmlForTemplate(settings.downloadRoot || "D:\\download");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MediaFetch</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f5f7fb;
      color: #1f2937;
    }

    .wrap {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 16px 48px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 28px;
    }

    .sub {
      margin: 0 0 20px;
      color: #6b7280;
      line-height: 1.6;
    }

    .box {
      background: #fff;
      border: 1px solid #dbe3ee;
      border-radius: 12px;
      padding: 16px;
    }

    form {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    input[type="url"] {
      flex: 1 1 480px;
      min-width: 220px;
      padding: 14px 16px;
      border: 1px solid #c9d4e3;
      border-radius: 10px;
      font-size: 16px;
      outline: none;
    }

    input[type="url"]:focus {
      border-color: #4f8cff;
      box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.15);
    }

    button {
      padding: 0 18px;
      min-height: 48px;
      border: 0;
      border-radius: 10px;
      background: #2563eb;
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.7;
      cursor: progress;
    }

    .status {
      margin-top: 12px;
      min-height: 1.4em;
      color: #6b7280;
    }

    .status.error {
      color: #dc2626;
    }

    .panel {
      margin-top: 18px;
      background: #fff;
      border: 1px solid #dbe3ee;
      border-radius: 12px;
      overflow: hidden;
    }

    .panel-head {
      padding: 14px 16px;
      border-bottom: 1px solid #e5ebf3;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .panel-head h2 {
      margin: 0;
      font-size: 18px;
    }

    .meta {
      color: #6b7280;
      font-size: 14px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px;
      padding: 16px;
    }

    .card {
      border: 1px solid #e5ebf3;
      border-radius: 12px;
      overflow: hidden;
      background: #fafbfe;
      padding: 14px;
    }

    .thumb {
      aspect-ratio: 4 / 3;
      border-radius: 10px;
      overflow: hidden;
      background: #eef3fb;
      margin-bottom: 12px;
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .index {
      display: block;
      margin-bottom: 10px;
      color: #2563eb;
      font-size: 12px;
      font-weight: 700;
    }

    .meta-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .meta-pill {
      flex: 0 0 auto;
      width: fit-content;
      max-width: 100%;
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border-radius: 12px;
      background: #eef3fb;
      border: 1px solid #dde6f2;
      color: #1f2937;
      font-size: 12px;
      line-height: 1.2;
    }

    .meta-value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .label {
      color: #6b7280;
    }

    .empty {
      padding: 18px 16px;
      color: #6b7280;
    }

    .download-grid {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .download-grid input {
      flex: 1 1 220px;
      min-width: 220px;
      padding: 14px 16px;
      border: 1px solid #c9d4e3;
      border-radius: 10px;
      font-size: 16px;
      outline: none;
    }

    .download-grid input:focus {
      border-color: #4f8cff;
      box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.15);
    }

    .selection-bar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .selection-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .selection-actions button {
      min-height: 40px;
      padding: 0 14px;
      font-size: 14px;
    }

    .download-box {
      margin-top: 14px;
    }

    .card {
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }

    .card:hover {
      transform: translateY(-1px);
    }

    .card.selected {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
      background: #f3f7ff;
    }

    .card.original::before {
      content: "Original";
      display: inline-block;
      margin-bottom: 8px;
      padding: 4px 8px;
      border-radius: 999px;
      background: #e7f8ee;
      color: #157347;
      font-size: 11px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>MediaFetch</h1>
    <p class="sub">Enter a webpage URL to extract images and show thumbnails, resolution, format, and file size. Image links are not displayed.</p>
    <section class="box">
      <form id="form">
        <input id="url" type="url" name="url" placeholder="https://example.com" autocomplete="off" spellcheck="false" required />
        <button id="submit" type="submit">Extract Images</button>
      </form>
      <div id="status" class="status">Supports HTTP/HTTPS pages. Best for static HTML image extraction.</div>
    </section>

    <section class="box download-box">
      <div class="selection-bar">
        <div class="selection-actions">
          <button id="selectAllBtn" type="button" disabled>Select All</button>
          <button id="clearSelectionBtn" type="button" disabled>Clear Selection</button>
          <button id="selectOriginalBtn" type="button" disabled>Select Original</button>
        </div>
        <div id="selectionStatus" class="status">Selected: 0</div>
      </div>
      <div class="download-grid">
        <input id="downloadRoot" type="text" value="${savedDownloadRoot}" placeholder="D:\\download" />
        <input id="folderName" type="text" value="ProjectsA" placeholder="ProjectsA" />
        <button id="downloadBtn" type="button" disabled>Download</button>
      </div>
      <div id="downloadPreview" class="status">Save path: ${savedDownloadRoot}\\ProjectsA</div>
      <div id="downloadStatus" class="status"></div>
    </section>

    <section class="panel" id="resultPanel" hidden>
      <div class="panel-head">
        <h2 id="resultTitle">Results</h2>
        <div id="resultMeta" class="meta"></div>
      </div>
      <div id="result" class="grid"></div>
    </section>
  </main>

  <script>
    const form = document.getElementById('form');
    const input = document.getElementById('url');
    const submit = document.getElementById('submit');
    const status = document.getElementById('status');
    const downloadRoot = document.getElementById('downloadRoot');
    const folderName = document.getElementById('folderName');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadPreview = document.getElementById('downloadPreview');
    const downloadStatus = document.getElementById('downloadStatus');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    const selectOriginalBtn = document.getElementById('selectOriginalBtn');
    const selectionStatus = document.getElementById('selectionStatus');
    const panel = document.getElementById('resultPanel');
    const result = document.getElementById('result');
    const resultTitle = document.getElementById('resultTitle');
    const resultMeta = document.getElementById('resultMeta');
    let currentImages = [];
    let folderNameTouched = false;

    updateDownloadPreview();
    downloadRoot.addEventListener('input', updateDownloadPreview);
    folderName.addEventListener('input', () => {
      folderNameTouched = true;
      updateDownloadPreview();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;

      panel.hidden = true;
      result.innerHTML = '';
      currentImages = [];
      updateSelectionState();
      downloadStatus.textContent = '';
      status.classList.remove('error');
      status.textContent = 'Extracting images...';
      submit.disabled = true;

      try {
        const response = await fetch('/api/extract?url=' + encodeURIComponent(value));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Extraction failed');

        const images = (data.images || []).map((item) => ({ ...item, selected: false }));
        currentImages = images;
        updateSelectionState();
        if (data.suggestedFolderName && (!folderNameTouched || !folderName.value.trim() || folderName.value.trim() === 'ProjectsA')) {
          folderName.value = data.suggestedFolderName;
          updateDownloadPreview();
        }
        resultTitle.textContent = 'Results';
        resultMeta.textContent = images.length + ' image(s)';
        panel.hidden = false;

        if (!images.length) {
          result.innerHTML = '<div class="empty">No images were found. The page may not contain static images, or the images may be loaded by JavaScript.</div>';
          status.textContent = 'Done. No images found.';
          return;
        }

        renderCards();
        status.textContent = 'Done. Extracted ' + images.length + ' image(s).';
      } catch (error) {
        status.classList.add('error');
        status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        submit.disabled = false;
      }
    });

    selectAllBtn.addEventListener('click', () => {
      currentImages = currentImages.map((item) => ({ ...item, selected: true }));
      renderCards();
    });

    clearSelectionBtn.addEventListener('click', () => {
      currentImages = currentImages.map((item) => ({ ...item, selected: false }));
      renderCards();
    });

    selectOriginalBtn.addEventListener('click', () => {
      currentImages = currentImages.map((item) => ({ ...item, selected: !!item.isOriginal }));
      renderCards();
    });

    downloadBtn.addEventListener('click', async () => {
      const selectedImages = currentImages.filter((item) => item.selected);
      if (!selectedImages.length) return;

      const root = downloadRoot.value.trim();
      const folder = folderName.value.trim();
      if (!root || !folder) {
        downloadStatus.classList.add('error');
        downloadStatus.textContent = 'Please provide both a download root and a folder name.';
        return;
      }

      downloadBtn.disabled = true;
      downloadStatus.classList.remove('error');
      downloadStatus.textContent = 'Downloading...';

      try {
        const response = await fetch('/api/download', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            downloadRoot: root,
            folderName: folder,
            images: selectedImages.map((item) => ({ url: item.url })),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Download failed');

        const failureNote = data.failedCount ? ' (' + data.failedCount + ' failed)' : '';
        downloadStatus.textContent = 'Done. Saved ' + data.savedCount + ' file(s) to ' + data.targetDir + failureNote;
      } catch (error) {
        downloadStatus.classList.add('error');
        downloadStatus.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        downloadBtn.disabled = !currentImages.length;
      }
    });

    function renderCards() {
      result.innerHTML = '';
      const frag = document.createDocumentFragment();

      currentImages.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'card';
        if (item.selected) card.classList.add('selected');
        if (item.isOriginal) card.classList.add('original');

        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = item.alt || 'image ' + (index + 1);
        img.src = item.thumbnail;
        thumb.appendChild(img);

        const label = document.createElement('span');
        label.className = 'index';
        label.textContent = '#' + (index + 1);

        const metaRow = document.createElement('div');
        metaRow.className = 'meta-row';
        metaRow.appendChild(createMetaPill(item.format || 'Unknown', 'Image format'));
        metaRow.appendChild(createMetaPill(item.resolution || 'Unknown', 'Image resolution'));
        metaRow.appendChild(createMetaPill(item.size || 'Unknown', 'Image file size'));

        card.appendChild(thumb);
        card.appendChild(label);
        card.appendChild(metaRow);
        card.addEventListener('click', () => {
          currentImages[index].selected = !currentImages[index].selected;
          renderCards();
        });
        frag.appendChild(card);
      });

      result.appendChild(frag);
      updateSelectionState();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function createMetaPill(value, title) {
      const pill = document.createElement('div');
      pill.className = 'meta-pill';
      pill.title = title;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'meta-value';
      valueSpan.textContent = value;

      pill.appendChild(valueSpan);
      return pill;
    }

    function updateDownloadPreview() {
      downloadPreview.textContent = 'Save path: ' + buildSavePath(downloadRoot.value, folderName.value);
    }

    function updateSelectionState() {
      const total = currentImages.length;
      const selected = currentImages.filter((item) => item.selected).length;
      const originalCount = currentImages.filter((item) => item.isOriginal).length;
      selectionStatus.textContent = 'Selected: ' + selected + ' / ' + total + ' | Original: ' + originalCount;
      downloadBtn.disabled = selected === 0;
      selectAllBtn.disabled = total === 0;
      clearSelectionBtn.disabled = total === 0;
      selectOriginalBtn.disabled = total === 0 || originalCount === 0;
    }

    function buildSavePath(root, folder) {
      const cleanRoot = String(root || '').trim().replace(/[\\/]+$/, '');
      const cleanFolder = String(folder || '').trim().replace(/^[\\/]+/, '');
      if (!cleanRoot && !cleanFolder) return '';
      if (!cleanRoot) return cleanFolder;
      if (!cleanFolder) return cleanRoot;
      return cleanRoot + String.fromCharCode(92) + cleanFolder;
    }
  </script>
</body>
</html>`;
}

function escapeHtmlForTemplate(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function extractImages(inputUrl) {
  const target = normalizeHttpUrl(inputUrl);
  const response = await fetchWithTimeout(target);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
    throw new Error(`Response is not an HTML page: ${contentType || "unknown"}`);
  }

  const text = await readLimitedText(response, MAX_HTML_BYTES);
  let candidates = extractImageCandidates(text, target);
  if (!candidates.length) {
    const renderedCandidates = await extractImagesWithBrowser(target);
    if (renderedCandidates.length) {
      candidates = renderedCandidates;
    }
  }
  candidates = candidates.slice(0, MAX_IMAGES);
  const imagesWithMeta = await mapWithConcurrency(candidates, IMAGE_FETCH_CONCURRENCY, fetchImageMetadata);
  const images = imagesWithMeta
    .filter(Boolean)
    .sort((a, b) => {
      const rankDiff = (b.rank || 0) - (a.rank || 0);
      if (rankDiff !== 0) return rankDiff;
      return (b.area || 0) - (a.area || 0);
    })
    .map((item, index, list) => {
      const maxArea = list[0]?.area || 0;
      const isOriginal = detectOriginalCandidate(item, maxArea);
      const { rank, area, sizeBytes, ...rest } = item;
      return {
        ...rest,
        isOriginal,
      };
    });

  return {
    url: target,
    count: images.length,
    images,
    suggestedFolderName: inferProjectFolderName(text, target),
  };
}

function extractImageCandidates(html, baseUrl) {
  const seen = new Set();
  const items = [];

  const push = (rawUrl, alt = "", sourceHint = "direct") => {
    const url = normalizeResourceUrl(rawUrl, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ url, alt: sanitizeAlt(alt), sourceHint });
  };

  const tagRegex = /<(img|source|meta|link)\b[^>]*>/gi;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const tag = tagMatch[0];
    const attrs = parseAttributes(tag);
    const tagName = tagMatch[1].toLowerCase();

    if (tagName === "img" || tagName === "source") {
      const srcset = attrs.srcset || attrs["data-srcset"];
      if (srcset) {
        const best = pickBestSrcsetCandidate(srcset);
        if (best) push(best, attrs.alt || attrs.title || "", "srcset");
      }

      const direct =
        attrs.src ||
        attrs["data-src"] ||
        attrs["data-original"] ||
        attrs["data-lazy-src"] ||
        attrs["data-url"];

      if (direct) push(direct, attrs.alt || attrs.title || "", "direct");

      const style = attrs.style || "";
      const background = extractBackgroundUrl(style);
      if (background) push(background, attrs.alt || attrs.title || "", "background");
      continue;
    }

    if (tagName === "meta") {
      const property = (attrs.property || attrs.name || "").toLowerCase();
      if (property === "og:image" || property === "twitter:image") {
        push(attrs.content || attrs.value || "", property, "meta");
      }
      continue;
    }

    if (tagName === "link") {
      const rel = (attrs.rel || "").toLowerCase();
      if (rel.split(/\s+/).includes("image_src")) {
        push(attrs.href || "", rel, "link");
      }
    }
  }

  return items;
}

async function extractImagesWithBrowser(targetUrl) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 2200 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_FALLBACK_TIMEOUT_MS,
    });

    await page.waitForTimeout(2500);

    const rawItems = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const push = (rawUrl, alt = "", sourceHint = "rendered") => {
        const value = String(rawUrl || "").trim();
        if (!value || seen.has(value) || value.startsWith("data:") || value.startsWith("blob:")) return;
        seen.add(value);
        results.push({ rawUrl: value, alt: String(alt || "").trim(), sourceHint });
      };

      const pickBestSrcset = (srcset) => {
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
      };

      document.querySelectorAll("img, source").forEach((node) => {
        const alt = node.getAttribute("alt") || node.getAttribute("title") || "";
        const srcset = node.getAttribute("srcset") || node.getAttribute("data-srcset") || "";
        const src = node.getAttribute("src") || node.getAttribute("data-src") || node.getAttribute("data-original") || node.getAttribute("data-lazy-src") || node.getAttribute("data-url") || "";
        const currentSrc = "currentSrc" in node ? node.currentSrc || "" : "";

        const bestSrcset = pickBestSrcset(srcset);
        if (bestSrcset) push(bestSrcset, alt, "rendered-srcset");
        if (currentSrc) push(currentSrc, alt, "rendered-current");
        if (src) push(src, alt, "rendered-direct");
      });

      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]').forEach((node) => {
        push(node.getAttribute("content") || node.getAttribute("href") || "", node.getAttribute("property") || node.getAttribute("name") || node.getAttribute("rel") || "", "rendered-meta");
      });

      return results;
    });

    return rawItems
      .map((item) => {
        const url = normalizeResourceUrl(item.rawUrl, targetUrl);
        if (!url) return null;
        return {
          url,
          alt: sanitizeAlt(item.alt || ""),
          sourceHint: item.sourceHint || "rendered",
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function inferProjectFolderName(html, pageUrl) {
  const candidates = [
    extractMetaContent(html, "property", "og:title"),
    extractMetaContent(html, "name", "og:title"),
    extractMetaContent(html, "name", "twitter:title"),
    extractTitleText(html),
    extractHeadingText(html),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const cleaned = sanitizeSuggestedFolderName(cleanProjectTitle(candidate, pageUrl));
    if (cleaned) return cleaned;
  }

  return "ProjectsA";
}

function extractMetaContent(html, attrName, attrValue) {
  const pattern = new RegExp(
    `<meta\\b[^>]*${attrName}=(["'])${escapeRegExp(attrValue)}\\1[^>]*content=(["'])(.*?)\\2[^>]*>`,
    "i",
  );
  const reversePattern = new RegExp(
    `<meta\\b[^>]*content=(["'])(.*?)\\1[^>]*${attrName}=(["'])${escapeRegExp(attrValue)}\\3[^>]*>`,
    "i",
  );
  const direct = pattern.exec(html);
  if (direct?.[3]) return decodeHtmlEntities(direct[3]).trim();
  const reverse = reversePattern.exec(html);
  if (reverse?.[2]) return decodeHtmlEntities(reverse[2]).trim();
  return "";
}

function extractTitleText(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? decodeHtmlEntities(stripTags(match[1])).trim() : "";
}

function extractHeadingText(html) {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match?.[1] ? decodeHtmlEntities(stripTags(match[1])).trim() : "";
}

function cleanProjectTitle(value, pageUrl) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  text = text
    .replace(/\s*[|\-]\s*Behance\b.*$/i, "")
    .replace(/\s*[|\-]\s*Adobe\b.*$/i, "")
    .replace(/\s*[|\-]\s*Pinterest\b.*$/i, "")
    .replace(/\s*[|\-]\s*Instagram\b.*$/i, "")
    .replace(/\s*[|\-]\s*X\b.*$/i, "");

  if (/behance\.net/i.test(pageUrl)) {
    text = text.replace(/\s+on\s+Behance\b.*$/i, "");
  }

  return text.trim();
}

function sanitizeSuggestedFolderName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAttributes(tag) {
  const attrs = {};
  const attrRegex = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return attrs;
}

function extractBackgroundUrl(style) {
  const match = /background(?:-image)?\s*:\s*[^;]*url\((['"]?)(.*?)\1\)/i.exec(style);
  return match ? match[2] : "";
}

function pickBestSrcsetCandidate(srcset) {
  const candidates = srcset
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [url, descriptor = ""] = part.split(/\s+/, 2);
      return { url, descriptor };
    })
    .filter((candidate) => candidate.url);

  if (!candidates.length) return "";

  let best = candidates[0];
  let bestScore = scoreSrcsetDescriptor(best.descriptor);
  for (const candidate of candidates.slice(1)) {
    const score = scoreSrcsetDescriptor(candidate.descriptor);
    if (score >= bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best.url;
}

function scoreSrcsetDescriptor(descriptor) {
  const value = descriptor.trim().toLowerCase();
  if (!value) return 1;
  if (value.endsWith("w")) return Number.parseFloat(value) || 1;
  if (value.endsWith("x")) return (Number.parseFloat(value) || 1) * 10000;
  return 1;
}

function sanitizeAlt(text) {
  return String(text || "").trim().slice(0, 120);
}

function normalizeResourceUrl(rawUrl, baseUrl) {
  if (!rawUrl) return "";
  const value = String(rawUrl).trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return "";

  try {
    if (value.startsWith("//")) return new URL(`https:${value}`).toString();
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeHttpUrl(rawUrl) {
  const url = new URL(String(rawUrl).trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }
  return url.toString();
}

function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), FETCH_TIMEOUT_MS);
  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

async function readJsonBody(req, limit) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) {
      throw new Error("Request body too large.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

async function readLimitedText(response, limit) {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      throw new Error(`HTML page is too large and exceeds the ${Math.round(limit / 1024 / 1024)}MB limit.`);
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function fetchImageMetadata(item) {
  try {
    const response = await fetchWithTimeout(item.url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MediaDownloader/1.0",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const bytes = await readLimitedBuffer(response, MAX_IMAGE_BYTES);
    const sizeBytes = parseContentLength(response.headers.get("content-length")) || bytes.byteLength;
    const format = inferImageFormat(bytes, contentType, item.url);
    const dimensions = getImageDimensions(bytes, format, contentType);
    const area = dimensions ? dimensions.width * dimensions.height : 0;

    return {
      url: item.url,
      thumbnail: await createThumbnailDataUrl(bytes, contentType),
      format,
      resolution: dimensions ? `${dimensions.width} x ${dimensions.height}` : "Unknown",
      size: formatBytes(sizeBytes),
      sizeBytes,
      area,
      rank: computeImageRank(item, format, dimensions, sizeBytes),
    };
  } catch {
    return null;
  }
}

async function readLimitedBuffer(response, limit) {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > limit) {
      throw new Error(`Image is too large and exceeds the ${Math.round(limit / 1024 / 1024)}MB limit.`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      throw new Error(`Image is too large and exceeds the ${Math.round(limit / 1024 / 1024)}MB limit.`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(bytes);
}

function parseContentLength(value) {
  const size = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function inferImageFormat(bytes, contentType, url) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("image/png")) return "PNG";
  if (type.includes("image/jpeg") || type.includes("image/jpg")) return "JPEG";
  if (type.includes("image/gif")) return "GIF";
  if (type.includes("image/webp")) return "WEBP";
  if (type.includes("image/svg+xml")) return "SVG";
  if (type.includes("image/bmp")) return "BMP";
  if (type.includes("image/avif")) return "AVIF";
  if (type.includes("image/heic") || type.includes("image/heif")) return "HEIC";
  if (type.includes("image/x-icon") || type.includes("image/vnd.microsoft.icon")) return "ICO";

  const pathname = safePathname(url).toLowerCase();
  if (pathname.endsWith(".png")) return "PNG";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "JPEG";
  if (pathname.endsWith(".gif")) return "GIF";
  if (pathname.endsWith(".webp")) return "WEBP";
  if (pathname.endsWith(".svg")) return "SVG";
  if (pathname.endsWith(".bmp")) return "BMP";
  if (pathname.endsWith(".avif")) return "AVIF";
  if (pathname.endsWith(".ico")) return "ICO";

  if (looksLikePng(bytes)) return "PNG";
  if (looksLikeJpeg(bytes)) return "JPEG";
  if (looksLikeGif(bytes)) return "GIF";
  if (looksLikeWebp(bytes)) return "WEBP";
  if (looksLikeSvg(bytes)) return "SVG";
  if (looksLikeBmp(bytes)) return "BMP";
  if (looksLikeIco(bytes)) return "ICO";

  return "UNKNOWN";
}

function safePathname(rawUrl) {
  try {
    return new URL(rawUrl).pathname || "";
  } catch {
    return "";
  }
}

function looksLikePng(bytes) {
  return bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
}

function looksLikeJpeg(bytes) {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function looksLikeGif(bytes) {
  return bytes.byteLength >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61;
}

function looksLikeBmp(bytes) {
  return bytes.byteLength >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
}

function looksLikeIco(bytes) {
  return bytes.byteLength >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00;
}

function looksLikeWebp(bytes) {
  return bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
}

function looksLikeSvg(bytes) {
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  return head.startsWith("<svg") || head.startsWith("<?xml") || head.includes("<svg");
}

function getImageDimensions(bytes, format, contentType) {
  switch (format) {
    case "PNG":
      return parsePngDimensions(bytes);
    case "JPEG":
      return parseJpegDimensions(bytes);
    case "GIF":
      return parseGifDimensions(bytes);
    case "WEBP":
      return parseWebpDimensions(bytes);
    case "SVG":
      return parseSvgDimensions(bytes, contentType);
    case "BMP":
      return parseBmpDimensions(bytes);
    case "ICO":
      return parseIcoDimensions(bytes);
    default:
      return null;
  }
}

function parsePngDimensions(bytes) {
  if (bytes.byteLength < 24) return null;
  return {
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20),
  };
}

function parseGifDimensions(bytes) {
  if (bytes.byteLength < 10) return null;
  return {
    width: readUint16LE(bytes, 6),
    height: readUint16LE(bytes, 8),
  };
}

function parseBmpDimensions(bytes) {
  if (bytes.byteLength < 26) return null;
  return {
    width: readInt32LE(bytes, 18),
    height: Math.abs(readInt32LE(bytes, 22)),
  };
}

function parseIcoDimensions(bytes) {
  if (bytes.byteLength < 8) return null;
  const width = bytes[6] || 256;
  const height = bytes[7] || 256;
  return { width, height };
}

function parseJpegDimensions(bytes) {
  if (bytes.byteLength < 4) return null;
  let offset = 2;

  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.byteLength && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.byteLength) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    if (offset + 1 >= bytes.byteLength) return null;
    const length = readUint16BE(bytes, offset);
    if (length < 2) return null;

    if (isJpegSofMarker(marker)) {
      if (offset + 5 >= bytes.byteLength) return null;
      return {
        height: readUint16BE(bytes, offset + 3),
        width: readUint16BE(bytes, offset + 5),
      };
    }

    offset += length;
  }

  return null;
}

function isJpegSofMarker(marker) {
  return marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb;
}

function parseWebpDimensions(bytes) {
  if (bytes.byteLength < 30) return null;
  const chunkType = ascii(bytes, 12, 4);
  if (chunkType === "VP8X" && bytes.byteLength >= 30) {
    return {
      width: 1 + readUint24LE(bytes, 24),
      height: 1 + readUint24LE(bytes, 27),
    };
  }

  if (chunkType === "VP8L" && bytes.byteLength >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + ((((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))),
    };
  }

  return null;
}

function parseSvgDimensions(bytes) {
  const text = new TextDecoder().decode(bytes);
  const widthMatch = /width=["']?([\d.]+)(?:px)?["']?/i.exec(text);
  const heightMatch = /height=["']?([\d.]+)(?:px)?["']?/i.exec(text);
  if (widthMatch && heightMatch) {
    return {
      width: Math.round(Number.parseFloat(widthMatch[1])),
      height: Math.round(Number.parseFloat(heightMatch[1])),
    };
  }

  const viewBoxMatch = /viewBox=["'][^"']*?([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)[^"']*?["']/i.exec(text);
  if (viewBoxMatch) {
    return {
      width: Math.round(Number.parseFloat(viewBoxMatch[3])),
      height: Math.round(Number.parseFloat(viewBoxMatch[4])),
    };
  }

  return null;
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  ) >>> 0;
}

function readInt32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >> 0;
}

function ascii(bytes, offset, length) {
  let text = "";
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(bytes[offset + i]);
  }
  return text;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function computeImageRank(item, format, dimensions, sizeBytes) {
  let score = 0;

  switch (item.sourceHint) {
    case "srcset":
      score += 400;
      break;
    case "meta":
      score += 320;
      break;
    case "link":
      score += 300;
      break;
    case "direct":
      score += 260;
      break;
    case "background":
      score += 120;
      break;
    default:
      score += 100;
      break;
  }

  const url = String(item.url || "").toLowerCase();
  if (/(original|orig|full|master|raw|source|highres|hires|largest|large|xl|xxl|4096|2048)/.test(url)) {
    score += 120;
  }
  if (/(thumb|thumbnail|small|preview|avatar|icon|logo|sprite|crop|tiny|medium)/.test(url)) {
    score -= 140;
  }

  if (dimensions) {
    score += Math.min(500, Math.floor((dimensions.width * dimensions.height) / 5000));
  }

  if (sizeBytes) {
    score += Math.min(200, Math.floor(sizeBytes / 50000));
  }

  if (format === "SVG") {
    score -= 80;
  }

  return score;
}

function detectOriginalCandidate(item, maxArea) {
  const area = item.area || 0;
  if (!area || !maxArea) {
    return (item.rank || 0) >= 380;
  }

  const areaRatio = area / maxArea;
  const url = String(item.url || "").toLowerCase();
  const strongUrlSignal = /(original|orig|full|master|raw|source|highres|hires|largest|large|xl|xxl|4096|2048)/.test(url);
  const weakUrlSignal = /(thumb|thumbnail|small|preview|avatar|icon|sprite|crop|tiny|medium)/.test(url);

  if (areaRatio >= 0.98) return true;
  if (weakUrlSignal) return false;
  if (strongUrlSignal && areaRatio >= 0.5) return true;
  if (areaRatio >= 0.85) return true;
  return (item.rank || 0) >= 500;
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      downloadRoot: normalizeAbsolutePath(parsed.downloadRoot) || "D:\\download",
    };
  } catch {
    return {
      downloadRoot: "D:\\download",
    };
  }
}

async function saveSettings(settings) {
  const payload = {
    downloadRoot: normalizeAbsolutePath(settings?.downloadRoot) || "D:\\download",
  };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeAbsolutePath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return "";
  const resolved = path.resolve(value);
  return path.isAbsolute(resolved) ? resolved : "";
}

function sanitizeFolderName(rawName) {
  const value = String(rawName || "").trim();
  if (!value) return "";
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/g, "");
}

function extensionForFormat(format, contentType, url) {
  const byFormat = {
    PNG: "png",
    JPEG: "jpg",
    GIF: "gif",
    WEBP: "webp",
    SVG: "svg",
    BMP: "bmp",
    ICO: "ico",
    AVIF: "avif",
    HEIC: "heic",
  };
  if (byFormat[format]) return byFormat[format];

  const type = String(contentType || "").toLowerCase();
  if (type.includes("image/png")) return "png";
  if (type.includes("image/jpeg") || type.includes("image/jpg")) return "jpg";
  if (type.includes("image/gif")) return "gif";
  if (type.includes("image/webp")) return "webp";
  if (type.includes("image/svg+xml")) return "svg";
  if (type.includes("image/bmp")) return "bmp";
  if (type.includes("image/avif")) return "avif";
  if (type.includes("image/heic") || type.includes("image/heif")) return "heic";
  if (type.includes("image/x-icon") || type.includes("image/vnd.microsoft.icon")) return "ico";

  const ext = path.extname(safePathname(url)).replace(/^\./, "").toLowerCase();
  return ext || "bin";
}

async function downloadImages(body) {
  const downloadRoot = normalizeAbsolutePath(body?.downloadRoot);
  const folderName = sanitizeFolderName(body?.folderName);
  const images = Array.isArray(body?.images) ? body.images : [];

  if (!downloadRoot) {
    throw new Error("Please provide a valid absolute download root path.");
  }
  if (!folderName) {
    throw new Error("Please provide a folder name.");
  }
  if (!images.length) {
    throw new Error("No images to download.");
  }

  const targetDir = path.resolve(downloadRoot, folderName);
  await fs.mkdir(targetDir, { recursive: true });
  await saveSettings({ downloadRoot });

  const results = await mapWithConcurrency(images, IMAGE_FETCH_CONCURRENCY, async (item, index) => {
    try {
      const response = await fetchWithTimeout(item.url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MediaDownloader/1.0",
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed for image ${index + 1}: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const bytes = await readLimitedBuffer(response, MAX_IMAGE_BYTES);
      const format = inferImageFormat(bytes, contentType, item.url);
      const extension = extensionForFormat(format, contentType, item.url);
      const fileName = `${String(index + 1).padStart(3, "0")}.${extension}`;
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, bytes);

      return {
        url: item.url,
        fileName,
        filePath,
        size: formatBytes(bytes.byteLength),
        format,
      };
    } catch (error) {
      return {
        url: item.url,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const files = results.filter((item) => item && !item.error);
  const failures = results.filter((item) => item && item.error);
  return {
    targetDir,
    savedCount: files.length,
    failedCount: failures.length,
    files,
    failures,
  };
}

async function createThumbnailDataUrl(bytes, contentType) {
  try {
    const image = sharp(bytes, { failOn: "none" }).rotate();
    const thumbBuffer = await image
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: 82 })
      .toBuffer();
    return `data:image/webp;base64,${thumbBuffer.toString("base64")}`;
  } catch {
    const placeholder = createPlaceholderSvgDataUrl(contentType || "image");
    return placeholder;
  }
}

function createPlaceholderSvgDataUrl(label) {
  const safeLabel = String(label || "preview")
    .replace(/[<>&'"]/g, "")
    .slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180">
    <rect width="280" height="180" rx="16" fill="#eef3fb"/>
    <rect x="18" y="18" width="244" height="144" rx="12" fill="#dfe7f3"/>
    <text x="140" y="95" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#5b6b80">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results.filter(Boolean);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}
