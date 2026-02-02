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
