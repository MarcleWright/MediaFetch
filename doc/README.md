# Project Documentation

This `doc/` tree is the standardized documentation system for MediaDownloader / MediaFetch.

Use it as the primary navigation root for project knowledge.

## Product

Defines what the product is, what it does, and what rules it must satisfy.

Primary files:

- [product/PRODUCT_BRIEF.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/product/PRODUCT_BRIEF.md)
- [product/ROADMAP.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/product/ROADMAP.md)

## Architecture

Defines the technical skeleton, module boundaries, and data model.

Primary files:

- [architecture/ARCHITECTURE_OVERVIEW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/ARCHITECTURE_OVERVIEW.md)
- [architecture/DATA_MODEL.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/architecture/DATA_MODEL.md)

## Design

Defines user interaction rules and visible UI behavior.

Primary files:

- [design/INTERACTION_RULES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/design/INTERACTION_RULES.md)

## Engineering

Defines setup, testing, release, and operational guidance.

Primary files:

- [engineering/DEV_SETUP.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/DEV_SETUP.md)
- [engineering/TESTING.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/TESTING.md)
- [engineering/KNOWN_ISSUES.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/engineering/KNOWN_ISSUES.md)

## AI

Defines AI workflow, task records, current context, and work history.

Primary files:

- [ai/AI_CONTEXT.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/AI_CONTEXT.md)
- [ai/AI_WORKFLOW.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/AI_WORKFLOW.md)
- [ai/DEV_LOG.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/DEV_LOG.md)
- [ai/tasks/2026-06-05_01_doc-system-bootstrap.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/tasks/2026-06-05_01_doc-system-bootstrap.md)
- [ai/decisions/ADR-0001_media-doc-boundaries.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/doc/ai/decisions/ADR-0001_media-doc-boundaries.md)

## Legacy Source Material

These files remain valid source material during migration, but they are not the long-term owner location for every fact they currently contain:

- [README.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/README.md)
- [MediaFetch_Execution_Standard.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/MediaFetch_Execution_Standard.md)
- [temp_task/development_timeline_log.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/temp_task/development_timeline_log.md)
- [temp_task/video_extraction_implementation_plan.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/temp_task/video_extraction_implementation_plan.md)

## Documentation Routing Rules

- product scope, feature intent, non-goals, roadmap -> `doc/product/`
- technical structure, boundaries, module ownership, data model -> `doc/architecture/`
- user-visible behavior and interaction rules -> `doc/design/`
- setup, testing, release, troubleshooting -> `doc/engineering/`
- AI workflow, task history, decisions, current working context -> `doc/ai/`

## Current Migration State

- `doc/` is now the standardized documentation root.
- Existing root-level and `temp_task/` files are still in use.
- New durable documentation should prefer `doc/`.
- Existing mixed legacy documents should be gradually reduced, not expanded as catch-all sources of truth.
