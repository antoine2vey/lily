# Effect 4 Docs

The repo is on Effect 4.0.0. Most online docs, the Effect docs MCP server and `effect-solutions` describe Effect 3 (`Context.Tag`, `@effect/platform`), so check anything from them against v4 before using it.

- `node_modules/.bun/effect@4.0.0/node_modules/effect/AGENTS.md` and its `ai-docs/` are the v4 guides shipped with the package
- The `effect` package source (`.../effect/src`) is the reference for module APIs, including `http`, `http-api`, `sql`, `ai` and `observability`
- The Effect language service reports leftover v3 APIs as `effect(outdatedApi)` in `bun run tsc`
