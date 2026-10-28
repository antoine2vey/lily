export default {
  title: 'Canopy',
  row: 'Canopy',
  none: {
    create: 'Create a Canopy',
    joinHint: 'Got an invite link? Open it on this phone to join.',
  },
  create: {
    title: 'New Canopy',
    nameLabel: 'Name',
    namePlaceholder: 'Our Flat',
    hint: 'Anyone in the Canopy can rename it later.',
    submit: 'Create Canopy',
    points: {
      invite: 'Invite up to 9 people with a link.',
      share: 'Pick which of your plants to share. The rest stay yours.',
      remind: 'Everyone gets reminders at their own time.',
    },
    alreadyIn: 'You are already in a Canopy.',
    failed: 'Could not create the Canopy. Try again.',
  },
  detail: {
    nameLabel: 'Name',
    save: 'Save',
    renamed: 'Canopy renamed',
    members: 'Members',
    memberCount: '{count} of {max} members',
    owner: 'Owner',
    you: 'You',
    unnamed: 'Lily member',
    remove: 'Remove',
    removeTitle: 'Remove {name}?',
    removeMessage:
      '{name} loses access to the Canopy plants right away. The plants stay in the Canopy.',
    removed: '{name} removed',
    invite: {
      title: 'Invite people',
      description:
        'Anyone with the link can join for 7 days. Sharing again makes a new link and turns off the old one.',
      share: 'Share invite link',
      activeUntil: 'The current link works until {date}.',
      revoke: 'Turn off link',
      revokeTitle: 'Turn off the invite link?',
      revokeMessage: 'Nobody else can join with it.',
      revoked: 'Invite link turned off',
      shareMessage:
        'Join my Canopy “{name}” on Lily so we can look after our plants together: {url}',
      full: 'This Canopy is full. It holds up to {max} members.',
    },
    place: {
      title: 'Time and place',
      timezone: 'Time zone',
      location: 'Location',
      locationSet: 'Set',
      locationNotSet: 'Not set',
      useDeviceTimezone: 'Use this phone’s time zone',
      useLocation: 'Use my current location',
      clearLocation: 'Clear location',
      ownerOnly:
        'They set the care day and the weather for Canopy plants. Only the owner can change them.',
      locationDenied: 'Allow location access to set the Canopy location.',
      updated: 'Canopy updated',
    },
    leave: 'Leave Canopy',
    leaveTitle: 'Leave {name}?',
    leaveMessageMember:
      'You lose access to the Canopy plants. They stay with the Canopy.',
    leaveMessageOwner:
      '{heir} becomes the owner. You lose access to the Canopy plants.',
    leaveMessageLast:
      'You are the last member. The Canopy closes and its plants and rooms become yours.',
    left: 'You left the Canopy',
    delete: 'Delete Canopy',
    deleteTitle: 'Delete {name}?',
    deleteMessage:
      'Every Canopy plant and room becomes yours, and members lose access right away. No plant is deleted.',
    deleted: 'Canopy deleted',
    failed: 'Something went wrong. Try again.',
    notOwner: 'Only the owner can do this.',
  },
  join: {
    title: 'Join {name}',
    invitedBy: '{name} invited you',
    invited: 'You are invited',
    members: '{count, plural, one {# member} other {# members}}',
    note: 'Your plants stay yours. Next, you pick which ones to bring in.',
    join: 'Join Canopy',
    notNow: 'Not now',
    failed: 'Could not join. Try again.',
    alreadyHere: {
      title: 'You are already in {name}',
      open: 'Open Canopy',
    },
    another: {
      title: 'You are in {current}',
      description:
        'Leave {current} first to join {name}. Its plants stay with {current}.',
      leave: 'Leave {current} and join',
      confirmTitle: 'Leave {current}?',
      confirmMessage:
        'You lose access to the plants in {current}, then join {name}.',
    },
    full: {
      title: '{name} is full',
      description:
        'A Canopy holds up to {max} members. Ask someone in it to make room.',
    },
    expired: {
      title: 'This invite has expired',
      description:
        'Invite links work for 7 days. Ask a member of the Canopy for a new one.',
    },
    invalid: {
      title: 'This invite link does not work',
      description:
        'It may be incomplete, or a newer invite replaced it. Ask a member of the Canopy for a new one.',
    },
    unavailable: {
      title: 'Could not load the invite',
      description: 'Check your connection and try again.',
      retry: 'Try again',
    },
  },
  bring: {
    title: 'Bring plants into the Canopy',
    description:
      'Everyone in {name} cares for the plants you pick. You can share more later from each plant.',
    count: '{selected} of {total} selected',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    submit:
      '{count, plural, =0 {Continue} one {Bring # plant} other {Bring # plants}}',
    joined: 'You joined {name}',
    brought:
      '{count, plural, one {# plant moved in} other {# plants moved in}}',
    limit:
      'The Canopy reached its free plant limit, so some plants stayed personal.',
    delegated: 'Plants in a care delegation stayed personal.',
    failed: 'Some plants could not move. Try again from each plant.',
  },
} as const
