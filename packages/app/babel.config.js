module.exports = (api) => {
  api.cache(true)
  const isTest = process.env.NODE_ENV === 'test'
  return {
    presets: [
      isTest
        ? 'babel-preset-expo'
        : ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
    plugins: ['react-native-worklets/plugin'],
  }
}
