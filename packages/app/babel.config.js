module.exports = (api) => {
  api.cache(true)
  const isTest = process.env.NODE_ENV === 'test'
  // effect v4's ConfigProvider reads `import.meta.env`, which Hermes rejects
  // unless babel-preset-expo rewrites it
  const expoOptions = { unstable_transformImportMeta: true }
  return {
    presets: [
      [
        'babel-preset-expo',
        isTest
          ? expoOptions
          : { ...expoOptions, jsxImportSource: 'nativewind' },
      ],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
    plugins: [
      'react-native-worklets-core/plugin',
      'react-native-reanimated/plugin',
    ],
  }
}
