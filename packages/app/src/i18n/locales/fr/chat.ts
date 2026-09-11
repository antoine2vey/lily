export default {
  header: {
    assistantName: 'Assistant Lily',
    online: 'En ligne',
  },
  input: {
    placeholder: 'Posez une question sur cette plante...',
    imageAttached: 'Image jointe',
    analysisReady: 'Analyse prête',
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
  drawer: {
    title: 'Conversations',
    newChat: 'Nouvelle conversation',
    empty: 'Aucune conversation pour le moment.',
    untitledGeneral: 'Nouvelle conversation',
    untitledPlant: 'Discussion plante',
  },
  suggestions: {
    default: {
      leavesYellowing: 'Pourquoi mes feuilles jaunissent-elles ?',
      wateringFrequency: 'À quelle fréquence arroser ?',
      lightOkay: 'Cette lumière convient-elle ?',
      petSafe: 'Est-ce sans danger pour les animaux ?',
    },
    plant: {
      howToCare: 'Comment entretenir cette plante ?',
      whatIsWrong: 'Quel problème a ma plante ?',
      whenToRepot: 'Quand rempoter ?',
      propagationTips: 'Conseils de bouturage',
    },
  },
} as const
