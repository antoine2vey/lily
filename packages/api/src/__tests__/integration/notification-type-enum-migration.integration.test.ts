import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const migration = fileURLToPath(
  new URL(
    '../../../../db/drizzle/0068_notification_type_enum.sql',
    import.meta.url
  )
)

interface Row {
  readonly id: string
  readonly type: string
  readonly json: string
}

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  '0068 notification_type enum - Integration',
  () => {
    let pool: pg.Pool
    let before: ReadonlyArray<Row> = []
    let after: ReadonlyArray<Row> = []
    let column = ''

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      const client = await pool.connect()
      const seeded = `SELECT id, type::text AS type, row_to_json(n)::text AS json
        FROM notifications n WHERE user_id = $1 ORDER BY id`
      try {
        await client.query('BEGIN')
        await client.query(
          'ALTER TABLE notifications ALTER COLUMN type SET DATA TYPE text USING type::text'
        )
        await client.query('DROP TYPE notification_type')
        const user = await client.query<{ id: string }>(
          `INSERT INTO users (email, email_verified)
           VALUES ('enum-migration-${Date.now()}@example.com', true) RETURNING id`
        )
        const userId = user.rows[0]?.id
        await client.query(
          `INSERT INTO notifications (type, status, scheduled_at, user_id)
           SELECT t, s::notification_status, now(), $1
           FROM (VALUES ('plant_tip', 'sent'), ('soil_alert', 'pending'),
                        ('watering_reminder', 'sent'), ('daily_tip', 'pending')) v(t, s)`,
          [userId]
        )
        before = (await client.query<Row>(seeded, [userId])).rows
        await client.query(await readFile(migration, 'utf8'))
        after = (await client.query<Row>(seeded, [userId])).rows
        const format = await client.query<{ type: string }>(
          `SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute
           WHERE attrelid = 'notifications'::regclass AND attname = 'type'`
        )
        column = format.rows[0]?.type ?? ''
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })

    afterAll(async () => {
      await pool.end()
    })

    const byType = (rows: ReadonlyArray<Row>, type: string) =>
      rows.filter((row) => row.type === type)

    it('moves the retired plant_tip rows to daily_tip', () => {
      const [plantTip] = byType(before, 'plant_tip')
      expect(after.find((row) => row.id === plantTip?.id)?.type).toBe(
        'daily_tip'
      )
      expect(byType(after, 'plant_tip')).toEqual([])
    })

    it('deletes the rows whose type is not a topic', () => {
      const [soilAlert] = byType(before, 'soil_alert')
      expect(soilAlert).toBeDefined()
      expect(after.find((row) => row.id === soilAlert?.id)).toBeUndefined()
      expect(after).toHaveLength(before.length - 1)
    })

    it('leaves the rows that already had a topic unchanged', () => {
      const valid = before.filter(
        (row) => row.type !== 'plant_tip' && row.type !== 'soil_alert'
      )
      expect(valid).toHaveLength(2)
      expect(after.filter((row) => valid.some((v) => v.id === row.id))).toEqual(
        valid
      )
    })

    it('converts the column to the enum', () => {
      expect(column).toBe('notification_type')
    })
  }
)
