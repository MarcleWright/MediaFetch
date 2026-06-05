# Task

## ID

2026-06-05_01

## Title

Bootstrap `doc/` system governance for MediaDownloader

## Status

Completed

## Goal

Create a standardized `doc/` documentation system and route current durable project knowledge into owner layers.

## Scope

- create `doc/` backbone
- create owner-layer core files
- create AI workflow and decision records
- preserve existing root and `temp_task` docs as transitional source material

## Non-goals

- full migration of every historical document
- deletion of existing root docs
- deletion of `temp_task`

## Plan

1. inspect existing documentation state
2. classify existing docs by owner layer
3. create minimal `doc/` backbone
4. add AI context, workflow, and decision records
5. keep legacy docs linked during transition

## Acceptance Criteria

- `doc/` exists and is navigable
- owner-layer files exist for current project needs
- AI records are separated from stable truth
- known risks remain visible in durable docs

## Execution Report

- created `doc/` root and owner-layer documents
- created AI workflow, context, decision, and task records
- linked existing root docs and `temp_task` records as legacy source material
- promoted current durable media-boundary decisions and risks into `doc/`

## Reviewer Notes

- system intentionally starts small
- deeper migration from mixed legacy docs can continue gradually

## Context Delta

### Keep

- `doc/` is now the standardized durable documentation root
- `temp_task/` still holds execution-oriented task history

### Changed

- durable project knowledge now has owner-layer homes under `doc/`

### Avoid

- creating new mixed catch-all specs outside `doc/`

### Follow-up

- when the first Xiaohongshu video domain rule is implemented, update:
  - `doc/architecture/`
  - `doc/design/` if UI behavior changes
  - `doc/engineering/KNOWN_ISSUES.md` if new risk remains

## Final Result

The repository now has a minimal but standardized documentation system that separates stable truth from AI execution history and gives future agents a clear navigation root.
