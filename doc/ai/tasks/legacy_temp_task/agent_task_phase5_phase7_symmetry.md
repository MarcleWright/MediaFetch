# Agent Task: Phase 5 and Phase 7 Symmetry Pass

## Purpose

This task is a constrained follow-up pass for the MediaFetch Chrome plugin.

Do not add new product scope.

The goal is to fix structural asymmetry that still remains after the first video extraction pass.

This task must complete two things only:

1. make image and video rule entry points structurally symmetric
2. make the shared download layer truly media-neutral in naming and flow

## Current Situation

The codebase already has partial media support:

- `images`, `videos`, and merged `media` all exist
- extraction range already affects execution
- generic video extraction already exists
- popup state is partially split into `state.images`, `state.videos`, and `state.media`

However, the architecture is still incomplete:

- video has a rule-entry shape
- image still mostly uses the older platform image path
- the download layer accepts mixed media, but core naming is still image-oriented

This task exists to finish that structural alignment.

## Hard Constraints

### Allowed Files

You may modify only these files unless absolutely necessary:

- [chrome-plugin/content.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/content.js)
- [chrome-plugin/popup.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/popup.js)
- [chrome-plugin/background.js](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/background.js)
- [temp_task/video_extraction_implementation_plan.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/temp_task/video_extraction_implementation_plan.md) only if you need to append an implementation note

### Forbidden Changes

Do not do any of the following:

1. do not add any new special-domain video rule
2. do not add any new special-domain image rule
3. do not rewrite current image extraction behavior
4. do not expand video scope beyond single-file videos
5. do not add HLS support
6. do not add DASH support
7. do not add blob URL final-download support
8. do not change Eagle to support video
9. do not change Lineage to support video
10. do not redesign the popup UI
11. do not make merged `media` the only source of truth for images
12. do not implement audio

## Task A: Make Rule Entry Points Symmetric

### Goal

Image and video must both have explicit rule-entry functions and explicit generic fallback functions.

The final code should have the following logical shape:

```js
extractImagesForPage(...)
extractVideosForPage(...)
getImageDomainRule(host)
getVideoDomainRule(host)
extractGenericImages(...)
extractGenericVideos(...)
```

### Required Outcome

Image must no longer enter through a completely different style of pipeline than video.

Video already has:

- `extractVideosForPage()`
- `getVideoDomainRule()`
- `extractGenericVideos()`

Image must be brought to the same architectural shape.

### Required Implementation

#### 1. Add `extractImagesForPage(...)`

Create an explicit image entry function.

Responsibilities:

- accept the current image extraction inputs
- determine the current host
- try image domain rule first
- fall back to generic image extraction

Important:

- this is an architectural wrapper
- it must preserve existing image behavior
- do not rewrite image extraction logic

#### 2. Add `getImageDomainRule(host)`

Create an explicit image rule lookup function.

This function should connect the current image platform logic into the same conceptual rule-selection model used by video.

Important:

- you are not required to physically split files
- you are required to expose an explicit image rule lookup boundary

#### 3. Add `extractGenericImages(...)`

Create an explicit generic image fallback function.

This may wrap the current image path if needed.

The purpose is not to change image extraction quality.

The purpose is to make generic fallback explicit and symmetrical with video.

#### 4. Refactor `extractMediaFromPage(...)`

It must call:

- `extractImagesForPage(...)`
- `extractVideosForPage(...)`

Do not let `extractMediaFromPage(...)` directly use the older image path after this task.

### Acceptance For Task A

Task A is complete only if:

1. image and video each have explicit rule-entry functions
2. image and video each have explicit generic fallback functions
3. no new image behavior regressions are introduced
4. generic image fallback still exists when no image domain rule is used
5. generic video fallback still exists when no video domain rule is used

## Task B: Add a Minimal Merge Boundary

### Goal

The merged `media` list should be clearly treated as a shared-consumer convenience layer, not the canonical source for image logic.

