export default {
  header: {
    assistantName: 'Lily',
  },
  input: {
    placeholder: 'Ask Lily about your plants...',
    placeholderPlant: 'Ask about this plant...',
    attach: 'Add a photo',
    send: 'Send',
    removeImage: 'Remove photo',
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
  loadError: "Couldn't load this chat",
  sendError: 'Something went wrong. Please try again.',
  drawer: {
    title: 'Conversations',
    newChat: 'New conversation',
    untitledGeneral: 'New conversation',
    untitledPlant: 'Plant chat',
  },
  starters: {
    general: 'General',
  },
  suggestions: {
    general: {
      petSafePlants: 'Which plants are safe for pets?',
      lowLight: 'Which plants do well in low light?',
      fungusGnats: 'How do I get rid of fungus gnats?',
      beginnerPlants: 'What are easy plants for beginners?',
    },
    plant: {
      howToCare: 'How to care for this plant?',
      whatIsWrong: "What's wrong with my plant?",
      whenToRepot: 'When to repot?',
      propagationTips: 'Propagation tips',
    },
  },
} as const
