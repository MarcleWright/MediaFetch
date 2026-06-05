# Architecture Overview

## System Purpose

MediaDownloader hosts two related products:

- `local-web/`: local Node-based extraction and download flow
- `chrome-plugin/`: Chrome extension that extracts media from the current logged-in browser tab

The active architectural work is focused on the Chrome plugin.

## Main Modules

- workspace root:
  - build scripts
  - shared repository-level docs
- `local-web/`
  - local extraction workflow
- `chrome-plugin/`
  - content extraction
  - popup UI
  - background queue and download handling
  - external image integrations

## Responsibility Boundaries

### Shared Layer

These concerns are shared across media types:

- project facts extraction
- folder naming
- metadata framework
- extraction-range selection
- merged media aggregation
- shared download queue shell

### Media-Type Layers

These concerns must remain separated by media type:

- candidate extraction
- domain rules
- ranking
- preferred/original semantics
- debug evidence
- strategy selection

Current active media types:

- image
- video

Planned future type:

- audio

## Xiaohongshu Image Rule Note

The current Xiaohongshu image special-domain strategy should prefer the note's isolated main media container before using broader heuristics.

Preferred order for Xiaohongshu image extraction:

1. isolated main media container inside the note body
2. structured note image data such as `imageList`
3. visual clustering fallback only

This ordering exists because some Xiaohongshu note pages place large comment-gallery images close below the main note content, which can contaminate cluster-first image selection.

## Data Flow

For the Chrome plugin:

1. determine extraction range: `images`, `videos`, or `both`
2. extract shared project facts
3. run image path if requested
4. run video path if requested
5. keep canonical `images` and `videos`
6. assemble merged `media` only for shared consumers
7. render popup selection UI
8. enqueue selected downloads

## Legacy Architecture Sources

The following are still valuable source material during migration:

- [MediaFetch_Execution_Standard.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/MediaFetch_Execution_Standard.md)
- [temp_task/mediafetch_refactor_plan.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/temp_task/mediafetch_refactor_plan.md)
