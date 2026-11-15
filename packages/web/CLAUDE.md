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
| `bun packages/web/scripts/seo-check.ts packages/web/dist/client --baseline <old dist>` | Diffs URLs, canonical, hreflang, og, robots and JSON-LD types against an earlier build |
| `bun packages/web/scripts/page-bytes.ts` | Checks the gzipped JS and CSS that each page in its `PAGES` sample loads up front against the budgets at the top of the script. Other pages are not measured. Run it after `build`. CI runs it from `scripts/check-bundle-sizes.sh` |
| `bun packages/web/scripts/lighthouse.ts` | Mobile Lighthouse, three runs per page, against `preview` on port 8088. It exits 1 on a budget breach, and 2 when the machine was too slow for it to judge the timing metrics. Set `CHROME_PATH` if Chrome is not in `/Applications` |

## Layout

- `src/routes/` holds file-based routes. `$locale/route.tsx` validates the locale and injects the site-wide JSON-LD (`SoftwareApplication`, `Organization`, `WebSite`) once. `index.tsx` is the language redirect at `/`. `join.tsx` is the noindex invite page. nginx serves it for every `/join/<token>` path.
- `src/i18n/en.ts` is the source of truth for every visible string. `fr.ts` is typed against it, so a missing or extra key fails `tsc`. Read strings with `useI18n()` in components and `messagesFor(locale)` in `head()`. Use `fmt` for `{var}` interpolation and `plural` for counts.
- `src/lib/seo.ts` builds the `head()` of every indexable page. It covers the title, description, canonical, en/fr/x-default hreflang, Open Graph, the Twitter card and JSON-LD. `src/lib/page-seo.ts` wraps it for the plain document pages. The noindex `/` and `/join` routes write their head by hand.
- `src/lib/sitemap.ts` is the single list of indexable URLs. The prerender page list in `vite.config.ts`, `sitemap.xml` and the SEO check all derive from it.
- `vite/posts.ts` compiles `content/posts/<locale>/*.mdx` to `{ meta, html }` modules at build time and exposes the per-locale index as `virtual:post-index/<locale>`. `src/lib/post-data.ts` is the only reader in page code. Import it dynamically inside loaders (`await import('@/lib/post-data')`) so the post index stays out of every page's main chunk. The server-only `sitemap.xml` route imports the index statically.
- `src/components/home/` holds the home page sections. The timelapse hero (`src/components/home/Timelapse.tsx`) and the Water All phone (`src/components/home/WaterCombo.tsx`) run their animation engines inside a single `useEffect` and touch the DOM directly. React does not re-render per frame. The other animated sections mount their engines with `useLive()` from `src/components/home/live.ts`. It imports the engine module only when its root comes within 300px of the viewport, so the home's initial JS carries no engine code, and it sets `data-near`, which gates the CSS screenshot backgrounds. Mount a new animated section the same way. `whileVisible()` in the same file runs a loop only while its element is on screen. `home.css` is scoped under `.tlhero` and `.wc`, and `story.css` uses the `.m-` prefix.
- `src/lib/canopy-invite.ts` holds the only API call. The join page posts the token to `canopy-invites/preview` and opens the app with `lily://join/<token>`. `VITE_API_URL` here is the versioned base, `/api/v1` included, because the package does not import `@lily/shared` for `API_PREFIX`.
- `public/.well-known/` holds the iOS universal link and Android app link files. They must match the bundle IDs and team in `packages/app/app.json`, and CI checks that with `scripts/check-well-known.ts`.
- `public/tl/` holds the hero frames. Regenerate them from a source video with `scripts/tl-frames.sh`.

## Rules

- **Every indexable page calls `seo()`** with a unique title of at most 60 characters and a description of 120 to 160 characters. The SEO lint in `scripts/seo-check.ts` runs in the build. It fails when any page lacks a title. It also fails when an indexable page lacks a description, has a canonical or `og:url` other than its own URL, lacks an en, fr or x-default hreflang, has other than one `h1`, or is missing from the sitemap. A sitemap URL with no page fails it too. JSON-LD is checked only by the `--baseline` diff. In the lint, a title over 60 characters or a description outside 120 to 160 is only a warning. For a post, the blog gate fails the build on the same description range and on a frontmatter title longer than `TITLE_MAX` in `scripts/blog-check.ts`.
- **New static page.** Add the route, add its path to `STATIC_PATHS` in `src/lib/sitemap.ts`, and add its strings to both `en.ts` and `fr.ts`.
- **No hardcoded copy in components.** That includes aria labels and alt text.
- **Displayed prices are hand-written.** The real subscription price is set in the App Store and Google Play. A price change edits the `Pricing` and `Faq` strings in both `en.ts` and `fr.ts`, the `AggregateOffer` JSON-LD in `src/routes/$locale/route.tsx` and `public/llms.txt`. Nothing keeps them in sync.
- **French typography.** Put a no-break space (U+00A0) before `? ! : ;`.
- **Internal links** use `<Link to="/$locale/..." params={{ locale }}>` so the locale prefix is never lost.
- **Effect** is for pure data work only (Array, Option, Record, DateTime, Schema). There is no Effect runtime in the browser.
- **Head data comes from the loader.** `head()` is synchronous, so anything it needs must come from `loaderData`.
- **Phone mockups copy the real app.** Every phone on the site, the hero included, is static and front-facing, with no tilt, bob or incline. It shows real app screens and behaves as the app does, so it never shows UI the app lacks.
- **Lighthouse gates performance work.** After each step, build, run `preview`, then `scripts/lighthouse.ts` on the prerendered pages, and keep every budget in that script green. `scripts/page-bytes.ts` holds the byte budgets.
- **Analytics.** Google Analytics loads from an idle callback after the window `load` event in `__root.tsx`. Loading it earlier starves hydration and competes with the hero bytes.

## Blog

The SEO plan, keyword map and editorial rules live in `docs/seo/strategy.md`. Read it before adding or rewriting a post. One post covers one search intent. Improve the existing hub before adding a post that competes with it.

Every post in `content/posts/<locale>/` needs `title`, `description`, `date` (ISO, the day it first went live), `updated` (ISO, last substantive revision), `slug` (equal to the file name, which is the real slug), `category` (`care-guides`, `watering`, `plant-problems`, `pests` or `houseplant-basics`) and `tags`. `redirectFrom` lists old slugs that now return a 301 to this post. Never remove an entry from it. `PostMeta` in `src/lib/posts.ts` validates the fields the site reads. `scripts/blog-check.ts --strict` runs in the build and checks the rest: the slug and dates, EN/FR parity, redirects, internal links, placeholder hosts and mis-encoded characters. `--strict` also fails on the editorial rules of [docs/seo/strategy.md](../../docs/seo/strategy.md): title and description length, the category, a missing `updated`, em dashes, banned AI phrasing, and in French posts English words, a title identical to the English one and regular spaces where French needs a no-break space. It also writes `dist/redirects.map` for nginx. Add every new post in both locales.

A post body is GitHub-flavored markdown despite the `.mdx` extension. `vite/posts.ts` drops raw HTML and does not compile JSX or imports. It turns a `#` heading into an `h2` so the page keeps one `h1`.
