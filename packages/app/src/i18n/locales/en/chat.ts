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
