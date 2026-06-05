# MediaFetch Chrome Plugin Media Layer Refactor Plan

## Purpose

This document defines the implementation rules for refactoring the Chrome plugin so that:

- image extraction remains stable
- video extraction is added without corrupting image behavior
- media types are separated at the code layer
- generic extraction still works when no special-domain rule exists
- future media types such as audio can be added with the same structure

This document replaces earlier looser guidance.

The main architectural rule is:

`Different media types must be separated in extraction, rule definition, debug, and strategy selection, and only merged at the final result layer.`

## Fixed Product Decisions

These decisions are already made and must not be revisited during implementation.

### First Video Version In Scope

- single-file video only
- extraction range:
  - images
  - videos
  - both
- generic video extraction fallback
- future support for special-domain video rules
- shared facts, naming, metadata framework, and download queue

### First Video Version Out of Scope

- HLS
- DASH
- live streams
- audio/video merge
- companion app support
- blob URL as final downloadable target
- video export to Eagle
- video export to Lineage

## Critical Clarification: Generic Extraction Must Always Exist

Yes: when no special-domain rule exists, the plugin must still use generic extraction.

The plugin must not become “rule-domain only”.

That means:

- image extraction must keep working on generic sites
- video extraction must have a generic fallback on generic sites
- special-domain rules are optional overrides, not mandatory gates

The correct resolution order is:

1. determine current media type
2. look for a special-domain rule for that media type
3. if found, use it
4. if not found, use the generic extractor for that media type

This is a hard requirement.

## High-Level Architecture

The codebase must move toward this structure logically, even if files are not physically split immediately:

```text
shared/
  facts
  naming
  metadata
  merge
  queue

media/
  image/
    generic
    domains
    debug
    strategy
  video/
    generic
    domains
    debug
    strategy
  audio/
    generic
    domains
    debug
    strategy
```

For the current task:

- `image` must be preserved and cleaned up
- `video` must be added
- `audio` is not implemented, but the architecture must leave a clear slot for it

## Core Design Rule

Do not design around a mixed extractor like:

```js
collectMedia({ mediaType })
```

Do not design domain rules like:

```js
rule.extract({ mediaType })
```

Instead, use explicit separation:

```js
extractSharedFacts()
extractImages()
extractVideos()
mergeMediaResults()
```

And explicit rule lookup:

```js
getImageDomainRule(host)
getVideoDomainRule(host)
```

This is the key decision that makes future audio support straightforward.

## Shared vs Separated Responsibilities

### Shared Responsibilities

These are allowed to be shared across all media types:

- project facts extraction
- normalized URL extraction
- folder name building
- metadata framework
- selection of extraction range
- final result merge
- final download queue
- popup-level state shell

### Media-Type-Specific Responsibilities

These must be separated by media type:

- candidate discovery
- domain rules
- ranking
- preferred/original semantics
- debug evidence
- download strategy selection
- preview-card rendering specifics

## Required Result Model

The internal implementation must keep per-media-type arrays separate.

Target merged result shape:

```js
{
  pageUrl,
  projectName,
  facts,
  metadata,
  images: [...],
  videos: [...],
  media: [...],
  debug: {
    image: {...},
    video: {...}
  }
}
```

### Meaning of Each Field

`images`
: canonical image result list

`videos`
: canonical video result list

`media`
: final merged list for popup rendering and shared download queue

Important rule:

- image logic should consume `images`
- video logic should consume `videos`
- only shared UI and queue layers should consume `media`

Do not make `media` the sole source of truth for image behavior.

That mistake is what caused the recent image breakage.

## Metadata Rules

Metadata must remain backward-compatible while becoming media-capable.

Required fields:

```json
{
  "imageCount": 12,
  "originalCount": 12,
  "videoCount": 3,
  "counts": {
    "images": 12,
    "videos": 3
  }
}
```

Rules:

- keep `imageCount`
- keep `originalCount` as image-specific
- add `videoCount`
- add `counts.images`
- add `counts.videos`

Do not redefine `originalCount` to include videos.

This preserves compatibility and keeps semantics clear.

## Extraction Range Rules

Allowed values:

- `images`
- `videos`
- `both`

Behavior:

- `images`: run shared facts + image extraction only
- `videos`: run shared facts + video extraction only
- `both`: run shared facts + both extractors

This is not a display-only filter.

The extraction range must change actual execution.

## Generic Extractor Rule

Each media type must have a generic extractor.

### Required Generic Extractors

- `extractGenericImages()`
- `extractGenericVideos()`

Future:

- `extractGenericAudio()`

### Rule Priority

For images:

```text
special image domain rule -> generic image extractor
```

For videos:

```text
special video domain rule -> generic video extractor
```

This means a domain may have:

- image rule only
- video rule only
- both
- neither

All four cases must work.

## Domain Rule Model

Domain rules must be split by media type.

Correct shape:

```js
const IMAGE_DOMAIN_RULES = {
  weibo: weiboImageRule,
  xiaohongshu: xiaohongshuImageRule,
};

const VIDEO_DOMAIN_RULES = {
  weibo: weiboVideoRule,
  xiaohongshu: xiaohongshuVideoRule,
};
```

