# packages/admin

The internal operations dashboard. It is a Vite and React 19 single-page app that runs in an admin's browser, built with React Router, TanStack Query, Recharts and Tailwind. Every read and write is an HTTP call to the API under `/api/v1/admin`, `/api/v1/knowledge` and `/api/v1/auth`. It has no server, no database access and no Effect runtime. The API enforces the admin role, so a check in this package is only for the UI.

## Commands

Run every command from the monorepo root.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/admin dev` | Vite dev server on port 5173 |
| `bun run --filter=@lily/admin build` | Typecheck, then a production build into `dist` |
| `bun run --filter=@lily/admin tsc` | Typecheck |
| `bun run --filter=@lily/admin lint` | Biome |

## Layout

- `src/App.tsx` declares every route and lazy-loads every page, so Recharts ships only with the analytics page. Add a new page the same way, inside the `Layout` route under `AuthGate`. For a page the sidebar links to, add an entry to `navItems` in `src/components/Layout.tsx`.
- `src/lib/api-client.ts` is the only way a hook calls an authenticated route. `apiRequest<T>(path)` prepends the API origin, adds the bearer token and refreshes it 30 seconds before it expires. Concurrent requests share one refresh. A 401 retries once after a refresh. A failed refresh or a 403 clears the tokens and sends the browser to `/login`.
- `src/lib/auth.ts` holds the tokens in `localStorage` and reads `VITE_API_URL`. That variable is the bare API origin, with no prefix, and defaults to `http://localhost:3000`.
- `src/hooks/use-auth.ts` runs the magic-link and code login with plain `fetch`, because no token exists yet. It rejects a user whose role is not `admin` before storing any token.
- `src/hooks/` holds one hook per endpoint, and `src/hooks/analytics/` one hook per KPI. Every KPI hook sets a 5 minute `staleTime`, and the per-endpoint hooks keep the TanStack Query default.
- `src/hooks/analytics/use-analytics-filters.ts` keeps the range preset in the `?range=` query param, so a shared link shows the same range. Call `resolvePresetRange()` inside `queryFn`, never during render, so the current time stays out of render and out of the query key.
- `src/index.css` holds the Tailwind import and the `@theme` tokens.

## Rules

- **Start every API path with `API_PREFIX`** from `@lily/shared`, as in `` `${API_PREFIX}/admin/users` ``. The API also answers on the legacy `/api` alias, but new code uses the versioned path.
- **Type responses with the shared schema.** `apiRequest` returns the raw JSON and decodes nothing, so a date is still a string. When a shared schema decodes dates, type the response with its `typeof X.Encoded`, as `src/hooks/use-prompt-preview.ts` does. The `X` type that `@lily/shared` exports next to a schema is the decoded type.
- **Import with `@/`** for anything under `src` outside the importing file's own folder. The alias is set in `vite.config.ts` and `tsconfig.json`.
- **Effect is for data shaping.** Use `Array`, `Option`, `Match`, `String` and `pipe` in components and hooks, per `CODING_STANDARDS.md`. Server state belongs to TanStack Query.
