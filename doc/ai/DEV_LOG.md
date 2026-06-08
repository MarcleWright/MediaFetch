# Dev Log

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
