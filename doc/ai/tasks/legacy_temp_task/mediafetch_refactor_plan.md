# MediaFetch Refactor Plan

## Purpose

MediaFetch has grown through platform-specific fixes for Instagram, Behance, Xiaohongshu, Weibo, and generic web pages. The current implementation works in many cases, but the code is highly coupled. Small changes in one platform often affect folder naming, metadata, downloads, or debug output for another platform.

This document defines a conservative refactor plan. The goal is not a rewrite. The goal is to introduce clearer boundaries so new platforms and global rule changes can be added with lower regression risk.

## Current Structural Problems

### 1. `content.js` Has Too Many Responsibilities

`chrome-plugin/content.js` currently handles:

- DOM image discovery
- Platform-specific original image detection
- Platform-specific author, title, project ID, and date extraction
- Folder name field derivation
- Metadata field derivation
- Debug and probe output
- Platform title cleanup
- Media URL normalization and deduplication

This means a local rule change, such as Xiaohongshu title cleanup, can affect folder naming, metadata, debug probes, and platform extraction behavior.

### 2. Platform Facts and Global Naming Are Coupled

Platform-specific values such as `username`, `title`, `publishedDateCode`, and `projectId` are currently inferred inside the same code path that builds folder names and metadata.

That creates unclear ownership:

- Platform logic decides what a field means.
- Global naming logic assumes the field is already safe and semantically correct.
- Metadata reuses the same fields without a strict schema.

For example, Behance needs a human-readable author name for folder names, but a stable profile slug for `authorId`. Instagram uses a handle. Xiaohongshu uses display nickname and a separate user ID. These are not identical concepts, but they are often routed through one generic `username` field too early.

### 3. Download Strategy Is Absorbing Platform Fixes

`chrome-plugin/background.js` currently handles:

- Serial task queue
- Chrome download filename assignment
- Metadata download routing
- Weibo `fetch` before download
- Xiaohongshu CDN `fetch` before download
- Right-click page and link download flows

The download layer is no longer purely platform-agnostic. That is acceptable, but it needs a strategy boundary. Otherwise every new platform-specific response issue becomes another global `if`.

### 4. Debug Probes Share Too Much With Business Logic

Debug probes for Instagram, Behance, Xiaohongshu, and Weibo are useful, but they currently share many helpers with official extraction logic.

That creates two risks:

- Probe changes can accidentally alter formal behavior.
- Formal behavior changes can make probes misleading or stale.

Debug should observe or summarize extraction decisions. It should not become a second unofficial extraction path unless explicitly marked as such.

### 5. Text Constants and Encoding Are Fragile

Platform-specific Chinese literals such as Xiaohongshu display names, suffix patterns, and self-user labels have appeared directly in regular expressions and conditions. If a file edit corrupts encoding, strings can become invalid values such as `???` or mojibake, causing:

- Broken regex syntax
- Failed title cleanup
- Incorrect author filtering
- Folder suffix leakage

Critical non-ASCII text rules should be centralized and written with Unicode escapes where they affect logic.

## Target Architecture

The target structure is a layered pipeline:

```text
Page DOM / URL
  -> Platform Extractor
  -> Normalized Extraction Result
  -> Naming / Metadata Builder
  -> Download Task Builder
  -> Download Strategy Executor
  -> Debug View
```

The key change is data ownership. Platform code extracts facts and media. Global code names, stores, and downloads.

## Core Data Model

Each platform should eventually produce a normalized result:

```js
{
  platform: "behance",
  facts: {
    projectUrl: "...",
    normalizedUrl: "...",
    projectId: "240384273",
    title: "NASA LEVION",
    displayAuthor: "hyunbeen Kye",
    authorId: "hb_kyea396",
    publishedAt: "",
    publishedDateCode: "250123",
    publishedTimeCode: ""
  },
  media: {
    originalUrls: [],
    originalMediaKeys: []
  },
  debug: {
    probes: {},
    extractionSummary: {}
  }
}
```

### Field Semantics

`platform`
: Stable platform key, such as `instagram`, `behance`, `xiaohongshu`, `weibo`, or `web`.

`projectUrl`
: Current source URL.

`normalizedUrl`
: Canonical project URL after removing noise and normalizing platform-specific variants.

`projectId`
: Stable platform project/post/note/status ID when available.

`title`
: Human-readable project or post title. It should not include site suffixes or duplicated author names.

`displayAuthor`
: Human-readable author name used for folder naming when appropriate.

`authorId`
: Stable author handle, slug, or ID. This is primarily for metadata and future dedupe.

`publishedAt`
: Source publication timestamp if available.

