// Mascot animations from Masko, encoded by scripts/mascot/encode.ts.
// Each file is a stacked video: the color frame on top, its alpha mask below.

export const mascotClips = {
  bell: require('../../assets/mascot/bell.mp4'),
  celebrate: require('../../assets/mascot/celebrate.mp4'),
  hello: require('../../assets/mascot/hello.mp4'),
  jump: require('../../assets/mascot/jump.mp4'),
  lookAround: require('../../assets/mascot/look-around.mp4'),
  rainy: require('../../assets/mascot/rainy.mp4'),
  scan: require('../../assets/mascot/scan.mp4'),
  sendEnvelope: require('../../assets/mascot/send-envelope.mp4'),
  sunbathing: require('../../assets/mascot/sunbathing.mp4'),
} as const

export type MascotAnimation = keyof typeof mascotClips
