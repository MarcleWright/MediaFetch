# MediaFetch Execution Standard

## Purpose

This document defines the implementation rules for MediaFetch across both products:

- [local-web](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/local-web)
- [chrome-plugin](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin)

The goal is to make extraction, project naming, original-image detection, selection, and download behavior consistent, while still allowing domain-specific adaptation.

## Scope

This standard applies to:

- page title parsing
- folder name generation
- image candidate extraction
- original-image prioritization
- UI selection behavior
- download file naming
- per-domain adaptation rules

## Core Principles

1. Domain-aware behavior is allowed and expected.
2. Generic rules must exist as a fallback for unsupported domains.
3. Folder names should be short, stable, readable, and download-safe.
4. Original images should be ranked before thumbnails and derivative sizes.
5. The UI should prefer practical download workflows over perfect metadata completeness.
6. Site-specific parsing rules must be additive and should not break generic extraction.

## Pipeline

Each extraction flow should follow this order:

1. Detect current domain.
2. Match a domain-specific parser if one exists.
3. Extract project title candidates.
4. Generate a normalized `folderName`.
5. Extract image candidates from DOM, metadata, and rendered sources.
6. Score and sort image candidates.
7. Mark probable originals.
8. Present sorted results with originals first.
9. Download only selected items.

## Download Metadata

Each download folder should include a `metadata.json` file.

Purpose:

- preserve a stable link back to the source project or post
- support future duplicate detection by project identity
- record download facts without mixing in temporary debug state

`metadata.json` should contain project facts and download facts only.

Recommended fields:

- `platform`
- `domain`
- `projectUrl`
- `normalizedUrl`
- `projectName`
- `title`
- `username`
- `authorId`
- `projectId`
- `publishedAt`
- `publishedDateCode`
- `folderName`
- `downloadedAt`
- `imageCount`
- `originalCount`
- `pluginVersion`

Rules:

- do not store popup debug output in `metadata.json`
- do not store transient probe state such as sample indexes or temporary navigation paths
- `projectId` should be the platform-level content id when available
- `authorId` should be stored when the platform exposes a stable author identifier
- `normalizedUrl` should remove unstable query noise and point back to the canonical project or post when possible

## Generic Rules

### Title Candidate Priority

When no domain-specific override exists, project naming should use the following priority:

1. `meta[property="og:title"]`
2. `meta[name="twitter:title"]`
3. `document.title`
4. first visible `h1`

### Generic Title Cleanup

Cleanup should apply in this order:

1. collapse repeated whitespace
2. trim leading and trailing whitespace
3. remove trailing site suffixes such as `| Behance`, `- Behance`, `| Instagram`, `- Instagram`, `| Weibo`, `- Weibo`
4. remove illegal Windows filename characters
5. compress repeated underscores
6. remove trailing dots
7. enforce a maximum length

### Folder Name Rules

`folderName` should:

- default to `ProjectsA` only when no reliable title exists
- be human-readable
- be safe for Windows and Chrome downloads
- avoid full-caption dumps where possible
- be capped to 64 characters by default
- remove emoji

Current Chrome-plugin naming convention:

- default pattern: `platform_username_yymmdd_title`
- omit any segment that cannot be recovered reliably
- use `_` only between top-level content segments
- use `-` inside a content segment instead of `_` or spaces
- sanitize illegal filename characters inside a segment to `-`
- compress repeated `-` and repeated `_`

Additional Behance naming rule:

- Behance uses the author display name as `username` when available
- Behance stores the stable profile slug in `authorId`
- expected folder pattern:
  - `behance_authorName_yymmdd_title`

Current domain-specific naming overrides:

- Instagram:
  - `instagram_username_yymmdd_title`
  - in practice, title is usually short or empty and may be omitted
- Weibo:
  - `weibo_username_yymmdd_hhmm`
  - title is intentionally ignored
- Xiaohongshu:
  - folder prefix uses `小红书` instead of `xiaohongshu` to save space
  - metadata `platform` remains `xiaohongshu`

### Image Candidate Sources

Generic extraction should look at:

- `img.currentSrc`
- `img.src`
- `srcset`
- `data-srcset`
- `og:image`
- `twitter:image`
- `link[rel="image_src"]`
- CSS `background-image` when feasible

### Original Image Ranking

Generic original-image scoring should consider:

- source priority
  - `srcset` best candidate
  - rendered current image
  - direct image URL
  - metadata-only image
- width and height
- total area
- original-size keywords in URL
  - `original`
  - `orig`
  - `full`
  - `master`
  - `raw`
  - `source`
  - `highres`
  - `hires`
  - `large`
  - `xl`
  - `xxl`
