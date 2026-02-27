#!/usr/bin/env bun
/**
 * Seed script to create web ingestion jobs for houseplant care URLs.
 * Each batch becomes an ingest job that the background worker picks up
 * and processes through the pipeline (fetch → chunk → categorize → enrich → embed).
 *
 * Usage: KNOWLEDGE_DATABASE_URL=... bun run scripts/seed-houseplant-knowledge.ts
 */

import {
  ingestJobs,
  KnowledgeDrizzle,
  KnowledgeDrizzleLive,
} from '@lily/knowledge-db'
import { Array, Console, Effect, pipe } from 'effect'

interface UrlBatch {
  readonly name: string
  readonly urls: readonly string[]
}

const batches: readonly UrlBatch[] = [
  {
    name: 'Tropical Foliage (Popular)',
    urls: [
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-monstera-monstera-deliciosa',
      'https://bloomscape.com/plant-care-guide/monstera/',
      'https://soltech.com/products/monstera-care',
      'https://bloomscape.com/plant-care-guide/pothos/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-pothos',
      'https://www.almanac.com/plant/pothos',
      'https://bloomscape.com/plant-care-guide/philodendron/',
      'https://www.provenwinners.com/learn/houseplants/philodendron',
      'https://extension.sdstate.edu/philodendron-houseplant-how',
      'https://plnts.com/en/care/houseplants-family/alocasia',
      'https://www.provenwinners.com/learn/houseplants/alocasia',
      'https://www.almanac.com/plant/arrowhead-plant-care-and-propagation-syngonium',
      'https://www.gardenia.net/plant/syngonium-podophyllum-arrowhead-vine-grow-care-tips',
      'https://bloomscape.com/plant-care-guide/dieffenbachia/',
      'https://hgic.clemson.edu/factsheet/chinese-evergreen-aglaonema-care-cultivation-growing-guide/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-an-aglaonema',
      'https://www.almanac.com/plant/croton',
      'https://hort.extension.wisc.edu/articles/croton-codiaeum-variegatum/',
      'https://bloomscape.com/plant-care-guide/dracaena/',
      'https://www.almanac.com/plant/dracaena',
      'https://www.healthyhouseplants.com/indoor-houseplants/corn-plant-dracaena-fragrans-care-guide/',
      'https://bloomscape.com/plant-care-guide/tradescantia/',
      'https://www.almanac.com/plant/tradescantia',
    ],
  },
  {
    name: 'Ficus, Rubber & Fig Family',
    urls: [
      'https://bloomscape.com/plant-care-guide/fiddle-leaf-fig/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-fiddle-leaf-fig-ficus-lyrata',
      'https://www.patchplants.com/pages/plant-care/complete-guide-to-fiddle-leaf-fig-care/',
      'https://libguides.nybg.org/fiddleleaffig',
      'https://www.almanac.com/plant/rubber-tree-plant-ficus-elastica-care-guide',
      'https://greeneryunlimited.co/blogs/plant-care/rubber-plant-care',
      'https://www.patchplants.com/pages/plant-care/complete-guide-to-rubber-plant-care/',
      'https://soltech.com/products/rubber-tree-care',
      'https://www.gardendesign.com/houseplants/ficus.html',
    ],
  },
  {
    name: 'Low-Maintenance Favorites',
    urls: [
      'https://bloomscape.com/plant-care-guide/sansevieria/',
      'https://www.almanac.com/plant/snake-plants',
      'https://greeneryunlimited.co/blogs/plant-care/sansevieria-care',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-zz-zamioculcas-zamiifolia',
      'https://bloomscape.com/plant-care-guide/zz-plant/',
      'https://www.gardendesign.com/houseplants/zz-plant.html',
      'https://www.almanac.com/plant/spider-plants',
      'https://bloomscape.com/plant-care-guide/spider-plant/',
      'https://hort.extension.wisc.edu/articles/spider-plant-chlorophytum-comosum/',
      'https://www.gardendesign.com/houseplants/cast-iron-plant.html',
      'https://www.almanac.com/plant/cast-iron-plant',
      'https://hgic.clemson.edu/factsheet/cast-iron-plant/',
      'https://bloomscape.com/plant-care-guide/pilea-peperomioides/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-pilea-peperomioides',
    ],
  },
  {
    name: 'Prayer Plants & Marantaceae',
    urls: [
      'https://bloomscape.com/plant-care-guide/calathea/',
      'https://www.heyrooted.com/blogs/plant-care/calathea-care',
      'https://www.ourhouseplants.com/plants/calathea',
      'https://soltech.com/products/calathea-orbifolia-care',
      'https://bloomscape.com/plant-care-guide/prayer-plant/',
      'https://www.provenwinners.com/learn/houseplants/prayer-plant',
      'https://planterina.com/blogs/plant-care/prayer-plant-care',
      'https://pistilsnursery.com/blogs/journal/a-guide-to-prayer-plants-how-to-grow-maranta-calathea-and-other-marantaceae-indoors',
    ],
  },
  {
    name: 'Ferns',
    urls: [
      'https://www.gardeningknowhow.com/houseplants/boston-fern/boston-fern-care.htm',
      'https://soltech.com/products/boston-fern-care',
      'https://hort.extension.wisc.edu/articles/boston-fern-nephrolepis-exaltata-bostoniensis/',
      'https://bloomscape.com/plant-care-guide/maidenhair-fern/',
      'https://www.gardeningknowhow.com/houseplants/maidenhair-fern/growing-maidenhair-ferns.htm',
      'https://hort.extension.wisc.edu/articles/maidenhair-fern-adiantum/',
      'https://bloomscape.com/plant-care-guide/asparagus-fern/',
      'https://www.gardeningknowhow.com/ornamental/foliage/asparagus-fern/asparagus-fern-care.htm',
      'https://hgic.clemson.edu/how-to-grow-and-care-for-birds-nest-fern-asplenium-nidus/',
      'https://www.guide-to-houseplants.com/birds-nest-fern.html',
      'https://www.gardeningknowhow.com/houseplants/rabbit-foot-fern/growing-rabbits-foot-fern.htm',
      'https://hort.extension.wisc.edu/articles/rabbits-foot-fern-davallia-species/',
    ],
  },
  {
    name: 'Succulents & Cacti',
    urls: [
      'https://www.almanac.com/plant/aloe-vera',
      'https://soltech.com/products/aloe-plant-care',
      'https://libguides.nybg.org/aloe',
      'https://www.almanac.com/plant/jade-plants',
      'https://hort.extension.wisc.edu/articles/jade-plant-crassula-ovata/',
      'https://soltech.com/products/jade-plant-care',
      'https://gardenerspath.com/plants/succulents/grow-haworthia/',
      'https://www.gardenia.net/genus/haworthia-best-varieties-care-grow-guide',
      'https://www.planetnatural.com/string-of-pearls/',
      'https://www.gardeningknowhow.com/ornamental/cacti-succulents/string-of-pearls/string-of-pearls-plant.htm',
      'https://hort.extension.wisc.edu/articles/string-of-hearts-ceropegia-woodii/',
      'https://www.bybrittanygoldwyn.com/string-of-hearts-care/',
      'https://hort.extension.wisc.edu/articles/burros-tail-sedum-morganianum/',
      'https://www.gardeningknowhow.com/ornamental/cacti-succulents/burros-tail/burros-tail-care.htm',
      'https://www.almanac.com/plant/christmas-cactus',
      'https://www.canr.msu.edu/news/how_to_care_for_and_reflower_your_christmas_cactus',
      'https://planetdesert.com/blogs/news/cactus-care-types-and-growing-guide',
      'https://extension.umn.edu/houseplants/cacti-and-succulents',
      'https://www.gardenia.net/guide/how-to-care-for-succulents-mistakes-to-avoid',
      'https://www.almanac.com/plant/kalanchoe',
      'https://bloomscape.com/plant-care-guide/kalanchoe/',
    ],
  },
  {
    name: 'Flowering Houseplants',
    urls: [
      'https://www.almanac.com/plant/peace-lilies',
      'https://bloomscape.com/plant-care-guide/peace-lily/',
      'https://www.gardenersworld.com/house-plants/how-to-grow-peace-lily/',
      'https://bloomscape.com/plant-care-guide/anthurium/',
      'https://www.almanac.com/plant/anthuriums',
      'https://www.joyusgarden.com/anthurium-care-growing-tips/',
      'https://gardens.si.edu/learn/educational-resources/plant-care-sheets/care-of-african-violets/',
      'https://extension.umn.edu/houseplants/african-violets',
      'https://africanvioletsocietyofamerica.org/learn/violets-101/',
      'https://www.aos.org/orchid-care/care-sheets/phalaenopsis-culture-sheet',
      'https://extension.umd.edu/resource/care-phalaenopsis-orchids-moth-orchids',
      'https://yardandgarden.extension.iastate.edu/how-to/growing-orchids-indoors',
      'https://bloomscape.com/plant-care-guide/begonia/',
      'https://www.almanac.com/plant/begonias',
      'https://bloomscape.com/plant-care-guide/bird-of-paradise/',
      'https://soltech.com/products/bird-of-paradise-care',
      'https://www.almanac.com/plant/cyclamen',
      'https://hgic.clemson.edu/factsheet/cyclamen/',
      'https://www.almanac.com/plant/gardenias',
      'https://hgic.clemson.edu/factsheet/gardenia/',
      'https://www.almanac.com/plant/jasmine',
    ],
  },
  {
    name: 'Palms & Large Indoor Trees',
    urls: [
      'https://bloomscape.com/plant-care-guide/areca-palm/',
      'https://www.almanac.com/plant/areca-palm',
      'https://bloomscape.com/plant-care-guide/parlor-palm/',
      'https://www.almanac.com/plant/parlor-palm',
      'https://www.gardendesign.com/houseplants/bamboo-palm.html',
      'https://www.almanac.com/plant/ponytail-palm',
      'https://bloomscape.com/plant-care-guide/ponytail-palm/',
      'https://hort.extension.wisc.edu/articles/ponytail-palm-beaucarnea-recurvata/',
      'https://www.almanac.com/plant/sago-palm',
      'https://hgic.clemson.edu/factsheet/sago-palm/',
      'https://bloomscape.com/plant-care-guide/norfolk-pine/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-norfolk-island-pine-araucaria-heterophilla',
      'https://bloomscape.com/plant-care-guide/yucca/',
      'https://www.almanac.com/plant/yucca',
      'https://bloomscape.com/plant-care-guide/money-tree/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-money-tree-pachira-aquatica',
      'https://www.almanac.com/plant/lucky-bamboo',
    ],
  },
  {
    name: 'Vining, Trailing & Climbing',
    urls: [
      'https://bloomscape.com/plant-care-guide/hoya/',
      'https://www.thesill.com/blogs/plants-101/how-to-care-for-a-hoya-plant',
      'https://hgic.clemson.edu/factsheet/indoor-plants-waxflowers-hoya/',
      'https://pistilsnursery.com/blogs/journal/hoya-plant-care-how-to-grow-our-top-5-cultivars',
      'https://www.almanac.com/plant/english-ivy',
      'https://hort.extension.wisc.edu/articles/english-ivy-hedera-helix/',
      'https://www.gardeningknowhow.com/houseplants/lipstick-plant/growing-lipstick-plant.htm',
      'https://www.gardeningknowhow.com/houseplants/grape-ivy/growing-grape-ivy.htm',
      'https://hort.extension.wisc.edu/articles/grape-ivy-cissus-rhombifolia/',
    ],
  },
  {
    name: 'Peperomia, Schefflera & Other Foliage',
    urls: [
      'https://bloomscape.com/plant-care-guide/peperomia/',
      'https://www.almanac.com/plant/peperomia',
      'https://www.epicgardening.com/peperomia/',
      'https://bloomscape.com/plant-care-guide/schefflera/',
      'https://www.almanac.com/plant/umbrella-plant-care-guide-schefflera',
      'https://hgic.clemson.edu/factsheet/schefflera-2/',
      'https://www.provenwinners.com/how-plant/coleus',
      'https://www.gardenia.net/guide/coleus-plant-care-and-growing-guide',
      'https://bloomscape.com/plant-care-guide/polka-dot-plant/',
      'https://www.almanac.com/plant/polka-dot-plant',
      'https://bloomscape.com/plant-care-guide/fittonia/',
      'https://www.almanac.com/plant/nerve-plant',
      'https://www.gardeningknowhow.com/houseplants/zebra-plant/growing-a-zebra-plant.htm',
      'https://plants.ces.ncsu.edu/plants/tradescantia-pallida/',
    ],
  },
  {
    name: 'Bromeliads, Air Plants & Specialty',
    urls: [
      'https://bloomscape.com/plant-care-guide/bromeliad/',
      'https://www.almanac.com/plant/bromeliads',
      'https://hgic.clemson.edu/factsheet/bromeliads/',
      'https://www.airplantcity.com/pages/air-plant-care',
      'https://warren.cce.cornell.edu/gardening-landscape/warren-county-master-gardener-articles/air-plants-tillandsia',
      'https://www.gardenersworld.com/how-to/grow-plants/air-plants-tillandsia/',
      'https://www.almanac.com/plant/venus-flytraps',
      'https://www.carnivorousplants.org/grow/guides/VenusFlyTrap',
    ],
  },
  {
    name: 'Indoor Herbs & Edibles',
    urls: [
      'https://www.almanac.com/plant/rosemary',
      'https://www.gardeningknowhow.com/edible/herbs/rosemary/growing-rosemary-indoors.htm',
      'https://yardandgarden.extension.iastate.edu/how-to/growing-herbs-indoors',
      'https://www.almanac.com/plant/lavender',
      'https://www.gardenia.net/guide/the-complete-guide-to-growing-lavender-indoors',
      'https://www.almanac.com/plant/lemons',
      'https://www.chicagobotanic.org/plant-information/tips/growing-herbs-your-windowsill',
    ],
  },
  {
    name: 'Cross-Species: Pests, Soil, Propagation & Light',
    urls: [
      'https://ipm.ucanr.edu/PMG/PESTNOTES/pn74172.html',
      'https://extension.psu.edu/preventing-diagnosing-and-correcting-common-houseplant-problems',
      'https://extension.psu.edu/pest-and-disease-problems-of-indoor-plants',
      'https://yardandgarden.extension.iastate.edu/how-to/diagnosing-houseplant-problems-diseases',
      'https://extension.umd.edu/resource/potting-and-repotting-indoor-plants',
      'https://extension.psu.edu/potting-media-and-plant-propagation',
      'https://extension.psu.edu/repotting-houseplants',
      'https://extension.umd.edu/resource/fertilizer-indoor-plants',
      'https://homegarden.cahnr.uconn.edu/factsheets/houseplant-fertilization/',
      'https://miraclegro.com/en-us/indoor-gardening/houseplant-propagation-101.html',
      'https://gardenerspath.com/plants/houseplants/propagate-stem-leaf-cuttings/',
      'https://gardeningsolutions.ifas.ufl.edu/plants/houseplants/light-for-houseplants/',
      'https://soltech.com/blogs/blog/understanding-light-levels-a-guide-to-full-sun-bright-indirect-medium-and-low-light-houseplants',
      'https://bloomscape.com/plant-care/telltale-signs-of-overwatered-plants-according-to-plant-mom/',
      'https://costafarms.com/blogs/get-growing/fix-overwatering-and-root-rot-on-your-houseplants',
    ],
  },
]

