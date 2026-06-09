# Task

## ID

2026-06-08_00

## Title

Roll out video domain rules in strict order: `weibo` first, `xinpianchang` second

## Status

Reopened

## Goal

Coordinate the next two video-domain tasks so the coder agent completes the `weibo` video rule work first, verifies it, and only then starts the `xinpianchang` video rule work.

## Scope

- define the required execution order for the next domain-specific video tasks
- keep `weibo` and `xinpianchang` work separated by domain
- require domain-level completion and verification before moving to the next domain
- preserve the current generic video path as fallback unless a domain task explicitly changes that domain

## Non-goals

- no direct code changes in this coordination task
- no new architecture changes by itself
- no support for `youtube`, `bilibili`, or embedded `googlevideo` flows in this phase

## Required Execution Order

1. Complete [2026-06-08_01_weibo-video-domain-rule.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/tasks/2026-06-08_01_weibo-video-domain-rule.md)
2. Verify `weibo` results against the task acceptance criteria
3. Update the `weibo` task file to `Completed` and append the corresponding `DEV_LOG` entry
4. Only after `weibo` is complete and documented, start [2026-06-08_02_xinpianchang-video-domain-rule.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/tasks/2026-06-08_02_xinpianchang-video-domain-rule.md)

## Hard Rule For The Coder Agent

Do not work on `xinpianchang` until the `weibo` task is fully completed and verified.

Do not parallelize the two domains.

Do not batch both domains into one code change without an intermediate verification point.

Do not start the second domain until the first domain task file and `DEV_LOG` have both been updated.

## Acceptance Criteria

1. `weibo` and `xinpianchang` each have their own task file.
2. The coder agent can follow the tasks sequentially without ambiguity.
3. The order requirement is explicit enough that a low-capability agent should not start the second domain early.

## Context Delta

### Keep

- generic video extraction remains useful as a fallback path
- domain-specific download behavior is now the main blocker for some video sites

### Changed

- the next implementation phase is now explicitly sequenced by domain instead of grouped into one mixed task

## Final Result

- the ordered rollout boundary was followed: `weibo` was completed before `xinpianchang`
- the `xinpianchang` task has been reopened because end-to-end download verification still failed after the first rollout pass
- the current code now has separate `weibo` and `xinpianchang` download-rule entries, but the ordered rollout should not be treated as fully complete until the reopened `xinpianchang` task passes real download validation

## Context Delta

### Keep

- generic video extraction remains the fallback path unless a domain rule explicitly replaces it for that host

### Changed

- the ordered rollout remains documented, but the second domain is reopened and still needs final validation
