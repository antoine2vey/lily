# Plan SEO Lily — withlily.app

> Objectif : générer un maximum de trafic organique qualifié vers le site web
> (et in fine des installations de l'app), **sans dépendre des backlinks au
> départ**. Méthode : produit → angles → mots-clés → silos → contenu →
> pages business → marketing 360 → régularité.
>
> Ce document est conçu pour être traité par étapes : chaque action a un ID
> (`SEO-XXX`), une priorité (P0 = fondation, P1 = croissance, P2 = amplification)
> et peut être convertie en issue GitHub.

---

## 1. État des lieux (juillet 2026)

**Le site** : Next.js 16 static export, i18n `en`/`fr`, domaine `withlily.app`.
Pages statiques : home, `/about`, `/blog`, `/privacy`, `/terms`, `/support`.
Blog MDX : **228 articles par locale** (bonne base !), sitemap + hreflang +
JSON-LD déjà en place (bonne hygiène technique).

**Le produit** : app mobile de soin des plantes d'intérieur — planning
d'arrosage/fertilisation/brumisation personnalisé par espèce et météo locale,
identification par photo (10 000+ espèces), diagnostic IA (feuilles jaunes,
pourriture des racines…), rappels intelligents, journal de soins.

**Constats bloquants (le "problème en amont des backlinks")** :

| # | Constat | Impact |
|---|---------|--------|
| C1 | Publication arrêtée depuis début mars 2026 (~4 mois) | Google recalibre la fréquence de crawl à la baisse, perte de momentum |
| C2 | 29 catégories incohérentes (`plant-care`, `houseplant-care`, `indoor-plant-care`, `care-guides`… pour la même chose) | Aucune structure sémantique lisible par Google, pas de silos |
| C3 | Articles quasi-doublons (ex. `aloe-vera-summer-care-tips` vs `aloe-vera-tips-for-summer-care`, `african-violet-pest-managment-strategies` [typo] vs `african-violet-pest-prevention-strategies`) | Cannibalisation : les pages se concurrencent entre elles |
| C4 | Aucune page pilier / hub — 228 articles à plat sous `/blog` | Pas de topical authority structurée, jus SEO dispersé |
| C5 | Aucune page business dédiée aux features (identification, rappels, diagnostic IA) | Les requêtes transactionnelles ("plant identifier app", "application rappel arrosage") n'ont aucune page d'atterrissage |
| C6 | Le blog couvre ~40 espèces alors que l'app en connaît 10 000 | Gisement programmatique inexploité |
| C7 | Maillage interne faible : pas de liens systématiques satellites → pilier → home/download | Le jus n'irrigue pas les pages qui convertissent |

**Conclusion** : la base existe (volume + technique), mais la stratégie
sémantique est inexistante. C'est exactement le cas décrit dans le framework :
inutile de penser backlinks avant d'avoir corrigé C1–C7.

---

## 2. Étape 0 — Cartographie des angles produit

Tous les angles par lesquels quelqu'un peut atterrir sur Lily. Chaque angle =
des dizaines de pages/articles distincts, dans **les deux locales**.

### A. Angles produit directs (transactionnel — priorité maximale)

Ce que Lily *est* littéralement :

- EN : plant care app, plant watering reminder app, plant identification app,
  plant identifier by photo, houseplant care app, app that tells you when to
  water plants, plant health diagnosis app, plant care schedule app, free plant
  care app, plant tracker app
- FR : application entretien plantes, application arrosage plantes, rappel
  arrosage plantes, application identifier plante photo, reconnaître une plante
  avec une photo, application soin plantes d'intérieur, application plante
  gratuite, application maladie des plantes

→ Chaque variante = une page feature dédiée ou une section de landing (voir §6).

### B. Angles par problème / symptôme (fort volume + intention maximale)

L'équivalent des "angles émotionnels" : la personne a un problème *maintenant*,
et le diagnostic IA de Lily est la réponse. Format : `[symptôme] + [espèce]`.

- EN : why are my monstera leaves turning yellow, brown tips on spider plant,
  fiddle leaf fig dropping leaves, root rot signs, overwatered vs underwatered,
  white spots on leaves, why is my plant dying, snake plant leaves curling
- FR : feuilles jaunes monstera, pourquoi mon ficus perd ses feuilles, bouts
  des feuilles marron, pourriture des racines, plante trop arrosée symptômes,
  taches blanches feuilles, moucherons terreau

→ Matrice programmatique : ~15 symptômes × top 50 espèces = ~750 sujets par
locale. CTA naturel : "Diagnostique ta plante en photo avec Lily".

### C. Angles par espèce (le gisement programmatique)

Une page/guide par espèce populaire : `how to care for [species]`,
`[espèce] entretien`, arrosage, lumière, rempotage, toxicité, propagation.

- Vague 1 : top 50 espèces d'intérieur (monstera, pothos, snake plant, ficus
  lyrata, calathea, philodendron, orchidée, succulentes, zz plant…)
