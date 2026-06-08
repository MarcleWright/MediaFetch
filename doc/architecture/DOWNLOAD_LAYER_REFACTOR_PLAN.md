# Download Layer Refactor Plan

## Purpose

Define the target structure for the Chrome plugin download layer so it reaches the same boundary quality as the existing media extraction layer.

This document is architecture guidance, not a task execution log.

## Problem Statement

The current Chrome plugin architecture is uneven:

- extraction is already largely separated by media type and by domain rule
- download is still too centralized inside shared background helpers

Current download behavior still tends to accumulate:

- host-specific conditions
- media-type conditions
- strategy heuristics
- temporary hotfixes

inside the same shared functions.

This creates two risks:

1. the shared download layer becomes an accidental domain-rule layer
2. image and video boundaries become less clear over time

## Refactor Goal

The download layer should mirror the extraction layer more closely.

Target outcome:

- `media` remains the shared aggregate view
- `images` and `videos` remain canonical subsets
- image and video each gain their own explicit download rule entry layer
- shared download code becomes an executor, not a host-specific rule author

## Target Boundary Model

### Shared Download Layer

The shared layer should own only:

- queue lifecycle
- task scheduling
- metadata file generation
- file naming shell
- generic browser download execution
- generic blob download execution
- shared completion / error reporting

The shared layer should not decide:

- which domain rule applies
- which media-type-specific rule applies
- which host-specific headers should be used
- which platform-specific strategy should be preferred

### Media-Type Download Layers

These concerns should be owned separately by media type:

- image download rule selection
- video download rule selection
- image-only download semantics
- video-only download semantics

Current active media types:

- image
- video

Planned future type:

- audio

### Domain Download Rules

Within each media type, domain-specific behavior should be explicit.

Example conceptual shape:

```text
download/
  shared/
  image/
    generic/
    domains/
  video/
    generic/
    domains/
```

Physical files do not need to match this exact directory tree immediately, but the responsibility split should move toward this model.

## Target Rule Flow

The intended decision flow is:

1. determine media type
2. determine domain
3. resolve download rule
4. resolve concrete strategy from that rule
5. execute the strategy through shared executors

This is the conceptual direction:

```text
getImageDownloadRule(host, item, context)
getVideoDownloadRule(host, item, context)
  -> returns rule

resolveDownloadStrategy(rule, item, context)
  -> returns strategy

executeDownloadStrategy(strategy, item, context)
  -> shared executor path
```

The exact names may differ, but the boundary should follow this shape.

## Download Strategy Model

The strategy layer should be media-aware but still generic in execution.

Current near-term strategy set should remain narrow:

- `direct`
- `fetchBlob`
- planned MVP addition: `page-context-fetch`

Important rule:

- shared executors may know how to run these strategies
- shared executors should not contain expanding host-specific if/else chains

## Relationship To The Existing Media Model

This refactor should preserve the current media model:

- `images` and `videos` stay canonical
- merged `media` stays a shared consumer view
- domain extraction rules remain separate from download rules

Download refactor should not re-open extraction-side boundary work unless a true interface mismatch is discovered.

## Recommended Functional Split

### Shared Functions That Should Remain Shared

Examples of concerns that should stay shared:

- `downloadMediaBatch(...)`
- download queue progression
- filename generation
- metadata sentinel handling
- final browser save call

These functions may still need refactoring, but their responsibility should remain generic.

### Functions That Should Become Rule-Driven

Examples of concerns that should stop being large shared switchboards:

- strategy selection
- header-rule selection
- domain-specific request preparation
- page-context-fetch eligibility

These should be resolved by explicit media-type and domain rule lookup.

## Phased Refactor Direction

### Phase 1

Stabilize the rule interfaces without changing too much behavior.

Goals:

- add explicit image download rule entry point
- add explicit video download rule entry point
- move host-specific branching behind those rule-entry functions

### Phase 2

Shrink shared host branching.

Goals:

- reduce domain checks inside background shared helpers
- move header profile selection into domain download rules
- keep shared code focused on execution only

### Phase 3

Align strategy execution with the new video-download MVP.

Goals:

- keep `direct` generic
- keep `fetchBlob` generic
- add `page-context-fetch` as a strategy executor
- let domain rules choose when to use it

## Explicit Non-goals

This architecture plan does not require:

- HLS support
- DASH support
- audio/video muxing
- LibAV / ffmpeg / WASM
- Eagle or Lineage video integration
- a local desktop helper

Those are later capability questions, not required to clean up the download boundary model.

## Success Criteria

The download layer can be considered structurally aligned when:

1. image and video each have explicit download rule entry points
2. shared helpers are no longer the main place where host-specific download behavior is authored
3. adding a new domain download rule does not require growing a central host-branching function
4. extraction and download have comparable media/domain boundary quality

## Practical Interpretation

The correct next architecture move is:

- do not keep stacking domain hotfixes into shared background functions
- finish download-layer classification and rule separation
- then continue domain-specific media support on top of that cleaner base
