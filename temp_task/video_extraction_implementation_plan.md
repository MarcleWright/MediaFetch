# MediaFetch Chrome Plugin Video Extraction Implementation Plan

## Purpose

This document defines the implementation plan for adding video extraction to the Chrome plugin in a way that is:

- parallel to the existing image flow
- independently switchable at runtime
- globally useful before site-specific rules are added
- safe for incremental implementation by a lower-capability agent

This is an implementation document, not a brainstorming note.

The goal is to make the first video version work without destabilizing the current image pipeline.

## Final Scope Decisions

These decisions are fixed for this implementation pass.

### In Scope

- single-file video extraction only
- extraction-range toggle:
  - images only
  - videos only
  - both
- runtime independence between image and video extraction
- shared project facts and folder naming
- shared download queue
- global video extraction fallback for many sites
- special per-domain video rules can be added later

### Out of Scope

- HLS
- DASH
- live streams
- audio/video merge
- companion app integration
- Eagle video export
- Lineage video export
- blob URL as final downloadable target
- video transcoding

## Key Product Rules

### Rule 1: Images and Videos Must Be Independently Runnable

The user must be able to choose:

- only image extraction
- only video extraction
- both

This must affect actual extraction behavior, not just UI filtering.

If the user chooses `videos only`, image extraction code should not run unless a shared platform context step is explicitly required.

### Rule 2: Shared Facts, Separate Media Pipelines

Project facts are shared:

- platform
- domain
- project URL
- normalized URL
- title
- author
- project ID
- publish time
- folder name

Media extraction is separate:

- image extraction does not depend on video extraction
- video extraction does not depend on image extraction

### Rule 3: First Version Uses Global Video Rules First

The first version must provide a global video extraction fallback that works on many sites by scanning common HTML patterns.

After that is stable, special domain video rules can be added.

### Rule 4: Existing Image Behavior Must Not Regress

The current image extraction behavior is the baseline.

No video work should:

- change current image ranking
- change current image download naming
- change current image external integrations
- change current image special-domain behavior

## Current Code Reality

The current plugin is image-centric.

Important files:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js)
- [chrome-plugin/popup.html](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.html)
- [chrome-plugin/README.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/README.md)

Image-centric assumptions currently exist in:

- extraction response shape returning `images`
- popup state using `state.images`
- image-only status text
- image-only download flow
- image-only selection helpers like `Select Original`
- image-only metadata counts such as `imageCount` and `originalCount`

## Target Architecture

The architecture for this phase is:

```text
Page DOM / URL
  -> Shared Facts Extraction
  -> Extraction Range Decision
  -> Platform Context Sampling (optional)
  -> Image Extraction
  -> Video Extraction
  -> Unified Media Result
  -> Popup Selection / Download
  -> Shared Download Queue
```

Important constraint:

- images and videos are separate media pipelines
- but they are returned in one unified result structure

## Target Data Model

### Content Script Response

The content script must stop returning an image-only payload.

Target shape:

```js
{
  ok: true,
  pageUrl: "https://example.com/post/123",
  projectName: "instagram_author_260601_title",
  metadata: {
    platform: "instagram",
    domain: "www.instagram.com",
    projectUrl: "...",
    normalizedUrl: "...",
    projectName: "...",
    title: "...",
    username: "...",
    authorId: "...",
    projectId: "...",
    publishedAt: "...",
    publishedDateCode: "260601",
    publishedTimeCode: "",
    imageCount: 4,
    originalCount: 4,
    videoCount: 1,
    counts: {
      images: 4,
      videos: 1
    }
  },
  media: [
    {
      id: "image:1",
      mediaType: "image",
      url: "https://...",
      thumbnail: "https://...",
      previewUrl: "https://...",
      posterUrl: "",
      format: "JPEG",
      resolution: "1440 x 1800",
      size: "Unknown",
      width: 1440,
      height: 1800,
      duration: 0,
      isOriginal: true,
      selected: false,
      download: {
        strategy: "fetchBlob"
      }
    },
    {
      id: "video:1",
      mediaType: "video",
      url: "https://...",
      thumbnail: "",
      previewUrl: "https://...",
      posterUrl: "https://...",
      format: "MP4",
      resolution: "1920 x 1080",
      size: "Unknown",
      width: 1920,
      height: 1080,
      duration: 32.5,
      isOriginal: false,
      selected: false,
      download: {
        strategy: "direct"
      }
    }
  ],
  debug: {
    image: {},
    video: {},
    client: {}
  }
}
```

