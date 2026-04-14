#!/usr/bin/env bun
/**
 * Seed script to populate the plant_catalog table with common houseplants.
 * Usage: bun run scripts/seed-plant-catalog.ts
 *
 * This is idempotent — it skips plants that already exist by scientific name.
 */

import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { DrizzleLive } from '@lily/db'
import { plantCatalog, plantCatalogTranslations } from '@lily/db/schema'
import { eq } from 'drizzle-orm'
import { Console, Effect } from 'effect'

interface Translation {
  name: string
  description: string
}

interface CatalogEntry {
  scientificName: string
  family: string
  category: string
  wateringFrequencyDays: number
  fertilizationFrequencyDays: number | null
  mistingFrequencyDays: number | null
  repottingFrequencyDays: number | null
  humidityRating: number
  lightingRating: number
  petToxicityRating: number
  wateringRating: number
  luxNeeded: number | null
  translations: {
    en: Translation
    fr: Translation
  }
}

const CATALOG: CatalogEntry[] = [
  // Tropical
  {
    scientificName: 'Monstera deliciosa',
    family: 'Araceae',
    category: 'Tropical',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 21,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 365,
    humidityRating: 60,
    lightingRating: 3,
    petToxicityRating: 60,
    wateringRating: 60,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Monstera',
        description: 'Tropical plant with iconic split leaves',
      },
      fr: {
        name: 'Monstera',
        description: 'Plante tropicale aux feuilles découpées emblématiques',
      },
    },
  },
  {
    scientificName: 'Ficus lyrata',
    family: 'Moraceae',
    category: 'Tree',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 14,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 60,
    lightingRating: 4,
    petToxicityRating: 50,
    wateringRating: 60,
    luxNeeded: 5000,
    translations: {
      en: {
        name: 'Fiddle Leaf Fig',
        description: 'Popular indoor tree with large fiddle-shaped leaves',
      },
      fr: {
        name: 'Figuier lyre',
        description:
          "Arbre d'intérieur populaire aux grandes feuilles en forme de lyre",
      },
    },
  },
  {
    scientificName: 'Strelitzia reginae',
    family: 'Strelitziaceae',
    category: 'Tropical',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 14,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 730,
    humidityRating: 50,
    lightingRating: 5,
    petToxicityRating: 40,
    wateringRating: 60,
    luxNeeded: 8000,
    translations: {
      en: {
        name: 'Bird of Paradise',
        description: 'Dramatic tropical plant with large paddle-shaped leaves',
      },
      fr: {
        name: 'Oiseau de paradis',
        description:
          'Plante tropicale spectaculaire aux grandes feuilles en forme de pagaie',
      },
    },
  },
  {
    scientificName: 'Calathea orbifolia',
    family: 'Marantaceae',
    category: 'Tropical',
    wateringFrequencyDays: 5,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 2,
    repottingFrequencyDays: 365,
    humidityRating: 80,
    lightingRating: 2,
    petToxicityRating: 10,
    wateringRating: 80,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Calathea',
        description: 'Prayer plant with stunning striped foliage',
      },
      fr: {
        name: 'Calathéa',
        description: 'Plante de prière au feuillage rayé magnifique',
      },
    },
  },
  {
    scientificName: 'Philodendron hederaceum',
    family: 'Araceae',
    category: 'Tropical',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 5,
    repottingFrequencyDays: 365,
    humidityRating: 50,
    lightingRating: 3,
    petToxicityRating: 60,
    wateringRating: 50,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Philodendron',
        description: 'Easy-going tropical with heart-shaped leaves',
      },
      fr: {
        name: 'Philodendron',
        description: 'Plante tropicale facile aux feuilles en forme de cœur',
      },
    },
  },
  {
    scientificName: 'Ficus elastica',
    family: 'Moraceae',
    category: 'Tree',
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 40,
    lightingRating: 3,
    petToxicityRating: 50,
    wateringRating: 40,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Rubber Plant',
        description: 'Bold indoor tree with thick glossy leaves',
      },
      fr: {
        name: 'Caoutchouc',
        description:
          "Arbre d'intérieur imposant aux feuilles épaisses et brillantes",
      },
    },
  },
  {
    scientificName: 'Alocasia amazonica',
    family: 'Araceae',
    category: 'Tropical',
    wateringFrequencyDays: 5,
    fertilizationFrequencyDays: 14,
    mistingFrequencyDays: 2,
    repottingFrequencyDays: 365,
    humidityRating: 70,
    lightingRating: 3,
    petToxicityRating: 70,
    wateringRating: 70,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Alocasia',
        description: 'Striking tropical with arrow-shaped veined leaves',
      },
      fr: {
        name: 'Alocasia',
        description:
          'Tropicale saisissante aux feuilles nervurées en forme de flèche',
      },
    },
  },

  // Succulents & Cacti
  {
    scientificName: 'Sansevieria trifasciata',
    family: 'Asparagaceae',
    category: 'Succulent',
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 60,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 20,
    lightingRating: 3,
    petToxicityRating: 40,
    wateringRating: 20,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Snake Plant',
        description: 'Hardy succulent with upright sword-shaped leaves',
      },
      fr: {
        name: 'Langue de belle-mère',
        description:
          "Succulente résistante aux feuilles dressées en forme d'épée",
      },
    },
  },
  {
    scientificName: 'Aloe barbadensis',
    family: 'Asphodelaceae',
    category: 'Succulent',
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 60,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 20,
    lightingRating: 4,
    petToxicityRating: 30,
    wateringRating: 20,
    luxNeeded: 5000,
    translations: {
      en: {
        name: 'Aloe Vera',
        description: 'Medicinal succulent with healing gel inside its leaves',
      },
      fr: {
        name: 'Aloe Vera',
        description:
          'Succulente médicinale au gel cicatrisant dans ses feuilles',
      },
    },
  },
  {
    scientificName: 'Crassula ovata',
    family: 'Crassulaceae',
    category: 'Succulent',
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 60,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 20,
    lightingRating: 4,
    petToxicityRating: 40,
    wateringRating: 20,
    luxNeeded: 5000,
    translations: {
      en: {
        name: 'Jade Plant',
        description: 'Lucky money tree with thick oval leaves',
      },
      fr: {
        name: 'Arbre de jade',
        description: 'Arbre porte-bonheur aux feuilles ovales épaisses',
      },
    },
  },
  {
    scientificName: 'Echeveria elegans',
    family: 'Crassulaceae',
    category: 'Succulent',
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 60,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 15,
    lightingRating: 5,
    petToxicityRating: 10,
    wateringRating: 15,
    luxNeeded: 10000,
    translations: {
      en: {
        name: 'Echeveria',
        description: 'Rosette-shaped succulent in pastel colors',
      },
      fr: {
        name: 'Echeveria',
        description: 'Succulente en rosette aux couleurs pastel',
      },
    },
  },
  {
    scientificName: 'Opuntia microdasys',
    family: 'Cactaceae',
    category: 'Succulent',
    wateringFrequencyDays: 21,
    fertilizationFrequencyDays: 90,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 10,
    lightingRating: 5,
    petToxicityRating: 20,
    wateringRating: 10,
    luxNeeded: 10000,
    translations: {
      en: {
        name: 'Cactus',
        description: 'Classic desert plant, extremely low maintenance',
      },
      fr: {
        name: 'Cactus',
        description: "Plante du désert classique, très facile d'entretien",
      },
    },
  },
  {
    scientificName: 'Senecio rowleyanus',
    family: 'Asteraceae',
    category: 'Succulent',
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 20,
    lightingRating: 4,
    petToxicityRating: 60,
    wateringRating: 20,
    luxNeeded: 5000,
    translations: {
      en: {
        name: 'String of Pearls',
        description: 'Trailing succulent with bead-like leaves',
      },
      fr: {
        name: 'Collier de perles',
        description: 'Succulente retombante aux feuilles en forme de perles',
      },
    },
  },

  // Vines & Trailing
  {
    scientificName: 'Epipremnum aureum',
    family: 'Araceae',
    category: 'Vine',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 40,
    lightingRating: 2,
    petToxicityRating: 50,
    wateringRating: 40,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Pothos',
        description: 'Beginner-friendly trailing vine with heart-shaped leaves',
      },
      fr: {
        name: 'Pothos',
        description:
          'Liane retombante pour débutants aux feuilles en forme de cœur',
      },
    },
  },
  {
    scientificName: 'Hedera helix',
    family: 'Araliaceae',
    category: 'Vine',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 365,
    humidityRating: 50,
    lightingRating: 3,
    petToxicityRating: 60,
    wateringRating: 50,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'English Ivy',
        description: 'Classic trailing ivy, great air purifier',
      },
      fr: {
        name: 'Lierre',
        description: "Lierre classique retombant, excellent purificateur d'air",
      },
    },
  },
  {
    scientificName: 'Hoya carnosa',
    family: 'Apocynaceae',
    category: 'Vine',
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 40,
    lightingRating: 3,
    petToxicityRating: 10,
    wateringRating: 30,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Hoya',
        description:
          'Wax plant with thick leaves and fragrant star-shaped flowers',
      },
      fr: {
        name: 'Fleur de porcelaine',
        description:
          'Plante de cire aux feuilles épaisses et fleurs étoilées parfumées',
      },
    },
  },

  // Ferns
  {
    scientificName: 'Nephrolepis exaltata',
    family: 'Nephrolepidaceae',
    category: 'Fern',
    wateringFrequencyDays: 3,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 2,
    repottingFrequencyDays: 365,
    humidityRating: 80,
    lightingRating: 2,
    petToxicityRating: 10,
    wateringRating: 80,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Boston Fern',
        description: 'Lush green fern with arching fronds',
      },
      fr: {
        name: 'Fougère de Boston',
        description: 'Fougère luxuriante aux frondes arquées',
      },
    },
  },
  {
    scientificName: 'Adiantum raddianum',
    family: 'Pteridaceae',
    category: 'Fern',
    wateringFrequencyDays: 2,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 1,
    repottingFrequencyDays: 365,
    humidityRating: 90,
    lightingRating: 2,
    petToxicityRating: 10,
    wateringRating: 90,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Maidenhair Fern',
        description: 'Delicate fern with small fan-shaped leaves',
      },
      fr: {
        name: 'Capillaire',
        description: 'Fougère délicate aux petites feuilles en éventail',
      },
    },
  },

  // Flowering
  {
    scientificName: 'Spathiphyllum wallisii',
    family: 'Araceae',
    category: 'Flowering',
    wateringFrequencyDays: 5,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 365,
    humidityRating: 60,
    lightingRating: 2,
    petToxicityRating: 70,
    wateringRating: 70,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Peace Lily',
        description: 'Elegant flowering plant with white blooms',
      },
      fr: {
        name: 'Lys de paix',
        description: 'Plante élégante aux fleurs blanches',
      },
    },
  },
  {
    scientificName: 'Phalaenopsis spp.',
    family: 'Orchidaceae',
    category: 'Flowering',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 14,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 730,
    humidityRating: 60,
    lightingRating: 3,
    petToxicityRating: 10,
    wateringRating: 40,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Orchid',
        description: 'Elegant flowering plant with long-lasting blooms',
      },
      fr: {
        name: 'Orchidée',
        description: 'Plante élégante aux fleurs durables',
      },
    },
  },
  {
    scientificName: 'Anthurium andraeanum',
    family: 'Araceae',
    category: 'Flowering',
    wateringFrequencyDays: 5,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 365,
    humidityRating: 70,
    lightingRating: 3,
    petToxicityRating: 60,
    wateringRating: 60,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Anthurium',
        description: 'Tropical plant with glossy red heart-shaped flowers',
      },
      fr: {
        name: 'Anthurium',
        description:
          'Plante tropicale aux fleurs rouges brillantes en forme de cœur',
      },
    },
  },

  // Low light / Air purifiers
  {
    scientificName: 'Zamioculcas zamiifolia',
    family: 'Araceae',
    category: 'Tropical',
    wateringFrequencyDays: 14,
    fertilizationFrequencyDays: 60,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 30,
    lightingRating: 1,
    petToxicityRating: 50,
    wateringRating: 20,
    luxNeeded: 500,
    translations: {
      en: {
        name: 'ZZ Plant',
        description: 'Nearly indestructible plant with glossy dark leaves',
      },
      fr: {
        name: 'Plante ZZ',
        description:
          'Plante quasi indestructible aux feuilles sombres et brillantes',
      },
    },
  },
  {
    scientificName: 'Chlorophytum comosum',
    family: 'Asparagaceae',
    category: 'Grass',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 40,
    lightingRating: 2,
    petToxicityRating: 10,
    wateringRating: 50,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Spider Plant',
        description: 'Air-purifying plant that produces baby plantlets',
      },
      fr: {
        name: 'Plante araignée',
        description: "Plante purificatrice d'air qui produit des plantules",
      },
    },
  },
  {
    scientificName: 'Dracaena marginata',
    family: 'Asparagaceae',
    category: 'Tree',
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 730,
    humidityRating: 40,
    lightingRating: 3,
    petToxicityRating: 50,
    wateringRating: 40,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Dracaena',
        description: 'Tree-like plant with slender striped leaves',
      },
      fr: {
        name: 'Dracaena',
        description: 'Plante arborescente aux feuilles fines et rayées',
      },
    },
  },

  // Herbs
  {
    scientificName: 'Ocimum basilicum',
    family: 'Lamiaceae',
    category: 'Herb',
    wateringFrequencyDays: 2,
    fertilizationFrequencyDays: 14,
    mistingFrequencyDays: null,
    repottingFrequencyDays: null,
    humidityRating: 50,
    lightingRating: 5,
    petToxicityRating: 10,
    wateringRating: 70,
    luxNeeded: 10000,
    translations: {
      en: { name: 'Basil', description: 'Fragrant culinary herb for cooking' },
      fr: {
        name: 'Basilic',
        description: 'Herbe culinaire parfumée pour la cuisine',
      },
    },
  },
  {
    scientificName: 'Mentha spicata',
    family: 'Lamiaceae',
    category: 'Herb',
    wateringFrequencyDays: 2,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 180,
    humidityRating: 50,
    lightingRating: 4,
    petToxicityRating: 10,
    wateringRating: 70,
    luxNeeded: 5000,
    translations: {
      en: { name: 'Mint', description: 'Fast-growing aromatic herb' },
      fr: {
        name: 'Menthe',
        description: 'Herbe aromatique à croissance rapide',
      },
    },
  },
  {
    scientificName: 'Lavandula angustifolia',
    family: 'Lamiaceae',
    category: 'Flowering',
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 20,
    lightingRating: 5,
    petToxicityRating: 10,
    wateringRating: 20,
    luxNeeded: 10000,
    translations: {
      en: {
        name: 'Lavender',
        description: 'Fragrant purple-flowering Mediterranean shrub',
      },
      fr: {
        name: 'Lavande',
        description: 'Arbuste méditerranéen parfumé aux fleurs violettes',
      },
    },
  },

  // Palms
  {
    scientificName: 'Dypsis lutescens',
    family: 'Arecaceae',
    category: 'Palm',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 3,
    repottingFrequencyDays: 730,
    humidityRating: 50,
    lightingRating: 3,
    petToxicityRating: 10,
    wateringRating: 50,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Areca Palm',
        description: 'Graceful indoor palm with feathery fronds',
      },
      fr: {
        name: 'Palmier areca',
        description: "Palmier d'intérieur gracieux aux frondes plumeuses",
      },
    },
  },
  {
    scientificName: 'Chamaedorea elegans',
    family: 'Arecaceae',
    category: 'Palm',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: 5,
    repottingFrequencyDays: 730,
    humidityRating: 50,
    lightingRating: 2,
    petToxicityRating: 10,
    wateringRating: 50,
    luxNeeded: 1500,
    translations: {
      en: {
        name: 'Parlor Palm',
        description: 'Compact palm perfect for low-light spaces',
      },
      fr: {
        name: 'Palmier nain',
        description: 'Petit palmier parfait pour les espaces peu éclairés',
      },
    },
  },

  // Other popular
  {
    scientificName: 'Pilea peperomioides',
    family: 'Urticaceae',
    category: 'Tropical',
    wateringFrequencyDays: 7,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 40,
    lightingRating: 3,
    petToxicityRating: 10,
    wateringRating: 40,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Pilea',
        description: 'Chinese money plant with round coin-shaped leaves',
      },
      fr: {
        name: 'Pilea',
        description:
          'Plante à monnaie chinoise aux feuilles rondes en forme de pièce',
      },
    },
  },
  {
    scientificName: 'Peperomia obtusifolia',
    family: 'Piperaceae',
    category: 'Tropical',
    wateringFrequencyDays: 10,
    fertilizationFrequencyDays: 30,
    mistingFrequencyDays: null,
    repottingFrequencyDays: 365,
    humidityRating: 40,
    lightingRating: 3,
    petToxicityRating: 10,
    wateringRating: 30,
    luxNeeded: 2500,
    translations: {
      en: {
        name: 'Peperomia',
        description: 'Compact plant with thick, glossy leaves',
      },
      fr: {
        name: 'Peperomia',
        description: 'Plante compacte aux feuilles épaisses et brillantes',
      },
    },
  },
]

