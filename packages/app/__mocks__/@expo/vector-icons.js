const React = require('react')
const { View } = require('react-native')

const createIconMock = (props) => React.createElement(View, { testID: props?.testID })

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
