# Dev Log

### 2026-06-08 Branch Snapshot Prepared Before Video Download Fix Pass

Status: Done

Summary:

- prepared the current branch as a stable architecture-and-doc snapshot instead of continuing to force more video download changes
- confirmed that Xiaohongshu image download is restored by user testing after the download-layer cleanup
- explicitly deferred `weibo` and `xinpianchang` end-to-end video download fixes to the next iteration
- cleaned remaining debug/doc tail issues so this branch can be committed without claiming video download is solved

Links:

- `doc/engineering/KNOWN_ISSUES.md`
- `doc/ai/tasks/2026-06-08_01_weibo-video-domain-rule.md`
- `doc/ai/tasks/2026-06-08_02_xinpianchang-video-domain-rule.md`
- `doc/architecture/ARCHITECTURE_OVERVIEW.md`

### 2026-06-08 Image Download Rule Migration Task Created

Status: Reopened

Summary:

- reviewed the explicit image download rule path and confirmed it already exists in `chrome-plugin/background.js`
- classified `xiaohongshu` and `sinaimg` / Weibo-image as image-rule cases, while `behance` remains on the generic path in this pass
- left the real browser-page download replay as a follow-up because it was not run in this workspace

Links:

- `doc/ai/tasks/2026-06-08_05_image-download-domain-rule-migration.md`
- `doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md`

### 2026-06-08 Download Layer Refactor Task Created

Status: Done

Summary:

- completed the download-layer boundary refactor so image and video now have explicit download rule entry points
- kept shared download execution generic while moving host-specific branching behind media-type rule resolvers
- validated the refactor with `node --check` on the plugin scripts plus `git diff --check`

Links:

- `doc/ai/tasks/2026-06-08_04_download-layer-refactor-implementation.md`
- `chrome-plugin/background.js`
- `doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md`

### 2026-06-08 Download Layer Refactor Plan Added

Status: Done

Summary:

- added a formal architecture plan for cleaning the Chrome plugin download layer
- fixed the intended target model as shared executors plus media-type and domain-specific download rules
- documented that download refactor should mirror the already cleaner extraction-side media boundary

Links:

- `doc/architecture/DOWNLOAD_LAYER_REFACTOR_PLAN.md`
- `doc/architecture/ARCHITECTURE_OVERVIEW.md`

### 2026-06-08 Download Layer Status Documented

Status: Done

Summary:

- recorded that the June 5 media-boundary refactor is still mostly intact
- documented that the main remaining structural debt now sits in the download layer rather than the top-level media model
- added an explicit architecture note so future work does not treat download hotfixes as final structure

Links:

- `doc/architecture/DOWNLOAD_LAYER_STATUS.md`
- `doc/architecture/ARCHITECTURE_OVERVIEW.md`

### 2026-06-08 Video Download MVP Task Created

Status: Planned

Summary:

- created the formal MVP task for minimal local video-file download support
- fixed the first download architecture target as single-file video only with `direct` and `page-context-fetch`
- explicitly excluded segmented-stream, muxing, and WASM scope from this first implementation phase

Links:

- `doc/ai/tasks/2026-06-08_03_video-download-mvp-architecture.md`

### 2026-06-08 Eagle MP4 Reference Added

Status: Done

Summary:

- inspected the locally installed `Eagle for Chrome` extension package with focus on MP4 handling
- recorded that Eagle primarily uses browser-side retrieval plus localhost desktop-app ingestion instead of a heavy in-browser media pipeline
- added an initial comparison showing that Eagle's approach is easier to reproduce if this project accepts a local helper dependency

Links:

- `doc/materials/references/2026-06-08_eagle-for-chrome-mp4-technical-reference.md`

### 2026-06-08 Video DownloadHelper Reference Added

Status: Done

Summary:

- inspected the locally installed `Video DownloadHelper` Chrome extension package
- recorded the implementation paths and observed strategy families under `doc/materials/references`
- captured the main architectural conclusion that its stable downloading depends on a worker-based media pipeline, not only simple direct downloads

Links:

- `doc/materials/references/2026-06-08_video-downloadhelper-technical-reference.md`

