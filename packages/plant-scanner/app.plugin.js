const { withInfoPlist } = require('@expo/config-plugins')

module.exports = function withARMeasure(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSMotionUsageDescription =
      config.modResults.NSMotionUsageDescription ||
      'Lily uses motion sensors to enable AR-based pot measurement.'
    return config
  })
}
