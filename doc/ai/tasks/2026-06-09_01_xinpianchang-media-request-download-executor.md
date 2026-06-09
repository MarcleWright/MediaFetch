# Task

## ID

2026-06-09_01

## Title

Implement `xinpianchang` media-request-based video download executor MVP

## Status

In Progress

## Goal

Add a true `xinpianchang`-specific video download executor that is designed around the browser's native media request behavior, so the plugin can save a real local video file from the protected `xpccdn` host without treating the media URL as a normal direct-download or generic fetch target.

## Scope

- keep the existing `xinpianchang` video extraction rule
- keep the scope limited to single-file video only
- implement a new `xinpianchang` special download executor under the video download-rule layer
- use the confirmed playback evidence as the design baseline:
  - same extracted MP4 URL
  - `type: media`
  - `206 Partial Content`
  - `Accept-Ranges: bytes`
  - `Content-Range`
- preserve generic video download behavior outside `xinpianchang`
- update the minimum required owner-layer docs after implementation

## Non-goals

- no HLS support
- no DASH support
- no `m3u8` support
- no `mpd` support
- no audio/video merge
- no LibAV / ffmpeg / WASM media pipeline
- no helper app or localhost desktop dependency
- no image-rule changes
- no `weibo` task expansion in this document

## Background

Current validated evidence now shows:

1. `xinpianchang` extraction is already correct on the tested page
2. the extracted maximum-size MP4 URL is the same URL used by the real browser playback path
3. browser playback succeeds through `type: media` requests with `206 Partial Content`
4. the response path is range-based, not a simple one-shot file retrieval path
5. direct download, extension-side fetch, offscreen fetch, main-world fetch, and direct navigation have already failed against the same protected host

This means the remaining problem is not URL discovery. The remaining problem is how to reproduce or leverage the browser's successful media-delivery path well enough to save a real local file.

## Plan

1. Re-read the existing `xinpianchang` extraction and download-rule code before editing anything.
2. Re-validate the current known sample and confirm the probe still shows the same extracted MP4 URL being played through `type: media` and `206 Partial Content`.
3. Preserve the current extraction result shape and debug evidence.
4. Keep the current probe evidence available until the new executor is validated.
5. Introduce a dedicated `xinpianchang` video download executor entry instead of routing the domain back through generic `direct` or generic `fetchBlob`.
6. Design the executor around browser media-request behavior rather than plain extension fetch behavior.
7. Prefer a browser-native media-path MVP first, and only save the file after the media path is proven to have access to the protected resource.
8. Preserve hard failure behavior when the executor cannot obtain a real media payload; do not fall back to fake success such as `001.htm`.
9. Validate against the current real sample page and confirm the final saved result is a real playable media file.
10. Update the minimum required docs after implementation.

## Acceptance Criteria

1. `xinpianchang` no longer relies on shared generic `direct` or shared generic `fetchBlob` as its final video download executor.
2. The implementation is explicitly scoped to the `xinpianchang` video download-rule layer.
3. At least one real tested `xinpianchang` page saves a real local video file end-to-end.
4. The accepted result is not:
   - `001.htm`
   - HTML content
   - a blank or zero-byte file
5. The task keeps scope limited to direct single-file video handling.
6. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- keep `xinpianchang` logic inside the video domain-rule and video download-rule layers
- do not weaken the image/video boundary to solve this task
- do not rewrite the generic video executor as if the whole web needed the same protected-host behavior
- keep any temporary probe or validation logic clearly separated from final executor logic

### Explicitly Forbidden

Do not:

- retry another small header-only tweak and call that the solution
- revert to generic `direct` as the final answer for `xinpianchang`
- revert to generic `fetchBlob` as the final answer for `xinpianchang`
- keep iterating through more minor `direct` / `fetch` / header permutations after the implementation has clearly fallen back to the same old execution model
- mark the task complete because extraction is correct
- mark the task complete without a real successful local playable file
- expand this task into segmented-stream support

## File Targets

Primary expected code files:

- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)
- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js)

Expected documentation updates after implementation:

- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
- [doc/ai/AI_CONTEXT.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/AI_CONTEXT.md)
- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)
- this task file must be updated to `Completed` or `Reopened`

## Reviewer Notes

- The strongest new fact is not that playback exists, but that playback succeeds on the same extracted MP4 URL through browser-native range media requests.
- The agent must not confuse "URL is correct" with "download path is solved".
- The correct abstraction for this task is "media-request-based executor", not "better direct downloader".
- If implementation pressure starts pushing toward helper apps, localhost ingestion, HLS, or muxing, stop and split a new task instead.

## Context Delta

### Keep

- `xinpianchang` extraction is already correct on the tested sample
- current first video phase remains single-file video only
- generic video extraction must remain available outside domain rules

### Changed

- real playback validation now proves the browser uses the same extracted MP4 URL
- the relevant successful request shape is now known:
  - `type: media`
  - `206 Partial Content`
  - `Accept-Ranges: bytes`
  - `Content-Range`
- the next implementation target is no longer "stronger bypass in general"
- the next implementation target is specifically a media-request-based special download executor
- the current implementation pass now uses browser-native media playback capture plus `MediaRecorder` as the first concrete executor attempt
- because that executor records the browser media path instead of reading the protected MP4 bytes directly, the current file-output target for this MVP path is `webm`

### Avoid

- do not spend the task re-proving that normal `fetch` and direct navigation fail
- do not delete the current probe evidence before the new executor is validated
- do not silently broaden this task into a generic protected-host framework
- do not replace the current confirmed sample with a new sample unless the current sample becomes unavailable or unstable

### Follow-up

- if this media-request-based executor still cannot save a real file, the project should explicitly decide between:
  - a helper-assisted architecture closer to Eagle
  - a heavier browser-only downloader architecture closer to Video DownloadHelper

## Interim Result

Current implementation status:

1. removed the failed `xinpianchang` page-bridge injection path
2. preserved the playback probe evidence path
3. added a dedicated `mediaCapture` download strategy for `xinpianchang`
4. routed the `xinpianchang` special executor through browser-native video playback capture in page main world
5. changed the current MVP output extension for this path to `webm`

Latest validation result:

6. real browser-page validation showed that `HTMLMediaElement.captureStream()` fails because the video element is treated as cross-origin media data
7. this means the current browser-only media-capture executor is not an accepted final solution for `xinpianchang`

Validation is still required before the task can move to `Completed`, and the likely next architecture step is now helper-assisted rather than another browser-only executor variation.
