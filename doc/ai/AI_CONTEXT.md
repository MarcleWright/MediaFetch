# AI Context

## Current Priorities

1. maintain image/video boundary discipline in the Chrome plugin
2. keep the restored Xiaohongshu image download path stable after the download-layer cleanup
3. package the current architecture and documentation cleanup as a stable branch snapshot before the next video-download pass
4. defer `weibo` and `xinpianchang` video download fixes to the next iteration
5. keep the download-layer boundary cleanup aligned with the explicit image/video rule entry model now in `chrome-plugin/background.js`
6. keep `doc/` as the durable documentation root for ongoing work
7. preserve the current domain-rule rollout decisions as stable project memory

## Current Constraints

- do not regress image extraction while adding video capability
- do not let Xiaohongshu image clustering absorb nearby comment-gallery images when a stable main media container exists
- do not expand current first-video scope into HLS/DASH
- do not expand the first video-download MVP into HLS/DASH, muxing, or WASM processing
- do not let the Xiaohongshu video rule stop at the first stream candidate when richer `mediaV2/stream` variants are available
- do not rely only on generic poster guessing when Xiaohongshu exposes a structured video cover field
- do not let the coder agent implement `weibo` and `xinpianchang` video rules in parallel
- do not describe `weibo` or `xinpianchang` video download as complete until a real local media file is saved successfully
- do not treat `xinpianchang` as complete until a real media file downloads successfully instead of `001.htm`
- do not let merged `media` replace canonical `images` and `videos`
- do not let low-capability agents deduplicate image generic/domain paths casually
- do not let shared download helpers become an accidental domain-rule layer
- do not collapse the explicit image/video download rule entry layers back into a single host switchboard
- do not create special image download rules for sites that already work reliably through the generic path
- do not migrate multiple image download domains before a real per-domain regression check

## Current Important Decisions

- generic extraction must remain available without special-domain rules
- image and video rule layers must stay separate
- current first video phase is single-file video only
- current first video-download MVP direction is `direct` plus `page-context-fetch`, with no segmented-stream or audio/video merge support
- the main remaining structural debt is in the download layer, not the top-level media model
- the Chrome plugin download layer now has explicit image and video rule entry points, and shared execution should stay generic
- the target fix direction for that debt is documented in `doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md`
- the next download-layer implementation focus is image-domain download migration, with Xiaohongshu image first and Sinaimg / Weibo image second
- `behance` currently stays on the generic image path unless a real failure proves otherwise
- current branch packaging intentionally stops before solving the reopened `weibo` and `xinpianchang` video download failures
- current Xiaohongshu image direction is main-container first, structured `imageList` second, visual clustering last
- current Xiaohongshu video direction is `mediaV2/stream` first, rank all variants, choose maximum size, then fall back to generic scanning
- current Xiaohongshu video cover direction is the verified direct `https://ci.xiaohongshu.com/<fileId>` mapping from `note.video.image.thumbnailFileid`, then existing poster fallbacks
- `weibo` video extraction and download rule entries exist, but end-to-end video download is still deferred because current local validation does not yet confirm stable successful file saving
- `xinpianchang` video rollout is reopened because end-to-end download verification still fails even after separating its download rule from Weibo, and the current validated sample resolves to `us-xpc5-l.xpccdn.com`
- Eagle and Lineage remain image-only in the current phase

## Suggested Read Order

1. [../README.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/README.md)
2. [../architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
3. [../architecture/DATA_MODEL.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DATA_MODEL.md)
4. [../engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)
5. [DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