### Required Implementation

#### 1. Add `mergeMediaResults(...)`

If the function does not already exist, add a small helper with a narrow purpose.

Responsibilities:

- accept canonical `images`
- accept canonical `videos`
- return merged `media`

Do not put rule-selection logic inside this function.

Do not put image/video extraction logic inside this function.

#### 2. Use It Only For Shared Consumers

The merged `media` result is for:

- popup rendering convenience
- shared selection convenience
- shared download queue convenience

It is not for:

- image rule logic
- image original detection
- image domain extraction decisions

### Acceptance For Task B

Task B is complete only if:

1. merged `media` is assembled through a clear merge boundary
2. image logic still uses canonical image output
3. video logic still uses canonical video output

## Task C: Make Download Layer Naming Media-Neutral

### Goal

The shared download layer must stop pretending to be image-only when it now handles mixed media.

### Required Implementation

#### 1. Rename `downloadImageBatch(...)`

Rename it to a media-neutral name.

Recommended:

```js
downloadMediaBatch(...)
```

All call sites must be updated.

Behavior must remain equivalent.

#### 2. Audit Image-Oriented Naming In Shared Download Flow

Rename any clearly shared mixed-media function or variable that still uses image-only naming, when the rename is low risk and improves structural clarity.

Examples of what should be reviewed:

- task payload naming
- selected item naming
- mixed-media queue naming
- mixed-media status/error messages

Do not rename image-only functions that are still truly image-only, such as:

- Eagle image save helpers
- image-specific original download helpers

#### 3. Keep Media-Type Boundaries Intact

The shared queue may process mixed media items, but:

- Eagle must still receive only images
- Lineage must still receive only completed download file paths
- `originalCount` must still count only image originals

### Acceptance For Task C

Task C is complete only if:

1. the main mixed-media batch download function is media-neutral in name
2. all updated call sites still work
3. image download behavior remains unchanged
4. video single-file download still works
5. Eagle and Lineage remain image-only

## Required Review Rules

While implementing, follow these rules:

1. do not make one domain rule branch on `mediaType`
2. do not collapse image and video into one mixed rule function
3. do not replace canonical `images` with merged `media`
4. do not expand current product behavior
5. do not do unrelated cleanup

## Suggested Implementation Order

Implement in this order:

1. add `extractGenericImages(...)`
2. add `getImageDomainRule(host)`
3. add `extractImagesForPage(...)`
4. refactor `extractMediaFromPage(...)` to use symmetric entry points
5. add `mergeMediaResults(...)`
6. rename `downloadImageBatch(...)` to `downloadMediaBatch(...)`
7. update download call sites
8. run checks

Do not skip the order.

## Required Validation Commands

Run all of these:

```powershell
node --check chrome-plugin\content.js
node --check chrome-plugin\popup.js
node --check chrome-plugin\background.js
git diff --check
```

## Minimum Manual Validation

At minimum, reason-check these cases after edits:

1. image-only extraction on a currently supported image domain
2. generic page with images
3. generic page with direct HTML5 single-file video
4. `images` extraction range
5. `videos` extraction range
6. `both` extraction range
7. selected mixed-media download path

## Required Final Report Format

When finished, report all of the following explicitly:

1. which functions were added
2. which functions were renamed
3. how image rule lookup now works
4. how video rule lookup now works
5. how merged `media` is now assembled
6. how the shared download layer naming was neutralized
7. which checks were run
8. which implementation phases are still incomplete

Do not say “basically done”.

Do not say “mostly complete”.

Be specific.

## Definition Of Done

This task is complete only if all are true:

1. image and video have explicit symmetric rule-entry boundaries
2. generic fallback still works for image and video when no special rule exists
3. merged `media` is clearly a merge layer, not the image truth source
4. shared download batch naming is media-neutral
5. image behavior is not regressed
6. video direct single-file download is not regressed
7. all required validation commands pass
