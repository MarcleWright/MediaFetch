# Task

## ID

2026-06-08_04

## Title

Refactor Chrome plugin download layer to match media/domain boundary model

## Status

Completed

## Goal

Refactor the Chrome plugin download layer so it follows the same media-type and domain-rule boundary discipline already established on the extraction side.

This task is the current active priority for download-layer cleanup.

Ignore `2026-06-08_03_video-download-mvp-architecture.md` while executing this task.

## Scope

- add explicit image download rule entry points
- add explicit video download rule entry points
- move host-specific branching out of shared download helpers
- keep shared download functions focused on execution, queueing, naming, and metadata handling
- preserve current working image and video behavior while the boundary cleanup happens
- update the minimum required owner-layer docs after implementation

## Non-goals

- no `page-context-fetch` implementation in this task
- no HLS support
- no DASH support
- no `m3u8` support
- no `mpd` support
- no audio/video muxing
- no LibAV / ffmpeg / WASM
- no local desktop helper
- no Eagle or Lineage video integration
- no extraction-layer redesign unless a real interface mismatch is discovered

## Background

Current project state is uneven:

1. extraction is already mostly separated by media type and by domain rule
2. download is still too centralized inside shared background helpers
3. recent domain fixes have tended to accumulate inside shared download functions
4. this makes the shared layer act like an accidental domain-rule layer

The intended architecture is already documented in:

- `doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md`
- `doc/architecture/DOWNLOAD_LAYER_STATUS.md`

This task exists to convert that architecture intent into code structure.

This task must finish before the project attempts the next video-download capability phase.

## Plan

1. Inspect the current download layer and identify where shared helpers still contain host-specific rule logic.
2. Introduce explicit image download rule entry points.
3. Introduce explicit video download rule entry points.
4. Move strategy selection behind those rule entry points.
5. Move header-rule selection behind those rule entry points.
6. Keep shared executors responsible only for running already-selected strategies.
7. Preserve current working behavior for:
   - Xiaohongshu image download
   - Xiaohongshu video download
   - Weibo video download
   - Xinpianchang video download behavior as currently validated
8. Do not implement `page-context-fetch` in this task; only prepare the layer so later tasks can add strategies cleanly.
9. Run the required checks and update the minimum required docs after implementation.

## Acceptance Criteria

1. The codebase has an explicit image download rule entry layer.
2. The codebase has an explicit video download rule entry layer.
3. At least one shared executor function is clearly identifiable and remains generic.
4. Shared download helpers are no longer the main place where host-specific download behavior is authored.
5. Adding a new domain download rule no longer requires extending a large central host-branching function.
6. The existing central shared helpers do not continue to act as the primary host-dispatch switchboard after refactor.
7. Existing media canonical boundaries remain intact:
   - `images`
   - `videos`
   - merged `media` as shared consumer view only
8. This task does not introduce `page-context-fetch`; it only prepares the structure for later strategy additions.
9. Minimum manual regression is recorded for:
   - `xiaohongshu` image download path
   - `xiaohongshu` video download path
   - `weibo` video download path
   - `xinpianchang` remains explicitly `Reopened` or unchanged unless it is actually fixed and revalidated
10. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- keep image and video download rule layers separate
- keep shared download execution generic
- keep domain-specific logic behind rule resolution instead of inline host branching
- preserve existing extraction-side media boundaries
- ignore task `2026-06-08_03` during this implementation pass

### Explicitly Forbidden

Do not:

- treat this task as permission to add more ad hoc domain hotfixes into shared helpers
- implement `page-context-fetch` in this task
- expand this task into streaming-media support
- redesign extraction rules as part of download cleanup unless truly required
- mark the task complete if shared download helpers still act as the main domain-rule switchboard

## File Targets

Primary expected code files:

- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)
- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js) only if download-rule metadata on media items needs interface adjustment
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js) only if download task payload structure needs interface adjustment

Expected documentation updates after implementation:

- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
- [doc/ai/AI_CONTEXT.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/AI_CONTEXT.md)
- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md) if any durable naming/interface changes occur
- [doc/architecture/DOWNLOAD_LAYER_STATUS.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DOWNLOAD_LAYER_STATUS.md) if the status materially changes
- this task file itself must be updated to `Completed` or `Reopened`

## Reviewer Notes

- This task is about structure first, not feature expansion first.
- A correct result may leave some domain download failures unresolved only if the remaining behavior is explicitly documented and the rule boundaries are actually cleaner.
- Do not let a temporary fix for one domain make the overall download layer more centralized.
- Treat `2026-06-08_03` as a later follow-up, not as in-scope work here.

## Context Delta

### Keep

- the June 5 media-boundary refactor remains the intended model
- image and video stay parallel subsets under shared media
- current first video-download MVP remains single-file only

### Changed

- the main remaining architectural debt is now explicitly treated as a download-layer refactor problem
- new domain download work should build on explicit rule layers rather than shared-helper host branching
- the Chrome plugin download layer now has explicit image and video rule entry points, with shared execution kept generic

## Final Result

Completed as a structural cleanup task.

What changed:

- explicit image/video strategy selection entry points now exist
- explicit image/video header-rule selection entry points now exist
- shared download helpers remain responsible for execution and queue behavior
- the task did not introduce `page-context-fetch`

What this task did not claim:

- it did not claim to solve all remaining domain download failures
- it did not expand the project into segmented-stream support
- it did not replace later capability work under `2026-06-08_03`