`publishedDateCode`
: Date code derived from `publishedAt` or trusted platform text.

`publishedTimeCode`
: Time code when the platform naming rule needs it, currently mainly Weibo.

`originalUrls`
: Final original media URL whitelist.

`originalMediaKeys`
: Optional media keys used to dedupe variants.

## Platform Layer

Each platform should have one clear extraction entry point:

```js
extractInstagram()
extractBehance()
extractXiaohongshu()
extractWeibo()
extractGenericWeb()
```

Each extractor should own platform-specific facts and media discovery only.

Allowed responsibilities:

- Find platform project/post/note ID.
- Find display author and stable author ID.
- Find title and publication time.
- Find original media URL candidates.
- Normalize media variants for that platform.
- Produce platform-specific debug details.

Disallowed responsibilities:

- Build folder names.
- Build final metadata JSON.
- Start downloads.
- Mutate popup UI assumptions.
- Decide global field separators.

## Naming Layer

Folder naming should be centralized in one builder:

```js
buildFolderName(extractionResult)
```

Default rule:

```text
platform_displayAuthor_publishedDateCode_title
```

Weibo rule:

```text
weibo_displayAuthor_publishedDateCode_publishedTimeCode
```

Segment rules:

- Use `_` only between top-level content segments.
- Use `-` inside a segment.
- Remove emoji.
- Replace illegal filesystem characters with `-`.
- Collapse duplicate separators.
- Omit missing segments.

Examples:

```text
behance_hyunbeen-Kye_250123_NASA-LEVION
instagram_gacdesign_260515_happy-new-year
weibo_author-name_260516_0930
小红书_汽车设计_2026款-Vision-BMW-Alpina-官方图片
```

Note: Xiaohongshu folder prefix may remain display text, but the platform key in metadata should remain `xiaohongshu`.

## Metadata Layer

Metadata should be built by one function:

```js
buildMetadata(extractionResult, downloadSummary)
```

It should not query DOM directly.

Recommended fields:

```json
{
  "platform": "behance",
  "domain": "www.behance.net",
  "projectUrl": "...",
  "normalizedUrl": "...",
  "projectName": "...",
  "title": "NASA LEVION",
  "username": "hyunbeen Kye",
  "authorId": "hb_kyea396",
  "projectId": "240384273",
  "publishedAt": "",
  "publishedDateCode": "250123",
  "publishedTimeCode": "",
  "downloadedAt": "...",
  "imageCount": 30,
  "originalCount": 30,
  "pluginVersion": "0.1.4"
}
```

For backward compatibility, metadata can keep `username`, but internally the normalized facts should prefer `displayAuthor`.

## Download Layer

Download code should operate on prepared tasks:

```js
{
  folderName: "...",
  metadata: {...},
  files: [
    { url: "...", filename: "001.jpg", strategy: "direct" }
  ]
}
```

Download strategy should be explicit:

```js
const DOWNLOAD_STRATEGIES = {
  direct: downloadDirect,
  fetchImage: downloadFetchedImage
};
```

Strategy selection can start simple:

```js
selectDownloadStrategy({ platform, url }) {
  if (platform === "weibo") return "fetchImage";
  if (platform === "xiaohongshu") return "fetchImage";
  return "direct";
}
```

This keeps site-specific network behavior inside one selector instead of spreading CDN checks through the download flow.

## Debug Layer

Debug should be generated from extraction result and platform-specific probe summaries:

```js
buildDebugInfo(extractionResult)
```

Rules:

- Debug may include probes, candidate counts, sample indexes, and rejected URLs.
- Debug should not be required to build folder names.
- Debug should not be required to build metadata.
- Debug-only extraction should be marked clearly when it does not drive final media selection.

## Migration Plan

### Phase 0: Stabilize Current Behavior

Goal: avoid refactoring on top of known broken behavior.

Tasks:

- Keep current fixes for Xiaohongshu `fetch` download.
- Keep Unicode-escaped Xiaohongshu constants.
- Keep Behance media dedupe and author naming fixes.
- Keep folder segment separator rule.
- Ensure `node --check` passes for `content.js`, `popup.js`, and `background.js`.

Acceptance:

- Existing supported platforms still extract originals.
- Folder names still use `_` between fields and `-` inside fields.
- Xiaohongshu does not download images as `.txt`.

### Phase 1: Introduce Normalized Facts Without Moving Files

Goal: create the data boundary before physical file splitting.

Tasks:

- Add a normalized facts object shape.
- Convert `collectProjectIdentityFacts()` to return normalized fields:
  - `displayAuthor`
  - `authorId`
  - `projectId`
  - `title`
  - `publishedAt`
  - `publishedDateCode`
  - `publishedTimeCode`
