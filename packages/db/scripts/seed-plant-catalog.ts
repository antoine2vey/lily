#!/usr/bin/env bun

/**
 * Seed script to populate the plant_catalog table with common houseplants.
 * Usage: bun run scripts/seed-plant-catalog.ts
 *
 * This is idempotent — it skips plants that already exist by scientific name.
 */

import { DrizzleLive } from '@lily/db'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { plantCatalog, plantCatalogTranslations } from '@lily/db/schema'
import { CATALOG } from '@lily/shared/plant-catalog'
import { eq } from 'drizzle-orm'
import { Console, Effect } from 'effect'

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

    const [existingRow] = existing
    if (existingRow) {
      // Ensure translations exist for existing entries
      const catalogId = existingRow.id
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

    const [insertedRow] = rows
    if (!insertedRow) {
      throw new Error(
        `Failed to insert plant catalog entry: ${entry.scientificName}`
      )
    }
    const catalogId = insertedRow.id

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
