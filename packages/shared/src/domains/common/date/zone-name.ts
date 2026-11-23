import {
  Array,
  String as EffectString,
  identity,
  Option,
  Record,
  Schema,
  SchemaTransformation,
} from 'effect'

import {
  CANONICAL_TIME_ZONES,
  TIME_ZONE_ALIASES,
} from '../../notification/time-zones.generated'

const canonicalZones: ReadonlySet<string> = new Set(CANONICAL_TIME_ZONES)

const zoneOfFoldedName: ReadonlyMap<string, string> = new Map([
  ...Array.map(CANONICAL_TIME_ZONES, (zone): readonly [string, string] => [
    EffectString.toLowerCase(zone),
    zone,
  ]),
  ...Array.map(
    Record.toEntries(TIME_ZONE_ALIASES),
    ([alias, zone]): readonly [string, string] => [
      EffectString.toLowerCase(alias),
      zone,
    ]
  ),
])

const CanonicalZone = Schema.String.check(
  Schema.makeFilter(
    (zone) => canonicalZones.has(zone) || 'a canonical IANA time zone',
    { identifier: 'ZoneName' }
  )
).pipe(Schema.brand('ZoneName'))

/**
 * A canonical IANA zone name, the form stored in `users.timezone` and
 * `canopies.timezone`: a tzdata `Zone` line or a zone `zone.tab` lists.
 * Decoding ignores case and maps a renamed or legacy name such as `Eire` or
 * `PST8PDT` to its zone (`Europe/Dublin`, `America/Los_Angeles`). It fails on
 * any other name, such as an offset. A stored zone stays canonical so day math
 * does not depend on whichever tzdata build a runtime ships.
 */
export const ZoneName = Schema.String.pipe(
  Schema.decodeTo(
    CanonicalZone,
    SchemaTransformation.transform({
      decode: (name: string) =>
        Option.getOrElse(
          Option.fromNullishOr(
            zoneOfFoldedName.get(EffectString.toLowerCase(name))
          ),
          () => name
        ),
      encode: identity,
    })
  )
)

export type ZoneName = typeof ZoneName.Type

/**
 * The zone of an account or Canopy that has none stored or stores a name
 * `ZoneName` rejects, such as an offset: the `users.timezone` column default.
 */
export const DEFAULT_ZONE: ZoneName = ZoneName.make('UTC')

/** `ZoneName` of `name`, or `DEFAULT_ZONE` for a name it rejects. */
export const zoneNameOrDefault = (name: string): ZoneName =>
  Option.getOrElse(Schema.decodeOption(ZoneName)(name), () => DEFAULT_ZONE)

/**
 * A zone name read back from storage, as the api returns it: `ZoneName`, or
 * `DEFAULT_ZONE` for a name it rejects. An app build can run against an api
 * that still returns a stored name unchanged.
 */
export const StoredZoneName = Schema.String.pipe(
  Schema.decodeTo(
    CanonicalZone,
    SchemaTransformation.transform({
      decode: (name: string): string => zoneNameOrDefault(name),
      encode: identity,
    })
  )
)