### 2026-06-08 Xinpianchang Video Rule Reopened

Status: Reopened

Summary:

- validation showed the current `xinpianchang` video rollout is not actually complete
- real download can still save `001.htm` / webpage content instead of the target media file
- the second fix pass separated `xinpianchang` from the shared Weibo download rule and moved it to a dedicated direct-download rule entry
- current validated sample still needs end-to-end confirmation against the actual extracted media host, which is `us-xpc5-l.xpccdn.com` on the tested page

Links:

- `doc/ai/tasks/2026-06-08_02_xinpianchang-video-domain-rule.md`
- `doc/engineering/KNOWN_ISSUES.md`

### 2026-06-08 Xinpianchang Video Domain Rule Completed

Status: Done

Summary:

- added a Xinpianchang video special-domain rule that prefers direct MP4 candidates from HTML5 video elements, sources, and page hints
- added Xinpianchang-specific fetch-based download handling so direct downloads keep the expected `xinpianchang.com` referer/origin behavior for `xpccdn.com`
- updated the task file and engineering issue log to reflect the completed rollout phase

Links:

- `doc/ai/tasks/2026-06-08_02_xinpianchang-video-domain-rule.md`
- `chrome-plugin/content.js`
- `chrome-plugin/background.js`
- `doc/engineering/KNOWN_ISSUES.md`

### 2026-06-08 Weibo Video Domain Rule Completed

Status: Done

Summary:

- added a Weibo video special-domain rule that prefers direct MP4 candidates from page payloads and direct video elements before falling back to the generic video extractor
- added Weibo-specific download handling so direct downloads keep the expected `weibo.com` referer/origin behavior for `weibocdn.com` and related media hosts
- recorded the Weibo rollout as complete in the task file and added a Weibo durability note to the engineering issues log

Links:

- `doc/ai/tasks/2026-06-08_01_weibo-video-domain-rule.md`
- `chrome-plugin/content.js`
- `chrome-plugin/background.js`
- `doc/engineering/KNOWN_ISSUES.md`

### 2026-06-08 Ordered Video Domain Tasks Created

Status: Planned

Summary:

- created a sequenced rollout task for domain-specific video rules
- split the next implementation phase into `weibo` first and `xinpianchang` second
- explicitly told the coder agent to finish one domain before starting the next

Links:

- `doc/ai/tasks/2026-06-08_00_video-domain-rule-rollout-order.md`
- `doc/ai/tasks/2026-06-08_01_weibo-video-domain-rule.md`
- `doc/ai/tasks/2026-06-08_02_xinpianchang-video-domain-rule.md`

### 2026-06-08 Popup Toolbar Range Control Polish Completed

Status: Done

Summary:

- tightened the popup toolbar spacing for the left-side action group
- moved extraction range selection into a right-aligned segmented pill control on the same row
- kept `Select Original` with the left-side actions and preserved the existing extraction behavior

Links:

- `chrome-plugin/popup.html`
- `chrome-plugin/popup.css`
- `chrome-plugin/popup.js`

### 2026-06-05 Xiaohongshu Video Cover Task Completed

Status: Done

Summary:

- added a Xiaohongshu video special-domain helper that maps `note.video.image.thumbnailFileid` to a verified `https://ci.xiaohongshu.com/<fileId>` cover URL
- kept the structured cover path inside the Xiaohongshu video rule and preserved existing poster fallbacks when the structured field is missing or unusable
- validated the mapping against multiple real Xiaohongshu video samples before marking the task complete

Links:

- `doc/ai/tasks/2026-06-05_05_xiaohongshu-video-cover-thumbnail.md`
- `chrome-plugin/content.js`

### 2026-06-05 Xiaohongshu Video Cover Task Created

Status: Planned

Summary:

- recorded that Xiaohongshu video posts expose a structured cover file id at `note.video.image.thumbnailFileid`
- created the execution task for turning that structured file id into a stable video cover URL
- kept this work separated from the existing video max-stream task

Links:

- `doc/ai/tasks/2026-06-05_05_xiaohongshu-video-cover-thumbnail.md`
- `doc/architecture/ARCHITECTURE_OVERVIEW.md`
- `doc/engineering/KNOWN_ISSUES.md`

