import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantCatalog } from '@lily/db/schema'
import type { LanguageCode } from '@lily/shared'
import { ilike, or, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer } from 'effect'

export interface CatalogPlantRow {
  id: string
  name: string
  scientificName: string | null
  family: string | null
  description: string | null
  category: string | null
  imageUrl: string | null
  wateringFrequencyDays: number
  fertilizationFrequencyDays: number | null
  mistingFrequencyDays: number | null
  repottingFrequencyDays: number | null
  humidityRating: number
  lightingRating: number
  petToxicityRating: number
  wateringRating: number
  luxNeeded: number | null
}

// Correlated subqueries use raw SQL for the outer table reference
// because Drizzle's sql`${column}` binds as a parameter value, not a column ref
const translationQuery = (lang: LanguageCode) =>
  sql<string>`COALESCE(
    (SELECT t.name FROM plant_catalog_translations t WHERE t.catalog_id = "plant_catalog"."id" AND t.language = ${lang}::language_code LIMIT 1),
    (SELECT t.name FROM plant_catalog_translations t WHERE t.catalog_id = "plant_catalog"."id" AND t.language = 'en' LIMIT 1),
    "plant_catalog"."scientific_name",
    'Unknown'
  )`

const descriptionQuery = (lang: LanguageCode) =>
  sql<string | null>`COALESCE(
    (SELECT t.description FROM plant_catalog_translations t WHERE t.catalog_id = "plant_catalog"."id" AND t.language = ${lang}::language_code LIMIT 1),
    (SELECT t.description FROM plant_catalog_translations t WHERE t.catalog_id = "plant_catalog"."id" AND t.language = 'en' LIMIT 1)
  )`

const selectCatalog = (lang: LanguageCode) => ({
  id: plantCatalog.id,
  name: translationQuery(lang).as('name'),
  scientificName: plantCatalog.scientificName,
  family: plantCatalog.family,
  description: descriptionQuery(lang).as('description'),
  category: plantCatalog.category,
  imageUrl: plantCatalog.imageUrl,
  wateringFrequencyDays: plantCatalog.wateringFrequencyDays,
  fertilizationFrequencyDays: plantCatalog.fertilizationFrequencyDays,
  mistingFrequencyDays: plantCatalog.mistingFrequencyDays,
  repottingFrequencyDays: plantCatalog.repottingFrequencyDays,
  humidityRating: plantCatalog.humidityRating,
  lightingRating: plantCatalog.lightingRating,
  petToxicityRating: plantCatalog.petToxicityRating,
  wateringRating: plantCatalog.wateringRating,
  luxNeeded: plantCatalog.luxNeeded,
})

export interface IPlantCatalogRepository {
  readonly findAll: (
    lang: LanguageCode
  ) => Effect.Effect<CatalogPlantRow[], SqlError>
  readonly search: (
    query: string,
    lang: LanguageCode
  ) => Effect.Effect<CatalogPlantRow[], SqlError>
  readonly findRandomNames: (
    count: number,
    lang: LanguageCode
  ) => Effect.Effect<string[], SqlError>
}

export class PlantCatalogRepository extends Context.Tag(
  'PlantCatalogRepository'
)<PlantCatalogRepository, IPlantCatalogRepository>() {}

export const PlantCatalogRepositoryLive = Layer.effect(
  PlantCatalogRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findAll: Effect.fn('PlantCatalogRepository.findAll')(function* (
        lang: LanguageCode
      ) {
        const rows = yield* db
          .select(selectCatalog(lang))
          .from(plantCatalog)
          .orderBy(sql`name`)

        return rows as CatalogPlantRow[]
      }),

      search: Effect.fn('PlantCatalogRepository.search')(function* (
        query: string,
        lang: LanguageCode
      ) {
        const pattern = `%${query}%`

        // Search across translations in requested language + English, scientific name, family, category
        const rows = yield* db
          .select(selectCatalog(lang))
          .from(plantCatalog)
          .where(
            or(
              // Search in translations for the requested language
              sql`EXISTS (
                SELECT 1 FROM plant_catalog_translations t
                WHERE t.catalog_id = "plant_catalog"."id"
                AND t.name ILIKE ${pattern}
              )`,
              ilike(plantCatalog.scientificName, pattern),
              ilike(plantCatalog.family, pattern),
              ilike(plantCatalog.category, pattern)
            )
          )
          .orderBy(sql`name`)

        return rows as CatalogPlantRow[]
      }),

      findRandomNames: Effect.fn('PlantCatalogRepository.findRandomNames')(
        function* (count: number, lang: LanguageCode) {
          const rows = yield* db
            .select({ name: translationQuery(lang).as('name') })
            .from(plantCatalog)
            .orderBy(sql`random()`)
            .limit(count)

          return Array.map(rows, (r) => r.name)
        }
      ),
    }
  })
)
