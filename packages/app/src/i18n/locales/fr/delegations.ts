export default {
  title: 'Délégations',
  createDelegation: 'Créer une délégation',
  filter: {
    all: 'Toutes',
    myPlants: 'Mes plantes',
    caringFor: "J'aide",
  },
  empty: {
    both: {
      title: 'Aucune délégation',
      description:
        "Déléguez l'entretien de vos plantes à vos amis quand vous voyagez, ou aidez-les à s'occuper des leurs.",
    },
    owner: {
      title: 'Aucune plante déléguée',
      description:
        "Vous n'avez encore délégué aucune de vos plantes à quelqu'un.",
    },
    caretaker: {
      title: 'Aucune plante à entretenir',
      description:
        'Personne ne vous a encore demandé de vous occuper de ses plantes.',
    },
  },
  create: {
    title: 'Nouvelle délégation',
    submit: 'Créer la délégation',
    messageLabel: 'Message (optionnel)',
    messagePlaceholder: "Ajoutez une note pour l'aidant...",
  },
  detail: {
    title: 'Détails de la délégation',
    plantOwner: 'Propriétaire',
    caretaker: 'Aidant',
    you: '(Vous)',
    startDate: 'Date de début',
    endDate: 'Date de fin',
    message: 'Message',
    notFound: 'Délégation introuvable',
    unknownDate: 'Inconnu',
  },
  status: {
    pending: 'En attente',
    accepted: 'Acceptée',
    rejected: 'Refusée',
    active: 'Active',
    completed: 'Terminée',
    canceled: 'Annulée',
  },
  actions: {
    acceptRequest: 'Accepter la demande',
    decline: 'Refuser',
    cancelRequest: 'Annuler la demande',
    cancelDelegation: 'Annuler la délégation',
    completeDelegation: 'Terminer la délégation',
    caringMessage: 'Vous vous occupez actuellement de ces plantes',
    goBack: 'Retour',
  },
  modals: {
    cancel: {
      title: 'Annuler la délégation',
      message:
        'Êtes-vous sûr de vouloir annuler cette délégation ? Cette action est irréversible.',
      confirm: 'Annuler la délégation',
    },
    decline: {
      title: 'Refuser la demande',
      message: 'Êtes-vous sûr de vouloir refuser cette demande ?',
      confirm: 'Refuser',
    },
    complete: {
      title: 'Terminer la délégation',
      message:
        "Marquer cette délégation comme terminée ? L'aidant sera notifié.",
      confirm: 'Terminer',
    },
  },
  plants: {
    title: 'Plantes',
    titleWithCount: 'Plantes ({count})',
    empty: 'Aucune plante dans cette délégation',
    noSchedule: 'Pas de planning',
    noPlants: 'Aucune plante à déléguer',
    selectCount: 'Plantes ({selected}/{total})',
    selectAll: 'Tout sélectionner',
    deselectAll: 'Tout désélectionner',
  },
  caretakerPicker: {
    label: 'Aidant',
    placeholder: 'Rechercher un aidant...',
    noResults: 'Aucun utilisateur trouvé',
    suggested: 'Suggestions',
    unknown: 'Inconnu',
  },
  dateRange: {
    label: 'Période',
    start: 'Début',
    end: 'Fin',
    selectDate: 'Choisir une date',
  },
  card: {
    caretaker: 'Aidant',
    owner: 'Propriétaire',
    plantCount: '{count, plural, one {# plante} other {# plantes}}',
    unknown: 'Inconnu',
  },
  toast: {
    created: 'Demande de délégation envoyée !',
    accepted: 'Délégation acceptée !',
    declined: 'Délégation refusée',
    canceled: 'Délégation annulée',
    completed: 'Délégation terminée !',
    acceptFailed: "Échec de l'acceptation de la délégation",
    declineFailed: 'Échec du refus de la délégation',
    cancelFailed: "Échec de l'annulation de la délégation",
    completeFailed: 'Échec de la complétion de la délégation',
  },
  errors: {
    limitExceeded:
      'Vous avez atteint la limite de délégations pour votre forfait. Passez à un forfait supérieur.',
    overlap:
      'Certaines plantes ont déjà une délégation active pour cette période.',
    invalidDate: 'Plage de dates invalide.',
    cannotDelegateSelf: 'Vous ne pouvez pas déléguer vos plantes à vous-même.',
    createFailed: 'Échec de la création de la délégation. Veuillez réessayer.',
  },
} as const
