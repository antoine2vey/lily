const React = require('react')

// Simple mock component that doesn't depend on react-native
const createIconMock = (props) =>
  React.createElement('View', { testID: props?.testID, name: props?.name })

module.exports = {
  Ionicons: createIconMock,
  MaterialIcons: createIconMock,
  MaterialCommunityIcons: createIconMock,
  FontAwesome: createIconMock,
  FontAwesome5: createIconMock,
  Feather: createIconMock,
  AntDesign: createIconMock,
  Entypo: createIconMock,
}
