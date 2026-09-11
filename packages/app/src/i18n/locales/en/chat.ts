export default {
  header: {
    assistantName: 'Lily Assistant',
    online: 'Online',
  },
  input: {
    placeholder: 'Ask about this plant...',
    imageAttached: 'Image attached',
    analysisReady: 'Analysis ready',
  },
  quotaExceeded:
    "I'd love to help, but you've reached your monthly AI chat limit. Upgrade to Premium for unlimited conversations about your plants! 🌱",
  analyzing: 'Analyzing...',
  searching: 'Searching knowledge base...',
  planning: 'Preparing a care plan...',
  summary: {
    viewDiagnosis: 'View diagnosis',
    viewPlan: 'View plan',
    progress: '{done}/{total} done',
    diagnosisSubtitle:
      'Diagnosis · {count, plural, one {# treatment step} other {# treatment steps}}',
  },
  carePlan: {
    title: 'Care plan',
    addToTasks: 'Add to tasks',
    added: 'Added to tasks',
    dismiss: 'Not now',
    dismissed: 'Dismissed',
    completed: 'Completed',
    dueToday: 'today',
    dueInDays: 'in {count, plural, one {# day} other {# days}}',
    stepsCount: '{count, plural, one {# step} other {# steps}}',
  },
  drawer: {
    title: 'Conversations',
    newChat: 'New conversation',
    empty: 'No past conversations yet.',
    untitledGeneral: 'New conversation',
    untitledPlant: 'Plant chat',
  },
  suggestions: {
    default: {
      leavesYellowing: 'Why are my leaves yellowing?',
      wateringFrequency: 'How often should I water?',
      lightOkay: 'Is this light okay?',
      petSafe: 'Is it safe for pets?',
    },
    plant: {
      howToCare: 'How to care for this plant?',
      whatIsWrong: "What's wrong with my plant?",
      whenToRepot: 'When to repot?',
      propagationTips: 'Propagation tips',
    },
  },
} as const
