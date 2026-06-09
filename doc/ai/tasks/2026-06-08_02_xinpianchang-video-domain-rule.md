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

The current implementation is not yet accepted because real downloads still fail before a stable local media file is saved.

The current code now has a dedicated `xinpianchang` extract rule and a dedicated `xinpianchang` download-rule entry.

Observed failure chain across the current passes:

1. shared direct download could degrade into `001.htm` / webpage content
2. `fetchBlob`-first execution removed that false-success mode, but background fetch still hit `403`
3. offscreen blob-download execution exposed a real async implementation bug once, which was fixed, but the real host restriction remained
4. inline page-context script injection was blocked by site CSP
5. external bridge-script loading did not stabilize reliably enough to become the accepted path
6. main-world page `fetch(...)` still failed with `Failed to fetch`
7. direct navigation to the extracted `xpccdn` media URL still returned `403 Forbidden`

What this means structurally:

- extraction is currently the solved part for `xinpianchang`
- the blocker is specifically end-to-end download execution against the protected media host
- header-only fixes are not sufficient
- generic `direct` and generic `fetchBlob` are both insufficient as final solutions for this host
- future work should start from a stronger domain-specific bypass path such as iframe/browser-context bypass or a helper-assisted path instead of repeating small shared-executor tweaks

The next pass must re-verify the full end-to-end download path against the actual extracted media host from the page-attached video URL. The current validated sample resolves to `us-xpc5-l.xpccdn.com`.

## Context Delta

### Keep

- `xinpianchang` already demonstrates that generic extraction can find the right file while generic download still fails

### Changed

- the validated failure point is now narrowed to protected download execution against the extracted `xpccdn` media host
- the repository now has concrete evidence that inline page injection, main-world `fetch`, and direct navigation can all still fail against this host
- a later playback probe now confirms the same extracted MP4 URL succeeds in the browser through `type: media` requests with `206 Partial Content`

### Avoid

- do not retry small header-only or generic-executor-only tweaks as if the failure were still ambiguous
- do not treat a selected correct MP4 URL as proof that browser-only saving is already solved

### Follow-up

- the next implementation pass for `xinpianchang` should begin from a media-request-based special download executor, not another minor variation of shared `direct` or shared `fetchBlob`
- see [2026-06-09_01_xinpianchang-media-request-download-executor.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/tasks/2026-06-09_01_xinpianchang-media-request-download-executor.md)
