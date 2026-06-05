# Dev Log

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
