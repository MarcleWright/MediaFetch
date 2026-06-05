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

## Xiaohongshu Video Rule Note

The current Xiaohongshu video special-domain strategy should prefer the page-embedded `mediaV2/stream` payload over generic DOM or asset scanning when that structured data is present.

Preferred order for Xiaohongshu video extraction:

1. parse `mediaV2/stream`
2. collect all direct single-file stream variants
3. choose the maximum-size variant by resolution first, then bitrate and codec as tie-breakers
4. fall back to the generic video extractor only if `mediaV2/stream` is unavailable or unusable

Current observed samples suggest that `stream_type 108` is often the maximum-size variant, but code should not hardcode `108` as the winner. The rule should rank all available stream variants instead.

Observed Xiaohongshu samples also expose a structured video cover file id at `note.video.image.thumbnailFileid`. The Xiaohongshu video rule now uses the verified direct mapping `https://ci.xiaohongshu.com/<fileId>` for that field before falling back to generic poster guessing, and the helper stays scoped to the Xiaohongshu video special-domain path.

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
