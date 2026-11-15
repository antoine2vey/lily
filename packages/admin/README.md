# @lily/admin

The internal operations dashboard for Lily. Admins use it to watch the product KPIs, look up a user and their plants and conversations, grant or revoke a gift subscription, manage gift codes, run knowledge-base ingest jobs, search the knowledge base, preview the prompt behind a chat message and send a test Live Activity.

It is a Vite and React 19 single-page app with React Router, TanStack Query, Recharts and Tailwind. It has no server of its own. Every page talks to [`@lily/api`](../api/README.md) over HTTP and takes its response types and constants from [`@lily/shared`](../shared/README.md).

## How it fits

```
pages (lazy routes) ─▶ hooks (TanStack Query) ─▶ src/lib/api-client.ts ─▶ @lily/api  /api/v1/admin/*
                                                                                    /api/v1/knowledge/*
```

- Login sends a magic link to the admin's email and verifies its code through `/api/v1/auth`. Only a user with the `admin` role gets in, and the API checks that role again on every admin route.
- The access and refresh tokens live in `localStorage`. `src/lib/api-client.ts` refreshes the access token 30 seconds before it expires and retries a request once after a 401.
- Every page is lazy-loaded, so Recharts loads only with the analytics page.
- The analytics range (`7d`, `30d` or `90d`) is in the URL, so a link shows the same view to another admin.

## Commands

Run these from the repository root.

```bash
bun run --filter=@lily/admin dev       # http://localhost:5173
bun run --filter=@lily/admin build     # tsc, then vite build into dist
bun run --filter=@lily/admin preview   # serve the production build
bun run --filter=@lily/admin tsc
bun run --filter=@lily/admin lint      # lint:fix to apply fixes
```

## Environment

```bash
VITE_API_URL=http://localhost:3000   # API origin, without /api/v1. This is the default.
```

The dashboard adds `/api/v1` to every path itself. See [`.env.example`](../../.env.example).

## Related documentation

- [`CLAUDE.md`](CLAUDE.md) has the conventions for this package.
- [`CONTEXT.md`](CONTEXT.md) defines the dashboard's terms.
- [Root README](../../README.md) covers the monorepo.
