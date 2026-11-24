import {
  joinClauses,
  listNames,
  type NotificationContent,
} from '@lily/api/services/notification-scheduler/translations/catalog'
import type { LanguageCode } from '@lily/shared'
import type { DeferredCareType } from '@lily/shared/server'
import { Array, Option, Order, pipe, String } from 'effect'

type CareTranslations = {
  readonly singleTitle: (plantName: string) => string
  readonly singleBody: (plantName: string) => string
  readonly pluralTitle: (count: number) => string
  readonly andMore: (count: number) => string
}

type TranslationMap = Record<DeferredCareType, CareTranslations>

// English names plants possessively ("your Monstera"); French uses tutoiement
// and "ta <name>". Plural titles carry no possessive (the body lists names).
const translations: Record<LanguageCode, TranslationMap> = {
  en: {
    watering_reminder: {
      singleTitle: (name) => `💧 Your ${name} is thirsty`,
      singleBody: (name) => `Time to give your ${name} a drink today.`,
      pluralTitle: (count) => `💧 ${count} plants are thirsty`,
      andMore: (count) => `and ${count} more`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `🌿 Feed your ${name} today`,
      singleBody: (name) => `Your ${name} is ready for a little fertilizer.`,
      pluralTitle: (count) => `🌿 ${count} plants are hungry`,
      andMore: (count) => `and ${count} more`,
    },
    misting_reminder: {
      singleTitle: (name) => `🌫️ Your ${name} loves a misting`,
      singleBody: (name) => `Give your ${name} a refreshing mist today.`,
      pluralTitle: (count) => `🌫️ ${count} plants want a misting`,
      andMore: (count) => `and ${count} more`,
    },
    repotting_reminder: {
      singleTitle: (name) => `🪴 Your ${name} needs more room`,
      singleBody: (name) => `Your ${name} is ready for a bigger pot.`,
      pluralTitle: (count) => `🪴 ${count} plants are ready to repot`,
      andMore: (count) => `and ${count} more`,
    },
    overdue_reminder: {
      singleTitle: (name) => `⚠️ Your ${name} needs you`,
      singleBody: (name) => `Your ${name} is overdue for care — don't forget!`,
      pluralTitle: (count) => `⚠️ ${count} plants need your attention`,
      andMore: (count) => `and ${count} more`,
    },
  },
  fr: {
    watering_reminder: {
      singleTitle: (name) => `💧 Ta ${name} a soif`,
      singleBody: (name) => `Offre un peu d'eau à ta ${name} aujourd'hui.`,
      pluralTitle: (count) => `💧 ${count} plantes ont soif`,
      andMore: (count) => `et ${count} de plus`,
    },
    fertilization_reminder: {
      singleTitle: (name) => `🌿 Nourris ta ${name} aujourd'hui`,
      singleBody: (name) => `Ta ${name} a besoin d'un peu d'engrais.`,
      pluralTitle: (count) => `🌿 ${count} plantes ont faim`,
      andMore: (count) => `et ${count} de plus`,
    },
    misting_reminder: {
      singleTitle: (name) => `🌫️ Ta ${name} adore la brume`,
      singleBody: (name) => `Offre une brumisation à ta ${name} aujourd'hui.`,
      pluralTitle: (count) => `🌫️ ${count} plantes réclament une brumisation`,
      andMore: (count) => `et ${count} de plus`,
    },
    repotting_reminder: {
      singleTitle: (name) => `🪴 Ta ${name} a besoin de place`,
      singleBody: (name) => `Ta ${name} a besoin d'un pot plus grand.`,
      pluralTitle: (count) => `🪴 ${count} plantes sont à rempoter`,
      andMore: (count) => `et ${count} de plus`,
    },
    overdue_reminder: {
      singleTitle: (name) => `⚠️ Ta ${name} te réclame`,
      singleBody: (name) =>
        `Ta ${name} est en retard de soins — n'oublie pas !`,
      pluralTitle: (count) => `⚠️ ${count} plantes réclament ton attention`,
      andMore: (count) => `et ${count} de plus`,
    },
  },
}

export const buildNotificationContent = (
  type: DeferredCareType,
  plantNames: readonly string[],
  language: LanguageCode
): NotificationContent => {
  const t = translations[language][type]
  const count = plantNames.length

  if (count === 1) {
    return Option.match(Array.head(plantNames), {
      onNone: () => ({ title: t.pluralTitle(1), body: '' }),
      onSome: (name) => ({
        title: t.singleTitle(name),
        body: t.singleBody(name),
      }),
    })
  }

  return { title: t.pluralTitle(count), body: listNames(plantNames, t.andMore) }
}