- thumbnail keywords in URL
  - `thumb`
  - `thumbnail`
  - `small`
  - `preview`
  - `avatar`
  - `icon`
  - `sprite`
  - `crop`
  - `tiny`
  - `medium`

### Sorting Rules

Default result sorting:

1. probable originals first
2. higher score first
3. larger area first
4. stable URL order last

## Domain Rules

### Behance

#### Goal

Prefer the actual project title and prefer large presentation images over thumbnails and grid previews.

#### Title Parsing

Priority:

1. `og:title`
2. `document.title`
3. visible project heading

Cleanup rules:

- remove trailing `| Behance` and similar site suffixes
- keep the project title, not the author name
- allow username and published date to be added by the unified folder naming layer

#### Author Identity

Behance should separate:

- readable author display name
- stable author slug

Rules:

1. Use the display author name as Behance `username`.
2. Store the stable profile slug as `authorId`.
3. If the display author name is unavailable, fall back to the slug.

Expected example:

- `username`: `hyunbeen Kye`
- `authorId`: `hb_kyea396`
- folder name: `behance_hyunbeen_Kye_250518_NASA_LEVION`

#### Image Parsing

Prefer:

- rendered project images in the main content column
- best `srcset` candidate
- large CDN variants

De-prioritize:

- author avatar
- related projects thumbnails
- navigation icons
- cover placeholders

#### Original Selection

If multiple Behance CDN sizes exist for the same visual, prefer:

1. explicit high-resolution URLs exposed by the page or page scripts
   - `/project_modules/source/`
   - `/project_modules/max_3840/`
   - `/project_modules/max_2560/`
   - `/project_modules/max_1920/`
   - `/project_modules/3840/`
   - `/project_modules/2560/`
   - `/project_modules/1920/`
2. largest `srcset` candidate, using descriptors such as `3840w` to infer display resolution
3. high-resolution `data-*` image attributes
   - `data-original`
   - `data-full`
   - `data-hires`
   - `data-high-res-src`
   - `data-large-src`
4. largest rendered width/height variant
5. URL variant containing original-size keywords

Current Chrome-plugin Behance original-selection behavior:

1. Restrict candidates to large images inside `main`.
2. Exclude obvious utility, avatar, profile, and foreign-project images.
3. Do not truncate long case-study pages to the first visual cluster only.
4. Normalize same-image Behance CDN variants by stable media key.
5. For the same Behance media key, keep only the highest-ranked variant:
   - `source`
   - `max_3840`
   - `max_2560`
   - `max_1920`
   - `fs`
6. If the kept high-resolution URL lacks DOM width/height, inherit known dimensions from another DOM-visible variant with the same media key.

Important Behance CDN rule:

- Do not blindly synthesize `max_3840` URLs by rewriting lower-resolution paths such as `/project_modules/1400/...`.
- Behance CDN may return a smaller actual file for a synthesized path.
- A high-resolution URL should be treated as reliable only when it is actually exposed by the page, `srcset`, data attributes, or page script payload.
- If the uploaded source image itself is small, MediaFetch should still extract it, but it cannot create a higher-resolution file than the source.

#### Original Boundary Rules

Behance must distinguish between:

- current project presentation images
- author avatar
- related project covers
- recommended content thumbnails
- navigation and UI assets

Rules:

1. `Original` may only be assigned to images that belong to the currently opened project body.
2. Images from related projects, recommendation modules, author cards, and side sections must never be marked as `Original`.
3. If the page exposes multiple CDN sizes for the same visual, only the highest-ranked version inside the current project body is eligible to be `Original`.
4. Project-body media should be preferred over page-level metadata images when both exist.
5. If project-body boundaries are ambiguous, the implementation must prefer the main content column and exclude footer, sidebar, and recommendation sections.
6. When the DOM is ambiguous, false negatives are preferable to false positives.

Expected behavior:

- main case-study images can be marked `Original`
- related project covers on the same page must not be marked `Original`

### Instagram

#### Goal

Prefer a short, readable folder name and treat the post owner plus concise caption fragment as the project identifier.

#### Title Parsing

Priority:

1. username from URL path
2. `og:title`
3. `document.title`

Cleanup rules:

- first path segment should be treated as username when on a post or reel page
- if `og:title` contains a usable caption fragment, combine as `username - caption`
- remove trailing `| Instagram`
- avoid using the entire long social title
- keep final output within 64 characters

Expected output examples:

- `matthiashossann - Peugeot Concept 6`
- `nike - Air Max Campaign`
- `natgeo`

