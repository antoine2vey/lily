import type {
  NotificationRow,
  SentNotification,
} from '@lily/api/repositories/notification.repository'
import {
  buildCareDigestContent,
  buildGroupedPlantAnniversaryContent,
  type NotificationContent,
  renderFromParams,
  type SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations'
import type { LanguageCode } from '@lily/shared'
import {
  type DeferredCareType,
  type NotificationTopic,
  TOPIC_CATEGORY,
} from '@lily/shared/server'
import { Array, Filter, Option, pipe, Record, Result } from 'effect'

const isCareTopic = (topic: NotificationTopic): topic is DeferredCareType =>
  TOPIC_CATEGORY[topic] === 'care'

export const recipientLanguage = (
  users: ReadonlyArray<{
    readonly id: string
    readonly language: LanguageCode
  }>,
  userId: string
): LanguageCode =>
  pipe(
    Array.findFirst(users, (user) => user.id === userId),
    Option.map((user) => user.language),
    Option.getOrElse(() => 'en' as const)
  )

export interface Rendered {
  readonly push: NotificationContent
  readonly sent: ReadonlyArray<SentNotification>
}

type PlantName = { readonly plantId: string; readonly plantName: string }

const isSimpleTopic = (
  topic: NotificationTopic
): topic is SimpleNotificationType => !isCareTopic(topic)

const storedContent = (row: NotificationRow): NotificationContent => ({
  title: Option.getOrElse(Option.fromNullishOr(row.title), () => ''),
  body: Option.getOrElse(Option.fromNullishOr(row.body), () => ''),
})

const rowContent = (
  row: NotificationRow & { readonly type: SimpleNotificationType },
  named: Option.Option<PlantName>,
  language: LanguageCode
) =>
  row.params === undefined
    ? Result.succeed(storedContent(row))
    : renderFromParams(
        row.type,
        row.params,
        Option.map(named, (plant) => plant.plantName),
        language
      )

const renderCare = (
  rows: ReadonlyArray<NotificationRow>,
  nameOf: (row: NotificationRow) => Option.Option<PlantName>,
  language: LanguageCode
): Option.Option<Rendered> => {
  const items = pipe(
    Array.filterMap(
      rows,
      Filter.fromPredicateOption((row) => {
        const careType = row.type
        if (!isCareTopic(careType)) return Option.none()
        return Option.map(nameOf(row), (plant) => ({ ...plant, careType }))
      })
    ),
    Array.groupBy((item) => item.plantId),
    Record.values,
    Array.map((group) => ({
      plantName: Array.headNonEmpty(group).plantName,
      careTypes: Array.map(group, (item) => item.careType),
    }))
  )
  return Option.map(
    Array.match(items, {
      onEmpty: () => Option.none(),
      onNonEmpty: (nonEmpty) =>
        Option.some(buildCareDigestContent(nonEmpty, language)),
    }),
    (push) => ({
      push,
      sent: Array.map(rows, (row) => ({ id: row.id, ...push })),
    })
  )
}

const renderSimple = (
  topic: NotificationTopic,
  rows: ReadonlyArray<NotificationRow>,
  nameOf: (row: NotificationRow) => Option.Option<PlantName>,
  language: LanguageCode
) => {
  const attempts = Array.map(rows, (row) => {
    const type = row.type
    const result: Result.Result<NotificationContent, unknown> = isSimpleTopic(
      type
    )
      ? rowContent({ ...row, type }, nameOf(row), language)
      : Result.failVoid
    return { row, result }
  })
  const rendered = Array.map(attempts, ({ row, result }) => ({
    row,
    content: Result.getOrElse(result, () => storedContent(row)),
  }))
  const push = Array.match(rendered, {
    onEmpty: () => Option.none<NotificationContent>(),
    onNonEmpty: (nonEmpty) =>
      Option.some(
        topic === 'plant_anniversary' && nonEmpty.length > 1
          ? buildGroupedPlantAnniversaryContent(
              Array.filterMap(
                nonEmpty,
                Filter.fromPredicateOption(({ row }) =>
                  Option.map(nameOf(row), (plant) => plant.plantName)
                )
              ),
              language
            )
          : Array.headNonEmpty(nonEmpty).content
      ),
  })
  return {
    unrenderedIds: Array.map(
      Array.filter(attempts, ({ result }) => Result.isFailure(result)),
      ({ row }) => row.id
    ),
    rendered: Option.map(
      push,
      (content): Rendered => ({
        push: content,
        sent: Array.map(rendered, ({ row, content }) => ({
          id: row.id,
          ...content,
        })),
      })
    ),
  }
}

export const renderDelivery = (
  topic: NotificationTopic,
  rows: ReadonlyArray<NotificationRow>,
  plants: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  language: LanguageCode
) => {
  const names = new Map(Array.map(plants, (plant) => [plant.id, plant.name]))
  const nameOf = (row: NotificationRow): Option.Option<PlantName> =>
    pipe(
      Option.fromNullishOr(row.plantId),
      Option.flatMap((plantId) =>
        Option.map(Option.fromNullishOr(names.get(plantId)), (plantName) => ({
          plantId,
          plantName,
        }))
      )
    )
  return isCareTopic(topic)
    ? { unrenderedIds: [], rendered: renderCare(rows, nameOf, language) }
    : renderSimple(topic, rows, nameOf, language)
}
