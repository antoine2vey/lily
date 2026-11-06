# packages/web

The public marketing site and blog at `https://withlily.app`. It is built with TanStack Start on Vite and prerendered to static HTML in `dist/client`. nginx serves that directory with `nginx.conf` (see `Dockerfile`). There is no server at runtime. A route that needs data at request time cannot exist here.

## Commands

Run every command from the monorepo root.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/web dev` | Vite dev server on port 3001 |
| `bun run --filter=@lily/web build` | Prerenders every page, runs the SEO lint over `dist/client`, then the blog gate, which writes `dist/redirects.map` |
| `bun packages/web/scripts/blog-check.ts --strict --verbose` | The blog gate on its own |
| `bun run --filter=@lily/web preview` | Serves `dist/client` with the production nginx config in Docker on port 8088 |
| `bun run --filter=@lily/web tsc` | Typecheck, which also checks that `fr.ts` matches `en.ts` |
| `bun run --filter=@lily/web lint` | Biome |
| `bun packages/web/scripts/seo-check.ts packages/web/dist/client --baseline <old dist>` | Diffs URLs, canonical, hreflang, og and JSON-LD types against an earlier build |

## Layout

- `src/routes/` holds file-based routes. `$locale/route.tsx` validates the locale and injects the site-wide JSON-LD (`SoftwareApplication`, `Organization`, `WebSite`) once. `index.tsx` is the language redirect at `/`. `join.tsx` is the noindex invite page.
- `src/i18n/en.ts` is the source of truth for every visible string. `fr.ts` is typed against it, so a missing or extra key fails `tsc`. Read strings with `useI18n()` in components and `messagesFor(locale)` in `head()`. Use `fmt` for `{var}` interpolation and `plural` for counts.
- `src/lib/seo.ts` builds every route's `head()`. It covers the title, description, canonical, en/fr/x-default hreflang, Open Graph, the Twitter card and JSON-LD. `src/lib/page-seo.ts` wraps it for the plain document pages.
- `src/lib/sitemap.ts` is the single list of indexable URLs. The prerender page list in `vite.config.ts`, `sitemap.xml` and the SEO check all derive from it.
- `vite/posts.ts` compiles `content/posts/<locale>/*.mdx` to `{ meta, html }` modules at build time and exposes the per-locale index as `virtual:post-index/<locale>`. `src/lib/post-data.ts` is the only reader. Import it dynamically inside loaders (`await import('@/lib/post-data')`) so the post index stays out of every page's main chunk.
- `src/components/home/` holds the timelapse hero and the Water All phone. Their animation engines run inside a single `useEffect` and touch the DOM directly. React does not re-render per frame. `home.css` is scoped under `.tlhero` and `.wc`.
- `public/tl/` holds the hero frames. Regenerate them from a source video with `scripts/tl-frames.sh`.

## Rules

- **Every indexable page calls `seo()`** with a unique title under 60 characters and a description of 120 to 160 characters. The build fails when a page lacks a title, description, canonical, og:url or hreflang, has other than one `h1`, or is indexable but missing from the sitemap. Description length outside 120 to 160 is only a warning.
- **New static page.** Add the route, add its path to `STATIC_PATHS` in `src/lib/sitemap.ts`, and add its strings to both `en.ts` and `fr.ts`.
- **No hardcoded copy in components.** That includes aria labels and alt text.
- **French typography.** Put a no-break space (U+00A0) before `? ! : ;`.
- **Internal links** use `<Link to="/$locale/..." params={{ locale }}>` so the locale prefix is never lost.
- **Effect** is for pure data work only (Array, Option, Record, DateTime, Schema). There is no Effect runtime in the browser.
- **Head data comes from the loader.** `head()` is synchronous, so anything it needs must come from `loaderData`.
- **Analytics.** Google Analytics loads from an idle callback after the window `load` event in `__root.tsx`. Loading it earlier starves hydration and competes with the hero bytes.

## Blog

The SEO plan, keyword map and editorial rules live in `docs/seo/strategy.md`. Read it before adding or rewriting a post. One post covers one search intent. Improve the existing hub before adding a post that competes with it.

Every post in `content/posts/<locale>/` needs `title`, `description`, `date` (ISO, the day it first went live), `updated` (ISO, last substantive revision), `slug` (equal to the file name, which is the real slug), `category` (`care-guides`, `watering`, `plant-problems`, `pests` or `houseplant-basics`) and `tags`. `redirectFrom` lists old slugs that now return a 301 to this post. Never remove an entry from it. `PostMeta` in `src/lib/posts.ts` validates the fields the site reads. `scripts/blog-check.ts --strict` runs in the build and checks the rest: slug and dates, EN/FR parity, internal links, redirects, title and description length, banned AI phrasing and French spacing. It also writes `dist/redirects.map` for nginx. Add every new post in both locales.
