# Lily

Plant care app. TypeScript monorepo (Bun 1.4.3, Effect 4.0.5, TypeScript 7).

**Effect-first.** Before writing, editing or reviewing TypeScript, read `CODING_STANDARDS.md`: the Effect module for each native JS construct, plus the service, error and auth rules.

**Run every command from the monorepo root**: `bun run <script>` for all packages, `bun run --filter=@lily/<pkg> <script>` for one.

**Env files are per package.** A package script reads the `.env` in its own folder. The root `.env` reaches it only through the links the `README.md` Quickstart creates, and Turbo tasks drop variables set in the shell.

**Docs are checked.** `scripts/check-docs.sh` runs in the pre-push hook and in CI. It fails when a doc links to a missing file, names a backticked path that does not exist, or quotes a Bun, Effect or TypeScript version that no longer matches `package.json`. When you move, rename or delete a file, update the docs that name it.

## Situational docs

- **Packages**: finding which package owns a feature: read `packages/README.md`, then that package's `CLAUDE.md`.
- **Domain language**: naming a domain concept, or a change that crosses packages: read `CONTEXT-MAP.md`, then the `CONTEXT.md` of each package you touch.
- **Releases**: promising that a change ships, adding a migration, or editing `.github/workflows/`, `packages/app/app.json`, `packages/app/eas.json` or a Bun version: read `docs/agents/releases.md`.
- **Monorepo discipline**: adding a package, editing a `package.json` or `tsconfig.json`, a push blocked by the pre-push hook, or a large cross-package refactor: read `docs/agents/monorepo.md`.
- **Effect lookups**: most online docs, the Effect docs MCP server and `effect-solutions` describe Effect 3. Looking up an Effect API, or `bun run tsc` reporting `effect(outdatedApi)`: read `docs/agents/effect-docs.md`.

## Agent skills

- **Issue tracker**: publishing, fetching or editing issues: read `docs/agents/issue-tracker.md`.
- **Triage labels**: applying a triage role to an issue: read `docs/agents/triage-labels.md`.
- **Domain docs**: a skill exploring an area that may have a glossary or ADRs: read `docs/agents/domain.md`.
