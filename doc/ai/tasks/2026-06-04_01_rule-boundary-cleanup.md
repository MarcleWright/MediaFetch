# Task

## ID

2026-06-04_01

## Title

Rule boundary cleanup for generic image fallback and popup merged-media assembly

## Status

Completed

## Goal

Finish the remaining structural cleanup from the image/video boundary pass:

1. make image domain-rule and generic-image boundaries real
2. make popup merged-media assembly use an explicit helper

## Scope

- move platform-aware image handling out of the generic image fallback path
- keep generic image extraction truly generic
- keep video extraction behavior unchanged
- replace manual popup merged-media concatenation with one helper

## Non-goals

- new image special-domain rules
- new video special-domain rules
- any download logic change
- any Eagle or Lineage behavior change
- extraction-range behavior change

## Plan

1. inspect current image and popup merge boundaries
2. split platform-aware image behavior into a separate helper
3. make generic image fallback truly generic
4. add one popup merge helper and replace direct merged-array concatenation
5. validate with syntax and diff checks

## Acceptance Criteria

- `extractGenericImages(...)` no longer depends on platform media collection
- supported image hosts still use platform-aware image behavior
- unsupported image hosts still use generic image behavior
- popup merged-media assembly goes through one helper
- image and video canonical arrays remain separate

## Execution Report

- split the image path into `extractDomainImages(...)` and `extractGenericImages(...)`
- made `getImageDomainRule(host)` branch explicitly between supported host handling and `null`
- added `mergePopupMedia(images, videos)` and routed popup state rebuilds through it
- preserved existing visible image and video behavior
- validated the changed files with `node --check` and `git diff --check`

## Context Delta

### Keep

- generic image fallback must remain truly generic
- platform-aware image augmentation stays outside the generic image function
- popup merged-media state should be assembled through a helper

### Avoid

- collapsing generic and platform-aware image paths back together
- reintroducing ad hoc merged-media array concatenation in popup

## Final Result

The remaining rule-boundary cleanup was completed without changing video behavior or expanding product scope.