#### Image Parsing

Prefer:

- rendered post media in the article region
- `currentSrc`
- best `srcset` candidate

De-prioritize:

- profile avatar
- story ring assets
- UI icons
- suggested content thumbnails

#### Original Selection

If multiple sizes exist:

1. prefer the best rendered `currentSrc`
2. prefer the largest `srcset` candidate
3. de-prioritize obviously cropped preview variants

#### Original Boundary Rules

Instagram must distinguish between:

- current post media
- related post covers
- profile and UI assets

Rules:

1. `Original` may only be assigned to images that belong to the currently opened post or reel.
2. Images from related posts, recommended feeds, profile sections, or lower-page discovery modules must never be marked as `Original`.
3. `img_index` in the URL represents the currently viewed item index only. It must not be treated as the total count.
4. The allowed `Original` candidate set should come from the current post media region only.
5. If the page contains a carousel, all media items inside the current post carousel are eligible to become `Original`.
6. If both current-post media and related-post media share the same parent article container, the implementation must further restrict to the current-post media subtree or top media band.
7. When the DOM is ambiguous, false negatives are preferable to false positives. It is better to miss an `Original` mark than to mark other posts as `Original`.

Expected behavior:

- current post images can be marked `Original`
- images from other posts on the same screen must not be marked `Original`

#### Current Debug Findings

Observed findings from the current Instagram implementation:

1. The same post may appear under both `/user/p/postCode` and `/p/postCode`.
2. Original detection must treat those two URL forms as the same post identity.
3. `main article` is not guaranteed to exist on the live Instagram page.
4. The implementation currently needs a fallback container discovery strategy under `main`.
5. `img_index` in the current URL can be read reliably as the current position only.
6. `maxImgIndex` must only be accepted when extracted from DOM evidence inside the current post container.
7. The current URL value must never be reused as a fake `maxImgIndex`.
8. Differences between `/user/p/postCode` and `/p/postCode` must not change `Original` counts.
9. Switching between `img_index=3` and `img_index=6` must not change `Original` counts unless the DOM actually exposes more post-media candidates.

Current debug samples already observed:

- `/user/p/postA`
  - `imageCount: 30`
  - `originalCount: 0`
  - `whitelistCount: 0`
  - `currentImgIndex: 0`
  - `maxImgIndex: 0`
  - `articleFound: false`
  - `containerFound: true`
  - `containerTag: DIV`
- `/p/postA`
  - `imageCount: 30`
  - `originalCount: 2`
  - `whitelistCount: 2`
  - `currentImgIndex: 0`
  - `maxImgIndex: 0`
  - `articleFound: false`
  - `containerFound: true`
  - `containerTag: DIV`
- `/p/postA?img_index=6`
  - `imageCount: 31`
  - `originalCount: 3`
  - `whitelistCount: 3`
  - `currentImgIndex: 6`
  - `maxImgIndex: 6`
  - this behavior was identified as incorrect because `maxImgIndex` was mirroring the current URL instead of DOM evidence
- `/p/postA?img_index=3`
  - `imageCount: 32`
  - `originalCount: 3`
  - `whitelistCount: 3`
  - `currentImgIndex: 3`
  - `maxImgIndex: 3`
  - this behavior was identified as incorrect for the same reason

Additional Instagram observation from later testing:

- for multi-image posts, the currently exposed media window is bounded and does not reveal the full carousel at once
- observed rule:
  - `index=1` tends to expose `1, 2`
  - `index=2` tends to expose `1, 2, 3`
  - middle indexes tend to expose a four-item window around the current index
  - `index=max` tends to expose `max-2, max-1, max`
- practical working window described by testing:
  - around current index `N`, the visible set is commonly `N-2, N-1, N, N+1`
  - the visible count does not exceed `4`
- because of this, `Original` extraction should not depend on a single current page state
- once `maxImgIndex` is known, a lightweight probe strategy can sample indexes with step `3`
- recommended probe sequence example: `1, 2, 5, 8, ..., max`
- merge URLs from those sampled pages to reconstruct the full carousel with fewer requests than probing every index

Refined sampling rule from later analysis:

- let `M = maxImgIndex`
- let `N = floor(M / 4)`
- let `L = M mod 4`
- because one sampled page usually exposes a four-item window around the current index
  - approximately `index-2, index-1, index, index+1`
- the preferred probe set is:
  - `S = { 4n - 1 | n = 1..N } union { M }`
- example probes:
  - `3, 7, 11, ..., M`