Wrong shape:

```js
const DOMAIN_RULES = {
  weibo: {
    extract(mediaType) {}
  }
};
```

Reason:

- mixed domain rules will immediately accumulate `if (mediaType === ...)`
- this makes future audio support much worse

## Current Code Direction That Must Be Corrected

The current implementation work has already started mixing image and video too early in some places.

That must be corrected before further feature work.

### Specifically Avoid

- making image output depend on video refactor helpers
- using merged `media` as the only internal representation
- adding image strategy helpers indirectly through video migration
- forcing image and video through one shared extraction function with branching

## Required Logical Interfaces

These interfaces should exist logically even if the exact function names differ slightly.

### Shared Layer

- `extractSharedFacts()`
- `buildFolderNameFromFacts(facts)`
- `buildProjectMetadataFromFacts(facts, summary)`
- `mergeMediaResults({ images, videos })`
- `buildMergedDownloadSelection({ images, videos, media })`

### Image Layer

- `extractImagesForPage(context)`
- `extractGenericImages(context)`
- `getImageDomainRule(host)`
- `buildImageDebugInfo(result)`
- `selectImageDownloadStrategy(item)`

### Video Layer

- `extractVideosForPage(context)`
- `extractGenericVideos(context)`
- `getVideoDomainRule(host)`
- `buildVideoDebugInfo(result)`
- `selectVideoDownloadStrategy(item)`

### Future Audio Layer

- `extractAudioForPage(context)`
- `extractGenericAudio(context)`
- `getAudioDomainRule(host)`
- `buildAudioDebugInfo(result)`
- `selectAudioDownloadStrategy(item)`

## Video Scope Definition

The first video implementation supports only direct single-file video resources.

### Supported Candidate Sources

- `<video src>`
- `<video><source src>`
- common `data-*` direct video URLs
- metadata tags that point directly to a downloadable video file

### Supported URLs

A video URL is acceptable only if:

- it is `http` or `https`
- it is not `blob:`
- it is not `data:`
- it is not `.m3u8`
- it is not `.mpd`
- it appears to be a direct single-file media resource

### Unsupported URLs

Reject:

- `blob:...`
- `data:...`
- `.m3u8`
- `.mpd`
- obvious ad/tracker/decoration assets

## Required Implementation Strategy

Implement in phases. Do not skip the order.

### Phase 0: Restore Image Isolation

Goal:

- stop video migration from breaking images

Tasks:

1. Audit current changes that made image output depend on new video-adjacent logic.
2. Ensure image extraction remains fully functional even if video extraction is disabled or broken.
3. Ensure image-specific helpers live in the image path or shared-neutral layer, not in a video migration layer.
4. Keep `images` as a stable canonical output.

Acceptance:

- current image pages extract again
- image-only path works without touching video extraction

### Phase 1: Formalize Shared Facts and Summary Layer

Goal:

- keep shared logic explicitly media-neutral

Tasks:

1. Keep `collectProjectIdentityFacts()` or equivalent as the shared facts path.
2. Keep naming shared.
3. Update metadata builder so it accepts a summary object:
   - image count
   - original count
   - video count
4. Ensure no image- or video-specific DOM scraping lives inside metadata builders.

Acceptance:

- metadata is built from facts plus summary only
- facts do not depend on image/video extractors

### Phase 2: Separate Canonical Outputs

Goal:

- make `images` and `videos` distinct canonical outputs

Tasks:

1. Preserve current image extraction result shape as the canonical image output.
2. Add a separate canonical video output.
3. Add `mergeMediaResults({ images, videos })` for shared consumers only.
4. Ensure popup and queue may use `media`, but image-specific logic still uses `images`.

Acceptance:

- `images` and `videos` are both available
- merged `media` exists as a convenience layer only

### Phase 3: Add Extraction Range Execution

Goal:

- make runtime independence real

Tasks:

1. Add persisted extraction range setting:
   - `images`
   - `videos`
   - `both`
2. Pass the range into the extraction request.
3. Execute only the requested extractor(s).

Acceptance:

- `videos` mode does not run image extraction
- `images` mode does not run video extraction
- `both` runs both

### Phase 4: Add Generic Video Extractor

Goal:

- add broad fallback video support without special-domain rules

Tasks:

1. Implement `extractGenericVideos(context)`.
2. Deduplicate normalized video URLs.
3. Capture poster, duration, width, height when available.
4. Build video items separate from image items.
5. Keep debug under a video-specific section.

Acceptance:

- standard HTML5 pages can produce video results
- generic sites without special-domain rules still work

### Phase 5: Keep Domain Rules Separate

Goal:

- prepare for special video rules without mixing them into image rules

Tasks:

1. Refactor platform dispatch so it can locate image and video rules independently.
2. Keep the current image rules in the image path.
3. Add empty or placeholder video rule slots where needed.
4. Use generic video extraction when no video rule exists.

Acceptance:

- a host may have image rule only
- a host may have video rule only
- generic fallback still works

### Phase 6: Adjust Popup State Without Making It Mixed-Rule Driven

Goal:

- support images, videos, and both in UI

Tasks:

