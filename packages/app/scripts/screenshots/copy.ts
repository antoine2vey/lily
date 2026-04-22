import { Match, pipe } from 'effect'

export const SCREENS = [
  'home',
  'plants',
  'care',
  'plant-detail',
  'reminders',
  'rooms',
  'chat',
  'care-history',
  'ai-results',
] as const
export type Screen = (typeof SCREENS)[number]

export const LOCALES = ['en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const PLATFORMS = ['ios', 'android'] as const
export type Platform = (typeof PLATFORMS)[number]

// Copy is structured as eyebrow + headline + subtitle.
// - eyebrow: 1 word, sets emotional theme (THE RITUAL, THE HELLO, etc.)
// - headline: 2 lines, emotional outcome for the user (not a feature)
// - subtitle: 1 line, names the feeling the feature delivers; AI and
//   plant-recognition show up as promises, not capabilities ("Snap a
//   photo. We know the rest." rather than "AI plant ID").
interface ScreenCopy {
  readonly eyebrow: string
  readonly headline: string
  readonly subtitle: string
}

const copy: Record<Screen, Record<Locale, ScreenCopy>> = {
  home: {
    en: {
      eyebrow: 'The moment',
      headline: 'Your home,\nquietly blooming.',
      subtitle: 'Every plant has a place. Every place has a rhythm.',
    },
    fr: {
      eyebrow: "L'instant",
      headline: 'Votre maison,\ns’épanouit doucement.',
      subtitle: 'Chaque plante a sa place. Chaque place, son rythme.',
    },
  },
  plants: {
    en: {
      eyebrow: 'The family',
      headline: 'Your little\ngreen family.',
      subtitle: 'Each one remembered. Each one cared for.',
    },
    fr: {
      eyebrow: 'La famille',
      headline: 'Votre petite\nfamille verte.',
      subtitle: 'Chacune pensée. Chacune choyée.',
    },
  },
  care: {
    en: {
      eyebrow: 'The ritual',
      headline: 'Care that feels\neffortless.',
      subtitle: 'You water. We remember the rest.',
    },
    fr: {
      eyebrow: 'Le rituel',
      headline: 'Des soins qui\ncoulent de source.',
      subtitle: 'Vous arrosez. On s’occupe du reste.',
    },
  },
  'plant-detail': {
    en: {
      eyebrow: 'The story',
      headline: 'Every plant,\nits own story.',
      subtitle: 'From the day it arrived to every new leaf.',
    },
    fr: {
      eyebrow: "L'histoire",
      headline: 'Chaque plante,\nson histoire.',
      subtitle: 'De son arrivée à chaque nouvelle feuille.',
    },
  },
  reminders: {
    en: {
      eyebrow: 'The promise',
      headline: 'Nothing thirsty.\nNothing forgotten.',
      subtitle: 'A gentle nudge, right on time.',
    },
    fr: {
      eyebrow: 'La promesse',
      headline: 'Rien d’assoiffé.\nRien d’oublié.',
      subtitle: 'Un rappel doux, au bon moment.',
    },
  },
  rooms: {
    en: {
      eyebrow: 'The layout',
      headline: 'Every room,\nits own garden.',
      subtitle: 'Light, plants, and rhythm, mapped to the way you live.',
    },
    fr: {
      eyebrow: "L'espace",
      headline: 'Chaque pièce,\nson jardin.',
      subtitle: 'Lumière, plantes et rythme, selon votre chez-vous.',
    },
  },
  chat: {
    en: {
      eyebrow: 'The counsel',
      headline: 'Ask anything.\nGet real advice.',
      subtitle: 'She knows your plant better than you do.',
    },
    fr: {
      eyebrow: 'Le conseil',
      headline: 'Posez vos questions.\nDe vrais conseils.',
      subtitle: 'Elle connaît votre plante mieux que vous.',
    },
  },
  'care-history': {
    en: {
      eyebrow: 'The diary',
      headline: 'Every drop.\nEvery note.',
      subtitle: "A quiet record of everything you've done.",
    },
    fr: {
      eyebrow: 'Le journal',
      headline: 'Chaque goutte.\nChaque note.',
      subtitle: 'Un récit discret de tout ce que vous avez fait.',
    },
  },
  'ai-results': {
    en: {
      eyebrow: 'The reveal',
      headline: 'Meet your plant,\nin seconds.',
      subtitle: 'One photo. Species, care, and common pitfalls.',
    },
    fr: {
      eyebrow: 'La révélation',
      headline: 'Identifiez votre plante,\nen quelques secondes.',
      subtitle: 'Une photo. Espèce, soins, et pièges courants.',
    },
  },
}

export const getCopy = (screen: Screen, locale: Locale): ScreenCopy =>
  copy[screen][locale]

// Store-listing target dimensions.
// - iOS: 1284×2778. This is the 6.7" iPhone slot (iPhone 14/15 Pro
//   Max, 16 Plus). App Store Connect's 6.9" slot (1320×2868) was
//   rejecting uploads because our app's listing is configured for the
//   6.7" size — 1284×2778 is accepted across more slots and Apple
//   auto-scales up for the 6.9" slot when needed.
// - Android: 1080×1920 portrait, 16:9, accepted by Google Play.
export const getCanvasSize = (platform: Platform): [number, number] =>
  pipe(
    Match.value(platform),
    Match.when('ios', () => [1284, 2778] as [number, number]),
    Match.when('android', () => [1080, 1920] as [number, number]),
    Match.exhaustive
  )