// Care digest: one push per user per delivery batch. The scheduler merges
// every due care reminder for a user (across plants and care types) into a
// single banner. When only one care type is present the per-type wording
// above is reused verbatim; the digest wording only kicks in for mixed types.

// Fixed ordering for both the label list inside a plant and the topic chosen
// for the merged queue message. Overdue first: it is the most urgent signal.
const CARE_TOPIC_PRIORITY = [
  'overdue_reminder',
  'watering_reminder',
  'fertilization_reminder',
  'misting_reminder',
  'repotting_reminder',
] as const satisfies Array.NonEmptyReadonlyArray<DeferredCareType>

const careTopicRank = (type: DeferredCareType): number =>
  Option.getOrElse(
    Array.findFirstIndex(CARE_TOPIC_PRIORITY, (t) => t === type),
    () => CARE_TOPIC_PRIORITY.length
  )

const careTopicOrder: Order.Order<DeferredCareType> = Order.mapInput(
  Order.Number,
  careTopicRank
)

export const pickDominantCareTopic = (
  types: Array.NonEmptyReadonlyArray<DeferredCareType>
): DeferredCareType => Array.min(types, careTopicOrder)

export interface CareDigestItem {
  readonly plantName: string
  readonly careTypes: Array.NonEmptyReadonlyArray<DeferredCareType>
}

type CareDigestTranslations = {
  readonly label: Record<DeferredCareType, string>
  readonly singleTitle: (plantName: string) => string
  readonly singleBody: (labels: ReadonlyArray<string>) => string
  readonly pluralTitle: (count: number) => string
  readonly andMore: (count: number) => string
}

const careDigest: Record<LanguageCode, CareDigestTranslations> = {
  en: {
    label: {
      overdue_reminder: 'overdue',
      watering_reminder: 'watering',
      fertilization_reminder: 'fertilizing',
      misting_reminder: 'misting',
      repotting_reminder: 'repotting',
    },
    singleTitle: (name) => `🌱 Your ${name} needs care today`,
    singleBody: (labels) =>
      `${String.capitalize(joinLabels(labels, 'and', true))} are due today.`,
    pluralTitle: (count) => `🌱 ${count} plants need care today`,
    andMore: (count) => `and ${count} more`,
  },
  fr: {
    label: {
      overdue_reminder: 'en retard',
      watering_reminder: 'arrosage',
      fertilization_reminder: 'fertilisation',
      misting_reminder: 'brumisation',
      repotting_reminder: 'rempotage',
    },
    singleTitle: (name) => `🌱 Ta ${name} a besoin de soins`,
    singleBody: (labels) =>
      `${String.capitalize(joinLabels(labels, 'et', false))} sont prévus aujourd'hui.`,
    pluralTitle: (count) =>
      `🌱 ${count} plantes ont besoin de soins aujourd'hui`,
    andMore: (count) => `et ${count} de plus`,
  },
}

// `joinClauses` handles 2–3 parts; four or more labels fall back to a plain
// comma list so the sentence stays readable.
const joinLabels = (
  labels: ReadonlyArray<string>,
  conjunction: string,
  oxford: boolean
): string =>
  labels.length <= 3
    ? joinClauses(labels, conjunction, oxford)
    : Array.join(labels, ', ')

const sortedLabels = (
  types: Array.NonEmptyReadonlyArray<DeferredCareType>,
  t: CareDigestTranslations
): ReadonlyArray<string> =>
  pipe(
    Array.dedupe(types),
    Array.sort(careTopicOrder),
    Array.map((type) => t.label[type])
  )

export const buildCareDigestContent = (
  items: Array.NonEmptyReadonlyArray<CareDigestItem>,
  language: LanguageCode
): NotificationContent => {
  const distinctTypes = pipe(
    Array.flatMap(items, (i) => i.careTypes),
    Array.dedupe
  )

  // Single care type across the batch → keep the established per-type copy.
  if (distinctTypes.length === 1) {
    const type = Array.headNonEmpty(items).careTypes[0]
    return buildNotificationContent(
      type,
      Array.map(items, (i) => i.plantName),
      language
    )
  }

  const t = careDigest[language]

  if (items.length === 1) {
    const item = Array.headNonEmpty(items)
    return {
      title: t.singleTitle(item.plantName),
      body: t.singleBody(sortedLabels(item.careTypes, t)),
    }
  }

  const entries = Array.map(
    items,
    (i) => `${i.plantName} (${Array.join(sortedLabels(i.careTypes, t), ', ')})`
  )
  return {
    title: t.pluralTitle(items.length),
    body: listNames(entries, t.andMore),
  }
}
