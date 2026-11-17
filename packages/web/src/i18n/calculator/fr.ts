import type { CalculatorMessages } from './en'

export const fr = {
  meta: {
    title: "Calculateur d'arrosage pour plantes d'intérieur | Lily",
    description:
      "Calculateur d'arrosage gratuit : choisissez une plante, sa lumière, l'orientation de la fenêtre, une ville et un mois pour connaître son rythme d'arrosage.",
    breadcrumb: "Calculateur d'arrosage",
    appName: "Calculateur d'arrosage des plantes Lily",
  },
  heading: "Calculateur d'arrosage des plantes",
  lead: "Choisissez une plante, sa pièce et votre ville pour savoir à quel rythme l'arroser en intérieur ce mois-ci.",
  form: {
    label: 'Votre plante et sa pièce',
    plant: 'Plante',
    light: 'Lumière dans la pièce',
    lightLevels: [
      'Faible lumière',
      'Lumière moyenne',
      'Lumière indirecte vive',
      'Lumière directe',
      'Plein soleil',
    ],
    window: 'Orientation de la fenêtre',
    windowHint:
      'Le côté vers lequel donne la fenêtre la plus proche. Choisissez le centre en cas de doute.',
    orientations: {
      N: 'Nord',
      NE: 'Nord-Est',
      E: 'Est',
      SE: 'Sud-Est',
      S: 'Sud',
      SW: 'Sud-Ouest',
      W: 'Ouest',
      NW: 'Nord-Ouest',
    },
    orientationShort: {
      N: 'N',
      NE: 'NE',
      E: 'E',
      SE: 'SE',
      S: 'S',
      SW: 'SO',
      W: 'O',
      NW: 'NO',
    },
    notSure: 'Je ne sais pas',
    city: 'Ville la plus proche',
    cityHint:
      'Choisissez la ville la plus proche de chez vous. Seule sa latitude compte.',
    month: 'Mois',
    months: [
      'janvier',
      'février',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'août',
      'septembre',
      'octobre',
      'novembre',
      'décembre',
    ],
    temperature: 'Température extérieure moyenne',
    temperatureValue: '{c} °C',
  },
  result: {
    label: "Rythme d'arrosage",
    every: { one: 'Tous les jours', other: 'Tous les {count} jours' },
    base: {
      one: 'Rythme de base pour {plant} : tous les jours',
      other: 'Rythme de base pour {plant} : tous les {count} jours',
    },
    total: 'Variation du besoin en eau : {value}',
    percent: '{value} %',
    capNote:
      "Les facteurs se multiplient au lieu de s'additionner et chacun est plafonné, le total diffère donc de leur somme.",
    factors: {
      seasonLight: {
        name: 'Lumière de saison',
        up: '{city} en {month} : jours longs, soleil haut ou les deux, la plante pousse plus vite et boit davantage.',
        down: '{city} en {month} : jours courts, soleil bas ou les deux, la plante pousse moins vite et boit moins.',
        flat: '{city} en {month} : durée du jour et hauteur du soleil changent à peine les besoins en eau de la plante.',
      },
      window: {
        name: 'Orientation de la fenêtre',
        up: 'Une fenêtre côté soleil laisse entrer plus de lumière directe, surtout quand le soleil est bas.',
        down: 'Une fenêtre côté ombre laisse entrer moins de lumière directe, surtout quand le soleil est bas.',
        flat: "Soleil et ombre s'équilibrent pour cette fenêtre, ce facteur reste donc neutre.",
        unset: 'Aucune orientation choisie, ce facteur reste donc neutre.',
      },
      roomFit: {
        name: 'Lumière de la pièce',
        up: 'La pièce est plus lumineuse que ce dont la plante a besoin : elle pousse plus vite et boit davantage.',
        down: 'La pièce est plus sombre que ce dont la plante a besoin : elle pousse moins vite et boit moins.',
        flat: 'La lumière de la pièce correspond aux besoins de la plante.',
      },
      dryAir: {
        name: 'Air intérieur sec',
        up: "Avec {temp} dehors, l'air intérieur tourne autour de {rh} % d'humidité : le terreau sèche plus vite.",
        flat: "Avec {temp} dehors, l'air intérieur tourne autour de {rh} % d'humidité, proche du point neutre.",
      },
    },
    dimTitle: 'Cette pièce est trop sombre pour {plant}',
    dimBody:
      "La plante a besoin de plus de lumière que cette pièce n'en reçoit. Elle pousse à peine ici, et le calculateur ne l'arrose donc jamais plus souvent que le rythme de base. Rapprochez-la d'une fenêtre.",
  },
  how: {
    heading: 'Comment fonctionne le calculateur',
    intro:
      'Il part du rythme de base du catalogue de Lily, le nombre de jours entre deux arrosages pour cette plante dans des conditions moyennes. Quatre facteurs augmentent ou réduisent ensuite son besoin en eau, et le rythme de base est divisé par le résultat.',
    items: [
      {
        title: 'Durée du jour et hauteur du soleil',
        body: "À partir de la latitude de la ville et du 15 du mois, il calcule les heures de jour et la hauteur du soleil à midi. Des jours longs et lumineux accélèrent la pousse et raccourcissent l'intervalle. Les jours courts de l'hiver la ralentissent. Les cactus et les succulentes suivent moins la saison que les plantes tropicales.",
      },
      {
        title: 'Orientation de la fenêtre',
        body: "Une fenêtre tournée vers l'équateur, au sud dans l'hémisphère nord et au nord dans l'hémisphère sud, reçoit plus de soleil direct. Une fenêtre tournée vers le pôle en reçoit moins. L'effet est le plus fort en hiver, quand le soleil est bas.",
      },
      {
        title: 'Lumière de la pièce et besoins de la plante',
        body: "Le niveau de lumière de la pièce est comparé à celui que la plante demande. Chaque niveau d'écart change le besoin en eau d'environ 6 %. Quand la pièce est trop sombre de deux niveaux, la plante est considérée comme presque à l'arrêt et l'intervalle ne peut que s'allonger. Une pièce lumineuse n'accélère jamais un cactus ou une succulente de plus de 5 %.",
      },
      {
        title: "L'air sec des pièces chauffées",
        body: "Le chauffage assèche l'air intérieur quand il fait froid dehors. Le calculateur estime l'humidité intérieure à partir de la température extérieure, de 25 % près de zéro à 55 % à partir de 22 °C, et suppose 21 °C à l'intérieur. Un air sec raccourcit l'intervalle, et les plantes qui aiment l'humidité reçoivent une correction plus forte.",
      },
    ],
    outro:
      "La variation totale reste entre 0,62 et 1,4 fois le besoin de base, et l'intervalle ne dépasse jamais le double du rythme de base. L'application Lily utilise le même modèle, avec en plus la météo de chez vous.",
  },
  limits: {
    heading: 'Ce que le calculateur ne peut pas savoir',
    body: "Il ne voit ni votre pot, ni votre terreau, ni votre météo. Un petit pot ou un pot en terre cuite sèche plus vite qu'un grand pot en plastique. Un mélange aéré draine plus vite qu'un terreau dense. Une série de jours gris ralentit le séchage, une canicule l'accélère.",
    checkSoil:
      "Prenez le résultat comme point de départ et vérifiez d'abord le terreau. Enfoncez un doigt et arrosez quand les 3 à 5 premiers cm sont secs.",
    checkSoilLink: "À quelle fréquence arroser les plantes d'intérieur",
  },
  aside: {
    heading: 'Lily le fait chaque jour',
    body: "L'application Lily applique ce modèle à chacune de vos plantes avec la météo de chez vous, puis vous prévient quand l'une d'elles a besoin d'eau.",
  },
  read: {
    heading: 'À lire ensuite',
  },
} as const satisfies CalculatorMessages
