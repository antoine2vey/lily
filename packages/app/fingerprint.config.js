/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  ignorePaths: [
    // EAS runs prebuild before computing the fingerprint, creating these dirs.
    // eas update on CI doesn't run prebuild, so these dirs don't exist there.
    // For managed workflow they're always derived from package.json + config
    // plugins, which are already tracked.
    'ios/**',
    'android/**',
  ],
}
