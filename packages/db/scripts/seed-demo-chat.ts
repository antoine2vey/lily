#!/usr/bin/env bun
/**
 * Reseed Aloe Vera's chat history in a specific locale. Called by the
 * screenshot pipeline between the en and fr Maestro captures so the
 * chat bubbles are in the same language as the rest of the UI.
 *
 * Usage: LOCALE=fr bun run scripts/seed-demo-chat.ts
 */
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { DrizzleLive } from '@lily/db'
import { chatMessages, plants, users } from '@lily/db/schema'
import { and, eq } from 'drizzle-orm'
import { Array as A, Console, Effect, Match, Option, pipe } from 'effect'

type Locale = 'en' | 'fr'

const parseLocale = (value: string | undefined): Locale =>
  pipe(
    Match.value(value),
    Match.when('fr', (): Locale => 'fr'),
    Match.orElse((): Locale => 'en')
  )

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000)

interface Message {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly createdAt: Date
}

const mkPart = (text: string) => [{ type: 'text', text }]

const messagesForLocale = (locale: Locale): ReadonlyArray<Message> =>
  pipe(
    Match.value(locale),
    Match.when(
      'en',
      (): ReadonlyArray<Message> => [
        {
          role: 'user',
          content: 'Why are the tips of my Aloe turning brown?',
          createdAt: hoursAgo(6),
        },
        {
          role: 'assistant',
          content:
            "Three common causes, in order of likelihood for your Aloe: gentle underwatering (the top 3cm of soil should be dry, but not powder-dry), mineral buildup from tap water, and occasional sunburn from harsh afternoon sun. Based on your last watering 5 days ago and current conditions, I'd lean toward a light thorough soak — until water runs through the drainage holes — then let it dry out fully before the next one. If the tips keep browning, switch to filtered or rainwater for a month.",
          createdAt: hoursAgo(6),
        },
        {
          role: 'user',
          content: 'Is the light in my living room enough for it?',
          createdAt: hoursAgo(1),
        },
        {
          role: 'assistant',
          content:
            "Aloes want bright, indirect light with a few hours of gentle direct sun. A south- or west-facing window, about a metre back from the glass, is the sweet spot. If the leaves start stretching toward the window or the new growth looks pale, it's a sign to move it closer. Rotate the pot every couple of weeks so it grows evenly.",
          createdAt: hoursAgo(1),
        },
      ]
    ),
    Match.when(
      'fr',
      (): ReadonlyArray<Message> => [
        {
          role: 'user',
          content: 'Pourquoi les pointes de mon Aloe brunissent ?',
          createdAt: hoursAgo(6),
        },
        {
          role: 'assistant',
          content:
            "Trois causes probables, par ordre de fréquence pour votre Aloe : un léger sous-arrosage (les 3 premiers centimètres de terre doivent être secs, mais pas complètement asséchés), une accumulation de minéraux due à l'eau du robinet, et de rares coups de soleil l'après-midi. Vu votre dernier arrosage il y a 5 jours et les conditions actuelles, je pencherais pour un arrosage en profondeur — jusqu'à ce que l'eau coule par les trous de drainage — puis laisser sécher complètement avant le prochain. Si les pointes continuent de brunir, passez à l'eau filtrée ou de pluie pendant un mois.",
          createdAt: hoursAgo(6),
        },
        {
          role: 'user',
          content: 'La lumière de mon salon lui suffit ?',
          createdAt: hoursAgo(1),
        },
        {
          role: 'assistant',
          content:
            "Les Aloès aiment une lumière vive et indirecte avec quelques heures de soleil doux. Une fenêtre orientée sud ou ouest, à environ un mètre de la vitre, c'est l'idéal. Si les feuilles s'étirent vers la fenêtre ou que la nouvelle croissance semble pâle, c'est le signe qu'il faut la rapprocher. Tournez le pot toutes les deux semaines pour qu'il pousse uniformément.",
          createdAt: hoursAgo(1),
        },
      ]
    ),
    Match.exhaustive
  )

const run = Effect.gen(function* () {
  const locale = parseLocale(process.env.LOCALE)
  yield* Console.log(`Reseeding Aloe Vera chat in locale=${locale}`)
  const db = yield* PgDrizzle.PgDrizzle

  const userRows = yield* db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'antoine@lily.app'))
  const userOpt = A.head(userRows)
  if (Option.isNone(userOpt)) {
    yield* Console.log(
      '  User antoine@lily.app not found — run seed:demo first'
    )
    return
  }
  const userId = userOpt.value.id

  const plantRows = yield* db
    .select({ id: plants.id })
    .from(plants)
    .where(and(eq(plants.userId, userId), eq(plants.name, 'Aloe Vera')))
  const plantOpt = A.head(plantRows)
  if (Option.isNone(plantOpt)) {
    yield* Console.log('  Aloe Vera not found for user — run seed:demo first')
    return
  }
  const plantId = plantOpt.value.id

  yield* db.delete(chatMessages).where(eq(chatMessages.plantId, plantId))

  const messages = messagesForLocale(locale)
  for (const m of messages) {
    yield* db.insert(chatMessages).values({
      role: m.role,
      content: m.content,
      parts: mkPart(m.content),
      userId,
      plantId,
      createdAt: m.createdAt,
    })
  }
  yield* Console.log(
    `  Inserted ${messages.length} messages for Aloe Vera (locale=${locale})`
  )
})

Effect.runPromise(run.pipe(Effect.provide(DrizzleLive)))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error reseeding chat:', error)
    process.exit(1)
  })
