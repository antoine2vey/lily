import type {
  ChatStarterPlant,
  CreateConversationRequest,
} from '@lily/shared/ai-chat'
import { Array, Match, Option, pipe } from 'effect'

export type NewChatTarget =
  | { readonly kind: 'general' }
  | { readonly kind: 'plant'; readonly plantId: string; readonly name: string }

export const GENERAL_TARGET: NewChatTarget = { kind: 'general' }

export const newConversationPayload = (
  target: NewChatTarget
): CreateConversationRequest =>
  Match.value(target).pipe(
    Match.when({ kind: 'general' }, () => ({ kind: 'general' as const })),
    Match.when({ kind: 'plant' }, ({ plantId }) => ({
      kind: 'plant' as const,
      plantId,
    })),
    Match.exhaustive
  )

export interface CarouselItem {
  readonly target: NewChatTarget
  readonly imageUrl: string | undefined
}

export const carouselItems = (
  plants: ReadonlyArray<ChatStarterPlant>
): ReadonlyArray<CarouselItem> => [
  { target: GENERAL_TARGET, imageUrl: undefined },
  ...Array.map(plants, (plant) => ({
    target: {
      kind: 'plant' as const,
      plantId: plant.plantId,
      name: plant.name,
    },
    imageUrl: plant.imageUrl,
  })),
]

export const targetKey = (target: NewChatTarget): string =>
  target.kind === 'plant' ? target.plantId : 'general'

export const carouselNeighbours = (
  plants: ReadonlyArray<ChatStarterPlant>,
  selected: NewChatTarget
): ReadonlyArray<string> => {
  const targets = Array.map(carouselItems(plants), (item) => item.target)
  return pipe(
    Array.findFirstIndex(
      targets,
      (target) => targetKey(target) === targetKey(selected)
    ),
    Option.match({
      onNone: () => [],
      onSome: (index) =>
        Array.getSomes([
          Array.get(targets, index - 1),
          Array.get(targets, index + 1),
        ]),
    }),
    Array.flatMap((target) => (target.kind === 'plant' ? [target.plantId] : []))
  )
}

export type ChipsSubject =
  | { readonly kind: 'general' }
  | { readonly kind: 'plant'; readonly plantId: string }

const subjectOfPlant = (plantId: string | undefined): ChipsSubject =>
  plantId === undefined ? { kind: 'general' } : { kind: 'plant', plantId }

export const chipsSubjectOf = (chat: {
  readonly target: NewChatTarget
  readonly conversation: Option.Option<{
    readonly plantId?: string | undefined
  }>
  readonly isOpened: boolean
  readonly loadedHistoryIsEmpty: boolean
}): Option.Option<ChipsSubject> =>
  chat.isOpened
    ? pipe(
        chat.conversation,
        Option.filter(() => chat.loadedHistoryIsEmpty),
        Option.map(({ plantId }) => subjectOfPlant(plantId))
      )
    : Option.some(
        subjectOfPlant(
          chat.target.kind === 'plant' ? chat.target.plantId : undefined
        )
      )
