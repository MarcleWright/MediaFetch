# Agent Task: Rule Boundary Cleanup

## Purpose

This task is a narrow structural cleanup pass for the MediaFetch Chrome plugin.

Do not add new features.

Do not expand product scope.

The only goal is to finish two incomplete boundary fixes:

1. make image domain-rule and generic-image boundaries real, not just named wrappers
2. make popup merged-media assembly use an explicit helper instead of ad hoc array concatenation

This task is intentionally small and mechanical.

## Why This Task Exists

The current code already has:

- `extractImagesForPage(...)`
- `extractGenericImages(...)`
- `getImageDomainRule(...)`
- `extractVideosForPage(...)`
- `extractGenericVideos(...)`
- `getVideoDomainRule(...)`
- `mergeMediaResults(...)`

But two problems remain:

### Problem 1

`extractGenericImages(...)` still contains image platform-specific behavior through `collectPlatformMedia(...)`.

That means “generic image fallback” is not really generic yet.

The name exists, but the boundary is not real.

### Problem 2

`popup.js` still assembles `state.media` manually with direct array concatenation in more than one place.

That means the merged media boundary is not consistently reused.

## Hard Constraints

### Files Allowed

Modify only:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js)

Do not modify:

- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)
- manifest files
- build scripts
- README files unless explicitly needed for an implementation note

### Forbidden Changes

Do not do any of these:

1. do not add video special-domain rules
2. do not add image special-domain rules
3. do not rewrite image extraction behavior
4. do not rewrite video extraction behavior
5. do not touch download logic
6. do not change Eagle or Lineage behavior
7. do not redesign the popup
8. do not rename unrelated functions
9. do not add audio support
10. do not change extraction-range behavior

## Required End State

After this task:

1. image generic fallback must be a real generic path
2. image platform-specific augmentation must be reached through the image domain-rule path
3. popup merged-media state must be assembled through a helper
4. no visible image behavior should change
5. no visible video behavior should change

## Task A: Clean Up Image Rule Boundary In `content.js`

### Goal

Separate these two concepts clearly:

- generic image extraction
- image domain/platform augmentation

### Current Problem

Right now:

- `extractImagesForPage(...)` exists
- `getImageDomainRule(...)` exists
- but `extractGenericImages(...)` still calls `collectPlatformMedia(...)`

That means the generic path still includes special-domain behavior.

### Required Result

The final flow must look like this:

```js
extractImagesForPage(...)
  -> getImageDomainRule(host)
  -> if rule exists, use image domain path
  -> else use extractGenericImages(...)
```

Where:

- `extractGenericImages(...)` means truly generic image extraction
- image platform-specific logic is applied only in the image domain path

### Step-by-Step Instructions

#### Step 1

Find the current image extraction flow in:

- `extractImagesForPage(...)`
- `extractGenericImages(...)`
- `collectPlatformMedia(...)`

Understand how platform-specific originals are currently being applied.

Do not change anything yet.

#### Step 2

Create a new helper dedicated to the current platform-aware image path.

Recommended names:

- `extractDomainImages(...)`
- or `extractPlatformAwareImages(...)`

Use one clear name and keep it literal.

This helper should contain the current image path that needs:

- `collectPlatformMedia(...)`
- platform original URL handling
- platform original detection support
- platform-specific debug enrichment

Important:

- move existing logic carefully
- do not rewrite the algorithms
- only move the boundary

#### Step 3

Refactor `extractGenericImages(...)` so that it becomes truly generic.

That means:

- it should scan image candidates from generic sources
- it should not depend on `collectPlatformMedia(...)`
- it should not depend on platform original URL sets
- it should not apply platform-specific original URL augmentation

If needed, generic image extraction may produce:

- generic candidate list
- generic sorting
- generic original detection without platform URL whitelists

Important:

- keep the existing generic behavior as much as possible
- do not try to “improve” extraction quality in this task

#### Step 4

Refactor `getImageDomainRule(host)` so that supported image platforms return the new domain/platform-aware helper.

Expected effect:

- supported image platforms use the platform-aware image path
- unsupported platforms use the generic image path

Important:

