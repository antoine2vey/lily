# withlily.app SEO strategy

This document is the working plan for organic installs of Lily. It records the goal, the channels in priority order, the keyword map, the rules every blog post follows, the store and Google setup, and the measured baseline. Update the log at the bottom whenever you ship something that changes search traffic, and add the reasoning to `decision-log.tsv`.

Owner: Antoine de Veyrac. Started 2026-11-06. Revised 2026-11-17.

Android is paused as of 2026-11-17. Plan and measure for the App Store only.

## Goal

Turn search into App Store installs. Count installs, not visits. Four kinds of page do that, listed from the most direct to the least:

1. **The App Store listing.** A person who searches the App Store for a plant app is one tap from an install.
2. **Decision pages** on withlily.app that rank for "plant watering reminder app", "Planta alternative" and the French "rappel arrosage plantes". A person who compares apps still clicks through.
3. **Tools**, starting with the indoor watering calculator. A tool gives a personal answer that a search result page cannot show, and other sites link to it.
4. **Plant-care articles** that answer questions like "how often to water a monstera". They build topical authority, carry internal links to the pages above, and mention Lily once where it helps. They are no longer expected to bring most of the installs.

## Why the plan changed on 2026-11-17

The first version of this plan made the plant-care articles the main source of traffic. Four findings moved them to a support role.

