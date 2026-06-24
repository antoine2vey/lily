# @lily/admin

> Internal operations dashboard for Lily — a Vite + React 19 SPA for managing users, gift codes, analytics, and the knowledge base.

## Overview

`@lily/admin` is the internal tool operators use to run Lily: monitor platform health (DAU/WAU/MAU, MRR, churn, trial-to-paid), search and inspect users, create and revoke gift subscription codes, kick off knowledge-base ingestion jobs, preview AI prompts, and trigger Live Activities. It's a client-only SPA that talks to [`@lily/api`](../api) over HTTP and shares types with [`@lily/shared`](../shared) so admin responses stay type-safe end to end.

## Architecture

```
React Router (lazy routes) ─▶ pages/*  ─▶ hooks/* (TanStack Query)
                                              │
                                   lib/api-client.ts (fetch + JWT refresh)
                                              │
                                              ▼
                                      @lily/api  /api/admin/*
```

- **Server state** is managed with [TanStack Query](https://tanstack.com/query); each endpoint has a dedicated `use-*` hook with consistent query keys and stale times.
- **Auth** uses magic-link + verification-code login, gated to the `admin` role. Access/refresh tokens live in `localStorage`; `api-client.ts` proactively refreshes the access token ~30s before expiry (decoded client-side) to avoid auth flicker.
- **Route-level code splitting** — every page is `React.lazy`-loaded, so heavy dependencies (Recharts on the analytics page) ship only where needed.

## Project Structure

```
src/
├── main.tsx                  # React root (StrictMode)
├── App.tsx                   # Router, lazy routes, QueryClientProvider
├── pages/                    # Route pages (Analytics, Users, UserDetail, GiftCodes, Jobs, Search, …)
├── components/
│   ├── Layout.tsx            # Sidebar + outlet
│   ├── AuthGate.tsx          # Protected-route guard
│   └── analytics/            # Recharts wrappers + KpiCard, DateRangeFilter
├── hooks/                    # 40+ React Query hooks
│   └── analytics/            # One hook per KPI (DAU/WAU/MAU, MRR, churn, …)
└── lib/
    ├── auth.ts               # Token storage + API URL config
    ├── api-client.ts         # Fetch wrapper: proactive JWT refresh, 401/403 handling
    └── format.ts
```

## Key Concepts

### Proactive token refresh

`api-client.ts` decodes the access token's expiry and refreshes ~30s early, deduping concurrent refreshes behind a single promise so a burst of requests triggers only one refresh. On a hard 401/403 it clears tokens and redirects to `/login`.

### Functional UI with Effect

Components lean on Effect's `Array`, `Option`, `Match`, and `pipe` for data shaping instead of imperative branching — the same Effect-first conventions used across the monorepo.

### Shared contract

Response types (`PaginatedResponse`, analytics responses, `UserRole`, `UserStatus`) and constants (`GIFT_DURATION_LABELS`) come from [`@lily/shared`](../shared), so a backend schema change surfaces as a compile error here.

## Development Workflow

```bash
# From the repository root:
bun run --filter=@lily/admin dev      # Vite dev server
bun run --filter=@lily/admin build    # tsc + vite build
```

Set `VITE_API_URL` to point at your API (defaults to `http://localhost:3000`) — see [`.env.example`](../../.env.example).

## Quick Reference

| Command | What it does |
| --- | --- |
| `dev` | Start the Vite dev server |
| `build` | `tsc && vite build` |
| `preview` | Preview the production build |
| `tsc` | `tsc --noEmit` |
| `lint` / `lint:fix` | Biome check / autofix |

### Environment

```bash
VITE_API_URL=http://localhost:3000   # Backend API base URL
```

## Related Documentation

- [Root README](../../README.md) — monorepo overview
- [`@lily/api`](../api/README.md) — the backend this dashboard drives
- [`@lily/shared`](../shared/README.md) — shared response types and constants
