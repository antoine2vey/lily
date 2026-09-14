export default {
  profileRow: 'Cimetière',
  title: 'Cimetière',
  badge: 'En mémoire',
  empty: {
    title: 'Aucune perte pour le moment',
    description:
      "Les plantes, c'est difficile. Quand l'une d'elles ne survit pas, dites-lui adieu depuis sa page : elle reposera ici avec son historique et ses photos.",
  },
  livedFor: 'A vécu {duration} avec vous',
  diedOn: 'Décédée le {date}',
  causes: {
    overwatering: 'Excès d’arrosage',
    underwatering: 'Manque d’arrosage',
    pests: 'Parasites',
    disease: 'Maladie',
    light: 'Lumière',
    cold: 'Froid',
    heat: 'Chaleur',
    repotting_shock: 'Choc de rempotage',
    unknown: 'Inconnue',
  },
  actions: {
    sayGoodbye: 'Dire adieu',
    bringBack: 'Faire revenir',
    deletePermanently: 'Supprimer définitivement',
  },
  sheet: {
    title: 'Dire adieu à {name} ?',
    description:
      '{name} rejoindra votre cimetière. Les rappels s’arrêtent, mais son historique et ses photos restent, et vous pourrez toujours la faire revenir.',
    causeLabel: 'Que s’est-il passé ?',
    noteLabel: 'Une note (optionnel)',
    notePlaceholder: 'Ce dont vous voulez vous souvenir…',
    confirm: 'Dire adieu',
  },
  banner: {
    title: 'En mémoire',
    cause: 'Cause : {cause}',
  },
  toast: {
    goodbye: 'Adieu, {name}',
    goodbyeFailed: 'Impossible de dire adieu. Veuillez réessayer.',
    broughtBack: '{name} est de retour !',
    bringBackFailed:
      'Impossible de faire revenir la plante. Veuillez réessayer.',
  },
  limit: {
    title: 'Limite de plantes atteinte',
  },
} as const