- Keep backward compatibility by mapping `displayAuthor` to metadata `username`.

Acceptance:

- `inferProjectName()` does not query DOM directly.
- `buildProjectMetadata()` does not query DOM directly.
- Platform-specific author/title logic stays inside platform fact helpers.

### Phase 2: Centralize Naming and Metadata

Goal: make global naming changes one-place changes.

Tasks:

- Implement `buildFolderName(facts)`.
- Implement `buildProjectMetadataFromFacts(facts, context)`.
- Make popup and background use the same sanitized folder path rules.
- Keep manual folder override behavior unchanged.

Acceptance:

- Changing segment separator logic requires one naming-layer change.
- Metadata field additions do not require platform extractor edits unless a new fact is needed.

### Phase 3: Centralize Media Output

Goal: make original marking consume platform media uniformly.

Tasks:

- Give each platform a single original URL set output.
- Keep media-key dedupe platform-specific but expose final `originalUrls`.
- Make `detectOriginal()` consume `originalUrls` and optional `originalMediaKeys`.

Acceptance:

- Behance, Instagram, Weibo, and Xiaohongshu original marking all flow through the same final interface.
- Platform-specific URL variant ranking remains inside platform helpers.

### Phase 4: Download Strategy Table

Goal: reduce platform patches in `background.js`.

Tasks:

- Add `selectDownloadStrategy({ platform, url })`.
- Route Weibo and Xiaohongshu through `fetchImage`.
- Keep metadata sentinel logic separate from image strategies.
- Keep serial queue unchanged.

Acceptance:

- Adding another platform that needs `fetch` only changes the strategy selector.
- File naming and metadata placement are not affected by platform network rules.

### Phase 5: Optional Physical Module Split

Only after behavior is stable:

```text
chrome-plugin/
  content.js
  platform-instagram.js
  platform-behance.js
  platform-xiaohongshu.js
  platform-weibo.js
  naming.js
  media.js
```

This phase should be optional. Logical boundaries matter more than file count.

## Regression Controls

Before each phase:

- Run `node --check` on changed JavaScript files.
- Run `git diff --check`.
- Test one known page per platform.

Recommended smoke cases:

- Instagram carousel with short `/p/<code>` URL.
- Instagram single-image post.
- Behance long project with around 35 originals.
- Behance author/title case such as `NASA LEVION`.
- Xiaohongshu note with author candidate from `pc_note`.
- Xiaohongshu image download from `xhscdn.com`.
- Weibo detail page with `5-16 09:30` style time.
- Weibo image download from `sinaimg.cn`.

## Rollback Strategy

Each phase should be committed separately.

Rollback should be possible at phase boundaries:

- If naming breaks, revert Phase 2 only.
- If original marking breaks, revert Phase 3 only.
- If downloads break, revert Phase 4 only.

Avoid mixing platform behavior changes with refactor-only changes in the same commit unless the behavior change is required to preserve current output.

## Immediate Recommendation

Do not start with physical file splitting.

Start with:

1. Stabilize current fixes.
2. Introduce normalized facts in `content.js`.
3. Move folderName and metadata builders to consume normalized facts only.

This gives the largest stability improvement with the smallest blast radius.

## Implementation Log

### Boundary Cleanup Pass

Status: started.

Implemented boundary:

- Removed the unused `getDomainOriginalUrlSet()` compatibility wrapper after confirming no remaining callers.
- Added short boundary comments for folder naming, metadata construction, normalized facts, platform media collection, and download strategy selection.

Intentionally not changed:

- No behavior changes to extraction, naming, metadata, debug output, or downloads.

### Phase 2 Facts Reuse Pass

Status: started.

Implemented boundary:

- The main extraction response now calls `collectProjectIdentityFacts()` once.
- `projectName` and `metadata` are derived from the same normalized facts object.

Intentionally not changed:

- Existing `inferProjectName()` and `buildProjectMetadata()` helper entry points remain available.
- No folder naming, metadata field, or platform extraction behavior changed.

### Phase 1 Initial Pass

Status: started.

Implemented boundary:

- Added normalized project facts helpers in `content.js`.
- Introduced `displayAuthor` as the internal author field.
- Kept `username` as a backward-compatible alias for metadata and existing UI expectations.
- Routed folder name generation through `buildFolderNameFromFacts(facts)`.
- Routed metadata generation through `buildProjectMetadataFromFacts(facts)`.
- Kept platform-specific extraction helpers in place.
- Split platform fact filling into `extractInstagramFacts`, `extractBehanceFacts`, `extractXiaohongshuFacts`, and `extractWeiboFacts`.
- Reduced `collectProjectIdentityFacts` to platform dispatch plus normalization.

