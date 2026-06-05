# Task

## ID

2026-06-05_03

## Title

Refine Xiaohongshu image extraction to prefer the isolated main media container

## Status

Completed

## Goal

Improve the Xiaohongshu image special-domain rule so it prefers the note's isolated main media container before any broad visual clustering, reducing over-selection on posts where comment-gallery images sit close below the main note images.

## Scope

- inspect the current Xiaohongshu image special-domain path
- identify the stable main media container used by standard image posts
- make the Xiaohongshu image rule prefer that isolated main media region first
- use structured note image data such as `imageList` as the next fallback when available
- keep visual clustering as the final fallback only
- preserve current generic image extraction behavior outside the Xiaohongshu domain rule
- update the minimum required owner-layer docs after implementation

## Non-goals

- no video-rule changes
- no generic image extractor rewrite
- no cross-domain image-rule cleanup
- no HLS/DASH work
- no popup UI changes
- no download-layer changes

## Background

Recent live Chrome inspection showed two stable Xiaohongshu note patterns:

1. Standard image posts such as `img=18` and `img=6` place the main images inside a relatively isolated media block near the top of the note page.
2. Some posts such as the observed `img=8` case place large comment-gallery images close enough below the main content that the current `takeLeadingCluster(..., 800)` heuristic absorbs them into the same visual cluster.

This means the current cluster-first strategy is too broad for some Xiaohongshu note layouts.

## Plan

1. Inspect the current Xiaohongshu image-domain flow and identify where main-container-first logic should be introduced.
2. Implement a dedicated helper that locates the isolated main media container for standard Xiaohongshu image posts.
3. Restrict primary candidate collection to that main media container when it is confidently present.
4. If no stable main media container is found, try structured note image data such as `imageList`.
5. Only if both of the above fail, fall back to the current visual clustering strategy.
6. Preserve the current generic image path and keep all changes inside the Xiaohongshu image special-domain layer.
7. Run the required static checks and verify at least one previously accurate Xiaohongshu image post still works.
8. Update the minimum required docs after implementation.

## Acceptance Criteria

1. The Xiaohongshu image special-domain rule prefers an isolated main media container when present.
2. Structured note image data is used as a fallback before visual clustering.
3. Visual clustering remains available only as the last fallback.
4. The observed over-selection pattern caused by nearby comment-gallery images is reduced or eliminated for the known bad sample.
5. Standard Xiaohongshu image posts that were already correct remain correct.
6. No video rule behavior changes.
7. No generic image extractor behavior changes outside Xiaohongshu.
8. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
- `git diff --check`

## Execution Report

- introduced a Xiaohongshu main-media-container selector so standard image posts prefer an isolated note-body media block first
- added structured `imageList` fallback extraction before the existing visual clustering fallback
- kept the generic image extractor unchanged and left video behavior untouched
- validated the Chrome plugin scripts with `node --check`

## Implementation Constraints

### Required Boundary Rules

- keep Xiaohongshu image logic inside the image special-domain path only
- do not move this behavior into generic image extraction
- do not mix image and video rule implementations
- keep canonical `images` as the image truth source

### Required Strategy Order

Expected priority:

```text
isolated main media container
  -> structured note image list
    -> visual clustering fallback
```

### Explicitly Forbidden

Do not:

- solve this by only tuning the cluster gap threshold globally
- change the Xiaohongshu video rule as part of this task
- rewrite unrelated image rules for other hosts
- convert merged `media` into the image truth source

## File Targets

Primary expected code file:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)

Expected documentation updates after implementation:

- [doc/architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)
- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)

## Reviewer Notes

- Prefer structurally narrow extraction over visual breadth.
- A conservative rule that reliably stays inside the note's main image block is better than a wider heuristic that occasionally captures comment images.
- Keep the existing accurate Xiaohongshu image cases as regression checks.

## Context Delta

### Keep

- `xiaohongshu` remains the first real site used to validate both video and image domain-rule hardening.
- generic extraction must still work when no special-domain rule is available.

### Changed

- Xiaohongshu image extraction now prefers a narrow isolated media container before broader heuristics.
- Structured note image data such as `imageList` is now the next fallback before visual clustering.

### Avoid

- Do not assume cluster tuning alone will safely solve the bad sample.
- Do not infer that all Xiaohongshu note layouts share the same degree of visual isolation.

### Follow-up

- If the main container selectors prove unstable across more samples, keep that durability risk visible in `doc/engineering/KNOWN_ISSUES.md`.
- If structured note payload access becomes the more stable path than DOM isolation, promote that as the primary strategy in architecture docs.

## Final Result

The Xiaohongshu image special-domain rule now prefers the isolated main media container first, falls back to structured `imageList` data next, and only then uses visual clustering.
