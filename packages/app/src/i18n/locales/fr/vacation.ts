export default {
  title: 'Mode vacances',
  intro:
    'Vous partez ? Mettez les rappels d’entretien en pause. À votre retour, vos calendriers reprennent en douceur au lieu de vous submerger de tâches en retard.',
  dateRange: {
    label: 'Quand êtes-vous absent·e ?',
    start: 'Départ',
    end: 'Retour',
    selectDate: 'Choisir une date',
  },
  schedule: 'Programmer les vacances',
  update: 'Modifier les dates',
  scheduled: {
    title: 'Vacances programmées',
    description:
      'Les rappels seront automatiquement en pause du {{start}} au {{end}}.',
    cancel: 'Annuler les vacances',
    cancelConfirmTitle: 'Annuler les vacances ?',
    cancelConfirmMessage:
      'Vos rappels continueront normalement. Vous pouvez reprogrammer des vacances à tout moment.',
  },
  active: {
    title: 'Mode vacances activé',
    description:
      'Les rappels d’entretien sont en pause jusqu’au {{end}}. À la fin de vos vacances, les échéances sont décalées pour reprendre en douceur.',
    endNow: 'Terminer les vacances maintenant',
    endConfirmTitle: 'Terminer les vacances ?',
    endConfirmMessage:
      'Les rappels reprennent et les calendriers de vos plantes redémarrent à partir de demain.',
    startLocked:
      'Commencées le {{start}} — seule la date de retour peut changer.',
  },
  delegation: {
    title: 'Quelqu’un pour arroser vos plantes ?',
    description:
      'Déléguez vos plantes à un ami pendant votre absence — ses rappels restent actifs et lui sont envoyés.',
    action: 'Configurer une délégation',
  },
  banner: {
    active:
      'Mode vacances activé — les rappels sont en pause et les tâches seront reprogrammées à votre retour.',
  },
  errors: {
    endBeforeStart: 'La date de retour doit être après la date de départ',
    endInPast: 'La date de retour doit être dans le futur',
    tooLong: 'Des vacances ne peuvent pas durer plus d’un an',
    startLocked: 'La date de début de vacances actives ne peut pas changer',
    generic: 'Une erreur est survenue. Veuillez réessayer.',
  },
  toast: {
    scheduled: 'Vacances programmées',
    updated: 'Vacances mises à jour',
    canceled: 'Vacances annulées',
    ended: 'Bon retour ! Vos calendriers ont été mis à jour.',
  },
} as const