Intentionally not changed:

- No physical file split.
- No original media extraction behavior change.
- No Instagram sampling behavior change.
- No background download queue behavior change.
- No popup UI behavior change.

### Phase 3 Initial Pass

Status: started.

Implemented boundary:

- Added `collectPlatformMedia(maxIndexHint)`.
- Added `createEmptyPlatformMedia()`.
- Routed `extractImagesFromPage()` through the unified media result shape.
- Kept `getDomainOriginalUrlSet()` as a compatibility wrapper.

Intentionally not changed:

- No platform original selection rules changed.
- No media-key ranking rules changed.
- Existing `lastXxxOriginalDebug` state remains in place for now.
- Existing Instagram original media-key handling remains in place.

### Phase 3 Debug Pass

Status: started.

Implemented boundary:

- `extractImagesFromPage()` now passes `platformMedia` to `buildDebugInfo()`.
- `collectPlatformMedia()` stores original debug snapshots under `media.debug.original`.
- `buildDebugInfo()` keeps the existing external debug JSON shape while preferring `platformMedia.debug`.
- `whitelistMediaKeyCount` now reads from `platformMedia.originalMediaKeys` with the old Instagram global as fallback.
- Instagram and Weibo external sampling debug now also attach to `platformMedia.debug.externalSampling`.
- Removed the Instagram and Weibo external sampling debug globals after confirming the public debug output can read from `platformMedia.debug.externalSampling`.
- Audited remaining `lastXxx` globals. They still act as write-through state for existing platform original/sampling helpers or Instagram media-key original detection.
- Converted Behance original collection to return a structured media result directly through `collectBehanceOriginalMedia()`.
- Removed the Behance original debug global.
- Converted Xiaohongshu original collection to return a structured media result directly through `collectXiaohongshuOriginalMedia()`.
- Removed the Xiaohongshu original debug global.
- Converted Weibo original collection to return a structured media result directly through `collectWeiboOriginalMedia()`.
- Removed the Weibo original debug global.
- Converted Instagram original collection to return a structured media result directly through `collectInstagramOriginalMedia()`.
- Moved Instagram sampling debug and original media keys into the platform media result.
- Removed the remaining `lastXxx` content-script globals.

Intentionally not changed:

- Existing public debug field names remain unchanged.
- Instagram sampling behavior and media-key original detection are unchanged.
- Platform original extraction rules remain unchanged.

### Phase 4 Initial Pass

Status: started.

Implemented boundary:

- Added explicit download strategy constants in `background.js`.
- Added `DOWNLOAD_STRATEGY_RULES`.
- Added `selectDownloadStrategy(item, context)`.
- Added `executeDownloadStrategy(item, filename, context)`.
- Routed `downloadImageBatch()` through the strategy executor.
- Removed the transitional `shouldFetchBeforeDownload()` helper so callers use the strategy selector.

Intentionally not changed:

- Existing strategy decision remains URL-based, but the URL checks now live in a rule table.
- Weibo and Xiaohongshu CDN images still use the existing fetch-before-download path.
- Metadata sentinel download behavior is unchanged.
- Serial task queue behavior is unchanged.

### Phase 3.5 Proposed: Lightweight Platform Registry

Status: started.

Purpose:

- Centralize platform dispatch without physically splitting files.
- Make new platform support require fewer entry-point edits.
- Keep the current facts/media/debug/download boundaries intact.

Scope:

- Platform identification.
- Folder platform display name.
- Facts extractor selection.
- Media collector selection.

Non-goals:

- Do not move code into separate files yet.
- Do not change original extraction rules.
- Do not change Instagram sampling behavior.
- Do not move popup/background sampling orchestration.
- Do not move download strategy into the content registry.
- Do not rewrite debug builders into platform adapters yet.

Proposed shape:

```js
const PLATFORM_REGISTRY = [
  {
    id: "instagram",
    folderPlatform: "instagram",
    match: isInstagramHost,
    extractFacts: extractInstagramFacts,
    collectMedia: collectInstagramOriginalMedia,
  },
  {
    id: "behance",
    folderPlatform: "behance",
    match: isBehanceHost,
    extractFacts: extractBehanceFacts,
    collectMedia: collectBehanceOriginalMedia,
  },
  {
    id: "xiaohongshu",
    folderPlatform: XIAOHONGSHU_DISPLAY_NAME,
    match: isXiaohongshuHost,
    extractFacts: extractXiaohongshuFacts,
    collectMedia: collectXiaohongshuOriginalMedia,
  },
  {
    id: "weibo",
    folderPlatform: "weibo",
    match: isWeiboHost,
    extractFacts: extractWeiboFacts,
    collectMedia: collectWeiboOriginalMedia,
  },
];
```

