# Roadmap

## Current Stage

The active stage is Chrome plugin media-layer evolution:

- preserve stable image extraction
- add video extraction without corrupting image behavior
- keep generic extraction available even without special-domain rules
- prepare architecture so future `audio` support can fit the same structure

## Near-Term Priorities

1. implement the first real video special-domain rule
2. the first selected site is `xiaohongshu`
3. keep image/video boundaries explicit at extraction, rule, debug, and strategy layers
4. maintain the new `doc/` system as the durable project knowledge root

## Deferred Areas

- HLS and DASH support
- blob-only final video download support
- video export to Eagle
- video export to Lineage
- audio implementation
- aggressive cleanup/deduplication of newly separated image generic/domain paths
