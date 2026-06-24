# Contributing to Lily

Thanks for your interest in contributing! This guide covers the dev setup, conventions, and the pull-request process. By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- 🐛 **Report a bug** — [open a bug report](https://github.com/antoine2vey/lily/issues/new?template=bug_report.md).
- 💡 **Suggest a feature** — [open a feature request](https://github.com/antoine2vey/lily/issues/new?template=feature_request.md).
- 🔒 **Report a vulnerability** — privately, please: see [SECURITY.md](SECURITY.md). Do **not** open a public issue.
- 🛠 **Send a pull request** — see the workflow below. For anything non-trivial, open an issue first so we can agree on the approach.

## Prerequisites

- [Bun 1.3.8](https://bun.sh) (pinned — match it exactly)
- Docker (for local Postgres + Redis)

## Getting started

```bash
# 1. Fork & clone, then start local infrastructure
docker compose up -d postgres postgres-test redis

# 2. Install all workspaces
bun install

# 3. Create your env file (placeholders only — fill in what you need)
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

**Always run commands from the repository root** — never `cd` into a package. Turbo handles per-package execution.

## Database

Local credentials (dev-only, defined in `docker-compose.yml`): user `lily`, password `lily123`, database `lily` (dev) / `lily_test` (test).

```bash
docker compose exec postgres psql -U lily -d lily   # Connect
bun run --filter=@lily/db db:push                   # Push schema (local dev)
bun run --filter=@lily/db db:studio                 # Drizzle Studio
```

> **Migrations are hand-authored SQL** in `packages/db/drizzle/`. Do **not** run `drizzle-kit generate` — the migration journal is intentionally out of sync, and generating will corrupt it. Write the SQL by hand; production migrations run via `db:migrate:prod`.

## Coding conventions

This is an **Effect-first** codebase. Before writing code, read [`CLAUDE.md`](CLAUDE.md) — it's the authoritative guide. The essentials:

- Use Effect modules everywhere; native JS equivalents (`arr.map`, `Object.keys`, `switch`, `??`, `new Date()`) are forbidden.
- Typed errors via `Schema.TaggedError`, handled by tag — never `catchAll`. Union types use `Match.exhaustive`.
- Imports: cross-package use the package name (`@lily/shared`); within the app use the `@/` alias.
- Formatting is enforced by Biome (2-space indent, single quotes, no semicolons, 80-col, ES5 trailing commas) — run `bun run lint:fix`.
- New features require tests. Mock at the repository level, not the DB level.

Each package also has its own `CLAUDE.md` / `README.md` with package-specific rules.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`. Common types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `blog`.

```
feat(plants): add bulk watering action
fix(api): handle missing care schedule on overdue query
docs(readme): clarify knowledge-db setup
```

## Pull request process

1. **Branch** from `main` (e.g. `feat/bulk-watering`), or work from your fork.
2. Make focused changes and **add or update tests** for new behavior.
3. Make sure the CI gates pass locally:
   ```bash
   bun run tsc && bun run lint && bun run test
   ```
   These run on every push (`tsc` is also a pre-push hook).
4. Open a PR against `main` and fill in the [PR template](.github/pull_request_template.md). Link any related issue (`Closes #123`).
5. A maintainer will review. Keep the PR scoped — smaller PRs are reviewed faster.

### Developer Certificate of Origin

By contributing, you certify that you wrote the code or have the right to submit it under the project's license (the [DCO](https://developercertificate.org)). Sign off your commits with `git commit -s`, which appends a `Signed-off-by` trailer.

## License

Lily is licensed under the [GNU AGPL v3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
