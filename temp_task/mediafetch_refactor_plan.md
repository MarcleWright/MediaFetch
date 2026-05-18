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

Intentionally not changed:

- Existing public debug field names remain unchanged.
- External sampling globals remain as fallback for now.
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
