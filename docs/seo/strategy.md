# withlily.app SEO strategy

This document is the working plan for organic traffic to withlily.app. It records the goal, the keyword map, the rules every blog post follows, the Google-side setup, and the measured baseline. Update the log at the bottom whenever you ship something that changes search traffic, and add the reasoning to `decision-log.tsv`.

Owner: Antoine de Veyrac. Started 2026-11-06.

## Goal

Turn search traffic into App Store installs. Two kinds of pages do that:

1. **Product pages** that rank for "plant care app", "plant watering reminder app" and the French "application arrosage plantes" / "rappel arrosage plantes". These convert directly. They are the scarcest asset and the hardest to rank.
2. **Plant-care articles** that rank for questions like "how often to water a monstera" or "peace lily drooping". They bring most of the visits, build topical authority for the product pages, and mention Lily once where it helps.

## Baseline (2026-11-06)

Measured in Google Search Console (URL-prefix property `https://withlily.app/`) and in the build:

| Metric | Value |
|---|---|
| Clicks, last 3 months | 1 |
| Impressions, last 3 months | 51 |
| Average position | 34.2 |
| Indexed pages | 288 |
| Not indexed | 103, of which 99 "Crawled, currently not indexed" |
| Sitemap in GSC | submitted 2026-05-27, last read 2026-06-01, 310 URLs (the live sitemap had 638) |
| Blog posts | 289 per locale, median 720 words, 279 of them templated AI text |

Google crawled the posts and declined to index them. The cause is quality and duplication, not crawlability: 51 groups of posts targeted the same query, and the dates and author persona were not real.

## Keyword map

Volumes are rough public estimates. Positions are from live SERPs read on 2026-11-06.

| Intent | English target | French target | Page | Notes |
|---|---|---|---|---|
| Category | plant care app | application entretien plantes | `/en`, `/fr` | Homepage title and hero kicker carry it. SERPs are App Store pages, Reddit and listicles. |
| Feature | plant watering reminder app | rappel arrosage plantes, application arrosage plantes | to build | French SERP is thin (Play, hortenia.com, planti.app). Best near-term product win. |
| Comparison | planta alternative, greg vs planta | alternative à Planta | to build | Listicles rank. A fair comparison page with a table can rank. |
| Brand | with lily, lily plant care app | | `/en` | Another app, "Care-Lily", outranks us for "lily plant care app". Use "Lily: Plant Care" consistently in App Store Connect. |
| Plant care | {plant} care | entretien {plante} | `/blog/{plant}-care-guide` | One hub per plant. |
| Watering | how often to water {plant} | arrosage {plante} | `/blog/how-often-to-water-{plant}` | Only for plants with enough demand and content. Folded into the care guide otherwise. |
| Problems | {plant} yellow leaves, drooping, root rot | {plante} feuilles jaunes | `/blog/{plant}-problems` | One H2 per symptom, phrased as the search. |
| General | overwatering vs underwatering, best soil for houseplants, houseplant care in winter | arrosage plante intérieur hiver, feuilles jaunes plante d'intérieur | `/blog/{topic}` | 32 general hubs. |

## Content architecture

On 2026-11-06 the 289 posts per locale were merged into 125 hubs, one per search intent. `scripts/blog-check.ts` enforces the rules below, and the plan lives in each post's frontmatter:

- `redirectFrom` lists the old slugs a hub replaced. The build turns them into `dist/redirects.map`, and nginx answers each old URL with a 301 to its hub. Never delete a `redirectFrom` entry. Old URLs keep receiving links for years.
- `date` is the day the content first went live (from git history). `updated` is the day of the last substantive revision. Both feed the Article schema, `article:modified_time` and the sitemap.
- The filename is the slug. The frontmatter `slug` must match it.

### Editorial rules

`bun run --filter=@lily/web build` runs the gate in strict mode, so a post that breaks a rule fails the build.

