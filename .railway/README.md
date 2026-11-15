# Railway configuration

This project defines its Railway infrastructure in code.

## Lily specifics

- The CLI is pinned as a root devDependency (`@railway/cli`). Always call it as
  `./node_modules/.bin/railway`, never via `bunx` or `bun run`. `railway/iac`
  checks the CLI version by running `$_`, and under Bun that resolves to the
  bun binary, so the check fails.
- Pull requests that touch `.railway/` get a plan comment from
  `.github/workflows/railway-config.yml`, and the plan is applied on merge.
  Destructive changes fail in CI on purpose; apply them by hand after
  reviewing the plan.
- Secret values never live here: every secret is `preserve()`. Set or rotate
  them in the Railway dashboard.
- Postgres is pinned with `database(...)` to `postgres-ssl:17`. The
  `postgres()` helper defaults to v18, which can't boot the v17 data
  directory.
- Check for drift: `./node_modules/.bin/railway config plan --detailed-exit-code`
  (exit 0 = in sync, 2 = pending changes).

## Commands

Run each one from the repository root.

| Command | What it does |
| --- | --- |
| `./node_modules/.bin/railway config plan` | Previews what Railway would change. It changes nothing. |
| `./node_modules/.bin/railway config apply` | Shows the plan and asks before applying it. |
| `./node_modules/.bin/railway config pull` | Imports the live project into code, with secrets as `preserve()`. |

A destructive change in a non-interactive or agent session needs `railway config apply --confirm-destructive`, after a human has reviewed the plan.

Keep one `.railway/railway.ts` for the whole project. Railway's named partials exist for separate repos and are not used here.
