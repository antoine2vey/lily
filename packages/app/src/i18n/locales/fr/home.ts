export default {
  greeting: {
    morning: 'Bonjour',
    afternoon: 'Bon après-midi',
    evening: 'Bonsoir',
    withName: '{greeting}, {name} !',
    withoutName: '{greeting} !',
    defaultName: 'Jardinier',
  },
  summary: {
    title: "Aujourd'hui",
    tasksRemaining:
      '{count, plural, one {# tâche restante} other {# tâches restantes}}',
    allDone: "Tout est fait pour aujourd'hui !",
    noTasks: 'Aucune tâche prévue',
  },
  sections: {
    todaysTasks: 'Tâches du jour',
    upcomingTasks: 'À venir',
    recentActivity: 'Activité récente',
    yourPlants: 'Vos plantes',
    seeAll: 'Tout voir',
  },
  activity: {
    noActivity:
      "Pas encore d'activité récente.\nCommencez à prendre soin de vos plantes !",
    plantAdded: 'Nouvelle plante ajoutée : {name}',
    plantMoved: '{name} déplacée à la lumière',
    plantMisted: '{name} vaporisée',
    plantWatered: '{name} arrosée',
    plantFertilized: '{name} fertilisée',
    plantRepotted: '{name} rempotée',
    plantPruned: '{name} taillée',
    unknownTime: 'Inconnu',
  },
  tasks: {
    watering: 'Arroser',
    fertilization: 'Fertiliser',
    misting: 'Vaporiser',
    repotting: 'Rempoter',
    prune: 'Tailler',
    rotate: 'Tourner',
    checkHealth: 'Vérifier la santé',
    markComplete: 'Marquer comme terminé',
    undo: 'Annuler',
    completed: 'Terminé',
    overdue: 'En retard',
    dueSoon: 'Bientôt',
    dueIn: 'Dans {time}',
    nextCare: 'Prochain : {task}',
  },
  stats: {
    total: 'Total',
    healthy: 'En forme',
    attention: 'À surveiller',
  },
  empty: {
    title: 'Votre jardin vous attend',
    subtitle: 'Ajoutez votre première plante pour commencer votre aventure',
    addButton: 'Ajouter votre première plante',
  },
  quickActions: {
    addPlant: 'Ajouter une plante',
    scanPlant: 'Identifier une plante',
    logCare: 'Enregistrer un soin',
  },
  hydration: {
    title: "Temps d'hydratation",
    plantsNeedWater:
      "{count, plural, one {# plante a besoin} other {# plantes ont besoin}} d'eau aujourd'hui",
    wateringAll: 'Arrosage...',
    waterAll: 'Tout arroser',
    viewPlant: 'Voir {name}',
    waterAllPlants: 'Arroser toutes les plantes',
  },
  careAgenda: {
    title: 'Soins du jour',
    xTasks: '{count, plural, one {# tâche} other {# tâches}}',
    allDone: 'Tout terminé !',
    allDoneSubtitle: 'Vos plantes sont heureuses',
    overdueLabel: 'En retard',
    completing: 'En cours...',
  },
  dailyProgress: {
    title: 'Progrès du jour',
    status: '{done} sur {total} tâches effectuées',
    allDone: 'Tout est fait !',
  },
  weeklySchedule: {
    title: 'Cette semaine',
    today: "Aujourd'hui",
  },
  streak: {
    title: 'Votre série',
    days: '{count, plural, one {# jour} other {# jours}}',
    level: 'Niveau {level}',
    achievements: '{count} succès',
    noStreak: 'Démarrez une série !',
    noStreakSubtitle: 'Prenez soin de vos plantes chaque jour',
  },
  achievementTeaser: {
    title: 'Prochain objectif',
    xMore: '{count} de plus pour débloquer',
    viewAll: 'Tout voir',
  },
  healthAlert: {
    title:
      "{count, plural, one {# plante a besoin d'attention} other {# plantes ont besoin d'attention}}",
    action: 'Voir',
  },
  weather: {
    conditionSunny: 'Ensoleillé',
    conditionCloudy: 'Nuageux',
    conditionRainy: 'Pluvieux',
    conditionHot: 'Chaud',
    skipWatering:
      '{count, plural, one {# plante sans arrosage} other {# plantes sans arrosage}}',
    skipFertilization:
      '{count, plural, one {# plante sans engrais} other {# plantes sans engrais}}',
    adjustedPlants:
      '{count, plural, one {# plante ajustée} other {# plantes ajustées}}',
    noImpact: 'Aucun ajustement',
    enableTitle: 'Soin guidé par la météo',
    enableSubtitle:
      "Obtenez des calendriers d'arrosage plus intelligents basés sur vos prévisions locales",
    enableButton: 'Activer la météo',
    fetchError: 'Météo indisponible',
  },
} as const
