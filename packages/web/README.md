# @lily/web

> The public marketing site for Lily — a Next.js 16 static-export app with bilingual content (en/fr), an MDX blog, and SEO-first rendering.

## Overview

`@lily/web` is the marketing and content funnel for Lily, deployed as a fully static export (no server runtime) to a CDN. It renders a landing page, legal pages, and a sizeable MDX-powered blog, all available in English and French. Every page is pre-rendered at build time with JSON-LD structured data, Open Graph metadata, and hreflang alternates. The package is **decoupled from the backend** — it makes no API calls and imports no other workspace packages.

## Architecture

```
content/posts/{en,fr}/*.mdx ──┐
messages/{en,fr}.json ────────┤
                              ▼
            next build (output: 'export')
                              │
                              ├─▶ static HTML + JSON-LD + sitemap + hreflang
                              └─▶ Fuse.js search index (prebuilt JSON)
                              ▼
                         out/  ──▶ CDN
```

- **Server Components by default** — `'use client'` is added only for event handlers, browser APIs, and scroll-triggered animations.
- **Code splitting** — heavy landing sections are lazy-loaded via `next/dynamic` to keep the initial JS bundle small.
- **i18n** — `next-intl` with locale-prefixed routes (`/en/...`, `/fr/...`); translations live in `messages/{en,fr}.json`.
- **Blog** — MDX files parsed at build time with `gray-matter`; frontmatter is validated with Effect Schema, so a missing field fails the build.

## Project Structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx          # Locale layout: metadata, JSON-LD (SoftwareApplication, Organization), GA
│   │   ├── page.tsx            # Landing page (FAQPage schema, dynamic sections)
│   │   ├── blog/               # Blog index, post detail, pagination
│   │   └── {about,privacy,terms,support}/
│   ├── sitemap.ts              # Auto-generated sitemap with hreflang alternates
│   └── robots.ts               # robots.txt (allows GPTBot / OAI-SearchBot)
├── components/                 # 21 components (Hero, FAQ, Features, JsonLd, BlogList, …)
├── i18n/                       # next-intl routing + request config (locales: en, fr)
└── lib/
    ├── posts.ts                # MDX loader: frontmatter parse + Schema validation + caching
    ├── blog-pagination.ts
    └── authors.ts
content/posts/{en,fr}/          # MDX blog posts (kept in sync across locales)
messages/{en,fr}.json           # Translation namespaces
scripts/
├── build-search-index.ts       # Builds the Fuse.js blog search index
└── optimize-images.ts          # Resize/compress public images with sharp
```

## Key Concepts

### SEO is mandatory

Every page exports `generateMetadata` (title, description, canonical, hreflang, OG, Twitter) and injects the right JSON-LD schema via the `<JsonLd>` component (`FAQPage` on home, `Article` + `BreadcrumbList` on posts). The full rules live in this package's [`CLAUDE.md`](CLAUDE.md).

### Build-time search

`bun scripts/build-search-index.ts` runs before `next build` and emits `public/search-index-{en,fr}.json` from all blog posts. The client uses [Fuse.js](https://fusejs.io) for instant fuzzy search with zero server calls.

### Effect for pure transforms only

This is a static build with no Effect runtime — use Effect modules for pure data transforms (Array, Option, Match, DateTime, Schema) in `lib/`, never `Effect.runSync`/`runPromise` in components.

## Development Workflow

```bash
# From the repository root (never cd into the package):
bun run --filter=@lily/web dev      # next dev on http://localhost:3001
bun run --filter=@lily/web build    # build search index, then static export to out/
```

## Quick Reference

| Command | What it does |
| --- | --- |
| `dev` | `next dev --port 3001` |
| `build` | Build the Fuse.js search index, then `next build` (static export to `out/`) |
| `build:search-index` | Regenerate `public/search-index-{en,fr}.json` |
| `start` | Serve the static `out/` directory |
| `tsc` | `tsc --noEmit` |
| `lint` / `lint:fix` | Biome check / autofix |
| `optimize-images` | Resize and compress images in `public/` |

## Related Documentation

- [Root README](../../README.md) — monorepo overview
- [`CLAUDE.md`](CLAUDE.md) — SEO, i18n, and component rules for this package
- [Next.js App Router](https://nextjs.org/docs/app) · [next-intl](https://next-intl.dev)