- Title at most 53 characters (the page adds ` | Lily`), keyword first. Description 120 to 160 characters.
- Category is one of `care-guides`, `watering`, `plant-problems`, `pests`, `houseplant-basics`.
- The keyword appears in the title, the first sentence and one H2. The first two or three sentences answer the query with numbers.
- Every factual claim that matters is checked against an extension service, RHS, Missouri Botanical Garden, ASPCA or a paper, and 1 to 3 of those are linked.
- No invented experience, statistics or anecdotes. The author is named, so the text has to be true.
- No em dashes and no stock AI phrasing. The banned list is in `scripts/blog-check.ts`.
- 3 to 6 internal links to other hubs, same locale.
- French is written for French readers, with U+00A0 before `? ! : ;`.

### Adding a post

Check that no hub already covers the intent. If one does, improve that hub and set `updated`. If not, create the post in both locales and run `bun packages/web/scripts/blog-check.ts --strict`.

## Technical setup

- Prerendered static HTML, served by nginx (`packages/web/nginx.conf`) behind Cloudflare.
- Trailing-slash URLs return a 301 to the bare path. Blog pagination beyond the last page returns a 301 to the blog index.
- Each page has a self-canonical, en/fr/x-default hreflang, Open Graph tags and JSON-LD. The build fails on missing tags (`scripts/seo-check.ts`).
- The author is a `Person` entity with `@id` `https://withlily.app/#antoine-de-veyrac`, described on `/en/team` and referenced by every Article and by the Organization as `founder`.
- `PLAY_STORE_LIVE` in `src/lib/site.ts` hides every Play Store link until the Android listing is public. Flip it on release day and add "Android" back to `operatingSystem`.

## Google-side checklist

| Task | Status |
|---|---|
| Add a Domain property `sc-domain:withlily.app` with a DNS TXT record in Cloudflare. It covers www, http and subdomains. | To do |
| After the hub deploy, resubmit `https://withlily.app/sitemap.xml` in GSC. | To do, right after deploy |
| Watch Pages > "Crawled, currently not indexed" weekly. Expect old URLs to move to "Page with redirect". | Weekly |
| Request indexing for `/en`, `/fr`, `/en/team` and the 10 largest hubs with URL inspection. | After deploy |
| Link GA4 (G-YX8RMN49KD) to Search Console. | To do |
| Bing Webmaster Tools: import the site from GSC. Turn on Cloudflare Crawler Hints for IndexNow. | To do |
| App Store Connect: same name in every storefront, for example "Lily: Plant Care & Watering". | To do |

## Roadmap

In order. Each line is one shippable page or change.

1. FR feature page "rappel arrosage plantes" at `/fr/rappel-arrosage-plantes`, with an EN twin "plant watering reminder app".
2. Comparison page "Lily vs Planta" (EN and FR), then "Greg vs Planta vs Lily". Fair, with a table, and dated.
3. Seasonal hub "watering houseplants in winter", published in November and updated every autumn.
4. Free indoor watering calculator (light, season, location). It shows off the watering model and is the page most likely to earn links.
5. Feature pages for shared plants (Canopy) with the plant-sitter and vacation angle, and for Ask Lily (diagnosis).
6. French slugs for French posts, with 301s from the English slugs via `redirectFrom`.
7. Real photos in the plant hubs.

Off-site, ongoing: pitch French "applis plantes" roundups (Numerama, Femina, Les Echos, Radio France ran one each), submit to AlternativeTo as a Planta alternative, and answer Reddit threads that rank for "best plant app" as the maker, saying so.

## Measurement

Review GSC monthly: clicks, impressions, indexed pages, and the top 20 queries per locale. Write one line in the log below. A hub that has had no impressions after 3 months is a candidate for merging or rewriting.

## Log

| Date | Change | Expected effect |
|---|---|---|
| 2026-11-06 | Baseline recorded (see above). | |
| 2026-11-06 | 289 posts per locale merged into 125 hubs and rewritten. Old slugs return a 301. Author named, `/team` page added, dates corrected. | Fewer, stronger pages. "Crawled, currently not indexed" should fall over 4 to 8 weeks. |
| 2026-11-06 | Homepage title "Lily: Plant Care App with Smart Watering Reminders". Play links hidden. Trailing-slash 301s. | Category-keyword impressions on `/en` and `/fr`. |