### Important Notes About This Model

- `media` is the primary collection. Do not add a second top-level `videos` array.
- `mediaType` must be either `image` or `video`.
- `isOriginal` remains meaningful only for images in this phase.
- videos may set `isOriginal` to `false`.
- `duration` for images should be `0`.
- `posterUrl` is for video only.
- `videoCount` must be added.
- `counts.images` and `counts.videos` must be added for the future-proof schema.

## Metadata Rules

### Required Metadata Behavior

For backward compatibility, metadata must keep:

- `imageCount`
- `originalCount`

For the new video path, metadata must add:

- `videoCount`
- `counts.images`
- `counts.videos`

### Metadata Semantics

- `imageCount` means extracted image item count
- `originalCount` means extracted image items marked `isOriginal`
- `videoCount` means extracted video item count
- `counts.images` duplicates image count in a future-proof location
- `counts.videos` duplicates video count in a future-proof location

### Do Not Do This

Do not redefine `originalCount` to include videos.

For this phase, `originalCount` remains image-specific.

## Extraction Range Model

### Allowed Values

Use exactly these values:

- `images`
- `videos`
- `both`

### Behavior

`images`
: run facts extraction, optional shared platform sampling, image extraction only

`videos`
: run facts extraction, optional shared platform sampling, video extraction only

`both`
: run facts extraction, optional shared platform sampling, image and video extraction

### Important Constraint

This is not just a UI filter.

The selected range must be sent into the extraction pipeline and must determine which collectors execute.

## Video Scope Definition

### Supported Global Video Sources

The first global video extractor may inspect:

- `<video src>`
- `<video><source src>`
- `data-src`
- `data-video`
- `data-video-src`
- `data-play-url`
- metadata tags if they point directly to a video file
- JSON-like attribute values only when they contain direct single-file video URLs

### Supported URL Requirements

A video candidate is acceptable only if:

- it is an `http` or `https` URL
- it is not a `blob:` URL
- it is not a `data:` URL
- it is not an `m3u8` manifest
- it is not an `mpd` manifest
- it looks like a single downloadable media file, or a direct CDN media endpoint

### Unsupported Video Sources

Reject:

- `blob:...`
- `data:...`
- `.m3u8`
- `.mpd`
- obvious ad/tracker video assets
- tiny loop/background decoration videos when detectable

## Platform Registry Changes

The current registry already supports platform dispatch.

It must evolve from:

```js
{
  id,
  folderPlatform,
  match,
  extractFacts,
  collectMedia
}
```

to:

```js
{
  id,
  folderPlatform,
  match,
  extractFacts,
  sampleContext,
  collectImages,
  collectVideos
}
```

### Registry Method Responsibilities

`extractFacts`
: shared project facts only

`sampleContext`
: optional platform-specific sampling data shared by image/video extraction

`collectImages`
: image-only extraction result

`collectVideos`
: video-only extraction result

### Default Behavior

If a platform does not define `sampleContext`, use an empty object.

If a platform does not define `collectVideos`, fall back to the global video extractor.

If a platform does not define `collectImages`, use the current image logic only where safe.

## Download Strategy Model

### Allowed Strategies In This Phase

Use exactly:

- `direct`
- `fetchBlob`

### Strategy Meaning