Required helper:

```js
function getCurrentPlatformAdapter() {
  return PLATFORM_REGISTRY.find((platform) => platform.match()) || null;
}
```

Migration steps:

1. Add host helpers:
   - `isInstagramHost()`
   - `isBehanceHost()`
   - `isWeiboHost()`
   - existing `isXiaohongshuHost()`

2. Add `PLATFORM_REGISTRY`.

3. Update `inferPlatformName()`:
   - read `adapter.id`
   - fallback to current hostname behavior

4. Update `inferFolderPlatformName()`:
   - read `adapter.folderPlatform`
   - fallback to `inferPlatformName()`

5. Update `collectProjectIdentityFacts()`:
   - call `adapter.extractFacts(baseFacts)` when available
   - fallback to `normalizeProjectFacts(baseFacts)`

6. Update `collectPlatformMedia()`:
   - call `adapter.collectMedia(maxIndexHint)` when available
   - fallback to empty media result

Expected benefits:

- New platforms start by adding one registry entry plus platform-specific helper functions.
- Existing global naming and metadata builders remain unchanged.
- Platform dispatch is less scattered across `content.js`.
- This creates a safer stepping stone before any Phase 5 file split.

Risks:

- Adapter functions need consistent signatures.
- Instagram media collection needs `maxIndexHint`, while most platforms ignore it.
- Host helper changes must preserve exact current matching behavior.

Rollback:

- The registry migration should be one commit.
- If dispatch breaks, revert that commit and the platform helper functions remain usable through the old direct calls.

Implementation notes:

- Added `PLATFORM_REGISTRY` in `content.js`.
- Added `getCurrentPlatformAdapter()`.
- Added `isInstagramHost()`, `isBehanceHost()`, and `isWeiboHost()`.
- Updated `inferPlatformName()` and `inferFolderPlatformName()` to read from the current adapter.
- Updated `collectProjectIdentityFacts()` to dispatch through `adapter.extractFacts`.
- Updated `collectPlatformMedia()` to dispatch through `adapter.collectMedia`.
- Kept debug building, download strategy, popup/background orchestration, and physical file layout unchanged.

## Xiaohongshu Original URL Follow-Up

Status: in progress.

Observed issue:

- DOM extraction finds the note images, but many URLs are rendered WebP display variants such as `sns-webpic-qc.xhscdn.com/...!nd_dft_*_webp_3`.
- Removing the `!nd_*` transform from the same host can return `403`, so naked display-host URLs are not reliable.
- Broad HTML/script scanning can find many `xhscdn.com` URLs but can also match app JavaScript, static resources, avatars, comments, and unrelated assets.
- Eagle can obtain larger Xiaohongshu images for the same note, with real dimensions visible after loading.

Eagle-derived finding:

- Eagle's Xiaohongshu plugin mainly handles video extraction from `noteDetailMap`.
- Still-image enlargement is handled by Eagle's generic URL enlarger.
- The relevant rule rewrites a trusted rendered display URL:

```text
https://sns-webpic-qc.xhscdn.com/{date}/{hash}/{path}/{file}!{display-transform}
```

to:

```text
https://sns-img-al.xhscdn.com/{path}/{file}
```

- Eagle validates the enlarged candidate before using it.

MediaFetch implementation direction:

1. Use the current note's rendered image cluster as the trusted boundary.
2. For each trusted rendered `sns-webpic*.xhscdn.com` URL, generate the `sns-img-al.xhscdn.com` enlarged candidate.
3. Load-probe the enlarged candidate before accepting it.
4. Use accepted enlarged candidates as the Xiaohongshu `Original` whitelist.
5. Fall back per image to the rendered WebP URL if enlargement fails.
6. Keep HTML/script scanning as debug evidence only, not as the source of final originals.
7. Include debug fields for source URL, enlarged URL, accepted state, dimensions, and content type when available.
8. Limit enlarged URL probe concurrency to keep large notes responsive and avoid bursty network behavior.
9. Prefer probed `Content-Type` for file format/extension inference when the enlarged URL has no filename extension.

Architectural note:

- This belongs in the platform media layer, not the generic download layer.
- The download layer should continue to handle fetch/direct transport decisions, but it should not know how to rewrite Xiaohongshu image URLs.
