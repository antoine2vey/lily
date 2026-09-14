export default {
  profileRow: 'Cemetery',
  title: 'Cemetery',
  badge: 'In memory',
  empty: {
    title: 'No losses yet',
    description:
      "Plants are hard. When one doesn't make it, say goodbye from its page and it will rest here with its history and photos.",
  },
  livedFor: 'Lived with you for {duration}',
  diedOn: 'Died on {date}',
  causes: {
    overwatering: 'Overwatering',
    underwatering: 'Underwatering',
    pests: 'Pests',
    disease: 'Disease',
    light: 'Light',
    cold: 'Cold',
    heat: 'Heat',
    repotting_shock: 'Repotting shock',
    unknown: 'Unknown',
  },
  actions: {
    sayGoodbye: 'Say goodbye',
    bringBack: 'Bring back',
    deletePermanently: 'Delete permanently',
  },
  sheet: {
    title: 'Say goodbye to {name}?',
    description:
      '{name} will move to your cemetery. Reminders stop, but its history and photos stay, and you can always bring it back.',
    causeLabel: 'What happened?',
    noteLabel: 'A note (optional)',
    notePlaceholder: 'Anything you want to remember…',
    confirm: 'Say goodbye',
  },
  banner: {
    title: 'In memory',
    cause: 'Cause: {cause}',
  },
  toast: {
    goodbye: 'Goodbye, {name}',
    goodbyeFailed: 'Could not say goodbye. Please try again.',
    broughtBack: '{name} is back!',
    bringBackFailed: 'Could not bring the plant back. Please try again.',
  },
  limit: {
    title: 'Plant limit reached',
  },
} as const