- Vague 2 : top 200 ; Vague 3 : longue traîne des cultivars (Monstera Thai
  Constellation, Philodendron Pink Princess…) — faible volume, zéro
  concurrence, conversion élevée (collectionneurs = power users de l'app)

### D. Angles par tâche de soin

- EN : how often to water [species], best fertilizer for houseplants, when to
  repot, how to propagate pothos in water, pruning, misting, grow lights
- FR : à quelle fréquence arroser un cactus, quand rempoter, comment bouturer
  un pothos, engrais plantes vertes, luminosité plantes d'intérieur

### E. Angles par situation / persona

- EN : best plants for beginners, low light plants for apartments, pet safe
  houseplants (cats/dogs), plants for bedroom / bathroom / office, who waters
  my plants when I'm on vacation, plants that are hard to kill
- FR : plantes faciles pour débutant, plantes d'ombre appartement, plantes non
  toxiques pour chat, plante chambre / salle de bain / bureau, arroser ses
  plantes pendant les vacances, plantes increvables

→ "Vacances" et "pet safe" sont des angles en or : douleur concrète, l'app est
littéralement la solution (rappels + partage de planning).

### F. Angles saisonniers (calendrier éditorial récurrent)

- Hiver : entretien hiver, chauffage et plantes, moins arroser en hiver
- Printemps : rempotage, reprise de fertilisation, boutures
- Été : canicule, vacances, arrosage fréquent, brûlures de soleil
- Automne : rentrer les plantes, baisse de lumière
- Marronniers cadeaux : "plant gifts for plant lovers", "cadeau amateur de
  plantes" (Noël, fête des mères) — publier 6–8 semaines avant.

### G. Angles comparatifs et de décision (bas de funnel)

- EN : best plant care app 2026, best plant identification app, Planta vs
  PictureThis, [Competitor] alternatives, is [Competitor] worth it, free vs
  paid plant apps, Lily app review
- FR : meilleure application plantes 2026, meilleure appli reconnaissance
  plante, [Concurrent] avis, alternative gratuite à [Concurrent]

→ Vérifier la SERP avant (voir §3) : ces requêtes sortent souvent des listicles
→ produire nos propres comparatifs honnêtes où Lily figure.

### H. Angles "outils gratuits" (contenu citable, aimant à liens naturels)

- Calculateur de fréquence d'arrosage (espèce + taille de pot + saison)
- Calendrier d'entretien téléchargeable / imprimable
- Base de données espèces consultable (vitrine web des 10 000 espèces)
- Quiz "quelle plante pour mon appartement ?"
- Checklist toxicité animaux

---

## 3. Étape 1 — Recherche de mots-clés (process)

Règle : **tout volume est bon à prendre**. Un mot-clé à 30 rech./mois avec la
bonne intention ("bracelet gravé" → "philodendron pink princess entretien")
vaut plus qu'un générique à 3 000.

Process par angle (A→H), pour `en` puis `fr` (ne pas traduire : re-rechercher,
les requêtes FR ont leurs propres formulations) :

1. **Google Suggest** : mot-clé graine + suffixes a→z en navigation privée
2. **PAA (People Also Ask)** : collecter toutes les questions → plan éditorial
   + sections FAQ des pages
3. **Recherches associées** en bas de SERP → sujets adjacents du silo
4. **Reddit** (r/houseplants, r/plantclinic — 2M+ membres), groupes Facebook,
   forums jardinage FR (Rustica, aujardin.info) → vocabulaire réel
5. **Avis clients** : reviews App Store/Play Store de Lily *et des concurrents*
   → le vocabulaire exact des utilisateurs ("je tue toutes mes plantes",
   "j'oublie d'arroser")
6. Classer chaque mot-clé par **intention** : transactionnelle /
   informationnelle / comparative / locale → détermine le type de page

**Validation SERP obligatoire avant chaque contenu** : taper le mot-clé, noter
ce qui ranke dans le top 10 (guides ? listicles ? vidéos ? pages app store ?)
et produire *ce format-là*. Si la SERP montre des fiches App Store sur
"plant care app", c'est l'ASO qui prime sur une page web pour cette requête.

**Livrable** : `docs/seo/keywords.csv` — colonnes :
`keyword,locale,angle,intent,serp_format,target_page,silo,priority,status`

---

## 4. Étape 2 — Stratégie sémantique (silos et maillage)

### Les 7 silos cibles

Chaque silo = 1 page pilier + articles satellites. Le pilier linke vers les
satellites, chaque satellite linke vers le pilier + 2–3 satellites frères +
**toujours 1 page business** (home ou feature).

| Silo | Page pilier (à créer) | Satellites | Page business irriguée |
|------|----------------------|------------|------------------------|
| S1 Guides par espèce | `/[locale]/plants` (hub) + `/plants/[species]` | articles espèce existants + nouveaux | Feature "identification" |
| S2 Problèmes & diagnostic | `/[locale]/blog/plant-problems` (pilier) | articles symptômes (angle B) | Feature "diagnostic IA" |
| S3 Arrosage | pilier "Watering 101 / Tout sur l'arrosage" | fréquences, sur/sous-arrosage, vacances, eau | Feature "rappels" |
| S4 Débutants & situations | pilier "Beginner's guide to houseplants" | low light, pet safe, chambre, bureau (angle E) | Home |
| S5 Tâches & techniques | pilier "Plant care basics" | rempotage, propagation, engrais, taille | Home |
| S6 Saisonnier | pilier "Seasonal plant care calendar" | 4 guides saison + marronniers | Feature "rappels météo" |
| S7 Comparatifs & choix d'app | pilier "Best plant care apps" | comparatifs, alternatives, avis (angle G) | Page download |

### Règles de maillage interne (à appliquer partout, y compris rétroactivement)

- **Ancres = mot-clé exact de la page cible.** Jamais "cliquez ici" / "en
  savoir plus". Ex. : ancre `feuilles jaunes du monstera` → article dédié.
- Chaque article : 3–6 liens internes (pilier + frères + 1 business).
- Les pages business reçoivent des liens *entrants* depuis les articles à
  fort trafic (c'est le transfert de jus vers ce qui rapporte).
- Composant `RelatedPosts` en fin d'article basé sur le silo (catégorie
  normalisée), pas sur des tags aléatoires.
- Breadcrumb visible + `BreadcrumbList` JSON-LD reflétant le silo :
  Home → Blog → [Silo] → Article.

### Nettoyage de la taxonomie (prérequis)

Réduire les 29 catégories à **7 catégories = les 7 silos** (`species-guides`,
`plant-problems`, `watering`, `beginners`, `care-techniques`, `seasonal`,
`app-guides`). Migrer le frontmatter des 228×2 articles, garder les tags
libres pour la granularité. Créer les pages catégorie (`/blog/category/[cat]`)
qui serviront de pages piliers intermédiaires, et les ajouter au sitemap.

---

## 5. Étape 3 — Le contenu qui se positionne

Checklist par article (à intégrer au template MDX / process de rédaction) :

- [ ] SERP analysée : format aligné sur le top 5 (guide / liste / comparatif)
- [ ] **Champ lexical complet** déployé. Ex. article arrosage : drainage,
      motte, substrat, hygrométrie, eau calcaire, trous de drainage, billes
      d'argile, arrosage par capillarité… (sources : top 3 SERP + PAA +
      la base de connaissances RAG interne `knowledge-db`, avantage unique :
      notre corpus expert est déjà constitué)
