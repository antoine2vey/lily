export default {
  title: 'Accès Premium',
  headline: 'Débloquez Lily Pro',
  description:
    "Offrez à vos plantes les soins qu'elles méritent avec un accès illimité aux fonctionnalités premium.",
  features: {
    unlimitedChats: {
      title: 'Chats IA illimités',
      description:
        'Réponses instantanées à toutes vos questions sur les plantes',
    },
    expertConsultations: {
      title: "Consultations d'experts",
      description: 'Conseils personnalisés de botanistes certifiés',
    },
    noAds: {
      title: 'Sans publicité',
      description: 'Concentrez-vous sur votre jardin, sans distraction',
    },
    prioritySupport: {
      title: 'Support prioritaire',
      description: "Passez en premier quand vous avez besoin d'aide",
    },
    unlimitedDiagnostics: 'Diagnostics IA illimités',
    detailedGuides: 'Guides de soins détaillés',
    advancedStats: 'Statistiques avancées',
  },
  buttons: {
    subscribe: "S'abonner pour {price}",
    processing: 'Traitement...',
    restore: "Restaurer l'achat",
    viewPlans: 'Voir les forfaits',
    cancelSubscription: "Annuler l'abonnement",
  },
  billing: 'Facturation récurrente, annulez à tout moment.',
  disclosure: {
    productMonthly: 'Lily Pro — Mensuel',
    productAnnual: 'Lily Pro — Annuel',
    lengthMonthly: '1 mois',
    lengthAnnual: '1 an',
    sectionTitle: 'Abonnement à renouvellement automatique',
    productLine: '{name} · {length} · {price}',
    autoRenew:
      "Le paiement est débité de votre compte Apple ID à la confirmation de l'achat. Votre abonnement se renouvelle automatiquement à {price} sauf annulation au moins 24 heures avant la fin de la période en cours. Vous pouvez gérer ou annuler votre abonnement à tout moment dans les Réglages de votre compte Apple ID.",
    trialAutoRenew:
      "Votre essai gratuit de {days} jours se transforme en abonnement payant {name} à {price} sauf annulation au moins 24 heures avant la fin de l'essai. Gérez ou annulez à tout moment dans les Réglages de votre compte Apple ID.",
    agreement:
      "En vous abonnant, vous acceptez nos Conditions d'utilisation (CLUF) et notre Politique de confidentialité.",
  },
  trial: {
    badge: '{days} jours gratuits',
    startTrial: "Commencer l'essai gratuit",
    billingInfo: 'Gratuit pendant {days} jours, puis {price}',
  },
  badges: {
    secure: 'Sécurisé',
    topRated: 'Bien noté',
  },
  legal: {
    terms: "Conditions d'utilisation",
    privacy: 'Politique de confidentialité',
  },
  messages: {
    devPurchase:
      'Achat simulé ! (Mode Dev)\n\nEn production, ce serait un vrai achat.',
    thankYou: 'Merci de vous être abonné à Lily Pro !',
    error: 'Erreur',
    noPackage: 'Aucun forfait disponible. Veuillez réessayer plus tard.',
    purchaseFailed: "L'achat a échoué. Veuillez réessayer.",
    restoreSuccess: 'Achats restaurés avec succès.',
    restoreSimulated: 'Restauration simulée ! (Mode Dev)',
    restoreFailed: 'Échec de la restauration des achats. Veuillez réessayer.',
    restoring: 'Restauration...',
    linkFailed: "Impossible d'ouvrir le lien. Veuillez réessayer.",
    success: 'Succès',
  },
  usage: {
    title: 'Abonnement',
    currentPlan: 'Forfait actuel',
    upgradeTo: 'Passer à Lily Pro',
    aiChats: 'Chats IA',
    plantIds: 'Identifications',
    cardScans: "Scans d'étiquettes",
  },
  status: {
    active: 'Actif',
    trial: 'Essai',
    canceled: 'Annulé',
    expired: 'Expiré',
    pastDue: 'En retard',
  },
  pricing: {
    monthly: 'Mensuel',
    annual: 'Annuel',
    perMonth: '/mois',
    perYear: '/an',
    save: 'Économisez {percent}%',
  },
  cancel: {
    title: "Annuler l'abonnement",
    headline: 'Nous sommes tristes de vous voir partir',
    subtitle:
      'Si vous annulez, vous perdrez accès à ces fonctionnalités premium :',
    info: "Vous conserverez l'accès aux fonctionnalités premium jusqu'à la fin de votre période de facturation. Vous pouvez vous réabonner à tout moment.",
    keepButton: 'Garder mon abonnement',
    continueButton: "Continuer l'annulation",
    featuresLost: {
      diagnostics: 'Diagnostics IA illimités',
      guides: 'Guides de soins détaillés',
      stats: 'Statistiques avancées',
      support: 'Support prioritaire',
    },
  },
  redeem: {
    title: 'Utiliser un code cadeau',
    description:
      'Entrez votre code cadeau pour débloquer les fonctionnalités premium.',
    inputLabel: 'Code cadeau',
    inputPlaceholder: 'Entrez le code ici',
    redeemButton: 'Utiliser',
    doneButton: 'Terminé',
    success: "Code cadeau utilisé ! Profitez de l'accès premium.",
    error: "Une erreur s'est produite. Veuillez réessayer.",
    errors: {
      notFound: "Ce code n'existe pas. Vérifiez et réessayez.",
      inactive: "Ce code n'est plus actif.",
      expired: 'Ce code a expiré.',
      exhausted: "Ce code a atteint son nombre maximum d'utilisations.",
      alreadyRedeemed: 'Vous avez déjà utilisé ce code.',
    },
    link: 'Vous avez un code cadeau ?',
  },
} as const
