# Contributing to Lily

Thanks for your interest in contributing. This guide covers the dev setup, the conventions and the pull request process. By taking part you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- 🐛 **Report a bug.** [Open a bug report](https://github.com/antoine2vey/lily/issues/new?template=bug_report.md).
- 💡 **Suggest a feature.** [Open a feature request](https://github.com/antoine2vey/lily/issues/new?template=feature_request.md).
- 🔒 **Report a vulnerability** privately, as [SECURITY.md](SECURITY.md) explains. Do **not** open a public issue.
- 🛠 **Send a pull request** with the workflow below. For anything non-trivial, open an issue first so we can agree on the approach.

## Prerequisites

- [Bun 1.4.3](https://bun.sh). Match the pinned version exactly.
- Docker, for local Postgres and Redis.

## Getting started

```bash
# 1. Fork and clone, then start local infrastructure
docker compose up -d postgres postgres-test redis

# 2. Install all workspaces
bun install

# 3. Create your env file (placeholders only; fill in what you need)
cp .env.example .env

# 4. Apply the database schema
bun run --filter=@lily/db db:push

# 5. Run the stack in watch mode (API on http://localhost:3000)
bun run dev
```

## Quick reference

```bash
bun run build      # Build all packages (Turbo cached)
bun run lint       # Lint all packages (Biome)
bun run lint:fix   # Auto-fix lint issues
bun run tsc        # Typecheck all packages
bun run test       # Run all unit tests
bun run dev        # Start development servers
```

**Always run commands from the repository root.** Turbo runs each package's scripts, so you never `cd` into a package.

## Database

The local credentials are dev-only and defined in `docker-compose.yml`: user `lily`, password `lily123`, database `lily` for dev and `lily_test` for tests.

```bash
docker compose exec postgres psql -U lily -d lily   # Connect
bun run --filter=@lily/db db:push                   # Push schema (local dev)
bun run --filter=@lily/db db:studio                 # Drizzle Studio
```

> **Migrations are hand-authored SQL** in `packages/db/drizzle/`. Do **not** run `drizzle-kit generate`. The migration journal is out of sync on purpose, and generating corrupts it. Production applies new migrations on each API deploy.

## Coding conventions

Lily is an **Effect-first** codebase. Before writing code, read [`CODING_STANDARDS.md`](CODING_STANDARDS.md). It is the authoritative guide. The essentials:

- Use Effect modules everywhere. Native JS equivalents such as `arr.map`, `Object.keys`, `switch`, `??` and `new Date()` are not allowed.
- Define typed errors with `Schema.TaggedError` and handle them by tag, never with `catchAll`. Match unions with `Match.exhaustive`.
- Import across packages by package name (`@lily/shared`). Inside the app, use the `@/` alias.
- Biome enforces formatting: 2-space indent, single quotes, semicolons only where needed, 80 columns and ES5 trailing commas. Run `bun run lint:fix`.
- New features need tests. Mock at the repository level, not the database level.

Each package also has its own `CLAUDE.md` and `README.md` with package-specific rules. [`CONTEXT-MAP.md`](CONTEXT-MAP.md) points to each package's glossary, so you can name things the way the code does.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`. Common types are `feat`, `fix`, `docs`, `refactor`, `chore`, `test` and `blog`.

```
feat(plants): add bulk watering action
fix(api): handle missing care schedule on overdue query
docs(readme): clarify knowledge-db setup
```

## Pull request process

1. **Branch** from `main` (for example `feat/bulk-watering`), or work from your fork.
2. Keep changes focused, and **add or update tests** for new behavior.
3. Make sure the CI gates pass locally:
   ```bash
   bash scripts/check-docs.sh && bun run lint && bun run tsc && bun run test
   ```
   The pre-push hook runs the same four checks, and CI runs them on every push.
4. Open a PR against `main` and fill in the [PR template](.github/pull_request_template.md). Link any related issue (`Closes #123`).
5. A maintainer reviews it. Keep the PR scoped. Smaller PRs get reviewed faster.

`scripts/check-docs.sh` fails when a doc links to a file that does not exist or quotes an outdated Bun, Effect or TypeScript version. If you move or rename a file, update the docs that point at it.

### Developer Certificate of Origin

By contributing, you certify that you wrote the code or have the right to submit it under the project's license (the [DCO](https://developercertificate.org)). Sign off your commits with `git commit -s`, which appends a `Signed-off-by` trailer.

## License

Lily is licensed under the [GNU AGPL v3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
