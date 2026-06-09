# Task

## ID

2026-06-08_02

## Title

Implement `xinpianchang` video domain extraction and download rules

## Status

Reopened

## Goal

Move `xinpianchang` video handling into explicit domain rules so extraction and download no longer depend on the generic video path for this host.

## Scope

- add a `xinpianchang` video extract special-domain rule
- add a `xinpianchang` video download special-domain rule
- keep the rule scoped to direct single-file video handling only
- preserve generic video fallback behavior outside the `xinpianchang` domain
- update the minimum required owner-layer docs after implementation

## Non-goals

- no `weibo` work in this task
- no `youtube` support
- no `bilibili` support
- no HLS support
- no DASH support
- no image-rule changes

## Background

Current evidence shows:

1. `xinpianchang` can already expose a plausible maximum-size direct MP4 candidate through the current generic path
2. the direct MP4 still fails to download reliably, and direct opening can return `403 Forbidden`
3. this strongly suggests the host needs a domain-specific download path rather than more generic extraction heuristics
4. latest validation shows the current implementation can still save `001.htm` / webpage content instead of the target media file
5. latest field evidence shows the real page-attached media URL should be treated by its actual extracted media host, and the current validated sample resolves to `us-xpc5-l.xpccdn.com`

## Plan

1. Start this task only after `weibo` is fully completed and verified.
2. Inspect the current `xinpianchang` extraction results and identify the most stable host-specific extraction entry point.
3. Add a `xinpianchang` video special-domain extract rule under the video-domain path.
4. Add a `xinpianchang` video download rule that applies any host-specific request behavior needed for successful downloads.
5. Keep the implementation limited to direct single-file video handling.
6. Preserve generic fallback behavior for non-`xinpianchang` hosts.
7. Run the required static checks and verify against at least two real `xinpianchang` video posts when available.
8. Confirm that at least one real `xinpianchang` video download succeeds end-to-end.
9. Update the minimum required docs after implementation.

## Acceptance Criteria

1. `xinpianchang` video extraction no longer depends solely on the generic video path.
2. `xinpianchang` video download no longer depends solely on the generic video download path.
3. The selected `xinpianchang` video result remains a direct single-file video URL.
4. At least one real `xinpianchang` video download succeeds end-to-end on the tested domain.
5. Validation covers at least two real `xinpianchang` posts when available, or one real post plus one explicit fallback-path check if a second stable sample is not available.
6. The task does not alter `weibo` behavior beyond shared reusable helpers that are already proven safe.
7. Static checks pass:
   - `node --check chrome-plugin\\content.js`
   - `node --check chrome-plugin\\popup.js`
   - `node --check chrome-plugin\\background.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- keep `xinpianchang` video logic inside the video domain-rule and video download-rule layers
- do not move `xinpianchang` video logic into image-domain files
- do not start this task until `weibo` is complete

### Explicitly Forbidden

Do not:

- start this task before `weibo` is finished
- batch `weibo` and `xinpianchang` code into one implementation pass
- expand this task into streaming-media support
- mark the task complete without confirming a real successful `xinpianchang` download

## File Targets

Primary expected code files:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)

Expected documentation updates after implementation:

- [doc/ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
- [doc/engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md) if a durable risk remains
- this task file itself must be updated to `Completed`

## Reviewer Notes

- The strongest current signal is that `xinpianchang` download behavior is host-protected, so do not spend this task trying to generalize the full web.
- Keep this task narrow and domain-specific.
- If extraction is clean but download still fails, the task is not complete.

## Context Delta

### Keep

- `xinpianchang` already demonstrates that generic extraction can find the right file while generic download still fails

### Changed

- `xinpianchang` is now the second domain in the ordered video-domain rollout phase

## Final Result

Attempted twice, and still reopened after validation failure.

The current implementation is not yet accepted because real downloads can still save `001.htm` / webpage content instead of the media file.

The current code now has a dedicated `xinpianchang` extract rule and a dedicated `xinpianchang` download-rule entry.

The latest pass changes the Xinpianchang video download path back to `fetchBlob`-first, rejects HTML payloads before saving, and disables silent direct-download fallback for this domain so failed host-protected requests no longer degrade into saved webpage content.

The next pass must re-verify the full end-to-end download path against the actual extracted media host from the page-attached video URL. The current validated sample resolves to `us-xpc5-l.xpccdn.com`.