- interpretation:
  - probe `3` tends to cover `1..4`
  - probe `7` tends to cover `5..8`
  - probe `11` tends to cover `9..12`
  - final probe `M` covers the tail section for remainders `L = 1, 2, 3`
- after probing, merge and deduplicate URLs
- if the first block appears incomplete on a given post, probing `1` or `2` may be used as a bounded fallback

Implementation requirement from these findings:

- normalize Instagram identity by `postCode`
- keep debug output for `postCode`, `currentImgIndex`, `maxImgIndex`, `containerFound`, and `containerTag`
- never let `img_index` alone drive `Original` quantity
- prefer bounded window-based reconstruction over full `1..N` brute-force probing
- when using bounded reconstruction, prefer the formula-driven probe set `4n-1` plus `maxImgIndex`

#### Instagram Rendered Sampling Findings

Later testing refined the carousel strategy:

1. `fetch(probeUrl).text()` is not reliable for Instagram post media extraction.
2. Even when the sampled index formula is correct, the returned HTML may not contain usable hydration JSON for the current post.
3. Direct page HTML parsing can return `sampledUrlCount: 0` while real browser navigation exposes the expected carousel window.
4. The extension should therefore treat `fetch`-based HTML parsing as a fallback only.

Preferred Chrome-plugin strategy:

1. Use the user's logged-in active tab.
2. Use popup-level real tab navigation to probe `maxImgIndex` when needed.
3. Navigate the active tab to selected `img_index` values.
4. Wait for the page to complete and render.
5. Ask the content script for a rendered snapshot of the current post media window.
6. Merge rendered snapshot URLs into the current post media set.
7. Restore the tab to the original URL.

Important implementation constraints:

- Preserve the username path form during real navigation.
  - `/username/p/postCode?img_index=N` must not be rewritten to `/p/postCode?img_index=N` during sampling.
- Normalize identity by `postCode`, but preserve the navigable URL path for real tab navigation.
- DOM/rendered sampling results must be merged with the current DOM candidate set.
- Sampled URLs must never replace the current DOM candidate set wholesale.
- If `maxIndexHint` is unavailable and page evidence only shows `carouselCount <= 1`, avoid letting a single sampled crop URL collapse the original candidate set.
- `maxIndexHint > 0` is stronger evidence than DOM window hints.
- DOM/HTML evidence such as `maxImgIndex = 4` without a successful popup probe may only mean the current window exposes index `4`; it is not proof of total carousel length.

Current practical sampling rule:

- if `M <= 4`, use `[M]`
- if `M > 4`, use `[3, 7, 11, ..., M]`
- for a 3-image carousel, sampling `index=3` is usually enough because the rendered window exposes `1, 2, 3`
- for larger carousels, sample each four-item block and always include `M`

Instagram media deduplication rules:

- Full signed URLs are not stable identities.
- Instagram may emit the same image with different `_nc_gid`, `oh`, and other transient query parameters.
- Debug should distinguish:
  - raw sampled URL count
  - deduplicated media-key count
- Media key priority:
  1. stable image filename in URL pathname
  2. `ig_cache_key`
  3. host + pathname
- For the same media key, prefer non-cropped variants over obvious square crop variants.
- Crop indicators include `stp` values such as `c288.0.864.864a` and `s640x640`.
- A crop variant should only be kept when no non-crop variant is available for that media key.

Instagram folder naming:

- Chrome-plugin Instagram folder names should be `username_yymmdd`.
- Date should be the post date, not the current date.
- Date sources, in priority order:
  1. `time[datetime]`
  2. `article:published_time`
  3. `meta[name="date"]`
  4. page JSON fields such as `taken_at_timestamp`, `date`, or `created_at`
- If the post date is unavailable, fall back to `username`.

### Weibo

#### Goal

Prefer post-related images and avoid navigation or profile assets.

#### Title Parsing

Weibo does not use a post title for folder naming.

Folder naming priority:

1. `weibo_username_yymmdd_hhmm`
2. `weibo_username_yymmdd`
3. `weibo_yymmdd_hhmm`
4. `weibo_username`
5. status id fallback only when necessary

Timestamp rules:

- prefer time evidence from the current detail post container
- support visible text formats such as:
  - `5月16日 09:30`
  - `5-16 09:30`
  - `2026-05-16 09:30`
  - `今天 09:30`
  - `昨天 09:30`
- normalize to:
  - `publishedDateCode = yymmdd`
  - `publishedTimeCode = hhmm`

#### Image Parsing

Prefer:

- rendered feed post images
- post detail media groups
- large image viewer sources when available

De-prioritize:

