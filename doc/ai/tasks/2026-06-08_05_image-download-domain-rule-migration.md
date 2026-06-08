# Task

## ID

2026-06-08_05

## Title

Migrate image download domain behavior into the explicit download-layer rule model

## Status

Reopened

## Goal

Move image-specific download behavior onto the Chrome plugin's explicit image download rule path so image download architecture matches the media/domain boundary model already established for extraction and partially established for download.

This task is the next priority after `2026-06-08_04_download-layer-refactor-implementation.md`.

## Scope

- create or finalize a single explicit image download rule entry path in `chrome-plugin/background.js`
- move current image-domain download behavior behind image-only rule resolution
- keep image rules separate from video rules
- keep shared download helpers as executors only
- migrate currently known image download special handling into the new image download rule path
- verify real download behavior after each domain migration
- update the minimum required `doc/` files after implementation

## Non-goals

- no new video extraction or video download capability
- no new `page-context-fetch` implementation
- no HLS, DASH, `m3u8`, or `mpd` support
- no Eagle or Lineage redesign in this task
- no extraction-side image rule redesign unless a real interface mismatch is discovered
- do not create special download rules for image domains that do not actually need them

## Background

The current codebase already has a partial download-layer split:

- image and video have separate strategy selection entry points
- image and video have separate header-rule selection entry points
- shared executors still live in `background.js`

This is enough to start migrating image download behavior now, but it is still easy for a low-capability agent to drift back into:

- shared helper host branching
- mixed image/video rule authoring
- one-off hotfixes that bypass the new rule boundary

This task exists to prevent that drift and to establish a clean pattern for future image domains and later audio support.

## Required Execution Order

1. inspect the current image download path and list the image domains that already require special handling
2. create or normalize a single image download rule shape
3. migrate `xiaohongshu` image download behavior onto that image-rule shape
4. verify real Xiaohongshu image download from a real page before moving on
5. migrate `sinaimg` / Weibo-image download behavior onto that same image-rule shape
6. verify real Weibo image download from a real page before moving on
7. check whether `behance` or any other currently validated image site actually needs a special rule
8. only create another image special rule if the site cannot work reliably through the generic image download path
9. update docs after code and verification are complete

## Hard Rules For The Coder Agent

Do not:

- modify video download rules in this task unless an image-path interface change strictly requires a tiny in-scope adjustment
- add host-specific logic back into shared executor helpers
- batch multiple image domains into one unverified change
- create a new special download rule only because a site exists
- mark a domain as complete without a real download test on the target website
- treat popup display changes as part of this task unless the download payload interface truly changes

## Plan

1. Inspect `chrome-plugin/background.js` and identify the current image-only download rule pieces.
2. Normalize image download rule resolution into one explicit image-domain rule path.
3. Keep the selected image rule responsible for:
   - domain matching
   - preferred strategy
   - required request-header behavior
   - any image-only download hints attached to the media item
4. Keep shared helpers responsible only for:
   - queueing
   - naming
   - metadata generation
   - executing the already-selected strategy
5. Migrate Xiaohongshu image download handling first.
6. Run a real Xiaohongshu image download regression before any second domain migration.
7. Migrate Sinaimg / Weibo-image download handling second.
8. Run a real Weibo image download regression before any optional third domain review.
9. Review currently working image sites such as `behance` and classify them:
   - stays generic
   - needs a special image download rule
10. Only if a site demonstrably fails through the generic path, add a new image-domain rule in the same structure.
11. Run required static checks.
12. Update the owner-layer docs and this task file.

## Acceptance Criteria

1. The codebase has a clearly identifiable image download rule entry path.
2. Image download rule authoring is separate from video download rule authoring.
3. Shared download executors are not the main place where image host-specific behavior is authored.
4. `xiaohongshu` image download behavior is resolved through the image download rule path.
5. `sinaimg` / Weibo-image download behavior is resolved through the image download rule path.
6. Each migrated domain has at least one real manual download verification recorded.
7. Sites that do not need a special image rule remain on the generic path.
8. No new video behavior is silently changed as part of this task.
9. Static checks pass:
   - `node --check chrome-plugin\background.js`
   - `node --check chrome-plugin\content.js`
   - `node --check chrome-plugin\popup.js`
   - `git diff --check`

## Implementation Constraints

### Required Boundary Rules

- preserve the existing media model: `images`, `videos`, and merged `media`
- keep image and video download rules parallel, not mixed
- keep domain-specific decisions inside rule resolution, not inside shared execution helpers
- preserve generic image download as the fallback path
- preserve currently working video download behavior

### Explicitly Forbidden

Do not:

- force every image website into a special rule
- reopen extraction-side image rule logic casually
- use this task to redesign all download files physically
- mark the task complete if image rules are still mainly authored through shared host branching

## Execution Report

### Implementation Contributor(s)

coder (documentation review only)

### Planner/Reviewer Follow-up Fixes

None yet.

### Notes

- the explicit image download rule path is already present in `chrome-plugin/background.js`
- current review confirms `xiaohongshu` and `sinaimg` / Weibo-image are routed through image-only rule builders
- `behance` does not currently justify a special image download rule in this pass
- a fresh browser-page download replay was not run in this workspace, so the real-page verification items remain pending

## Reviewer Notes

- The main structural risk is fake separation, where image strategy and image header logic still exist as separate ad hoc tables without a stable image-domain rule identity.
- If the current code can only reach a "rule bundle" shape rather than a full separate file/module shape, that is acceptable for this task as long as the boundary is explicit and reusable.
- `behance` is a classification checkpoint, not an automatic implementation target.
- If a site works through generic download, record that and stop. Do not invent extra domain rules.
- If Xiaohongshu image download is currently broken on `main` but fixed only through a narrow patch, prefer moving that behavior into the image rule path instead of reintroducing an inline hotfix.

## Context Delta

### Keep

- generic extraction and generic download must remain available when no special-domain rule is needed
- image and video remain parallel subsets under merged `media`
- download-layer cleanup is now the main architecture priority, not another extraction refactor

### Changed

- the next download-layer implementation focus is image-domain download migration, not new video capability
- image domains must now be classified explicitly as either generic-download-safe or special-rule-required

### Avoid

- using a working generic site as justification to create a redundant domain rule
- migrating multiple domains before validating the first one on a real page
- allowing image fixes to leak into video rule code paths

### Follow-up

- if image-domain migration succeeds cleanly, the next follow-up should decide whether download rules need a more formal per-media file/module split or whether the current explicit rule-entry pattern is sufficient

## Final Result

Reopened.

## Links

- `doc/ai/tasks/2026-06-08_04_download-layer-refactor-implementation.md`
- `doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md`
- `doc/architecture/DOWNLOAD_LAYER_STATUS.md`
- `chrome-plugin/background.js`