const seedPlantCatalog = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle

  let inserted = 0
  let skipped = 0

  for (const entry of CATALOG) {
    // Check if already exists by scientific name
    const existing = yield* db
      .select()
      .from(plantCatalog)
      .where(eq(plantCatalog.scientificName, entry.scientificName))

    if (existing.length > 0) {
      // Ensure translations exist for existing entries
      const catalogId = existing[0]!.id
      const existingTranslations = yield* db
        .select()
        .from(plantCatalogTranslations)
        .where(eq(plantCatalogTranslations.catalogId, catalogId))

      if (existingTranslations.length === 0) {
        yield* db.insert(plantCatalogTranslations).values([
          {
            catalogId,
            language: 'en',
            name: entry.translations.en.name,
            description: entry.translations.en.description,
          },
          {
            catalogId,
            language: 'fr',
            name: entry.translations.fr.name,
            description: entry.translations.fr.description,
          },
        ])
        inserted++
      } else {
        skipped++
      }
      continue
    }

    // Insert catalog entry
    const rows = yield* db
      .insert(plantCatalog)
      .values({
        scientificName: entry.scientificName,
        family: entry.family,
        category: entry.category,
        wateringFrequencyDays: entry.wateringFrequencyDays,
        fertilizationFrequencyDays: entry.fertilizationFrequencyDays,
        mistingFrequencyDays: entry.mistingFrequencyDays,
        repottingFrequencyDays: entry.repottingFrequencyDays,
        humidityRating: entry.humidityRating,
        lightingRating: entry.lightingRating,
        petToxicityRating: entry.petToxicityRating,
        wateringRating: entry.wateringRating,
        luxNeeded: entry.luxNeeded,
      })
      .returning()

    const catalogId = rows[0]!.id

    // Insert translations
    yield* db.insert(plantCatalogTranslations).values([
      {
        catalogId,
        language: 'en',
        name: entry.translations.en.name,
        description: entry.translations.en.description,
      },
      {
        catalogId,
        language: 'fr',
        name: entry.translations.fr.name,
        description: entry.translations.fr.description,
      },
    ])

    inserted++
  }

  yield* Console.log(
    `Plant catalog seeded: ${inserted} inserted, ${skipped} skipped (already existed)`
  )
})

Effect.runPromise(seedPlantCatalog.pipe(Effect.provide(DrizzleLive)))
