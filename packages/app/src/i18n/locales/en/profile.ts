export default {
  title: 'Profile',
  defaultName: 'User',
  defaultBio: 'Plant Lover',
  premiumBadge: 'PREMIUM',
  memberSince: 'Member since {date}',
  memberSinceUnknown: 'Unknown',
  stats: {
    plants: 'Plants',
    careLogs: 'Care Logs',
    achievements: 'Achievements',
  },
  actions: {
    editProfile: 'Edit Profile',
    subscription: 'Subscription',
    achievements: 'My Achievements',
    helpSupport: 'Help & Support',
    settings: 'Settings',
    about: 'About',
    signOut: 'Sign Out',
  },
  signOut: {
    title: 'Sign Out?',
    message:
      "Are you sure you want to sign out? You'll need to sign in again to access your plants.",
    confirmButton: 'Sign Out',
    signingOut: 'Signing Out...',
  },
  edit: {
    title: 'Edit Profile',
    displayNameLabel: 'Display Name',
    displayNamePlaceholder: 'Enter your name',
    bioLabel: 'Bio',
    bioPlaceholder: 'Tell us about your plants...',
    changePhoto: 'Change Photo',
    error: 'Failed to update profile. Please try again.',
    permissionRequired: 'Permission Required',
    permissionMessage:
      'Please allow access to your photo library to change your profile picture.',
  },
} as const
