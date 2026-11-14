import { openai } from '@ai-sdk/openai'
import { FAST_MODEL } from '@lily/api/services/ai/models'
import type { Fact } from '@lily/api/services/ai-chat/follow-up-facts'
import type {
  FollowUp,
  FollowUpBasis,
} from '@lily/api/services/ai-chat/follow-up-set'
import { type CareDay, callOpenAI } from '@lily/shared'
import type { OpenAIError } from '@lily/shared/ai-chat'
import { generateText, Output } from 'ai'
import { Array, Duration, type Effect, Option, pipe, String } from 'effect'
import { z } from 'zod'

export const FOLLOW_UPS_ASKED = 6
export const FOLLOW_UP_MAX_LENGTH = 60
const QUESTION_EXCERPT_LENGTH = 280
const NO_FACT = 'none'

export const FOLLOW_UP_CALL_TIMEOUT = Duration.seconds(30)

export interface FollowUpBrief {
  readonly language: string
  readonly plant: {
    readonly name: string
    readonly category: string | null
    readonly addedOn: CareDay
    readonly today: CareDay
    readonly careEveryDays: Readonly<Record<string, number>>
  }
  readonly facts: ReadonlyArray<Fact>
  readonly recentQuestions: ReadonlyArray<string>
}

export interface WrittenFollowUps {
  readonly followUps: ReadonlyArray<FollowUp>
  readonly inputTokens: number | undefined
  readonly outputTokens: number | undefined
}

const systemPrompt = (
  language: string
) => `You write follow-up question chips for a plant care chat app.
The user opens an existing conversation about one of their plants. Suggest the questions this user is most likely to want to ask next.

Rules:
- Write exactly ${FOLLOW_UPS_ASKED} questions, in the first person, as the user would type them.
- Each question is at most ${FOLLOW_UP_MAX_LENGTH} characters and names the plant when natural.
- Write in the language with code "${language}".
- Use only facts present in the plant data. Never invent a symptom, a date or a diagnosis.
- Do not repeat a question the user already asked. Follow up on it or move to a new topic.
- Ignore past messages that are not real plant questions.
- The input lists "facts", each with an id. Set "basis" to the id of the one fact the question would stop making sense without. Set it to "${NO_FACT}" for every other question, including general care questions.
- Write at least one question for each fact, then fill with follow-ups to the recent questions.`

const chipsSchema = (facts: ReadonlyArray<Fact>) =>
  z.object({
    chips: z.array(
      z.object({
        text: z.string(),
        basis: z.enum([...Array.map(facts, (fact) => fact.id), NO_FACT]),
      })
    ),
  })

const basisOf = (
  facts: ReadonlyArray<Fact>,
  factId: string
): Option.Option<FollowUpBasis> =>
  factId === NO_FACT
    ? Option.some({ kind: 'none' })
    : pipe(
        Array.findFirst(facts, (fact) => fact.id === factId),
        Option.map((fact) => fact.basis)
      )

const toFollowUps = (
  facts: ReadonlyArray<Fact>,
  chips: ReadonlyArray<{ readonly text: string; readonly basis: string }>
): ReadonlyArray<FollowUp> =>
  pipe(
    chips,
    Array.map((chip) => ({ ...chip, text: String.trim(chip.text) })),
    Array.filter(
      ({ text }) =>
        String.isNonEmpty(text) && text.length <= FOLLOW_UP_MAX_LENGTH
    ),
    Array.dedupeWith((a, b) => a.text === b.text),
    Array.flatMap(({ text, basis: factId }, position) =>
      pipe(
        basisOf(facts, factId),
        Option.map((basis) => ({ id: `${position}:${factId}`, text, basis })),
        Option.toArray
      )
    )
  )

export const writeFollowUps = (
  brief: FollowUpBrief
): Effect.Effect<WrittenFollowUps, OpenAIError> =>
  callOpenAI(
    'Chat follow-up suggestions',
    FOLLOW_UP_CALL_TIMEOUT,
    async (abortSignal) => {
      const result = await generateText({
        model: openai(FAST_MODEL),
        maxRetries: 0,
        abortSignal,
        temperature: 0.7,
        output: Output.object({ schema: chipsSchema(brief.facts) }),
        system: systemPrompt(brief.language),
        prompt: JSON.stringify({
          ...brief.plant,
          facts: Array.map(brief.facts, ({ id, statement }) => ({
            id,
            fact: statement,
          })),
          recentQuestions: Array.map(
            brief.recentQuestions,
            String.takeLeft(QUESTION_EXCERPT_LENGTH)
          ),
        }),
      })
      return {
        followUps: toFollowUps(brief.facts, result.output.chips),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      }
    }
  )
