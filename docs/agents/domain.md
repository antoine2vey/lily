# Domain docs

How the engineering skills read this repo's domain documentation while exploring the code.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root. It points to one `CONTEXT.md` per package. Read each one that touches your topic.
- **`packages/api/CONTEXT-MAP.md`** when the work is in the api. It maps the bounded contexts under `packages/api/src/contexts`.
- **Architecture decision records** that touch the area. System-wide ones go in an `adr` folder under `docs`, and package-scoped ones in an `adr` folder under that package's `docs`.

No ADR folder exists yet. When a file is missing, proceed silently. Don't flag its absence, and don't suggest creating it upfront. The producer skill (`/grill-with-docs`) creates ADRs lazily when a decision actually gets resolved.

## File structure

This is a multi-context monorepo, so the root holds a `CONTEXT-MAP.md` and each package holds its own glossary:

```
/
├── CONTEXT-MAP.md            ← points at each package's CONTEXT.md
├── docs/adr/                 ← system-wide decisions, created on first use
└── packages/
    ├── api/
    │   ├── CONTEXT.md
    │   ├── CONTEXT-MAP.md    ← the api's bounded contexts
    │   └── docs/adr/         ← package decisions, created on first use
    ├── app/CONTEXT.md
    ├── plant-scanner/CONTEXT.md
    ├── shared/CONTEXT.md
    ├── db/CONTEXT.md
    ├── knowledge-db/CONTEXT.md
    ├── mcp/CONTEXT.md
    ├── admin/CONTEXT.md
    └── web/CONTEXT.md
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term the owning package's `CONTEXT.md` defines. Don't drift to a synonym its `Avoid` column lists.

A concept missing from every glossary is a signal. Either you are inventing language the project doesn't use, so reconsider, or there is a real gap, so note it for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly rather than silently overriding it:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
