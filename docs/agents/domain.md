# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per package. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In this multi-context repo, also check `packages/<package>/docs/adr/` for package-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context monorepo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md                     ← points at each package's CONTEXT.md
├── docs/adr/                          ← system-wide decisions
└── packages/
    ├── api/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← package-specific decisions
    ├── db/
    │   └── CONTEXT.md
    ├── shared/
    │   └── CONTEXT.md
    ├── app/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    ├── web/
    │   └── CONTEXT.md
    ├── admin/
    │   └── CONTEXT.md
    ├── mcp/
    │   └── CONTEXT.md
    └── knowledge-db/
        └── CONTEXT.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant package's `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
