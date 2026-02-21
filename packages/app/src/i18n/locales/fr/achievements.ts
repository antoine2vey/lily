export default {
  title: 'Succès',
  level: 'Niveau {level}',
  progress: '{unlocked} sur {total} succès',
  categories: {
    collection: 'Collection de plantes',
    care: 'Soins des plantes',
    streaks: 'Séries',
    special: 'Spécial',
  },
  rarity: {
    common: 'Commun',
    rare: 'Rare',
    epic: 'Épique',
    legendary: 'Légendaire',
  },
  status: {
    unlocked: 'Débloqué {date}',
    progressCompleted: '{current} / {max} complétés',
    keepGoing: 'Continuez pour débloquer ce succès',
    unknown: 'Inconnu',
  },
  unlockModal: {
    title: 'Succès débloqué !',
    continue: 'Continuer',
  },
  badges: {
    firstPlantAdded: {
      name: 'Première plante',
      description: 'Ajoutez votre première plante',
    },
    wateringNovice: {
      name: 'Novice en arrosage',
      description: 'Arrosez vos plantes 10 fois',
    },
    plantCollector: {
      name: 'Collectionneur de plantes',
      description: 'Collectionnez 5 plantes différentes',
    },
    dedicatedCaretaker: {
      name: 'Gardien dévoué',
      description: 'Prenez soin de vos plantes pendant 30 jours',
    },
  },
} as const