- avatar
- emoji assets
- badges
- feed UI icons

#### Original Selection

Chrome-plugin Weibo extraction should:

1. Restrict Weibo `Original` candidates to real Sina image CDN files such as `*.sinaimg.cn`.
2. Reject non-image page URLs, including `.htm` page links, from the Weibo image candidate list.
3. Normalize known Sina image CDN size folders such as `thumb*`, `thumbnail`, `square`, `orj*`, `wap*`, `mw*`, and `bmiddle` to `mw2000` when building original candidates.
4. Deduplicate Sina image variants by stable image filename.
5. Prefer the current post/detail container and avoid obvious avatars, emoji, badges, profile images, and tiny UI assets.
6. When the current Weibo post exposes `layerid`, the Chrome plugin may navigate the active tab to `?layerid=...`, wait for the rendered large-image layer, collect rendered `img.currentSrc` candidates, and restore the original URL.

#### Download Issues and Resolution

Observed problem:

- Weibo Sina image CDN URLs such as `mw2000` may return anti-hotlink HTML like `code.htm` when downloaded directly through `chrome.downloads.download(remoteUrl)`.
- In Chrome this can surface as `001.htm` or `code.htm`, with the browser reporting that it could not extract the file from the site.

Resolution:

1. Use a background service worker to install a temporary request-header rule for Sina image CDN requests.
2. Set `Referer` to the current Weibo page URL, not a generic site root.
3. Set `Origin: https://weibo.com`.
4. Preserve plugin-assigned sequential filenames in `downloads.onDeterminingFilename`.
5. For Sina image URLs, prefer fetching the image body first and then downloading a local `blob:` URL instead of passing the remote CDN URL directly to Chrome downloads.
6. Keep the direct remote download path only as a fallback when blob download is unnecessary or unsupported.

### Weixin

#### Goal

Prefer article-body images from WeChat public article pages and probe `mmbiz.qpic.cn` display URLs for source-size variants.

#### Image Parsing

Prefer:

- images inside `#js_content`, `.rich_media_content`, `#img-content`, `article`, or `main`
- `mmbiz.qpic.cn/mmbiz_*` and `mmbiz.qpic.cn/sz_mmbiz_*` image URLs from `data-src`, `data-original`, `currentSrc`, `src`, other DOM attributes, and rendered article HTML

De-prioritize:

- avatars
- profile links
- QR codes
- emoji, logo, share, loading, and other utility images

#### Original Selection

Chrome-plugin Weixin extraction should:

1. Restrict Weixin `Original` candidates to confirmed article-body `mmbiz.qpic.cn` images.
2. Derive source-size candidates by replacing numeric display-size path segments such as `/640` with `/0`.
3. Read article image URLs from DOM attributes such as `data-src` and from rendered article HTML before relying on lazy-loaded rendered dimensions.
4. Remove display-only query noise such as WebP/lazy-loading parameters when building the source probe URL.
5. Preserve the best inferred `wx_fmt` and add `from=appmsg` for the probe URL.
6. Validate the derived URL before accepting it as `Original`.
7. Fall back to the rendered article image when the source-size probe fails.

Required Weixin debug fields:

- container detection result
- rendered candidate preview
- derived original URL preview
- probe acceptance, verified dimensions, content type, and final accepted URL

#### Project Identity and File Naming

For standard short article URLs:

- URL pattern: `https://mp.weixin.qq.com/s/<projectid>`
- store `<projectid>` as `metadata.projectId`
- normalize the project URL to `https://mp.weixin.qq.com/s/<projectid>`
- downloaded image files use the existing project-id prefix rule:
  - `<projectid>_001.png`
  - `<projectid>_002.png`

### Xiaohongshu

#### Goal

Keep broad image extraction, but make `Original` labeling correspond to the note's actual content images.

#### Image Parsing

Prefer:

- note body images
- the leading image cluster in the note content

Keep available but de-prioritize for `Original` marking:

- avatars
- badges
- emoji
- logos
- tiny utility images

#### Original Selection

Chrome-plugin Xiaohongshu extraction should:

1. Keep the generic image extraction behavior so page coverage stays broad.
2. Build a Xiaohongshu-specific `Original` whitelist from the note's main content container.
3. Use the leading content-image cluster as the likely note media group.
4. Exclude profile-linked images and obvious utility assets from the Xiaohongshu `Original` set.
5. Use the whitelist only for `Original` labeling; do not hide other extracted images.

Current Xiaohongshu original-image finding:

