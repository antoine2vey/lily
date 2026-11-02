export default {
  title: 'Canopy',
  row: 'Canopy',
  section: 'Household',
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
      '{name} loses access to the Canopy plants right away. The plants they shared go back to them.',
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
        'Join my Canopy "{name}" on Lily so we can look after our plants together: {url}',
      full: 'This Canopy is full. It holds up to {max} members.',
      member: 'Invite a member',
      pending: 'Waiting for an answer',
      pendingUntil: 'Invited until {date}',
      withdraw: 'Withdraw',
      withdrawTitle: 'Withdraw the invitation to {name}?',
      withdrawMessage: 'They can no longer join with it.',
      withdrawn: 'Invitation withdrawn',
    },
    place: {
      title: 'Time and place',
      timezone: 'Time zone',
      location: 'Location',
      locationSet: 'Set',
      locationNotSet: 'Not set',
      useDeviceTimezone: "Use this phone's time zone",
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
      'The plants you shared come back to you. You lose access to the rest.',
    leaveMessageOwner:
      '{heir} becomes the owner. The plants you shared come back to you, and you lose access to the rest.',
    leaveMessageLast:
      'You are the last member. The Canopy closes and its plants and rooms become yours.',
    left: 'You left the Canopy',
    delete: 'Delete Canopy',
    deleteTitle: 'Delete {name}?',
    deleteMessage:
      'Each plant goes back to the member who shared it. You keep the rest and the rooms, and members lose access right away. No plant is deleted.',
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
        'Leave {current} first to join {name}. The plants you shared there come back to you.',
      leave: 'Leave {current} and join',
      confirmTitle: 'Leave {current}?',
      confirmMessage:
        'The plants you shared come back to you and you lose access to the rest of {current}, then you join {name}.',
    },
    full: {
      title: '{name} is full',
      description:
        'A Canopy holds up to {max} members. Ask someone in it to make room.',
    },
    decline: 'Decline',
    declined: 'Invitation declined',
    closed: {
      title: 'This invitation is closed',
      description:
        'It was withdrawn or already answered. Ask a member of the Canopy to invite you again.',
    },
    invitationExpired: {
      title: 'This invitation has expired',
      description:
        'Invitations last 7 days. Ask a member of the Canopy to invite you again.',
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
  inviteMember: {
    title: 'Invite a member',
    label: 'Person',
    placeholder: 'Search by name or @handle',
    description:
      'They get a notification and can join {name} for 7 days. Your link stays as it is.',
    submit: 'Send invitation',
    sent: 'Invitation sent to {name}',
    alreadyMember: '{name} is already in this Canopy',
    full: 'This Canopy is full',
    failed: 'Could not send the invitation. Try again.',
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
  scope: {
    all: 'All',
    mine: 'Mine',
    canopy: 'Canopy',
  },
  add: {
    label: 'Who looks after it',
    personal: 'Just me',
  },
  badge: 'Canopy plant',
  actions: {
    share: 'Share with {name}',
    shareTitle: 'Share with {name}?',
    shareMessage:
      'Everyone in {name} sees this plant and gets its reminders. Its room is cleared.',
    shared: 'Shared with {name}',
    shareDelegated:
      'This plant is in a care delegation. End it before sharing with {name}.',
    unshare: 'Make personal',
    unshareTitle: 'Make this plant personal?',
    unshareMessage:
      'It leaves {name} and becomes yours. Other members lose access to it.',
    unshared: 'The plant is yours now',
    mute: 'Mute reminders',
    unmute: 'Unmute reminders',
    muted: 'You will not get reminders for this plant',
    unmuted: 'Reminders are back on',
    failed: 'Something went wrong. Try again.',
  },
  history: {
    you: '{action} by you',
    member: '{action} by {name}',
    unnamed: '{action} by a member',
    former: '{action} by a former member',
  },
  paywall: {
    title: 'This Canopy is full',
    message:
      'A free Canopy holds {limit} plants. When any member goes Premium, the limit is lifted for everyone in it.',
    upgrade: 'See Premium',
    notNow: 'Not now',
  },
} as const
