# Data Model

## Overview

The Chrome plugin now uses a layered media result model.

Canonical outputs remain per media type.

Merged output exists only for shared consumers such as popup rendering and the mixed-media queue.

## Core Entities

### Project Facts

Shared facts include:

- `platform`
- `domain`
- `projectUrl`
- `normalizedUrl`
- `title`
- `username` / display author
- `authorId`
- `projectId`
- `publishedAt`
- `publishedDateCode`
- `publishedTimeCode`

### Canonical Media Collections

- `images`
- `videos`

These remain the canonical per-type outputs.

### Merged Media Collection

- `media`

This is a convenience aggregation layer only.

It must not become the only truth source for image logic.

### Metadata Summary

Current metadata fields include:

- `imageCount`
- `originalCount`
- `videoCount`
- `counts.images`
- `counts.videos`

## Relationships

- facts feed folder naming and metadata generation
- image extraction feeds canonical `images`
- video extraction feeds canonical `videos`
- merged `media` is derived from canonical collections
- queue and popup may consume merged `media`

## Important Constraints

1. image and video rule layers must stay separate
2. generic extraction must exist even when no special-domain rule is present
3. `originalCount` remains image-specific in the current phase
4. current first video phase supports only direct single-file videos
