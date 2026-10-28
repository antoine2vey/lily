export default {
  title: 'Canopy',
  row: 'Canopy',
  none: {
    create: 'Créer une Canopy',
    joinHint:
      'Vous avez reçu un lien d’invitation ? Ouvrez-le sur ce téléphone pour rejoindre.',
  },
  create: {
    title: 'Nouvelle Canopy',
    nameLabel: 'Nom',
    namePlaceholder: 'Notre appart',
    hint: 'Chaque membre de la Canopy pourra la renommer.',
    submit: 'Créer la Canopy',
    points: {
      invite: 'Invitez jusqu’à 9 personnes avec un lien.',
      share:
        'Choisissez les plantes à partager. Les autres restent les vôtres.',
      remind: 'Chacun reçoit les rappels à son heure.',
    },
    alreadyIn: 'Vous êtes déjà dans une Canopy.',
    failed: 'Impossible de créer la Canopy. Réessayez.',
  },
  detail: {
    nameLabel: 'Nom',
    save: 'Enregistrer',
    renamed: 'Canopy renommée',
    members: 'Membres',
    memberCount: '{count} membres sur {max}',
    owner: 'Propriétaire',
    you: 'Vous',
    unnamed: 'Membre Lily',
    remove: 'Retirer',
    removeTitle: 'Retirer {name} ?',
    removeMessage:
      '{name} perd tout de suite l’accès aux plantes de la Canopy. Les plantes restent dans la Canopy.',
    removed: '{name} a été retiré',
    invite: {
      title: 'Inviter des personnes',
      description:
        'Toute personne qui a le lien peut rejoindre pendant 7 jours. Partager à nouveau crée un nouveau lien et désactive l’ancien.',
      share: 'Partager le lien d’invitation',
      activeUntil: 'Le lien actuel fonctionne jusqu’au {date}.',
      revoke: 'Désactiver le lien',
      revokeTitle: 'Désactiver le lien d’invitation ?',
      revokeMessage: 'Plus personne ne pourra rejoindre avec ce lien.',
      revoked: 'Lien d’invitation désactivé',
      shareMessage:
        'Rejoins ma Canopy « {name} » sur Lily pour prendre soin de nos plantes ensemble : {url}',
      full: 'Cette Canopy est complète. Elle accueille jusqu’à {max} membres.',
    },
    place: {
      title: 'Heure et lieu',
      timezone: 'Fuseau horaire',
      location: 'Lieu',
      locationSet: 'Défini',
      locationNotSet: 'Non défini',
      useDeviceTimezone: 'Utiliser le fuseau de ce téléphone',
      useLocation: 'Utiliser ma position actuelle',
      clearLocation: 'Effacer le lieu',
      ownerOnly:
        'Ils fixent le jour de soin et la météo des plantes de la Canopy. Seul le propriétaire peut les modifier.',
      locationDenied:
        'Autorisez l’accès à la position pour définir le lieu de la Canopy.',
      updated: 'Canopy mise à jour',
    },
    leave: 'Quitter la Canopy',
    leaveTitle: 'Quitter {name} ?',
    leaveMessageMember:
      'Vous perdez l’accès aux plantes de la Canopy. Elles restent dans la Canopy.',
    leaveMessageOwner:
      '{heir} devient propriétaire. Vous perdez l’accès aux plantes de la Canopy.',
    leaveMessageLast:
      'Vous êtes le dernier membre. La Canopy se ferme et ses plantes et pièces deviennent les vôtres.',
    left: 'Vous avez quitté la Canopy',
    delete: 'Supprimer la Canopy',
    deleteTitle: 'Supprimer {name} ?',
    deleteMessage:
      'Chaque plante et pièce de la Canopy devient la vôtre, et les membres perdent l’accès tout de suite. Aucune plante n’est supprimée.',
    deleted: 'Canopy supprimée',
    failed: 'Un problème est survenu. Réessayez.',
    notOwner: 'Seul le propriétaire peut faire cela.',
  },
  join: {
    title: 'Rejoindre {name}',
    invitedBy: '{name} vous invite',
    invited: 'Vous êtes invité',
    members: '{count, plural, one {# membre} other {# membres}}',
    note: 'Vos plantes restent les vôtres. Ensuite, vous choisissez celles à partager.',
    join: 'Rejoindre la Canopy',
    notNow: 'Plus tard',
    failed: 'Impossible de rejoindre. Réessayez.',
    alreadyHere: {
      title: 'Vous êtes déjà dans {name}',
      open: 'Ouvrir la Canopy',
    },
    another: {
      title: 'Vous êtes dans {current}',
      description:
        'Quittez d’abord {current} pour rejoindre {name}. Ses plantes restent dans {current}.',
      leave: 'Quitter {current} et rejoindre',
      confirmTitle: 'Quitter {current} ?',
      confirmMessage:
        'Vous perdez l’accès aux plantes de {current}, puis vous rejoignez {name}.',
    },
    full: {
      title: '{name} est complète',
      description:
        'Une Canopy accueille jusqu’à {max} membres. Demandez à un membre de faire de la place.',
    },
    expired: {
      title: 'Cette invitation a expiré',
      description:
        'Les liens d’invitation sont valables 7 jours. Demandez un nouveau lien à un membre de la Canopy.',
    },
    invalid: {
      title: 'Ce lien d’invitation n’est pas valide',
      description:
        'Le lien est peut-être incomplet, ou une invitation plus récente l’a remplacé. Demandez un nouveau lien à un membre de la Canopy.',
    },
    unavailable: {
      title: 'Impossible de charger l’invitation',
      description: 'Vérifiez votre connexion et réessayez.',
      retry: 'Réessayer',
    },
  },
  bring: {
    title: 'Partager des plantes avec la Canopy',
    description:
      'Tous les membres de {name} prennent soin des plantes choisies. Vous pourrez en partager d’autres depuis chaque plante.',
    count: '{selected} sur {total} sélectionnées',
    selectAll: 'Tout sélectionner',
    deselectAll: 'Tout désélectionner',
    submit:
      '{count, plural, =0 {Continuer} one {Partager # plante} other {Partager # plantes}}',
    joined: 'Vous avez rejoint {name}',
    brought:
      '{count, plural, one {# plante partagée} other {# plantes partagées}}',
    limit:
      'La Canopy a atteint sa limite de plantes gratuite, certaines plantes restent personnelles.',
    delegated: 'Les plantes en délégation de soin restent personnelles.',
    failed:
      'Certaines plantes n’ont pas pu être partagées. Réessayez depuis chaque plante.',
  },
} as const
