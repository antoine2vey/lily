# Monorepo Discipline

Package-level conventions for the Lily monorepo (Bun workspaces under `packages/`, orchestrated by Turborepo). The step-by-step checklist for scaffolding a new package is in `packages/README.md` under "Adding a package"; the rules below are what every package must satisfy.

- **tsconfig extends**: every package's `tsconfig.json` MUST `extends: "../../tsconfig.json"`. Exception: a package whose build tool needs a different base (today only the Expo app, on `expo/tsconfig.base`) explicitly mirrors the root's strict-plus flags.
- **package.json `sideEffects`**: every package MUST declare `sideEffects` (either `false` or a precise glob list). Pure libraries are `false`; apps with CSS imports list them.
- **TypeScript version**: every package's `typescript` devDependency MUST match the root version exactly.
- **CI gate**: CI and the `.husky/pre-push` hook both run lint, `tsc` and tests; a failure blocks the push. Emergency bypass: `HUSKY=0 git push`.
- **Root composite build**: `bun run tsc:build` exercises the project-reference graph end-to-end. Run it locally before large refactors.
