import type { CareType, LanguageCode } from '@lily/shared'
import { Array, Option } from 'effect'

// The Live Activity widget is a pure render layer with no access to i18next.
// We pre-render `headline` and `subheadline` here and ship them in the
// ContentState.

type LiveActivityCareLabels = Record<CareType, (count: number) => string>

const liveActivityLabels: Record<LanguageCode, LiveActivityCareLabels> = {
  en: {
    watering: (n) => `${n} to water`,
    fertilization: (n) => `${n} to fertilize`,
    misting: (n) => `${n} to mist`,
    repotting: (n) => `${n} to repot`,
  },
  fr: {
    watering: (n) => `${n} à arroser`,
    fertilization: (n) => `${n} à fertiliser`,
    misting: (n) => `${n} à brumiser`,
    repotting: (n) => `${n} à rempoter`,
  },
}

const liveActivityHeadline: Record<
  LanguageCode,
  (totalPlants: number) => string
> = {
  en: (n) =>
    n === 1 ? '1 plant needs care today' : `${n} plants need care today`,
  fr: (n) =>
    n === 1
      ? "1 plante a besoin de soins aujourd'hui"
      : `${n} plantes ont besoin de soins aujourd'hui`,
}

export const buildLiveActivityHeadline = (
  totalPlants: number,
  language: LanguageCode
): string => liveActivityHeadline[language](totalPlants)

// Pool of punchy generic titles for the bold first line of the lock-screen
// activity. The muted headline below carries the precise count, so these stay
// human-warm rather than functional. Callers pass a day-stable `seed` (see
// buildContentState) so the title rotates day to day without flickering
// between mid-day activity updates.
const liveActivityTitles: Record<
  LanguageCode,
  Array.NonEmptyReadonlyArray<string>
> = {
  en: Array.make(
    'Quick care today',
    'A little plant love',
    'Tend your jungle',
    'Your green to-do',
    'Plant care time',
    'Your plants need you'
  ),
  fr: Array.make(
    'Petit soin du jour',
    "Un peu d'amour vert",
    'Ton moment jardinage',
    "C'est l'heure des soins",
    'Chouchoute tes plantes',
    "Tes plantes t'attendent"
  ),
}

// `seed` picks a title deterministically — pass a day-stable value so the
// lock-screen title rotates daily but never changes mid-update. Defaults to
// the first entry when no seed is supplied.
export const buildLiveActivityTitle = (
  language: LanguageCode,
  seed = 0
): string => {
  const titles = liveActivityTitles[language]
  const index = Math.abs(seed) % titles.length
  return Option.getOrElse(Array.get(titles, index), () =>
    Array.headNonEmpty(titles)
  )
}

// Short verb shown under each care-type badge in the hero row.
const liveActivityCareTypeLabel: Record<
  LanguageCode,
  Record<CareType, string>
> = {
  en: {
    watering: 'Water',
    fertilization: 'Fertilize',
    misting: 'Mist',
    repotting: 'Repot',
  },
  fr: {
    watering: 'Arroser',
    fertilization: 'Fertiliser',
    misting: 'Brumiser',
    repotting: 'Rempoter',
  },
}

export const buildLiveActivityCareTypeLabel = (
  careType: CareType,
  language: LanguageCode
): string => liveActivityCareTypeLabel[language][careType]

export const buildLiveActivitySubheadline = (
  groups: readonly { careType: CareType; count: number }[],
  language: LanguageCode
): string | undefined => {
  if (Array.isReadonlyArrayEmpty(groups)) return undefined
  const labels = liveActivityLabels[language]
  return Array.join(
    Array.map(groups, (g) => labels[g.careType](g.count)),
    ' · '
  )
}
