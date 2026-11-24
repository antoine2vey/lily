# @lily/shared

The schemas, typed errors and domain helpers that the Lily api, app, admin, mcp and db packages share. It is written with Effect `Schema`, so one declaration gives both the TypeScript type and the runtime decoder, and the api and its clients use the same one.

## Entry points

| Import | Source | Use |
|---|---|---|
| `@lily/shared` | `src/index.ts` | Schemas, errors and helpers safe to bundle into the app and admin |
| `@lily/shared/<domain>` | `src/domains/<domain>/` | One domain's schemas, for the domains that `package.json` lists, such as `@lily/shared/plant` |
| `@lily/shared/services/<path>` | `src/services/` | `clientIp` for the api and mcp, and `mintStoredRef` for the api and db |

## How it builds

Every entry in `exports` points at TypeScript source, so each consumer compiles `src/` itself. Metro bundles it into the app, Vite into admin, and Bun runs it in the api and mcp. The `build` script compiles to JavaScript for the root `turbo build`, and no consumer imports that output.

## Commands

Run them from the monorepo root.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/shared tsc` | Typecheck this package |
| `bun run --filter=@lily/shared test` | Run the Vitest suite in `src/__tests__/` |
| `bun run --filter=@lily/shared test:watch` | Run Vitest in watch mode |
| `bun run --filter=@lily/shared lint` | Check with Biome |
| `bun run --filter=@lily/shared lint:fix` | Check with Biome and write the fixes |
| `bun run --filter=@lily/shared build` | Compile to JavaScript for `turbo build` |

A schema change can break the packages that import it, so typecheck them all with `bun run tsc` from the root.

## Where it sits

This package imports no other workspace package. The api, app, admin, mcp and db packages import it. A push to `main` that changes it publishes an over-the-air update to the installed app, so `CLAUDE.md` lists the rules that keep installed builds working.

## Related docs

- [`CLAUDE.md`](CLAUDE.md) has the rules for working in this package.
- [`CONTEXT.md`](CONTEXT.md) defines the terms this package owns.
- [`packages/api/CONTEXT.md`](../api/CONTEXT.md) defines the domain concepts the schemas are named after.
- [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) has the Effect conventions for every package.
- [`docs/agents/releases.md`](../../docs/agents/releases.md) explains how a push to `main` reaches users.
- [`packages/README.md`](../README.md) maps the other packages.
