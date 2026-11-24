import type {
  Language,
  NotificationContent,
} from '@lily/api/services/notification-scheduler/translations/catalog'
import { en } from '@lily/api/services/notification-scheduler/translations/en'
import { fr } from '@lily/api/services/notification-scheduler/translations/fr'
import {
  LEGACY_PARAMS,
  type LegacyTopic,
  NOTIFICATION_PARAMS,
  type ParamsOf,
  type SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations/params'
import type { LanguageCode } from '@lily/shared'
import { Option, Result, Schema } from 'effect'

export type { NotificationContent } from '@lily/api/services/notification-scheduler/translations/catalog'
export type {
  ParamsOf,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations/params'

const LANGUAGES: Record<LanguageCode, Language> = { en, fr }

export const buildSimpleContent = <T extends SimpleNotificationType>(
  type: T,
  params: ParamsOf<T>,
  language: LanguageCode
): NotificationContent => LANGUAGES[language].topics[type](params)

export const buildGroupedPlantAnniversaryContent = (
  plantNames: ReadonlyArray<string>,
  language: LanguageCode
): NotificationContent => LANGUAGES[language].anniversaries(plantNames)

const isLegacyTopic = (type: SimpleNotificationType): type is LegacyTopic =>
  type in LEGACY_PARAMS

// The plant's current name wins over the one stored, so a rename shows.
const named = <P>(params: P, plantName: Option.Option<string>): P =>
  Option.match(plantName, {
    onNone: () => params,
    onSome: (name) => ({ ...params, plantName: name }),
  })

const renderLegacy = <T extends LegacyTopic>(
  type: T,
  params: unknown,
  plantName: Option.Option<string>,
  language: LanguageCode
): Result.Result<NotificationContent, Schema.SchemaError> =>
  Result.map(
    Schema.decodeUnknownResult(LEGACY_PARAMS[type])(params),
    (decoded) => LANGUAGES[language].legacy[type](named(decoded, plantName))
  )

/** Renders a stored row's params in the recipient's language at delivery. */
export const renderFromParams = <T extends SimpleNotificationType>(
  type: T,
  params: unknown,
  plantName: Option.Option<string>,
  language: LanguageCode
): Result.Result<NotificationContent, Schema.SchemaError> =>
  Result.orElse(
    Result.map(
      Schema.decodeUnknownResult(NOTIFICATION_PARAMS[type])(params),
      (decoded) => buildSimpleContent(type, named(decoded, plantName), language)
    ),
    (error) =>
      isLegacyTopic(type)
        ? renderLegacy(type, params, plantName, language)
        : Result.fail(error)
  )
