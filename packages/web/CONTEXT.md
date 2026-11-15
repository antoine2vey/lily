# Web domain language

The vocabulary of the public site and its blog. The SEO plan in `docs/seo/strategy.md` and the code in this package use these terms with these meanings.

## Site

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Locale** | `en` or `fr`. It is the first path segment of every page except the language redirect at `/` and the join page. | |
| **Indexable page** | A page without `noindex` in its robots meta. It is listed in `src/lib/sitemap.ts` and must pass the SEO lint. | |
| **Static path** | A page that is not a post, such as the home, the team page or the legal pages. Each one is an entry of `STATIC_PATHS`. | |

## Blog

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Post** | One MDX file in `content/posts/<locale>/`. Every post exists in both locales under the same slug. | |
| **Hub** | A post that is the only page for one search intent. The slugs of the posts merged into it are listed in its `redirectFrom`. `blog-check.ts --hubs` takes the planned hub slugs as the only valid link targets. | |
| **Category** | One of the post categories in `CATEGORIES` in `src/lib/posts.ts`. A post has exactly one. | "tag", which is a free-form label in `tags` |
| **redirectFrom** | The old slugs that now answer with a 301 to this post. The blog gate writes them to `dist/redirects.map`, which nginx includes. | |
| **Blog gate** | `scripts/blog-check.ts --strict`, the frontmatter, parity, link and phrasing check that runs in `build`. | |

## Join

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Join page** | The noindex page at `/join/<token>`. It shows the invite preview of a canopy [link](../api/CONTEXT.md#canopy) and opens the app with `lily://join/<token>`. | |
| **Invite preview** | The canopy name and inviter name the API returns for a link token. The code calls it `InvitePreview`. | |

## Relationships

- The join page reads one canopy link through the API. [`packages/api/CONTEXT.md`](../api/CONTEXT.md) owns Canopy, Link and Invitation.
