# ADR-0001 Media And Documentation Boundaries

## Status

Accepted

## Context

The Chrome plugin is evolving from an image-only extractor toward a multi-media system.

Early video work showed that if media boundaries are not explicit, image behavior regresses.

The repository also accumulated planning and execution knowledge mainly in root files and `temp_task/`, which makes durable project memory harder to maintain.

## Decision

1. image and video must remain separated at extraction, rule, debug, and strategy layers
2. generic extraction must remain available when no special-domain rule exists
3. canonical per-type outputs must remain separate from merged `media`
4. `doc/` is the standardized durable documentation root
5. `temp_task/` remains valid for execution planning and legacy task detail, but durable knowledge should be promoted into `doc/`

## Consequences

- future `audio` support can follow the same media-type layering
- low-capability agents need narrower tasks because boundary mistakes have high regression risk
- known risks must be recorded in durable docs instead of staying only in task notes
