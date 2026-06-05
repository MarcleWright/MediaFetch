# AI Context

## Current Priorities

1. maintain image/video boundary discipline in the Chrome plugin
2. harden the Xiaohongshu special-domain rules with image main-container priority and conservative video handling
3. the selected first site is `xiaohongshu`
4. keep `doc/` as the durable documentation root for ongoing work

## Current Constraints

- do not regress image extraction while adding video capability
- do not let Xiaohongshu image clustering absorb nearby comment-gallery images when a stable main media container exists
- do not expand current first-video scope into HLS/DASH
- do not let merged `media` replace canonical `images` and `videos`
- do not let low-capability agents deduplicate image generic/domain paths casually

## Current Important Decisions

- generic extraction must remain available without special-domain rules
- image and video rule layers must stay separate
- current first video phase is single-file video only
- current Xiaohongshu image direction is main-container first, structured `imageList` second, visual clustering last
- Eagle and Lineage remain image-only in the current phase

## Suggested Read Order

1. [../README.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/README.md)
2. [../architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
3. [../architecture/DATA_MODEL.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DATA_MODEL.md)
4. [../engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)
5. [DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
