# Task

## ID

2026-06-05_04

## Title

Refine Xiaohongshu video extraction to choose the maximum-size stream and display video dimensions

## Status

Completed

## Goal

Upgrade the Xiaohongshu video special-domain rule so it reads `mediaV2/stream` directly, collects all available direct MP4 variants, chooses the maximum-size stream for the final video result, and surfaces explicit video dimensions in the plugin UI.

## Scope

- inspect the current Xiaohongshu video special-domain path
- make the video rule parse `mediaV2/stream` as the primary structured source
- collect all direct single-file stream variants exposed in `mediaV2/stream`
- rank variants by resolution first, then bitrate and codec as tie-breakers
- choose the maximum-size variant as the canonical exported video item
- preserve generic video extraction as fallback when `mediaV2/stream` is absent or unusable
- expose explicit video dimensions in the popup UI
- update the minimum required owner-layer docs after implementation

## Non-goals

- no HLS support
- no DASH support
- no blob URL final-download support
- no Eagle video export
- no Lineage video export
- no image-rule changes
- no cross-domain video-rule cleanup

## Background

Live inspection of multiple Xiaohongshu video posts showed:

1. the page often exposes multiple direct MP4 stream variants inside `mediaV2/stream`
2. the browser may already fetch a higher-quality variant than the plugin currently reports
3. observed samples suggest that `stream_type 108` is often the highest-size variant, but this should be treated as an observation rather than a hardcoded rule
4. the popup currently does not display video dimensions, making it hard to verify that the selected result is truly the maximum-size stream

## Plan

1. Inspect the current Xiaohongshu video-domain implementation and identify where first-match behavior is occurring.
2. Add a structured parser for `mediaV2/stream` that extracts all direct MP4 stream variants from h264/h265 arrays.
3. Normalize each variant into a comparable structure containing width, height, bitrate, codec, stream type, and URL.
4. Rank all usable variants by maximum resolution first, then bitrate, then codec preference as needed.
5. Use the top-ranked variant as the canonical Xiaohongshu video result.
6. Keep the current generic video extractor unchanged as fallback when `mediaV2/stream` is unavailable or parsing fails.
7. Update the popup UI so each video item clearly displays its dimensions.
8. Run the required static checks and validate against at least two real Xiaohongshu video posts with multiple stream variants.
9. Update the minimum required docs after implementation.

## Acceptance Criteria

1. Xiaohongshu video extraction reads `mediaV2/stream` first when that payload exists.
2. The rule collects and ranks multiple direct MP4 stream variants instead of stopping at the first match.
3. The canonical Xiaohongshu video item resolves to the maximum-size available variant for observed sample posts.
4. Generic video fallback remains available when `mediaV2/stream` is unavailable or unusable.
5. Image extraction behavior is unchanged.
6. The popup UI shows explicit video dimensions for extracted video items.
7. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Execution Report

- switched Xiaohongshu video extraction to parse the structured `mediaV2/stream` payload first
- fixed the structured stream root to read top-level `mediaV2.stream`, with compatibility fallback to `mediaV2.video.stream` and `note.video.stream`
- collected all direct MP4 stream variants from the structured stream arrays and ranked them before choosing the exported item
- preserved generic video extraction as fallback when structured payload parsing does not yield a usable result
- updated the popup to show explicit video dimensions for video items
- validated the Chrome plugin scripts with `node --check`

## Implementation Constraints

### Required Boundary Rules

- keep Xiaohongshu video logic inside the video special-domain path only
- do not move this behavior into generic video extraction
- do not mix image and video rule implementations
- keep canonical `videos` as the video truth source

### Required Strategy Order

Expected priority:

```text
mediaV2/stream
  -> collect all direct MP4 variants
    -> rank by maximum size
      -> choose top variant
        -> fallback to generic video extraction if needed
```

### Explicitly Forbidden

Do not:

- hardcode `stream_type 108` as always the winner
- stop at the first discovered `masterUrl`
- add HLS/DASH handling as part of this task
- rewrite unrelated generic video behavior
- change popup behavior for images

## File Targets

Primary expected code files:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js)
- [chrome-plugin/popup.html](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.html) if video dimensions need explicit UI labels

Expected documentation updates after implementation:

- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)
- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)

## Reviewer Notes

- Prefer explicit structured stream ranking over regex-first URL harvesting.
- Observed samples suggest `108` often maps to the maximum-size stream, but the implementation must still rank all variants rather than rely on stream type number alone.
- The popup dimension display is part of verification, not a cosmetic enhancement.

## Context Delta

### Keep

- `xiaohongshu` remains the first real site used to validate both video and image domain-rule hardening.
- generic extraction must still work when no special-domain rule is available.

### Changed

- Xiaohongshu video extraction should now be treated as a structured stream-ranking problem, not a first-match URL harvesting problem.
- Video dimensions should be visible in the popup so humans can verify stream quality directly.

### Avoid

- Do not assume the first `masterUrl` is the best stream.
- Do not assume `stream_type 108` is universally the maximum-size stream across all Xiaohongshu posts.

### Follow-up

- If future samples show variant ordering rules that differ by codec family or orientation, update the ranking heuristic in architecture docs.
- If `mediaV2/stream` disappears on some Xiaohongshu pages, keep that durability risk visible in `doc/engineering/KNOWN_ISSUES.md`.

## Final Result

The Xiaohongshu video special-domain rule now prefers structured `mediaV2/stream` data, ranks all direct MP4 variants before selection, and the popup makes the selected video dimensions explicit.
