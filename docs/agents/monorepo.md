# Monorepo Discipline

Rules every package satisfies. To scaffold a new package, follow "Adding a package" in `packages/README.md`.

- **tsconfig extends**: every package's `tsconfig.json` MUST `extends: "../../tsconfig.json"`. Exception: a package whose build tool needs a different base (today only the Expo app, on `expo/tsconfig.base`) explicitly mirrors the root's strict-plus flags.
- **package.json `sideEffects`**: every package MUST declare `sideEffects` (either `false` or a precise glob list). Pure libraries are `false`; apps with CSS imports list them.
- **TypeScript version**: every package's `typescript` devDependency MUST match the root version exactly.
- **CI gate**: CI and the `.husky/pre-push` hook both run `scripts/check-docs.sh`, `scripts/check-migrations.sh`, lint, `tsc` and tests. A hook failure blocks the push. CI runs after the push, on pull requests and on pushes to `main`. In an emergency, `HUSKY=0 git push` skips the hook.
- **Build info**: in a composite package the `tsc` script writes its build info to `tsconfig.check.tsbuildinfo`, a file of its own. The check and the build run as two Turbo tasks with no order between them, so a check that wrote the build's file could leave it saying that nothing was emitted. `scripts/check-tsc-outputs.sh` runs in CI and fails on a check that writes any other build info.
- **Root composite build**: `bun run tsc:build` exercises the project-reference graph end-to-end. Run it locally before large refactors.
