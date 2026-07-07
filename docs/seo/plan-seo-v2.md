# Plan SEO Lily v2 — après review adversariale

> Version corrigée du plan v1 (`plan-seo.md`), après 4 reviews adversariales
> indépendantes : réalité SEO 2026 (sourcée web), business/concurrence,
> faisabilité technique (code du repo vérifié), audit complet du stock de
> contenu (456 MDX analysés). Ce document remplace le v1 comme référence.
>
> Format : §1 = ce qui a été invalidé et pourquoi. §2 = les nouveaux principes.
> §3 = le plan en micro-tâches (ID `M-XX`, effort, dépendances, critère de fin).

---

## 1. Ce que la review adversariale a invalidé

### 1.1 Verdicts sur les hypothèses du v1

| Hypothèse v1 | Verdict | Preuve |
|---|---|---|
| "228 articles = bonne base" | **FAUX** | 218/228 sont du thin content IA généré en rafale (oct. 2023, 45 articles le même jour), 735 mots en moyenne, **0 article >1000 mots, 0 image dans tout le corpus, 2 CTA app sur 228, 6 FAQ sur 228**, erreurs factuelles (article entier sur la "rotation des racines", concept halluciné), conseils contradictoires entre doublons. C'est un passif, pas un actif. |
| Cannibalisation = "quelques doublons" | **SOUS-ESTIMÉ ×10** | **33 groupes de cannibalisation touchant ~79 articles (35 % du corpus)**, dont un groupe de 5 articles "soil types". Liste complète en annexe A. |
| Trafic informationnel = gisement principal | **MORT EN 2026** | AI Overviews : CTR organique −58 à −61 % sur l'informationnel ; AI Mode ≈ 93 % zero-click. "Pourquoi mes feuilles jaunissent" est répondu directement dans la SERP. Le clic info est un bonus, plus un modèle. |
| Cadence 5–7 articles/sem/locale | **DANGEREUX** | Profil exact du "scaled content abuse" (mars 2024 : 1 446 sites désindexés, 100 % publiaient de l'IA à grande échelle). Sur un site déjà rempli d'AI-slop 2023, c'est le remède qui tue le patient. Google a par ailleurs nié que la fréquence soit un signal de ranking. |
| Indexation manuelle GSC quotidienne (10/j, "24-72h") | **PLACEBO** | La soumission ne garantit ni délai ni indexation ; c'est la qualité perçue qui décide. À garder ponctuellement pour les pages business, pas comme routine P0. |
| CTR/dwell time compensent l'absence de backlinks | **INACTIONNABLE** | Navboost existe (procès DOJ) mais c'est du re-ranking agrégé sur volume massif : sans impressions, rien à optimiser. |
| Posts sociaux indexés = signal SEO | **FAUX** | Position constante de Google : les signaux sociaux ne sont pas des facteurs de ranking. Effet indirect uniquement (découverte → brand search). |
| EN et FR traités symétriquement | **MAUVAISE ALLOCATION** | SERPs EN verrouillées (The Sill, Bloomscape, easyplant — années d'autorité). SERPs FR tenues par des blogs perso et gagnables en 3–6 mois. |
| Pages espèces "10 000 espèces de données réelles" | **FAUX** | Le repo contient **33 espèces** de données de soin structurées (`packages/db/scripts/seed-plant-catalog.ts`). Les 10 000 = couverture du modèle d'identification, pas de la donnée. Et le build web statique n'a pas accès à la DB : il faut un export JSON versionné. |
| 750 pages symptôme×espèce programmatiques | **RISQUE "Discovered – not indexed"** | Domaine sans autorité + pages templétées → non-crawl. Remplacé par 15 guides symptômes transverses profonds. |
| "301 via règles CDN" | **FAUX** | Pas de CDN : nginx sur Railway (`packages/web/Dockerfile:25-32`), aucun mécanisme de redirection aujourd'hui. Bonne nouvelle : nginx est sous contrôle → vraies 301 générables depuis un fichier. |
| ASO en P1 (25e du backlog) | **INVERSION** | ~65 % des installs iOS viennent de la recherche in-store ; la SERP Google "plant identifier" affiche… des fiches stores. C'est le canal n°1 de la catégorie, il passe premier. |
| Pinterest/Shorts/TikTok/étude data en levier SEO | **COUPÉ/REPORTÉ** | Coût énorme, causalité install non démontrée, Pinterest en déclin, l'étude data suppose une base utilisateurs inexistante. Remplacé par Reddit authentique (r/plantclinic = file de demandes de diagnostic = le cas d'usage exact du produit ; Reddit domine les SERPs "best X" depuis la core update mai 2026). |
| (absent du v1) GEO/AEO | **ABSENCE COUPABLE** | 12–18 % des requêtes info passent par ChatGPT/Perplexity ; contenu frais <30j = 3,2× plus cité ; mentions de marque corrélées 0,664 avec visibilité AI Overviews. C'est le seul canal info en croissance. (llms.txt en revanche : ignoré par Google, pas prioritaire.) |
| (absent du v1) Outil web freemium | **LE MEILLEUR ATOUT ÉTAIT ENTERRÉ** | Un identificateur/diagnostic photo web (3 scans gratuits → install) cible les seules requêtes volumineuses **immunisées contre les AI Overviews** (il faut une photo), aimante les liens, et pré-qualifie l'install. L'API et le modèle existent déjà dans le monorepo. |

### 1.2 Bugs réels découverts dans le code (à corriger avant tout)

| Bug | Localisation | Gravité |
|---|---|---|
| Hreflang du sitemap : condition toujours vraie (`allSlugs` mélange les 2 locales) → dès qu'un doublon est supprimé dans une seule locale, le sitemap pointera vers des 404 | `packages/web/src/app/sitemap.ts:38-59` | **Bloquant pour la fusion des doublons** |
| Page 404 de Next jamais servie (nginx sans `error_page 404 /404.html`) | `packages/web/Dockerfile:29` | Haute |
| 327/456 MDX ont un `slug` frontmatter ≠ nom de fichier (dont un doublon qui porte le slug de l'autre doublon) | `content/posts/**` | Haute (piège pour tout script) |
| `dateModified` = `datePublished` en dur, aucun champ `updated` dans le schéma → impossible de signaler un refresh | `blog/[slug]/page.tsx:111`, `src/lib/posts.ts:7-16` | Haute (prérequis de la stratégie refresh) |
| 3 taxonomies concurrentes : 52 valeurs de catégories (dont graphies FR cassées) + le générateur de blog dans `packages/api` publie avec une 3e liste → re-pollution dès sa relance | `packages/api/src/services/blog-generator/types.ts:36-47` | Haute |
| Auteur fictif unique ("Emma Laurent") en schema `Person` sur 456 articles, sans page auteur | `packages/web/src/lib/authors.ts` | Moyenne (E-E-A-T) |
| 7 liens internes cassés + 3 liens FR pointant vers `/en/` | corpus MDX | Moyenne |
| Métadonnées FR hors normes : 141 titres >60c (62 %), 189 descriptions hors 120–160 (83 %) — traduction machine sans re-calibrage | corpus MDX FR | Moyenne |
| `robots.ts` bloque `anthropic-ai`/`CCBot` alors que la stratégie GEO veut être citée par les IA | `packages/web/src/app/robots.ts` | À trancher (v2 : débloquer) |
| 3 URLs publiées avec typos (`orichids-`, `orcid-`, `pest-managment`) | corpus | Basse |

### 1.3 Ce qui survit du v1

Le diagnostic structurel (cannibalisation, taxonomie, absence de pages business,
maillage incohérent) ; les 6 pages business (le bas de funnel transactionnel est
~immunisé contre les AI Overviews : ~3 % de déclenchement vs 43 % sur l'info) ;
la validation SERP avant rédaction (étendue : vérifier aussi si un AIO occupe la
requête) ; l'exploitation des données produit/knowledge-db comme différenciateur
(via le pipeline de génération, pas au build web) ; les outils gratuits comme
aimants à liens ; le refresh du stock ciblé par la GSC ; l'hygiène FAQ/OG/CWV.

---

## 2. Les 5 principes du plan v2

1. **Consolider avant de produire.** Aucun article neuf tant que le stock 2023
   n'est pas fusionné/élagué. Le stock est le risque n°1 (signal qualité global).
2. **Conversion d'abord.** ~60 % de l'effort sur ce qui convertit et résiste aux
   IA : ASO, pages features, outil photo web, page download, instrumentation
   web→install. Le KPI est l'install, pas le clic.
3. **FR-first pour l'éditorial.** Les SERPs FR sont gagnables, les EN non.
   L'EN se limite au bas de funnel (features, comparatifs, download).
4. **Qualité gated, jamais de volume.** 2–3 contenus/semaine max toutes locales
   confondues, révision humaine, donnée unique visible (tableaux chiffrés issus
   du catalogue), byline réelle. Tout pilote programmatique passe un gate
   quantitatif avant extension.
5. **Être cité, pas seulement cliqué.** Chaque contenu est conçu pour la
   citabilité IA (réponse directe sous le H1, données tabulées, date de mise à
   jour visible) et le suivi mesure les citations ChatGPT/Perplexity/AIO.

---

## 3. Le plan en micro-tâches

Conventions : effort en heures (h) ou jours (j) ; une micro-tâche = livrable
vérifiable, idéalement ≤ 1 jour ; `dép.` = dépendances ; ✅ = critère de fin.

### Phase 0 — Dérisquage technique (semaine 1, ~3 j au total)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M01 | Corriger le bug hreflang du sitemap : comparer le slug aux slugs **de la locale alternative** uniquement | 1h | — | Un post absent d'une locale ne génère plus d'alternate vers cette locale (test unitaire ajouté) |
| M02 | Servir la vraie 404 : `error_page 404 /404.html;` dans la conf nginx du Dockerfile + `not-found.tsx` custom avec liens vers piliers | 2h | — | `curl -I` d'une URL inexistante renvoie la page Next, pas la 404 nginx |
| M03 | Corriger `packages/web/CLAUDE.md` : domaine `lilyapp.io` → `withlily.app` | 10min | — | Plus aucune occurrence de lilyapp.io |
| M04 | Mécanisme de redirections 301 : extraire la conf nginx du `printf` vers un fichier template + script qui génère les `location = ... { return 301 ...; }` depuis un `redirects.json` versionné | 1j | — | Ajouter une entrée au JSON produit une 301 réelle en build Docker (testé) |
| M05 | Purge des 327 slugs frontmatter incohérents (script : slug = nom de fichier partout) | 2h | — | 0 divergence slug/nom de fichier ; lint/CI qui l'empêche de revenir |
| M06 | Champ `updated` dans le schéma frontmatter + `dateModified` réel dans le JSON-LD + `lastModified` sitemap | 2h | — | Un article avec `updated` l'expose dans le schema et le sitemap |
| M07 | Réparer les 7 liens internes cassés + les 3 liens FR→`/en/` | 1h | — | 0 lien interne cassé |
| M08 | Trancher la politique robots vs IA : débloquer `anthropic-ai`/`CCBot` dans `robots.ts` (cohérent avec l'objectif GEO) | 30min | — | robots.txt cohérent avec la stratégie |
| M09 | Validateur de liens internes au build (script Bun : parse les MDX, vérifie que chaque lien `/xx/blog/...` cible un slug existant) | 4h | — | Le build échoue sur lien cassé |
| M10 | Instrumentation web→install : smart banner, liens stores avec UTM/campaign tokens, événement de clic sortant, GSC vérifiée sur les 2 locales | 1j | — | On peut répondre à "combien d'installs viennent du site ce mois-ci ?" |

### Phase 1 — ASO, le canal n°1 (semaines 1–2, en parallèle de la Phase 0)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M11 | Audit ASO : mots-clés actuels des fiches App Store/Play EN+FR, positions vs Planta/PictureThis/PlantIn, opportunités FR | 1j | — | Doc d'audit avec 10 mots-clés cibles par store et par langue |
| M12 | Réécriture metadata stores : titre, sous-titre, champ keywords, description — FR d'abord (marché moins disputé) | 1j | M11 | Fiches soumises en review |
| M13 | Refresh screenshots/preview vidéo alignés sur les mots-clés (le diagnostic photo en 1er écran) | 2j | M11 | Nouveaux assets en ligne |
| M14 | Boucle d'avis : prompt in-app de notation post-action réussie + routine de réponse aux avis | 4h | — | Prompt actif + 100 % des avis <30j répondus |

### Phase 2 — Consolidation du stock (semaines 2–4)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M15 | Valider la liste des 33 groupes de cannibalisation (annexe A) : pour chaque groupe, choisir l'URL canonique (critère : impressions GSC puis qualité) | 2h | — | Tableau groupe → URL gagnante → URLs à rediriger |
| M16 | Fusion des groupes 1–13 (doublons quasi-parfaits, ~28 articles) : merger le meilleur contenu dans le canonique, résoudre les contradictions factuelles, entrées `redirects.json`, ×2 locales | 3j | M04, M15 | −15 URLs environ, 301 en place, sitemap propre (grâce à M01) |
| M17 | Fusion des groupes 14–33 (même mot-clé, ~51 articles) — par lots de 5 groupes | 4j | M16 | ~45–50 URLs supprimées au total, 0 groupe de cannibalisation restant |
| M18 | Triage des ~170 articles 2023 restants : croiser avec la GSC (impressions 12 mois) → 3 listes : garder+refresh / réécrire / noindex-supprimer (~100–120 attendus dans les 2 dernières) | 1j | M15 | Les 3 listes committées dans `docs/seo/triage.csv` |
| M19 | Exécution du triage : suppression + 301 vers la page thématique la plus proche pour le lot condamné | 1j | M18, M04 | Corpus réduit à ~80–110 articles conservés |
| M20 | Migration taxonomie : mapping des 52 valeurs → 7 silos (slugs kebab ASCII), script de migration frontmatter ×2 locales, normalisation des tags (casse) | 1j | — | 7 catégories exactement, 0 graphie cassée |
| M21 | Verrouiller : `category` en `Schema.Literal(...)` dans `posts.ts` + aligner la liste `BLOG_CATEGORIES` et les prompts du générateur dans `packages/api/src/services/blog-generator/` | 4h | M20 | Le build casse sur catégorie inconnue ; le générateur ne peut plus produire hors-silo |
| M22 | Corriger les 3 slugs avec typos (redirects) + re-calibrer les métadonnées FR hors normes (141 titres, 189 descriptions) — lot assisté LLM avec relecture humaine | 2j | M04 | 100 % des titres ≤60c et descriptions 120–160c dans les 2 locales |
| M23 | E-E-A-T : remplacer l'auteur fictif par une identité réelle (page `/[locale]/author/...`, bio, photo, lien schema `Person`→page) | 4h | — | Chaque article a une byline cliquable vers une page auteur réelle |

### Phase 3 — Structure, maillage, pages business (semaines 3–6)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M24 | Pages catégorie `/[locale]/blog/category/[silo]` (route + `generateStaticParams` + pagination réutilisée + i18n + sitemap) | 2j | M20 | 7×2 pages catégorie indexables avec metadata complètes |
| M25 | Breadcrumbs visibles + `BreadcrumbList` alignés sur les silos | 4h | M24 | Breadcrumb Home→Blog→Silo→Article partout |
| M26 | Composant `RelatedPosts` (même silo, build-time) en fin d'article | 4h | M20 | 3 articles liés pertinents sous chaque post |
| M27 | Template article v2 : réponse directe en 2–3 phrases sous le H1, composant `<FAQ>` MDX (+ schema FAQPage), bloc CTA app contextuel, date de mise à jour visible, byline | 1j | M06, M23 | Nouveau template documenté dans `packages/web/CLAUDE.md` |
| M28 | Page feature `/features/plant-identifier` (en+fr) : H1 exact, champ lexical, FAQ objections, réassurance, metadata/schema/sitemap/nav | 1j | — | Page en ligne, GSC soumise (ponctuellement) |
| M29 | Page feature `/features/plant-doctor` (en+fr) — même exigences | 1j | — | idem |
| M30 | Page `/download` (en+fr) : badges stores instrumentés, QR desktop | 4h | M10 | idem + tracking actif |
| M31 | Pages features `/features/watering-reminders` et `/features/care-schedule` (en+fr) | 1,5j | — | idem |
| M32 | Passe de maillage in-body sur les ~80–110 articles conservés : ancres exactes, lien vers le pilier + 1 page business, suppression des liens inter-espèces absurdes — par lots de 15 articles, validés par M09 | 2–3 sem. en fond | M09, M19, M28–M31 | 100 % des articles conservés : ≥3 liens cohérents dont 1 business |

### Phase 4 — L'outil photo web (le gros pari, semaines 4–8)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M33 | Spec de l'outil : identification/diagnostic photo web freemium, 3 scans gratuits (fingerprint/localStorage), puis CTA install. Choix d'archi : endpoint public rate-limité côté `packages/api` (le site est statique) | 1j | — | Spec validée (scope, quotas, abus, coûts d'inférence) |
| M34 | Endpoint API public `/public/identify` : upload photo → espèce + diagnostic, rate-limit IP + quota, pas d'auth | 2–3j | M33 | Endpoint testé, coût par scan connu |
| M35 | Page `/[locale]/identify` : upload, résultat, 3 scans gratuits, CTA install contextualisé ("suivi de TA plante dans Lily") | 2–3j | M34 | Funnel scan→install instrumenté |
| M36 | SEO de l'outil : metadata "identify plant by photo free" / "reconnaître une plante photo gratuit", schema, maillage entrant depuis tous les articles espèces/symptômes | 4h | M35 | Page dans le sitemap, liens entrants en place |
| M37 | Mesure : dashboard scans/jour, taux scan→clic store, coût/scan | 4h | M35 | Décision data-driven à 30 jours (étendre/ajuster/tuer) |

### Phase 5 — Contenu nouvelle génération, FR-first (continu dès la semaine 5)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M38 | `keywords-fr.csv` sur les gaps confirmés à 0 article : moucherons de terreau, cochenilles, plantes ombre/chambre/SdB/bureau, pet-safe chiens+toxicité par espèce, arrosage vacances, grow lights — avec validation SERP + présence AIO notée | 1j | — | ≥60 mots-clés FR classés intention/SERP/AIO |
| M39 | Cadence : 2–3 articles/semaine TOUTES locales confondues (FR prioritaire), template v2, révision humaine systématique, donnée catalogue visible | continu | M27, M38 | Chaque article coche 100 % de la checklist (FAQ, CTA, réponse directe, donnée, byline, ≥3 liens) |
| M40 | 15 guides symptômes transverses (1/sem : feuilles jaunes, pointes brunes, moucherons, pourriture racines…) avec matrice par espèce en tableau — remplace les 750 pages programmatiques | 15 sem. en fond | M27 | Guides profonds publiés, cités dans l'outil M35 |
| M41 | Refresh du stock conservé : 2–3 réécritures/semaine en commençant par les positions GSC 4–15 (quick wins), champ `updated` renseigné | continu | M06, M18 | File de refresh priorisée par impressions, brûlée à 2–3/sem |
| M42 | Pilote pages espèces : export JSON versionné du catalogue (33 espèces) dans `packages/web/content/` + route `/[locale]/plants/[species]` avec données chiffrées (arrosage, lux, toxicité) + contenu éditorial | 3j mécanisme + 2 sem. contenu | M27 | 25 pages FR en ligne |
| M43 | **Gate du pilote espèces à 8 semaines** : >70 % indexées + impressions ? → vague 2 (enrichir le catalogue au-delà des 33). Sinon → stop, post-mortem | 2h | M42+8 sem. | Décision documentée |

### Phase 6 — GEO & distribution (continu, léger)

| ID | Micro-tâche | Effort | Dép. | ✅ Fini quand |
|----|-------------|--------|------|---------------|
| M44 | Tracker de citations IA : 30 requêtes cibles (fr+en) testées chaque semaine sur ChatGPT/Perplexity/AIO, résultat en CSV | 4h setup | — | Baseline établie, tendance suivie |
| M45 | Présence Reddit authentique : r/plantclinic (+ équivalents FR), réponses utiles aux diagnostics, 2h/sem plafonnées, jamais de spam | routine | — | Compte crédible actif ; mentions organiques trackées |
| M46 | Comparatif honnête "best plant care apps 2026" (en+fr) — la seule SERP EN prouvée gagnable — avec tableau comparatif réel | 2j | M28–M31 | Publié, position trackée |
| M47 | OG images par article (`opengraph-image.tsx` satori au build, ou script sharp → `public/`) — surveiller le temps de build (+900 images) | 2j | — | Chaque article a une OG unique ; requis aussi pour Discover |
| M48 | Lighthouse CI sur le `ci.yml` existant (budget LCP mobile <2,5s) | 2h | — | CI échoue si régression |
| M49 | Pinterest : test plafonné à 2h/sem pendant 90 jours ; kill si <5 % du trafic | routine | M47 | Décision au jour 90 |

### Ce qui est explicitement ABANDONNÉ (et pourquoi)

- ~~Routine d'indexation manuelle GSC quotidienne~~ (placebo — soumission ponctuelle des pages business uniquement)
- ~~5–7 articles/semaine/locale + "l'automatisation doit tourner en continu"~~ (profil scaled content abuse)
- ~~750 pages symptôme×espèce~~ (→ 15 guides transverses M40)
- ~~Vagues 2–3 programmatiques par défaut~~ (→ gate M43)
- ~~Routine Shorts/TikTok/X/LinkedIn comme levier SEO~~ (pas de causalité install ; reconsidérer plus tard comme canal de marque, pas de SEO)
- ~~Étude data "plantes les plus tuées"~~ (reportée : suppose une base utilisateurs et des relations presse inexistantes)
- ~~Calculateur d'arrosage~~ (remplacé par l'outil photo M33–M37, qui matche la vraie feature)
- ~~llms.txt~~ (ignoré par Google ; le fichier existant peut rester, zéro effort dessus)
- ~~KPIs "pages publiées/semaine" et "soumissions GSC"~~ (mesurent l'activité, pas le résultat)

## 4. KPIs v2

Hebdo : **installs attribuées au web** (M10), scans de l'outil photo et taux
scan→store (M37), **citations IA** sur les 30 requêtes (M44), recherches de
marque, positions top 10 **FR**, pages indexées vs publiées, impressions par
silo. Mensuel : positions ASO sur les 10 mots-clés stores, coût/install par
canal. Règles : contenu sans impression à 6 semaines → autopsie (indexation,
intention, AIO) ; positions 4–15 → file de refresh M41 ; tout pilote a un gate
chiffré et une date de décision.

## 5. Séquencement résumé

```
Sem. 1      : M01–M10 (dérisquage) ‖ M11–M14 (ASO)
Sem. 2–4    : M15–M23 (consolidation du stock)
Sem. 3–6    : M24–M31 (structure + pages business) ‖ M32 démarre en fond
Sem. 4–8    : M33–M37 (outil photo)
Sem. 5 →    : M38–M41 (contenu FR-first + refresh, continu)
Sem. 7 →    : M42 pilote espèces → gate M43 à +8 sem.
En continu  : M44–M49 (GEO, Reddit, OG, CI, test Pinterest)
```

Première publication d'article neuf : **semaine 5 au plus tôt** — pas avant que
le stock soit consolidé. C'est le renversement central du v2 : en 2026, pour une
app mobile dans une niche où l'informationnel est siphonné par les réponses IA,
ce sont l'ASO, l'outil photo et le bas de funnel qui portent le business ; le
blog FR consolidé porte la découverte ; et la cadence industrielle du v1 était
le plus court chemin vers la désindexation.

---

## Annexe A — Les 33 groupes de cannibalisation (audit du 2026-07-06)

Doublons quasi-parfaits (fusion + 301 obligatoires) :
1. `aloe-vera-summer-care-tips` + `aloe-vera-tips-for-summer-care` (conseils contradictoires)
2. `aloe-vera-caring-for-winter` + `aloe-vera-winter-care`
3. `zz-plant-pest-management-guide` + `zz-plant-pests-management-guide`
4. `african-violet-pest-managment-strategies` (typo) + `african-violet-pest-prevention-strategies`
5. `staghorn-fern-care-over-summer` + `staghorn-fern-summer-care`
6. `staghorn-fern-winter-care-strategies` + `staghorn-fern-winter-care-techniques`
7. `parlor-palm-winter-care-guide` + `parlor-palm-winter-care-strategies`
8. `boston-fern-humidity-guide` + `boston-fern-humidity-needs`
9. `best-indoor-plants-for-air-purification` + `best-plants-for-air-purification`
10. `philodendron-overwatering-signs` + `philodendron-overwatering-signs-and-solutions`
11. `anthurium-light-requirements` + `anthurium-light-needs-explained` + `anthurium-light-humidity-requirements`
12. `philodendron-leaf-yellowing-solutions` + `-issues` + `-factors`
13. Soil ×5 : `best-soil-types-for-indoor-plants` + `how-to-choose-the-best-soil-for-houseplants` + `understanding-different-soil-types-for-potted-plants` + `understanding-soil-types-for-houseplants` + `understanding-soil-types-for-plants`

Même mot-clé, angle à peine différent (fusion recommandée) :
14. `alocasia-disease-management-guide` + `alocasia-root-rot-signs-and-solutions` + `alocasia-root-rotation-techniques` (ce dernier = hallucination, à supprimer)
15. Anthurium care ×4 : `advanced-anthurium-care-techniques` + `anthurium-care-tips-for-beginners` + `anthurium-plant-maintenance-tips` + `anthurium-thriving-indoor-plants`
16. `echeveria-water-care-guide` + `echeveria-water-care-techniques` + `echeveria-overwatering-signs-and-solutions`
17. `parlor-palm-water-issues-solutions` + `parlor-palm-watering-techniques`
18. `chinese-evergreen-pest-issues-solutions` + `common-chinese-evergreen-pests-and-solutions` + `chinese-evergreen-leaf-issues-solutions`
19. `chinese-evergreen-flower-care-tips` + `chinese-evergreen-indoor-plant-care-tips`
20. `cast-iron-plant-water-issues` + `cast-iron-plant-watering-tips`
21. `cast-iron-plant-growing-tips` + `cast-iron-plant-thrive-indoor`
22. `philodendron-pest-identification-solutions` + `philodendron-pest-management-guide`
23. `best-pothos-humidity-levels` + `how-to-increase-humidity-for-pothos`
24. `snake-plant-advanced-care-techniques` + `snake-plant-care-issues-and-solutions`
25. `snake-plant-root-issues-unraveled` + `snake-plant-root-rot-solutions`
26. `peace-lily-common-issues-solutions` + `peace-lily-leaf-drooping-causes`
27. `areca-palm-routine-care-guide` + `areca-palm-water-care-guide`
28. `calathea-care-for-beginners` + `calathea-foliage-care-tips`
29. `common-mistakes-in-raising-indoor-plants` + `common-mistakes-with-plant-care`
30. `how-to-create-a-humid-environment-for-plants` + `humidity-for-tropical-plants`
31. `signs-of-overwatering-houseplants` + `understanding-soil-moisture-for-best-plant-health` + `understanding-plant-water-needs-for-healthy-growth`
32. `string-of-hearts-troubleshooting-guide` + `string-of-hearts-disease-identification` + `string-of-hearts-leaf-drop-issues`
33. `orichids-common-pests-solutions` (typo) + `understanding-orchid-diseases-and-solutions`

## Annexe B — Gaps de couverture confirmés (0 article aujourd'hui)

Moucherons de terreau/fungus gnats · cochenilles/mealybugs · scale · plantes
d'ombre/low light · plantes chambre/salle de bain/bureau · pet-safe chiens +
toxicité par espèce · arrosage pendant les vacances · grow lights ·
LECA/semi-hydro · guides de base snake plant/ZZ/fiddle leaf fig/calathea ·
format question (PAA) · comparatifs d'apps · checklist saisonnière hiver ·
syngonium, tradescantia, begonia, ficus benjamina, hoya, monstera adansonii.
