# AI Workflow

## Roles

- stable project truth belongs in `doc/product`, `doc/architecture`, `doc/design`, and `doc/engineering`
- execution history, task records, and AI operating context belong in `doc/ai`
- legacy `temp_task/` files may continue to exist, but new durable organizational knowledge should be promoted into `doc/`

## Task Lifecycle

1. define or update a task document when the work is multi-step
2. execute code or documentation changes
3. review the result
4. record durable outcomes in the correct owner-layer docs
5. append a short timeline entry to the AI log system

## Documentation Update Rules

- do not create new catch-all documents
- route each durable fact to one primary owner file
- if a `temp_task` file creates durable project memory, promote the lasting part into `doc/`
- keep `AI_CONTEXT.md` short and current
- keep `DEV_LOG.md` concise

## Review Rules

- if a task changes architecture, update `doc/architecture/`
- if a task changes user-visible behavior, update `doc/design/`
- if a task changes workflow or validation, update `doc/engineering/`
- if a task creates durable decisions, add or update an ADR in `doc/ai/decisions/`
- if a risk must remain visible, add it to `doc/engineering/KNOWN_ISSUES.md`