1. Treat rendered `sns-webpic*.xhscdn.com` note images as the trusted boundary source.
2. For each trusted rendered note image, derive an enlarged candidate URL using the Eagle-style CDN rewrite:
   - source form: `https://sns-webpic-qc.xhscdn.com/{date}/{hash}/{path}/{file}!{display-transform}`
   - enlarged form: `https://sns-img-al.xhscdn.com/{path}/{file}`
3. Validate the enlarged URL before using it.
   - browser-decodable formats should load successfully as an image
   - `image/heic` and `image/heif` responses may be accepted from response headers even when the browser image decoder cannot preview them
4. Use the enlarged URL when validation succeeds, including accepted HEIC/HEIF source files; otherwise fall back to the rendered WebP display URL.
5. Carry probed width, height, and inferred format into the displayed result when available.
6. Infer the saved file extension from the validated image content type when available; if the URL has no extension, use the verified response format instead of defaulting to the display WebP assumption.
7. Run enlarged URL validation with bounded concurrency so large notes do not create an uncontrolled burst of image probes.
8. Keep HTML/script URL scanning as a debug probe only. Do not let broad HTML scans replace the note media set because they can include app JavaScript, static assets, avatars, comments, or unrelated page resources.

Eagle comparison findings:

- Eagle's Xiaohongshu site plugin mainly handles video metadata from `noteDetailMap`.
- Eagle's higher-resolution Xiaohongshu still image behavior comes from its generic URL enlarger, not from direct PNG/JPG URLs in page HTML.
- The relevant rule rewrites `sns-webpic-qc.xhscdn.com` display URLs to `sns-img-al.xhscdn.com` source-like URLs and strips the `!nd_*_webp_*` display transform.
- Eagle validates enlarged URLs before accepting them and can obtain real dimensions by loading the candidate image.
- MediaFetch should follow the same principle: derive from already-confirmed note images, validate the enlarged URL, then annotate debug with both the source URL and the accepted or rejected enlarged URL.

Required Xiaohongshu debug fields:

- rendered candidate preview with URL and rendered dimensions
- enlarged candidate preview with source URL, enlarged URL, validation result, dimensions, and content type when available
- HTML scan counts and previews for diagnosis only
- final accepted URL preview

#### Author Extraction

When Xiaohongshu author identity is needed for folder naming or `metadata.json`, use this priority:

1. current note author profile link inside the note page
2. profile-link candidates on the page with visible author text
3. page HTML fields such as `nickname`, `nick_name`, `display_name`, and stable `userId`
4. fallback title parsing only when the page does not expose a better author source

Rules:

- prefer the current note author's profile link over comment authors or recommendation users
- prefer candidates with visible author text over blank-text links
- reject self-entry text such as `我`
- Xiaohongshu `userId` may be alphanumeric, not digits-only
- HTML-extracted author fields should be treated as fallback because they may point to a non-owner user block

Validated note-page behavior:

- `PATAC DESIGN` can be recovered reliably from profile-link candidates on the note page
- the matching author profile id can be an alphanumeric value such as `657603f2000000002002e712`
- comment users and unrelated HTML user blocks must not outrank the note author's profile link

### Generic Portfolio or Article Sites

#### Goal

Use the main article or project title and favor large content images.

#### Title Parsing

Priority:

1. `og:title`
2. `article h1`
3. `document.title`

Cleanup rules:

- remove site suffix
- remove category suffixes if obviously appended
- keep the main project or article title

#### Image Parsing

Prefer:

- main article body images
- figure images
- hero image

De-prioritize:

- logos
- avatars
- ads
- footer thumbnails

## Selection Rules

### Card Selection

- clicking a card toggles selection
- selected state must be visually obvious
- cards must remain clickable without opening the image directly

### Batch Selection

The UI must provide:

- `Select All`
- `Clear Selection`
- `Select Original`

### Default Selection

Current default behavior:

- no images selected automatically after extraction

Optional future rule:

- allow domain-specific auto-selection of originals only

## Download Rules

### File Naming

Downloaded files should use sequential numbering by default:

- `001.jpg`
- `002.webp`
- `003.png`

### Folder Naming

Downloaded files should be placed under:

- local web: `downloadRoot/folderName`
- chrome plugin: browser default downloads directory + `folderName/`

### Download Behavior

- download only selected items
- show explicit error feedback on failure
- avoid silent failure
- keep folder creation implicit through download path

### Chrome Extension Folder Creation

Chrome extensions cannot directly create arbitrary folders with a mkdir API.

The reliable pattern, confirmed by inspecting the Imageye extension (`agionbommeaifngbhincahgmoflcikhm`), is:

