export default {
  title: 'Profil',
  defaultName: 'Utilisateur',
  defaultBio: 'Amoureux des plantes',
  premiumBadge: 'PREMIUM',
  memberSince: 'Membre depuis {date}',
  memberSinceUnknown: 'Inconnu',
  stats: {
    plants: 'Plantes',
    careLogs: 'Soins',
    achievements: 'Succès',
  },
  actions: {
    editProfile: 'Modifier le profil',
    subscription: 'Abonnement',
    achievements: 'Mes succès',
    helpSupport: 'Aide et support',
    settings: 'Paramètres',
    about: 'À propos',
    signOut: 'Se déconnecter',
  },
  signOut: {
    title: 'Se déconnecter ?',
    message:
      'Êtes-vous sûr de vouloir vous déconnecter ? Vous devrez vous reconnecter pour accéder à vos plantes.',
    confirmButton: 'Se déconnecter',
    signingOut: 'Déconnexion...',
  },
  edit: {
    title: 'Modifier le profil',
    displayNameLabel: "Nom d'affichage",
    displayNamePlaceholder: 'Entrez votre nom',
    bioLabel: 'Bio',
    bioPlaceholder: 'Parlez-nous de vos plantes...',
    changePhoto: 'Changer la photo',
    error: 'Échec de la mise à jour du profil. Veuillez réessayer.',
    permissionRequired: 'Permission requise',
    permissionMessage:
      "Veuillez autoriser l'accès à votre bibliothèque photo pour changer votre photo de profil.",
  },
} as const
