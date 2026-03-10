import type { LanguageCode } from '@lily/shared'

export type TipCategory =
  | 'watering'
  | 'light'
  | 'soil'
  | 'seasonal'
  | 'fun_fact'
  | 'general'

export interface PlantTip {
  readonly id: string
  readonly category: TipCategory
  readonly en: { readonly title: string; readonly body: string }
  readonly fr: { readonly title: string; readonly body: string }
  readonly personalized: boolean // If true, body can use {plantName}
}

export const PLANT_TIPS: ReadonlyArray<PlantTip> = [
  // Watering tips
  {
    id: 'tip-water-01',
    category: 'watering',
    en: {
      title: '🌱 Did you know?',
      body: 'Plants in terracotta pots dry out faster than those in plastic. Check your soil moisture!',
    },
    fr: {
      title: '🌱 Le saviez-vous ?',
      body: "Les plantes en pots de terre cuite sèchent plus vite que celles en plastique. Vérifiez l'humidité du sol !",
    },
    personalized: false,
  },
  {
    id: 'tip-water-02',
    category: 'watering',
    en: {
      title: '🌱 Tip for your {plantName}',
      body: 'Overwatering is the #1 cause of houseplant death. When in doubt, wait a day!',
    },
    fr: {
      title: '🌱 Conseil pour votre {plantName}',
      body: "L'excès d'eau est la cause n°1 de mort des plantes d'intérieur. En cas de doute, attendez un jour !",
    },
    personalized: true,
  },
  {
    id: 'tip-water-03',
    category: 'watering',
    en: {
      title: '🌱 Watering tip',
      body: 'Water your plants in the morning! It gives them time to absorb moisture before the heat of the day.',
    },
    fr: {
      title: '🌱 Conseil arrosage',
      body: "Arrosez vos plantes le matin ! Cela leur laisse le temps d'absorber l'eau avant la chaleur.",
    },
    personalized: false,
  },
  {
    id: 'tip-water-04',
    category: 'watering',
    en: {
      title: '🌱 Quick tip',
      body: 'Yellow leaves often mean overwatering. Brown, crispy tips usually mean underwatering.',
    },
    fr: {
      title: '🌱 Astuce rapide',
      body: "Les feuilles jaunes signifient souvent un excès d'eau. Les pointes brunes et sèches, un manque d'eau.",
    },
    personalized: false,
  },
  {
    id: 'tip-water-05',
    category: 'watering',
    en: {
      title: '🌱 Pro tip',
      body: 'Use room-temperature water for your plants. Cold water can shock tropical plant roots!',
    },
    fr: {
      title: '🌱 Conseil de pro',
      body: "Utilisez de l'eau à température ambiante. L'eau froide peut choquer les racines des plantes tropicales !",
    },
    personalized: false,
  },

  // Light tips
  {
    id: 'tip-light-01',
    category: 'light',
    en: {
      title: '🌱 Light tip',
      body: 'Rotate your plants a quarter turn each week so they grow evenly on all sides.',
    },
    fr: {
      title: '🌱 Conseil lumière',
      body: "Tournez vos plantes d'un quart de tour chaque semaine pour une croissance uniforme.",
    },
    personalized: false,
  },
  {
    id: 'tip-light-02',
    category: 'light',
    en: {
      title: '🌱 Did you know?',
      body: 'Dust on leaves blocks sunlight! Wipe them gently with a damp cloth once a month.',
    },
    fr: {
      title: '🌱 Le saviez-vous ?',
      body: 'La poussière sur les feuilles bloque la lumière ! Essuyez-les avec un chiffon humide une fois par mois.',
    },
    personalized: false,
  },
  {
    id: 'tip-light-03',
    category: 'light',
    en: {
      title: '🌱 Tip for your {plantName}',
      body: "If your plant's leaves are stretching toward light, it might need a brighter spot!",
    },
    fr: {
      title: '🌱 Conseil pour votre {plantName}',
      body: 'Si les feuilles de votre plante se tournent vers la lumière, elle a peut-être besoin de plus de luminosité !',
    },
    personalized: true,
  },

  // Soil tips
  {
    id: 'tip-soil-01',
    category: 'soil',
    en: {
      title: '🌱 Soil tip',
      body: 'Repot your plants every 1-2 years. Fresh soil gives them fresh nutrients!',
    },
    fr: {
      title: '🌱 Conseil terreau',
      body: 'Rempotez vos plantes tous les 1 à 2 ans. Un terreau frais leur apporte de nouveaux nutriments !',
    },
    personalized: false,
  },
  {
    id: 'tip-soil-02',
    category: 'soil',
    en: {
      title: '🌱 Pro tip',
      body: 'Good drainage is essential! Make sure your pots have drainage holes to avoid root rot.',
    },
    fr: {
      title: '🌱 Conseil de pro',
      body: 'Un bon drainage est essentiel ! Vérifiez que vos pots ont des trous pour éviter la pourriture des racines.',
    },
    personalized: false,
  },
  {
    id: 'tip-soil-03',
    category: 'soil',
    en: {
      title: '🌱 Quick tip',
      body: "Stick your finger 2cm into the soil. If it feels dry, it's time to water!",
    },
    fr: {
      title: '🌱 Astuce rapide',
      body: "Enfoncez votre doigt à 2 cm dans le sol. Si c'est sec, il est temps d'arroser !",
    },
    personalized: false,
  },

  // Seasonal tips
  {
    id: 'tip-season-01',
    category: 'seasonal',
    en: {
      title: '🌱 Seasonal tip',
      body: 'In winter, most plants need less water. They slow down and rest — let them!',
    },
    fr: {
      title: '🌱 Conseil saisonnier',
      body: "En hiver, la plupart des plantes ont besoin de moins d'eau. Elles ralentissent et se reposent.",
    },
    personalized: false,
  },
  {
    id: 'tip-season-02',
    category: 'seasonal',
    en: {
      title: '🌱 Seasonal tip',
      body: 'Spring is the best time to repot and fertilize! Your plants are waking up and hungry.',
    },
    fr: {
      title: '🌱 Conseil saisonnier',
      body: 'Le printemps est le meilleur moment pour rempoter et fertiliser ! Vos plantes se réveillent.',
    },
    personalized: false,
  },
  {
    id: 'tip-season-03',
    category: 'seasonal',
    en: {
      title: '🌱 Seasonal tip',
      body: 'Keep plants away from cold drafts in winter. Most houseplants prefer temperatures above 15°C.',
    },
    fr: {
      title: '🌱 Conseil saisonnier',
      body: "Éloignez vos plantes des courants d'air froid en hiver. Elles préfèrent des températures au-dessus de 15°C.",
    },
    personalized: false,
  },
  {
    id: 'tip-season-04',
    category: 'seasonal',
    en: {
      title: '🌱 Summer tip',
      body: 'Hot weather means your plants drink more! Check soil moisture more frequently in summer.',
    },
    fr: {
      title: '🌱 Conseil été',
      body: "La chaleur donne soif à vos plantes ! Vérifiez l'humidité du sol plus souvent en été.",
    },
    personalized: false,
  },

  // Fun facts
  {
    id: 'tip-fun-01',
    category: 'fun_fact',
    en: {
      title: '🌱 Fun fact',
      body: "Talking to your plants isn't crazy! The CO2 you exhale can actually help them grow.",
    },
    fr: {
      title: '🌱 Fun fact',
      body: "Parler à vos plantes n'est pas fou ! Le CO2 que vous expirez les aide vraiment à pousser.",
    },
    personalized: false,
  },
  {
    id: 'tip-fun-02',
    category: 'fun_fact',
    en: {
      title: '🌱 Fun fact',
      body: 'Some plants can live for thousands of years. A bristlecone pine in California is over 5,000 years old!',
    },
    fr: {
      title: '🌱 Fun fact',
      body: "Certaines plantes vivent des milliers d'années. Un pin Bristlecone en Californie a plus de 5 000 ans !",
    },
    personalized: false,
  },
  {
    id: 'tip-fun-03',
    category: 'fun_fact',
    en: {
      title: '🌱 Fun fact',
      body: 'NASA research shows that houseplants can remove up to 87% of air toxins in 24 hours!',
    },
    fr: {
      title: '🌱 Fun fact',
      body: "Selon la NASA, les plantes d'intérieur peuvent éliminer jusqu'à 87 % des toxines de l'air en 24 heures !",
    },
    personalized: false,
  },
  {
    id: 'tip-fun-04',
    category: 'fun_fact',
    en: {
      title: '🌱 Fun fact',
      body: "Bamboo can grow up to 91 cm in a single day — that's almost 4 cm per hour!",
    },
    fr: {
      title: '🌱 Fun fact',
      body: 'Le bambou peut pousser de 91 cm en une seule journée — soit presque 4 cm par heure !',
    },
    personalized: false,
  },
  {
    id: 'tip-fun-05',
    category: 'fun_fact',
    en: {
      title: '🌱 Fun fact',
      body: 'Plants can hear! Studies suggest they grow better with music, especially classical.',
    },
    fr: {
      title: '🌱 Fun fact',
      body: "Les plantes entendent ! Des études montrent qu'elles poussent mieux avec de la musique, surtout classique.",
    },
    personalized: false,
  },

  // General tips
  {
    id: 'tip-general-01',
    category: 'general',
    en: {
      title: '🌱 Plant care tip',
      body: 'Group plants with similar needs together. It makes watering easier and creates a mini ecosystem!',
    },
    fr: {
      title: '🌱 Conseil entretien',
      body: "Groupez les plantes aux besoins similaires. Cela facilite l'arrosage et crée un mini écosystème !",
    },
    personalized: false,
  },
  {
    id: 'tip-general-02',
    category: 'general',
    en: {
      title: '🌱 Tip for your {plantName}',
      body: 'Check the undersides of leaves regularly for pests. Early detection is key!',
    },
    fr: {
      title: '🌱 Conseil pour votre {plantName}',
      body: 'Vérifiez régulièrement le dessous des feuilles pour détecter les parasites tôt !',
    },
    personalized: true,
  },
  {
    id: 'tip-general-03',
    category: 'general',
    en: {
      title: '🌱 Quick tip',
      body: 'Want to propagate? Many plants can grow new roots from a simple stem cutting in water!',
    },
    fr: {
      title: '🌱 Astuce rapide',
      body: "Envie de multiplier vos plantes ? Beaucoup repoussent à partir d'une simple bouture dans l'eau !",
    },
    personalized: false,
  },
  {
    id: 'tip-general-04',
    category: 'general',
    en: {
      title: '🌱 Plant care tip',
      body: 'Humidity-loving plants thrive in bathrooms. The steam from showers is a natural humidifier!',
    },
    fr: {
      title: '🌱 Conseil entretien',
      body: "Les plantes qui aiment l'humidité adorent les salles de bain. La vapeur de la douche les hydrate !",
    },
    personalized: false,
  },
  {
    id: 'tip-general-05',
    category: 'general',
    en: {
      title: '🌱 Tip for your {plantName}',
      body: 'Remove dead or yellowing leaves promptly. This helps your plant focus energy on new growth!',
    },
    fr: {
      title: '🌱 Conseil pour votre {plantName}',
      body: 'Retirez les feuilles mortes ou jaunies rapidement. Cela aide la plante à se concentrer sur la nouvelle pousse !',
    },
    personalized: true,
  },
  {
    id: 'tip-general-06',
    category: 'general',
    en: {
      title: '🌱 Did you know?',
      body: 'Coffee grounds make great fertilizer for acid-loving plants like azaleas and blueberries!',
    },
    fr: {
      title: '🌱 Le saviez-vous ?',
      body: 'Le marc de café est un excellent engrais pour les plantes acidophiles comme les azalées !',
    },
    personalized: false,
  },
  {
    id: 'tip-general-07',
    category: 'general',
    en: {
      title: '🌱 Plant care tip',
      body: 'Misting tropical plants increases humidity around them — they love it, especially in dry winters!',
    },
    fr: {
      title: '🌱 Conseil entretien',
      body: "Brumiser les plantes tropicales augmente l'humidité autour d'elles — elles adorent, surtout en hiver !",
    },
    personalized: false,
  },
  {
    id: 'tip-general-08',
    category: 'general',
    en: {
      title: '🌱 Quick tip',
      body: 'Banana peels soaked in water for 2 days make a potassium-rich plant fertilizer!',
    },
    fr: {
      title: '🌱 Astuce rapide',
      body: "Des peaux de banane trempées dans l'eau pendant 2 jours font un engrais riche en potassium !",
    },
    personalized: false,
  },
]

/**
 * Replace {plantName} placeholders in tip content
 */
export const resolveTipContent = (
  tip: PlantTip,
  language: LanguageCode,
  plantName?: string
): { title: string; body: string } => {
  const content = tip[language]
  const name = plantName ?? 'your plant'
  const nameFr = plantName ?? 'votre plante'
  const replacement = language === 'fr' ? nameFr : name

  return {
    title: content.title.replace('{plantName}', replacement),
    body: content.body.replace('{plantName}', replacement),
  }
}