### 2026-06-05 Xiaohongshu Video Max-Stream Task Completed

Status: Done

Summary:

- switched Xiaohongshu video extraction to parse `mediaV2/stream` before generic fallback
- ranked all direct MP4 stream variants and exported the maximum-size result
- made video dimensions explicit in the popup UI

Links:

- `doc/ai/tasks/2026-06-05_04_xiaohongshu-video-max-stream-and-dimensions.md`
- `chrome-plugin/content.js`
- `chrome-plugin/popup.js`

### 2026-06-05 Xiaohongshu Video Max-Stream Task Created

Status: Planned

Summary:

- recorded that Xiaohongshu video extraction should prefer `mediaV2/stream` over generic scanning when available
- recorded that observed samples expose multiple direct MP4 stream variants and the rule should choose the maximum-size one instead of the first one found
- created the execution task for selecting the maximum-size video stream and showing video dimensions in the plugin UI

Links:

- `doc/ai/tasks/2026-06-05_04_xiaohongshu-video-max-stream-and-dimensions.md`
- `doc/architecture/ARCHITECTURE_OVERVIEW.md`
- `doc/engineering/KNOWN_ISSUES.md`

### 2026-06-05 Xiaohongshu Image Main-Container Priority Completed

Status: Done

Summary:

- refined the Xiaohongshu image special-domain rule to prefer an isolated main media container first
- added structured `imageList` fallback extraction before the existing visual clustering fallback
- kept generic image extraction and the Xiaohongshu video rule unchanged

Links:

- `doc/ai/tasks/2026-06-05_03_xiaohongshu-image-main-container-priority.md`
- `chrome-plugin/content.js`

### 2026-06-05 Xiaohongshu Image Main-Container Task Created

Status: Planned

Summary:

- created the execution task for refining the Xiaohongshu image special-domain rule
- recorded the conclusion that standard Xiaohongshu image posts should prefer the isolated main media container first
- fixed the intended fallback order as main container, then structured `imageList`, then visual clustering

Links:

- `doc/ai/tasks/2026-06-05_03_xiaohongshu-image-main-container-priority.md`
- `doc/architecture/ARCHITECTURE_OVERVIEW.md`
- `doc/engineering/KNOWN_ISSUES.md`

### 2026-06-05 Xiaohongshu Video Domain Rule Completed

Status: Done

Summary:

- added the first real `xiaohongshu` video special-domain rule in the Chrome plugin
- kept the video rule path separate from image logic and preserved generic fallback
- added Xiaohongshu-specific evidence under `debug.video`

Links:

- `doc/ai/tasks/2026-06-05_02_xiaohongshu-video-domain-rule.md`
- `chrome-plugin/content.js`

### 2026-06-05 Xiaohongshu Video Domain Rule Task Created

Status: Planned

Summary:

- created the execution document for the first real video special-domain rule
- fixed the first target site as `xiaohongshu`
- constrained the task to single-file video extraction through the video rule path only

Links:

- `doc/ai/tasks/2026-06-05_02_xiaohongshu-video-domain-rule.md`
- `doc/product/ROADMAP.md`

### 2026-06-05 Documentation System Bootstrap

Status: Done

Summary:

- created the initial `doc/` backbone for the repository
- routed durable project knowledge into `product`, `architecture`, `design`, `engineering`, and `ai` layers
- kept root-level docs and `temp_task/` files as legacy or transitional source material rather than deleting them

Links:

- `doc/ai/tasks/2026-06-05_01_doc-system-bootstrap.md`
- `doc/ai/decisions/ADR-0001_media-doc-boundaries.md`
- `doc/ai/logs/2026-06.md`

### 2026-06-04 Image Rule Boundary Cleanup

Status: Done

Summary:

- separated platform-aware image extraction from truly generic image extraction
- made popup merged-media assembly use an explicit helper
- preserved the image/video boundary without expanding product scope

Links:

- `doc/ai/tasks/2026-06-04_01_rule-boundary-cleanup.md`
- `doc/ai/logs/2026-06.md`
