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
  filter: {
    allRooms: 'Toutes les pièces',
    noRoom: 'Sans pièce',
  },
} as const