`direct`
: use normal Chrome download from URL

`fetchBlob`
: fetch with page credentials / referer, convert to blob or data URL as needed, then download

### Important Constraints

- do not add stream-specific strategies in this phase
- do not add merge or transcoding logic
- do not add companion app assumptions

## UI Behavior Requirements

### Popup State

The popup state must stop being image-only.

Current shape includes:

```js
state.images
```

Target shape should be:

```js
state.media = []
state.extractionRange = "images"
```

Optional helper getters may derive:

- visible image items
- visible video items
- selected item count
- selected image count
- selected video count

### Popup Controls

Add extraction range controls with exactly these choices:

- Images
- Videos
- Both

This control belongs near extraction/refresh controls because it changes extraction behavior.

### Existing Buttons

Keep:

- Refresh
- Select All
- Clear
- Download

Adjust behavior:

- `Select All` selects currently visible items
- `Clear` clears all current selections
- `Download` downloads all selected visible or hidden items, depending on the final state model

Recommended:

- keep selection state across range view changes only within the current extraction result

### Select Original

For this phase:

- `Select Original` applies only to images
- when range is `videos`, disable `Select Original`
- when range is `both`, `Select Original` should select image originals only, not videos

### Status Text

Do not keep image-only text such as:

- `Extracting images...`
- `Found X image(s).`

Replace with neutral text such as:

- `Extracting media...`
- `Found 6 item(s): 4 images, 2 videos.`

## Detailed Implementation Phases

Implement in the exact order below.

Do not skip ahead.

### Phase 1: Add Shared Constants and Range Storage

Goal:

- introduce shared extraction-range constants
- store and restore the extraction-range selection in popup settings

Tasks:

1. Add range constants in popup and content/background where needed:
   - `images`
   - `videos`
   - `both`
2. Add popup setting storage key for extraction range.
3. Add default popup setting:
   - `extractionRange: "images"`
4. Render the extraction range control in the popup.
5. Load and save the setting through `chrome.storage.local`.

Acceptance:

- popup shows extraction range control
- setting persists across popup reopen
- no extraction behavior changed yet

### Phase 2: Change Response Model to Unified `media`

Goal:

- stop returning `images` as the primary payload

Tasks:

1. In `content.js`, create a result builder that outputs:
   - `media`
   - `metadata`
   - `debug`
2. Convert existing image items into media items with:
   - `mediaType: "image"`
   - `download.strategy`
3. Preserve current image ordering and `isOriginal` logic.
4. Set `videoCount` to `0` for now.
5. Add `counts.images` and `counts.videos`.
6. Keep temporary backward compatibility only if absolutely necessary during migration.

Acceptance:

- image extraction still works
- popup can read media items derived from images
- metadata includes `videoCount: 0`

### Phase 3: Update Popup State to `state.media`

Goal:

- remove image-only popup assumptions

Tasks:

1. Replace `state.images` with `state.media`.
2. Add helpers:
   - `getAllMediaItems()`
   - `getVisibleMediaItems()`
   - `getVisibleImages()`
   - `getVisibleVideos()`
3. Update selection counters.
4. Update `render()` to loop over visible media items.
5. Keep image cards working.
6. Add a temporary simple video card rendering branch:
   - show poster if available
   - otherwise show a text placeholder
   - show format, resolution, duration

Acceptance:

- images still display correctly
- popup can render an empty video-capable media list without error

### Phase 4: Pass Extraction Range into the Pipeline

Goal:

- make the range selection affect actual extraction

Tasks:

1. Include `extractionRange` in popup-to-content or popup-to-background extraction requests.
2. Update content message handlers to accept it.
3. Update the extraction entry point so it only runs:
   - image collector for `images`
   - video collector for `videos`
   - both collectors for `both`
4. Keep shared facts extraction unconditional.
5. Keep shared platform sampling optional and reusable.

Acceptance:

- choosing `videos` does not run image collection
- choosing `images` does not run video collection
- choosing `both` runs both

### Phase 5: Introduce Global Video Extraction

Goal:

- return real video candidates on generic websites

Tasks:

1. Add `collectGenericVideoMedia()` in `content.js`.
2. Scan:
   - `video[src]`
   - `video source[src]`
   - useful `data-*` attributes
   - direct video metadata links
3. Normalize URLs.
4. Reject unsupported URL types.
5. Deduplicate by normalized URL.
6. Build media items:
   - `mediaType: "video"`
   - `format`
   - `resolution`
   - `width`
   - `height`
   - `duration`
   - `posterUrl`
   - `download.strategy`
7. Default strategy:
   - `direct`, unless a known rule requires `fetchBlob`

Acceptance:

- on pages with standard HTML5 videos, video items appear
- image extraction behavior is unchanged

### Phase 6: Wire Download Queue to Mixed Media Items

Goal:

- let the background queue download selected video items

Tasks:

1. Update queue payloads to accept generic `media` items, not image-only items.
2. Add `mediaType` to download task items.
3. Reuse existing queue and filename logic.
4. Reuse current metadata download logic.
5. Keep Eagle and Lineage branches image-only.
6. Ensure videos can download through:
   - `direct`
   - `fetchBlob`

Acceptance:

- selected image downloads still work
- selected single-file video downloads work
- metadata file still downloads

### Phase 7: Add Debug Separation

Goal:

- keep image and video debug evidence distinct

Tasks:

1. Keep existing image debug under `debug.image`.
2. Add video extraction debug under `debug.video`.
3. Include:
   - scanned source counts
   - accepted URLs
   - rejected URLs
   - reject reasons
4. Keep current debug UI, but feed the new object shape.

Acceptance:

- debug panel still renders JSON
- video debug is available without polluting image debug

### Phase 8: Prepare Platform Hooks for Future Video Rules

Goal:

- create extension points without forcing all special rules now

Tasks:

1. Refactor current platform registry to support:
   - `sampleContext`
   - `collectImages`
   - `collectVideos`
2. Provide default no-op `sampleContext`.
3. Route generic video extraction through the current platform adapter when no custom video collector exists.
4. Do not implement multiple special video rules in this phase.

Acceptance:

- platform registry supports future video rules
- no platform-specific video behavior is required yet

## Exact File-Level Guidance

### `chrome-plugin/popup.html`

Required changes:

- add extraction range control
- replace image-only wording with media-neutral wording where applicable

Do not:

- redesign the popup
- move unrelated sections
- change Lineage/Eagle layout unless required by media-state migration

### `chrome-plugin/popup.js`

Required changes:

- add extraction range setting
- migrate `state.images` to `state.media`
- update extraction request payload
- update rendering and selection helpers
- update status text to media-neutral text

Do not:

- rewrite Lineage logic
- rewrite Eagle logic
- change current image card visual style unless needed for mixed-media rendering

### `chrome-plugin/content.js`

Required changes:

- support extraction range input
- return `media`
- build new metadata counts
- add global video extractor
- evolve platform registry shape

Do not:

- rewrite existing image ranking unless required for migration
- add m3u8 logic
- add mpd logic

### `chrome-plugin/background.js`

Required changes:

- accept generic media items in queue payloads
- download videos using existing queue mechanics
- use `mediaType` and `download.strategy`

Do not:

- add Eagle video import
- add Lineage video import
- add stream-processing helpers

## Suggested Helper Functions

These are suggested names. They may be adjusted slightly, but keep naming clear and literal.

### In `content.js`

- `extractMediaFromPage(extractionRange, maxIndexHint, externalSampledUrls, externalSampledIndexes)`
- `collectImageMedia(...)`
- `collectVideoMedia(...)`
- `collectGenericVideoMedia()`
- `createMediaItemFromImageItem(imageItem)`
- `createVideoMediaItem(candidate)`
- `inferVideoFormat(url, contentType)`
- `isSupportedSingleFileVideoUrl(url)`
- `isManifestVideoUrl(url)`
- `getVideoAttributeUrls(video)`
- `buildMediaMetadataFromFacts(facts, media)`

