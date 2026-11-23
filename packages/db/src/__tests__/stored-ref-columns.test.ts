import { isStoredRefColumn, JSON_REF_HOLDERS } from '@lily/db/schema/stored-ref'
import { SCHEMA_COLUMNS, type SchemaColumn } from '@lily/db/schema-columns'
import { Array, Record } from 'effect'
import { describe, expect, it } from 'vitest'

const NAMED_LIKE_A_REF =
  /url|uri|image|photo|picture|avatar|thumbnail|icon|logo|banner|cover|media|file|attachment|_key$/

/** The columns the rules below flag that never hold a stored object, and why. */
const NOT_STORED_REFS: Record<string, string> = {
  'analytics_daily_snapshots.metric_key': 'the name of a metric',
  'analytics_daily_snapshots.value': 'the value of a metric',
  'blog_posts.title': 'localized text',
  'blog_posts.sources': 'links to the outside articles a post cites',
  'blog_posts.content': 'localized text',
  'blog_posts.commit_shas': 'git commit ids by locale',
  'chat_follow_up_sets.follow_ups': 'suggested questions, as text',
  'daily_tips.title': 'localized text',
  'daily_tips.body': 'localized text',
  'dead_letter_messages.payload': 'a queue message, which names rows by id',
  'diagnoses.symptoms': 'text',
  'diagnoses.treatment_steps': 'text',
  'diagnoses.prevention_tips': 'text',
  'notifications.metadata': 'the topic metadata, which names rows by id',
  'notifications.params': 'the values a notification text interpolates',
  'oauth_authorization_codes.redirect_uri': 'a URL on the OAuth client',
  'oauth_clients.client_uri': 'the home page the OAuth client registers',
  'oauth_clients.logo_uri': 'a logo the OAuth client hosts and registers',
  'oauth_clients.redirect_uris': 'URLs on the OAuth client',
  'outbox.event': 'a domain event, which names rows by id',
  'rooms.icon': 'an emoji',
  'users.public_profile': 'a flag',
  'weather_snapshots.cloud_cover': 'a cloud cover reading',
}

const nameOf = ({ table, column }: SchemaColumn) => `${table}.${column.name}`
const isJson = ({ column }: SchemaColumn) =>
  column.getSQLType() === 'json' || column.getSQLType() === 'jsonb'
const namedLikeARef = ({ column }: SchemaColumn) =>
  NAMED_LIKE_A_REF.test(column.name)
const jsonHolders = Array.map(
  JSON_REF_HOLDERS,
  ({ table, column }) => `${table}.${column}`
)
const allowlisted = (column: SchemaColumn) =>
  Record.has(NOT_STORED_REFS, nameOf(column))

const unclassified = (columns: ReadonlyArray<SchemaColumn>) => [
  ...Array.map(
    Array.filter(
      columns,
      (c) =>
        namedLikeARef(c) &&
        !isJson(c) &&
        !isStoredRefColumn(c.column) &&
        !allowlisted(c)
    ),
    (c) =>
      `${nameOf(c)}: its name says it may hold a stored object. Declare it with storedRef() from packages/db/src/schema/stored-ref.ts, or add it to NOT_STORED_REFS in this test with the reason it never holds one.`
  ),
  ...Array.map(
    Array.filter(
      columns,
      (c) =>
        isJson(c) && !Array.contains(jsonHolders, nameOf(c)) && !allowlisted(c)
    ),
    (c) =>
      `${nameOf(c)}: a json document may hold stored-object references. Add it to JSON_REF_HOLDERS in packages/db/src/schema/stored-ref.ts with the JSON path of those references, or to NOT_STORED_REFS in this test with the reason it holds none.`
  ),
]

describe('stored-object reference columns', () => {
  it('classifies every column that may hold a stored object', () => {
    expect(unclassified(SCHEMA_COLUMNS)).toEqual([])
  })

  it('reads the file parts of chat messages as a jsonb holder', () => {
    expect(jsonHolders).toContain('chat_messages.parts')
  })

  it('lists only jsonb columns of the schema as jsonb holders', () => {
    const jsonColumns = Array.map(Array.filter(SCHEMA_COLUMNS, isJson), nameOf)

    expect(Array.difference(jsonHolders, jsonColumns)).toEqual([])
  })

  it('allowlists only columns the rules flag and storedRef() does not mark', () => {
    const flagged = Array.map(
      Array.filter(
        SCHEMA_COLUMNS,
        (c) =>
          (namedLikeARef(c) || isJson(c)) &&
          !isStoredRefColumn(c.column) &&
          !Array.contains(jsonHolders, nameOf(c))
      ),
      nameOf
    )

    expect(Array.difference(Record.keys(NOT_STORED_REFS), flagged)).toEqual([])
  })
})