1. Configure the target folder name before starting downloads.
2. Start downloads with a simple file name such as `001.jpg`.
3. Use a background service worker with `chrome.downloads.onDeterminingFilename`.
4. In `onDeterminingFilename`, call `suggest({ filename: "folderName/001.jpg" })`.

This pattern is preferable to trying to create a marker file or passing nested paths directly from the popup for every download.

Implementation notes:

- Keep folder name and file name sanitization separate.
- Folder names should replace illegal characters with `_`.
- File names should also replace illegal characters with `_`.
- Manual folder edits should override the auto-detected name only for the current popup session.
- Auto-detected names should repopulate when the popup is reopened on a different project or post.
- The popup should send the sanitized target folder to the background service worker before starting downloads.
- The popup should start each download with the plain sequential file name, for example `001.jpg`.
- The background service worker should synchronously call `suggest()` in `onDeterminingFilename`.
- If the background service worker is unavailable, the popup may fall back to direct nested filenames such as `folderName/001.jpg` instead of failing the whole download.
- Do not rely on a marker file to create the folder.
- Adding or changing a background service worker in `manifest.json` requires reloading the unpacked extension from `chrome://extensions`.
- If folder creation still appears to fail, check Chrome's download setting:
  - `Ask where to save each file before downloading` should be disabled.
- This setting is also called out by Imageye because it can prevent extension-suggested subfolders from being applied consistently.

### Chrome Extension Task Queue

Current Chrome-plugin behavior uses a serial download queue in the background service worker.

Rules:

1. popup downloads and context-menu downloads must enqueue into the same queue
2. only one download task may run at a time
3. later tasks must wait instead of overwriting shared download state
4. badge text may indicate running and queued task count

Reason:

- the current download pipeline still uses shared filename and metadata assignment state
- serializing tasks avoids cross-task folder, filename, metadata, and referer corruption

### Popup Debug Panel

Current popup behavior:

- debug panel is collapsed by default
- user may expand it on demand
- debug content generation remains unchanged

## Error Handling

The product should surface explicit errors for:

- unsupported tabs
- content-script injection failure
- empty extraction result
- invalid download path
- download permission failure
- blocked remote image URL

Error messages should be short and actionable.

## Implementation Guidance

### Parser Structure

Per-domain behavior should be implemented through a rule registry rather than scattered conditionals when the project grows.

Suggested structure:

```js
const DOMAIN_RULES = {
  "behance.net": behanceRules,
  "instagram.com": instagramRules,
  "weibo.com": weiboRules,
};
```

Each rule object should define:

- `match()`
- `inferProjectName()`
- `extractPreferredImages()`
- `scoreImage()`
- `normalizeFolderName()`

### Versioning

When a domain rule changes, update this document with:

- date
- affected domain
- reason for change
- behavior difference

## Change Log

### 2026-05-13

- initial execution standard created
- defined generic extraction and ranking rules
- defined initial domain rules for Behance, Instagram, and Weibo
- defined folder naming and download behavior targets
- recorded Instagram debug findings about `/user/p/postCode` vs `/p/postCode`
- recorded the rule that `maxImgIndex` must come from DOM evidence, not the current URL

### 2026-05-14

- recorded Instagram rendered multi-index sampling strategy
- recorded Imageye-inspired Chrome download folder strategy using background `downloads.onDeterminingFilename`
- verified Behance original-image extraction in Chrome plugin `contentBuildHash: 1104`
- Behance stable behavior:
  - extracts real high-resolution URLs exposed by Behance pages or scripts
  - avoids unreliable synthetic `max_3840` URL rewriting
  - preserves extraction when the source image is inherently small
  - displays inferred resolution from `srcset` descriptors when available
- added Chrome-plugin Weibo extraction rule for `contentBuildHash: 1105`
  - restricts Weibo originals to Sina image CDN files
  - rejects `.htm` and other non-image page URLs from Weibo candidates
  - upgrades known Sina thumbnail size folders to `large`
- refined Chrome-plugin Weibo extraction for `contentBuildHash: 1106`
  - uses Imageye-style rendered image collection on Weibo `layerid` pages
  - changes Weibo original-size normalization from `large` to `mw2000`
  - stops treating arbitrary Sina image URLs found in page HTML as post originals
- refined Chrome-plugin Weibo extraction for `contentBuildHash: 1107`
  - accepts `layerid` sampled URLs only when their stable image filename matches media already found in the current post DOM
  - prevents unrelated images rendered by the large-image layer from being merged into the post's Original set
