# Lily

Plant care app. TypeScript monorepo (Bun 1.3.8, Effect 4.0.0).

**Effect-first.** Before writing, editing or reviewing TypeScript, read `CODING_STANDARDS.md`: the Effect module for each native JS construct, plus the service, error and auth rules.

**Run every command from the monorepo root**: `bun run <script>` for all packages, `bun run --filter=@lily/<pkg> <script>` for one.

## Situational docs

- **Packages**: finding which package owns a feature, or working in one without its own `CLAUDE.md`: read `packages/README.md`, then that package's README.
- **Monorepo discipline**: adding a package, editing a `package.json` or `tsconfig.json`, a push blocked by the pre-push hook, or a large cross-package refactor: read `docs/agents/monorepo.md`.
- **Effect lookups**: most online docs, the Effect docs MCP server and `effect-solutions` describe Effect 3. Looking up an Effect API, or `bun run tsc` reporting `effect(outdatedApi)`: read `docs/agents/effect-docs.md`.

## Agent skills

- **Issue tracker**: publishing, fetching or editing issues: read `docs/agents/issue-tracker.md`.
- **Triage labels**: applying a triage role to an issue: read `docs/agents/triage-labels.md`.
- **Domain docs**: naming a domain concept, or exploring an area that may have a glossary or ADRs: read `docs/agents/domain.md`.
