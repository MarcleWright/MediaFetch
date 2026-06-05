# Task

## ID

2026-06-05_05

## Title

Add stable Xiaohongshu video cover extraction from `note.video.image.thumbnailFileid`

## Status

Completed

## Goal

Improve the Xiaohongshu video special-domain rule so extracted video items can use a page-embedded structured cover source when that source can be mapped to a verified CDN URL, while preserving current poster fallbacks when the mapping is uncertain.

## Scope

- inspect the current Xiaohongshu video special-domain path
- read the structured cover field from `note.video.image.thumbnailFileid`
- determine the correct CDN URL construction for that file id by comparing structured fields with already-visible page cover URLs
- populate `thumbnail`, `previewUrl`, or `posterUrl` for Xiaohongshu video items with the structured cover URL only when the mapping has been verified
- preserve current generic video extraction fallback behavior
- update the minimum required owner-layer docs after implementation

## Non-goals

- no video quality ranking changes
- no new stream selection logic
- no HLS support
- no DASH support
- no image-rule changes
- no cross-domain video cover extraction work

## Background

Live inspection on Xiaohongshu video posts showed:

1. `mediaV2` itself does not carry a stable cover object for the tested samples
2. `note.video.image.thumbnailFileid` exists and appears to hold a stable cover file id
3. the popup currently can fall back to direct video URLs or weak poster guesses, which is less stable than a structured cover source
4. the missing proof today is not the field itself, but the repeatable `thumbnailFileid -> CDN URL` mapping rule across multiple samples

## Plan

1. Inspect the current Xiaohongshu video media-item builder.
2. Extract `note.video.image.thumbnailFileid` during Xiaohongshu video payload parsing.
3. Inspect at least 2 to 3 real Xiaohongshu video posts and compare the structured file id with already-visible page cover URLs.
4. Only after a repeatable mapping rule is confirmed, implement the file-id-to-cover-URL helper in the Xiaohongshu special-domain layer.
5. Use the resulting cover URL as the preferred `posterUrl` and thumbnail source for Xiaohongshu video items.
6. Keep existing fallbacks intact if the structured cover field is absent or cannot be converted into a verified usable URL.
7. Run the required static checks and validate against at least 2 real Xiaohongshu video posts, including at least 1 horizontal sample and 1 vertical sample when available.
8. Update the minimum required docs after implementation.

## Acceptance Criteria

1. Xiaohongshu video extraction reads `note.video.image.thumbnailFileid` when available.
2. The `thumbnailFileid -> cover URL` mapping is validated against at least 2 real Xiaohongshu video posts before code is considered complete.
3. The Xiaohongshu video item uses the structured cover URL only when that mapping has been verified.
4. Existing Xiaohongshu video stream selection behavior is unchanged.
5. Generic video fallback and poster fallback remain available when the Xiaohongshu structured cover path is unavailable or unverified.
6. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- keep Xiaohongshu cover extraction inside the Xiaohongshu video special-domain path only
- do not move this behavior into generic video extraction
- do not mix image and video rule logic
- keep canonical `videos` as the video truth source

### Required Strategy Order

Expected priority:

```text
note.video.image.thumbnailFileid
  -> verify repeatable cover URL mapping
    -> build stable cover URL
    -> assign poster/thumbnail fields
      -> fallback to existing generic poster handling if unavailable
```

### Explicitly Forbidden

Do not:

- mark the task complete after validating only one sample
- rewrite Xiaohongshu stream ranking as part of this task
- hardcode an unverified CDN rule from a single page sample
- change popup behavior for images
- expand this task to other hosts

## File Targets

Primary expected code files:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js) only if display handling needs a minor adjustment

Expected documentation updates after implementation:

- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)
- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)

## Reviewer Notes

- Prefer the structured cover source over rendered DOM poster guessing.
- Keep the implementation conservative until the file-id-to-CDN mapping is verified on multiple samples.
- If the cover URL mapping proves unstable, preserve fallback behavior instead of forcing a broken poster.
- It is acceptable for this task to end as “investigated but not implemented” if the mapping cannot be verified safely.

## Context Delta

### Keep

- `xiaohongshu` remains the first real site used to validate both image and video special-domain hardening.
- generic extraction must still work when no special-domain rule is available.

### Changed

- Xiaohongshu video covers should now be treated as a structured note payload concern first, but only when the file-id mapping is verified.

### Avoid

- Do not assume `mediaV2` itself will always carry cover data.
- Do not tie video cover extraction to stream ranking logic unless the same payload already provides both.

### Follow-up

- If the thumbnail file-id mapping requires a stable reusable helper, keep it scoped to Xiaohongshu until another host needs a similar pattern.
- If cover mapping fails on multiple samples, record that durability risk in `doc/engineering/KNOWN_ISSUES.md`.

## Final Result

Implemented a Xiaohongshu video-only cover helper that reads `note.video.image.thumbnailFileid`, converts verified file ids into `https://ci.xiaohongshu.com/<fileId>` URLs, and uses that structured cover source for `thumbnail`, `previewUrl`, and `posterUrl` when available.

Validation covered multiple real Xiaohongshu video samples from the page-embedded card data and confirmed that the raw `ci.xiaohongshu.com/<fileId>` base URL is reachable for the observed cover assets.

Existing stream selection behavior and generic fallback handling were left unchanged.
