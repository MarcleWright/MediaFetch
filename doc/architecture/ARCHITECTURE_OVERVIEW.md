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

## Current Rule Breakdown

The current Chrome plugin should be read with this rule breakdown:

```text
content.js
├─ image extraction
│  ├─ generic image extraction
│  └─ image domain rules
│     ├─ instagram
│     ├─ behance
│     ├─ xiaohongshu
│     ├─ weibo
│     └─ weixin
└─ video extraction
   ├─ generic video extraction
   └─ video domain rules
      ├─ xiaohongshu
      ├─ weibo
      └─ xinpianchang

background.js
├─ shared download queue shell
├─ generic download executors
│  ├─ direct
│  └─ fetchBlob
├─ image download rules
│  ├─ sinaimg
│  └─ xiaohongshu cdn
└─ video download rules
   ├─ weibo
   └─ xinpianchang
```

This means the image extraction side already has explicit platform-aware handling for `instagram`, `behance`, `xiaohongshu`, `weibo`, and `weixin` at the same structural level.

It also means the current explicit download-domain layer is narrower than the image extraction layer:

- some domains have image extraction rules but still use generic download
- some domains have explicit download rules only when the generic path proved insufficient

## Download Layer Status

The extraction-side media boundary work is structurally ahead of the download side.

Current project state should be read as:

- extraction paths are closer to the intended media/domain separation
- download paths are still transitional, but the shared executor now routes through explicit image/video download rule entry points instead of acting as the main host switchboard

See:

- [DOWNLOAD_LAYER_STATUS.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DOWNLOAD_LAYER_STATUS.md)
- [DOWNLOAD_LAYER_REFACTOR_PLAN.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md)

## Download Rule Classification Principle

Domain extraction rules and domain download rules are related, but they are not required to exist as a pair.

The classification rule is:

- a domain may need a special extraction rule but still use generic download
- a domain may use generic extraction but still need a special download rule
- a domain should only gain a special download rule when its download behavior needs to be isolated from the generic path for correctness or long-term stability

This means special download rules are not added for symmetry alone.

They exist when a domain has durable download-specific needs such as:

- request header requirements
- referer or origin protection
- domain-specific blob or direct strategy choice
- host-specific download delivery quirks

If a domain already downloads reliably through the generic path, it should stay generic until a real failure or repeated fragility proves that isolation is necessary.

This principle protects the project from two opposite mistakes:

1. over-creating domain download rules for sites that do not need them
2. leaving fragile domains on the generic path so later generic changes accidentally break previously stable downloads

Current explicit download-rule interpretation:

- `sinaimg` and `xiaohongshu cdn` are explicit image download-rule cases
- `weibo` and `xinpianchang` are explicit video download-rule cases
- `instagram`, `behance`, and `weixin` currently remain on the generic download path unless a real download failure proves they need isolation

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

## Weibo Video Rule Note

The current Weibo video special-domain strategy should prefer page-embedded direct MP4 candidates over the generic video extractor when that structured or direct media data is present.

Preferred order for Weibo video extraction:

1. parse page-embedded `page_info`, `media_info`, or `mix_media_info` payloads when present
2. collect direct single-file MP4 candidates from payloads, video elements, and media meta hints
3. choose the best direct candidate by resolution and URL quality hints
4. fall back to the generic video extractor only if no direct Weibo video candidate is usable

The Weibo download path also applies host-specific request headers for `weibocdn.com` and related direct media hosts so direct downloads keep the expected `weibo.com` referer behavior.

## Xinpianchang Video Rule Note

The current Xinpianchang video special-domain strategy should prefer the page's direct MP4 candidate and keep downloads on a dedicated direct-download path with domain-specific request headers when the host protects direct media delivery.

Preferred order for Xinpianchang video extraction:

1. scan direct HTML5 video elements, sources, and direct MP4 hints on the page
2. collect direct single-file MP4 candidates and rank the largest usable one first
3. keep the selected item on a dedicated direct-download strategy for the extracted Xinpianchang media host
4. fall back to the generic video extractor only if no direct Xinpianchang candidate is usable

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
