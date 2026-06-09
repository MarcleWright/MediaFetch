# Task

## ID

2026-06-08_03

## Title

Implement minimal video-download MVP architecture for single-file media

## Status

Planned

## Goal

Add the minimum new download architecture needed to save real video files locally for supported single-file video domains without introducing segmented-stream, audio/video merge, or WASM media-processing scope.

## Scope

- define the first true video-download MVP for the Chrome plugin
- keep the MVP limited to direct single-file `http/https` video assets
- introduce a minimal video download-strategy layer with:
  - `direct`
  - `page-context-fetch`
- preserve current domain-rule extraction work for:
  - `xiaohongshu`
  - `weibo`
  - `xinpianchang`
- update the minimum required owner-layer docs after implementation

## Non-goals

- no HLS support
- no DASH support
- no `m3u8` support
- no `mpd` support
- no audio/video split-track handling
- no LibAV / ffmpeg / WASM media pipeline
- no video transcoding
- no Eagle or Lineage video integration
- no image extraction refactor

## Background

Current evidence across domain testing shows:

1. the plugin can already extract plausible direct single-file video URLs on several domains
2. local-file persistence is the main failure point, not basic detection
3. some sites allow direct download, but others only succeed when requests run closer to page playback context
4. Video DownloadHelper succeeds through a much heavier architecture than this project currently needs
5. Eagle for Chrome succeeds through browser-context retrieval plus local-app ingestion, which is easier but changes the product dependency model

The current project decision should therefore be:

- do not jump directly to segmented-stream or WASM architecture
- first build a smaller MVP focused on saving single-file video successfully

## Plan

1. Add a dedicated video download execution layer if current logic is still too image-oriented.
2. Introduce exactly two first-phase video download strategies:
   - `direct`
   - `page-context-fetch`
3. Keep `direct` for openly downloadable direct MP4-style assets.
4. Add `page-context-fetch` for domains where page playback works but extension-side direct download fails.
5. Keep the resulting file-save path browser-native after fetch completes:
   - fetch to `Blob`
   - convert to blob URL or equivalent downloadable local object
   - hand off to `chrome.downloads.download`
6. Restrict the first MVP to single-file video only.
7. Re-test `xiaohongshu`, `weibo`, and `xinpianchang` against the new strategy layer.
8. Update the minimum required docs after implementation.

## Acceptance Criteria

1. The codebase has an explicit video download MVP path for single-file media.
2. The MVP only supports direct single-file `http/https` media files.
3. The MVP introduces both:
   - `direct`
   - `page-context-fetch`
4. The MVP does not introduce:
   - `m3u8`
   - `mpd`
   - audio/video merge
   - LibAV / WASM
5. At least one real supported-domain video download succeeds end-to-end with the new strategy layer.
6. Validation includes at least:
   - one domain that succeeds with `direct`
   - one domain that requires `page-context-fetch`
7. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- keep image and video download paths separate where semantics differ
- keep generic video extraction available outside domain rules
- keep the MVP browser-only; do not introduce a local helper or desktop companion in this task
- keep the MVP focused on file persistence, not heavy media transformation

### Explicitly Forbidden

Do not:

- expand this task into HLS or DASH support
- add audio/video muxing
- add LibAV or ffmpeg dependencies
- redesign Eagle or Lineage integration
- mark the task complete without at least one real successful local video download

## File Targets

Primary expected code files:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js)

Expected documentation updates after implementation:

- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
- [doc/ai/AI_CONTEXT.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/AI_CONTEXT.md)
- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md) if the strategy layer becomes durable architecture truth
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md) if durable download limitations remain
- this task file itself must be updated to `Completed` or `Reopened`

## Reviewer Notes

- This task exists because the current plugin already proves that extraction and download are separate problems.
- The MVP should optimize for "first real local playable file" instead of architectural completeness.
- Treat `page-context-fetch` as the most likely fix path for protected single-file hosts.
- If the implementation starts growing toward stream assembly, stop and split a later task instead.

## Context Delta

### Keep

- current first video phase remains single-file video only
- domain-specific extraction still matters
- generic extraction must remain available

### Changed

- the next video-download step is no longer "copy Video DownloadHelper"
- the project now has a narrower official MVP target:
  - single-file video
  - `direct`
  - `page-context-fetch`
  - browser-native local file save