- do not add new hosts
- do not remove existing supported hosts

#### Step 5

Confirm `extractImagesForPage(...)` now does real branching:

- supported host -> image domain rule path
- unsupported host -> generic image path

### Acceptance For Task A

Task A is complete only if all are true:

1. `extractGenericImages(...)` no longer calls `collectPlatformMedia(...)`
2. platform-specific image augmentation still exists, but outside the generic image path
3. `getImageDomainRule(host)` returns the platform-aware path for supported image hosts
4. unsupported hosts still use generic image extraction
5. current special image-domain behavior is preserved

## Task B: Reuse a Merge Helper In `popup.js`

### Goal

Stop manually assembling `state.media` in multiple places with direct array concatenation.

### Current Problem

`popup.js` still does:

```js
state.media = [...state.images, ...state.videos]
```

in more than one place.

This duplicates merge behavior.

### Required Result

Use one explicit helper in `popup.js` for merged media assembly.

Recommended name:

- `mergePopupMedia(images, videos)`

or:

- `buildMergedPopupMedia(images, videos)`

Use one clear name and keep it consistent.

### Step-by-Step Instructions

#### Step 1

Search `popup.js` for all places where `state.media` is built from `state.images` and `state.videos`.

#### Step 2

Add one helper function in `popup.js`:

```js
function mergePopupMedia(images, videos) {
  ...
}
```

Responsibilities:

- accept image array
- accept video array
- return merged array

Do not add filtering logic to this helper.

Do not add selection logic to this helper.

#### Step 3

Replace all direct `[...state.images, ...state.videos]` style assembly with the helper.

This includes:

- initial application of extraction response
- state sync operations
- any other merged-media rebuild point

#### Step 4

Keep image and video canonical state separate.

That means:

- `state.images` remains separate
- `state.videos` remains separate
- `state.media` is still just the merged convenience list

### Acceptance For Task B

Task B is complete only if:

1. `popup.js` uses an explicit merge helper
2. direct manual array concatenation for merged media assembly is removed from normal code paths
3. image and video canonical arrays remain separate

## Exact Validation Commands

Run all of these after editing:

```powershell
node --check chrome-plugin\content.js
node --check chrome-plugin\popup.js
git diff --check
```

Do not skip them.

## Manual Reasoning Checklist

Before finishing, reason-check these cases:

1. supported image domain still uses platform-specific image behavior
2. unsupported image domain still uses generic image behavior
3. video extraction path is unchanged
4. popup still shows merged results correctly
5. `state.images` and `state.videos` still remain separate

## Required Final Report Format

When finished, report exactly:

1. what new helper was added for platform-aware image extraction
2. whether `extractGenericImages(...)` still calls `collectPlatformMedia(...)`
3. how `getImageDomainRule(host)` now branches
4. what popup merge helper was added
5. where direct merged-media concatenation was removed
6. which validation commands were run
7. any residual risk

Do not answer vaguely.

Do not say “done” without the details above.

## Definition Of Done

This task is complete only if:

1. image generic fallback is truly generic
2. image domain/platform augmentation is outside the generic image function
3. popup merged-media assembly uses one helper
4. `node --check` passes for changed files
5. `git diff --check` passes

## Execution Result

Completed on 2026-06-05.

Implemented outcomes:

- split the image path into a platform-aware domain helper and a truly generic fallback helper
- made `getImageDomainRule(host)` branch to the platform-aware helper for supported hosts and `null` for unsupported hosts
- kept platform-specific image augmentation outside the generic image path
- added `mergePopupMedia(images, videos)` and replaced direct merged-media array concatenation in popup state rebuild paths

Validation performed:

- `node --check chrome-plugin/content.js`
- `node --check chrome-plugin/popup.js`
- `git diff --check`

Residual risk:

- the generic and platform-aware image helpers intentionally retain some duplication to preserve the boundary
- future cleanup should not collapse those paths back into one shared image pipeline

Archived record:

- canonical copy stored at [doc/ai/tasks/2026-06-04_01_rule-boundary-cleanup.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/tasks/2026-06-04_01_rule-boundary-cleanup.md)