1. Keep separate internal state access for:
   - images
   - videos
   - merged media
2. Add range selector.
3. Render images and videos through separate branches.
4. `Select Original` remains image-only.
5. Status text becomes media-neutral.

Acceptance:

- image rendering still works
- video rendering works
- UI state does not assume only images

### Phase 7: Extend Shared Download Queue Safely

Goal:

- let shared queue consume merged results without collapsing media-type boundaries

Tasks:

1. Keep image download path stable.
2. Add video download path for direct single-file videos.
3. Use shared queue only after per-media-type items are fully prepared.
4. Keep Eagle and Lineage image-only.

Acceptance:

- image downloads unchanged
- video downloads work through the queue
- no video code enters Eagle/Lineage paths

## File-Level Guidance

### `chrome-plugin/content.js`

Must do:

- keep shared facts extraction
- keep image extraction stable
- add separate video extractor
- add generic video fallback
- return `images`, `videos`, and merged `media`

Must not do:

- replace image canonical output with merged media only
- create mixed image/video domain rule functions
- add HLS or DASH logic

### `chrome-plugin/popup.js`

Must do:

- add extraction range selection
- keep image and video result access logically separate
- use merged media only for final rendering convenience

Must not do:

- force all selection logic to treat image/video exactly the same
- make `Select Original` apply to video

### `chrome-plugin/background.js`

Must do:

- keep image queue path stable
- add video queue support for direct single-file assets
- keep integrations image-only

Must not do:

- add stream-processing logic
- add video export logic for Eagle/Lineage

## Suggested Naming

Use clear names.

Recommended:

- `extractImagesFromPage()`
- `extractVideosFromPage()`
- `extractGenericVideos()`
- `getImageDomainRule()`
- `getVideoDomainRule()`
- `mergeMediaResults()`
- `countExtractedMedia()`

Avoid vague mixed names such as:

- `collectMedia()`
- `extractByType()`
- `domainRule.extract(mediaType)`

## Generic Video Heuristics

### Positive Signals

- `.mp4`
- `.webm`
- `.mov`
- `.m4v`
- visible video element
- known video dimensions
- known duration

### Negative Signals

- `blob:`
- `data:`
- `.m3u8`
- `.mpd`
- tiny decorative videos
- obvious ad/tracker URLs

## Future Audio Compatibility Rules

The current refactor must keep future audio support easy.

To preserve that:

1. never make shared layer image- or video-specific
2. never define domain rules with `if (mediaType === ...)`
3. never make merged `media` the only canonical source
4. keep counts extensible
5. treat “preferred/original/best quality” as media-type-specific semantics

If this is done correctly, future audio work should mostly require:

- `audio` generic extractor
- `audio` domain rules
- `audioCount`
- audio card rendering
- audio-specific download strategy selection

without rewriting the architecture.

## Verification

At minimum run:

```powershell
node --check chrome-plugin\content.js
node --check chrome-plugin\popup.js
node --check chrome-plugin\background.js
git diff --check
```

Test at least:

- image-only domain with current rules
- generic site with images
- generic site with direct HTML5 video
- mixed page with both image and video
- `images` extraction range
- `videos` extraction range
- `both` extraction range

## Rules for the Implementing Agent

The implementing agent must follow these rules strictly:

1. Do not redesign the plugin.
2. Do not remove current image behavior first and “rebuild it later”.
3. Do not introduce media-type branching inside one domain rule.
4. Do not add HLS/DASH workarounds.
5. Do not make special-domain rules mandatory for generic extraction.
6. Do not change Eagle/Lineage beyond preserving image-only behavior.
7. Do not use merged `media` as the only internal truth for images.
8. Complete and verify one phase before moving to the next.

## Final Acceptance Conditions

This task is complete only when all are true:

1. Generic extraction still works when no special-domain rule exists.
2. Image logic and video logic are separated at code level.
3. Images remain stable when video logic is changed.
4. `images`, `videos`, and merged `media` are all available.
5. Extraction range changes actual execution.
6. Generic direct single-file videos can be extracted.
7. Metadata includes `videoCount` and `counts`.
8. Eagle and Lineage remain image-only.
9. The architecture is ready for a future `audio` layer without mixed media-type rule branching.

## Implementation Notes

### 2026-06-04 Boundary Cleanup Status

Completed:

- `extractGenericImages(...)` is now a real generic image fallback and no longer calls `collectPlatformMedia(...)`.
- image platform-aware extraction was split into a separate path so supported image hosts can still use domain/platform augmentation.
- popup merged media assembly now uses an explicit helper instead of ad hoc array concatenation.

Residual risk:

- `extractDomainImages(...)` and `extractGenericImages(...)` now contain some intentional duplication.
- This duplication is acceptable for now because it preserves a clean boundary between generic image logic and platform-aware image logic.
- Do not ask a low-capability agent to “deduplicate” these paths unless the boundary rules are explicitly restated first.
- Premature deduplication here is likely to re-mix generic and platform-specific image behavior.

Recommended next step:

- Do not spend the next pass on cleanup-only refactors.
- The next product-facing step should be the first real video special-domain rule.
- The first selected site is `xiaohongshu`.
