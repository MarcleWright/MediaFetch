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

1. `meta[property="og:title"]`
2. `document.title`
3. visible page title or project heading

Cleanup rules:

- remove `| Behance`
- remove `- Behance`
- remove trailing `Adobe`
- keep the project title itself
- do not use the author name alone as folder name unless the project title is missing

Expected output examples:

- `Future Sedan Concept`
- `Brand Campaign 2026`

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

1. largest `srcset` candidate
2. largest width/height variant
3. URL variant containing original-size keywords

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

Priority:

1. post author + concise post descriptor
2. `og:title`
3. `document.title`

Cleanup rules:

- remove `- 微博`
- remove site suffix noise
- avoid entire post body if it is extremely long
- cap final result to 64 characters

Expected output examples:

- `username - poster series`
- `brandname - event campaign`

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
- The popup may persist a manually edited folder name in `chrome.storage.local`.
- Once a user manually edits the folder name, auto-detected names must not overwrite it.
- The popup should send the sanitized target folder to the background service worker before starting downloads.
- The popup should start each download with the plain sequential file name, for example `001.jpg`.
- The background service worker should synchronously call `suggest()` in `onDeterminingFilename`.
- If the background service worker is unavailable, the popup may fall back to direct nested filenames such as `folderName/001.jpg` instead of failing the whole download.
- Do not rely on a marker file to create the folder.
- Adding or changing a background service worker in `manifest.json` requires reloading the unpacked extension from `chrome://extensions`.
- If folder creation still appears to fail, check Chrome's download setting:
  - `Ask where to save each file before downloading` should be disabled.
- This setting is also called out by Imageye because it can prevent extension-suggested subfolders from being applied consistently.

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
