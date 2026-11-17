import type { Widen } from '../en'

export const en = {
  meta: {
    title: 'Plant Watering Calculator for Houseplants | Lily',
    description:
      'Free plant watering calculator: pick a houseplant, its room light, window direction, city and month to see how many days to wait between waterings.',
    breadcrumb: 'Watering calculator',
    appName: 'Lily plant watering calculator',
  },
  heading: 'Plant watering calculator',
  lead: 'Pick a plant, its room and your city to see how often to water it indoors this month.',
  form: {
    label: 'Your plant and its room',
    plant: 'Plant',
    light: 'Light in the room',
    lightLevels: [
      'Low light',
      'Medium light',
      'Bright indirect',
      'Direct light',
      'Full sun',
    ],
    window: 'Window direction',
    windowHint:
      'The way the nearest window faces. Pick the middle if you are not sure.',
    orientations: {
      N: 'North',
      NE: 'Northeast',
      E: 'East',
      SE: 'Southeast',
      S: 'South',
      SW: 'Southwest',
      W: 'West',
      NW: 'Northwest',
    },
    orientationShort: {
      N: 'N',
      NE: 'NE',
      E: 'E',
      SE: 'SE',
      S: 'S',
      SW: 'SW',
      W: 'W',
      NW: 'NW',
    },
    notSure: 'Not sure',
    city: 'Nearest city',
    cityHint: 'Pick the city closest to you. Only its latitude counts.',
    month: 'Month',
    months: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    temperature: 'Average outdoor temperature',
    temperatureValue: '{c} °C ({f} °F)',
  },
  result: {
    label: 'Watering interval',
    every: { one: 'Every day', other: 'Every {count} days' },
    base: {
      one: 'Base interval for {plant}: every day',
      other: 'Base interval for {plant}: every {count} days',
    },
    total: 'Change in water need: {value}',
    percent: '{value}%',
    capNote:
      'The factors multiply rather than add, and each one is capped, so the total differs from their sum.',
    factors: {
      seasonLight: {
        name: 'Season light',
        up: 'In {month}, {city} gets long days, a high sun or both, so the plant grows faster and drinks more.',
        down: 'In {month}, {city} gets short days, a low sun or both, so the plant grows slower and drinks less.',
        flat: 'In {month}, day length and sun height in {city} barely change how much this plant drinks.',
      },
      window: {
        name: 'Window direction',
        up: 'A window on the sunny side lets in more direct light, most of all when the sun is low.',
        down: 'A window on the shady side lets in less direct light, most of all when the sun is low.',
        flat: 'Sun and shade balance out for this window, so this factor stays neutral.',
        unset: 'No window direction picked, so this factor stays neutral.',
      },
      roomFit: {
        name: 'Room light',
        up: 'The room is brighter than this plant needs, so it grows faster and drinks more.',
        down: 'The room is darker than this plant needs, so it grows slower and drinks less.',
        flat: 'The room light matches what this plant needs.',
      },
      dryAir: {
        name: 'Dry indoor air',
        up: 'At {temp} outside, indoor air sits near {rh}% humidity, so the soil dries faster.',
        flat: 'At {temp} outside, indoor air sits near {rh}% humidity, close to the neutral point.',
      },
    },
    dimTitle: 'This room is too dark for {plant}',
    dimBody:
      'It needs more light than this room gets, so it barely grows here and the calculator never waters it more often than the base interval. Move it closer to a window.',
  },
  how: {
    heading: 'How the calculator works',
    intro:
      "It starts from the base interval in Lily's plant catalog, the number of days between waterings for that plant in average conditions. Four factors then raise or lower the plant's water need, and the base interval is divided by the result.",
    items: [
      {
        title: 'Day length and sun height',
        body: "From the city's latitude and the 15th of the month, it works out the hours of daylight and how high the sun gets at noon. Long, bright days speed growth and shorten the interval. Short winter days slow it. Cacti and succulents follow the season less than tropical plants.",
      },
      {
        title: 'Window direction',
        body: 'A window facing the equator, south in the northern hemisphere and north in the southern one, gets more direct sun. A window facing the pole gets less. The effect is strongest in winter, when the sun is low.',
      },
      {
        title: "Room light against the plant's need",
        body: 'The light level of the room is compared with the light the plant wants. Each level of difference moves the water need by about 6%. When the room is two levels too dark, the plant is treated as barely growing and the interval can only get longer. A bright room never speeds up a cactus or a succulent by more than 5%.',
      },
      {
        title: 'Dry air in heated rooms',
        body: 'Heating dries indoor air when it is cold outside. The calculator estimates indoor humidity from the outdoor temperature, from 25% near freezing to 55% at 22 °C and above, and assumes 21 °C indoors. Dry air shortens the interval, and plants that like humidity get a larger correction.',
      },
    ],
    outro:
      'The combined change stays between 0.62 and 1.4 times the base need, and the interval never goes above twice the base. The Lily app uses the same model, with your local weather added.',
  },
  limits: {
    heading: 'What the calculator cannot know',
    body: 'It does not see your pot, your soil or your weather. A small or terracotta pot dries faster than a large plastic one. An airy, chunky mix drains faster than dense potting soil. A run of grey days slows drying, and a heatwave speeds it up.',
    checkSoil:
      'Use the result as a starting point and check the soil first. Push a finger into it and water when the top 2.5 to 5 cm (1 to 2 in) are dry.',
    checkSoilLink: 'How often to water houseplants',
  },
  aside: {
    heading: 'Lily does this every day',
    body: 'The Lily app runs this model for each of your plants with the weather where you live, then reminds you when one needs water.',
  },
  read: {
    heading: 'Read next',
  },
} as const

export type CalculatorMessages = Widen<typeof en>