- [ ] H1 = mot-clé exact ; H2/H3 = variantes et questions PAA
- [ ] FAQ en fin d'article (3–5 questions PAA) + schema `FAQPage`
- [ ] 3–6 liens internes avec ancres optimisées (cf. §4)
- [ ] 1 CTA contextuel vers l'app ("Lily te rappelle quand arroser ton
      monstera selon la météo de chez toi")
- [ ] Longueur : aussi long que nécessaire pour couvrir mieux que le top 3,
      pas plus
- [ ] Frontmatter conforme (title <60c, description 120–160c, date réelle,
      catégorie = silo) + version dans l'autre locale (règle existante)
- [ ] Image de couverture propre (OG) + alt descriptifs

**Avantage déloyal à exploiter** : `knowledge-db` (base RAG pgvector de
connaissances botaniques) peut alimenter la rédaction avec un champ lexical et
des données que les concurrents n'ont pas. Idem pour les données produit
(10 000 espèces) → pages espèces générées avec de la vraie donnée structurée
(fréquence d'arrosage, lumière, toxicité) et non du texte gonflé.

---

## 6. Étape 3.5 — Pages business (ce qui convertit)

Le blog est le haut du funnel. Les pages suivantes sont les "pages produit"
de Lily — **une page par sujet, jamais une page fourre-tout** :

| Page à créer | Mot-clé cible principal (EN / FR) | Notes |
|---|---|---|
| `/[locale]/features/plant-identifier` | plant identification app / application reconnaissance plante | H1 exact, démo visuelle, FAQ, schema `SoftwareApplication` déjà global |
| `/[locale]/features/watering-reminders` | plant watering reminder app / rappel arrosage plantes | Angle vacances + météo locale = différenciateur |
| `/[locale]/features/plant-doctor` | plant disease identifier / diagnostic maladie plante | Relié au silo S2 (tout le trafic "symptômes" pousse ici) |
| `/[locale]/features/care-schedule` | plant care schedule / calendrier entretien plantes | |
| `/[locale]/download` | download Lily / télécharger Lily | Cible aussi le trafic de marque ; liens App Store/Play Store, badges |
| `/[locale]/plants` + `/plants/[species]` | [species] care / entretien [espèce] | Programmatique (vague 1 : 50 espèces) — données structurées réelles de l'app, pas du remplissage |

Exigences (déjà codifiées dans `packages/web/CLAUDE.md`) : `generateMetadata`
complet, canonical + hreflang, OG, JSON-LD adapté, ajout au `sitemap.ts`,
navigation depuis le Header/Footer, traductions dans les deux locales.

Chaque page feature reçoit : un H1 avec le mot-clé exact, le champ lexical
complet, une FAQ d'objections (prix, offline, précision de l'IA…), des
éléments de réassurance (notes stores, nombre d'espèces, témoignages), et des
liens entrants depuis tous les articles du silo correspondant.

---

## 7. Étape 4 — Marketing 360 comme levier SEO

Les contenus sociaux sont indexés par Google et génèrent trafic de marque,
CTR et mentions — les signaux qui compensent l'absence de backlinks.

- **Pinterest (priorité #1 pour cette niche)** : le "plant care" y est massif
  et chaque épingle = un lien vers un article. Créer 1 épingle par article
  publié (visuels verticaux, infographies de soins par espèce). Trafic
  composé, durée de vie longue.
- **Reddit** : présence utile (pas promo) sur r/houseplants, r/plantclinic,
  r/IndoorGarden — répondre aux diagnostics, citer l'article pertinent quand
  ça aide vraiment. FR : jardinage sur forums + groupes FB.
- **Instagram/TikTok** : before/after de plantes sauvées, "pourquoi tes
  feuilles jaunissent en 30s" → notoriété → recherches de marque "Lily plant
  app" (signal fort).
- **YouTube Shorts** : réutiliser chaque article problème/symptôme en short
  de 45s ; les vidéos sortent dans la SERP Google.
- **X/Twitter + LinkedIn** : partager chaque article publié (signal
  d'existence + découverte).
- **ASO** (App Store / Play Store) : les SERP "plant app" affichent les
  stores ; titres/mots-clés des fiches alignés sur les angles A. Les avis
  5★ nourrissent aussi l'E-E-A-T et les pages comparatives.
- **Plateformes d'avis** : Product Hunt (lancement feature), Trustpilot,
  répondre aux avis stores.
- **Contenu citable (aimants à liens naturels, zéro prospection)** :
  - Étude data anonymisée : "Quelles plantes meurent le plus ? Données de
    X00 000 plantes suivies dans Lily" → repris par la presse/blogs jardin
  - Les outils gratuits de l'angle H (calculateur d'arrosage…)
  - Guides de référence exhaustifs (piliers de silo)

---

## 8. Étape 5 — Régularité et indexation

Le facteur le plus sous-estimé. La publication est arrêtée depuis mars 2026 :
**redémarrer et ne plus jamais s'arrêter** (l'automatisation de rédaction déjà
en place sur ce repo doit tourner en continu).

Cadence (site déjà mature en volume mais momentum cassé → repartir en mode
croissance) :

- **Mois 1–2 (relance)** : 5–7 articles/semaine par locale, en priorité les
  silos S2 (problèmes) et S3 (arrosage) + les 6 pages business
- **Mois 3–6** : 3–4 nouveaux articles/semaine + **1–2 articles existants mis
  à jour/semaine** (rafraîchir dates, enrichir champ lexical, ajouter FAQ et
  maillage — les 228 articles existants sont un stock d'updates à fort ROI)
- **En continu** : 2 nouveaux/semaine + 2 mises à jour/semaine + 1 page
  espèce programmatique/jour (vague 1 puis 2)

**Indexation manuelle GSC** : 10 demandes/jour disponibles — soumettre chaque
nouvelle page le jour même (délai d'indexation : de 2–6 semaines à 24–72h).
Vérifier chaque semaine le rapport Couverture (pages découvertes non
indexées = signal de qualité à traiter).

---

## 9. Chantiers techniques & hygiène (fondations)

| ID | Action | Priorité |
|----|--------|----------|
| T1 | Audit de cannibalisation : détecter les quasi-doublons (C3), fusionner en un seul article canonique, rediriger/supprimer l'autre (301 via règles CDN ou meta refresh en static export) | P0 |
| T2 | Normaliser les catégories → 7 silos, migrer le frontmatter des 456 fichiers MDX | P0 |
| T3 | Pages catégorie `/blog/category/[silo]` + ajout sitemap + breadcrumbs | P0 |
| T4 | Composant `RelatedPosts` par silo + passe de maillage interne rétroactive (ancres exactes, lien business) sur le stock existant | P0 |
| T5 | Mettre à jour `packages/web/CLAUDE.md` (le domaine y est encore `lilyapp.io` alors que le site vit sur `withlily.app`) pour éviter de futurs canonicals cassés | P0 |
| T6 | Schema `FAQPage` sur les articles ayant une FAQ ; `HowTo` sur les guides pas-à-pas | P1 |
| T7 | OG images par article (template auto avec titre) — CTR social + SERP | P1 |
| T8 | Vérifier Core Web Vitals sur mobile (Lighthouse CI) — le static export aide, garder LCP < 2,5s | P1 |
| T9 | Page 404 utile (liens vers piliers) + surveillance des 404 dans GSC | P2 |

---

## 10. Roadmap 90 jours

### Phase 0 — Fondations (semaines 1–2) · P0
1. T1–T5 (nettoyage cannibalisation, taxonomie, pages catégorie, maillage, domaine)
2. Générer `docs/seo/keywords.csv` pour les angles A + B + G (process §3)
3. Créer les 6 pages business (§6) et les câbler au Header/Footer/sitemap
4. Configurer le suivi : GSC (2 locales), rapport hebdo positions/clics

### Phase 1 — Relance contenu (semaines 3–8) · P1
5. Reprise publication : 5–7 articles/semaine/locale, silos S2 + S3 d'abord
6. Rédaction des 7 pages piliers de silo
7. Lancement pages espèces programmatiques — vague 1 (50 espèces × 2 locales)
8. Indexation manuelle GSC quotidienne ; Pinterest : 1 épingle/article
9. Passe de mise à jour sur le top 30 des articles existants (impressions GSC
   les plus hautes sans clics = quick wins)

### Phase 2 — Amplification (semaines 9–13) · P2
10. Silo S7 comparatifs ("best plant care app 2026"…) + page download
11. Premier contenu citable : étude data "les plantes qu'on tue le plus"
12. Outil gratuit v1 : calculateur de fréquence d'arrosage
13. Routine sociale : Shorts + TikTok depuis les articles S2 ; Reddit utile
14. Bilan 90 jours → seulement ensuite, envisager le netlinking pour
    *amplifier* ce qui ranke déjà en positions 4–15

---

## 11. KPIs et pilotage

Hebdo (GSC + analytics) :
- Pages indexées / pages publiées (taux d'indexation)
- Impressions et clics organiques par silo et par locale
- Nombre de mots-clés dans le top 10 / top 3
- CTR moyen des pages business ; clics vers les stores (conversion web → install)
- Recherches de marque ("lily plant app", "lily plantes") — le signal 360

Règles de pilotage :
- Un article sans impression après 6 semaines → vérifier indexation, intention,
  cannibalisation
- Positions 4–15 avec impressions fortes → priorité de mise à jour (quick win)
- Tout nouveau sujet passe par la validation SERP avant rédaction

---

## Annexe — Backlog actionnable (à convertir en issues)

| ID | Action | Priorité | Silo/Zone |
|----|--------|----------|-----------|
| SEO-001 | Audit cannibalisation + fusion des doublons (T1) | P0 | Contenu |
| SEO-002 | Taxonomie 7 silos + migration frontmatter (T2) | P0 | Structure |
| SEO-003 | Pages catégorie + sitemap + breadcrumbs (T3) | P0 | Structure |
| SEO-004 | RelatedPosts + passe de maillage rétroactive (T4) | P0 | Maillage |
| SEO-005 | Corriger domaine dans `packages/web/CLAUDE.md` (T5) | P0 | Technique |
| SEO-006 | keywords.csv angles A+B+G, en/fr | P0 | Recherche |
| SEO-007 | Page feature plant-identifier (en/fr) | P0 | Business |
| SEO-008 | Page feature watering-reminders (en/fr) | P0 | Business |
| SEO-009 | Page feature plant-doctor (en/fr) | P0 | Business |
| SEO-010 | Page feature care-schedule (en/fr) | P1 | Business |
| SEO-011 | Page download (en/fr) | P0 | Business |
| SEO-012 | Reprise publication 5–7 art./sem. silos S2+S3 | P0 | Contenu |
| SEO-013 | 7 pages piliers de silo | P1 | Contenu |
| SEO-014 | Pages espèces programmatiques vague 1 (50×2) | P1 | Programmatique |
| SEO-015 | Routine indexation manuelle GSC quotidienne | P0 | Indexation |
| SEO-016 | Mise à jour top 30 articles existants (quick wins GSC) | P1 | Contenu |
| SEO-017 | Pinterest : compte + 1 épingle/article | P1 | 360 |
| SEO-018 | keywords.csv angles C+D+E+F | P1 | Recherche |
| SEO-019 | Silo S7 comparatifs + validation SERP | P2 | Contenu |
| SEO-020 | Étude data citable "plantes les plus tuées" | P2 | Citable |
| SEO-021 | Calculateur d'arrosage (outil gratuit) | P2 | Citable |
| SEO-022 | Schemas FAQPage/HowTo sur les guides (T6) | P1 | Technique |
| SEO-023 | OG images générées par article (T7) | P1 | Technique |
| SEO-024 | Routine Shorts/TikTok depuis articles S2 | P2 | 360 |
| SEO-025 | ASO : aligner fiches stores sur angles A | P1 | 360 |
