export default {
  title: 'Vacation Mode',
  intro:
    'Going away? Pause care reminders for a while. When you come back, your plant schedules pick up gently instead of burying you in overdue tasks.',
  dateRange: {
    label: 'When are you away?',
    start: 'Leaving',
    end: 'Back on',
    selectDate: 'Select date',
  },
  schedule: 'Schedule vacation',
  update: 'Update dates',
  scheduled: {
    title: 'Vacation scheduled',
    description:
      'Reminders will pause automatically from {{start}} to {{end}}.',
    cancel: 'Cancel vacation',
    cancelConfirmTitle: 'Cancel vacation?',
    cancelConfirmMessage:
      'Your reminders will continue as usual. You can schedule a new vacation anytime.',
  },
  active: {
    title: 'Vacation mode is on',
    description:
      'Care reminders are paused until {{end}}. When your vacation ends, due dates are moved forward so you can ease back in.',
    endNow: 'End vacation now',
    endConfirmTitle: 'End vacation now?',
    endConfirmMessage:
      'Reminders resume and your plant schedules are rescheduled to restart from tomorrow.',
    startLocked: 'Started {{start}} — only the return date can change.',
  },
  delegation: {
    title: 'Have someone water your plants?',
    description:
      'Delegate plants to a friend while you are away — their reminders go to your caretaker and stay active.',
    action: 'Set up delegation',
  },
  banner: {
    active:
      'Vacation mode is on — reminders are paused and tasks will be rescheduled when you are back.',
  },
  errors: {
    endBeforeStart: 'The return date must be after the departure date',
    endInPast: 'The return date must be in the future',
    tooLong: 'A vacation cannot be longer than a year',
    startLocked: 'The start date of an active vacation cannot change',
    generic: 'Something went wrong. Please try again.',
  },
  toast: {
    scheduled: 'Vacation scheduled',
    updated: 'Vacation updated',
    canceled: 'Vacation canceled',
    ended: 'Welcome back! Your schedules have been updated.',
  },
} as const