- **AI answers take the click on informational queries.** The [Ahrefs study of 300,000 keywords](https://ahrefs.com/blog/ai-overviews-reduce-clicks/) found that the top result gets about 58% fewer clicks when an AI Overview shows, up from 34.5% a year earlier. The [Seer Interactive 2026 update](https://seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update) reports that the decline has slowed. The two disagree on the size and agree on the direction. A plant-care question is the kind of query an AI Overview answers.
- **Assistants recommend apps by name.** A person who asks an assistant for a plant app gets a short list of names. Lily enters that list through mentions on other sites, not through its own articles.
- **The category results are weak.** A web search for "best plant care app 2026" on 2026-11-17 returned mostly templated affiliate pages that name Planta, PictureThis, Greg and Blossom. Lily was in none of them.
- **No page could be credited with an install.** The App Store links carried no campaign token, so App Store Connect could not report which page sent an install. The links have carried one since 2026-11-17.

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

No App Store baseline is recorded yet. Record impressions, product page views and conversion rate per storefront from App Store Connect before the first listing change.

## Channels

### App Store listing

Work on the French storefront first. The French Google results for the feature query "rappel arrosage plantes" are thin (see the keyword map), and the French press has run roundups of plant apps. Nobody has measured whether French App Store search is as thin.

The table below is a draft. It has not been compared with the live listing or with keyword volumes. The limits are 30 characters for the name, 30 for the subtitle and 100 for the keyword field. Do not repeat a word from the name or the subtitle in the keyword field. Every storefront name starts with "Lily", and the words after it are in the storefront's language.

| Field | English | French |
|---|---|---|
| Name | Lily: Plant Care & Watering | Lily : entretien des plantes |
| Subtitle | Smart watering reminders | Rappel d'arrosage intelligent |
| Keywords | houseplant,garden,schedule,identify,identifier,tracker,fertilizer,monstera,pothos,indoor,journal | fleurs,intérieur,jardin,calendrier,identifier,identification,engrais,monstera,suivi,balcon,potager |

The first three screenshots carry the pitch in search results. Show the watering schedule, the seasonal adjustment and plant identification, in that order.

### Decision pages

A decision page answers a person who is choosing an app. Each page is a static route with its own `seo()` call, in both locales.

- A feature page for watering reminders. The French search results for "rappel arrosage plantes" are thin, so the French page comes first.
- A comparison page "Lily vs Planta", fair, with a table and a date. Then a "Planta alternative" page and a "Greg vs Planta vs Lily" page.
- A page for "open source plant care app". Lily is AGPL-3.0 and the larger apps are closed, so this query is one Lily can own.
- Feature pages for shared plants (Canopy), with the plant-sitter and vacation angle, and for Ask Lily (diagnosis).

### Tools

The indoor watering calculator takes a plant, the light in the room, the location and the season, and returns a watering interval from the model the app uses. The site has no server at runtime, so the calculator runs in the browser. The model's pure code must be callable from `packages/web` before the page can ship.

### Assistants and mentions

- `ROBOTS_TXT` in `packages/web/src/lib/sitemap.ts` allows GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot. `packages/web/public/llms.txt` describes the app. Keep both current when a feature ships.
- Pitch French "applis plantes" roundups. Numerama, Femina, Les Echos and Radio France ran one each.
- Submit Lily to AlternativeTo as a Planta alternative, and to Product Hunt when the calculator ships.
- Answer Reddit threads that rank for "best plant app" as the maker, and say so.
- Start every listing and every mention with "Lily" and a plant-care descriptor. Another app, "Care-Lily", outranks Lily for "lily plant care app".

### Blog

The blog holds 125 hubs per locale, rewritten on 2026-11-06. The hubs are frozen until the three-month review on 2027-02-06. Frozen means the three rules below.

- Do not add an informational post. A new post must support a decision page, a tool or a season.
- Do not rewrite a hub. A rewrite before the review hides the effect of the 2026-11-06 merge. Correct a factual error at any time and set `updated`.
- A photo is not a rewrite. Add real photos to the 39 symptom hubs: the 37 hubs in `plant-problems` and `pests`, plus "plant-leaves-turning-yellow" and "root-rot-recovery" in `houseplant-basics`. A person who searches for a symptom wants to compare a photo with a leaf. Do not use generated photos. A generated photo can show a symptom that does not exist.

At the review, merge or rewrite each hub that has had no impressions. Review the winter hub, `packages/web/content/posts/en/houseplant-care-in-winter.mdx`, every autumn from 2027.

## Keyword map

Volumes are rough public estimates. Positions are from live SERPs read on 2026-11-06. The tool and open source rows were added on 2026-11-17 without a SERP read. "Frozen" refers to the rules in the Blog section.

| Intent | English target | French target | Page | Notes |
|---|---|---|---|---|
| Category | plant care app | application entretien plantes | `/en`, `/fr` | Homepage title and hero kicker carry it. SERPs are App Store pages, Reddit and listicles. |
| Feature | plant watering reminder app | rappel arrosage plantes, application arrosage plantes | to build | French SERP is thin (Play, hortenia.com, planti.app). Best near-term product win. |
| Comparison | planta alternative, greg vs planta | alternative à Planta | to build | Listicles rank. A fair comparison page with a table can rank. |
| Tool | plant watering calculator, how often to water calculator | calculateur arrosage plantes | to build | The answer depends on the visitor's room, so an AI Overview cannot give it. |
| Open source | open source plant care app | application plantes open source | to build | Low volume. The larger apps cannot compete for it. |
| Brand | with lily, lily plant care app | | `/en` | Another app, "Care-Lily", outranks us for "lily plant care app". Start every storefront name with "Lily" in App Store Connect. |
| Plant care | {plant} care | entretien {plante} | `/blog/{plant}-care-guide` | One hub per plant. Frozen. |
| Watering | how often to water {plant} | arrosage {plante} | `/blog/how-often-to-water-{plant}` | Only for plants with enough demand and content. Folded into the care guide otherwise. Frozen. |
| Problems | {plant} yellow leaves, drooping, root rot | {plante} feuilles jaunes | `/blog/{plant}-problems` | One H2 per symptom, phrased as the search. Frozen. Photos to add. |
| General | overwatering vs underwatering, best soil for houseplants, houseplant care in winter | arrosage plante intérieur hiver, feuilles jaunes plante d'intérieur | `/blog/{topic}` | 32 general hubs. Frozen. Photos to add on the pest and symptom hubs. |

## Content architecture

The posts are merged into hubs, one per search intent. `packages/web/scripts/blog-check.ts` enforces the mechanical rules below, and the plan lives in each post's frontmatter:

- `redirectFrom` lists the old slugs a hub replaced. The build turns them into `dist/redirects.map`, and nginx answers each old URL with a 301 to its hub. Never delete a `redirectFrom` entry. Old URLs keep receiving links for years.
- `date` is the day the content first went live (from git history). `updated` is the day of the last substantive revision. Both feed the Article schema, `article:modified_time` and the sitemap.
- The filename is the slug. The frontmatter `slug` must match it.

### Editorial rules

`bun run --filter=@lily/web build` runs the gate in strict mode. A post fails the build on the rules the gate can check, which the [web package blog rules](../../packages/web/CLAUDE.md#blog) list. Check the rest by hand, such as the keyword placement, the sources and the internal link count.

- Title at most 53 characters (the page adds ` | Lily`), keyword first. Description 120 to 160 characters.
- Category is one of `care-guides`, `watering`, `plant-problems`, `pests`, `houseplant-basics`.
- The keyword appears in the title, the first sentence and one H2. The first two or three sentences answer the query with numbers.
- Every factual claim that matters is checked against an extension service, RHS, Missouri Botanical Garden, ASPCA or a paper, and 1 to 3 of those are linked.
- No invented experience, statistics or anecdotes. The author is named, so the text has to be true.
- No em dashes and no stock AI phrasing. The banned list is in `packages/web/scripts/blog-check.ts`.
- 3 to 6 internal links to other hubs, same locale.
- French is written for French readers, with U+00A0 before `? ! : ;`.

### Adding a post

First check that the post supports a decision page, a tool or a season, as the Blog section requires. Then check that no hub already covers the intent. If one does, do not add the post. Improve that hub after the review on 2027-02-06 and set `updated`. If no hub covers the intent, create the post in both locales and run `bun packages/web/scripts/blog-check.ts --strict`.

## Technical setup

- Prerendered static HTML, served by nginx (`packages/web/nginx.conf`) behind Cloudflare.
- Trailing-slash URLs return a 301 to the bare path. Blog pagination beyond the last page returns a 301 to the blog index.
- Each indexable page has a self-canonical, en/fr/x-default hreflang, Open Graph tags and JSON-LD. `packages/web/scripts/seo-check.ts` lints every prerendered page in the build. The [web package rules](../../packages/web/CLAUDE.md#rules) list what fails it.
- The author is a `Person` entity with `@id` `https://withlily.app/#antoine-de-veyrac`, described on `/en/team` and referenced by every Article and by the Organization as `founder`.
- `PLAY_STORE_LIVE` in `packages/web/src/lib/site.ts` hides every Play Store link until the Android listing is public. Flip it on release day and add "Android" back to `operatingSystem` in `packages/web/src/routes/$locale/route.tsx`.

## Store and Google checklist

| Task | Status |
|---|---|
| Add a Domain property `sc-domain:withlily.app` with a DNS TXT record in Cloudflare. It covers www, http and subdomains. | To do |
| After the hub deploy, resubmit `https://withlily.app/sitemap.xml` in GSC. | To do, right after deploy |
| Watch Pages > "Crawled, currently not indexed" weekly. Expect old URLs to move to "Page with redirect". | Weekly |
| Request indexing for `/en`, `/fr`, `/en/team` and the 10 largest hubs with URL inspection. | After deploy |
| Link GA4 (G-YX8RMN49KD) to Search Console. | To do |
| Bing Webmaster Tools: import the site from GSC. Turn on Cloudflare Crawler Hints for IndexNow. | To do |
| App Store Connect: record the listing baseline, then apply the name, subtitle and keywords from the App Store listing section, French storefront first. | To do |
| App Store Connect: copy the provider ID from App Analytics, under the campaign link generator. | Done 2026-11-17. It is `APP_STORE_PROVIDER_ID` in `packages/web/src/lib/site.ts`. |

## Roadmap

In order. Each line is one shippable page or change.

1. App Store listing pass, French storefront first.
2. Free indoor watering calculator, in English and French.
3. French feature page for "rappel arrosage plantes", with an English twin for "plant watering reminder app".
4. Comparison page "Lily vs Planta" in both locales, then "Planta alternative" and "Greg vs Planta vs Lily".
5. Page for "open source plant care app".
6. Feature pages for shared plants (Canopy) and for Ask Lily.
7. Real photos in the 39 symptom hubs, with an image pipeline in `packages/web/vite/posts.ts` and an alt-text rule in the blog gate.

Deferred until indexing settles: French slugs for French posts, with 301s from the English slugs through `redirectFrom`. The change adds up to 125 redirects, all in French.

Dropped:

- FAQ and HowTo schema on posts. The `FAQPage` JSON-LD on the home page and the support page stays, because removing it gains nothing. Google removed HowTo rich results and limited FAQ rich results to government and health sites in 2023, as [Google's note on the HowTo and FAQ changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes) records.
- Scheduled generation of new posts. More informational posts do not serve the goal.

## Measurement

Review monthly and write one line in the log below.

- **Installs per kind of page.** App Store Connect, App Analytics, by campaign. Each clickable App Store link carries the campaign `web-<kind>-<locale>`, where the kind is `home`, `page`, `blog` or `post`. The join page carries `web-join`. A campaign appears only after five first-time downloads, as [Apple's help on campaigns](https://developer.apple.com/help/app-store-connect/view-app-analytics/manage-campaigns) says, so the campaigns name a kind of page and not a single page. Split a kind into pages when its campaign passes that threshold every month.
- **App Store listing.** Impressions, product page views and conversion rate, per storefront.
- **Assistant panel.** Ask ChatGPT, Gemini, Perplexity and Claude the questions below, each in a new conversation. Record whether the answer names Lily.
  - What is the best plant care app?
  - Which app reminds me to water my plants?
  - What is a good alternative to Planta?
  - Is there an open source plant care app?
  - Quelle est la meilleure application pour l'entretien des plantes ?
  - Quelle application me rappelle d'arroser mes plantes ?
- **Search Console.** Clicks, impressions, indexed pages, and the top 20 queries per locale. A hub that has had no impressions at the three-month review is merged or rewritten.

## Log

| Date | Change | Expected effect |
|---|---|---|
| 2026-11-06 | Baseline recorded (see above). | |
| 2026-11-06 | 289 posts per locale merged into 125 hubs and rewritten. Old slugs return a 301. Author named, `/team` page added, dates corrected. | Fewer, stronger pages. "Crawled, currently not indexed" should fall over 4 to 8 weeks. |
| 2026-11-06 | Homepage title "Lily: Plant Care App with Smart Watering Reminders". Play links hidden. Trailing-slash 301s. | Category-keyword impressions on `/en` and `/fr`. |
| 2026-11-17 | Campaign tokens on every clickable App Store link, per kind of page and locale. The build fails on an untagged link. Android paused. | Installs per kind of page in App Analytics, once a campaign has five first-time downloads. |
| 2026-11-17 | Plan revised. The App Store listing, decision pages and tools now come before the articles. The 125 hubs are frozen until 2027-02-06. | No traffic change from the revision itself. |
