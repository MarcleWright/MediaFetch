# Task

## ID

2026-06-05_02

## Title

Implement the first Xiaohongshu video special-domain rule

## Status

Completed

## Goal

Add the first real video special-domain rule for `xiaohongshu` in the Chrome plugin while preserving the current media-type boundary rules.

This task is the first production validation of the current media-layer design against a real site-specific video extraction case.

## Scope

- inspect how Xiaohongshu exposes video data on the page
- identify the most stable in-page source for single-file video extraction
- implement a `xiaohongshu`-specific video rule through the video domain-rule path
- keep generic video fallback available if the special rule cannot extract a usable result
- add Xiaohongshu-specific video debug evidence under `debug.video`
- update only the minimum owner-layer docs after implementation

## Non-goals

- no HLS support
- no DASH support
- no blob URL final-download support
- no Eagle video export
- no Lineage video export
- no new image special-domain behavior
- no image/video mixed rule function
- no second video special-domain rule for any other host

## Plan

1. Inspect the current Xiaohongshu page structure and determine where usable single-file video information is exposed.
2. Prefer a stable structured source such as inline JSON or page data over fragile rendered DOM heuristics when possible.
3. Implement the Xiaohongshu video rule behind `getVideoDomainRule(host)`.
4. Keep the current generic video extractor unchanged as the fallback path.
5. Return canonical `videos` and let merged `media` be assembled through the existing shared merge layer.
6. Add focused Xiaohongshu-specific debug evidence to `debug.video`.
7. Run the required static checks.
8. Update the minimum required docs after implementation.

## Acceptance Criteria

1. `xiaohongshu` has a real video special-domain rule reachable through the video rule lookup path.
2. The Xiaohongshu video rule extracts direct single-file video results only.
3. If the Xiaohongshu video rule cannot produce valid results, generic video fallback still exists.
4. Image extraction behavior is unchanged.
5. No image/video mixed rule function is introduced.
6. Video debug information for Xiaohongshu is available under `debug.video`.
7. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Execution Report

- added a Xiaohongshu-specific video domain rule behind `getVideoDomainRule(host)`
- extracted direct single-file MP4 candidates from the page-embedded Xiaohongshu note payload
- kept generic video extraction as the fallback path when the special rule produces no usable media
- added Xiaohongshu-specific evidence to `debug.video.xiaohongshu`
- validated the Chrome plugin scripts with `node --check`

## Implementation Constraints

### Required Boundary Rules

- image and video rule layers must stay separate
- canonical `images` and canonical `videos` must stay separate
- merged `media` remains an aggregation layer only
- generic extraction must continue to work when special-domain extraction does not

### Required Architectural Path

The implementation must flow through the existing video rule path, not through image logic.

Expected direction:

```text
extractVideosForPage(...)
  -> getVideoDomainRule(host)
  -> xiaohongshu video rule
  -> fallback to extractGenericVideos() when needed
```

### Explicitly Forbidden

Do not:

- put Xiaohongshu video logic inside image rule code
- modify image ranking rules as part of this task
- add HLS/DASH handling
- use one combined `extract(mediaType)` rule function
- expand this task to other hosts

## File Targets

Primary expected code file:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)

Expected documentation updates after implementation:

- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md) if the rule path or media boundaries materially change
- [doc/architecture/DATA_MODEL.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DATA_MODEL.md) only if result shape or rule ownership changes
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md) if a durable Xiaohongshu-specific risk remains
- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)

## Reviewer Notes

- Prioritize stability over clever extraction breadth.
- It is acceptable for the first Xiaohongshu rule to be conservative if it is structurally correct and preserves current boundaries.
- Do not let the implementation agent “improve” unrelated generic video behavior during this task.

## Context Delta

### Keep

- Xiaohongshu is the first chosen site for validating the video special-domain rule layer.

### Changed

- Xiaohongshu video notes now have a dedicated special-domain rule path that stays separate from image logic.
- `debug.video` now carries Xiaohongshu-specific evidence alongside the generic video debug fields.

### Avoid

- Do not deduplicate image generic/domain logic while working on this task.
- Do not mix Xiaohongshu video logic into image-domain paths.

### Follow-up

- The current special rule is intentionally conservative and depends on page-embedded direct MP4 URLs.
- Promote any future Xiaohongshu payload-format regression into `doc/engineering/KNOWN_ISSUES.md` if it becomes a durable risk.

## Final Result

The first Xiaohongshu video special-domain rule is implemented, direct single-file video extraction now flows through the video rule path, and generic video fallback remains intact when the special rule cannot produce usable media.