const seed = Effect.gen(function* () {
  const db = yield* KnowledgeDrizzle

  yield* Console.log('Creating houseplant knowledge ingestion jobs...\n')

  const createdJobs = yield* Effect.forEach(
    batches,
    (batch) =>
      Effect.gen(function* () {
        const rows = yield* db
          .insert(ingestJobs)
          .values({
            adapter: 'web',
            config: { type: 'web', urls: batch.urls },
          })
          .returning()

        const job = pipe(Array.head(rows), Option.getOrUndefined)

        yield* Console.log(
          `  Created job "${batch.name}" → ${batch.urls.length} URLs (id: ${job?.id ?? 'unknown'})`
        )

        return job
      }),
    { concurrency: 1 }
  )

  const totalUrls = pipe(
    batches,
    Array.map((b) => b.urls.length),
    Array.reduce(0, (a, b) => a + b)
  )

  yield* Console.log(
    `\nDone! Created ${createdJobs.length} jobs with ${totalUrls} total URLs.`
  )
  yield* Console.log(
    'The background worker will pick these up and process them automatically.'
  )
  yield* Console.log(
    'Monitor progress via: GET /knowledge/jobs and GET /knowledge/stats'
  )
})

const program = seed.pipe(Effect.provide(KnowledgeDrizzleLive))

Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding houseplant knowledge:', error)
    process.exit(1)
  })
