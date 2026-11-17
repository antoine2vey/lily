import type { Locale } from '@/i18n'

export interface City {
  readonly id: string
  readonly latitude: number
  readonly names: Readonly<Record<Locale, string>>
}

// Latitudes from the GeoNames cities15000 dump (download.geonames.org/export/dump), rounded to 2 decimals.
export const CITIES = [
  { id: 'paris', latitude: 48.85, names: { en: 'Paris', fr: 'Paris' } },
  { id: 'lyon', latitude: 45.75, names: { en: 'Lyon', fr: 'Lyon' } },
  {
    id: 'marseille',
    latitude: 43.3,
    names: { en: 'Marseille', fr: 'Marseille' },
  },
  { id: 'toulouse', latitude: 43.6, names: { en: 'Toulouse', fr: 'Toulouse' } },
  {
    id: 'bordeaux',
    latitude: 44.84,
    names: { en: 'Bordeaux', fr: 'Bordeaux' },
  },
  { id: 'lille', latitude: 50.63, names: { en: 'Lille', fr: 'Lille' } },
  { id: 'nantes', latitude: 47.22, names: { en: 'Nantes', fr: 'Nantes' } },
  {
    id: 'strasbourg',
    latitude: 48.58,
    names: { en: 'Strasbourg', fr: 'Strasbourg' },
  },
  { id: 'nice', latitude: 43.7, names: { en: 'Nice', fr: 'Nice' } },
  {
    id: 'brussels',
    latitude: 50.85,
    names: { en: 'Brussels', fr: 'Bruxelles' },
  },
  { id: 'liege', latitude: 50.63, names: { en: 'Liège', fr: 'Liège' } },
  { id: 'geneva', latitude: 46.2, names: { en: 'Geneva', fr: 'Genève' } },
  { id: 'zurich', latitude: 47.37, names: { en: 'Zurich', fr: 'Zurich' } },
  {
    id: 'lausanne',
    latitude: 46.52,
    names: { en: 'Lausanne', fr: 'Lausanne' },
  },
  {
    id: 'montreal',
    latitude: 45.51,
    names: { en: 'Montreal', fr: 'Montréal' },
  },
  {
    id: 'quebec-city',
    latitude: 46.81,
    names: { en: 'Quebec City', fr: 'Québec' },
  },
  { id: 'london', latitude: 51.51, names: { en: 'London', fr: 'Londres' } },
  {
    id: 'manchester',
    latitude: 53.48,
    names: { en: 'Manchester', fr: 'Manchester' },
  },
  {
    id: 'edinburgh',
    latitude: 55.95,
    names: { en: 'Edinburgh', fr: 'Édimbourg' },
  },
  { id: 'dublin', latitude: 53.33, names: { en: 'Dublin', fr: 'Dublin' } },
  {
    id: 'new-york',
    latitude: 40.71,
    names: { en: 'New York', fr: 'New York' },
  },
  {
    id: 'los-angeles',
    latitude: 34.05,
    names: { en: 'Los Angeles', fr: 'Los Angeles' },
  },
  { id: 'chicago', latitude: 41.85, names: { en: 'Chicago', fr: 'Chicago' } },
  { id: 'seattle', latitude: 47.61, names: { en: 'Seattle', fr: 'Seattle' } },
  { id: 'miami', latitude: 25.77, names: { en: 'Miami', fr: 'Miami' } },
  { id: 'houston', latitude: 29.76, names: { en: 'Houston', fr: 'Houston' } },
  { id: 'denver', latitude: 39.74, names: { en: 'Denver', fr: 'Denver' } },
  { id: 'toronto', latitude: 43.65, names: { en: 'Toronto', fr: 'Toronto' } },
  {
    id: 'vancouver',
    latitude: 49.25,
    names: { en: 'Vancouver', fr: 'Vancouver' },
  },
  { id: 'calgary', latitude: 51.05, names: { en: 'Calgary', fr: 'Calgary' } },
  { id: 'sydney', latitude: -33.87, names: { en: 'Sydney', fr: 'Sydney' } },
  {
    id: 'melbourne',
    latitude: -37.81,
    names: { en: 'Melbourne', fr: 'Melbourne' },
  },
  {
    id: 'brisbane',
    latitude: -27.47,
    names: { en: 'Brisbane', fr: 'Brisbane' },
  },
  { id: 'perth', latitude: -31.95, names: { en: 'Perth', fr: 'Perth' } },
  {
    id: 'auckland',
    latitude: -36.85,
    names: { en: 'Auckland', fr: 'Auckland' },
  },
  {
    id: 'wellington',
    latitude: -41.29,
    names: { en: 'Wellington', fr: 'Wellington' },
  },
  { id: 'tokyo', latitude: 35.69, names: { en: 'Tokyo', fr: 'Tokyo' } },
  {
    id: 'singapore',
    latitude: 1.29,
    names: { en: 'Singapore', fr: 'Singapour' },
  },
  {
    id: 'sao-paulo',
    latitude: -23.55,
    names: { en: 'São Paulo', fr: 'São Paulo' },
  },
  {
    id: 'buenos-aires',
    latitude: -34.61,
    names: { en: 'Buenos Aires', fr: 'Buenos Aires' },
  },
  {
    id: 'cape-town',
    latitude: -33.93,
    names: { en: 'Cape Town', fr: 'Le Cap' },
  },
] as const satisfies ReadonlyArray<City>

export type CityId = (typeof CITIES)[number]['id']
