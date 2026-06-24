# Packages

The Lily monorepo is a set of Bun workspaces orchestrated by Turborepo. Each package has its own README with architecture, structure, and commands.

| Package | What it is | README |
| --- | --- | --- |
| [`api`](api) | Effect-based backend API server (Bun + Postgres + Redis + schedulers) | [README](api/README.md) |
| [`app`](app) | React Native (Expo) mobile app | [README](app/README.md) |
| [`web`](web) | Next.js 16 static-export marketing site (i18n + MDX blog) | [README](web/README.md) |
| [`admin`](admin) | Vite + React 19 internal operations dashboard | [README](admin/README.md) |
| [`shared`](shared) | Effect Schema domain types, typed errors, service interfaces | [README](shared/README.md) |
| [`db`](db) | Primary PostgreSQL schema + Drizzle client (Effect) | [README](db/README.md) |
| [`knowledge-db`](knowledge-db) | Pgvector RAG knowledge base (separate Postgres) | [README](knowledge-db/README.md) |
| [`mcp`](mcp) | Model Context Protocol server for AI clients | [README](mcp/README.md) |
| [`plant-scanner`](plant-scanner) | iOS-only Expo native AR/ML scanning module | [README](plant-scanner/README.md) |

## Working with packages

All commands run from the **repository root** — never `cd` into a package. Turbo runs scripts across every package that defines them.

```bash
bun run build                          # Build all packages
bun run test                           # Test all packages
bun run lint                           # Lint all packages
bun run tsc                            # Typecheck all packages

bun run --filter=@lily/api dev         # Run a single package's script
```

### Workspace dependencies

Packages depend on each other via `workspace:*`:

```json
{ "dependencies": { "@lily/shared": "workspace:*" } }
```

Cross-package imports use the package name (`@lily/shared`); within a package, imports use that package's path alias (e.g. `@lily/api/...`, or `@/` in the app).

### Adding a package

1. Create a directory under `packages/`.
2. Add a `package.json` with a unique `@lily/`-prefixed name, `"private": true`, `"license": "AGPL-3.0-only"`, and a `sideEffects` declaration.
3. `extends` the root `tsconfig.json` and pin the exact root `typescript` version.
4. Include the standard scripts (`build`/`test`/`lint`/`lint:fix`/`tsc`/`clean`) where applicable.
5. Run `bun install` to link the workspace, and add a `README.md`.

See the root [`CLAUDE.md`](../CLAUDE.md) for the full monorepo conventions.