- added Chrome-plugin Weibo download support
  - installs a dynamic request-header rule for Sina image CDN downloads with `Referer: https://weibo.com/`
  - preserves the plugin-requested sequential filenames when Sina returns an HTML anti-hotlink response filename such as `code.htm`
- refined Chrome-plugin Weibo download support
  - uses the current Weibo page URL as the Sina image request `Referer`
  - for Sina image URLs, fetches the image body first and then downloads a local blob URL instead of downloading the remote URL directly
  - avoids the browser saving anti-hotlink HTML responses such as `001.htm`

- updated Chrome-plugin content build to `contentBuildHash: 1108`
  - Weibo folder naming now uses `author_yymmddhhmm` with fallback to author, then status id
  - Xiaohongshu now keeps broad extraction but uses a note-content whitelist for `Original` labeling
- updated Chrome-plugin download metadata support and Xiaohongshu author extraction
  - each download folder now writes a `metadata.json` file with project facts and download facts
  - `metadata.json` excludes debug-only fields and other temporary extraction diagnostics
  - Xiaohongshu metadata now uses note-author identity instead of unrelated HTML user blocks
  - Xiaohongshu author extraction prefers current note profile links and supports alphanumeric author ids

### 2026-05-15 to 2026-05-18

- unified Chrome-plugin folder naming around `platform_username_yymmdd_title`
  - omitted missing segments instead of inserting placeholders
  - removed emoji during sanitization
  - Xiaohongshu folder prefix changed to `小红书`
- improved Instagram operational behavior
  - preserved username-backed navigable post paths for sampling
  - added support for right-click link-target downloads using a temporary target tab
  - kept current-tab sampling as the active implementation while documenting worker-tab as a possible future design
- added serial download task queue in the background service worker
  - popup downloads and context-menu downloads now share one queue
  - tasks execute one at a time to avoid filename, folder, metadata, and referer collisions
- updated popup behavior
  - debug panel now collapses by default
  - manual folder override no longer persists globally across unrelated projects
- refined Weibo naming and time extraction
  - folder naming now uses `weibo_username_yymmdd_hhmm`
  - time extraction now supports visible detail-page text such as `5-16 09:30`
  - fixed incorrect year fallback such as `010516_0930`
  - preserved safe Weibo downloads by fetching Sina image bodies before saving
- refined Behance original selection for long multi-image case studies
  - no longer restricts original candidates to the first leading cluster only
  - deduplicates same-image Behance CDN variants by media key
  - prefers the highest-ranked exposed variant such as `source` or `max_3840`
  - backfills DOM dimensions onto retained high-resolution variants when possible
- refined Behance author identity handling
  - Behance folder naming now uses the readable display author name as `username`
  - Behance metadata stores the stable profile slug as `authorId`

### 2026-05-22

- added Chrome-plugin Weixin extraction rule for `contentBuildHash: 1143`
  - probes article-body `mmbiz.qpic.cn` display URLs such as `/640?...` as `/0?wx_fmt=...&from=appmsg`
  - collects unloaded article images from DOM attributes and rendered article HTML so manual scrolling is not required
  - supports both `mmbiz_*` and `sz_mmbiz_*` Weixin CDN path families
  - uses the scanned candidate URL directly during probe so non-`img` attribute and HTML-scan candidates are not dropped
  - allows slower `/0` PNG probes and accepts verified image responses even when dimensions are unavailable before timeout
  - extracts `projectId` from standard `/s/<projectid>` article URLs for metadata and download filename prefixes
  - adds a body-level fallback scan when the best article container misses valid Weixin CDN images
  - bridges generic extracted `mmbiz.qpic.cn` images back into the Weixin `/0` validation path before final `Original` labeling
  - injects domain original URLs only after all rendered and bridge candidates are complete, so bridge-accepted URLs appear in final results
  - validates derived source-size URLs before marking them as `Original`
  - exposes dedicated `debug.weixin.original` probe details for diagnosis
- refined Weibo preview and resolution display for `contentBuildHash: 1145`
  - keeps Weibo card preview bound to the rendered thumbnail instead of replacing it with the final download URL
  - probes each Weibo card URL to backfill actual width and height in the plugin UI
  - keeps download behavior unchanged while fixing misleading preview-sized `resolution` values
- refined Weibo album extraction for `contentBuildHash: 1148`
  - detects album preview pages at `https://weibo.com/<uid>?tabtype=album&uid=<uid>&index=<num>`
  - opens the resolved `https://weibo.com/<uid>/<projectID>` page in a new visible tab and runs extraction there
  - preserves the album probe result in final debug so the redirect path stays visible
