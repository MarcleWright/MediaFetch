# Download Layer Status

## Purpose

This document records the current real status of the Chrome plugin download layer.

It exists because the extraction-side media refactor is much cleaner than the current download-side implementation, and recent video-download work has started to blur the intended boundaries again.

## Intended Model

The intended project model is:

- `media` is the shared aggregate view
- `images` and `videos` are canonical parallel subsets
- image and video each own their own:
  - generic extraction
  - domain extraction rules
  - domain download rules
  - debug evidence
  - ranking and preferred semantics
- shared layers should remain limited to:
  - facts extraction
  - metadata framework
  - merged media aggregation
  - queue shell

This means download logic should eventually mirror extraction logic in structure.

## What Is Already Structurally Healthy

The following parts are largely aligned with the intended architecture:

- canonical `images` and `videos`
- merged `media` as a shared consumer view
- image and video extraction path separation
- Xiaohongshu image and video special-domain rules living on separate paths
- popup state split into image/video-aware structures

This is the architectural direction established in the June 5 refactor phase.

## Where The Current Download Layer Is Still Dirty

The current download layer is still not fully as clean as the extraction layer, but the main rule-switchboard problem has been reduced.

Main symptoms:

1. `background.js` still owns the shared download queue and execution shell.

Examples:

- `downloadMediaBatch(...)`
- `executeDownloadStrategy(...)`

2. domain-specific download behavior is now expected to live behind explicit media-type entry points such as:

- `selectImageDownloadStrategy(...)`
- `selectVideoDownloadStrategy(...)`
- `getImageDownloadStrategyRule(...)`
- `getVideoDownloadStrategyRule(...)`
- `getImageDownloadHeaderRule(...)`
- `getVideoDownloadHeaderRule(...)`

3. future domain additions should extend the media-type rule builders rather than reintroducing host branching in the shared executor path.

This is functional for experimentation, but it is not the target architecture.

## Current Gap Between Extraction And Download

Extraction is closer to the intended model:

- `getImageDomainRule(...)`
- `getVideoDomainRule(...)`
- media-type-specific rule entry points

Download is behind extraction in structure.

The missing equivalent is a clean domain-rule entry system for downloads, for example:

- `getImageDownloadRule(...)`
- `getVideoDownloadRule(...)`
- `applyDownloadRule(...)`

The exact names may differ, but the structural boundary should move in that direction.

## What Should Not Happen Going Forward

The project should avoid these patterns:

- adding more host-specific conditions directly into large shared download helpers
- treating a temporary domain hotfix as final architecture
- mixing image and video download semantics in a single undifferentiated rule table
- expanding shared helpers until they become the real domain-rule layer by accident

## Current Practical Interpretation

The repository should currently be understood like this:

1. the media extraction architecture is mostly on the intended path
2. the media download architecture is still transitional, but now has explicit image/video download rule entry points and rule resolvers
3. current download work should prefer structural cleanup over repeated inline host patches

## Recommended Next Architectural Step

The next architectural step is not another broad extraction refactor.

It is to finish the download-layer boundary work so that download structure mirrors extraction structure more closely.

Recommended direction:

1. keep adding new domain download rules behind the explicit image/video entry layers
2. let shared download helpers remain executors, not rule authors
3. keep strategy execution generic, but keep strategy selection rule-driven

## Summary

The June 5 refactor largely succeeded at the media-boundary level.

The main architectural debt now sits in the download layer, but the download-side rule entry split is now in place.

The correct project interpretation is:

- media boundary work is mostly intact
- download rule architecture is no longer a single host switchboard, but still needs disciplined extension
