# @lily/web

The public site for Lily at `https://withlily.app`. It has the landing page, the legal pages and the blog, in English and French. It is built with TanStack Start and prerendered to static HTML that nginx serves.

## How it builds

```
content/posts/{en,fr}/*.mdx ─┐
src/i18n/{en,fr}.ts ─────────┤
src/lib/sitemap.ts ──────────┤
                             ▼
                vite build (TanStack Start prerender)
                             │
                             ├─▶ dist/client/<locale>/... .html, sitemap.xml, robots.txt
                             └─▶ scripts/seo-check.ts lint over every page
                             ▼
                nginx (Dockerfile + nginx.conf)
```

- Every URL in `src/lib/sitemap.ts` is prerendered to one HTML file. The page content, meta tags and JSON-LD are in the HTML, so crawlers do not need JavaScript.
- The client hydrates for navigation, the hero animations, blog search and the theme toggle.
- Blog posts are compiled from markdown at build time by `vite/posts.ts`. Each post is its own chunk, so client navigation fetches only the post it opens.
- Search uses [Fuse.js](https://fusejs.io) over the post index, loaded on first keystroke.
- The package makes no API calls and imports no other workspace package.

## Commands

Run these from the repository root.

```bash
bun run --filter=@lily/web dev        # http://localhost:3001
bun run --filter=@lily/web build      # prerender to dist/client, then SEO lint
bun run --filter=@lily/web preview    # serve dist/client with the production nginx config on :8088
bun run --filter=@lily/web tsc
bun run --filter=@lily/web lint
```

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server |
| `build` | `vite build`, then `scripts/seo-check.ts dist/client` |
| `preview` | `scripts/serve-dist.sh`, nginx in Docker |
| `seo-check` | SEO lint only. Add `--baseline <dir>` to diff against another build |
| `tsc` | Typecheck, including en/fr catalog parity |
| `lint` / `lint:fix` | Biome |
| `optimize-images` | Resize and compress images in `public/` |

## Related documentation

- [`CLAUDE.md`](CLAUDE.md) has the SEO, i18n and layout rules for this package.
- [Root README](../../README.md) covers the monorepo.
- [TanStack Start](https://tanstack.com/start) documents static prerendering.
