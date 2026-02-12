const React = require('react')

const Canvas = (props) => React.createElement('Canvas', props, props.children)
const Fill = (props) => React.createElement('Fill', props, props.children)
const Shader = (props) => React.createElement('Shader', props)

const Skia = {
  RuntimeEffect: {
    Make: () => ({}),
  },
}

const vec = (x, y) => ({ x, y })

module.exports = {
  Canvas,
  Fill,
  Shader,
  Skia,
  vec,
}
