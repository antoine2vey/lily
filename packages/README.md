# Packages

The Lily monorepo is a set of Bun workspaces run by Turborepo. Each package has a `README.md` for people, a `CLAUDE.md` for coding agents and a `CONTEXT.md` glossary. How they depend on each other is in [`CONTEXT-MAP.md`](../CONTEXT-MAP.md).

| Package | What it is | README |
| --- | --- | --- |
| [`api`](api) | Effect backend on Bun, with Postgres, Redis and schedulers | [README](api/README.md) |
| [`app`](app) | React Native and Expo mobile app | [README](app/README.md) |
| [`plant-scanner`](plant-scanner) | iOS-only Expo native module for AR and ML scanning | [README](plant-scanner/README.md) |
| [`shared`](shared) | Effect Schema domain types, typed errors and service interfaces | [README](shared/README.md) |
| [`db`](db) | Primary PostgreSQL schema, migrations and the Drizzle client for Effect | [README](db/README.md) |
| [`knowledge-db`](knowledge-db) | pgvector knowledge base for retrieval, in a separate Postgres | [README](knowledge-db/README.md) |
| [`mcp`](mcp) | Model Context Protocol server for AI clients | [README](mcp/README.md) |
| [`admin`](admin) | Vite and React internal operations dashboard | [README](admin/README.md) |
| [`web`](web) | TanStack Start marketing site and blog, prerendered to static HTML | [README](web/README.md) |

## Working with packages

Run every command from the **repository root**. Never `cd` into a package. Turbo runs a script in every package that defines it.

```bash
bun run build                          # Build all packages
bun run test                           # Test all packages
bun run lint                           # Lint all packages
bun run tsc                            # Typecheck all packages

bun run --filter=@lily/api dev         # Run one package's script
```

### Workspace dependencies

Packages depend on each other through `workspace:*`:

```json
{ "dependencies": { "@lily/shared": "workspace:*" } }
```

Import across packages by package name (`@lily/shared`). Inside a package, use its own path alias, such as `@/` in the app.

### Adding a package

1. Create a directory under `packages/`.
2. Add a `package.json` with a unique `@lily/` name, `"private": true`, `"license": "AGPL-3.0-only"` and a `sideEffects` field.
3. `extends` the root `tsconfig.json` and pin the exact root `typescript` version.
4. Add the standard scripts (`build`, `test`, `lint`, `lint:fix`, `tsc`, `clean`) that apply.
5. Run `bun install` to link the workspace.
6. Write `README.md`, `CLAUDE.md` and `CONTEXT.md`, and symlink `AGENTS.md` to `CLAUDE.md` (`ln -s CLAUDE.md packages/<name>/AGENTS.md`).
7. Add a row for the package to this table, to [`CONTEXT-MAP.md`](../CONTEXT-MAP.md) and to the package list in [`CODING_STANDARDS.md`](../CODING_STANDARDS.md).

`scripts/check-docs.sh` fails the push until the three docs and the symlink exist and both tables name the package. The rules every package must satisfy are in [`docs/agents/monorepo.md`](../docs/agents/monorepo.md), and the coding rules are in [`CODING_STANDARDS.md`](../CODING_STANDARDS.md).
