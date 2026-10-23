import type { AchievementKey } from '@lily/shared'

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
    titleMany: '{count} succès débloqués !',
    next: 'Suivant',
    continue: 'Continuer',
  },
  catalog: {
    FIRST_PLANT_ADDED: {
      name: 'Premiers pas',
      description: 'Vous avez ajouté votre première plante au jardin',
    },
    WATERING_NOVICE: {
      name: 'Premiers arrosages',
      description: 'Vous avez arrosé vos plantes 10 fois',
    },
    PLANT_COLLECTOR: {
      name: 'Collection en herbe',
      description: 'Vous avez réuni 5 plantes dans votre jardin',
    },
    DEDICATED_CARETAKER: {
      name: 'Soins assidus',
      description: "Vous avez pris soin de vos plantes 3 jours d'affilée",
    },
    ATTENTION_ALERT: {
      name: 'Sur le qui-vive',
      description: "Vous avez aidé une plante qui avait besoin d'attention",
    },
    PHOTO_PRO: {
      name: 'Pro de la photo',
      description: 'Vous avez ajouté 10 photos de plantes',
    },
    RARE_COLLECTOR: {
      name: 'Trésor rare',
      description: 'Vous avez ajouté une plante rare à votre collection',
    },
    SCAN_CHAMP: {
      name: 'As du scan',
      description: 'Vous avez scanné 5 cartes de plantes',
    },
    FERTILIZER_GURU: {
      name: "Gourou de l'engrais",
      description: 'Vous avez fertilisé vos plantes 10 fois',
    },
    HISTORY_HERO: {
      name: 'Mémoire verte',
      description: 'Vous avez consulté votre historique de soins',
    },
    AI_CONVERSATIONALIST: {
      name: 'Première discussion',
      description: "Vous avez discuté pour la première fois avec l'assistant",
    },
    DISEASE_DETECTIVE: {
      name: 'Détective des maladies',
      description: 'Vous avez identifié une maladie de plante',
    },
    GROWTH_TRACKER: {
      name: 'Suivi de croissance',
      description: "Vous avez suivi la croissance d'une plante dans le temps",
    },
    REMINDER_RESCUER: {
      name: 'Au rendez-vous',
      description: 'Vous avez répondu à un rappel de soin',
    },
    SHARE_SPROUT: {
      name: 'Pousse partagée',
      description: "Vous avez partagé une plante avec quelqu'un",
    },
  } satisfies Record<AchievementKey, { name: string; description: string }>,
} as const
