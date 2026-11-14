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

export type ChatHistory = 'loading' | 'empty' | 'written'

export const historyOf = (
  loaded: ReadonlyArray<unknown> | undefined
): ChatHistory =>
  loaded === undefined
    ? 'loading'
    : Array.isReadonlyArrayEmpty(loaded)
      ? 'empty'
      : 'written'

export type Chips =
  | { readonly kind: 'none' }
  | { readonly kind: 'starter'; readonly subject: ChipsSubject }
  | { readonly kind: 'followUp'; readonly plantId: string }

const NO_CHIPS: Chips = { kind: 'none' }

const starterFor = (plantId: string | undefined): Chips => ({
  kind: 'starter',
  subject: subjectOfPlant(plantId),
})

export const chipsOf = (chat: {
  readonly target: NewChatTarget
  readonly conversation: Option.Option<{
    readonly id: string
    readonly plantId?: string | undefined
  }>
  readonly isOpened: boolean
  readonly history: ChatHistory
  readonly isReplying: boolean
  readonly isVisiting: boolean
  readonly sentIn: ReadonlyArray<string>
}): Chips =>
  !chat.isVisiting
    ? NO_CHIPS
    : chat.isOpened
      ? pipe(
          chat.conversation,
          Option.filter(
            ({ id }) => !chat.isReplying && !Array.contains(chat.sentIn, id)
          ),
          Option.map(({ plantId }) =>
            Match.value(chat.history).pipe(
              Match.when('loading', () => NO_CHIPS),
              Match.when('empty', () => starterFor(plantId)),
              Match.when('written', () =>
                plantId === undefined
                  ? NO_CHIPS
                  : { kind: 'followUp' as const, plantId }
              ),
              Match.exhaustive
            )
          ),
          Option.getOrElse(() => NO_CHIPS)
        )
      : starterFor(
          chat.target.kind === 'plant' ? chat.target.plantId : undefined
        )
