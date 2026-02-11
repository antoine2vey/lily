import {
  doublePrecision,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const weatherSnapshots = pgTable(
  'weather_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    date: text('date').notNull(),
    temperatureMin: doublePrecision('temperature_min'),
    temperatureMax: doublePrecision('temperature_max'),
    temperatureMean: doublePrecision('temperature_mean'),
    humidity: doublePrecision('humidity'),
    windSpeed: doublePrecision('wind_speed'),
    precipitation: doublePrecision('precipitation'),
    solarRadiation: doublePrecision('solar_radiation'),
    et0: doublePrecision('et0'),
    cloudCover: doublePrecision('cloud_cover'),
    soilTemperature: doublePrecision('soil_temperature'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('weather_snapshots_location_date_idx').on(
      table.latitude,
      table.longitude,
      table.date
    ),
  ]
)
