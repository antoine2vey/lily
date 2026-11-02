import type en from '../en/emptyStates'

export default {
  homeNoPlants: {
    title: 'Votre jardin vous attend',
    description:
      'Ajoutez votre première plante, je vous aide à en prendre soin.',
  },
  careAllCaughtUp: {
    title: 'Tout est à jour !',
    description: 'Rien à faire pour le moment. Profitez du soleil.',
  },
  plantsNone: {
    title: 'Pas encore de plantes',
    description: 'Scannez votre première plante et grandissons ensemble.',
  },
  plantsNoResults: {
    title: 'Aucune plante trouvée',
    description:
      "J'ai cherché partout. Essayez une autre recherche ou un autre filtre.",
  },
  plantScheduleClear: {
    title: 'Rien de prévu',
    description: 'Aucun soin nécessaire dans les deux prochaines semaines.',
  },
  plantPhotos: {
    title: 'Pas encore de photos',
    description: 'Prenez une photo pour suivre la croissance de votre plante.',
  },
  careHistory: {
    title: 'Aucun soin enregistré',
    description:
      'Arrosez, vaporisez ou nourrissez cette plante, et ça apparaîtra ici.',
  },
  careHistoryFiltered: {
    title: 'Rien pour ce filtre',
    description: 'Essayez un autre type de soin.',
  },
  recentActivity: {
    title: "Pas encore d'activité",
    description: 'Arrosez une plante et elle apparaîtra ici.',
  },
  notifications: {
    title: 'Vous êtes à jour !',
    description: "Je sonne dès qu'une plante a besoin de vous.",
  },
  cemetery: {
    title: 'Aucune perte pour le moment',
    description:
      "Toutes vos plantes tiennent bon. Si l'une d'elles ne survit pas, dites-lui adieu depuis sa page : elle reposera ici.",
  },
  rooms: {
    title: 'Aucune pièce',
    description:
      'Créez des pièces pour ranger vos plantes selon leur emplacement.',
  },
  roomsAllAssigned: {
    title: 'Chaque plante a sa pièce',
    description: 'Plus rien à assigner.',
  },
  delegationsAll: {
    title: 'Aucune délégation',
    description:
      'Confiez vos plantes à un ami quand vous voyagez, ou aidez-le avec les siennes.',
  },
  delegationsOwner: {
    title: 'Aucune plante déléguée',
    description: "Vous n'avez encore confié aucune plante à quelqu'un.",
  },
  delegationsCaretaker: {
    title: 'Aucune plante à entretenir',
    description:
      'Personne ne vous a encore demandé de vous occuper de ses plantes.',
  },
  delegationPlants: {
    title: 'Aucune plante ici',
    description: "Cette délégation n'a pas encore de plantes.",
  },
  delegationPickPlants: {
    title: 'Aucune plante à déléguer',
    description: "Ajoutez d'abord une plante, puis confiez-la à un ami.",
  },
  canopyNone: {
    title: 'Prenez soin des plantes ensemble',
    description:
      'Une Canopy est un foyer partagé pour vos plantes. Chaque membre reçoit les rappels, et le premier qui arrose le coche pour tous.',
  },
  canopyBringPlants: {
    title: 'Pas encore de plante à partager',
    description:
      'Ajoutez une plante, puis partagez-la avec la Canopy depuis sa page.',
  },
  followers: {
    title: "Pas encore d'abonnés",
    description: 'Les personnes qui suivent ce compte apparaîtront ici.',
  },
  following: {
    title: 'Aucun abonnement',
    description:
      "Trouvez d'autres amoureux des plantes et suivez-les pour les voir ici.",
  },
  usersNoResults: {
    title: 'Aucun utilisateur trouvé',
    description: 'Essayez avec un autre nom.',
  },
  usersNoSuggestions: {
    title: 'Pas encore de suggestions',
    description: "Cherchez par nom pour trouver d'autres amoureux des plantes.",
  },
  publicProfilePlants: {
    title: 'Aucune plante à afficher',
    description: 'Ce jardin est encore vide.',
  },
  profileUnavailable: {
    title: 'Profil indisponible',
    description: "Ce profil est peut-être privé ou n'existe pas.",
  },
  chatNew: {
    title: "Salut, moi c'est Lily !",
    description: 'Posez-moi toutes vos questions sur vos plantes.',
  },
  conversations: {
    title: 'Aucune conversation',
    description: 'Lancez une discussion, elle sera gardée ici.',
  },
  timezonesNoResults: {
    title: 'Aucun fuseau horaire trouvé',
    description: 'Essayez un nom de ville ou de région.',
  },
} as const satisfies Record<
  keyof typeof en,
  { title: string; description: string }
>
