# Task

## ID

2026-06-08_01

## Title

Implement `weibo` video domain extraction and download rules

## Status

Reopened

## Goal

Move `weibo` video handling into explicit domain rules so extraction and download no longer depend on the generic video path for this host.

## Scope

- add a `weibo` video extract special-domain rule
- add a `weibo` video download special-domain rule
- keep the rule scoped to direct single-file video handling only
- preserve generic video fallback behavior outside the `weibo` domain
- update the minimum required owner-layer docs after implementation

## Non-goals

- no `xinpianchang` work in this task
- no `youtube` support
- no `bilibili` support
- no HLS support
- no DASH support
- no image-rule changes

## Background

Current evidence shows:

1. `weibo` can already expose a plausible direct MP4 candidate through the current generic path
2. download still fails often enough that the host should not rely on generic video download behavior
3. `weibo` already has image-side host-specific handling in the project, so giving video its own domain rule matches the repository direction

## Plan

1. Inspect the current `weibo` video extraction results and identify the most stable host-specific extraction entry point.
2. Add a `weibo` video special-domain extract rule under the video-domain path.
3. Add a `weibo` video download rule that applies any host-specific request behavior needed for successful downloads.
4. Keep the implementation limited to direct single-file video handling.
5. Preserve generic fallback behavior for non-`weibo` hosts.
6. Run the required static checks and verify against at least two real `weibo` video posts when available.
7. Confirm that at least one real `weibo` video download succeeds end-to-end.
8. Update the minimum required docs after implementation.

## Acceptance Criteria

1. `weibo` video extraction no longer depends solely on the generic video path.
2. `weibo` video download no longer depends solely on the generic video download path.
3. The selected `weibo` video result remains a direct single-file video URL.
4. At least one real `weibo` video download succeeds end-to-end on the tested domain.
5. Validation covers at least two real `weibo` posts when available, or one real post plus one explicit fallback-path check if a second stable sample is not available.
6. The task does not alter `xinpianchang` behavior.
7. Static checks pass:
   - `node --check chrome-plugin\content.js`
   - `node --check chrome-plugin\popup.js`
   - `node --check chrome-plugin\background.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- keep `weibo` video logic inside the video domain-rule and video download-rule layers
- do not move `weibo` video logic into image-domain files
- do not mix `weibo` and `xinpianchang` changes in this task

### Explicitly Forbidden

Do not:

- start the `xinpianchang` task before this one is complete
- batch `weibo` and `xinpianchang` code into one implementation pass
- expand this task into streaming-media support
- mark the task complete without confirming a real successful `weibo` download

## File Targets

Primary expected code files:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)

Expected documentation updates after implementation:

- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md) if a durable risk remains
- this task file itself must be updated to `Completed` before any `xinpianchang` work starts

## Reviewer Notes

- The real failure point appears to be download behavior, but the extract path should still be formally moved under the `weibo` video domain layer.
- Keep this task narrow. Finish `weibo` completely before touching `xinpianchang`.
- If extraction is clean but download still fails, do not declare success on architecture grounds alone.

## Context Delta

### Keep

- `weibo` already has host-specific patterns elsewhere in the project
- generic video extraction remains the fallback path when Weibo-specific direct media is unavailable
- direct single-file video remains the scope for this phase

### Changed

- `weibo` is now the first domain in the next ordered video-domain rollout phase
- `weibo` now has explicit video extraction and download rule entries, but successful local video download remains an open follow-up

## Final Result

Reopened for the next iteration.

- the current branch keeps the explicit Weibo video extraction and download rule entries
- this pass changes the Weibo video download path to `fetchBlob`-first and disables silent direct-download fallback for the domain so failed downloads no longer degrade into saved webpage content
- the background fetch path now rejects HTML payloads before saving, which should block `001.htm`-style false-success results if the host returns a page instead of media
- static checks and rule-structure validation were completed
- end-to-end local video download still needs real browser-page validation before the task can be marked complete
