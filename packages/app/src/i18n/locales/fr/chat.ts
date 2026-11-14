export default {
  header: {
    assistantName: 'Lily',
  },
  input: {
    placeholder: 'Posez une question à Lily sur vos plantes...',
    placeholderPlant: 'Posez une question sur cette plante...',
    attach: 'Ajouter une photo',
    send: 'Envoyer',
    removeImage: 'Retirer la photo',
  },
  quotaExceeded:
    "J'aimerais vous aider, mais vous avez atteint votre limite mensuelle de conversations IA. Passez à Premium pour des conversations illimitées sur vos plantes ! 🌱",
  analyzing: 'Analyse en cours...',
  searching: 'Recherche en cours...',
  planning: 'Préparation d’un plan de soins...',
  summary: {
    viewDiagnosis: 'Voir le diagnostic',
    viewPlan: 'Voir le plan',
    progress: '{done}/{total} faites',
    diagnosisSubtitle:
      'Diagnostic · {count, plural, one {# étape de traitement} other {# étapes de traitement}}',
  },
  carePlan: {
    title: 'Plan de soins',
    addToTasks: 'Ajouter aux tâches',
    added: 'Ajouté aux tâches',
    dismiss: 'Pas maintenant',
    dismissed: 'Ignoré',
    completed: 'Terminé',
    dueToday: "aujourd'hui",
    dueInDays: 'dans {count, plural, one {# jour} other {# jours}}',
    stepsCount: '{count, plural, one {# étape} other {# étapes}}',
  },
  loadError: 'Impossible de charger la discussion',
  sendError: 'Une erreur est survenue. Veuillez réessayer.',
  drawer: {
    title: 'Conversations',
    newChat: 'Nouvelle conversation',
    untitledGeneral: 'Nouvelle conversation',
    untitledPlant: 'Discussion plante',
  },
  starters: {
    general: 'Général',
  },
  suggestions: {
    general: {
      petSafePlants: 'Quelles plantes sont sans danger pour les animaux ?',
      lowLight: 'Quelles plantes supportent une faible luminosité ?',
      fungusGnats: 'Comment se débarrasser des moucherons ?',
      beginnerPlants: 'Quelles plantes sont faciles pour débuter ?',
    },
    plant: {
      howToCare: 'Comment entretenir cette plante ?',
      whatIsWrong: 'Quel problème a ma plante ?',
      whenToRepot: 'Quand rempoter ?',
      propagationTips: 'Conseils de bouturage',
    },
  },
} as const
