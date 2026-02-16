export default {
  title: 'Delegations',
  createDelegation: 'Create Delegation',
  filter: {
    all: 'All',
    myPlants: 'My Plants',
    caringFor: 'Caring For',
  },
  empty: {
    both: {
      title: 'No delegations yet',
      description:
        'Delegate your plant care to friends when you travel, or help them care for theirs.',
    },
    owner: {
      title: 'No plant delegations',
      description:
        'You have not delegated any of your plants to someone else yet.',
    },
    caretaker: {
      title: 'Not caring for any plants',
      description: 'No one has asked you to care for their plants yet.',
    },
  },
  create: {
    title: 'New Delegation',
    submit: 'Create Delegation',
    messageLabel: 'Message (optional)',
    messagePlaceholder: 'Add a note for the caretaker...',
  },
  detail: {
    title: 'Delegation Details',
    plantOwner: 'Plant Owner',
    caretaker: 'Caretaker',
    you: '(You)',
    startDate: 'Start Date',
    endDate: 'End Date',
    message: 'Message',
    notFound: 'Delegation not found',
    unknownDate: 'Unknown',
  },
  status: {
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Declined',
    active: 'Active',
    completed: 'Completed',
    canceled: 'Canceled',
  },
  actions: {
    acceptRequest: 'Accept Request',
    decline: 'Decline',
    cancelRequest: 'Cancel Request',
    cancelDelegation: 'Cancel Delegation',
    completeDelegation: 'Complete Delegation',
    caringMessage: 'You are currently caring for these plants',
    goBack: 'Go Back',
  },
  modals: {
    cancel: {
      title: 'Cancel Delegation',
      message:
        'Are you sure you want to cancel this delegation? This action cannot be undone.',
      confirm: 'Cancel Delegation',
    },
    decline: {
      title: 'Decline Request',
      message: 'Are you sure you want to decline this care request?',
      confirm: 'Decline',
    },
    complete: {
      title: 'Complete Delegation',
      message:
        'Mark this delegation as completed? The caretaker will be notified.',
      confirm: 'Complete',
    },
  },
  plants: {
    title: 'Plants',
    titleWithCount: 'Plants ({count})',
    empty: 'No plants in this delegation',
    noSchedule: 'No schedule',
    noPlants: 'No plants to delegate',
    selectCount: 'Plants ({selected}/{total})',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
  },
  caretakerPicker: {
    label: 'Caretaker',
    placeholder: 'Search for a caretaker...',
    noResults: 'No users found',
    suggested: 'Suggested',
    unknown: 'Unknown',
  },
  dateRange: {
    label: 'Date Range',
    start: 'Start',
    end: 'End',
    selectDate: 'Select date',
  },
  card: {
    caretaker: 'Caretaker',
    owner: 'Owner',
    plantCount: '{count, plural, one {# plant} other {# plants}}',
    unknown: 'Unknown',
  },
  toast: {
    created: 'Delegation request sent!',
    accepted: 'Delegation accepted!',
    declined: 'Delegation declined',
    canceled: 'Delegation canceled',
    completed: 'Delegation completed!',
    acceptFailed: 'Failed to accept delegation',
    declineFailed: 'Failed to decline delegation',
    cancelFailed: 'Failed to cancel delegation',
    completeFailed: 'Failed to complete delegation',
  },
  errors: {
    limitExceeded:
      'You have reached the delegation limit for your plan. Upgrade to create more.',
    overlap: 'Some plants already have an active delegation for this period.',
    invalidDate: 'Invalid date range.',
    cannotDelegateSelf: 'You cannot delegate plants to yourself.',
    createFailed: 'Failed to create delegation. Please try again.',
  },
} as const
