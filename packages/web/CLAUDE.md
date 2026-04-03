# packages/web — Coding Rules

Marketing/landing site for the Lily plant care app. **Next.js 16 static export** (no server runtime), deployed as a CDN-hosted site.

> **See also:** Root `CLAUDE.md` for monorepo-wide rules (Effect.js, formatting, imports).

---

## Architecture

- **Framework**: Next.js 16 App Router, static export (`output: 'export'`)
- **Rendering**: All pages are Server Components by default — add `'use client'` only when strictly needed (event handlers, browser APIs, scroll-triggered animations)
- **Code splitting**: Use `dynamic()` from `next/dynamic` for heavy client components on the home page to reduce initial JS bundle
- **i18n**: `next-intl` with locale prefix in URL (`/en/...`, `/fr/...`). Supported locales: `en`, `fr`
- **Styling**: Tailwind CSS v4 with neumorphic design system (CSS variables in `globals.css`)
- **Animations**: CSS transitions + IntersectionObserver via `<FadeIn>` component — client components only
- **Blog content**: MDX files in `content/posts/[locale]/` parsed at build time

---

## Effect.js in this package

Follow root `CLAUDE.md` Effect rules. Web-specific note: since this is a static build (no Effect runtime), use Effect utilities **for pure data transformations only** — array ops, Option handling, pattern matching, date parsing. Never use `Effect.runSync` or `Effect.runPromise` at runtime in components.

---

## SEO Rules (MANDATORY)

### Every page MUST have:

1. **`generateMetadata`** export returning at minimum:
   - `title` — unique per page, under 60 characters
   - `description` — unique per page, 120–160 characters
   - `openGraph.url` — absolute URL (`https://lilyapp.io/...`)
   - `alternates.languages` — hreflang for every supported locale
   - `alternates.canonical` — canonical URL for the current locale

2. **Language alternates** — always include both locales:
   ```typescript
   alternates: {
     canonical: `https://lilyapp.io/${locale}/path`,
     languages: {
       en: 'https://lilyapp.io/en/path',
       fr: 'https://lilyapp.io/fr/path',
     },
   }
   ```

3. **OpenGraph** — required on every page:
   ```typescript
   openGraph: {
     title, description,
     url: `https://lilyapp.io/${locale}/path`,
     type: 'website', // or 'article' for blog posts
     images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '...' }],
     locale: locale === 'fr' ? 'fr_FR' : 'en_US',
   }
   ```

4. **Twitter card** — include on every page:
   ```typescript
   twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] }
   ```

### JSON-LD Schemas

Use the `<JsonLd>` component to inject `application/ld+json` scripts. Match schema to page type:

| Page | Schema type |
|------|-------------|
| Root layout (`[locale]/layout.tsx`) | `SoftwareApplication` + `Organization` |
| Home page | `FAQPage` |
| Blog post | `Article` + `BreadcrumbList` |
| New content page | Add appropriate schema from schema.org |

**Never duplicate schemas** — `SoftwareApplication` and `Organization` are injected once in `[locale]/layout.tsx`.

Schema field requirements:
- `Article`: `headline`, `description`, `datePublished`, `dateModified`, `author`, `publisher`, `mainEntityOfPage`, `image` (if cover exists)
- `BreadcrumbList`: include full path from home to current page with correct `position` and `item` URLs
- `FAQPage`: `mainEntity` array with `Question` + `Answer` for every FAQ item

### Sitemap

`src/app/sitemap.ts` is auto-generated. When adding new static pages:
1. Add the path to `staticPages` array in `sitemap.ts`

Blog posts are included automatically via `getAllPosts()`.

> **Note:** `changeFrequency` and `priority` are omitted — Google ignores both fields. Static pages omit `lastModified` since they don't have meaningful modification dates. Blog posts use their frontmatter `date` for `lastModified`.

### Blog Post Frontmatter (MANDATORY fields)

Every MDX file in `content/posts/[locale]/` must have:

```yaml
---
title: 'Exact title matching the h1 (under 60 chars for SEO)'
description: 'Meta description, 120–160 characters, unique'
date: '2025-01-15'           # ISO 8601, used for sitemap lastModified + sorting
slug: 'url-friendly-slug'    # Must match filename without .mdx
category: 'plant-care'       # kebab-case, used in UI
tags: ['watering', 'tips']   # Array, used for grouping
coverImage: '/images/cover.jpg'  # Optional, used in OG image + article schema
---
```

- `date` drives post sort order — always set to actual publish date
- `slug` must match the MDX filename exactly (`slug: 'my-post'` → `my-post.mdx`)
- When adding a post in one locale, **always add the translated version** in the other locale

---

## i18n Rules

- All user-visible strings go in `messages/en.json` and `messages/fr.json` — never hardcode English text in components
- Server components: `getTranslations({ locale, namespace: 'Namespace' })`
- Client components: `useTranslations('Namespace')`
- Always call `setRequestLocale(locale)` at the top of page server components
- New namespaces must be added to **both** `en.json` and `fr.json`

---

## Component Conventions

| Type | When to use | Examples |
|------|-------------|---------|
| Server Component (default) | Data fetching, static rendering, i18n, blog content | `LatestPosts`, `Features`, `Footer`, `BlogPostCard` |
| `'use client'` | Event handlers, `useState`/`useEffect`, IntersectionObserver, scroll listeners | `Header`, `Hero`, `FAQ`, `FeatureSection` |

**Rule**: Keep `'use client'` boundary as deep as possible. A server component can import a client component, but not vice versa for server-only code.

---

## URL Structure

```
/                      → redirects to /en or /fr
/[locale]              → home/landing page
/[locale]/blog         → blog index
/[locale]/blog/[slug]  → blog post
/[locale]/privacy      → privacy policy
/[locale]/terms        → terms of service
```

All internal `<Link href="...">` must include the locale prefix: `href={`/${locale}/blog`}`.

---

## Performance Rules

1. **Static only** — no `getServerSideProps`, no API routes, no server actions. Everything is pre-rendered at build time.
2. **Code split** the home page — wrap heavy sections in `dynamic(() => import(...))` (see `[locale]/page.tsx` for examples)
3. **Images** — use `next/image` with explicit `width`/`height` or `fill`. Set `priority` on above-the-fold images (hero, cover). All images are unoptimized (static export).
4. **Fonts** — loaded via `next/font/google` in the locale layout, never via `<link>` tags

---

## Adding a New Page

Checklist:
- [ ] Create `src/app/[locale]/new-page/page.tsx`
- [ ] Export `generateMetadata` with title, description, OG, Twitter, canonical, hreflang
- [ ] Add JSON-LD schema if appropriate for the content type
- [ ] Add to `staticPages` in `sitemap.ts`
- [ ] Add translations to `messages/en.json` and `messages/fr.json`
- [ ] Update navigation in `Header.tsx` if user-facing
