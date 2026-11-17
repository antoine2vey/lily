import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '@lily/db/migrator'
import { CATALOG, type CatalogEntry } from '@lily/shared/plant-catalog'
import { Array, Option, Order, String } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migrationsFolder = fileURLToPath(
  new URL('../../../../db/drizzle/', import.meta.url)
)

type CatalogRow = Omit<CatalogEntry, 'scientificName'> & {
  readonly scientificName: string | null
}

const byScientificName = Order.mapInput(Order.String, (row: CatalogRow) =>
  Option.getOrElse(Option.fromNullishOr(row.scientificName), () => '')
)

const scientificNames = (rows: ReadonlyArray<CatalogRow>) =>
  Array.map(rows, (row) => row.scientificName)

// The shared test database cannot serve as the source: the stored-refs and
// orphan-sweep suites truncate plant_catalog. A database of its own, built by
// the production runner, holds exactly the rows the migrations leave.
describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Plant catalog rows after every migration match CATALOG - Integration',
  () => {
    const adminUrl = Option.getOrElse(
      Option.fromNullishOr(process.env.DATABASE_URL_TEST),
      () => ''
    )
    const databaseName = `lily_catalog_${String.replaceAll('-', '')(randomUUID())}`
    let pool: pg.Pool
    let rows: ReadonlyArray<CatalogRow>

    const withAdmin = async (statement: string) => {
      const admin = new pg.Client({ connectionString: adminUrl })
      await admin.connect()
      await admin.query(statement)
      await admin.end()
    }

    beforeAll(async () => {
      await withAdmin(`CREATE DATABASE "${databaseName}"`)
      const url = new URL(adminUrl)
      url.pathname = `/${databaseName}`
      pool = new pg.Pool({ connectionString: url.toString() })
      await runMigrations({ databaseUrl: url.toString(), migrationsFolder })
      const result = await pool.query<CatalogRow>(
        `SELECT c.scientific_name AS "scientificName",
                c.family,
                c.category,
                c.watering_frequency_days AS "wateringFrequencyDays",
                c.fertilization_frequency_days AS "fertilizationFrequencyDays",
                c.misting_frequency_days AS "mistingFrequencyDays",
                c.repotting_frequency_days AS "repottingFrequencyDays",
                c.humidity_rating AS "humidityRating",
                c.lighting_rating AS "lightingRating",
                c.pet_toxicity_rating AS "petToxicityRating",
                c.watering_rating AS "wateringRating",
                c.lux_needed AS "luxNeeded",
                COALESCE(
                  json_object_agg(
                    t.language,
                    json_build_object('name', t.name, 'description', t.description)
                  ) FILTER (WHERE t.id IS NOT NULL),
                  '{}'
                ) AS translations
         FROM plant_catalog c
         LEFT JOIN plant_catalog_translations t ON t.catalog_id = c.id
         GROUP BY c.id`
      )
      rows = Array.sort(result.rows, byScientificName)
    }, 60_000)

    afterAll(async () => {
      await pool.end()
      await withAdmin(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
    })

    it('serves the same plants as CATALOG', () => {
      const database = scientificNames(rows)
      const catalog = scientificNames(CATALOG)
      expect({
        onlyInDatabase: Array.difference(database, catalog),
        onlyInCatalog: Array.difference(catalog, database),
      }).toEqual({ onlyInDatabase: [], onlyInCatalog: [] })
    })

    it('stores every field and translation of CATALOG', () => {
      expect(rows).toEqual(Array.sort(CATALOG, byScientificName))
    })
  }
)
