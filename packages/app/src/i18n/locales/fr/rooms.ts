export default {
  title: 'Pièces',
  addRoom: 'Ajouter une pièce',
  editRoom: 'Modifier la pièce',
  roomName: 'Nom de la pièce',
  roomNamePlaceholder: 'ex. Salon',
  icon: 'Icône',
  plantCount:
    '{count, plural, =0 {Aucune plante} one {# plante} other {# plantes}}',
  empty: {
    title: 'Aucune pièce',
    description:
      'Créez des pièces pour organiser vos plantes par emplacement et les retrouver facilement.',
    button: 'Créer votre première pièce',
  },
  create: {
    title: 'Nouvelle pièce',
    button: 'Créer la pièce',
  },
  edit: {
    title: 'Modifier la pièce',
    button: 'Enregistrer',
  },
  delete: {
    title: 'Supprimer {name} ?',
    message:
      "Les plantes de cette pièce ne seront pas supprimées. Elles n'auront simplement plus de pièce assignée.",
    confirm: 'Supprimer la pièce',
    cancel: 'Garder la pièce',
  },
  toast: {
    created: 'Pièce « {name} » créée',
    updated: 'Pièce « {name} » mise à jour',
    deleted: 'Pièce « {name} » supprimée',
    createFailed: 'Échec de la création de la pièce',
    updateFailed: 'Échec de la mise à jour de la pièce',
    deleteFailed: 'Échec de la suppression de la pièce',
  },
  outdoor: 'Extérieur',
  outdoorDescription:
    "La pluie et le vent influenceront les plannings d'arrosage",
  plants: 'Plantes',
  addPlants: 'Ajouter des plantes à cette pièce',
  noUnassignedPlants: 'Toutes les plantes sont déjà assignées à des pièces',
  plantsSelected: '{count} plante(s) sélectionnée(s)',
  lighting: 'Luminosité',
  lightingLevels: {
    1: 'Lumière\nfaible',
    2: 'Lumière\nmoyenne',
    3: 'Lumineux\nindirect',
    4: 'Lumière\ndirecte',
    5: 'Plein\nsoleil',
  },
  detectLighting: 'Détecter depuis une photo',
  lightingDetected: 'Niveau de luminosité détecté',
  lightingDetectionFailed:
    'Impossible de détecter la luminosité depuis la photo',
  lightingHint:
    'Prenez une photo de la pièce pour détecter la luminosité, ou sélectionnez manuellement',
  orientation: 'Orientation de la fenêtre',
  orientationLevels: {
    N: 'Nord',
    NE: 'Nord-Est',
    E: 'Est',
    SE: 'Sud-Est',
    S: 'Sud',
    SW: 'Sud-Ouest',
    W: 'Ouest',
    NW: 'Nord-Ouest',
  },
  detectOrientation: 'Détecter à la boussole',
  orientationDetected: 'Orientation de la fenêtre définie',
  orientationDetectFailed: "Impossible de détecter l'orientation",
  orientationUseDirection: 'Utiliser cette direction',
  orientationClear: 'Effacer',
  orientationCalibrate:
    'Bougez le téléphone en huit, ou approchez-vous de la fenêtre pour stabiliser le cap',
  orientationPermissionDenied:
    "L'autorisation de localisation est requise pour la boussole.",
  orientationUnavailable: 'Boussole indisponible sur cet appareil.',
  orientationHint:
    'Tenez le téléphone à plat et pointez son bord supérieur vers la fenêtre — la flèche suit ce bord',
  filter: {
    allRooms: 'Toutes les pièces',
    noRoom: 'Sans pièce',
  },
  lightWarning:
    'Cette pièce à une luminosité « {roomLight} » mais votre plante a besoin de « {plantLight} »',
  lightUnknown:
    "Cette pièce n'a pas d'info de luminosité. Ajoutez-la dans les paramètres pour de meilleures recommandations.",
} as const