### In `popup.js`

- `getVisibleMediaItems()`
- `getVisibleImages()`
- `getVisibleVideos()`
- `getSelectedMediaItems()`
- `getExtractionRangeSetting()`
- `saveExtractionRangeSetting()`
- `renderVideoCard(item, index)`

### In `background.js`

- `downloadMediaBatch(mediaItems, options)`
- `executeMediaDownloadStrategy(item, filename, context)`
- `fetchVideoAsBlobUrl(url, options)`

## Global Video Extraction Heuristics

Use conservative heuristics.

### Positive Signals

- URL path ends with common video extensions:
  - `.mp4`
  - `.webm`
  - `.mov`
  - `.m4v`
- content type indicates video
- candidate is attached to visible `<video>` element
- candidate has meaningful width/height
- candidate has meaningful duration

### Negative Signals

- `blob:` URL
- `data:` URL
- `.m3u8`
- `.mpd`
- ad/tracker host patterns
- width and height both zero with no supporting metadata
- tiny loop/background elements when obviously decorative

### Deduplication

Deduplicate by normalized final URL.

If the same video URL is found through multiple sources:

- prefer the candidate with better dimensions
- prefer the candidate with a poster URL
- prefer the candidate with known duration

## Acceptance Tests

Run these checks after each relevant phase.

### Baseline Image Regression Checks

Test at least:

- Instagram image post
- Instagram carousel
- Behance project
- Xiaohongshu image note
- Weibo image post

Expected:

- current image extraction still works
- current image download still works
- folder naming unchanged

### Generic Video Checks

Test at least:

- a plain HTML page with `<video src="...mp4">`
- a page with `<video><source src="...mp4"></video>`
- a page with multiple videos
- a page containing unsupported `m3u8` only

Expected:

- direct single-file videos are detected
- unsupported manifest-only videos are ignored
- `videos only` mode returns no images
- `images only` mode returns no videos

### Mixed Media Checks

Test at least:

- a page containing both images and videos

Expected:

- `images` mode extracts only images
- `videos` mode extracts only videos
- `both` mode extracts both
- selection and download work for mixed results

## Verification Commands

At minimum run:

```powershell
node --check chrome-plugin\content.js
node --check chrome-plugin\popup.js
node --check chrome-plugin\background.js
git diff --check
```

If a local test page is added for video extraction, document it and keep it minimal.

## Rollout Guidance for a Lower-Capability Agent

The implementing agent must follow these rules:

1. Do not attempt to add HLS or DASH support.
2. Do not redesign the popup.
3. Do not change Eagle or Lineage behavior except to keep them image-only.
4. Do not rename metadata fields without keeping backward compatibility.
5. Do not replace current image extraction logic with a generic rewrite.
6. Do not refactor unrelated code while doing the migration.
7. Complete one phase at a time and verify before moving on.

## Explicit Non-Goals for This Task

These are not bugs during this task unless they break the scoped feature:

- unsupported stream-only sites returning no videos
- blob-only players returning no videos
- no video thumbnail on some generic pages
- no video duration on some generic pages
- no special video rules yet for Instagram, Weibo, Xiaohongshu, or Behance

## Final Deliverable Definition

This task is complete only when all of the following are true:

1. The popup allows choosing `images`, `videos`, or `both`.
2. The extraction range changes actual extraction behavior.
3. The content result uses a unified `media` model.
4. Metadata includes `videoCount` and `counts`.
5. Generic single-file videos can be extracted and downloaded.
6. Existing image extraction still works.
7. Eagle and Lineage remain image-only.
8. No HLS/DASH logic has been introduced.
